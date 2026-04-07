import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const dailyEconomyTable = pgTable("daily_economy", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  economyDate: text("economy_date").notNull(),
  coinsEarned: integer("coins_earned").notNull().default(0),
  gemsEarned: integer("gems_earned").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  workoutCount: integer("workout_count").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_economy_user_date_idx").on(table.userId, table.economyDate),
]);

export type DailyEconomy = typeof dailyEconomyTable.$inferSelect;
