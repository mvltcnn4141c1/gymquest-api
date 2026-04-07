import { pgTable, text, integer, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

export const referralsTable = pgTable("referrals", {
  id: text("id").primaryKey(),
  referrerId: text("referrer_id").notNull(),
  referredUserId: text("referred_user_id").notNull(),
  referralCode: text("referral_code").notNull(),
  referrerRewardGems: integer("referrer_reward_gems").notNull().default(10),
  referredRewardGems: integer("referred_reward_gems").notNull().default(5),
  referredRewardCoins: integer("referred_reward_coins").notNull().default(500),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("referrals_referred_user_idx").on(table.referredUserId),
]);

export const friendsTable = pgTable("friends", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  friendId: text("friend_id").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("friends_pair_idx").on(table.userId, table.friendId),
]);

export const challengesTable = pgTable("challenges", {
  id: text("id").primaryKey(),
  challengerId: text("challenger_id").notNull(),
  challengedId: text("challenged_id").notNull(),
  type: text("type").notNull().default("weekly_xp"),
  status: text("status").notNull().default("pending"),
  challengerScore: integer("challenger_score").notNull().default(0),
  challengedScore: integer("challenged_score").notNull().default(0),
  winnerId: text("winner_id"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaderboardSnapshotsTable = pgTable("leaderboard_snapshots", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekKey: text("week_key").notNull(),
  weeklyXp: integer("weekly_xp").notNull().default(0),
  rank: integer("rank"),
  snapshotAt: timestamp("snapshot_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lb_snapshot_user_week_idx").on(table.userId, table.weekKey),
]);

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
export type Friend = typeof friendsTable.$inferSelect;
export type Challenge = typeof challengesTable.$inferSelect;
export type LeaderboardSnapshot = typeof leaderboardSnapshotsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
