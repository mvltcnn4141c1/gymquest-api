import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const seasonsTable = pgTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  maxLevel: integer("max_level").notNull().default(50),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userBattlePassTable = pgTable("user_battle_pass", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  seasonId: text("season_id").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  currentXp: integer("current_xp").notNull().default(0),
  totalXpEarned: integer("total_xp_earned").notNull().default(0),
  hasPremium: boolean("has_premium").notNull().default(false),
  premiumPurchasedAt: timestamp("premium_purchased_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const battlePassClaimsTable = pgTable("battle_pass_claims", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  seasonId: text("season_id").notNull(),
  level: integer("level").notNull(),
  track: text("track").notNull(),
  rewardType: text("reward_type").notNull(),
  rewardAmount: integer("reward_amount").notNull(),
  rewardItemId: text("reward_item_id"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export type Season = typeof seasonsTable.$inferSelect;
export type UserBattlePass = typeof userBattlePassTable.$inferSelect;
export type BattlePassClaim = typeof battlePassClaimsTable.$inferSelect;
