import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dailyQuestsTable, charactersTable, workoutsTable } from "@workspace/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { calcExpToNextLevel, calcStats, calcLeague, processLevelUp } from "./character.js";
import { authenticateUser } from "../middlewares/auth.js";
import { addBattlePassXp } from "./battle-pass.js";
import { processQuestReward } from "../economy.js";

const router: IRouter = Router();

type Difficulty = "easy" | "medium" | "hard";
type GoalType = "workout_count" | "total_sets" | "total_duration" | "total_reps" | "exercise_count" | "boost_used";

interface QuestTemplate {
  difficulty: Difficulty;
  title: string;
  description: string;
  goalType: GoalType;
  targetValue: number;
  xpReward: number;
  coinReward: number;
  gemReward: number;
}

const EASY_QUESTS: QuestTemplate[] = [
  { difficulty: "easy", title: "Ilk Adim", description: "1 antrenman tamamla", goalType: "workout_count", targetValue: 1, xpReward: 80, coinReward: 0, gemReward: 0 },
  { difficulty: "easy", title: "Isindirma Turu", description: "Toplam 5 set tamamla", goalType: "total_sets", targetValue: 5, xpReward: 70, coinReward: 0, gemReward: 0 },
  { difficulty: "easy", title: "Kisa Tur", description: "Toplam 10 dakika antrenman yap", goalType: "total_duration", targetValue: 10, xpReward: 75, coinReward: 0, gemReward: 0 },
  { difficulty: "easy", title: "Baslangiç Ateşi", description: "Toplam 20 tekrar yap", goalType: "total_reps", targetValue: 20, xpReward: 65, coinReward: 0, gemReward: 0 },
  { difficulty: "easy", title: "Guc Dalgasi", description: "2 farkli egzersiz yap", goalType: "exercise_count", targetValue: 2, xpReward: 85, coinReward: 0, gemReward: 0 },
  { difficulty: "easy", title: "Takviye Zamani", description: "1 boost kullan", goalType: "boost_used", targetValue: 1, xpReward: 75, coinReward: 0, gemReward: 0 },
];

const MEDIUM_QUESTS: QuestTemplate[] = [
  { difficulty: "medium", title: "Savas Hazirligı", description: "3 farkli egzersiz yap", goalType: "exercise_count", targetValue: 3, xpReward: 150, coinReward: 25, gemReward: 0 },
  { difficulty: "medium", title: "Set Avcisi", description: "Toplam 10 set tamamla", goalType: "total_sets", targetValue: 10, xpReward: 140, coinReward: 20, gemReward: 0 },
  { difficulty: "medium", title: "Dayaniklilik Testi", description: "Toplam 20 dakika antrenman yap", goalType: "total_duration", targetValue: 20, xpReward: 160, coinReward: 30, gemReward: 0 },
  { difficulty: "medium", title: "Tekrar Ustasi", description: "Toplam 50 tekrar yap", goalType: "total_reps", targetValue: 50, xpReward: 130, coinReward: 20, gemReward: 0 },
  { difficulty: "medium", title: "Cift Darbe", description: "2 antrenman tamamla", goalType: "workout_count", targetValue: 2, xpReward: 145, coinReward: 25, gemReward: 0 },
];

const HARD_QUESTS: QuestTemplate[] = [
  { difficulty: "hard", title: "Efsane Gucu", description: "Toplam 30 dakika antrenman yap", goalType: "total_duration", targetValue: 30, xpReward: 250, coinReward: 50, gemReward: 3 },
  { difficulty: "hard", title: "Demir Irade", description: "Toplam 20 set tamamla", goalType: "total_sets", targetValue: 20, xpReward: 240, coinReward: 45, gemReward: 2 },
  { difficulty: "hard", title: "Tekrar Krali", description: "Toplam 100 tekrar yap", goalType: "total_reps", targetValue: 100, xpReward: 230, coinReward: 40, gemReward: 2 },
  { difficulty: "hard", title: "Macera Kahramani", description: "5 farkli egzersiz yap", goalType: "exercise_count", targetValue: 5, xpReward: 260, coinReward: 50, gemReward: 3 },
  { difficulty: "hard", title: "Uc Kere Savaşçı", description: "3 antrenman tamamla", goalType: "workout_count", targetValue: 3, xpReward: 270, coinReward: 55, gemReward: 3 },
];

const DAILY_BONUS_XP = 200;

function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

function pickOne<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function getLocalDate(utcDate: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
  } catch {
    const offset = 3 * 60 * 60 * 1000;
    const local = new Date(utcDate.getTime() + offset);
    return local.toISOString().slice(0, 10);
  }
}

