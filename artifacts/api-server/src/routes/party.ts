import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  partiesTable,
  partyMembersTable,
  charactersTable,
  characterAchievementsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { checkAndAwardAchievements, ACHIEVEMENT_MAP } from "../constants/achievements.js";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function calcPartyLeague(totalXp: number): string {
  if (totalXp >= 750000) return "sampiyonluk";
  if (totalXp >= 300000) return "platin";
  if (totalXp >= 125000) return "altin";
  if (totalXp >= 50000) return "gumus";
  if (totalXp >= 15000) return "bronz";
  return "demir";
}

function getPartyRoles(chars: Array<{ class: string }>) {
  const roles: Record<string, string[]> = {
    tank: [],
    healer: [],
    physical_dps: [],
    magic_dps: [],
    support: [],
  };

  for (const c of chars) {
    switch (c.class) {
      case 'barbarian':
        roles.tank.push(c.class);
        roles.physical_dps.push(c.class);
        break;
      case 'fighter':
        roles.physical_dps.push(c.class);
        roles.tank.push(c.class);
        break;
      case 'paladin':
        roles.tank.push(c.class);
        roles.healer.push(c.class);
        break;
      case 'monk':
        roles.physical_dps.push(c.class);
        roles.support.push(c.class);
        break;
      case 'rogue':
        roles.physical_dps.push(c.class);
        break;
      case 'ranger':
        roles.physical_dps.push(c.class);
        break;
      case 'wizard':
        roles.magic_dps.push(c.class);
        break;
      case 'cleric':
        roles.healer.push(c.class);
        roles.support.push(c.class);
        break;
      case 'druid':
        roles.healer.push(c.class);
        roles.magic_dps.push(c.class);
        break;
      case 'sorcerer':
        roles.magic_dps.push(c.class);
        break;
      case 'warlock':
        roles.magic_dps.push(c.class);
        break;
      case 'bard':
        roles.support.push(c.class);
        roles.healer.push(c.class);
        break;
      case 'warrior':
        roles.tank.push(c.class);
        roles.physical_dps.push(c.class);
        break;
      case 'mage':
        roles.magic_dps.push(c.class);
        break;
      case 'archer':
        roles.physical_dps.push(c.class);
        break;
    }
  }

  return roles;
}

function getBalanceWarnings(chars: Array<{ class: string }>): string[] {
  const warnings: string[] = [];
  const roles = getPartyRoles(chars);

  if (roles.tank.length === 0) {
    warnings.push('Grubunuzda Tank yok! Warrior veya Paladin ekleyin. Boss savaşlarında çok daha savunmasız olacaksınız.');
  }
  if (roles.healer.length === 0) {
    warnings.push('Grubunuzda İyileştirici yok! Paladin olmadan savaşlar çok daha zor olacak.');
  }
  if (roles.magic_dps.length === 0) {
    warnings.push('Büyücü olmadan bazı boss\'ların büyüsel zayıflıklarını sömüremezsiniz.');
  }

  const classCount: Record<string, number> = {};
  for (const c of chars) {
    classCount[c.class] = (classCount[c.class] || 0) + 1;
  }
  const maxSameClass = Math.max(...Object.values(classCount));
  if (maxSameClass >= 4 && chars.length >= 4) {
    warnings.push('Çok fazla aynı sınıftan karakter var. Grup dengesini artırmak için farklı sınıflar deneyin.');
  }

  return warnings;
}

router.post("/party", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { name, description } = req.body;

  if (!name) {
    res.status(400).json({ error: "name zorunludur" });
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

  const existingMember = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.userId, userId));

  if (existingMember.length > 0) {
    res.status(400).json({ error: "Zaten bir gruba üyesiniz. Önce ayrılmanız gerekiyor." });
    return;
  }

  let inviteCode = makeInviteCode();
  for (let i = 0; i < 5; i++) {
    const existing = await db.select().from(partiesTable).where(eq(partiesTable.inviteCode, inviteCode));
    if (existing.length === 0) break;
    inviteCode = makeInviteCode();
  }

  const partyId = `party_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const memberId = `pm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const [party] = await db.insert(partiesTable).values({
    id: partyId,
    name: name.trim(),
    leaderId: char.id,
    inviteCode,
    description: description || null,
    totalXp: char.totalXpEarned,
    league: calcPartyLeague(char.totalXpEarned),
  }).returning();

  await db.insert(partyMembersTable).values({
    id: memberId,
    partyId,
    characterId: char.id,
    userId,
    role: 'leader',
  });

  const toAward = await checkAndAwardAchievements(db, char, {
    characterAchievementsTable,
    charactersTable,
  }, eq);

  res.json({ party, achievements: toAward });
});

