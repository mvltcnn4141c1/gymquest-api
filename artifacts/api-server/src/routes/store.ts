import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { charactersTable, purchasesTable, activeBoostsTable } from "@workspace/db/schema";
import { eq, and, gt, sql, desc } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import { validateUserAction, createEndpointRateLimiter, logSuspiciousActivity } from "../middlewares/anticheat.js";
import { updateBoostQuestProgress } from "./daily-quests.js";

const router: IRouter = Router();

const purchaseRateLimiter = createEndpointRateLimiter(10);

export type ItemType = "aura" | "boost";
export type Currency = "gym_coin" | "gem";
export type ItemCategory = "cosmetic" | "xp_boost";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  category: ItemCategory;
  rarity: Rarity;
  currency: Currency;
  price: number;
  levelRequired: number;
  icon: string;
  color: string;
  boostMultiplier?: number;
  boostDurationHours?: number;
  passiveBonus?: { stat: string; value: number };
  isConsumable: boolean;
}

const BOOST_COOLDOWN_MS = 30 * 60 * 1000;
const DAILY_BOOST_LIMIT = 5;

export const STORE_CATALOG: StoreItem[] = [
  {
    id: "aura_gri",
    name: "Gumus Aura",
    description: "Karakterini hafif parlayan gumus bir hale sarar.",
    type: "aura",
    category: "cosmetic",
    rarity: "common",
    currency: "gym_coin",
    price: 800,
    levelRequired: 1,
    icon: "shimmer",
    color: "#C0C0C0",
    passiveBonus: { stat: "endurance", value: 1 },
    isConsumable: false,
  },
  {
    id: "aura_alev",
    name: "Alev Aurasi",
    description: "Karakterini turuncu ates halkalari sarar. Guc hissettir.",
    type: "aura",
    category: "cosmetic",
    rarity: "uncommon",
    currency: "gym_coin",
    price: 2400,
    levelRequired: 5,
    icon: "fire",
    color: "#FF6B35",
    passiveBonus: { stat: "strength", value: 2 },
    isConsumable: false,
  },
  {
    id: "aura_buz",
    name: "Buz Aurasi",
    description: "Buz mavisi parlak hale - soguk ve kararli.",
    type: "aura",
    category: "cosmetic",
    rarity: "rare",
    currency: "gym_coin",
    price: 4500,
    levelRequired: 10,
    icon: "snowflake",
    color: "#7EC8E3",
    passiveBonus: { stat: "agility", value: 3 },
    isConsumable: false,
  },
  {
    id: "aura_firtina",
    name: "Firtina Aurasi",
    description: "Mor elektrik halkalari karakterine dolayi gelir.",
    type: "aura",
    category: "cosmetic",
    rarity: "epic",
    currency: "gym_coin",
    price: 8000,
    levelRequired: 20,
    icon: "lightning-bolt",
    color: "#9B59B6",
    passiveBonus: { stat: "strength", value: 4 },
    isConsumable: false,
  },
  {
    id: "aura_altin",
    name: "Altin Aurasi",
    description: "Saf altin pariltisi - elit savascilarin isareti.",
    type: "aura",
    category: "cosmetic",
    rarity: "legendary",
    currency: "gym_coin",
    price: 15000,
    levelRequired: 30,
    icon: "star-four-points",
    color: "#FFD700",
    passiveBonus: { stat: "endurance", value: 5 },
    isConsumable: false,
  },
  {
    id: "aura_elmas",
    name: "Elmas Aurasi",
    description: "Gokkusagi renkli elmas pariltisi. Nadir ve prestijli.",
    type: "aura",
    category: "cosmetic",
    rarity: "epic",
    currency: "gem",
    price: 60,
    levelRequired: 1,
    icon: "diamond-stone",
    color: "#B9F2FF",
    passiveBonus: { stat: "agility", value: 4 },
    isConsumable: false,
  },
  {
    id: "aura_sampiyonluk",
    name: "Sampiyonluk Aurasi",
    description: "Mor-pembe sampiyonluk halesini sadece gercek efsaneler tasir.",
    type: "aura",
    category: "cosmetic",
    rarity: "legendary",
    currency: "gem",
    price: 150,
    levelRequired: 15,
    icon: "crown",
    color: "#FF4DFF",
    passiveBonus: { stat: "strength", value: 6 },
    isConsumable: false,
  },
  {
    id: "boost_xp15_1h",
    name: "XP Takviyesi x1.5",
    description: "1 saat boyunca kazandigin tum XP %50 artar.",
    type: "boost",
    category: "xp_boost",
    rarity: "common",
    currency: "gym_coin",
    price: 700,
    levelRequired: 1,
    icon: "lightning-bolt-circle",
    color: "#4ECDC4",
    boostMultiplier: 150,
    boostDurationHours: 1,
    isConsumable: true,
  },
  {
    id: "boost_xp2_2h",
    name: "XP Takviyesi x2",
    description: "2 saat boyunca kazandigin tum XP iki katina cikar.",
    type: "boost",
    category: "xp_boost",
    rarity: "uncommon",
    currency: "gym_coin",
    price: 2000,
    levelRequired: 5,
    icon: "rocket-launch",
    color: "#E74C3C",
    boostMultiplier: 200,
    boostDurationHours: 2,
    isConsumable: true,
  },
  {
    id: "boost_xp2_4h_gem",
    name: "XP Takviyesi x2 (Gem)",
    description: "4 saat boyunca XP iki katina cikar. Gem ile guclu basla.",
    type: "boost",
    category: "xp_boost",
    rarity: "rare",
    currency: "gem",
    price: 40,
    levelRequired: 1,
    icon: "rocket-launch-outline",
    color: "#3498DB",
    boostMultiplier: 200,
    boostDurationHours: 4,
    isConsumable: true,
  },
  {
    id: "boost_xp3_6h_gem",
    name: "XP Takviyesi x3 (Gem)",
    description: "6 saat boyunca XP uc katina cikar. Efsanevi guc!",
    type: "boost",
    category: "xp_boost",
    rarity: "epic",
    currency: "gem",
    price: 90,
    levelRequired: 10,
    icon: "speedometer",
    color: "#FF4DFF",
    boostMultiplier: 300,
    boostDurationHours: 6,
    isConsumable: true,
  },
];

