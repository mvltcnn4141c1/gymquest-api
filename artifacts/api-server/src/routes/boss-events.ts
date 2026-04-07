import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  bossEventsTable,
  eventContributionsTable,
  partiesTable,
  partyMembersTable,
  charactersTable,
  characterAchievementsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { BOSS_MAP, BOSSES, getWeeklyBoss, calcBossHp } from "../constants/bosses.js";
import { checkAndAwardAchievements, ACHIEVEMENT_MAP } from "../constants/achievements.js";
import { authenticateUser } from "../middlewares/auth.js";
import { processLevelUp, calcStats } from "./character.js";

const router: IRouter = Router();

router.get("/boss-events/current", authenticateUser, async (req, res) => {
  const { partyId } = req.query as { partyId: string };
  if (!partyId) {
    res.status(400).json({ error: "partyId zorunludur" });
    return;
  }

  const [active] = await db
    .select()
    .from(bossEventsTable)
    .where(and(
      eq(bossEventsTable.partyId, partyId),
      eq(bossEventsTable.status, "active"),
    ))
    .limit(1);

  if (active) {
    if (new Date(active.endsAt) < new Date()) {
      const result = active.bossHpCurrent <= 0 ? "defeated" : "failed";
      await db.update(bossEventsTable)
        .set({ status: result })
        .where(eq(bossEventsTable.id, active.id));
      return res.json({ event: null, bossInfo: getWeeklyBoss(), canStart: true });
    }

    const contribs = await db
      .select()
      .from(eventContributionsTable)
      .where(eq(eventContributionsTable.eventId, active.id));

    const bossInfo = BOSS_MAP[active.bossKey];

    return res.json({ event: active, contributions: contribs, bossInfo, canStart: false });
  }

  const weeklyBoss = getWeeklyBoss();
  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, partyId));

  const members = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, partyId));

  const characterIds = members.map((m) => m.characterId);
  const chars = characterIds.length > 0
    ? await db.select().from(charactersTable).where(inArray(charactersTable.id, characterIds))
    : [];

  const avgLevel = chars.length > 0
    ? Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length)
    : 1;

  const bossHp = calcBossHp(weeklyBoss.key, avgLevel, members.length);

  res.json({
    event: null,
    bossInfo: weeklyBoss,
    estimatedHp: bossHp,
    memberCount: members.length,
    avgLevel,
    canStart: members.length >= 2,
  });
});

router.post("/boss-events/start", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { partyId } = req.body;

  if (!partyId) {
    res.status(400).json({ error: "partyId zorunludur" });
    return;
  }

  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(
      eq(partyMembersTable.userId, userId),
      eq(partyMembersTable.partyId, partyId),
    ));

  if (!membership || membership.role !== 'leader') {
    res.status(403).json({ error: "Yalnızca grup lideri etkinlik başlatabilir" });
    return;
  }

  const [existing] = await db
    .select()
    .from(bossEventsTable)
    .where(and(
      eq(bossEventsTable.partyId, partyId),
      eq(bossEventsTable.status, "active"),
    ));

  if (existing) {
    res.status(400).json({ error: "Zaten aktif bir boss etkinliği var" });
    return;
  }

  const members = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, partyId));

  if (members.length < 2) {
    res.status(400).json({ error: "Boss etkinliği için en az 2 üye gereklidir" });
    return;
  }

  const characterIds = members.map((m) => m.characterId);
  const chars = await db
    .select()
    .from(charactersTable)
    .where(inArray(charactersTable.id, characterIds));

  const avgLevel = Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length);
  const boss = getWeeklyBoss();
  const bossHp = calcBossHp(boss.key, avgLevel, members.length);

  const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const endsAt = new Date(Date.now() + boss.durationDays * 24 * 60 * 60 * 1000);

  const [event] = await db.insert(bossEventsTable).values({
    id: eventId,
    bossKey: boss.key,
    partyId,
    status: "active",
    bossHpMax: bossHp,
    bossHpCurrent: bossHp,
    startedAt: new Date(),
    endsAt,
    difficulty: "normal",
  }).returning();

  res.json({ event, bossInfo: boss });
});

