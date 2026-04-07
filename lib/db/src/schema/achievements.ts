import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const characterAchievementsTable = pgTable("character_achievements", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  userId: text("user_id").notNull(),
  achievementKey: text("achievement_key").notNull(),
  unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
  xpReward: integer("xp_reward").notNull().default(0),
  coinReward: integer("coin_reward").notNull().default(0),
});

export type CharacterAchievement = typeof characterAchievementsTable.$inferSelect;
