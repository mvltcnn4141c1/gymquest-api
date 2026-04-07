import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { suspiciousActivityTable, userPenaltiesTable } from "@workspace/db/schema";
import { eq, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const XP_PER_HOUR_CAP = 2000;
const WORKOUTS_PER_HOUR_CAP = 5;
const VIOLATION_WINDOW_HOURS = 24;
const WARNING_THRESHOLD = 3;
const BLOCK_THRESHOLD = 6;
const BLOCK_DURATION_HOURS = 2;

const violationCountCache = new Map<string, { count: number; checkedAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

export async function logSuspiciousActivity(
  userId: string,
  type: string,
  severity: "warning" | "critical" | "info",
  payload: Record<string, any>,
  endpoint?: string,
) {
  try {
    const id = `sa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.insert(suspiciousActivityTable).values({
      id,
      userId,
      type,
      severity,
      payload: JSON.stringify(payload),
      endpoint: endpoint || null,
    });
    logger.warn({ userId, type, severity, endpoint }, "Suspicious activity logged");
  } catch (err) {
    logger.error({ err, userId, type }, "Failed to log suspicious activity");
  }
}

async function getRecentViolationCount(userId: string): Promise<number> {
  const cached = violationCountCache.get(userId);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.count;
  }

  const windowStart = new Date(Date.now() - VIOLATION_WINDOW_HOURS * 60 * 60 * 1000);
  const result = await db.execute(
    sql`SELECT COUNT(*)::int as cnt FROM suspicious_activity
        WHERE user_id = ${userId} AND created_at >= ${windowStart}
        AND severity IN ('warning', 'critical')`
  );
  const count = (result.rows?.[0] as any)?.cnt || 0;
  violationCountCache.set(userId, { count, checkedAt: Date.now() });
  return count;
}

async function getActivePenalty(userId: string) {
  const now = new Date();
  const penalties = await db
    .select()
    .from(userPenaltiesTable)
    .where(and(
      eq(userPenaltiesTable.userId, userId),
      gte(userPenaltiesTable.expiresAt, now),
    ))
    .limit(1);
  return penalties[0] || null;
}

async function applyPenaltyIfNeeded(userId: string, violationCount: number) {
  if (violationCount < BLOCK_THRESHOLD) return;

  const existing = await getActivePenalty(userId);
  if (existing) return;

  const id = `pen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const expiresAt = new Date(Date.now() + BLOCK_DURATION_HOURS * 60 * 60 * 1000);

  await db.insert(userPenaltiesTable).values({
    id,
    userId,
    penaltyType: "xp_block",
    reason: `${violationCount} ihlal son ${VIOLATION_WINDOW_HOURS} saatte tespit edildi`,
    xpMultiplier: 0,
    expiresAt,
  });

  await logSuspiciousActivity(userId, "penalty_applied", "critical", {
    penaltyType: "xp_block",
    violationCount,
    expiresAt: expiresAt.toISOString(),
    blockDurationHours: BLOCK_DURATION_HOURS,
  });

  logger.warn({ userId, violationCount, expiresAt }, "XP block penalty applied");
}

export function validateTimestamp(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  if (!body) { next(); return; }

  const timestampFields = ['timestamp', 'completedAt', 'startedAt'];
  const now = Date.now();
  const maxFutureMs = 5 * 60 * 1000;
  const maxPastMs = 24 * 60 * 60 * 1000;

  for (const field of timestampFields) {
    if (body[field]) {
      const ts = new Date(body[field]).getTime();
      if (isNaN(ts)) continue;

      if (ts > now + maxFutureMs) {
        const userId = (req as any).user?.id || "unknown";
        logSuspiciousActivity(userId, "future_timestamp", "warning", {
          field, value: body[field], diff: ts - now,
        }, req.path).catch(() => {});
        res.status(400).json({ error: "Gecersiz zaman damgasi: gelecek tarihi" });
        return;
      }

      if (ts < now - maxPastMs) {
        const userId = (req as any).user?.id || "unknown";
        logSuspiciousActivity(userId, "backdated_timestamp", "warning", {
          field, value: body[field], diff: now - ts,
        }, req.path).catch(() => {});
        res.status(400).json({ error: "Gecersiz zaman damgasi: cok eski" });
        return;
      }
    }
  }

  next();
}

export function validateWorkoutConsistency(req: Request, res: Response, next: NextFunction): void {
  const { sets, reps, duration, exerciseType } = req.body || {};
  if (!exerciseType) { next(); return; }

  const s = Number(sets) || 0;
  const r = Number(reps) || 0;
  const d = Number(duration) || 0;
  const userId = (req as any).user?.id || "unknown";
  const flags: string[] = [];

  if (d > 0 && d < 1 && s > 5) {
    flags.push("duration_sets_mismatch");
  }

  if (s > 30 && d < 5 && d > 0) {
    flags.push("high_sets_low_duration");
  }

  if (r > 100 && s > 10) {
    flags.push("extreme_volume");
  }

  if (s === 0 && r === 0 && d === 0) {
    flags.push("zero_effort");
  }

  if (flags.length > 0) {
    logSuspiciousActivity(userId, "workout_consistency", "warning", {
      flags, exerciseType, sets: s, reps: r, duration: d,
    }, req.path).catch(() => {});
  }

  next();
}

export async function validateUserAction(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id;
  if (!userId) { next(); return; }

  try {
    const penalty = await getActivePenalty(userId);
    if (penalty) {
      const isWorkoutEndpoint = req.path.includes("/workout") || req.path.includes("/workouts");
      if (isWorkoutEndpoint && penalty.penaltyType === "xp_block") {
        const remainingMin = Math.ceil((new Date(penalty.expiresAt).getTime() - Date.now()) / 60000);
        res.status(403).json({
          error: `XP kazanimi gecici olarak engellendi. ${remainingMin} dakika sonra tekrar deneyin.`,
          code: "XP_BLOCKED",
          reason: penalty.reason,
          expiresAt: penalty.expiresAt,
        });
        return;
      }
    }

    const violationCount = await getRecentViolationCount(userId);

    if (violationCount >= WARNING_THRESHOLD && violationCount < BLOCK_THRESHOLD) {
      (req as any).antiCheatWarning = {
        message: `${violationCount} supheli aktivite tespit edildi. Tekrarlanirsa XP kazanimi gecici olarak engellenecek.`,
        violationCount,
      };
    }

    if (violationCount >= BLOCK_THRESHOLD) {
      await applyPenaltyIfNeeded(userId, violationCount);
      const isWorkoutEndpoint = req.path.includes("/workout") || req.path.includes("/workouts");
      if (isWorkoutEndpoint) {
        res.status(403).json({
          error: `Cok fazla ihlal tespit edildi. XP kazanimi gecici olarak engellendi.`,
          code: "XP_BLOCKED",
          violationCount,
        });
        return;
      }
    }

    next();
  } catch (err) {
    logger.error({ err, userId }, "Anti-cheat validation error");
    next();
  }
}

export async function checkXpHourlyCap(userId: string): Promise<{ allowed: boolean; currentXp: number; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const result = await db.execute(
    sql`SELECT COALESCE(SUM(xp_earned), 0)::int as total_xp
        FROM workouts WHERE user_id = ${userId} AND created_at >= ${oneHourAgo}`
  );
  const currentXp = (result.rows?.[0] as any)?.total_xp || 0;
  const remaining = Math.max(0, XP_PER_HOUR_CAP - currentXp);
  return { allowed: currentXp < XP_PER_HOUR_CAP, currentXp, remaining };
}

export async function checkWorkoutHourlyCap(userId: string): Promise<{ allowed: boolean; count: number; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const result = await db.execute(
    sql`SELECT COUNT(*)::int as cnt FROM workouts WHERE user_id = ${userId} AND created_at >= ${oneHourAgo}`
  );
  const count = (result.rows?.[0] as any)?.cnt || 0;
  const remaining = Math.max(0, WORKOUTS_PER_HOUR_CAP - count);
  return { allowed: count < WORKOUTS_PER_HOUR_CAP, count, remaining };
}

export function createEndpointRateLimiter(maxPerMinute: number) {
  const store = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.resetAt < now) store.delete(k);
    }
  }, 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).user?.id;
    if (!userId) { next(); return; }

    const key = `${userId}:${req.path}`;
    const now = Date.now();

    let bucket = store.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + 60 * 1000 };
      store.set(key, bucket);
    }

    if (bucket.count >= maxPerMinute) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      logSuspiciousActivity(userId, "endpoint_rate_limit", "info", {
        endpoint: req.path, count: bucket.count, limit: maxPerMinute,
      }, req.path).catch(() => {});
      res.status(429).json({
        error: `Bu islem icin cok fazla istek. ${retryAfter} saniye bekleyin.`,
        code: "ENDPOINT_RATE_LIMIT",
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    bucket.count++;
    next();
  };
}
