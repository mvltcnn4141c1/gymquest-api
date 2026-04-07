import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const suspiciousActivityTable = pgTable("suspicious_activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("warning"),
  payload: text("payload"),
  endpoint: text("endpoint"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("suspicious_activity_user_idx").on(table.userId),
  index("suspicious_activity_type_idx").on(table.type),
  index("suspicious_activity_created_idx").on(table.createdAt),
]);

export const userPenaltiesTable = pgTable("user_penalties", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  penaltyType: text("penalty_type").notNull(),
  reason: text("reason").notNull(),
  xpMultiplier: integer("xp_multiplier").notNull().default(100),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("user_penalties_user_idx").on(table.userId),
  index("user_penalties_expires_idx").on(table.expiresAt),
]);

export type SuspiciousActivity = typeof suspiciousActivityTable.$inferSelect;
export type UserPenalty = typeof userPenaltiesTable.$inferSelect;
