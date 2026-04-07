import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  seasonsTable, userBattlePassTable, battlePassClaimsTable,
  charactersTable, purchasesTable, activeBoostsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { calcExpToNextLevel, calcStats, calcLeague, processLevelUp } from "./character.js";
import { authenticateUser } from "../middlewares/auth.js";
import { processBattlePassReward } from "../economy.js";

const router: IRouter = Router();

const PREMIUM_COST_GEMS = 500;

interface Reward {
  type: "coins" | "gems" | "xp" | "aura" | "boost";
  amount: number;
  itemId?: string;
  label: string;
}

interface LevelRewards {
  level: number;
  xpRequired: number;
  free: Reward | null;
  premium: Reward | null;
}

function calcLevelXp(level: number): number {
  if (level <= 1) return 100;
  return Math.floor(100 + (level - 1) * 40);
}

function buildRewardTable(maxLevel: number): LevelRewards[] {
  const table: LevelRewards[] = [];

  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const xpRequired = calcLevelXp(lvl);

    let free: Reward | null = null;
    let premium: Reward | null = null;

    if (lvl % 5 === 0) {
      free = { type: "coins", amount: 50 + lvl * 5, label: `${50 + lvl * 5} Gym Coin` };
    } else if (lvl % 3 === 0) {
      free = { type: "coins", amount: 20 + lvl * 2, label: `${20 + lvl * 2} Gym Coin` };
    } else if (lvl % 2 === 0) {
      free = { type: "coins", amount: 10 + lvl, label: `${10 + lvl} Gym Coin` };
    } else {
      free = { type: "xp", amount: 30 + lvl * 3, label: `${30 + lvl * 3} Bonus XP` };
    }

    if (lvl === 50) {
      premium = { type: "aura", amount: 1, itemId: "aura_sezon_sampiyonu", label: "Sezon Sampiyonu Aurasi" };
    } else if (lvl === 40) {
      premium = { type: "aura", amount: 1, itemId: "aura_altin_savasci", label: "Altin Savasci Aurasi" };
    } else if (lvl === 30) {
      premium = { type: "aura", amount: 1, itemId: "aura_gece_kaplanı", label: "Gece Kaplani Aurasi" };
    } else if (lvl === 25) {
      premium = { type: "boost", amount: 150, itemId: "boost_premium_25", label: "%150 XP Boost (30dk)" };
    } else if (lvl === 15) {
      premium = { type: "boost", amount: 125, itemId: "boost_premium_15", label: "%125 XP Boost (30dk)" };
    } else if (lvl % 10 === 0) {
      premium = { type: "gems", amount: 30 + Math.floor(lvl / 10) * 10, label: `${30 + Math.floor(lvl / 10) * 10} Gem` };
    } else if (lvl % 5 === 0) {
      premium = { type: "gems", amount: 10 + lvl, label: `${10 + lvl} Gem` };
    } else if (lvl % 3 === 0) {
      premium = { type: "coins", amount: 40 + lvl * 3, label: `${40 + lvl * 3} Gym Coin` };
    } else if (lvl % 2 === 0) {
      premium = { type: "gems", amount: 3 + Math.floor(lvl / 5), label: `${3 + Math.floor(lvl / 5)} Gem` };
    } else {
      premium = { type: "coins", amount: 25 + lvl * 2, label: `${25 + lvl * 2} Gym Coin` };
    }

    table.push({ level: lvl, xpRequired, free, premium });
  }

  return table;
}

let _cachedSeason: { season: typeof seasonsTable.$inferSelect; cachedAt: number } | null = null;
const SEASON_CACHE_TTL = 60 * 1000;

