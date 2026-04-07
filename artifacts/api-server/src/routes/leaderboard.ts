import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  charactersTable,
  partiesTable,
  partyMembersTable,
  characterAchievementsTable,
  leaderboardSnapshotsTable,
} from "@workspace/db/schema";
import { desc, inArray, eq, sql } from "drizzle-orm";
import { calcLeague } from "./character.js";
import { calcPartyLeague } from "./party.js";
import { ACHIEVEMENT_MAP } from "../constants/achievements.js";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

function getLeagueName(league: string): string {
  const names: Record<string, string> = {
    demir: "Demir", bronz: "Bronz", gumus: "Gümüş",
    altin: "Altın", platin: "Platin", sampiyonluk: "Şampiyonluk",
  };
  return names[league] || "Demir";
}

function getLeagueOrder(league: string): number {
  const order: Record<string, number> = {
    sampiyonluk: 6, platin: 5, altin: 4, gumus: 3, bronz: 2, demir: 1,
  };
  return order[league] || 0;
}

router.get("/leaderboard", async (req, res) => {
  const { region, league: leagueFilter, limit } = req.query as {
    region?: string; league?: string; limit?: string;
  };

  const lim = Math.min(parseInt(limit || "100"), 200);

  const chars = await db
    .select()
    .from(charactersTable)
    .orderBy(desc(charactersTable.totalXpEarned))
    .limit(lim);

  let filtered = region && region !== "global"
    ? chars.filter((c) => c.region === region)
    : chars;

  if (leagueFilter && leagueFilter !== "all") {
    filtered = filtered.filter((c) => calcLeague(c.totalXpEarned) === leagueFilter);
  }

  const entries = filtered.map((c, i) => {
    const league = calcLeague(c.totalXpEarned);
    const streakActive = c.streakActiveUntil
      ? new Date(c.streakActiveUntil) > new Date()
      : false;

    return {
      rank: i + 1,
      userId: c.userId,
      characterName: c.name,
      characterClass: c.class,
      race: c.race || "yuce_insan",
      level: c.level,
      totalExp: c.totalExp,
      totalXpEarned: c.totalXpEarned,
      totalCalories: c.totalCalories || 0,
      region: c.region,
      totalWorkouts: c.totalWorkouts,
      league,
      leagueName: getLeagueName(league),
      leagueOrder: getLeagueOrder(league),
      questStreak: c.questStreak || 0,
      streakActive,
    };
  });

  const leagueGroups: Record<string, typeof entries> = {};
  for (const e of entries) {
    if (!leagueGroups[e.league]) leagueGroups[e.league] = [];
    leagueGroups[e.league].push(e);
  }

  for (const [lg, group] of Object.entries(leagueGroups)) {
    const promotionCount = Math.ceil(group.length * 0.2);
    group.forEach((e, idx) => { (e as any).inPromotionZone = idx < promotionCount; });
  }

  res.json({ entries, leagueGroups: Object.keys(leagueGroups) });
});

router.get("/leaderboard/groups", async (req, res) => {
  const { league: leagueFilter, limit } = req.query as {
    league?: string; limit?: string;
  };

  const lim = Math.min(parseInt(limit || "100"), 200);

  const parties = await db
    .select()
    .from(partiesTable)
    .orderBy(desc(partiesTable.totalXp))
    .limit(lim);

  let filtered = parties;
  if (leagueFilter && leagueFilter !== "all") {
    filtered = parties.filter((p) => calcPartyLeague(p.totalXp) === leagueFilter);
  }

  const enriched = await Promise.all(filtered.map(async (party, i) => {
    const members = await db
      .select()
      .from(partyMembersTable)
      .where(eq(partyMembersTable.partyId, party.id));

    const characterIds = members.map((m) => m.characterId);
    const chars = characterIds.length > 0
      ? await db.select().from(charactersTable).where(inArray(charactersTable.id, characterIds))
      : [];

    const league = calcPartyLeague(party.totalXp);

    return {
      rank: i + 1,
      partyId: party.id,
      partyName: party.name,
      memberCount: members.length,
      totalXp: party.totalXp,
      league,
      leagueName: getLeagueName(league),
      leagueOrder: getLeagueOrder(league),
      avgLevel: chars.length > 0 ? Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length) : 1,
      members: chars.map((c) => ({
        name: c.name,
        class: c.class,
        level: c.level,
      })),
    };
  }));

  res.json({ entries: enriched });
});

