import type { Request, Response, NextFunction } from "express";

interface RateBucket {
  count: number;
  resetAt: number;
}

interface UserLimits {
  minute: RateBucket;
  hour: RateBucket;
}

const store = new Map<string, UserLimits>();

const MINUTE_LIMIT = 10;
const HOUR_LIMIT = 100;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, limits] of store) {
    if (limits.minute.resetAt < now && limits.hour.resetAt < now) {
      store.delete(k);
    }
  }
}, CLEANUP_INTERVAL);

function getBucket(bucket: RateBucket, now: number, windowMs: number): RateBucket {
  if (now >= bucket.resetAt) {
    return { count: 0, resetAt: now + windowMs };
  }
  return bucket;
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as any).user?.id;
  if (!userId) {
    next();
    return;
  }

  const now = Date.now();

  let limits = store.get(userId);
  if (!limits) {
    limits = {
      minute: { count: 0, resetAt: now + MINUTE_MS },
      hour: { count: 0, resetAt: now + HOUR_MS },
    };
    store.set(userId, limits);
  }

  limits.minute = getBucket(limits.minute, now, MINUTE_MS);
  limits.hour = getBucket(limits.hour, now, HOUR_MS);

  if (limits.minute.count >= MINUTE_LIMIT) {
    const retryAfter = Math.ceil((limits.minute.resetAt - now) / 1000);
    res.status(429).json({
      error: `Cok fazla istek. ${retryAfter} saniye bekleyin.`,
      code: "RATE_LIMIT_MINUTE",
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  if (limits.hour.count >= HOUR_LIMIT) {
    const retryAfter = Math.ceil((limits.hour.resetAt - now) / 1000);
    res.status(429).json({
      error: `Saatlik istek limiti asildi. ${Math.ceil(retryAfter / 60)} dakika bekleyin.`,
      code: "RATE_LIMIT_HOUR",
      retryAfterSeconds: retryAfter,
    });
    return;
  }

  limits.minute.count++;
  limits.hour.count++;
  next();
}
