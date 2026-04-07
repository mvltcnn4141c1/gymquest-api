import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";

const router = Router();

router.get("/analytics/summary", authenticateUser, async (req, res) => {
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return res.status(403).json({ error: "Yetkisiz erisim" });
  }

  try {
    const totalUsersR = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE event_name = 'user_signup'`);
    const activeUsersR = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE created_at > NOW() - INTERVAL '24 hours'`);
    const workoutsR = await db.execute(sql`SELECT COUNT(*) as cnt FROM analytics_events WHERE event_name = 'workout_completed'`);
    const totalXpR = await db.execute(sql`SELECT COALESCE(SUM((payload->>'xp')::numeric), 0) as total FROM analytics_events WHERE event_name = 'xp_gained'`);
    const purchasesR = await db.execute(sql`SELECT COUNT(*) as cnt FROM analytics_events WHERE event_name = 'purchase_completed'`);
    const revenueR = await db.execute(sql`SELECT COALESCE(SUM((payload->>'amountUSD')::numeric), 0) as total FROM analytics_events WHERE event_name = 'purchase_completed'`);

    res.json({
      totalUsers: Number((totalUsersR.rows?.[0] as any)?.cnt || 0),
      activeUsers24h: Number((activeUsersR.rows?.[0] as any)?.cnt || 0),
      workoutsCompleted: Number((workoutsR.rows?.[0] as any)?.cnt || 0),
      totalXpGenerated: Number((totalXpR.rows?.[0] as any)?.total || 0),
      totalPurchases: Number((purchasesR.rows?.[0] as any)?.cnt || 0),
      revenueUSD: Number((revenueR.rows?.[0] as any)?.total || 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Analiz verisi alinamadi" });
  }
});

router.get("/analytics/funnel", authenticateUser, async (req, res) => {
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return res.status(403).json({ error: "Yetkisiz erisim" });
  }

  try {
    const signupR = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE event_name = 'user_signup'`);
    const firstWorkoutR = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as cnt FROM (
        SELECT user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
        FROM analytics_events WHERE event_name = 'workout_completed'
      ) sub WHERE rn = 1
    `);
    const secondWorkoutR = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id) as cnt FROM (
        SELECT user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as rn
        FROM analytics_events WHERE event_name = 'workout_completed'
      ) sub WHERE rn = 2
    `);
    const purchaseR = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE event_name = 'purchase_completed'`);

    const signups = Number((signupR.rows?.[0] as any)?.cnt || 0);
    const firstWorkout = Number((firstWorkoutR.rows?.[0] as any)?.cnt || 0);
    const secondWorkout = Number((secondWorkoutR.rows?.[0] as any)?.cnt || 0);
    const purchasers = Number((purchaseR.rows?.[0] as any)?.cnt || 0);

    res.json({
      steps: [
        { step: "signup", count: signups, rate: 1 },
        { step: "first_workout", count: firstWorkout, rate: signups > 0 ? +(firstWorkout / signups).toFixed(4) : 0 },
        { step: "second_workout", count: secondWorkout, rate: signups > 0 ? +(secondWorkout / signups).toFixed(4) : 0 },
        { step: "purchase", count: purchasers, rate: signups > 0 ? +(purchasers / signups).toFixed(4) : 0 },
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Funnel verisi alinamadi" });
  }
});

router.get("/analytics/top-products", authenticateUser, async (req, res) => {
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return res.status(403).json({ error: "Yetkisiz erisim" });
  }

  try {
    const topR = await db.execute(sql`
      SELECT
        payload->>'productId' as product_id,
        COUNT(*) as purchase_count,
        COALESCE(SUM((payload->>'amountUSD')::numeric), 0) as revenue
      FROM analytics_events
      WHERE event_name = 'purchase_completed' AND payload->>'productId' IS NOT NULL
      GROUP BY payload->>'productId'
      ORDER BY purchase_count DESC
      LIMIT 10
    `);

    res.json({
      products: (topR.rows || []).map((r: any) => ({
        productId: r.product_id,
        purchaseCount: Number(r.purchase_count),
        revenueUSD: Number(r.revenue),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Urun verisi alinamadi" });
  }
});

router.get("/analytics/retention", authenticateUser, async (req, res) => {
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return res.status(403).json({ error: "Yetkisiz erisim" });
  }

  try {
    const totalSignupsR = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE event_name = 'user_signup'`);
    const totalSignups = Number((totalSignupsR.rows?.[0] as any)?.cnt || 0);

    const day1R = await db.execute(sql`
      SELECT COUNT(DISTINCT ae.user_id) as cnt
      FROM analytics_events ae
      INNER JOIN (
        SELECT user_id, MIN(created_at) as signup_at
        FROM analytics_events WHERE event_name = 'user_signup'
        GROUP BY user_id
      ) s ON ae.user_id = s.user_id
      WHERE ae.event_name != 'user_signup'
        AND ae.created_at >= s.signup_at + INTERVAL '1 day'
        AND ae.created_at < s.signup_at + INTERVAL '2 days'
    `);

    const day3R = await db.execute(sql`
      SELECT COUNT(DISTINCT ae.user_id) as cnt
      FROM analytics_events ae
      INNER JOIN (
        SELECT user_id, MIN(created_at) as signup_at
        FROM analytics_events WHERE event_name = 'user_signup'
        GROUP BY user_id
      ) s ON ae.user_id = s.user_id
      WHERE ae.event_name != 'user_signup'
        AND ae.created_at >= s.signup_at + INTERVAL '3 days'
        AND ae.created_at < s.signup_at + INTERVAL '4 days'
    `);

    const day7R = await db.execute(sql`
      SELECT COUNT(DISTINCT ae.user_id) as cnt
      FROM analytics_events ae
      INNER JOIN (
        SELECT user_id, MIN(created_at) as signup_at
        FROM analytics_events WHERE event_name = 'user_signup'
        GROUP BY user_id
      ) s ON ae.user_id = s.user_id
      WHERE ae.event_name != 'user_signup'
        AND ae.created_at >= s.signup_at + INTERVAL '7 days'
        AND ae.created_at < s.signup_at + INTERVAL '8 days'
    `);

    const d1 = Number((day1R.rows?.[0] as any)?.cnt || 0);
    const d3 = Number((day3R.rows?.[0] as any)?.cnt || 0);
    const d7 = Number((day7R.rows?.[0] as any)?.cnt || 0);

    res.json({
      totalSignups,
      day1: { retained: d1, rate: totalSignups > 0 ? +(d1 / totalSignups).toFixed(4) : 0 },
      day3: { retained: d3, rate: totalSignups > 0 ? +(d3 / totalSignups).toFixed(4) : 0 },
      day7: { retained: d7, rate: totalSignups > 0 ? +(d7 / totalSignups).toFixed(4) : 0 },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Retention verisi alinamadi" });
  }
});

export default router;