router.get("/store", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.userId, userId));

  const now = new Date();

  const [purchases, activeBoosts] = await Promise.all([
    db.select().from(purchasesTable).where(eq(purchasesTable.userId, userId)),
    db.select().from(activeBoostsTable).where(
      and(eq(activeBoostsTable.userId, userId), gt(activeBoostsTable.expiresAt, now))
    ),
  ]);

  const ownedItemIds = purchases.map((p) => p.itemId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayBoostPurchases = purchases.filter(
    (p) => {
      const item = STORE_CATALOG.find((i) => i.id === p.itemId);
      return item?.type === "boost" && new Date(p.purchasedAt) >= todayStart;
    }
  );

  res.json({
    catalog: STORE_CATALOG,
    ownedItemIds,
    activeBoosts: activeBoosts.map((b) => ({
      id: b.id,
      itemId: b.itemId,
      multiplier: b.multiplier,
      expiresAt: b.expiresAt,
    })),
    gymCoins: char?.gymCoins ?? 0,
    gems: char?.gems ?? 0,
    equippedAura: char?.equippedAura ?? null,
    dailyBoostPurchases: todayBoostPurchases.length,
    dailyBoostLimit: DAILY_BOOST_LIMIT,
  });
});

router.post("/store/purchase", authenticateUser, rateLimiter, purchaseRateLimiter, validateUserAction, async (req, res) => {
  const userId = req.user!.id;
  const { itemId } = req.body as { itemId: string };

  if (!itemId) {
    res.status(400).json({ error: "itemId zorunludur" });
    return;
  }

  const item = STORE_CATALOG.find((i) => i.id === itemId);
  if (!item) {
    res.status(404).json({ error: "Urun bulunamadi" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;

      if (!char) throw new Error("Karakter bulunamadi");

      if (char.level < item.levelRequired) {
        throw new Error(`Bu urun icin seviye ${item.levelRequired} gereklidir`);
      }

      if (item.currency === "gym_coin") {
        if ((char.gym_coins || 0) < item.price) throw new Error("Yeterli Gym Coin yok");
      } else {
        if ((char.gems || 0) < item.price) throw new Error("Yeterli Gem yok");
      }

      if (!item.isConsumable) {
        const existing = await tx
          .select()
          .from(purchasesTable)
          .where(and(eq(purchasesTable.userId, userId), eq(purchasesTable.itemId, itemId)));
        if (existing.length > 0) throw new Error("Bu urune zaten sahipsin");
      }

      if (item.type === "boost") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayPurchases = await tx
          .select()
          .from(purchasesTable)
          .where(and(
            eq(purchasesTable.userId, userId),
            gt(purchasesTable.purchasedAt, todayStart),
          ));
        const boostPurchases = todayPurchases.filter((p) => {
          const it = STORE_CATALOG.find((i) => i.id === p.itemId);
          return it?.type === "boost";
        });
        if (boostPurchases.length >= DAILY_BOOST_LIMIT) {
          throw new Error(`Gunluk boost limiti (${DAILY_BOOST_LIMIT}) doldu`);
        }

        const lastBoost = await tx
          .select()
          .from(purchasesTable)
          .where(eq(purchasesTable.userId, userId))
          .orderBy(desc(purchasesTable.purchasedAt))
          .limit(1);
        if (lastBoost.length > 0) {
          const lastItem = STORE_CATALOG.find((i) => i.id === lastBoost[0].itemId);
          if (lastItem?.type === "boost") {
            const elapsed = Date.now() - new Date(lastBoost[0].purchasedAt).getTime();
            if (elapsed < BOOST_COOLDOWN_MS) {
              const remainMin = Math.ceil((BOOST_COOLDOWN_MS - elapsed) / 60000);
              throw new Error(`Boost bekleme suresi: ${remainMin} dakika`);
            }
          }
        }
      }

      const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx.insert(purchasesTable).values({
        id: purchaseId,
        userId,
        itemId,
        itemType: item.type,
        currency: item.currency,
        price: item.price,
      });

      const debitField = item.currency === "gym_coin"
        ? { gymCoins: sql`GREATEST(0, ${charactersTable.gymCoins} - ${item.price})` }
        : { gems: sql`GREATEST(0, ${charactersTable.gems} - ${item.price})` };

      if (item.type === "boost" && item.boostMultiplier && item.boostDurationHours) {
        await tx.delete(activeBoostsTable).where(eq(activeBoostsTable.userId, userId));

        const expiresAt = new Date(Date.now() + item.boostDurationHours * 60 * 60 * 1000);
        const boostId = `boost_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await tx.insert(activeBoostsTable).values({
          id: boostId,
          userId,
          itemId,
          multiplier: item.boostMultiplier,
          expiresAt,
        });
      }

      const [updated] = await tx
        .update(charactersTable)
        .set({ ...debitField, updatedAt: new Date() })
        .where(eq(charactersTable.userId, userId))
        .returning();

      return updated;
    });

    if (item.type === "boost") {
      try {
        const [charForTz] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
        const boostTz = charForTz?.timezone || "Europe/Istanbul";
        await updateBoostQuestProgress(userId, boostTz);
      } catch {}
    }

    res.json({
      success: true,
      gymCoins: result.gymCoins,
      gems: result.gems,
      equippedAura: result.equippedAura,
    });
  } catch (e: any) {
    const msg = e.message || "Satin alma basarisiz";
    if (msg.includes("bulunamadi")) {
      res.status(404).json({ error: msg });
    } else if (msg.includes("seviye") || msg.includes("sahipsin") || msg.includes("Yeterli")) {
      res.status(400).json({ error: msg });
    } else if (msg.includes("limit") || msg.includes("bekleme")) {
      res.status(429).json({ error: msg });
    } else {
      res.status(400).json({ error: msg });
    }
  }
});

router.post("/store/equip-aura", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { itemId } = req.body as { itemId: string | null };

  if (itemId !== null) {
    const existing = await db
      .select()
      .from(purchasesTable)
      .where(
        and(eq(purchasesTable.userId, userId), eq(purchasesTable.itemId, itemId))
      );
    if (existing.length === 0) {
      res.status(403).json({ error: "Bu auraya sahip degilsin" });
      return;
    }
  }

  const [updated] = await db
    .update(charactersTable)
    .set({ equippedAura: itemId, updatedAt: new Date() })
    .where(eq(charactersTable.userId, userId))
    .returning();

  res.json({ success: true, equippedAura: updated.equippedAura });
});

router.post("/store/dev-topup", authenticateUser, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Bu endpoint uretim ortaminda devre disidir" });
    return;
  }
  const userId = req.user!.id;
  const { coins, gems: gemAmount } = req.body as { coins?: number; gems?: number };

  const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!char) { res.status(404).json({ error: "Karakter bulunamadi" }); return; }

  const [updated] = await db.update(charactersTable).set({
    gymCoins: (char.gymCoins || 0) + (coins || 0),
    gems: (char.gems || 0) + (gemAmount || 0),
    updatedAt: new Date(),
  }).where(eq(charactersTable.userId, userId)).returning();

  res.json({ gymCoins: updated.gymCoins, gems: updated.gems });
});

export async function getActiveBoostMultiplier(userId: string): Promise<number> {
  const now = new Date();
  const boosts = await db
    .select()
    .from(activeBoostsTable)
    .where(and(eq(activeBoostsTable.userId, userId), gt(activeBoostsTable.expiresAt, now)));

  if (boosts.length === 0) return 100;
  return Math.max(...boosts.map((b) => b.multiplier));
}

export default router;
