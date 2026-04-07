import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  charactersTable, dailyRewardsTable, weeklyActivityTable,
  comebackRewardsTable, workoutsTable, dailyQuestsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";
import { calcExpToNextLevel, calcStats, calcLeague, processLevelUp } from "./character.js";
import { authenticateUser } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import { addBattlePassXp } from "./battle-pass.js";
import { processQuestReward } from "../economy.js";

const router: IRouter = Router();

const DAILY_REWARD_SCHEDULE = [
  { day: 1, xp: 50,  coins: 100, gems: 0 },
  { day: 2, xp: 75,  coins: 150, gems: 0 },
  { day: 3, xp: 100, coins: 200, gems: 1 },
  { day: 4, xp: 125, coins: 250, gems: 0 },
  { day: 5, xp: 150, coins: 300, gems: 2 },
  { day: 6, xp: 200, coins: 400, gems: 0 },
  { day: 7, xp: 350, coins: 750, gems: 5 },
];

const WEEKLY_CHEST_REWARD = { xp: 500, coins: 1000, gems: 10 };

const COMEBACK_MIN_HOURS = 48;
const COMEBACK_REWARD = { xp: 200, coins: 500, gems: 3 };

function getLocalDate(utcDate: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
  } catch {
    const offset = 3 * 60 * 60 * 1000;
    const local = new Date(utcDate.getTime() + offset);
    return local.toISOString().slice(0, 10);
  }
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function dayDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}


async function applyXpAndCurrency(
  userId: string,
  charClass: string,
  xpReward: number,
  rawCoins: number,
  rawGems: number,
  tz: string,
) {
  const result = await db.transaction(async (tx) => {
    const charRows = await tx.execute(
      sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
    );
    const freshChar = charRows.rows?.[0] as any;
    if (!freshChar) throw new Error("Karakter bulunamadi");

    const lv = processLevelUp(freshChar.exp, freshChar.level, xpReward);
    const stats = calcStats(lv.newLevel, freshChar.class || charClass);
    const newTotalXp = freshChar.total_xp_earned + xpReward;
    const newLeague = calcLeague(newTotalXp);

    const [updated] = await tx.update(charactersTable).set({
      exp: lv.newExp,
      level: lv.newLevel,
      totalExp: freshChar.total_exp + xpReward,
      totalXpEarned: newTotalXp,
      league: newLeague,
      ...stats,
      updatedAt: new Date(),
    }).where(eq(charactersTable.userId, userId)).returning();

    return { updated, leveledUp: lv.leveledUp, newLevel: lv.newLevel, currentCoins: freshChar.gym_coins || 0, currentGems: freshChar.gems || 0 };
  });

  let economyResult;
  try {
    economyResult = await processQuestReward(
      userId, rawCoins, rawGems, xpReward,
      result.currentCoins, result.currentGems, tz
    );
    const coinAdd = economyResult.coins;
    const gemAdd = economyResult.gems;
    if (coinAdd > 0 || gemAdd > 0) {
      await db.update(charactersTable).set({
        ...(coinAdd > 0 ? { gymCoins: sql`${charactersTable.gymCoins} + ${coinAdd}` } : {}),
        ...(gemAdd > 0 ? { gems: sql`${charactersTable.gems} + ${gemAdd}` } : {}),
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId));
    }
  } catch {
    economyResult = null;
  }

  try {
    if (xpReward > 0) await addBattlePassXp(userId, xpReward);
  } catch {}

  return { updated: result.updated, leveledUp: result.leveledUp, newLevel: result.newLevel, economyResult };
}