router.get("/party/my", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.userId, userId));

  if (!membership) {
    res.json({ party: null, members: [], warnings: [] });
    return;
  }

  const [party] = await db
    .select()
    .from(partiesTable)
    .where(eq(partiesTable.id, membership.partyId));

  if (!party) {
    res.json({ party: null, members: [], warnings: [] });
    return;
  }

  const members = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, party.id));

  const characterIds = members.map((m) => m.characterId);
  const chars = characterIds.length > 0
    ? await db.select().from(charactersTable).where(inArray(charactersTable.id, characterIds))
    : [];

  const enrichedMembers = members.map((m) => {
    const char = chars.find((c) => c.id === m.characterId);
    return { ...m, character: char || null };
  });

  const totalXp = chars.reduce((sum, c) => sum + c.totalXpEarned, 0);
  await db.update(partiesTable).set({
    totalXp,
    league: calcPartyLeague(totalXp),
    updatedAt: new Date(),
  }).where(eq(partiesTable.id, party.id));

  const warnings = getBalanceWarnings(chars.filter(Boolean));

  res.json({
    party: { ...party, totalXp, league: calcPartyLeague(totalXp) },
    members: enrichedMembers,
    warnings,
    myMembership: membership,
  });
});

router.get("/party/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;

  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, id));
  if (!party) {
    res.status(404).json({ error: "Grup bulunamadı" });
    return;
  }

  const members = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, id));

  const characterIds = members.map((m) => m.characterId);
  const chars = characterIds.length > 0
    ? await db.select().from(charactersTable).where(inArray(charactersTable.id, characterIds))
    : [];

  const enrichedMembers = members.map((m) => {
    const char = chars.find((c) => c.id === m.characterId);
    return { ...m, character: char || null };
  });

  const warnings = getBalanceWarnings(chars.filter(Boolean));

  res.json({ party, members: enrichedMembers, warnings });
});

router.post("/party/join", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { inviteCode } = req.body;

  if (!inviteCode) {
    res.status(400).json({ error: "inviteCode zorunludur" });
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

  const existingMember = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.userId, userId));

  if (existingMember.length > 0) {
    res.status(400).json({ error: "Zaten bir gruba üyesiniz. Önce ayrılmanız gerekiyor." });
    return;
  }

  const [party] = await db
    .select()
    .from(partiesTable)
    .where(eq(partiesTable.inviteCode, inviteCode.toUpperCase().trim()));

  if (!party) {
    res.status(404).json({ error: "Geçersiz davet kodu" });
    return;
  }

  const currentMembers = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, party.id));

  if (currentMembers.length >= 5) {
    res.status(400).json({ error: "Grup dolu! Maksimum 5 üye olabilir." });
    return;
  }

  const memberId = `pm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const [newMember] = await db.insert(partyMembersTable).values({
    id: memberId,
    partyId: party.id,
    characterId: char.id,
    userId,
    role: 'member',
  }).returning();

  const toAward = await checkAndAwardAchievements(db, char, {
    characterAchievementsTable,
    charactersTable,
  }, eq);

  res.json({ party, member: newMember, achievements: toAward });
});

router.post("/party/leave", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.userId, userId));

  if (!membership) {
    res.status(404).json({ error: "Herhangi bir gruba üye değilsiniz" });
    return;
  }

  const partyId = membership.partyId;
  await db.delete(partyMembersTable).where(eq(partyMembersTable.userId, userId));

  const remaining = await db
    .select()
    .from(partyMembersTable)
    .where(eq(partyMembersTable.partyId, partyId));

  if (remaining.length === 0) {
    await db.delete(partiesTable).where(eq(partiesTable.id, partyId));
  } else if (membership.role === 'leader') {
    await db.update(partyMembersTable)
      .set({ role: 'leader' })
      .where(eq(partyMembersTable.id, remaining[0].id));
  }

  res.json({ success: true });
});

router.delete("/party", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId zorunludur" });
    return;
  }

  const [membership] = await db
    .select()
    .from(partyMembersTable)
    .where(and(eq(partyMembersTable.userId, userId), eq(partyMembersTable.role, 'leader')));

  if (!membership) {
    res.status(403).json({ error: "Yalnızca grup lideri grubu dağıtabilir" });
    return;
  }

  await db.delete(partyMembersTable).where(eq(partyMembersTable.partyId, membership.partyId));
  await db.delete(partiesTable).where(eq(partiesTable.id, membership.partyId));

  res.json({ success: true });
});

export { calcPartyLeague, getBalanceWarnings };
export default router;
