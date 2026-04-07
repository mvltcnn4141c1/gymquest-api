type WorkoutMode = "recommended" | "custom" | "free";

interface XPInput {
  mode: WorkoutMode;
  exercisesCount: number;
  totalSets: number;
  durationMinutes: number;
}

interface XPMultipliers {
  mode: number;
  penaltyFactor: number;
  finalMultiplier: number;
}

interface XPBreakdown {
  base: number;
  setsBonus: number;
  durationBonus: number;
  qualityBonus: number;
  multipliers: XPMultipliers;
  meetsMinimumEffort: boolean;
}

interface XPResult {
  xp: number;
  breakdown: XPBreakdown;
}

const BASE_XP = 50;
const MINIMUM_XP = 20;

const MODE_MULTIPLIERS: Record<WorkoutMode, number> = {
  recommended: 1.0,
  custom: 0.85,
  free: 0.7,
};

const MAX_SETS = 100;
const MAX_DURATION_MINUTES = 180;
const SETS_BONUS_PER_SET = 2;
const SETS_BONUS_CAP = 200;
const DURATION_BONUS_PER_MIN = 1;
const DURATION_BONUS_CAP = 120;

const LOW_EXERCISE_THRESHOLD = 2;
const LOW_EXERCISE_REDUCTION = 0.25;
const MIN_SETS_THRESHOLD = 3;
const MIN_DURATION_THRESHOLD = 5;
const MIN_EFFORT_REDUCTION = 0.25;
const MIN_PENALTY_FLOOR = 0.5;
const LOW_EFFORT_BASE_FACTOR = 0.5;

const QUALITY_SETS_THRESHOLD = 15;
const QUALITY_DURATION_THRESHOLD = 20;
const QUALITY_BONUS = 20;

const STREAK_BONUS_PER_DAY = 5;
const STREAK_BONUS_CAP = 50;

interface FinalXPInput {
  baseXP: number;
  streakDays: number;
  meetsMinimumEffort: boolean;
}

interface FinalXPResult {
  totalXP: number;
  breakdown: {
    baseXP: number;
    streakBonus: number;
  };
}

export function calculateFinalXP(input: FinalXPInput): FinalXPResult {
  const clampedStreak = Math.max(0, input.streakDays);
  const streakBonus = input.meetsMinimumEffort
    ? Math.min(clampedStreak * STREAK_BONUS_PER_DAY, STREAK_BONUS_CAP)
    : 0;
  const totalXP = Math.max(0, Math.floor(input.baseXP + streakBonus));

  return {
    totalXP,
    breakdown: {
      baseXP: input.baseXP,
      streakBonus,
    },
  };
}

export function calculateWorkoutXP(input: XPInput): XPResult {
  const clampedSets = Math.min(Math.max(0, input.totalSets), MAX_SETS);
  const clampedDuration = Math.min(Math.max(0, input.durationMinutes), MAX_DURATION_MINUTES);

  const isLowExercise = input.exercisesCount < LOW_EXERCISE_THRESHOLD;
  const isLowEffort = clampedSets < MIN_SETS_THRESHOLD || clampedDuration < MIN_DURATION_THRESHOLD;
  const meetsMinimumEffort = !isLowEffort;

  const effectiveBase = isLowEffort ? BASE_XP * LOW_EFFORT_BASE_FACTOR : BASE_XP;

  const setsBonus = Math.min(clampedSets * SETS_BONUS_PER_SET, SETS_BONUS_CAP);
  const durationBonus = Math.min(clampedDuration * DURATION_BONUS_PER_MIN, DURATION_BONUS_CAP);

  const isQuality = clampedSets >= QUALITY_SETS_THRESHOLD && clampedDuration >= QUALITY_DURATION_THRESHOLD;
  const qualityBonus = isQuality ? QUALITY_BONUS : 0;

  let penaltyFactor = 1;
  if (isLowExercise) penaltyFactor -= LOW_EXERCISE_REDUCTION;
  if (isLowEffort) penaltyFactor -= MIN_EFFORT_REDUCTION;
  penaltyFactor = Math.max(MIN_PENALTY_FLOOR, penaltyFactor);

  const modeMultiplier = MODE_MULTIPLIERS[input.mode];
  const finalMultiplier = modeMultiplier * penaltyFactor;

  const raw = (effectiveBase + setsBonus + durationBonus + qualityBonus) * finalMultiplier;
  const xp = Math.max(MINIMUM_XP, Math.floor(raw));

  return {
    xp,
    breakdown: {
      base: effectiveBase,
      setsBonus,
      durationBonus,
      qualityBonus,
      multipliers: {
        mode: modeMultiplier,
        penaltyFactor,
        finalMultiplier,
      },
      meetsMinimumEffort,
    },
  };
}
