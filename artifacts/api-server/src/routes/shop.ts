import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iapProductsTable, iapPurchasesTable,
  charactersTable, userBattlePassTable, seasonsTable,
  dailyOffersTable, purchaseAnalyticsTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

interface ProductDef {
  id: string;
  name: string;
  description: string;
  type: "gem_pack" | "battle_pass" | "bundle";
  priceUSD: number;
  originalPriceUSD?: number;
  gemsAmount: number;
  bonusGems: number;
  includesBattlePass: boolean;
  includesBoost?: string;
  includesAura?: string;
  tag?: string;
  sortOrder: number;
}

const PRODUCT_CATALOG: ProductDef[] = [
  {
    id: "whale_pack",
    name: "Efsane Paketi",
    description: "2000 Gem + 500 bonus + Ozel Rozet! Efsanelerin secimi.",
    type: "bundle",
    priceUSD: 2499,
    gemsAmount: 2000,
    bonusGems: 500,
    includesBattlePass: true,
    includesBoost: "boost_xp3_6h_gem",
    includesAura: "aura_sampiyonluk",
    tag: "OZEL",
    sortOrder: 1,
  },
  {
    id: "gem_pack_high",
    name: "700 Gem Paketi",
    description: "700 Gem + 100 bonus gem! Ciddi maceraci paketi.",
    type: "gem_pack",
    priceUSD: 999,
    gemsAmount: 700,
    bonusGems: 100,
    includesBattlePass: false,
    tag: "EN_IYI_DEGER",
    sortOrder: 2,
  },
  {
    id: "gem_pack_mid",
    name: "300 Gem Paketi",
    description: "300 Gem + 30 bonus! En cok tercih edilen paket.",
    type: "gem_pack",
    priceUSD: 499,
    gemsAmount: 300,
    bonusGems: 30,
    includesBattlePass: false,
    tag: "EN_POPULER",
    sortOrder: 3,
  },
  {
    id: "gem_pack_starter",
    name: "50 Gem Paketi",
    description: "Kucuk ama etkili! Macerana hiz kat.",
    type: "gem_pack",
    priceUSD: 99,
    gemsAmount: 50,
    bonusGems: 0,
    includesBattlePass: false,
    sortOrder: 4,
  },
  {
    id: "battle_pass_unlock",
    name: "Sezon Pasi",
    description: "Premium odul hattini ac ve ozel odulleri kazan!",
    type: "battle_pass",
    priceUSD: 499,
    gemsAmount: 0,
    bonusGems: 0,
    includesBattlePass: true,
    sortOrder: 5,
  },
  {
    id: "starter_bundle",
    name: "Baslangic Paketi",
    description: "200 Gem + XP Boost x2 + Sezon Pasi — yeni oyuncular icin!",
    type: "bundle",
    priceUSD: 699,
    originalPriceUSD: 999,
    gemsAmount: 200,
    bonusGems: 0,
    includesBattlePass: true,
    includesBoost: "boost_xp2_2h",
    tag: "FIRSAT",
    sortOrder: 6,
  },
  {
    id: "mega_bundle",
    name: "Mega Paket",
    description: "1000 Gem + 200 bonus + Elmas Aurasi + Sezon Pasi!",
    type: "bundle",
    priceUSD: 1499,
    originalPriceUSD: 2199,
    gemsAmount: 1000,
    bonusGems: 200,
    includesBattlePass: true,
    includesAura: "aura_elmas",
    tag: "EN_IYI_DEGER",
    sortOrder: 7,
  },
];

