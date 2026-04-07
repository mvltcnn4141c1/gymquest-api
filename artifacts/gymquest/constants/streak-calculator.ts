interface StreakInput {
  lastWorkoutAt: Date | null;
  currentStreak: number;
  now: Date;
}

interface StreakDebug {
  elapsedHours: number;
}

interface StreakResult {
  newStreak: number;
  streakContinued: boolean;
  streakBroken: boolean;
  debug: StreakDebug;
}

const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_24 = 24 * MS_PER_HOUR;
const HOURS_48 = 48 * MS_PER_HOUR;
const HOURS_72 = 72 * MS_PER_HOUR;

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function updateStreak(input: StreakInput): StreakResult {
  const { lastWorkoutAt, currentStreak, now } = input;

  const unchanged = (elapsedHours: number): StreakResult => ({
    newStreak: currentStreak,
    streakContinued: false,
    streakBroken: false,
    debug: { elapsedHours },
  });

  if (!lastWorkoutAt) {
    return { newStreak: 1, streakContinued: false, streakBroken: false, debug: { elapsedHours: 0 } };
  }

  const rawElapsed = now.getTime() - new Date(lastWorkoutAt).getTime();

  if (rawElapsed < 0) {
    return unchanged(0);
  }

  const elapsed = Math.max(0, rawElapsed);
  const elapsedHours = parseFloat((elapsed / MS_PER_HOUR).toFixed(2));

  if (elapsed < HOURS_24) {
    return unchanged(elapsedHours);
  }

  if (elapsed < HOURS_48) {
    return { newStreak: currentStreak + 1, streakContinued: true, streakBroken: false, debug: { elapsedHours } };
  }

  if (elapsed < HOURS_72) {
    return unchanged(elapsedHours);
  }

  return { newStreak: 1, streakContinued: false, streakBroken: true, debug: { elapsedHours } };
}