router.get("/retention/status", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!char) { res.status(404).json({ error: "Karakter bulunamadi" }); return; }

  const tz = char.timezone || "Europe/Istanbul";
  const now = new Date();
  const today = getLocalDate(now, tz);
  const weekStart = getWeekStart(today);

  const canClaimDailyReward = char.lastDailyRewardDate !== today;

  let currentStreakDay = char.dailyRewardStreak || 0;
  if (canClaimDailyReward) {
    if (char.lastDailyRewardDate) {
      const diff = dayDiff(char.lastDailyRewardDate, today);
      if (diff === 1) {
        currentStreakDay = Math.min(currentStreakDay + 1, 7);
      } else if (diff > 1) {
        currentStreakDay = 1;
      }
    } else {
      currentStreakDay = 1;
    }
  }
  const nextReward = DAILY_REWARD_SCHEDULE[(currentStreakDay - 1) % 7] || DAILY_REWARD_SCHEDULE[0];

  const todayQuests = await db.select().from(dailyQuestsTable).where(and(
    eq(dailyQuestsTable.userId, userId),
    eq(dailyQuestsTable.questDate, today),
  ));
  const hasActiveQuests = todayQuests.some(q => !q.isCompleted);
  const hasUnclaimedQuests = todayQuests.some(q => q.isCompleted && !q.isClaimed);

  const [weeklyRecord] = await db.select().from(weeklyActivityTable).where(and(
    eq(weeklyActivityTable.userId, userId),
    eq(weeklyActivityTable.weekStart, weekStart),
  ));
  const weeklyDaysActive = weeklyRecord?.daysActive || 0;
  const weeklyChestAvailable = weeklyDaysActive >= 7 && !(weeklyRecord?.chestClaimed);

  let comebackAvailable = false;
  let inactiveHours = 0;
  if (char.lastWorkoutAt) {
    const hoursSinceLast = (now.getTime() - new Date(char.lastWorkoutAt).getTime()) / (60 * 60 * 1000);
    inactiveHours = Math.floor(hoursSinceLast);
    if (hoursSinceLast >= COMEBACK_MIN_HOURS) {
      const lastComebackClaim = char.lastComebackClaimAt;
      if (!lastComebackClaim || new Date(char.lastWorkoutAt) > new Date(lastComebackClaim)) {
        comebackAvailable = true;
      }
    }
  }

  let notifyMissedWorkout = false;
  let notifyStreakBreaking = false;
  if (char.lastWorkoutAt) {
    const hoursSinceLast = (now.getTime() - new Date(char.lastWorkoutAt).getTime()) / (60 * 60 * 1000);
    if (hoursSinceLast >= 24 && hoursSinceLast < 48) {
      notifyMissedWorkout = true;
    }
    if (char.streakDays > 0 && hoursSinceLast >= 36 && hoursSinceLast < 48) {
      notifyStreakBreaking = true;
    }
  }

  if (notifyMissedWorkout !== char.notifyMissedWorkout || notifyStreakBreaking !== char.notifyStreakBreaking) {
    await db.update(charactersTable).set({
      notifyMissedWorkout,
      notifyStreakBreaking,
      updatedAt: new Date(),
    }).where(eq(charactersTable.userId, userId));
  }

  res.json({
    canClaimDailyReward,
    dailyRewardStreak: currentStreakDay,
    nextReward: canClaimDailyReward ? nextReward : null,
    allRewards: DAILY_REWARD_SCHEDULE,

    hasActiveQuests,
    hasUnclaimedQuests,
    questsToday: todayQuests.length,

    weeklyDaysActive,
    weeklyChestAvailable,
    weeklyChestReward: WEEKLY_CHEST_REWARD,
    weeklyActiveDays: weeklyRecord ? JSON.parse(weeklyRecord.activeDays) : [],

    comebackAvailable,
    comebackReward: comebackAvailable ? COMEBACK_REWARD : null,
    inactiveHours: comebackAvailable ? inactiveHours : 0,

    notifications: {
      missedWorkout: notifyMissedWorkout,
      streakBreaking: notifyStreakBreaking,
      streakDays: char.streakDays,
    },

    today,
    weekStart,
  });
});