async function getActiveSeason() {
  const now = new Date();

  if (_cachedSeason && (Date.now() - _cachedSeason.cachedAt) < SEASON_CACHE_TTL) {
    const s = _cachedSeason.season;
    if (new Date(s.endDate) > now && new Date(s.startDate) <= now) {
      return s;
    }
    _cachedSeason = null;
  }

  const [season] = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.isActive, true));

  if (season && new Date(season.endDate) > now && new Date(season.startDate) <= now) {
    _cachedSeason = { season, cachedAt: Date.now() };
    return season;
  }

  if (season && new Date(season.endDate) <= now) {
    await db.update(seasonsTable)
      .set({ isActive: false })
      .where(eq(seasonsTable.id, season.id));
  }

  const recheck = await db
    .select()
    .from(seasonsTable)
    .where(eq(seasonsTable.isActive, true));
  if (recheck.length > 0) {
    const s = recheck[0];
    _cachedSeason = { season: s, cachedAt: Date.now() };
    return s;
  }

  const seasonId = `season_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const startDate = now;
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const countRows = await db.select().from(seasonsTable);
  const num = countRows.length + 1;

  const [newSeason] = await db.insert(seasonsTable).values({
    id: seasonId,
    name: `Sezon ${num}`,
    startDate,
    endDate,
    isActive: true,
    maxLevel: 50,
  }).onConflictDoNothing().returning();

  if (!newSeason) {
    const [fallback] = await db.select().from(seasonsTable).where(eq(seasonsTable.isActive, true));
    if (fallback) {
      _cachedSeason = { season: fallback, cachedAt: Date.now() };
      return fallback;
    }
    throw new Error("Sezon olusturulamadi");
  }

  _cachedSeason = { season: newSeason, cachedAt: Date.now() };
  return newSeason;
}

async function getOrCreateUserPass(userId: string, seasonId: string) {
  const [existing] = await db
    .select()
    .from(userBattlePassTable)
    .where(and(
      eq(userBattlePassTable.userId, userId),
      eq(userBattlePassTable.seasonId, seasonId)
    ));

  if (existing) return existing;

  const id = `ubp_${userId}_${seasonId.slice(0, 12)}_${Math.random().toString(36).substr(2, 6)}`;
  try {
    const [created] = await db.insert(userBattlePassTable).values({
      id,
      userId,
      seasonId,
      currentLevel: 1,
      currentXp: 0,
      totalXpEarned: 0,
      hasPremium: false,
    }).returning();
    return created;
  } catch {
    const [fallback] = await db
      .select()
      .from(userBattlePassTable)
      .where(and(
        eq(userBattlePassTable.userId, userId),
        eq(userBattlePassTable.seasonId, seasonId)
      ));
    if (fallback) return fallback;
    throw new Error("Battle pass olusturulamadi");
  }
}

router.get("/battle-pass", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  try {
    const season = await getActiveSeason();
    const userPass = await getOrCreateUserPass(userId, season.id);
    const rewardTable = buildRewardTable(season.maxLevel);

    const claims = await db
      .select()
      .from(battlePassClaimsTable)
      .where(and(
        eq(battlePassClaimsTable.userId, userId),
        eq(battlePassClaimsTable.seasonId, season.id)
      ));

    const claimedSet = new Set(claims.map(c => `${c.level}_${c.track}`));

    const xpToNextLevel = calcLevelXp(userPass.currentLevel);
    const daysRemaining = Math.max(0, Math.ceil((new Date(season.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

    const levels = rewardTable.map(lr => {
      const unlocked = userPass.currentLevel > lr.level || (userPass.currentLevel === lr.level && userPass.currentXp >= 0 && lr.level < userPass.currentLevel);
      const reachable = userPass.currentLevel >= lr.level;

      const freeClaimable = reachable && lr.free && !claimedSet.has(`${lr.level}_free`);
      const freeClaimed = claimedSet.has(`${lr.level}_free`);
      const premiumClaimable = reachable && userPass.hasPremium && lr.premium && !claimedSet.has(`${lr.level}_premium`);
      const premiumClaimed = claimedSet.has(`${lr.level}_premium`);

      return {
        level: lr.level,
        xpRequired: lr.xpRequired,
        free: lr.free ? {
          ...lr.free,
          claimed: freeClaimed,
          claimable: freeClaimable && !freeClaimed,
        } : null,
        premium: lr.premium ? {
          ...lr.premium,
          claimed: premiumClaimed,
          claimable: premiumClaimable && !premiumClaimed,
          locked: !userPass.hasPremium,
        } : null,
        reached: reachable,
      };
    });

    res.json({
      season: {
        id: season.id,
        name: season.name,
        startDate: season.startDate,
        endDate: season.endDate,
        daysRemaining,
      },
      progress: {
        currentLevel: userPass.currentLevel,
        currentXp: userPass.currentXp,
        xpToNextLevel,
        totalXpEarned: userPass.totalXpEarned,
        hasPremium: userPass.hasPremium,
      },
      levels,
      premiumCost: PREMIUM_COST_GEMS,
    });
  } catch (err) {
    console.error("Battle pass fetch error:", err);
    res.status(500).json({ error: "Battle pass yuklenemedi" });
  }
});

router.post("/battle-pass/unlock", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const season = await getActiveSeason();
      const [userPass] = await tx
        .select()
        .from(userBattlePassTable)
        .where(and(
          eq(userBattlePassTable.userId, userId),
          eq(userBattlePassTable.seasonId, season.id)
        ));

      if (!userPass) throw { status: 404, error: "Battle pass bulunamadi" };
      if (userPass.hasPremium) throw { status: 400, error: "Premium zaten aktif", code: "ALREADY_PREMIUM" };

      if (char.gems < PREMIUM_COST_GEMS) {
        throw { status: 400, error: `Yetersiz gem. Gerekli: ${PREMIUM_COST_GEMS}, Mevcut: ${char.gems}`, code: "INSUFFICIENT_GEMS" };
      }

      await tx.update(charactersTable).set({
        gems: char.gems - PREMIUM_COST_GEMS,
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId));

      const [updated] = await tx.update(userBattlePassTable).set({
        hasPremium: true,
        premiumPurchasedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(userBattlePassTable.id, userPass.id)).returning();

      return { userPass: updated, gemsSpent: PREMIUM_COST_GEMS, remainingGems: char.gems - PREMIUM_COST_GEMS };
    });

    res.json({
      hasPremium: true,
      gemsSpent: result.gemsSpent,
      remainingGems: result.remainingGems,
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Battle pass unlock error:", err);
    res.status(500).json({ error: "Premium acilamadi" });
  }
});

router.post("/battle-pass/claim/:level/:track", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const level = parseInt(req.params.level, 10);
  const track = req.params.track;

  if (isNaN(level) || level < 1 || level > 50) {
    res.status(400).json({ error: "Gecersiz seviye" });
    return;
  }
  if (track !== "free" && track !== "premium") {
    res.status(400).json({ error: "Gecersiz track: free veya premium" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const season = await getActiveSeason();
      const rewardTable = buildRewardTable(season.maxLevel);
      const levelReward = rewardTable.find(r => r.level === level);
      if (!levelReward) throw { status: 400, error: "Gecersiz seviye" };

      const reward = track === "free" ? levelReward.free : levelReward.premium;
      if (!reward) throw { status: 400, error: "Bu seviyede odul yok" };

      const [userPass] = await tx
        .select()
        .from(userBattlePassTable)
        .where(and(
          eq(userBattlePassTable.userId, userId),
          eq(userBattlePassTable.seasonId, season.id)
        ));

      if (!userPass) throw { status: 404, error: "Battle pass bulunamadi" };
      if (userPass.currentLevel < level) throw { status: 400, error: "Bu seviyeye henuz ulasmadiniz" };
      if (track === "premium" && !userPass.hasPremium) throw { status: 400, error: "Premium gerekli", code: "PREMIUM_REQUIRED" };

      const existingClaims = await tx
        .select()
        .from(battlePassClaimsTable)
        .where(and(
          eq(battlePassClaimsTable.userId, userId),
          eq(battlePassClaimsTable.seasonId, season.id),
          eq(battlePassClaimsTable.level, level),
          eq(battlePassClaimsTable.track, track)
        ));

      if (existingClaims.length > 0) throw { status: 400, error: "Bu odul zaten alindi", code: "ALREADY_CLAIMED" };

      const claimId = `bpc_${userId}_${season.id.slice(0, 8)}_${level}_${track}_${Math.random().toString(36).substr(2, 4)}`;
      await tx.insert(battlePassClaimsTable).values({
        id: claimId,
        userId,
        seasonId: season.id,
        level,
        track,
        rewardType: reward.type,
        rewardAmount: reward.amount,
        rewardItemId: reward.itemId || null,
      });

      let charUpdate: Record<string, any> = { updatedAt: new Date() };
      let leveledUp = false;

      const tz = char.timezone || "Europe/Istanbul";
      let economyData: any = null;

      switch (reward.type) {
        case "coins": {
          let ecoCoins = reward.amount;
          try {
            const ecoResult = await processBattlePassReward(userId, reward.amount, 0, char.gym_coins || 0, char.gems || 0, tz);
            ecoCoins = ecoResult.coins;
            economyData = { dailyCoinsEarned: ecoResult.dailyCoinsEarned, dailyGemsEarned: ecoResult.dailyGemsEarned, coinCap: ecoResult.dailyCoinCap, gemCap: ecoResult.dailyGemCap, coinCapReached: ecoResult.coinCapReached, gemCapReached: ecoResult.gemCapReached, reductions: ecoResult.reductions };
          } catch (err) {
            console.error("Economy (bp coin) error:", err);
          }
          charUpdate.gymCoins = (char.gym_coins || 0) + ecoCoins;
          break;
        }
        case "gems": {
          let ecoGems = reward.amount;
          try {
            const ecoResult = await processBattlePassReward(userId, 0, reward.amount, char.gym_coins || 0, char.gems || 0, tz);
            ecoGems = ecoResult.gems;
            economyData = { dailyCoinsEarned: ecoResult.dailyCoinsEarned, dailyGemsEarned: ecoResult.dailyGemsEarned, coinCap: ecoResult.dailyCoinCap, gemCap: ecoResult.dailyGemCap, coinCapReached: ecoResult.coinCapReached, gemCapReached: ecoResult.gemCapReached, reductions: ecoResult.reductions };
          } catch (err) {
            console.error("Economy (bp gem) error:", err);
          }
          charUpdate.gems = (char.gems || 0) + ecoGems;
          break;
        }
        case "xp": {
          const lv = processLevelUp(char.exp, char.level, reward.amount);
          leveledUp = lv.leveledUp;
          const stats = calcStats(lv.newLevel, char.class);
          charUpdate = {
            ...charUpdate,
            exp: lv.newExp,
            level: lv.newLevel,
            totalExp: char.total_exp + reward.amount,
            totalXpEarned: char.total_xp_earned + reward.amount,
            league: calcLeague(char.total_xp_earned + reward.amount),
            ...stats,
          };
          break;
        }
        case "aura": {
          const purchaseId = `bp_aura_${userId}_${level}_${Math.random().toString(36).substr(2, 6)}`;
          await tx.insert(purchasesTable).values({
            id: purchaseId,
            userId,
            itemId: reward.itemId || "aura_unknown",
            itemType: "aura",
            currency: "battle_pass",
            price: 0,
          });
          charUpdate.equippedAura = reward.itemId || null;
          break;
        }
        case "boost": {
          const boostId = `bp_boost_${userId}_${level}_${Math.random().toString(36).substr(2, 6)}`;
          const boostDuration = 30 * 60 * 1000;
          await tx.insert(activeBoostsTable).values({
            id: boostId,
            userId,
            itemId: reward.itemId || "boost_battle_pass",
            multiplier: reward.amount,
            expiresAt: new Date(Date.now() + boostDuration),
          });
          break;
        }
      }

      const [updatedChar] = await tx.update(charactersTable)
        .set(charUpdate)
        .where(eq(charactersTable.userId, userId))
        .returning();

      return { reward, updatedChar, leveledUp, economyData };
    });

    res.json({
      claimed: true,
      level,
      track,
      reward: {
        type: result.reward.type,
        amount: result.reward.amount,
        label: result.reward.label,
        itemId: result.reward.itemId,
      },
      leveledUp: result.leveledUp,
      economy: result.economyData,
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Battle pass claim error:", err);
    res.status(500).json({ error: "Odul alinamadi" });
  }
});

export async function addBattlePassXp(userId: string, xpAmount: number) {
  if (xpAmount <= 0) return;

  try {
    const season = await getActiveSeason();
    if (new Date(season.endDate) <= new Date()) return;

    let userPass = await getOrCreateUserPass(userId, season.id);

    const rows = await db.execute(
      sql`UPDATE user_battle_pass
          SET current_xp = current_xp + ${xpAmount},
              total_xp_earned = total_xp_earned + ${xpAmount},
              updated_at = NOW()
          WHERE id = ${userPass.id}
          RETURNING current_xp, current_level, total_xp_earned`
    );

    const row = rows.rows?.[0] as any;
    if (!row) return;

    let currentXp = row.current_xp as number;
    let currentLevel = row.current_level as number;

    if (currentLevel >= season.maxLevel) return;

    let levelChanged = false;
    while (currentLevel < season.maxLevel) {
      const needed = calcLevelXp(currentLevel);
      if (currentXp < needed) break;
      currentXp -= needed;
      currentLevel += 1;
      levelChanged = true;
    }

    if (currentLevel >= season.maxLevel) {
      currentLevel = season.maxLevel;
      currentXp = 0;
    }

    if (levelChanged) {
      await db.update(userBattlePassTable).set({
        currentLevel,
        currentXp,
        updatedAt: new Date(),
      }).where(eq(userBattlePassTable.id, userPass.id));
    }
  } catch (err) {
    console.error("Battle pass XP add error:", err);
  }
}

export default router;
