import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  workoutsTable, charactersTable,
  partyMembersTable, bossEventsTable, eventContributionsTable,
  characterAchievementsTable, workoutAuditLogsTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray, gte, sql } from "drizzle-orm";
import { calcExpToNextLevel, calcStats, calcLeague, processLevelUp } from "./character.js";
import { getActiveBoostMultiplier } from "./store.js";
import { getRaceXpMultiplier } from "../constants/races.js";
import { BOSS_MAP } from "../constants/bosses.js";
import { checkAndAwardAchievements } from "../constants/achievements.js";
import { authenticateUser } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import {
  validateUserAction, validateTimestamp, validateWorkoutConsistency,
  checkXpHourlyCap, checkWorkoutHourlyCap, createEndpointRateLimiter,
  logSuspiciousActivity,
} from "../middlewares/anticheat.js";
import { updateDailyQuestProgress } from "./daily-quests.js";
import { addBattlePassXp } from "./battle-pass.js";
import { processWorkoutReward, type EconomyResult } from "../economy.js";
import { trackDailyActivity } from "./retention.js";

const router: IRouter = Router();

const workoutRateLimiter = createEndpointRateLimiter(10);

const COOLDOWN_MS = 10 * 60 * 1000;
const SPAM_THRESHOLD_HOURLY = 8;
const SPAM_THRESHOLD_DAILY = 30;
const SPAM_XP_PENALTY = 0.25;
const SPAM_DAILY_XP_PENALTY = 0.10;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const SOFT_CAP_TIER1 = 3;
const SOFT_CAP_TIER1_MULT = 0.50;
const SOFT_CAP_TIER2 = 5;
const SOFT_CAP_TIER2_MULT = 0.20;

const BASE_XP = 50;
const MODE_MULT: Record<string, number> = { recommended: 1.0, custom: 0.85, free: 0.7 };
const SETS_BONUS_PER = 2;
const SETS_BONUS_CAP = 200;
const DUR_BONUS_PER = 1;
const DUR_BONUS_CAP = 120;
const LOW_EX_THRESH = 2;
const MIN_SETS = 3;
const MIN_DUR = 5;
const QUALITY_SETS = 15;
const QUALITY_DUR = 20;
const QUALITY_BONUS = 20;
const STREAK_PER_DAY = 5;
const STREAK_CAP = 50;
const COINS_PER_XP = 0.12;

function checkGlobalCooldown(lastWorkoutAt: Date | null, now: Date): { allowed: boolean; remainingSeconds: number } {
  if (!lastWorkoutAt) return { allowed: true, remainingSeconds: 0 };
  const elapsed = now.getTime() - new Date(lastWorkoutAt).getTime();
  if (elapsed < 0) return { allowed: true, remainingSeconds: 0 };
  const remaining = COOLDOWN_MS - elapsed;
  if (remaining > 0) {
    return { allowed: false, remainingSeconds: Math.ceil(remaining / 1000) };
  }
  return { allowed: true, remainingSeconds: 0 };
}

function getLocalDate(utcDate: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcDate);
    return parts;
  } catch {
    const offset = 3 * 60 * 60 * 1000;
    const local = new Date(utcDate.getTime() + offset);
    return local.toISOString().slice(0, 10);
  }
}

function dayDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function computeStreak(
  lastWorkoutAt: Date | null,
  currentStreak: number,
  lastStreakDate: string | null,
  now: Date,
  timezone: string,
) {
  const todayLocal = getLocalDate(now, timezone);

  if (!lastWorkoutAt) {
    return { newStreak: 1, streakContinued: false, streakBroken: false, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate, daysSinceLast: null } };
  }

  const alreadyIncrementedToday = lastStreakDate === todayLocal;
  if (alreadyIncrementedToday) {
    return { newStreak: currentStreak, streakContinued: false, streakBroken: false, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate, daysSinceLast: 0, sameDay: true } };
  }

  const lastLocal = lastStreakDate || getLocalDate(new Date(lastWorkoutAt), timezone);
  const daysSince = dayDiff(lastLocal, todayLocal);

  if (daysSince === 1) {
    return { newStreak: currentStreak + 1, streakContinued: true, streakBroken: false, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate: lastLocal, daysSinceLast: daysSince } };
  }
  if (daysSince === 2) {
    return { newStreak: currentStreak, streakContinued: false, streakBroken: false, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate: lastLocal, daysSinceLast: daysSince, gracePeriod: true } };
  }
  if (daysSince > 2) {
    return { newStreak: 1, streakContinued: false, streakBroken: true, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate: lastLocal, daysSinceLast: daysSince } };
  }

  return { newStreak: currentStreak, streakContinued: false, streakBroken: false, newStreakDate: todayLocal, debug: { todayLocal, lastStreakDate: lastLocal, daysSinceLast: daysSince } };
}

function checkMinimumEffort(totalSets: number, durationMinutes: number): { meetsEffort: boolean; reason?: string } {
  if (totalSets < MIN_SETS && durationMinutes < MIN_DUR) {
    return { meetsEffort: false, reason: `Minimum efor karsilanmadi: en az ${MIN_SETS} set veya ${MIN_DUR} dakika gerekli` };
  }
  if (totalSets < MIN_SETS) {
    return { meetsEffort: false, reason: `Minimum set sayisi karsilanmadi: en az ${MIN_SETS} set gerekli` };
  }
  if (durationMinutes < MIN_DUR) {
    return { meetsEffort: false, reason: `Minimum sure karsilanmadi: en az ${MIN_DUR} dakika gerekli` };
  }
  return { meetsEffort: true };
}