async function generateDailyQuests(userId: string, dateStr: string) {
  const seed = Array.from(userId + dateStr).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rng = seededRandom(seed);

  const easy = pickOne(EASY_QUESTS, rng);
  const medium = pickOne(MEDIUM_QUESTS, rng);
  const hard = pickOne(HARD_QUESTS, rng);

  const quests = [easy, medium, hard];

  for (const q of quests) {
    const id = `dq_${userId}_${dateStr}_${q.difficulty}`;
    await db.insert(dailyQuestsTable).values({
      id,
      userId,
      questDate: dateStr,
      difficulty: q.difficulty,
      title: q.title,
      description: q.description,
      goalType: q.goalType,
      targetValue: q.targetValue,
      currentProgress: 0,
      xpReward: q.xpReward,
      coinReward: q.coinReward,
      gemReward: q.gemReward,
      isCompleted: false,
      isClaimed: false,
    }).onConflictDoNothing();
  }
}

async function getOrCreateQuests(userId: string, timezone: string) {
  const today = getLocalDate(new Date(), timezone);

  const existing = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(
      eq(dailyQuestsTable.userId, userId),
      eq(dailyQuestsTable.questDate, today)
    ));

  if (existing.length === 0) {
    await generateDailyQuests(userId, today);
    return db
      .select()
      .from(dailyQuestsTable)
      .where(and(
        eq(dailyQuestsTable.userId, userId),
        eq(dailyQuestsTable.questDate, today)
      ));
  }

  return existing;
}

router.get("/daily-quests", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  if (!char) {
    res.status(404).json({ error: "Karakter bulunamadi" });
    return;
  }

  const tz = char.timezone || "Europe/Istanbul";
  const today = getLocalDate(new Date(), tz);
  const quests = await getOrCreateQuests(userId, tz);

  const allCompleted = quests.length === 3 && quests.every((q) => q.isCompleted);
  const allClaimed = quests.length === 3 && quests.every((q) => q.isClaimed);
  const bonusAlreadyClaimed = char.lastDailyBonusDate === today;
  const completedCount = quests.filter((q) => q.isCompleted).length;
  const claimedCount = quests.filter((q) => q.isClaimed).length;

  res.json({
    quests: quests.map(q => ({
      ...q,
      claimable: q.isCompleted && !q.isClaimed,
    })),
    allCompleted,
    allClaimed,
    bonusAvailable: allCompleted && !bonusAlreadyClaimed,
    bonusAlreadyClaimed,
    bonusXp: DAILY_BONUS_XP,
    completedCount,
    claimedCount,
    questStreak: char.questStreak || 0,
    streakActive: char.streakActiveUntil
      ? new Date(char.streakActiveUntil) > new Date()
      : false,
    today,
  });
});

