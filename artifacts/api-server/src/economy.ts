import { db } from "@workspace/db";
import { dailyEconomyTable, charactersTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

const DAILY_COIN_CAP = 2000;
const DAILY_GEM_CAP = 20;

const LEVEL_COIN_SCALING_START = 30;
const LEVEL_COIN_SCALING_FACTOR = 0.007;

const HOARD_COIN_THRESHOLD = 50000;
const HOARD_COIN_REDUCTION = 0.15;
const HOARD_GEM_THRESHOLD = 500;
const HOARD_GEM_REDUCTION = 0.20;

const LOW_EFFORT_XP_THRESHOLD = 30;
const LOW_EFFORT_COIN_PENALTY = 0.5;

export interface EconomyResult {
  coins: number;
  gems: number;
  xp: number;
  reductions: string[];
  dailyCoinsEarned: number;
  dailyGemsEarned: number;
  dailyCoinCap: number;
  dailyGemCap: number;
  coinCapReached: boolean;
  gemCapReached: boolean;
}

function getLocalDateStr(utcDate: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(utcDate);
  } catch {
    const offset = 3 * 60 * 60 * 1000;
    const local = new Date(utcDate.getTime() + offset);
    return local.toISOString().slice(0, 10);
  }
}

async function atomicAddAndCap(
  userId: string,
  dateStr: string,
  coinsDelta: number,
  gemsDelta: number,
  xpDelta: number,
  workoutDelta: number
): Promise<{ newCoinsEarned: number; newGemsEarned: number; actualCoinsAdded: number; actualGemsAdded: number }> {
  const id = `econ_${userId.slice(0, 12)}_${dateStr}_${Math.random().toString(36).substr(2, 6)}`;

  const rows = await db.execute(
    sql`INSERT INTO daily_economy (id, user_id, economy_date, coins_earned, gems_earned, xp_earned, workout_count, updated_at)
        VALUES (${id}, ${userId}, ${dateStr},
          LEAST(${coinsDelta}, ${DAILY_COIN_CAP}),
          LEAST(${gemsDelta}, ${DAILY_GEM_CAP}),
          ${xpDelta}, ${workoutDelta}, NOW())
        ON CONFLICT (user_id, economy_date) DO UPDATE SET
          coins_earned = LEAST(daily_economy.coins_earned + ${coinsDelta}, ${DAILY_COIN_CAP}),
          gems_earned = LEAST(daily_economy.gems_earned + ${gemsDelta}, ${DAILY_GEM_CAP}),
          xp_earned = daily_economy.xp_earned + ${xpDelta},
          workout_count = daily_economy.workout_count + ${workoutDelta},
          updated_at = NOW()
        RETURNING coins_earned, gems_earned`
  );

  const row = rows.rows?.[0] as any;
  const newCoinsEarned = row?.coins_earned ?? coinsDelta;
  const newGemsEarned = row?.gems_earned ?? gemsDelta;

  const prevCoins = newCoinsEarned - Math.min(coinsDelta, DAILY_COIN_CAP - Math.max(0, newCoinsEarned - coinsDelta));
  const actualCoinsAdded = newCoinsEarned - Math.max(0, prevCoins);
  const prevGems = newGemsEarned - Math.min(gemsDelta, DAILY_GEM_CAP - Math.max(0, newGemsEarned - gemsDelta));
  const actualGemsAdded = newGemsEarned - Math.max(0, prevGems);

  return {
    newCoinsEarned,
    newGemsEarned,
    actualCoinsAdded: Math.min(coinsDelta, Math.max(0, actualCoinsAdded)),
    actualGemsAdded: Math.min(gemsDelta, Math.max(0, actualGemsAdded)),
  };
}

function calcLevelCoinScaling(level: number): number {
  if (level < LEVEL_COIN_SCALING_START) return 1;
  const reduction = (level - LEVEL_COIN_SCALING_START) * LEVEL_COIN_SCALING_FACTOR;
  return Math.max(0.5, 1 - reduction);
}