function applySoftCap(xp: number, dailyWorkoutCount: number): { xp: number; capApplied: string | null } {
  if (dailyWorkoutCount >= SOFT_CAP_TIER2) {
    return { xp: Math.floor(xp * SOFT_CAP_TIER2_MULT), capApplied: `Gunluk ${dailyWorkoutCount}. antrenman — XP %${Math.round(SOFT_CAP_TIER2_MULT * 100)}` };
  }
  if (dailyWorkoutCount >= SOFT_CAP_TIER1) {
    return { xp: Math.floor(xp * SOFT_CAP_TIER1_MULT), capApplied: `Gunluk ${dailyWorkoutCount}. antrenman — XP %${Math.round(SOFT_CAP_TIER1_MULT * 100)}` };
  }
  return { xp, capApplied: null };
}

function applyXPModifiers(rawXp: number, mode: string, totalSets: number, durationMinutes: number, exercisesCount: number) {
  const cSets = Math.min(Math.max(0, totalSets), 100);
  const cDur = Math.min(Math.max(0, durationMinutes), 180);

  const isLowEx = exercisesCount < LOW_EX_THRESH;
  const meetsMinimumEffort = cSets >= MIN_SETS && cDur >= MIN_DUR;

  const setsBonus = Math.min(cSets * SETS_BONUS_PER, SETS_BONUS_CAP);
  const durationBonus = Math.min(cDur * DUR_BONUS_PER, DUR_BONUS_CAP);

  const isQuality = cSets >= QUALITY_SETS && cDur >= QUALITY_DUR;
  const qualityBonus = isQuality ? QUALITY_BONUS : 0;

  let penaltyFactor = 1;
  if (isLowEx) penaltyFactor -= 0.25;
  penaltyFactor = Math.max(0.5, penaltyFactor);

  const modeMultiplier = MODE_MULT[mode] ?? 0.7;
  const finalMultiplier = modeMultiplier * penaltyFactor;

  const modified = (rawXp + setsBonus + durationBonus + qualityBonus) * finalMultiplier;
  const xp = Math.max(0, Math.floor(modified));

  return {
    xp,
    meetsMinimumEffort,
    breakdown: {
      rawBase: rawXp,
      setsBonus,
      durationBonus,
      qualityBonus,
      multipliers: { mode: modeMultiplier, penaltyFactor, finalMultiplier },
    },
  };
}

function applyStreakBonus(baseXP: number, streakDays: number, meetsEffort: boolean) {
  const streakBonus = meetsEffort ? Math.min(Math.max(0, streakDays) * STREAK_PER_DAY, STREAK_CAP) : 0;
  const totalXP = Math.max(0, Math.floor(baseXP + streakBonus));
  return { totalXP, breakdown: { baseXP, streakBonus } };
}

interface SpamCheck {
  hourlySpam: boolean;
  dailySpam: boolean;
  hourlyCount: number;
  dailyCount: number;
  isDuplicate: boolean;
  xpMultiplier: number;
}

async function checkSpam(userId: string, exerciseType?: string): Promise<SpamCheck> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const dupWindow = new Date(now - DUPLICATE_WINDOW_MS);

  const recentWorkouts = await db.select({
    id: workoutsTable.id,
    exerciseType: workoutsTable.exerciseType,
    createdAt: workoutsTable.createdAt,
  })
    .from(workoutsTable)
    .where(and(
      eq(workoutsTable.userId, userId),
      gte(workoutsTable.createdAt, oneDayAgo),
    ));

  const hourlyCount = recentWorkouts.filter(w => new Date(w.createdAt!) >= oneHourAgo).length;
  const dailyCount = recentWorkouts.length;

  const isDuplicate = exerciseType
    ? recentWorkouts.some(w => w.exerciseType === exerciseType && new Date(w.createdAt!) >= dupWindow)
    : false;

  const hourlySpam = hourlyCount >= SPAM_THRESHOLD_HOURLY - 1;
  const dailySpam = dailyCount >= SPAM_THRESHOLD_DAILY;

  let xpMultiplier = 1;
  if (dailySpam) {
    xpMultiplier = SPAM_DAILY_XP_PENALTY;
  } else if (hourlySpam) {
    xpMultiplier = SPAM_XP_PENALTY;
  }
  if (isDuplicate) {
    xpMultiplier = Math.min(xpMultiplier, 0.5);
  }

  return { hourlySpam, dailySpam, hourlyCount, dailyCount, isDuplicate, xpMultiplier };
}

async function logAudit(userId: string, workoutId: string | null, eventType: string, details: string) {
  try {
    await db.insert(workoutAuditLogsTable).values({
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId,
      workoutId,
      eventType,
      details,
    });
  } catch {}
}


const XP_TABLE: Record<string, number> = {
  push_up: 15, pull_up: 20, squat: 12, deadlift: 25,
  bench_press: 22, shoulder_press: 18, running: 2, cycling: 1,
  plank: 10, burpee: 20, jump_rope: 2, row: 18,
  lunge: 12, situp: 10, other: 8,
};

const CALORIE_TABLE: Record<string, number> = {
  push_up: 0.35, pull_up: 0.5, squat: 0.4, deadlift: 0.6,
  bench_press: 0.45, shoulder_press: 0.4, running: 8.5, cycling: 6.0,
  plank: 3.5, burpee: 0.55, jump_rope: 7.0, row: 6.5,
  lunge: 0.38, situp: 0.25, other: 0.3,
};