router.post("/retention/claim-daily", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const tz = char.timezone || "Europe/Istanbul";
      const today = getLocalDate(new Date(), tz);

      if (char.last_daily_reward_date === today) {
        throw { status: 400, error: "Gunluk odul zaten alindi", code: "ALREADY_CLAIMED" };
      }

      let streakDay = char.daily_reward_streak || 0;
      if (char.last_daily_reward_date) {
        const diff = dayDiff(char.last_daily_reward_date, today);
        if (diff === 1) {
          streakDay = Math.min(streakDay + 1, 7);
        } else if (diff > 1) {
          streakDay = 1;
        }
      } else {
        streakDay = 1;
      }

      if (streakDay === 0) streakDay = 1;
      const reward = DAILY_REWARD_SCHEDULE[(streakDay - 1) % 7];

      const rewardId = `dr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx.insert(dailyRewardsTable).values({
        id: rewardId,
        userId,
        claimDate: today,
        streakDay,
        xpReward: reward.xp,
        coinReward: reward.coins,
        gemReward: reward.gems,
      });

      await tx.update(charactersTable).set({
        dailyRewardStreak: streakDay,
        lastDailyRewardDate: today,
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId));

      return { char, streakDay, reward, tz };
    });

    const { char, streakDay, reward, tz } = result;
    const applied = await applyXpAndCurrency(userId, char.class, reward.xp, reward.coins, reward.gems, tz);

    const [freshChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
    const expToNextLevel = calcExpToNextLevel(freshChar?.level || applied.newLevel);

    res.json({
      streakDay,
      reward,
      leveledUp: applied.leveledUp,
      character: freshChar ? {
        ...freshChar,
        expToNextLevel,
        league: calcLeague(freshChar.totalXpEarned),
      } : null,
      economy: applied.economyResult ? {
        dailyCoinsEarned: applied.economyResult.dailyCoinsEarned,
        dailyGemsEarned: applied.economyResult.dailyGemsEarned,
        coinCap: applied.economyResult.dailyCoinCap,
        gemCap: applied.economyResult.dailyGemCap,
        reductions: applied.economyResult.reductions,
      } : null,
    });
    try {
      const { trackEvent } = await import("../trackEvent.js");
      trackEvent(userId, "reward_claimed", { type: "daily", streakDay: result.streakDay });
    } catch {}

  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Daily reward claim error:", err);
    res.status(500).json({ error: "Odul alinamadi" });
  }
});

router.post("/retention/claim-weekly-chest", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const tz = char.timezone || "Europe/Istanbul";
      const today = getLocalDate(new Date(), tz);
      const weekStart = getWeekStart(today);

      const [weekly] = await tx.select().from(weeklyActivityTable).where(and(
        eq(weeklyActivityTable.userId, userId),
        eq(weeklyActivityTable.weekStart, weekStart),
      ));

      if (!weekly) throw { status: 400, error: "Bu hafta icin aktivite kaydi yok" };
      if (weekly.daysActive < 7) throw { status: 400, error: `7 gun aktif olmaniz gerekiyor (${weekly.daysActive}/7)` };
      if (weekly.chestClaimed) throw { status: 400, error: "Haftalik sandik zaten alindi", code: "ALREADY_CLAIMED" };

      await tx.update(weeklyActivityTable).set({
        chestClaimed: true,
        claimedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(weeklyActivityTable.id, weekly.id));

      return { char, tz };
    });

    const applied = await applyXpAndCurrency(
      userId, result.char.class,
      WEEKLY_CHEST_REWARD.xp, WEEKLY_CHEST_REWARD.coins, WEEKLY_CHEST_REWARD.gems,
      result.tz
    );

    const [freshChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));

    res.json({
      reward: WEEKLY_CHEST_REWARD,
      leveledUp: applied.leveledUp,
      character: freshChar ? {
        ...freshChar,
        expToNextLevel: calcExpToNextLevel(freshChar.level),
        league: calcLeague(freshChar.totalXpEarned),
      } : null,
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Weekly chest claim error:", err);
    res.status(500).json({ error: "Sandik alinamadi" });
  }
});

router.post("/retention/claim-comeback", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const now = new Date();

      if (!char.last_workout_at) throw { status: 400, error: "Henuz antrenman yapmamissiniz" };

      const hoursSinceLast = (now.getTime() - new Date(char.last_workout_at).getTime()) / (60 * 60 * 1000);
      if (hoursSinceLast < COMEBACK_MIN_HOURS) {
        throw { status: 400, error: "Geri donus odulu icin en az 48 saat inaktif olmaniz gerekiyor" };
      }

      if (char.last_comeback_claim_at) {
        const lastClaim = new Date(char.last_comeback_claim_at);
        if (char.last_workout_at && new Date(char.last_workout_at) <= lastClaim) {
          throw { status: 400, error: "Bu inaktiflik donemi icin odul zaten alindi", code: "ALREADY_CLAIMED" };
        }
      }

      const rewardId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx.insert(comebackRewardsTable).values({
        id: rewardId,
        userId,
        inactiveHours: Math.floor(hoursSinceLast),
        xpReward: COMEBACK_REWARD.xp,
        coinReward: COMEBACK_REWARD.coins,
        gemReward: COMEBACK_REWARD.gems,
      });

      await tx.update(charactersTable).set({
        lastComebackClaimAt: now,
        updatedAt: now,
      }).where(eq(charactersTable.userId, userId));

      const tz = char.timezone || "Europe/Istanbul";
      return { char, tz, inactiveHours: Math.floor(hoursSinceLast) };
    });

    const applied = await applyXpAndCurrency(
      userId, result.char.class,
      COMEBACK_REWARD.xp, COMEBACK_REWARD.coins, COMEBACK_REWARD.gems,
      result.tz
    );

    const [freshChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));

    res.json({
      reward: COMEBACK_REWARD,
      inactiveHours: result.inactiveHours,
      leveledUp: applied.leveledUp,
      character: freshChar ? {
        ...freshChar,
        expToNextLevel: calcExpToNextLevel(freshChar.level),
        league: calcLeague(freshChar.totalXpEarned),
      } : null,
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Comeback reward claim error:", err);
    res.status(500).json({ error: "Odul alinamadi" });
  }
});

router.get("/retention/daily-history", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;
  const rewards = await db.select().from(dailyRewardsTable)
    .where(eq(dailyRewardsTable.userId, userId))
    .orderBy(desc(dailyRewardsTable.createdAt))
    .limit(30);
  res.json({ rewards });
});

export async function trackDailyActivity(userId: string, timezone: string) {
  const today = getLocalDate(new Date(), timezone);
  const weekStart = getWeekStart(today);

  const [existing] = await db.select().from(weeklyActivityTable).where(and(
    eq(weeklyActivityTable.userId, userId),
    eq(weeklyActivityTable.weekStart, weekStart),
  ));

  if (!existing) {
    const id = `wa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.insert(weeklyActivityTable).values({
      id,
      userId,
      weekStart,
      daysActive: 1,
      activeDays: JSON.stringify([today]),
    }).onConflictDoNothing();
    return;
  }

  const activeDays: string[] = JSON.parse(existing.activeDays);
  if (activeDays.includes(today)) return;

  activeDays.push(today);
  await db.update(weeklyActivityTable).set({
    daysActive: activeDays.length,
    activeDays: JSON.stringify(activeDays),
    updatedAt: new Date(),
  }).where(eq(weeklyActivityTable.id, existing.id));
}

export default router;