router.post("/daily-quests/:questId/claim", authenticateUser, async (req, res) => {
  const { questId } = req.params;
  const userId = req.user!.id;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      const [quest] = await tx
        .select()
        .from(dailyQuestsTable)
        .where(and(
          eq(dailyQuestsTable.id, questId),
          eq(dailyQuestsTable.userId, userId)
        ));

      if (!quest) throw { status: 404, error: "Gorev bulunamadi" };
      if (!quest.isCompleted) throw { status: 400, error: "Gorev henuz tamamlanmadi" };
      if (quest.isClaimed) throw { status: 400, error: "Odul zaten alindi", code: "ALREADY_CLAIMED" };

      await tx
        .update(dailyQuestsTable)
        .set({ isClaimed: true, claimedAt: new Date() })
        .where(eq(dailyQuestsTable.id, questId));

      const xpReward = quest.xpReward;
      const rawCoinReward = quest.coinReward;
      const rawGemReward = quest.gemReward;

      const tz = char.timezone || "Europe/Istanbul";

      const lv = processLevelUp(char.exp, char.level, xpReward);
      const stats = calcStats(lv.newLevel, char.class);
      const newTotalXp = char.total_xp_earned + xpReward;
      const newLeague = calcLeague(newTotalXp);

      const [updated] = await tx.update(charactersTable).set({
        exp: lv.newExp,
        level: lv.newLevel,
        totalExp: char.total_exp + xpReward,
        totalXpEarned: newTotalXp,
        league: newLeague,
        ...stats,
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId)).returning();

      return { quest, updated, xpReward, rawCoinReward, rawGemReward, leveledUp: lv.leveledUp, newLevel: lv.newLevel, currentCoins: char.gym_coins || 0, currentGems: char.gems || 0, tz };
    });

    let economyResult;
    try {
      economyResult = await processQuestReward(
        userId,
        result.rawCoinReward,
        result.rawGemReward,
        result.xpReward,
        result.currentCoins,
        result.currentGems,
        result.tz
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
    } catch (err) {
      console.error("Economy (quest) error:", err);
      await db.update(charactersTable).set({
        gymCoins: sql`${charactersTable.gymCoins} + ${result.rawCoinReward}`,
        gems: sql`${charactersTable.gems} + ${result.rawGemReward}`,
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId));
      economyResult = null;
    }

    try {
      if (result.xpReward > 0) {
        await addBattlePassXp(userId, result.xpReward);
      }
    } catch (err) {
      console.error("Battle pass XP (quest claim) error:", err);
    }

    const [freshChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
    const expToNextLevel = calcExpToNextLevel(freshChar?.level ?? result.updated.level);

    res.json({
      quest: { ...result.quest, isClaimed: true },
      rewards: {
        xp: result.xpReward,
        coins: economyResult?.coins ?? result.rawCoinReward,
        gems: economyResult?.gems ?? result.rawGemReward,
      },
      leveledUp: result.leveledUp,
      character: {
        ...(freshChar || result.updated),
        expToNextLevel,
        league: calcLeague((freshChar || result.updated).totalXpEarned),
      },
      economy: economyResult ? {
        dailyCoinsEarned: economyResult.dailyCoinsEarned,
        dailyGemsEarned: economyResult.dailyGemsEarned,
        coinCap: economyResult.dailyCoinCap,
        gemCap: economyResult.dailyGemCap,
        coinCapReached: economyResult.coinCapReached,
        gemCapReached: economyResult.gemCapReached,
        reductions: economyResult.reductions,
      } : null,
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Daily quest claim error:", err);
    res.status(500).json({ error: "Odul alinamadi" });
  }
});

router.post("/daily-quests/claim-bonus", authenticateUser, async (req, res) => {
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

      if (char.last_daily_bonus_date === today) {
        throw { status: 400, error: "Gunluk bonus zaten alindi", code: "BONUS_ALREADY_CLAIMED" };
      }

      const quests = await tx
        .select()
        .from(dailyQuestsTable)
        .where(and(
          eq(dailyQuestsTable.userId, userId),
          eq(dailyQuestsTable.questDate, today)
        ));

      const allCompleted = quests.length === 3 && quests.every((q) => q.isCompleted);
      if (!allCompleted) throw { status: 400, error: "Tum gorevler tamamlanmali" };

      const allClaimed = quests.every((q) => q.isClaimed);
      if (!allClaimed) throw { status: 400, error: "Once tum gorev odullerini alin" };

      const lv2 = processLevelUp(char.exp, char.level, DAILY_BONUS_XP);

      const newStreak = (char.quest_streak || 0) + 1;
      const stats = calcStats(lv2.newLevel, char.class);
      const newTotalXp = char.total_xp_earned + DAILY_BONUS_XP;
      const newLeague = calcLeague(newTotalXp);

      const streakActiveUntil = newStreak >= 7
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : char.streak_active_until;

      const [updated] = await tx.update(charactersTable).set({
        exp: lv2.newExp,
        level: lv2.newLevel,
        totalExp: char.total_exp + DAILY_BONUS_XP,
        totalXpEarned: newTotalXp,
        questStreak: newStreak,
        streakActiveUntil: streakActiveUntil ?? undefined,
        lastDailyBonusDate: today,
        league: newLeague,
        ...stats,
        updatedAt: new Date(),
      }).where(eq(charactersTable.userId, userId)).returning();

      return { updated, newStreak, leveledUp: lv2.leveledUp, newLevel: lv2.newLevel };
    });

    try {
      await addBattlePassXp(userId, DAILY_BONUS_XP);
    } catch (err) {
      console.error("Battle pass XP (daily bonus) error:", err);
    }

    const expToNextLevel = calcExpToNextLevel(result.updated.level);
    const streakActive = result.updated.streakActiveUntil
      ? new Date(result.updated.streakActiveUntil) > new Date()
      : false;

    res.json({
      bonusXp: DAILY_BONUS_XP,
      questStreak: result.newStreak,
      streakActive,
      leveledUp: result.leveledUp,
      character: {
        ...result.updated,
        expToNextLevel,
        streakActive,
        league: calcLeague(result.updated.totalXpEarned),
      },
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Daily bonus claim error:", err);
    res.status(500).json({ error: "Bonus alinamadi" });
  }
});

async function countDistinctExercisesToday(userId: string, today: string, timezone: string): Promise<number> {
  const now = new Date();
  const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rows = await db
    .select({ exerciseType: workoutsTable.exerciseType, createdAt: workoutsTable.createdAt })
    .from(workoutsTable)
    .where(and(
      eq(workoutsTable.userId, userId),
      gte(workoutsTable.createdAt, last48h)
    ));

  const uniqueTypes = new Set<string>();
  for (const row of rows) {
    if (getLocalDate(new Date(row.createdAt), timezone) === today) {
      uniqueTypes.add(row.exerciseType);
    }
  }
  return uniqueTypes.size;
}