async function seedProducts() {
  for (const p of PRODUCT_CATALOG) {
    const values = {
      id: p.id,
      name: p.name,
      description: p.description,
      type: p.type,
      priceUSD: p.priceUSD,
      originalPriceUSD: p.originalPriceUSD || null,
      gemsAmount: p.gemsAmount,
      bonusGems: p.bonusGems,
      includesBattlePass: p.includesBattlePass ? 1 : 0,
      includesBoost: p.includesBoost || null,
      includesAura: p.includesAura || null,
      tag: p.tag || null,
      isActive: 1,
      sortOrder: p.sortOrder,
    };
    const [existing] = await db.select().from(iapProductsTable).where(eq(iapProductsTable.id, p.id));
    if (!existing) {
      await db.insert(iapProductsTable).values(values);
    } else {
      const { id, ...updateVals } = values;
      await db.update(iapProductsTable).set(updateVals).where(eq(iapProductsTable.id, p.id));
    }
  }

  const oldProducts = ["gem_pack_100", "gem_pack_500", "gem_pack_1000"];
  for (const oldId of oldProducts) {
    await db.update(iapProductsTable).set({ isActive: 0 }).where(eq(iapProductsTable.id, oldId));
  }
}

let _seeded = false;
async function ensureSeeded() {
  if (_seeded) return;
  try {
    await seedProducts();
    _seeded = true;
  } catch (err) {
    console.error("Product seed error:", err);
  }
}

router.get("/shop/products", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  try {
    await ensureSeeded();

    const [products, [char], dailyOffer] = await Promise.all([
      db.select().from(iapProductsTable)
        .where(eq(iapProductsTable.isActive, 1))
        .orderBy(iapProductsTable.sortOrder),
      db.select().from(charactersTable).where(eq(charactersTable.userId, userId)),
      getOrCreateDailyOffer(),
    ]);

    const hasPurchased = char?.hasPurchased ?? false;

    await logAnalytics(userId, "shop_view", null, null);

    res.json({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        type: p.type,
        priceUSD: p.priceUSD,
        originalPriceUSD: p.originalPriceUSD,
        priceDisplay: `$${(p.priceUSD / 100).toFixed(2)}`,
        originalPriceDisplay: p.originalPriceUSD ? `$${(p.originalPriceUSD / 100).toFixed(2)}` : null,
        gemsAmount: p.gemsAmount,
        bonusGems: p.bonusGems,
        totalGems: p.gemsAmount + p.bonusGems,
        includesBattlePass: p.includesBattlePass === 1,
        includesBoost: p.includesBoost,
        includesAura: p.includesAura,
        tag: p.tag,
      })),
      hasPurchased,
      firstPurchaseBonus: !hasPurchased,
      dailyOffer: dailyOffer ? {
        productId: dailyOffer.productId,
        discountPercent: dailyOffer.discountPercent,
        discountedPriceUSD: dailyOffer.discountedPriceUSD,
        discountedPriceDisplay: `$${(dailyOffer.discountedPriceUSD / 100).toFixed(2)}`,
        expiresAt: dailyOffer.expiresAt,
      } : null,
      freeUserPenalty: !hasPurchased,
    });
  } catch (err) {
    console.error("Shop products error:", err);
    res.status(500).json({ error: "Urunler yuklenemedi" });
  }
});

