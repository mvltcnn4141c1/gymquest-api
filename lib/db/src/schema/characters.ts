import { pgTable, text, integer, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charactersTable = pgTable("characters", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  name: text("name").notNull(),
  class: text("class").notNull(),
  level: integer("level").notNull().default(1),
  exp: integer("exp").notNull().default(0),
  totalExp: integer("total_exp").notNull().default(0),
  region: text("region").notNull().default("global"),
  strength: integer("strength").notNull().default(10),
  agility: integer("agility").notNull().default(10),
  endurance: integer("endurance").notNull().default(10),
  totalWorkouts: integer("total_workouts").notNull().default(0),
  totalXpEarned: integer("total_xp_earned").notNull().default(0),
  totalCalories: integer("total_calories").notNull().default(0),
  league: text("league").notNull().default("demir"),
  questStreak: integer("quest_streak").notNull().default(0),
  streakActiveUntil: timestamp("streak_active_until"),
  lastDailyBonusDate: text("last_daily_bonus_date"),
  race: text("race").notNull().default("yuce_insan"),
  gymCoins: integer("gym_coins").notNull().default(0),
  gems: integer("gems").notNull().default(0),
  equippedAura: text("equipped_aura"),
  streakDays: integer("streak_days").notNull().default(0),
  lastWorkoutAt: timestamp("last_workout_at"),
  lastStreakDate: text("last_streak_date"),
  timezone: text("timezone").notNull().default("Europe/Istanbul"),
  hasAcceptedDisclaimer: boolean("has_accepted_disclaimer").notNull().default(false),
  dailyRewardStreak: integer("daily_reward_streak").notNull().default(0),
  lastDailyRewardDate: text("last_daily_reward_date"),
  lastComebackClaimAt: timestamp("last_comeback_claim_at"),
  notifyMissedWorkout: boolean("notify_missed_workout").notNull().default(false),
  notifyStreakBreaking: boolean("notify_streak_breaking").notNull().default(false),
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  referralCount: integer("referral_count").notNull().default(0),
  friendCode: text("friend_code").unique(),
  weeklyXp: integer("weekly_xp").notNull().default(0),
  weeklyXpResetAt: timestamp("weekly_xp_reset_at"),
  hasPurchased: boolean("has_purchased").notNull().default(false),
  exclusiveBadge: text("exclusive_badge"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCharacterSchema = createInsertSchema(charactersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type Character = typeof charactersTable.$inferSelect;
