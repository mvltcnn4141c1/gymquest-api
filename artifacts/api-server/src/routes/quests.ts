import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { questsTable, userQuestsTable, charactersTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { calcExpToNextLevel, calcStats, processLevelUp } from "./character.js";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

const QUEST_TEMPLATES = [
  {
    title: "Iron Will",
    description: "Complete 50 push-ups",
    type: "daily",
    exerciseType: "push_up",
    targetReps: 50,
    xpReward: 200,
  },
  {
    title: "Squat Champion",
    description: "Do 30 squats",
    type: "daily",
    exerciseType: "squat",
    targetReps: 30,
    xpReward: 150,
  },
  {
    title: "Pull-up Master",
    description: "Complete 20 pull-ups",
    type: "daily",
    exerciseType: "pull_up",
    targetReps: 20,
    xpReward: 300,
  },
  {
    title: "Endurance Runner",
    description: "Run for 30 minutes",
    type: "weekly",
    exerciseType: "running",
    targetReps: 30,
    xpReward: 500,
  },
  {
    title: "Plank Warrior",
    description: "Hold plank for 3 minutes",
    type: "daily",
    exerciseType: "plank",
    targetReps: 3,
    xpReward: 120,
  },
  {
    title: "Burpee Beast",
    description: "Complete 15 burpees",
    type: "daily",
    exerciseType: "burpee",
    targetReps: 15,
    xpReward: 250,
  },
];

async function seedQuests() {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const existingQuests = await db
    .select()
    .from(questsTable)
    .where(gt(questsTable.expiresAt, now));

  if (existingQuests.length === 0) {
    for (const template of QUEST_TEMPLATES) {
      const id = `quest_${template.exerciseType}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const expiresAt = template.type === "weekly" ? endOfWeek : endOfDay;
      await db.insert(questsTable).values({
        id,
        ...template,
        expiresAt,
      });
    }
  }
}

router.get("/quests", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  await seedQuests();

  const now = new Date();
  const activeQuests = await db
    .select()
    .from(questsTable)
    .where(gt(questsTable.expiresAt, now));

  const userQuestData = await db
    .select()
    .from(userQuestsTable)
    .where(eq(userQuestsTable.userId, userId));

  const userQuestMap = new Map(userQuestData.map((uq) => [uq.questId, uq]));

  const quests = activeQuests.map((q) => {
    const uq = userQuestMap.get(q.id);
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      type: q.type,
      exerciseType: q.exerciseType,
      targetReps: q.targetReps,
      currentProgress: uq?.currentProgress || 0,
      xpReward: q.xpReward,
      isCompleted: uq?.isCompleted || false,
      expiresAt: q.expiresAt.toISOString(),
    };
  });

  res.json(quests);
});

router.post("/quests/:questId/complete", authenticateUser, async (req, res) => {
  const { questId } = req.params;
  const userId = req.user!.id;

  const [quest] = await db
    .select()
    .from(questsTable)
    .where(eq(questsTable.id, questId));

  if (!quest) {
    res.status(404).json({ error: "Quest not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(userQuestsTable)
    .where(and(eq(userQuestsTable.userId, userId), eq(userQuestsTable.questId, questId)));

  if (existing?.isCompleted) {
    res.status(400).json({ error: "Quest already completed" });
    return;
  }

  const id = `uq_${userId}_${questId}_${Date.now()}`;
  if (existing) {
    await db
      .update(userQuestsTable)
      .set({ isCompleted: true, completedAt: new Date(), currentProgress: quest.targetReps })
      .where(eq(userQuestsTable.id, existing.id));
  } else {
    await db.insert(userQuestsTable).values({
      id,
      userId,
      questId,
      currentProgress: quest.targetReps,
      isCompleted: true,
      completedAt: new Date(),
    });
  }

  const [char] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  let updatedChar = char;
  if (char) {
    const lv = processLevelUp(char.exp, char.level, quest.xpReward);
    const stats = calcStats(lv.newLevel, char.class);
    const [updated] = await db
      .update(charactersTable)
      .set({
        exp: lv.newExp,
        level: lv.newLevel,
        totalExp: char.totalExp + quest.xpReward,
        totalXpEarned: char.totalXpEarned + quest.xpReward,
        ...stats,
        updatedAt: new Date(),
      })
      .where(eq(charactersTable.userId, userId))
      .returning();
    updatedChar = updated;
  }

  const expToNextLevel = calcExpToNextLevel(updatedChar?.level || 1);

  res.json({
    quest: {
      ...quest,
      currentProgress: quest.targetReps,
      isCompleted: true,
      expiresAt: quest.expiresAt.toISOString(),
    },
    xpEarned: quest.xpReward,
    character: updatedChar ? { ...updatedChar, expToNextLevel } : null,
  });
});

export default router;
