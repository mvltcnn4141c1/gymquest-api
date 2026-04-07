import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const authTokensTable = pgTable("auth_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuthToken = typeof authTokensTable.$inferSelect;
