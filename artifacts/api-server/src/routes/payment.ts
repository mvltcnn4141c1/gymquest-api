import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iapProductsTable, iapPurchasesTable,
  charactersTable, userBattlePassTable, seasonsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";
import { rateLimiter } from "../middlewares/rate-limiter.js";
import { validateUserAction, createEndpointRateLimiter, logSuspiciousActivity } from "../middlewares/anticheat.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const paymentRateLimiter = createEndpointRateLimiter(5);

router.post("/payment/create-session", authenticateUser, rateLimiter, paymentRateLimiter, validateUserAction, async (req, res) => {
  const userId = req.user!.id;
  const { productId } = req.body as { productId?: string };

  if (!productId) {
    res.status(400).json({ error: "productId zorunludur" });
    return;
  }

  let stripe;
  try {
    stripe = await getUncachableStripeClient();
  } catch (connErr: any) {
    logger.error({ err: connErr }, "Stripe client unavailable");
    res.status(503).json({ error: "Odeme sistemi su anda kullanilamiyor" });
    return;
  }

  try {
    const [product] = await db.select().from(iapProductsTable).where(eq(iapProductsTable.id, productId));
    if (!product || product.isActive !== 1) {
      res.status(404).json({ error: "Urun bulunamadi veya aktif degil" });
      return;
    }

    if (!product.priceUSD || product.priceUSD <= 0) {
      logger.error({ productId, priceUSD: product.priceUSD }, "Invalid product price");
      res.status(400).json({ error: "Urun fiyati gecersiz" });
      return;
    }

    const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
    if (!char) {
      res.status(404).json({ error: "Karakter bulunamadi" });
      return;
    }

    const purchaseId = `iap_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const idempotencyKey = `stripe_${userId}_${productId}_${Date.now()}`;

    await db.insert(iapPurchasesTable).values({
      id: purchaseId,
      userId,
      productId,
      amountUSD: product.priceUSD,
      gemsGranted: 0,
      status: "pending",
      idempotencyKey,
    });

    const domainStr = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || '';
    const domain = domainStr.split(',')[0];
    if (!domain) {
      logger.error("No domain available for Stripe redirect URLs");
      await db.update(iapPurchasesTable).set({ status: "failed" }).where(eq(iapPurchasesTable.id, purchaseId));
      res.status(503).json({ error: "Odeme sistemi su anda kullanilamiyor" });
      return;
    }
    const baseUrl = `https://${domain}`;

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: product.description || undefined,
            },
            unit_amount: product.priceUSD,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/api/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/api/payment/cancel`,
        metadata: {
          purchaseId,
          userId,
          productId,
        },
      });
    } catch (stripeErr: any) {
      await db.update(iapPurchasesTable)
        .set({ status: "failed" })
        .where(eq(iapPurchasesTable.id, purchaseId));
      logger.error({
        purchaseId,
        stripeCode: stripeErr?.code,
        stripeType: stripeErr?.type,
        stripeMessage: stripeErr?.message,
      }, "Stripe checkout session creation failed");
      const userMessage = stripeErr?.type === 'StripeAuthenticationError'
        ? "Odeme sistemi yapilandirma hatasi"
        : "Odeme oturumu olusturulamadi, lutfen tekrar deneyin";
      res.status(502).json({ error: userMessage });
      return;
    }

    await db.update(iapPurchasesTable)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(iapPurchasesTable.id, purchaseId));

    try {
      const { trackEvent } = await import("../trackEvent.js");
      trackEvent(userId, "purchase_started", { productId, amountUSD: product.priceUSD / 100, purchaseId });
    } catch {}

    res.json({
      purchaseId,
      sessionId: session.id,
      sessionUrl: session.url,
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
    });
  } catch (err) {
    logger.error({ err }, "Payment session creation unexpected error");
    res.status(500).json({ error: "Odeme sistemi su anda kullanilamiyor" });
  }
});

async function fulfillPurchase(purchaseId: string, stripeSessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await db.transaction(async (tx) => {
      const purchaseRows = await tx.execute(
        sql`SELECT * FROM iap_purchases WHERE id = ${purchaseId} FOR UPDATE`
      );
      const purchase = purchaseRows.rows?.[0] as any;
      if (!purchase) return { success: false, error: "Purchase not found" };

      if (purchase.status === "completed") {
        return { success: true };
      }

      if (purchase.status !== "pending") {
        return { success: false, error: `Invalid status: ${purchase.status}` };
      }

      if (purchase.stripe_checkout_session_id && purchase.stripe_checkout_session_id !== stripeSessionId) {
        return { success: false, error: "Session ID mismatch" };
      }

      const [product] = await tx.select().from(iapProductsTable).where(eq(iapProductsTable.id, purchase.product_id));
      if (!product) return { success: false, error: "Product not found" };

      if (purchase.amount_usd !== product.priceUSD) {
        return { success: false, error: `Amount mismatch: purchase=${purchase.amount_usd} product=${product.priceUSD}` };
      }

      const charRows = await tx.execute(
        sql`SELECT * FROM characters WHERE user_id = ${purchase.user_id} FOR UPDATE`
      );
      const char = charRows.rows?.[0] as any;
      if (!char) return { success: false, error: "Character not found" };

      let totalGems = product.gemsAmount + product.bonusGems;

      const isFirstPurchase = !char.has_purchased;
      if (isFirstPurchase && totalGems > 0) {
        totalGems = totalGems * 2;
      }

      await tx.execute(
        sql`UPDATE iap_purchases SET status = 'completed', gems_granted = ${totalGems}, completed_at = NOW(), stripe_checkout_session_id = ${stripeSessionId} WHERE id = ${purchaseId}`
      );

      if (totalGems > 0) {
        await tx.execute(
          sql`UPDATE characters SET gems = gems + ${totalGems}, has_purchased = true, updated_at = NOW() WHERE user_id = ${purchase.user_id}`
        );
      } else {
        await tx.execute(
          sql`UPDATE characters SET has_purchased = true, updated_at = NOW() WHERE user_id = ${purchase.user_id}`
        );
      }

      if (purchase.product_id === "whale_pack" && !char.exclusive_badge) {
        await tx.execute(
          sql`UPDATE characters SET exclusive_badge = 'whale_legend' WHERE user_id = ${purchase.user_id}`
        );
      }

      if (product.includesBattlePass === 1) {
        const [activeSeason] = await tx.select().from(seasonsTable).where(eq(seasonsTable.isActive, true));
        if (activeSeason) {
          const [existingPass] = await tx
            .select()
            .from(userBattlePassTable)
            .where(and(
              eq(userBattlePassTable.userId, purchase.user_id),
              eq(userBattlePassTable.seasonId, activeSeason.id)
            ));

          if (existingPass && !existingPass.hasPremium) {
            await tx.update(userBattlePassTable)
              .set({ hasPremium: true, updatedAt: new Date() })
              .where(eq(userBattlePassTable.id, existingPass.id));
          } else if (!existingPass) {
            const passId = `ubp_${purchase.user_id}_${activeSeason.id.slice(0, 12)}_${Math.random().toString(36).substr(2, 6)}`;
            await tx.insert(userBattlePassTable).values({
              id: passId,
              userId: purchase.user_id,
              seasonId: activeSeason.id,
              currentLevel: 1,
              currentXp: 0,
              totalXpEarned: 0,
              hasPremium: true,
            });
          }
        }
      }

      return { success: true };
    });

    return result;
  } catch (err) {
    logger.error({ err, purchaseId }, "Fulfillment error");
    return { success: false, error: "Fulfillment transaction failed" };
  }
}

export async function handleCheckoutSessionCompleted(session: any): Promise<{ success: boolean; error?: string }> {
  const purchaseId = session.metadata?.purchaseId;
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;

  if (!purchaseId || !userId || !productId) {
    logger.warn({ sessionId: session.id }, "Checkout session missing metadata");
    return { success: true };
  }

  const expectedAmount = session.amount_total;
  const [product] = await db.select().from(iapProductsTable).where(eq(iapProductsTable.id, productId));
  if (!product) {
    logger.error({ productId, sessionId: session.id }, "Product not found for completed session");
    return { success: false, error: "Product not found" };
  }

  if (expectedAmount !== product.priceUSD) {
    logger.error({
      sessionId: session.id,
      expectedAmount: product.priceUSD,
      actualAmount: expectedAmount,
    }, "Amount mismatch in checkout session");
    return { success: false, error: "Amount mismatch" };
  }

  await db.update(iapPurchasesTable)
    .set({ stripePaymentIntentId: session.payment_intent || null })
    .where(eq(iapPurchasesTable.id, purchaseId));

  const result = await fulfillPurchase(purchaseId, session.id);

  if (result.success) {
    logger.info({ purchaseId, userId, productId }, "Purchase fulfilled via Stripe webhook");
    try {
      const { logAnalytics } = await import("./shop.js");
      await logAnalytics(userId, "purchase_complete", productId, expectedAmount);
    } catch {}
    try {
      const { trackEvent } = await import("../trackEvent.js");
      trackEvent(userId, "purchase_completed", { productId, amountUSD: expectedAmount / 100, purchaseId });
    } catch {}
  } else {
    logger.error({ purchaseId, error: result.error }, "Purchase fulfillment failed via Stripe webhook");
  }

  return result;
}

router.get("/payment/success", async (_req, res) => {
  res.json({ message: "Odeme basarili! Uygulama uzerinden odullerinizi kontrol edin." });
});

router.get("/payment/cancel", async (_req, res) => {
  res.json({ message: "Odeme iptal edildi." });
});

export default router;