function calcHoardReduction(
  currentCoins: number,
  currentGems: number
): { coinMult: number; gemMult: number; reasons: string[] } {
  const reasons: string[] = [];
  let coinMult = 1;
  let gemMult = 1;

  if (currentCoins > HOARD_COIN_THRESHOLD) {
    coinMult = 1 - HOARD_COIN_REDUCTION;
    reasons.push(`Yuksek coin bakiyesi — odul %${Math.round(HOARD_COIN_REDUCTION * 100)} azaltildi`);
  }
  if (currentGems > HOARD_GEM_THRESHOLD) {
    gemMult = 1 - HOARD_GEM_REDUCTION;
    reasons.push(`Yuksek gem bakiyesi — odul %${Math.round(HOARD_GEM_REDUCTION * 100)} azaltildi`);
  }

  return { coinMult, gemMult, reasons };
}

function applyScalingAndHoarding(
  coins: number,
  gems: number,
  charLevel: number,
  currentCoins: number,
  currentGems: number,
  reductions: string[]
): { coins: number; gems: number } {
  const levelScale = calcLevelCoinScaling(charLevel);
  if (levelScale < 1 && coins > 0) {
    coins = Math.max(1, Math.floor(coins * levelScale));
    reductions.push(`Seviye ${charLevel} olceklemesi — coin %${Math.round((1 - levelScale) * 100)} azaltildi`);
  }

  const hoard = calcHoardReduction(currentCoins, currentGems);
  if (hoard.coinMult < 1 && coins > 0) {
    coins = Math.max(1, Math.floor(coins * hoard.coinMult));
    reductions.push(...hoard.reasons.filter((r) => r.includes("coin")));
  }
  if (hoard.gemMult < 1 && gems > 0) {
    gems = Math.max(1, Math.floor(gems * hoard.gemMult));
    reductions.push(...hoard.reasons.filter((r) => r.includes("gem")));
  }

  return { coins, gems };
}

export async function processWorkoutReward(
  userId: string,
  rawCoins: number,
  rawXp: number,
  charLevel: number,
  currentCoins: number,
  currentGems: number,
  timezone: string
): Promise<EconomyResult> {
  const now = new Date();
  const dateStr = getLocalDateStr(now, timezone);
  const reductions: string[] = [];

  let coins = rawCoins;

  if (rawXp > 0 && rawXp < LOW_EFFORT_XP_THRESHOLD && coins > 0) {
    coins = Math.max(1, Math.floor(coins * LOW_EFFORT_COIN_PENALTY));
    if (coins < rawCoins) reductions.push("Dusuk efor — coin azaltildi");
  }

  const scaled = applyScalingAndHoarding(coins, 0, charLevel, currentCoins, currentGems, reductions);
  coins = scaled.coins;

  coins = Math.max(coins > 0 ? 1 : 0, coins);

  const result = await atomicAddAndCap(userId, dateStr, coins, 0, rawXp, 1);

  const actualCoins = Math.min(coins, result.actualCoinsAdded);
  if (actualCoins < coins) {
    if (actualCoins === 0) reductions.push("Gunluk coin limiti doldu");
    else reductions.push(`Gunluk coin limiti — ${actualCoins} coin verildi`);
  }

  return {
    coins: actualCoins,
    gems: 0,
    xp: rawXp,
    reductions,
    dailyCoinsEarned: result.newCoinsEarned,
    dailyGemsEarned: result.newGemsEarned,
    dailyCoinCap: DAILY_COIN_CAP,
    dailyGemCap: DAILY_GEM_CAP,
    coinCapReached: result.newCoinsEarned >= DAILY_COIN_CAP,
    gemCapReached: false,
  };
}

