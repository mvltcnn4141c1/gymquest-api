import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { charactersTable, authTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getRaceStatBonus } from "../constants/races.js";
import { authenticateUser } from "../middlewares/auth.js";
import { generateToken } from "../lib/token.js";

const router: IRouter = Router();

function generateCode(prefix: string, length: number = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix;
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function calcExpToNextLevel(level: number): number {
  return Math.floor(150 * Math.pow(1.1, level - 1));
}

export function processLevelUp(currentExp: number, currentLevel: number, xpGained: number, maxLevel = 100) {
  let newExp = currentExp + xpGained;
  let level = currentLevel;
  let leveledUp = false;
  let expNeeded = calcExpToNextLevel(level);

  while (newExp >= expNeeded && level < maxLevel) {
    newExp -= expNeeded;
    level += 1;
    leveledUp = true;
    expNeeded = calcExpToNextLevel(level);
  }

  return { newExp, newLevel: level, leveledUp };
}

export function calcStats(level: number, charClass: string) {
  const base = { strength: 10, agility: 10, endurance: 10 };
  const gains: Record<string, { strength: number; agility: number; endurance: number }> = {
    barbarian:  { strength: 4, agility: 1, endurance: 3 },
    fighter:    { strength: 3, agility: 2, endurance: 2 },
    paladin:    { strength: 2, agility: 1, endurance: 3 },
    monk:       { strength: 2, agility: 3, endurance: 2 },
    rogue:      { strength: 1, agility: 4, endurance: 1 },
    ranger:     { strength: 2, agility: 3, endurance: 1 },
    wizard:     { strength: 1, agility: 2, endurance: 1 },
    cleric:     { strength: 1, agility: 1, endurance: 3 },
    druid:      { strength: 1, agility: 2, endurance: 2 },
    sorcerer:   { strength: 1, agility: 2, endurance: 1 },
    warlock:    { strength: 1, agility: 2, endurance: 2 },
    bard:       { strength: 1, agility: 2, endurance: 2 },
    warrior:    { strength: 3, agility: 1, endurance: 2 },
    mage:       { strength: 1, agility: 2, endurance: 1 },
    archer:     { strength: 2, agility: 3, endurance: 1 },
  };
  const g = gains[charClass] || gains.fighter;
  return {
    strength: base.strength + g.strength * (level - 1),
    agility: base.agility + g.agility * (level - 1),
    endurance: base.endurance + g.endurance * (level - 1),
  };
}

export function calcLeague(totalXpEarned: number): string {
  if (totalXpEarned >= 150000) return "sampiyonluk";
  if (totalXpEarned >= 60000) return "platin";
  if (totalXpEarned >= 25000) return "altin";
  if (totalXpEarned >= 10000) return "gumus";
  if (totalXpEarned >= 3000) return "bronz";
  return "demir";
}

router.get("/character", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  if (!char) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  const expToNextLevel = calcExpToNextLevel(char.level);
  const league = calcLeague(char.totalXpEarned);

  const streakActive = char.streakActiveUntil
    ? new Date(char.streakActiveUntil) > new Date()
    : false;

  res.json({ ...char, expToNextLevel, league, streakActive });
});

router.post("/character", async (req, res) => {
  const { userId, name, class: charClass, region, race } = req.body;

  if (!userId || !name || !charClass) {
    res.status(400).json({ error: "userId, name, class zorunludur" });
    return;
  }

  const id = `char_${userId}_${Date.now()}`;
  const baseStats = calcStats(1, charClass);
  const raceBonus = getRaceStatBonus(race || "yuce_insan");
  const stats = {
    strength: baseStats.strength + raceBonus.strength,
    agility: baseStats.agility + raceBonus.agility,
    endurance: baseStats.endurance + raceBonus.endurance,
  };

  const [existing] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  let char;
  if (existing) {
    const [updated] = await db
      .update(charactersTable)
      .set({
        name,
        class: charClass,
        race: race || "yuce_insan",
        region: region || "global",
        updatedAt: new Date(),
      })
      .where(eq(charactersTable.userId, userId))
      .returning();
    char = updated;
  } else {
    const referralCode = generateCode("R", 6);
    const friendCode = generateCode("F", 6);
    const [created] = await db
      .insert(charactersTable)
      .values({
        id,
        userId,
        name,
        class: charClass,
        race: race || "yuce_insan",
        region: region || "global",
        level: 1,
        exp: 0,
        totalExp: 0,
        league: "demir",
        ...stats,
        totalWorkouts: 0,
        totalXpEarned: 0,
        totalCalories: 0,
        questStreak: 0,
        referralCode,
        friendCode,
      })
      .returning();
    char = created;
  }

  const token = generateToken();
  await db.insert(authTokensTable).values({
    token,
    userId,
  }).onConflictDoUpdate({
    target: authTokensTable.userId,
    set: { token, createdAt: new Date() },
  });

  if (!existing) {
    try {
      const { trackEvent } = await import("../trackEvent.js");
      trackEvent(userId, "user_signup", { name, class: charClass, race: race || "yuce_insan", region: region || "global" });
    } catch {}
  }

  const expToNextLevel = calcExpToNextLevel(char.level);
  const league = calcLeague(char.totalXpEarned);
  res.json({ ...char, expToNextLevel, league, streakActive: false, authToken: token });
});

router.post("/character/accept-disclaimer", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [updated] = await db.update(charactersTable)
    .set({ hasAcceptedDisclaimer: true, updatedAt: new Date() })
    .where(eq(charactersTable.userId, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Karakter bulunamadi" });
    return;
  }

  res.json({ hasAcceptedDisclaimer: true });
});

export default router;