const DURATION_TABLE: Record<string, number> = {
  push_up: 2, pull_up: 3, squat: 2.5, deadlift: 4,
  bench_press: 3, shoulder_press: 3, running: 1, cycling: 1,
  plank: 1, burpee: 5, jump_rope: 1, row: 1,
  lunge: 2, situp: 2, other: 2,
};

const SUSPICIOUS_THRESHOLDS: Record<string, { maxReps?: number; maxSets?: number; maxDuration?: number }> = {
  push_up: { maxReps: 80, maxSets: 15 }, pull_up: { maxReps: 50, maxSets: 12 },
  squat: { maxReps: 80, maxSets: 15 }, deadlift: { maxReps: 30, maxSets: 8 },
  bench_press: { maxReps: 50, maxSets: 12 }, shoulder_press: { maxReps: 50, maxSets: 12 },
  running: { maxDuration: 100 }, cycling: { maxDuration: 200 },
  plank: { maxDuration: 45 }, burpee: { maxReps: 60, maxSets: 10 },
  jump_rope: { maxDuration: 90 }, row: { maxDuration: 90 },
  lunge: { maxReps: 80, maxSets: 12 }, situp: { maxReps: 80, maxSets: 15 },
  other: { maxReps: 300, maxSets: 30 },
};

function isSuspicious(exerciseType: string, sets: number, reps: number, duration: number): boolean {
  const t = SUSPICIOUS_THRESHOLDS[exerciseType] || {};
  if (t.maxReps && reps > t.maxReps) return true;
  if (t.maxSets && sets > t.maxSets) return true;
  if (t.maxDuration && duration > t.maxDuration) return true;
  return false;
}

function calcRawXp(exerciseType: string, sets: number, reps: number, duration: number, xpPerUnit?: number): number {
  const base = xpPerUnit || XP_TABLE[exerciseType] || 8;
  if (duration > 0 && reps === 0) return Math.floor(base * (duration / 60));
  return Math.floor(base * sets * Math.sqrt(reps));
}

function calcCalories(exerciseType: string, sets: number, reps: number, duration: number, tempoSec = 3): number {
  const cal = CALORIE_TABLE[exerciseType] || 0.3;
  if (duration > 0 && reps === 0) return Math.round(cal * duration);
  const estMin = (sets * reps * tempoSec) / 60;
  return Math.round(cal * estMin * 60);
}

function calcDurationMin(exerciseType: string, sets: number, reps: number, duration: number): number {
  if (duration > 0 && reps === 0) return duration;
  const secPerRep = DURATION_TABLE[exerciseType] || 2;
  return Math.round((sets * reps * secPerRep + sets * 60) / 60);
}

const CLASS_XP_BONUSES: Record<string, { categories: string[]; multiplier: number }> = {
  barbarian:  { categories: ['gogus', 'sirt', 'omuz', 'ust_bacak', 'arka_bacak', 'tam_vucut'], multiplier: 1.30 },
  fighter:    { categories: ['gogus', 'sirt', 'omuz', 'biseps', 'triseps', 'tam_vucut'], multiplier: 1.25 },
  paladin:    { categories: ['gogus', 'sirt', 'omuz', 'tam_vucut', 'kardiyo'], multiplier: 1.20 },
  monk:       { categories: ['kardiyo', 'tam_vucut', 'esneklik', 'karin', 'ust_bacak'], multiplier: 1.25 },
  rogue:      { categories: ['kardiyo', 'karin', 'ust_bacak', 'arka_bacak', 'esneklik'], multiplier: 1.25 },
  ranger:     { categories: ['kardiyo', 'arka_bacak', 'ust_bacak', 'karin'], multiplier: 1.25 },
  wizard:     { categories: ['esneklik', 'karin', 'kardiyo'], multiplier: 1.20 },
  cleric:     { categories: ['tam_vucut', 'kardiyo', 'esneklik', 'karin'], multiplier: 1.20 },
  druid:      { categories: ['esneklik', 'kardiyo', 'tam_vucut', 'karin'], multiplier: 1.20 },
  sorcerer:   { categories: ['kardiyo', 'esneklik', 'karin'], multiplier: 1.20 },
  warlock:    { categories: ['karin', 'esneklik', 'kardiyo'], multiplier: 1.20 },
  bard:       { categories: ['kardiyo', 'esneklik', 'karin', 'tam_vucut'], multiplier: 1.20 },
};

function getClassXPMultiplier(charClass: string, exerciseCategory: string): number {
  const bonus = CLASS_XP_BONUSES[charClass];
  if (!bonus) return 1;
  return bonus.categories.includes(exerciseCategory) ? bonus.multiplier : 1;
}

function validateWorkoutServer(
  exerciseType: string,
  sets: number,
  reps: number,
  duration: number,
  mode: string,
  wasRecommendedUsed: boolean,
  wasModified: boolean,
) {
  const warnings: string[] = [];
  let spamDetected = false;

  if (sets > 25) warnings.push(`Toplam set sayisi cok yuksek: ${sets}`);
  if (reps > 30 && duration === 0) warnings.push(`Tekrar sayisi cok yuksek: ${reps}`);
  if (sets > 50 || reps > 200) {
    warnings.push("Asiri yuksek hacim — olasi veri manipulasyonu");
    spamDetected = true;
  }
  if (duration > 300) {
    warnings.push("5 saatten uzun sure — olasi veri manipulasyonu");
    spamDetected = true;
  }
  if (mode === "recommended" && wasModified) {
    warnings.push("Mod 'recommended' olarak isaretli ancak degisiklik yapilmis — 'custom' olarak duzeltildi");
  }

  return { warnings, spamDetected };
}

