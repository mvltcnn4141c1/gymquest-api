import { pgTable, text, integer, timestamp, boolean, index, unique } from "drizzle-orm/pg-core";

export const dailyRewardsTable = pgTable("daily_rewards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  claimDate: text("claim_date").notNull(),
  streakDay: integer("streak_day").notNull().default(1),
  xpReward: integer("xp_reward").notNull().default(0),
  coinReward: integer("coin_reward").notNull().default(0),
  gemReward: integer("gem_reward").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("daily_rewards_user_date_uq").on(table.userId, table.claimDate),
  index("daily_rewards_user_idx").on(table.userId),
]);

export const weeklyActivityTable = pgTable("weekly_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekStart: text("week_start").notNull(),
  daysActive: integer("days_active").notNull().default(0),
  activeDays: text("active_days").notNull().default("[]"),
  chestClaimed: boolean("chest_claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("weekly_activity_user_week_uq").on(table.userId, table.weekStart),
  index("weekly_activity_user_idx").on(table.userId),
]);

export const comebackRewardsTable = pgTable("comeback_rewards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  inactiveHours: integer("inactive_hours").notNull(),
  xpReward: integer("xp_reward").notNull().default(0),
  coinReward: integer("coin_reward").notNull().default(0),
  gemReward: integer("gem_reward").notNull().default(0),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
}, (table) => [
  index("comeback_rewards_user_idx").on(table.userId),
]);

export type DailyReward = typeof dailyRewardsTable.$inferSelect;
export type WeeklyActivity = typeof weeklyActivityTable.$inferSelect;
export type ComebackReward = typeof comebackRewardsTable.$inferSelect;
