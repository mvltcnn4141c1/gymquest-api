import { pgTable, text, timestamp, index, jsonb, serial } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventName: text("event_name").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("analytics_events_event_name_idx").on(table.eventName),
  index("analytics_events_user_id_idx").on(table.userId),
  index("analytics_events_created_at_idx").on(table.createdAt),
  index("analytics_events_user_event_idx").on(table.userId, table.eventName),
]);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
