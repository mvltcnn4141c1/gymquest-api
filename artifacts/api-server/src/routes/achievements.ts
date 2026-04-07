import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { characterAchievementsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ACHIEVEMENT_MAP, ACHIEVEMENTS } from "../constants/achievements.js";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

router.get("/achievements", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const earned = await db
    .select()
    .from(characterAchievementsTable)
    .where(eq(characterAchievementsTable.userId, userId));

  const earnedKeys = new Set(earned.map((a) => a.achievementKey));

  const all = ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: earnedKeys.has(def.key),
    unlockedAt: earned.find((e) => e.achievementKey === def.key)?.unlockedAt || null,
  }));

  res.json({ achievements: all, earnedCount: earned.length, totalCount: ACHIEVEMENTS.length });
});

export default router;