router.post("/purchase/initiate", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { productId, idempotencyKey } = req.body as { productId?: string; idempotencyKey?: string };

  if (!productId) {
    res.status(400).json({ error: "productId zorunludur" });
    return;
  }

  try {
    await ensureSeeded();

    const [product] = await db.select().from(iapProductsTable).where(eq(iapProductsTable.id, productId));
    if (!product || product.isActive !== 1) {
      res.status(404).json({ error: "Urun bulunamadi veya aktif degil" });
      return;
    }

    if (idempotencyKey) {
      const [existingPurchase] = await db
        .select()
        .from(iapPurchasesTable)
        .where(eq(iapPurchasesTable.idempotencyKey, idempotencyKey));

      if (existingPurchase) {
        res.json({
          purchaseId: existingPurchase.id,
          status: existingPurchase.status,
          product: {
            id: product.id,
            name: product.name,
            priceUSD: product.priceUSD,
            priceDisplay: `$${(product.priceUSD / 100).toFixed(2)}`,
          },
          alreadyExists: true,
        });
        return;
      }
    }

    const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
    if (!char) {
      res.status(404).json({ error: "Karakter bulunamadi" });
      return;
    }

    const purchaseId = `iap_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      await db.insert(iapPurchasesTable).values({
        id: purchaseId,
        userId,
        productId,
        amountUSD: product.priceUSD,
        gemsGranted: 0,
        status: "pending",
        idempotencyKey: idempotencyKey || null,
      });
    } catch (insertErr: any) {
      if (idempotencyKey && insertErr?.code === "23505") {
        const [existing] = await db.select().from(iapPurchasesTable).where(eq(iapPurchasesTable.idempotencyKey, idempotencyKey));
        if (existing) {
          res.json({
            purchaseId: existing.id,
            status: existing.status,
            product: { id: product.id, name: product.name, priceUSD: product.priceUSD, priceDisplay: `$${(product.priceUSD / 100).toFixed(2)}` },
            alreadyExists: true,
          });
          return;
        }
      }
      throw insertErr;
    }

    res.json({
      purchaseId,
      status: "pending",
      product: {
        id: product.id,
        name: product.name,
        priceUSD: product.priceUSD,
        priceDisplay: `$${(product.priceUSD / 100).toFixed(2)}`,
        gemsAmount: product.gemsAmount,
        bonusGems: product.bonusGems,
        totalGems: product.gemsAmount + product.bonusGems,
        includesBattlePass: product.includesBattlePass === 1,
      },
      alreadyExists: false,
    });
  } catch (err) {
    console.error("Purchase initiate error:", err);
    res.status(500).json({ error: "Satin alma baslatilamadi" });
  }
});

router.post("/purchase/complete", authenticateUser, async (_req, res) => {
  res.status(403).json({
    error: "Satin alma tamamlama devre disi. Odemeler Stripe uzerinden islenir.",
    code: "STRIPE_ONLY",
  });
});

router.post("/purchase/cancel", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { purchaseId } = req.body as { purchaseId?: string };

  if (!purchaseId) {
    res.status(400).json({ error: "purchaseId zorunludur" });
    return;
  }

  try {
    const result = await db.execute(
      sql`UPDATE iap_purchases SET status = 'failed'
          WHERE id = ${purchaseId} AND user_id = ${userId} AND status = 'pending'
          RETURNING id`
    );

    if (!result.rows || result.rows.length === 0) {
      const [purchase] = await db.select().from(iapPurchasesTable)
        .where(and(eq(iapPurchasesTable.id, purchaseId), eq(iapPurchasesTable.userId, userId)));
      if (!purchase) {
        res.status(404).json({ error: "Satin alma bulunamadi" });
      } else {
        res.status(400).json({ error: "Sadece bekleyen satin almalar iptal edilebilir" });
      }
      return;
    }

    res.json({ success: true, purchaseId, status: "failed" });
  } catch (err) {
    console.error("Purchase cancel error:", err);
    res.status(500).json({ error: "Iptal islemi basarisiz" });
  }
});

router.get("/purchase/history", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  try {
    const purchases = await db
      .select()
      .from(iapPurchasesTable)
      .where(eq(iapPurchasesTable.userId, userId))
      .orderBy(sql`created_at DESC`)
      .limit(50);

    res.json({
      purchases: purchases.map((p) => ({
        id: p.id,
        productId: p.productId,
        amountUSD: p.amountUSD,
        priceDisplay: `$${(p.amountUSD / 100).toFixed(2)}`,
        gemsGranted: p.gemsGranted,
        status: p.status,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
      })),
    });
  } catch (err) {
    console.error("Purchase history error:", err);
    res.status(500).json({ error: "Gecmis yuklenemedi" });
  }
});

async function getOrCreateDailyOffer() {
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db.select().from(dailyOffersTable).where(eq(dailyOffersTable.offerDate, today));
  if (existing && new Date(existing.expiresAt) > new Date()) return existing;

  const eligibleProducts = PRODUCT_CATALOG.filter((p) => p.type === "gem_pack" && p.priceUSD >= 499);
  if (eligibleProducts.length === 0) return null;

  const dayHash = new Date().getDate() + new Date().getMonth() * 31;
  const product = eligibleProducts[dayHash % eligibleProducts.length];
  const discountPercent = 20 + (dayHash % 3) * 10;
  const discountedPriceUSD = Math.round(product.priceUSD * (1 - discountPercent / 100));

  const tomorrow = new Date();
  tomorrow.setHours(23, 59, 59, 999);

  const offerId = `offer_${today}_${Math.random().toString(36).substr(2, 6)}`;
  try {
    const [offer] = await db.insert(dailyOffersTable).values({
      id: offerId,
      productId: product.id,
      discountPercent,
      discountedPriceUSD,
      offerDate: today,
      expiresAt: tomorrow,
    }).returning();
    return offer;
  } catch {
    const [fallback] = await db.select().from(dailyOffersTable).where(eq(dailyOffersTable.offerDate, today));
    return fallback || null;
  }
}

async function logAnalytics(userId: string, eventType: string, productId: string | null, amountUSD: number | null, metadata?: string) {
  try {
    const id = `pa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.insert(purchaseAnalyticsTable).values({
      id,
      userId,
      eventType,
      productId,
      amountUSD,
      metadata: metadata || null,
    });
  } catch {}
}