export async function updateDailyQuestProgress(
  userId: string,
  timezone: string,
  workoutData: {
    exerciseType: string;
    sets: number;
    reps: number;
    durationMin: number;
  },
) {
  const today = getLocalDate(new Date(), timezone);

  let quests = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(
      eq(dailyQuestsTable.userId, userId),
      eq(dailyQuestsTable.questDate, today),
    ));

  if (quests.length === 0) {
    await generateDailyQuests(userId, today);
    quests = await db
      .select()
      .from(dailyQuestsTable)
      .where(and(
        eq(dailyQuestsTable.userId, userId),
        eq(dailyQuestsTable.questDate, today),
      ));
  } else if (quests.length < 3) {
    const existing = new Set(quests.map(q => q.difficulty));
    const missing: Difficulty[] = [];
    for (const d of ["easy", "medium", "hard"] as Difficulty[]) {
      if (!existing.has(d)) missing.push(d);
    }
    if (missing.length > 0) {
      const seed = Array.from(userId + today).reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const rng = seededRandom(seed);
      const pools: Record<Difficulty, QuestTemplate[]> = { easy: EASY_QUESTS, medium: MEDIUM_QUESTS, hard: HARD_QUESTS };
      for (const d of missing) {
        const q = pickOne(pools[d], rng);
        const id = `dq_${userId}_${today}_${d}`;
        await db.insert(dailyQuestsTable).values({
          id, userId, questDate: today, difficulty: d,
          title: q.title, description: q.description, goalType: q.goalType,
          targetValue: q.targetValue, currentProgress: 0,
          xpReward: q.xpReward, coinReward: q.coinReward, gemReward: q.gemReward,
          isCompleted: false, isClaimed: false,
        }).onConflictDoNothing();
      }
      quests = await db
        .select()
        .from(dailyQuestsTable)
        .where(and(
          eq(dailyQuestsTable.userId, userId),
          eq(dailyQuestsTable.questDate, today),
        ));
    }
  }

  const incomplete = quests.filter(q => !q.isCompleted);
  if (incomplete.length === 0) return [];

  let distinctExercises: number | null = null;
  const completedQuests: string[] = [];

  for (const quest of incomplete) {
    let newProgress = quest.currentProgress;

    switch (quest.goalType) {
      case "workout_count":
        newProgress += 1;
        break;
      case "total_sets":
        newProgress += workoutData.sets;
        break;
      case "total_duration":
        newProgress += workoutData.durationMin;
        break;
      case "total_reps":
        newProgress += workoutData.reps;
        break;
      case "exercise_count":
        if (distinctExercises === null) {
          distinctExercises = await countDistinctExercisesToday(userId, today, timezone);
        }
        newProgress = distinctExercises;
        break;
      case "boost_used":
        break;
    }

    newProgress = Math.min(newProgress, quest.targetValue);
    if (newProgress === quest.currentProgress) continue;

    const nowCompleted = newProgress >= quest.targetValue;

    await db.update(dailyQuestsTable).set({
      currentProgress: newProgress,
      isCompleted: nowCompleted,
      completedAt: nowCompleted ? new Date() : undefined,
    }).where(eq(dailyQuestsTable.id, quest.id));

    if (nowCompleted) {
      completedQuests.push(quest.id);
    }
  }

  return completedQuests;
}

export async function updateBoostQuestProgress(userId: string, timezone: string) {
  const today = getLocalDate(new Date(), timezone);

  let quests = await db
    .select()
    .from(dailyQuestsTable)
    .where(and(
      eq(dailyQuestsTable.userId, userId),
      eq(dailyQuestsTable.questDate, today),
    ));

  if (quests.length === 0) {
    await generateDailyQuests(userId, today);
    quests = await db
      .select()
      .from(dailyQuestsTable)
      .where(and(
        eq(dailyQuestsTable.userId, userId),
        eq(dailyQuestsTable.questDate, today),
      ));
  }

  const boostQuests = quests.filter(q => q.goalType === "boost_used" && !q.isCompleted);
  const completedIds: string[] = [];

  for (const quest of boostQuests) {
    const newProgress = Math.min(quest.currentProgress + 1, quest.targetValue);
    const nowCompleted = newProgress >= quest.targetValue;

    await db.update(dailyQuestsTable).set({
      currentProgress: newProgress,
      isCompleted: nowCompleted,
      completedAt: nowCompleted ? new Date() : undefined,
    }).where(eq(dailyQuestsTable.id, quest.id));

    if (nowCompleted) completedIds.push(quest.id);
  }

  return completedIds;
}

export default router;
