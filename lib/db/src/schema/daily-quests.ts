import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyQuestsTable = pgTable("daily_quests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  questDate: text("quest_date").notNull(),
  difficulty: text("difficulty").notNull().default("easy"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  goalType: text("goal_type").notNull(),
  targetValue: integer("target_value").notNull(),
  currentProgress: integer("current_progress").notNull().default(0),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  isClaimed: boolean("is_claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  xpReward: integer("xp_reward").notNull(),
  coinReward: integer("coin_reward").notNull().default(0),
  gemReward: integer("gem_reward").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDailyQuestSchema = createInsertSchema(dailyQuestsTable).omit({
  createdAt: true,
});

export type InsertDailyQuest = z.infer<typeof insertDailyQuestSchema>;
export type DailyQuest = typeof dailyQuestsTable.$inferSelect;