router.get("/shop/daily-offer", authenticateUser, async (_req, res) => {
  try {
    await ensureSeeded();
    const offer = await getOrCreateDailyOffer();
    if (!offer) {
      res.json({ offer: null });
      return;
    }

    const [product] = await db.select().from(iapProductsTable).where(eq(iapProductsTable.id, offer.productId));

    res.json({
      offer: {
        productId: offer.productId,
        productName: product?.name || offer.productId,
        originalPriceUSD: product?.priceUSD || 0,
        originalPriceDisplay: product ? `$${(product.priceUSD / 100).toFixed(2)}` : null,
        discountPercent: offer.discountPercent,
        discountedPriceUSD: offer.discountedPriceUSD,
        discountedPriceDisplay: `$${(offer.discountedPriceUSD / 100).toFixed(2)}`,
        expiresAt: offer.expiresAt,
        gemsAmount: product?.gemsAmount || 0,
        bonusGems: product?.bonusGems || 0,
        totalGems: (product?.gemsAmount || 0) + (product?.bonusGems || 0),
      },
    });
  } catch (err) {
    console.error("Daily offer error:", err);
    res.status(500).json({ error: "Gunluk teklif yuklenemedi" });
  }
});

const CURRENCY_SINK_COSTS = {
  reroll_quest: 50,
  skip_cooldown: 30,
  instant_boost: 20,
};

router.post("/shop/reroll-quest", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const cost = CURRENCY_SINK_COSTS.reroll_quest;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`);
      const char = charRows.rows?.[0] as any;
      if (!char) throw new Error("Karakter bulunamadi");
      if ((char.gems || 0) < cost) throw new Error("Yeterli Gem yok");

      await tx.execute(sql`UPDATE characters SET gems = gems - ${cost}, updated_at = NOW() WHERE user_id = ${userId}`);

      const today = new Date().toISOString().slice(0, 10);
      await tx.execute(sql`DELETE FROM daily_quests WHERE user_id = ${userId} AND quest_date = ${today} AND status = 'active'`);

      return { gemsSpent: cost, newGems: (char.gems || 0) - cost };
    });

    await logAnalytics(userId, "currency_sink", "reroll_quest", cost);
    res.json({ success: true, ...result, message: "Gorevler yenilendi! Yeni gorevler icin sayfayi yenile." });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Islem basarisiz" });
  }
});

router.post("/shop/skip-cooldown", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const cost = CURRENCY_SINK_COSTS.skip_cooldown;

  try {
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`);
      const char = charRows.rows?.[0] as any;
      if (!char) throw new Error("Karakter bulunamadi");
      if ((char.gems || 0) < cost) throw new Error("Yeterli Gem yok");

      await tx.execute(sql`UPDATE characters SET gems = gems - ${cost}, updated_at = NOW() WHERE user_id = ${userId}`);

      return { gemsSpent: cost, newGems: (char.gems || 0) - cost };
    });

    await logAnalytics(userId, "currency_sink", "skip_cooldown", cost);
    res.json({ success: true, ...result, cooldownSkipped: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Islem basarisiz" });
  }
});

