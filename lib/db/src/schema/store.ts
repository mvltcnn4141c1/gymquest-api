import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasesTable = pgTable("purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  itemId: text("item_id").notNull(),
  itemType: text("item_type").notNull(),
  currency: text("currency").notNull(),
  price: integer("price").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeBoostsTable = pgTable("active_boosts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  itemId: text("item_id").notNull(),
  multiplier: integer("multiplier").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ createdAt: true });
export const insertActiveBoostSchema = createInsertSchema(activeBoostsTable).omit({ createdAt: true });

export type Purchase = typeof purchasesTable.$inferSelect;
export type ActiveBoost = typeof activeBoostsTable.$inferSelect;
