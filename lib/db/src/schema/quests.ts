import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questsTable = pgTable("quests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  exerciseType: text("exercise_type").notNull(),
  targetReps: integer("target_reps").notNull(),
  xpReward: integer("xp_reward").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userQuestsTable = pgTable("user_quests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questId: text("quest_id").notNull(),
  currentProgress: integer("current_progress").notNull().default(0),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertQuestSchema = createInsertSchema(questsTable).omit({
  createdAt: true,
});

export type InsertQuest = z.infer<typeof insertQuestSchema>;
export type Quest = typeof questsTable.$inferSelect;
export type UserQuest = typeof userQuestsTable.$inferSelect;