router.post("/boss-events/contribute", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { eventId, xpEarned, exerciseType } = req.body;

  if (!eventId || xpEarned == null) {
    res.status(400).json({ error: "eventId, xpEarned zorunludur" });
    return;
  }

  const [event] = await db
    .select()
    .from(bossEventsTable)
    .where(eq(bossEventsTable.id, eventId));

  if (!event || event.status !== "active") {
    res.status(404).json({ error: "Aktif boss etkinliği bulunamadı" });
    return;
  }

  const [char] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  if (!char) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  const boss = BOSS_MAP[event.bossKey];
  let baseDamage = Math.floor(xpEarned * 0.6);

  if (boss && boss.weakClass.includes(char.class)) {
    baseDamage = Math.floor(baseDamage * 1.3);
  }

  const existing = await db
    .select()
    .from(eventContributionsTable)
    .where(and(
      eq(eventContributionsTable.eventId, eventId),
      eq(eventContributionsTable.userId, userId),
    ));

  if (existing.length > 0) {
    await db.update(eventContributionsTable)
      .set({
        damageDealt: existing[0].damageDealt + baseDamage,
        workoutsCount: existing[0].workoutsCount + 1,
        contributedAt: new Date(),
      })
      .where(eq(eventContributionsTable.id, existing[0].id));
  } else {
    await db.insert(eventContributionsTable).values({
      id: `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      eventId,
      characterId: char.id,
      userId,
      damageDealt: baseDamage,
      workoutsCount: 1,
    });
  }

  const newHp = Math.max(0, event.bossHpCurrent - baseDamage);
  let newStatus = event.status;
  let bossDefeated = false;

  if (newHp <= 0) {
    newStatus = "defeated";
    bossDefeated = true;
  }

  await db.update(bossEventsTable)
    .set({ bossHpCurrent: newHp, status: newStatus })
    .where(eq(bossEventsTable.id, eventId));

  let newAchievements: any[] = [];

  if (bossDefeated && !event.rewardClaimed) {
    await db.update(bossEventsTable)
      .set({ rewardClaimed: true })
      .where(eq(bossEventsTable.id, eventId));

    const members = await db
      .select()
      .from(partyMembersTable)
      .where(eq(partyMembersTable.partyId, event.partyId));

    for (const member of members) {
      const [memberChar] = await db
        .select()
        .from(charactersTable)
        .where(eq(charactersTable.userId, member.userId));

      if (!memberChar) continue;

      const rewardXp = boss ? boss.rewardXp : 1000;
      const rewardCoins = boss ? boss.rewardCoins : 300;
      const bossLv = processLevelUp(memberChar.exp, memberChar.level, rewardXp);
      const bossStats = calcStats(bossLv.newLevel, memberChar.class);

      const [updatedMember] = await db.update(charactersTable)
        .set({
          totalXpEarned: memberChar.totalXpEarned + rewardXp,
          exp: bossLv.newExp,
          level: bossLv.newLevel,
          gymCoins: memberChar.gymCoins + rewardCoins,
          ...bossStats,
          updatedAt: new Date(),
        })
        .where(eq(charactersTable.id, memberChar.id))
        .returning();

      const awarded = await checkAndAwardAchievements(db, {
        ...(updatedMember || memberChar),
        totalXpEarned: memberChar.totalXpEarned + rewardXp,
      }, { characterAchievementsTable, charactersTable }, eq);

      if (member.userId === userId) {
        newAchievements = awarded;
      }
    }
  }

  res.json({
    damageDealt: baseDamage,
    newHp,
    bossDefeated,
    newAchievements,
    progressPercent: Math.round(((event.bossHpMax - newHp) / event.bossHpMax) * 100),
  });
});

router.get("/boss-events/history", async (req, res) => {
  const { partyId } = req.query as { partyId: string };
  if (!partyId) {
    res.status(400).json({ error: "partyId zorunludur" });
    return;
  }

  const events = await db
    .select()
    .from(bossEventsTable)
    .where(eq(bossEventsTable.partyId, partyId))
    .orderBy(desc(bossEventsTable.startedAt))
    .limit(10);

  const enriched = events.map((e) => ({
    ...e,
    bossInfo: BOSS_MAP[e.bossKey] || null,
  }));

  res.json({ events: enriched });
});

export default router;