router.post("/shop/instant-boost", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const cost = CURRENCY_SINK_COSTS.instant_boost;

  try {
    const { activeBoostsTable } = await import("@workspace/db/schema");
    const result = await db.transaction(async (tx) => {
      const charRows = await tx.execute(sql`SELECT * FROM characters WHERE user_id = ${userId} FOR UPDATE`);
      const char = charRows.rows?.[0] as any;
      if (!char) throw new Error("Karakter bulunamadi");
      if ((char.gems || 0) < cost) throw new Error("Yeterli Gem yok");

      await tx.execute(sql`UPDATE characters SET gems = gems - ${cost}, updated_at = NOW() WHERE user_id = ${userId}`);

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const boostId = `boost_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tx.execute(sql`DELETE FROM active_boosts WHERE user_id = ${userId}`);
      await tx.insert(activeBoostsTable).values({
        id: boostId,
        userId,
        itemId: "instant_boost_gem",
        multiplier: 150,
        expiresAt,
      });

      return { gemsSpent: cost, newGems: (char.gems || 0) - cost, boostExpiresAt: expiresAt };
    });

    await logAnalytics(userId, "currency_sink", "instant_boost", cost);
    res.json({ success: true, ...result, message: "30 dakika XP x1.5 aktif!" });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Islem basarisiz" });
  }
});

router.get("/analytics/monetization", authenticateUser, async (req, res) => {
  const adminIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  if (!adminIds.includes(req.user!.id)) {
    return res.status(403).json({ error: "Yetkisiz erisim" });
  }
  try {
    const totalViewsResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM purchase_analytics WHERE event_type = 'shop_view'`);
    const totalPurchasesResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM purchase_analytics WHERE event_type = 'purchase_complete'`);
    const revenueResult = await db.execute(sql`SELECT COALESCE(SUM(amount_usd), 0) as total FROM purchase_analytics WHERE event_type = 'purchase_complete'`);
    const uniqueBuyersResult = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as cnt FROM purchase_analytics WHERE event_type = 'purchase_complete'`);
    const topProductsResult = await db.execute(sql`SELECT product_id, COUNT(*) as cnt FROM purchase_analytics WHERE event_type = 'purchase_complete' AND product_id IS NOT NULL GROUP BY product_id ORDER BY cnt DESC LIMIT 5`);
    const sinkUsageResult = await db.execute(sql`SELECT product_id, COUNT(*) as cnt FROM purchase_analytics WHERE event_type = 'currency_sink' AND product_id IS NOT NULL GROUP BY product_id ORDER BY cnt DESC`);

    const totalViews = Number((totalViewsResult.rows?.[0] as any)?.cnt || 0);
    const totalPurchases = Number((totalPurchasesResult.rows?.[0] as any)?.cnt || 0);
    const totalRevenue = Number((revenueResult.rows?.[0] as any)?.total || 0);
    const uniqueBuyers = Number((uniqueBuyersResult.rows?.[0] as any)?.cnt || 0);

    res.json({
      totalViews,
      totalPurchases,
      conversionRate: totalViews > 0 ? ((totalPurchases / totalViews) * 100).toFixed(2) + "%" : "0%",
      totalRevenueUSD: totalRevenue,
      totalRevenueDisplay: `$${(totalRevenue / 100).toFixed(2)}`,
      uniqueBuyers,
      arpu: uniqueBuyers > 0 ? `$${(totalRevenue / uniqueBuyers / 100).toFixed(2)}` : "$0.00",
      topProducts: topProductsResult.rows || [],
      currencySinkUsage: sinkUsageResult.rows || [],
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Analitik yuklenemedi" });
  }
});

export { logAnalytics };

export default router;
