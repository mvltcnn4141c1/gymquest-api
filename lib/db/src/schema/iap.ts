import { pgTable, text, integer, timestamp, uniqueIndex, boolean, index } from "drizzle-orm/pg-core";

export const iapProductsTable = pgTable("iap_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  priceUSD: integer("price_usd").notNull(),
  originalPriceUSD: integer("original_price_usd"),
  gemsAmount: integer("gems_amount").notNull().default(0),
  bonusGems: integer("bonus_gems").notNull().default(0),
  includesBattlePass: integer("includes_battle_pass").notNull().default(0),
  includesBoost: text("includes_boost"),
  includesAura: text("includes_aura"),
  tag: text("tag"),
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dailyOffersTable = pgTable("daily_offers", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  discountedPriceUSD: integer("discounted_price_usd").notNull(),
  offerDate: text("offer_date").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("daily_offers_date_idx").on(table.offerDate),
]);

export const purchaseAnalyticsTable = pgTable("purchase_analytics", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  eventType: text("event_type").notNull(),
  productId: text("product_id"),
  amountUSD: integer("amount_usd"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("purchase_analytics_user_idx").on(table.userId),
  index("purchase_analytics_event_idx").on(table.eventType),
]);

export const iapPurchasesTable = pgTable("iap_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(),
  amountUSD: integer("amount_usd").notNull(),
  gemsGranted: integer("gems_granted").notNull().default(0),
  status: text("status").notNull().default("pending"),
  idempotencyKey: text("idempotency_key"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("iap_purchases_idempotency_idx").on(table.idempotencyKey),
  uniqueIndex("iap_purchases_stripe_session_idx").on(table.stripeCheckoutSessionId),
]);

export type IapProduct = typeof iapProductsTable.$inferSelect;
export type IapPurchase = typeof iapPurchasesTable.$inferSelect;