router.get("/leaderboard/top100", async (req, res) => {
  const chars = await db
    .select()
    .from(charactersTable)
    .orderBy(desc(charactersTable.totalXpEarned))
    .limit(100);

  const entries = await Promise.all(chars.map(async (c, i) => {
    const league = calcLeague(c.totalXpEarned);
    const streakActive = c.streakActiveUntil
      ? new Date(c.streakActiveUntil) > new Date()
      : false;

    const achievements = await db
      .select()
      .from(characterAchievementsTable)
      .where(eq(characterAchievementsTable.userId, c.userId));

    const topAchievements = achievements
      .map((a) => ACHIEVEMENT_MAP[a.achievementKey])
      .filter(Boolean)
      .sort((a, b) => {
        const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };
        return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
      })
      .slice(0, 3);

    return {
      rank: i + 1,
      userId: c.userId,
      characterName: c.name,
      characterClass: c.class,
      race: c.race || "yuce_insan",
      level: c.level,
      totalXpEarned: c.totalXpEarned,
      totalWorkouts: c.totalWorkouts,
      totalCalories: c.totalCalories || 0,
      league,
      leagueName: getLeagueName(league),
      leagueOrder: getLeagueOrder(league),
      questStreak: c.questStreak || 0,
      streakActive,
      topAchievements,
      achievementCount: achievements.length,
    };
  }));

  const topParties = await db
    .select()
    .from(partiesTable)
    .orderBy(desc(partiesTable.totalXp))
    .limit(100);

  const topPartyEntries = await Promise.all(topParties.map(async (p, i) => {
    const members = await db
      .select()
      .from(partyMembersTable)
      .where(eq(partyMembersTable.partyId, p.id));
    const characterIds = members.map((m) => m.characterId);
    const chars2 = characterIds.length > 0
      ? await db.select().from(charactersTable).where(inArray(charactersTable.id, characterIds))
      : [];
    return {
      rank: i + 1,
      partyId: p.id,
      partyName: p.name,
      memberCount: members.length,
      totalXp: p.totalXp,
      league: calcPartyLeague(p.totalXp),
      avgLevel: chars2.length > 0 ? Math.round(chars2.reduce((s, c) => s + c.level, 0) / chars2.length) : 1,
      topMembers: chars2.slice(0, 3).map((c) => ({ name: c.name, class: c.class, level: c.level })),
    };
  }));

  res.json({ individuals: entries, parties: topPartyEntries });
});

router.get("/leaderboard/weekly", async (req, res) => {
  const { region, limit } = req.query as { region?: string; limit?: string };
  const lim = Math.min(parseInt(limit || "100"), 200);

  const chars = await db
    .select()
    .from(charactersTable)
    .orderBy(desc(charactersTable.weeklyXp))
    .limit(lim);

  let filtered = region && region !== "global"
    ? chars.filter((c) => c.region === region)
    : chars;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const entries = filtered.map((c, i) => ({
    rank: i + 1,
    userId: c.userId,
    characterName: c.name,
    characterClass: c.class,
    race: c.race || "yuce_insan",
    level: c.level,
    weeklyXp: c.weeklyXp,
    league: calcLeague(c.totalXpEarned),
  }));

  res.json({
    entries,
    weekStart: monday.toISOString(),
    weekEnd: nextMonday.toISOString(),
    resetsIn: nextMonday.getTime() - now.getTime(),
  });
});

router.get("/leaderboard/streak", async (req, res) => {
  const { limit } = req.query as { limit?: string };
  const lim = Math.min(parseInt(limit || "50"), 100);

  const chars = await db
    .select()
    .from(charactersTable)
    .orderBy(desc(charactersTable.streakDays))
    .limit(lim);

  const entries = chars
    .filter((c) => c.streakDays > 0)
    .map((c, i) => ({
      rank: i + 1,
      userId: c.userId,
      characterName: c.name,
      characterClass: c.class,
      race: c.race || "yuce_insan",
      level: c.level,
      streakDays: c.streakDays,
      league: calcLeague(c.totalXpEarned),
    }));

  res.json({ entries });
});

router.get("/share-card", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!char) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  const league = calcLeague(char.totalXpEarned);
  const achievements = await db
    .select()
    .from(characterAchievementsTable)
    .where(eq(characterAchievementsTable.userId, userId));

  const topAchievements = achievements
    .map((a) => ACHIEVEMENT_MAP[a.achievementKey])
    .filter(Boolean)
    .sort((a, b) => {
      const order = { legendary: 4, epic: 3, rare: 2, common: 1 } as Record<string, number>;
      return (order[b.rarity] || 0) - (order[a.rarity] || 0);
    })
    .slice(0, 3);

  const allChars = await db
    .select({ userId: charactersTable.userId })
    .from(charactersTable)
    .orderBy(desc(charactersTable.totalXpEarned));
  const globalRank = allChars.findIndex((c) => c.userId === userId) + 1;

  res.json({
    name: char.name,
    class: char.class,
    race: char.race,
    level: char.level,
    totalXpEarned: char.totalXpEarned,
    totalWorkouts: char.totalWorkouts,
    streakDays: char.streakDays,
    league,
    leagueName: getLeagueName(league),
    globalRank,
    totalPlayers: allChars.length,
    achievementCount: achievements.length,
    topAchievements: topAchievements.map((a) => ({ name: a.name, icon: a.icon, rarity: a.rarity })),
    referralCode: char.referralCode,
    shareText: `GymQuest'te ${char.name} - Seviye ${char.level} ${getLeagueName(league)} Lig'inde! ${char.totalWorkouts} antrenman tamamladım. Sen de katıl! Referans: ${char.referralCode || ""}`,
  });
});

export default router;