router.get("/workouts", authenticateUser, rateLimiter, async (req, res) => {
  const userId = req.user!.id;
  const { limit } = req.query as { limit?: string };
  const lim = Math.min(parseInt(limit || "20"), 100);
  const workouts = await db.select().from(workoutsTable)
    .where(eq(workoutsTable.userId, userId))
    .orderBy(desc(workoutsTable.createdAt))
    .limit(lim);
  res.json(workouts);
});

router.post("/workouts", authenticateUser, rateLimiter, workoutRateLimiter, validateUserAction, validateTimestamp, validateWorkoutConsistency, async (req, res) => {
  const userId = req.user!.id;
  const { exerciseType, exerciseName, exerciseCategory, xpPerUnit, tempoSec, sets, reps, duration, weight, healthSource, clientHealthVerified, mode, wasRecommendedUsed, wasModified } = req.body;

  if (!exerciseType || !exerciseName) {
    res.status(400).json({ error: "exerciseType, exerciseName gereklidir" });
    return;
  }

  try {

  const workoutHourlyCap = await checkWorkoutHourlyCap(userId);
  if (!workoutHourlyCap.allowed) {
    await logSuspiciousActivity(userId, "workout_hourly_cap", "warning", {
      count: workoutHourlyCap.count, cap: 5,
    }, "/workouts");
    res.status(429).json({
      error: "Saatlik antrenman limiti asildi. Biraz dinlenin.",
      code: "WORKOUT_HOURLY_CAP",
      count: workoutHourlyCap.count,
    });
    return;
  }

  const xpHourlyCap = await checkXpHourlyCap(userId);
  if (!xpHourlyCap.allowed) {
    await logSuspiciousActivity(userId, "xp_hourly_cap", "warning", {
      currentXp: xpHourlyCap.currentXp, cap: 2000,
    }, "/workouts");
    res.status(429).json({
      error: "Saatlik XP limiti asildi. Dinlenme zamani.",
      code: "XP_HOURLY_CAP",
      currentXp: xpHourlyCap.currentXp,
    });
    return;
  }

  const s = Math.min(Math.max(Math.floor(Number(sets) || 1), 1), 100);
  const r = Math.min(Math.max(Math.floor(Number(reps) || 0), 0), 500);
  const d = Math.min(Math.max(Math.floor(Number(duration) || 0), 0), 600);

  let workoutMode = ['recommended', 'custom', 'free'].includes(mode) ? mode : 'free';
  const modifiedFlag = wasModified === true;
  const recommendedFlag = wasRecommendedUsed === true;

  if (workoutMode === 'recommended' && modifiedFlag) {
    workoutMode = 'custom';
  }

  const serverValidation = validateWorkoutServer(exerciseType, s, r, d, workoutMode, recommendedFlag, modifiedFlag);

  const rawXp = calcRawXp(exerciseType, s, r, d, xpPerUnit ? Math.min(Math.max(Number(xpPerUnit), 1), 100) : undefined);
  const ts = tempoSec ? Math.min(Math.max(Number(tempoSec), 1), 10) : 3;
  const estimatedCalories = calcCalories(exerciseType, s, r, d, ts);
  const estimatedDurationMin = calcDurationMin(exerciseType, s, r, d);
  const suspicious = isSuspicious(exerciseType, s, r, d);

  const effortCheck = checkMinimumEffort(s, estimatedDurationMin);
  if (!effortCheck.meetsEffort) {
    res.status(400).json({ error: effortCheck.reason, code: "INSUFFICIENT_EFFORT", xpEarned: 0 });
    return;
  }

  const isVerified = clientHealthVerified === true;
  const isPendingApproval = suspicious && !isVerified;
  const source = healthSource || "manual";
  const halfXp = isPendingApproval || clientHealthVerified === false;
  const now = new Date();

  let boostMultiplier = 100;
  try {
    boostMultiplier = await getActiveBoostMultiplier(userId);
  } catch {}

  const workoutId = `wk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const txResult = await db.transaction(async (tx) => {
    const charRows = await tx.execute(
      sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
    );
    const charCheck = charRows.rows?.[0] as any;
    if (!charCheck) throw { status: 404, error: "Karakter bulunamadi" };

    if (!charCheck.has_accepted_disclaimer) throw { status: 403, error: "Saglik feragatnamesi kabul edilmelidir", code: "DISCLAIMER_REQUIRED" };

    const cooldown = checkGlobalCooldown(charCheck.last_workout_at, now);
    if (!cooldown.allowed) {
      throw { status: 429, error: `Dinlenme suresi dolmadi. ${Math.ceil(cooldown.remainingSeconds / 60)} dakika bekleyin.`, code: "COOLDOWN_ACTIVE", remainingSeconds: cooldown.remainingSeconds };
    }

    const tz = charCheck.timezone || 'Europe/Istanbul';
    const todayLocal = getLocalDate(now, tz);

    const spamRows = await tx.execute(
      sql`SELECT id, exercise_type, created_at FROM workouts WHERE user_id = ${userId} AND created_at >= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`
    );
    const recentWorkouts = (spamRows.rows || []) as any[];
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dupWindow = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
    const hourlyCount = recentWorkouts.filter((w: any) => new Date(w.created_at) >= oneHourAgo).length;
    const dailyCount = recentWorkouts.filter((w: any) => getLocalDate(new Date(w.created_at), tz) === todayLocal).length;
    const totalRecentCount = recentWorkouts.length;
    const isDuplicate = recentWorkouts.some((w: any) => w.exercise_type === exerciseType && new Date(w.created_at) >= dupWindow);

    const hourlySpam = hourlyCount >= SPAM_THRESHOLD_HOURLY - 1;
    const dailySpam = totalRecentCount >= SPAM_THRESHOLD_DAILY;
    let spamXpMult = 1;
    if (dailySpam) spamXpMult = SPAM_DAILY_XP_PENALTY;
    else if (hourlySpam) spamXpMult = SPAM_XP_PENALTY;
    if (isDuplicate) spamXpMult = Math.min(spamXpMult, 0.5);

    const spamPenalty = hourlySpam || dailySpam;
    const warnings = [...serverValidation.warnings];
    if (dailySpam) warnings.push(`Son 24 saatte ${totalRecentCount} antrenman — XP %${Math.round(SPAM_DAILY_XP_PENALTY * 100)} olarak verilecek`);
    else if (hourlySpam) warnings.push(`Son 1 saatte ${hourlyCount} antrenman — XP %${Math.round(SPAM_XP_PENALTY * 100)} olarak verilecek`);
    if (isDuplicate) warnings.push(`Ayni egzersiz 2 dakika icinde tekrarlandi — XP dusuruldu`);

    const effectiveDailyCount = dailyCount + 1;
    const softCapPreview = applySoftCap(1, effectiveDailyCount);
    if (softCapPreview.capApplied) warnings.push(softCapPreview.capApplied);

    const raceMultiplier = getRaceXpMultiplier(charCheck.race || "yuce_insan", exerciseType, charCheck.class);
    const classMultiplier = getClassXPMultiplier(charCheck.class, exerciseCategory || '');

    let preModXp = halfXp ? Math.floor(rawXp * 0.5) : rawXp;
    if (serverValidation.spamDetected) preModXp = Math.floor(preModXp * 0.1);

    const xpMod = applyXPModifiers(preModXp, workoutMode, s, estimatedDurationMin, 1);

    const raceBoostedXp = Math.floor(xpMod.xp * raceMultiplier * classMultiplier);
    const boostedXp = Math.floor(raceBoostedXp * boostMultiplier / 100);

    const streakResult = computeStreak(charCheck.last_workout_at, charCheck.streak_days || 0, charCheck.last_streak_date, now, tz);
    const finalXP = applyStreakBonus(boostedXp, streakResult.newStreak, xpMod.meetsMinimumEffort);

    let finalXpAwarded = finalXP.totalXP;
    if (spamPenalty) finalXpAwarded = Math.floor(finalXpAwarded * spamXpMult);
    const softCapResult = applySoftCap(finalXpAwarded, effectiveDailyCount);
    finalXpAwarded = softCapResult.xp;

    const rawCoinCalc = finalXpAwarded > 0 ? Math.max(1, Math.floor(finalXpAwarded * COINS_PER_XP)) : 0;
    const warningsJson = warnings.length > 0 ? JSON.stringify(warnings) : null;

    const [workout] = await tx.insert(workoutsTable).values({
      id: workoutId, userId, exerciseType, exerciseName,
      sets: s, reps: r, duration: d,
      weight: weight || null,
      xpEarned: finalXpAwarded,
      estimatedCalories, estimatedDurationMin,
      isVerified, isPendingApproval,
      healthSource: source,
      mode: workoutMode,
      wasRecommendedUsed: recommendedFlag,
      wasModified: modifiedFlag,
      serverWarnings: warningsJson,
    }).returning();

    const lv = processLevelUp(charCheck.exp, charCheck.level, finalXpAwarded);
    const stats = calcStats(lv.newLevel, charCheck.class);
    const newTotalXp = charCheck.total_xp_earned + finalXpAwarded;
    const newLeague = calcLeague(newTotalXp);

    const [updated] = await tx.update(charactersTable).set({
      exp: lv.newExp,
      level: lv.newLevel,
      totalExp: charCheck.total_exp + finalXpAwarded,
      totalXpEarned: newTotalXp,
      totalWorkouts: charCheck.total_workouts + 1,
      totalCalories: (charCheck.total_calories || 0) + estimatedCalories,
      league: newLeague,
      streakDays: streakResult.newStreak,
      lastWorkoutAt: now,
      lastStreakDate: streakResult.newStreakDate,
      weeklyXp: sql`${charactersTable.weeklyXp} + ${finalXpAwarded}`,
      ...stats,
      updatedAt: now,
    }).where(eq(charactersTable.userId, userId)).returning();

    return {
      workout, updatedChar: updated, leveledUp: lv.leveledUp, newLevel: lv.newLevel,
      spamPenalty, xpReductionApplied: spamPenalty || serverValidation.spamDetected || isDuplicate || softCapResult.capApplied !== null,
      warnings, warningsJson, streakResult, finalXP: finalXpAwarded, rawXp, boostedXp,
      raceMultiplier, rawCoinCalc, charLevel: lv.newLevel,
      currentCoins: charCheck.gym_coins || 0, currentGems: charCheck.gems || 0,
      tz,
    };
  });

  const { workout, updatedChar, leveledUp, newLevel } = txResult;

  try {
    const { trackEvent } = await import("../trackEvent.js");
    trackEvent(userId, "workout_completed", { exerciseType, sets: s, reps: r, xp: txResult.finalXP, workoutId });
    if (txResult.finalXP > 0) {
      trackEvent(userId, "xp_gained", { xp: txResult.finalXP, source: "workout", exerciseType });
    }
    if (leveledUp) {
      trackEvent(userId, "level_up", { oldLevel: newLevel - 1, newLevel });
    }
    trackEvent(userId, "streak_updated", { streakDays: txResult.streakResult.newStreak });
  } catch {}

  if (txResult.warnings.length > 0) {
    await logAudit(userId, workoutId, "validation_warnings", txResult.warningsJson || "");
  }
  if (serverValidation.spamDetected) {
    await logAudit(userId, workoutId, "suspicious_activity", `Spam algilandi`);
  }

  const expToNextLevel = calcExpToNextLevel(updatedChar.level || 1);
  const streakActive = updatedChar.streakActiveUntil
    ? new Date(updatedChar.streakActiveUntil) > new Date()
    : false;

  let bossContribution: { damageDealt: number; bossDefeated: boolean; newHp: number; bossName: string } | null = null;
  let newAchievements: any[] = [];

  if (updatedChar) {
    try {
      const [partyMembership] = await db
        .select()
        .from(partyMembersTable)
        .where(eq(partyMembersTable.userId, userId));

      if (partyMembership) {
        const [activeEvent] = await db
          .select()
          .from(bossEventsTable)
          .where(and(
            eq(bossEventsTable.partyId, partyMembership.partyId),
            eq(bossEventsTable.status, "active"),
          ));

        if (activeEvent && new Date(activeEvent.endsAt) > new Date()) {
          const boss = BOSS_MAP[activeEvent.bossKey];
          let baseDamage = Math.floor(txResult.finalXP * 0.6);
          if (boss && boss.weakClass.includes(updatedChar.class)) {
            baseDamage = Math.floor(baseDamage * 1.3);
          }

          const [existingContrib] = await db
            .select()
            .from(eventContributionsTable)
            .where(and(
              eq(eventContributionsTable.eventId, activeEvent.id),
              eq(eventContributionsTable.userId, userId),
            ));

          if (existingContrib) {
            await db.update(eventContributionsTable)
              .set({
                damageDealt: existingContrib.damageDealt + baseDamage,
                workoutsCount: existingContrib.workoutsCount + 1,
                contributedAt: new Date(),
              })
              .where(eq(eventContributionsTable.id, existingContrib.id));
          } else {
            await db.insert(eventContributionsTable).values({
              id: `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              eventId: activeEvent.id,
              characterId: updatedChar.id,
              userId,
              damageDealt: baseDamage,
              workoutsCount: 1,
            });
          }

          const newHp = Math.max(0, activeEvent.bossHpCurrent - baseDamage);
          let newStatus = activeEvent.status;
          let bossDefeated = false;

          if (newHp <= 0) {
            newStatus = "defeated";
            bossDefeated = true;
          }

          await db.update(bossEventsTable)
            .set({ bossHpCurrent: newHp, status: newStatus })
            .where(eq(bossEventsTable.id, activeEvent.id));

          bossContribution = {
            damageDealt: baseDamage,
            bossDefeated,
            newHp,
            bossName: boss?.name || activeEvent.bossKey,
          };

          if (bossDefeated && !activeEvent.rewardClaimed) {
            await db.update(bossEventsTable)
              .set({ rewardClaimed: true })
              .where(eq(bossEventsTable.id, activeEvent.id));

            const members = await db
              .select()
              .from(partyMembersTable)
              .where(eq(partyMembersTable.partyId, activeEvent.partyId));

            for (const member of members) {
              const [memberChar] = await db
                .select()
                .from(charactersTable)
                .where(eq(charactersTable.userId, member.userId));
              if (!memberChar) continue;
              const rewardXp = boss?.rewardXp || 1000;
              const rewardCoins = boss?.rewardCoins || 300;
              const bossLv = processLevelUp(memberChar.exp, memberChar.level, rewardXp);
              const bossStats = calcStats(bossLv.newLevel, memberChar.class);
              await db.update(charactersTable)
                .set({
                  totalXpEarned: memberChar.totalXpEarned + rewardXp,
                  exp: bossLv.newExp,
                  level: bossLv.newLevel,
                  gymCoins: memberChar.gymCoins + rewardCoins,
                  ...bossStats,
                  updatedAt: new Date(),
                })
                .where(eq(charactersTable.id, memberChar.id));
            }
          }
        }
      }

      const [latestChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
      const achChar = latestChar || updatedChar;
      newAchievements = await checkAndAwardAchievements(db, {
        ...achChar,
        league: calcLeague(achChar.totalXpEarned),
      }, { characterAchievementsTable, charactersTable }, eq);

      try {
        const { challengesTable } = await import("@workspace/db/schema");
        const { or } = await import("drizzle-orm");
        const activeChallenges = await db.select().from(challengesTable).where(
          and(
            or(eq(challengesTable.challengerId, userId), eq(challengesTable.challengedId, userId)),
            eq(challengesTable.status, "active")
          )
        );
        for (const ch of activeChallenges) {
          if (new Date(ch.endsAt) < new Date()) continue;
          const isChallenger = ch.challengerId === userId;
          await db.update(challengesTable).set(
            isChallenger
              ? { challengerScore: sql`${challengesTable.challengerScore} + ${txResult.finalXP}` }
              : { challengedScore: sql`${challengesTable.challengedScore} + ${txResult.finalXP}` }
          ).where(eq(challengesTable.id, ch.id));
        }
      } catch (challengeErr) {
        console.error("Challenge score update error:", challengeErr);
      }

    } catch (err) {
      console.error("Post-workout processing error:", err);
    }
  }

  let economyResult: EconomyResult | null = null;
  try {
    economyResult = await processWorkoutReward(
      userId,
      txResult.rawCoinCalc,
      txResult.finalXP,
      txResult.charLevel,
      txResult.currentCoins,
      txResult.currentGems,
      txResult.tz
    );
    if (economyResult.coins > 0) {
      await db.update(charactersTable)
        .set({ gymCoins: sql`${charactersTable.gymCoins} + ${economyResult.coins}`, updatedAt: new Date() })
        .where(eq(charactersTable.userId, userId));
    }
  } catch (err) {
    console.error("Economy processing error:", err);
    economyResult = { coins: txResult.rawCoinCalc, gems: 0, xp: txResult.finalXP, reductions: [], dailyCoinsEarned: 0, dailyGemsEarned: 0, dailyCoinCap: 2000, dailyGemCap: 20, coinCapReached: false, gemCapReached: false };
    await db.update(charactersTable)
      .set({ gymCoins: sql`${charactersTable.gymCoins} + ${txResult.rawCoinCalc}`, updatedAt: new Date() })
      .where(eq(charactersTable.userId, userId));
  }

  let questsCompleted: string[] = [];
  try {
    const charTz = updatedChar?.timezone || 'Europe/Istanbul';
    questsCompleted = await updateDailyQuestProgress(userId, charTz, {
      exerciseType,
      sets: s,
      reps: r,
      durationMin: estimatedDurationMin,
    });
  } catch (err) {
    console.error("Daily quest progress error:", err);
  }

  try {
    if (txResult.finalXP > 0) {
      await addBattlePassXp(userId, txResult.finalXP);
    }
  } catch (err) {
    console.error("Battle pass XP error:", err);
  }

  try {
    const charTz2 = updatedChar?.timezone || 'Europe/Istanbul';
    await trackDailyActivity(userId, charTz2);
  } catch (err) {
    console.error("Track daily activity error:", err);
  }

  const freshChar = updatedChar ? await db.select().from(charactersTable).where(eq(charactersTable.userId, userId)).then(r => r[0] || updatedChar) : updatedChar;
  const freshExpToNextLevel = calcExpToNextLevel(freshChar?.level || 1);

  res.json({
    workout,
    xpEarned: txResult.finalXP,
    rawXpEarned: txResult.rawXp,
    raceMultiplier: txResult.raceMultiplier,
    boosted: boostMultiplier > 100,
    boostMultiplier,
    gymCoinsEarned: economyResult?.coins ?? txResult.rawCoinCalc,
    estimatedCalories,
    estimatedDurationMin,
    isVerified,
    isPendingApproval,
    healthSource: source,
    character: freshChar
      ? { ...freshChar, expToNextLevel: freshExpToNextLevel, streakActive, league: calcLeague(freshChar.totalXpEarned) }
      : null,
    leveledUp,
    newLevel,
    bossContribution,
    newAchievements,
    questsCompleted,
    serverWarnings: txResult.warnings,
    spamPenalty: txResult.spamPenalty,
    xpReductionApplied: txResult.xpReductionApplied,
    streak: {
      days: txResult.streakResult.newStreak,
      continued: txResult.streakResult.streakContinued,
      broken: txResult.streakResult.streakBroken,
      debug: txResult.streakResult.debug,
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
    antiCheatWarning: (req as any).antiCheatWarning || null,
  });

  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Workout error:", err);
    res.status(500).json({ error: "Antrenman kaydedilemedi" });
  }
});

