import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const partiesTable = pgTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  leaderId: text("leader_id").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  totalXp: integer("total_xp").notNull().default(0),
  league: text("league").notNull().default("demir"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partyMembersTable = pgTable("party_members", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull(),
  characterId: text("character_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export type Party = typeof partiesTable.$inferSelect;
export type PartyMember = typeof partyMembersTable.$inferSelect;
