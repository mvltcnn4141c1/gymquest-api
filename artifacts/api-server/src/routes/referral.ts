import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { charactersTable, referralsTable, notificationsTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

const REFERRAL_REWARD_REFERRER_GEMS = 10;
const REFERRAL_REWARD_REFERRED_GEMS = 5;
const REFERRAL_REWARD_REFERRED_COINS = 500;
const MAX_REFERRALS_PER_DAY = 10;
const MAX_REFERRALS_TOTAL = 50;

router.post("/referral/apply", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { referralCode } = req.body;

  if (!referralCode || typeof referralCode !== "string") {
    res.status(400).json({ error: "Referans kodu gerekli" });
    return;
  }

  const code = referralCode.trim().toUpperCase();

  const [myChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!myChar) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  if (myChar.referredBy) {
    res.status(400).json({ error: "Zaten bir referans kodu kullandınız", code: "ALREADY_REFERRED" });
    return;
  }

  if (myChar.referralCode === code) {
    res.status(400).json({ error: "Kendi referans kodunuzu kullanamazsınız", code: "SELF_REFERRAL" });
    return;
  }

  const [referrer] = await db.select().from(charactersTable).where(eq(charactersTable.referralCode, code));
  if (!referrer) {
    res.status(404).json({ error: "Geçersiz referans kodu", code: "INVALID_CODE" });
    return;
  }

  if (referrer.referralCount >= MAX_REFERRALS_TOTAL) {
    res.status(400).json({ error: "Bu referans kodu limiti doldu", code: "REFERRAL_LIMIT" });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayReferrals = await db
    .select({ count: sql<number>`count(*)` })
    .from(referralsTable)
    .where(
      and(
        eq(referralsTable.referrerId, referrer.userId),
        gte(referralsTable.createdAt, todayStart)
      )
    );

  if ((todayReferrals[0]?.count || 0) >= MAX_REFERRALS_PER_DAY) {
    res.status(429).json({ error: "Bu referans kodu bugün çok fazla kullanıldı", code: "DAILY_LIMIT" });
    return;
  }

  const [existingRef] = await db.select().from(referralsTable).where(eq(referralsTable.referredUserId, userId));
  if (existingRef) {
    res.status(400).json({ error: "Bu hesap zaten referans almış", code: "ALREADY_REFERRED" });
    return;
  }

  const refId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.ip || null;

  await db.transaction(async (tx) => {
    const [lockedMyChar] = await tx.select().from(charactersTable)
      .where(eq(charactersTable.userId, userId))
      .for("update");
    if (lockedMyChar.referredBy) {
      throw { status: 400, error: "Zaten bir referans kodu kullandınız", code: "ALREADY_REFERRED" };
    }

    const [lockedReferrer] = await tx.select().from(charactersTable)
      .where(eq(charactersTable.userId, referrer.userId))
      .for("update");
    if (lockedReferrer.referralCount >= MAX_REFERRALS_TOTAL) {
      throw { status: 400, error: "Bu referans kodu limiti doldu", code: "REFERRAL_LIMIT" };
    }

    await tx.insert(referralsTable).values({
      id: refId,
      referrerId: referrer.userId,
      referredUserId: userId,
      referralCode: code,
      referrerRewardGems: REFERRAL_REWARD_REFERRER_GEMS,
      referredRewardGems: REFERRAL_REWARD_REFERRED_GEMS,
      referredRewardCoins: REFERRAL_REWARD_REFERRED_COINS,
      ipAddress,
    });

    await tx.update(charactersTable)
      .set({
        referredBy: referrer.userId,
        gems: sql`${charactersTable.gems} + ${REFERRAL_REWARD_REFERRED_GEMS}`,
        gymCoins: sql`${charactersTable.gymCoins} + ${REFERRAL_REWARD_REFERRED_COINS}`,
        updatedAt: new Date(),
      })
      .where(eq(charactersTable.userId, userId));

    await tx.update(charactersTable)
      .set({
        gems: sql`${charactersTable.gems} + ${REFERRAL_REWARD_REFERRER_GEMS}`,
        referralCount: sql`${charactersTable.referralCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(charactersTable.userId, referrer.userId));
  });

  const notifId1 = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  const notifId2 = (Date.now() + 1).toString() + Math.random().toString(36).substr(2, 6);

  await db.insert(notificationsTable).values([
    {
      id: notifId1,
      userId: referrer.userId,
      type: "referral_used",
      title: "Referans Kullanıldı!",
      message: `${myChar.name} referans kodunu kullandı! +${REFERRAL_REWARD_REFERRER_GEMS} Gem kazandınız.`,
      data: JSON.stringify({ referredName: myChar.name, gems: REFERRAL_REWARD_REFERRER_GEMS }),
    },
    {
      id: notifId2,
      userId,
      type: "referral_bonus",
      title: "Hoş Geldin Bonusu!",
      message: `Referans bonusu: +${REFERRAL_REWARD_REFERRED_GEMS} Gem, +${REFERRAL_REWARD_REFERRED_COINS} Altın!`,
      data: JSON.stringify({ gems: REFERRAL_REWARD_REFERRED_GEMS, coins: REFERRAL_REWARD_REFERRED_COINS }),
    },
  ]);

  try {
    const { trackEvent } = await import("../trackEvent.js");
    trackEvent(userId, "referral_used", { referrerUserId: referrer.userId, gemsEarned: REFERRAL_REWARD_REFERRED_GEMS, coinsEarned: REFERRAL_REWARD_REFERRED_COINS });
  } catch {}

  res.json({
    success: true,
    rewards: {
      gems: REFERRAL_REWARD_REFERRED_GEMS,
      coins: REFERRAL_REWARD_REFERRED_COINS,
    },
    message: `Referans bonusu: +${REFERRAL_REWARD_REFERRED_GEMS} Gem, +${REFERRAL_REWARD_REFERRED_COINS} Altın!`,
  });
});

router.get("/referral/stats", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const [char] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!char) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, userId));

  res.json({
    referralCode: char.referralCode,
    referralCount: char.referralCount,
    maxReferrals: MAX_REFERRALS_TOTAL,
    totalGemsEarned: referrals.reduce((s, r) => s + r.referrerRewardGems, 0),
    referrals: referrals.map((r) => ({
      referredAt: r.createdAt,
      gemsEarned: r.referrerRewardGems,
    })),
  });
});

export default router;