router.post("/workout/complete", authenticateUser, rateLimiter, workoutRateLimiter, validateUserAction, validateTimestamp, async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Yetkisiz erisim" });

  const { workoutSummary } = req.body;
  if (!workoutSummary) return res.status(400).json({ error: "workoutSummary gerekli" });

  const rawMode = workoutSummary.mode;
  const rawExCount = workoutSummary.exercisesCount;
  const rawSets = workoutSummary.totalSets;
  const rawDur = workoutSummary.durationMinutes;

  if (!rawMode || rawExCount == null || rawSets == null || rawDur == null) {
    return res.status(400).json({ error: "Eksik alanlar: mode, exercisesCount, totalSets, durationMinutes" });
  }

  const validMode = ['recommended', 'custom', 'free'].includes(rawMode) ? rawMode : 'free';
  const exercisesCount = Math.min(Math.max(0, Math.floor(Number(rawExCount) || 0)), 50);
  const totalSets = Math.min(Math.max(0, Math.floor(Number(rawSets) || 0)), 100);
  const durationMinutes = Math.min(Math.max(0, Math.floor(Number(rawDur) || 0)), 180);

  const now = new Date();

  try {

  const workoutHourlyCapCheck = await checkWorkoutHourlyCap(userId);
  if (!workoutHourlyCapCheck.allowed) {
    await logSuspiciousActivity(userId, "workout_hourly_cap", "warning", {
      count: workoutHourlyCapCheck.count, cap: 5,
    }, "/workout/complete");
    return res.status(429).json({
      error: "Saatlik antrenman limiti asildi. Biraz dinlenin.",
      code: "WORKOUT_HOURLY_CAP",
      count: workoutHourlyCapCheck.count,
    });
  }

  const xpHourlyCapCheck = await checkXpHourlyCap(userId);
  if (!xpHourlyCapCheck.allowed) {
    await logSuspiciousActivity(userId, "xp_hourly_cap", "warning", {
      currentXp: xpHourlyCapCheck.currentXp, cap: 2000,
    }, "/workout/complete");
    return res.status(429).json({
      error: "Saatlik XP limiti asildi. Dinlenme zamani.",
      code: "XP_HOURLY_CAP",
      currentXp: xpHourlyCapCheck.currentXp,
    });
  }

  if (totalSets > 30 && durationMinutes < 5 && durationMinutes > 0) {
    await logSuspiciousActivity(userId, "workout_consistency", "warning", {
      flags: ["high_sets_low_duration"], totalSets, durationMinutes,
    }, "/workout/complete");
  }
    const txResult = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) throw { status: 404, error: "Karakter bulunamadi" };

      if (!char.has_accepted_disclaimer) throw { status: 403, error: "Saglik feragatnamesi kabul edilmelidir", code: "DISCLAIMER_REQUIRED" };

      const cooldown = checkGlobalCooldown(char.last_workout_at, now);
      if (!cooldown.allowed) {
        throw { status: 429, error: `Dinlenme suresi dolmadi. ${Math.ceil(cooldown.remainingSeconds / 60)} dakika bekleyin.`, code: "COOLDOWN_ACTIVE", remainingSeconds: cooldown.remainingSeconds };
      }

      const effortCheck = checkMinimumEffort(totalSets, durationMinutes);
      if (!effortCheck.meetsEffort) {
        throw { status: 400, error: effortCheck.reason, code: "INSUFFICIENT_EFFORT", xpEarned: 0 };
      }

      const tz = char.timezone || 'Europe/Istanbul';
      const todayLocal = getLocalDate(now, tz);

      const spamRows = await tx.execute(
        sql`SELECT id, created_at FROM workouts WHERE user_id = ${userId} AND created_at >= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`
      );
      const recentWorkouts = (spamRows.rows || []) as any[];
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const hourlyCount = recentWorkouts.filter((w: any) => new Date(w.created_at) >= oneHourAgo).length;
      const dailyCount = recentWorkouts.filter((w: any) => getLocalDate(new Date(w.created_at), tz) === todayLocal).length;
      const totalRecentCount = recentWorkouts.length;
      const hourlySpam = hourlyCount >= SPAM_THRESHOLD_HOURLY - 1;
      const dailySpam = totalRecentCount >= SPAM_THRESHOLD_DAILY;
      let spamXpMult = 1;
      if (dailySpam) spamXpMult = SPAM_DAILY_XP_PENALTY;
      else if (hourlySpam) spamXpMult = SPAM_XP_PENALTY;

      let spamWarnings: string[] = [];
      if (dailySpam) spamWarnings.push(`Son 24 saatte ${totalRecentCount} antrenman — XP %${Math.round(SPAM_DAILY_XP_PENALTY * 100)}`);
      else if (hourlySpam) spamWarnings.push(`Son 1 saatte ${hourlyCount} antrenman — XP %${Math.round(SPAM_XP_PENALTY * 100)}`);

      const effectiveDailyCount = dailyCount + 1;

      const xpResult = applyXPModifiers(BASE_XP, validMode, totalSets, durationMinutes, exercisesCount);
      const streakResult = computeStreak(char.last_workout_at, char.streak_days || 0, char.last_streak_date, now, tz);

      const spamAdjustedXp = Math.floor(xpResult.xp * spamXpMult);
      const finalResult = applyStreakBonus(spamAdjustedXp, streakResult.newStreak, xpResult.meetsMinimumEffort);
      let xpGained = finalResult.totalXP;

      const softCapResult = applySoftCap(xpGained, effectiveDailyCount);
      xpGained = softCapResult.xp;
      if (softCapResult.capApplied) spamWarnings.push(softCapResult.capApplied);

      const lv = processLevelUp(char.exp, char.level, xpGained);
      const stats = calcStats(lv.newLevel, char.class);
      const newTotalXp = char.total_xp_earned + xpGained;
      const newLeague = calcLeague(newTotalXp);

      const [updated] = await tx.update(charactersTable).set({
        exp: lv.newExp,
        level: lv.newLevel,
        totalExp: char.total_exp + xpGained,
        totalXpEarned: newTotalXp,
        totalWorkouts: char.total_workouts + 1,
        league: newLeague,
        streakDays: streakResult.newStreak,
        lastWorkoutAt: now,
        lastStreakDate: streakResult.newStreakDate,
        ...stats,
        updatedAt: now,
      }).where(eq(charactersTable.userId, userId)).returning();

      return { updated, leveledUp: lv.leveledUp, xpGained, spamWarnings, xpResult, streakResult, finalResult, tz, totalSets, durationMinutes };
    });

    let questsCompleted: string[] = [];
    try {
      questsCompleted = await updateDailyQuestProgress(userId, txResult.tz, {
        exerciseType: "session_complete",
        sets: txResult.totalSets,
        reps: 0,
        durationMin: txResult.durationMinutes,
      });
    } catch (err) {
      console.error("Daily quest progress error (complete):", err);
    }

    try {
      if (txResult.xpGained > 0) {
        await addBattlePassXp(userId, txResult.xpGained);
      }
    } catch (err) {
      console.error("Battle pass XP error (complete):", err);
    }

    try {
      const completeTz = txResult.updated?.timezone || 'Europe/Istanbul';
      await trackDailyActivity(userId, completeTz);
    } catch (err) {
      console.error("Track daily activity error (complete):", err);
    }

    res.json({
      xpGained: txResult.xpGained,
      totalXP: txResult.updated.totalExp,
      level: txResult.updated.level,
      streakDays: txResult.updated.streakDays,
      leveledUp: txResult.leveledUp,
      spamWarnings: txResult.spamWarnings,
      questsCompleted,
      breakdown: {
        workout: txResult.xpResult.breakdown,
        final: txResult.finalResult.breakdown,
        streak: {
          continued: txResult.streakResult.streakContinued,
          broken: txResult.streakResult.streakBroken,
          debug: txResult.streakResult.debug,
        },
      },
    });
  } catch (err: any) {
    if (err?.status) {
      const { status, ...body } = err;
      res.status(status).json(body);
      return;
    }
    console.error("Workout complete error:", err);
    res.status(500).json({ error: "Antrenman tamamlanamadi" });
  }
});

export default router;