export async function processQuestReward(
  userId: string,
  rawCoins: number,
  rawGems: number,
  rawXp: number,
  currentCoins: number,
  currentGems: number,
  timezone: string
): Promise<EconomyResult> {
  const now = new Date();
  const dateStr = getLocalDateStr(now, timezone);
  const reductions: string[] = [];

  const scaled = applyScalingAndHoarding(rawCoins, rawGems, 0, currentCoins, currentGems, reductions);
  let coins = scaled.coins;
  let gems = scaled.gems;

  const result = await atomicAddAndCap(userId, dateStr, coins, gems, rawXp, 0);

  const actualCoins = Math.min(coins, result.actualCoinsAdded);
  const actualGems = Math.min(gems, result.actualGemsAdded);

  if (actualCoins < coins) {
    if (actualCoins === 0) reductions.push("Gunluk coin limiti doldu");
    else reductions.push(`Gunluk coin limiti — ${actualCoins} coin verildi`);
  }
  if (actualGems < gems) {
    if (actualGems === 0) reductions.push("Gunluk gem limiti doldu");
    else reductions.push(`Gunluk gem limiti — ${actualGems} gem verildi`);
  }

  return {
    coins: actualCoins,
    gems: actualGems,
    xp: rawXp,
    reductions,
    dailyCoinsEarned: result.newCoinsEarned,
    dailyGemsEarned: result.newGemsEarned,
    dailyCoinCap: DAILY_COIN_CAP,
    dailyGemCap: DAILY_GEM_CAP,
    coinCapReached: result.newCoinsEarned >= DAILY_COIN_CAP,
    gemCapReached: result.newGemsEarned >= DAILY_GEM_CAP,
  };
}

export async function processBattlePassReward(
  userId: string,
  rawCoins: number,
  rawGems: number,
  currentCoins: number,
  currentGems: number,
  timezone: string
): Promise<EconomyResult> {
  const now = new Date();
  const dateStr = getLocalDateStr(now, timezone);
  const reductions: string[] = [];

  const scaled = applyScalingAndHoarding(rawCoins, rawGems, 0, currentCoins, currentGems, reductions);
  let coins = scaled.coins;
  let gems = scaled.gems;

  const result = await atomicAddAndCap(userId, dateStr, coins, gems, 0, 0);

  const actualCoins = Math.min(coins, result.actualCoinsAdded);
  const actualGems = Math.min(gems, result.actualGemsAdded);

  if (actualCoins < coins) {
    if (actualCoins === 0) reductions.push("Gunluk coin limiti doldu");
    else reductions.push(`Gunluk coin limiti — ${actualCoins} coin verildi`);
  }
  if (actualGems < gems) {
    if (actualGems === 0) reductions.push("Gunluk gem limiti doldu");
    else reductions.push(`Gunluk gem limiti — ${actualGems} gem verildi`);
  }

  return {
    coins: actualCoins,
    gems: actualGems,
    xp: 0,
    reductions,
    dailyCoinsEarned: result.newCoinsEarned,
    dailyGemsEarned: result.newGemsEarned,
    dailyCoinCap: DAILY_COIN_CAP,
    dailyGemCap: DAILY_GEM_CAP,
    coinCapReached: result.newCoinsEarned >= DAILY_COIN_CAP,
    gemCapReached: result.newGemsEarned >= DAILY_GEM_CAP,
  };
}

export async function getEconomyStatus(userId: string, timezone: string) {
  const now = new Date();
  const dateStr = getLocalDateStr(now, timezone);

  const [dailyRec] = await db
    .select()
    .from(dailyEconomyTable)
    .where(
      and(
        eq(dailyEconomyTable.userId, userId),
        eq(dailyEconomyTable.economyDate, dateStr)
      )
    );

  return {
    date: dateStr,
    coinsEarned: dailyRec?.coinsEarned ?? 0,
    gemsEarned: dailyRec?.gemsEarned ?? 0,
    xpEarned: dailyRec?.xpEarned ?? 0,
    workoutCount: dailyRec?.workoutCount ?? 0,
    coinCap: DAILY_COIN_CAP,
    gemCap: DAILY_GEM_CAP,
    coinCapReached: (dailyRec?.coinsEarned ?? 0) >= DAILY_COIN_CAP,
    gemCapReached: (dailyRec?.gemsEarned ?? 0) >= DAILY_GEM_CAP,
    coinCapRemaining: Math.max(0, DAILY_COIN_CAP - (dailyRec?.coinsEarned ?? 0)),
    gemCapRemaining: Math.max(0, DAILY_GEM_CAP - (dailyRec?.gemsEarned ?? 0)),
  };
}
