import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const bossEventsTable = pgTable("boss_events", {
  id: text("id").primaryKey(),
  bossKey: text("boss_key").notNull(),
  partyId: text("party_id").notNull(),
  status: text("status").notNull().default("active"),
  bossHpMax: integer("boss_hp_max").notNull(),
  bossHpCurrent: integer("boss_hp_current").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
  difficulty: text("difficulty").notNull().default("normal"),
});

export const eventContributionsTable = pgTable("event_contributions", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  characterId: text("character_id").notNull(),
  userId: text("user_id").notNull(),
  damageDealt: integer("damage_dealt").notNull().default(0),
  workoutsCount: integer("workouts_count").notNull().default(0),
  contributedAt: timestamp("contributed_at").notNull().defaultNow(),
});

export type BossEvent = typeof bossEventsTable.$inferSelect;
export type EventContribution = typeof eventContributionsTable.$inferSelect;
