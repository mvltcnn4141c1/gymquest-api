import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { charactersTable, friendsTable, challengesTable, notificationsTable } from "@workspace/db/schema";
import { eq, and, or, desc, sql, gte } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";

const router: IRouter = Router();

const MAX_FRIENDS = 50;
const CHALLENGE_DURATION_DAYS = 7;
const CHALLENGE_WINNER_GEMS = 15;
const CHALLENGE_WINNER_COINS = 1000;
const MAX_ACTIVE_CHALLENGES = 3;

router.post("/friends/add", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { friendCode } = req.body;

  if (!friendCode || typeof friendCode !== "string") {
    res.status(400).json({ error: "Arkadaş kodu gerekli" });
    return;
  }

  const code = friendCode.trim().toUpperCase();

  const [myChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  if (!myChar) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  if (myChar.friendCode === code) {
    res.status(400).json({ error: "Kendinizi ekleyemezsiniz", code: "SELF_ADD" });
    return;
  }

  const [friendChar] = await db.select().from(charactersTable).where(eq(charactersTable.friendCode, code));
  if (!friendChar) {
    res.status(404).json({ error: "Geçersiz arkadaş kodu", code: "INVALID_CODE" });
    return;
  }

  const myFriends = await db.select({ count: sql<number>`count(*)` })
    .from(friendsTable)
    .where(eq(friendsTable.userId, userId));
  if ((myFriends[0]?.count || 0) >= MAX_FRIENDS) {
    res.status(400).json({ error: "Maksimum arkadaş limitine ulaştınız", code: "FRIEND_LIMIT" });
    return;
  }

  const [existing] = await db.select().from(friendsTable).where(
    and(eq(friendsTable.userId, userId), eq(friendsTable.friendId, friendChar.userId))
  );
  if (existing) {
    res.status(400).json({ error: "Zaten arkadaşsınız", code: "ALREADY_FRIENDS" });
    return;
  }

  const id1 = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  const id2 = (Date.now() + 1).toString() + Math.random().toString(36).substr(2, 6);

  await db.insert(friendsTable).values([
    { id: id1, userId, friendId: friendChar.userId },
    { id: id2, userId: friendChar.userId, friendId: userId },
  ]);

  const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  await db.insert(notificationsTable).values({
    id: notifId,
    userId: friendChar.userId,
    type: "friend_added",
    title: "Yeni Arkadaş!",
    message: `${myChar.name} sizi arkadaş olarak ekledi!`,
    data: JSON.stringify({ friendName: myChar.name, friendUserId: userId }),
  });

  res.json({
    success: true,
    friend: {
      userId: friendChar.userId,
      name: friendChar.name,
      class: friendChar.class,
      race: friendChar.race,
      level: friendChar.level,
    },
  });
});

router.get("/friends", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const friendLinks = await db.select().from(friendsTable).where(eq(friendsTable.userId, userId));

  if (friendLinks.length === 0) {
    const [myChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
    res.json({ friends: [], friendCode: myChar?.friendCode || null });
    return;
  }

  const friendIds = friendLinks.map((f) => f.friendId);
  const friends = await Promise.all(
    friendIds.map(async (fId) => {
      const [c] = await db.select().from(charactersTable).where(eq(charactersTable.userId, fId));
      if (!c) return null;
      const streakActive = c.streakActiveUntil ? new Date(c.streakActiveUntil) > new Date() : false;
      return {
        friendshipId: friendLinks.find((f) => f.friendId === fId)!.id,
        userId: c.userId,
        name: c.name,
        class: c.class,
        race: c.race,
        level: c.level,
        totalXpEarned: c.totalXpEarned,
        league: c.league,
        streakActive,
        questStreak: c.questStreak,
      };
    })
  );

  const [myChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));

  res.json({
    friends: friends.filter(Boolean),
    friendCode: myChar?.friendCode || null,
  });
});

router.delete("/friends/:friendshipId", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { friendshipId } = req.params;

  const [link] = await db.select().from(friendsTable).where(
    and(eq(friendsTable.id, friendshipId), eq(friendsTable.userId, userId))
  );
  if (!link) {
    res.status(404).json({ error: "Arkadaşlık bulunamadı" });
    return;
  }

  await db.delete(friendsTable).where(
    and(eq(friendsTable.userId, userId), eq(friendsTable.friendId, link.friendId))
  );
  await db.delete(friendsTable).where(
    and(eq(friendsTable.userId, link.friendId), eq(friendsTable.friendId, userId))
  );

  res.json({ success: true });
});

router.post("/challenges/create", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { friendUserId, type } = req.body;

  if (!friendUserId) {
    res.status(400).json({ error: "Rakip kullanıcı ID'si gerekli" });
    return;
  }

  const challengeType = type || "weekly_xp";

  const [friendship] = await db.select().from(friendsTable).where(
    and(eq(friendsTable.userId, userId), eq(friendsTable.friendId, friendUserId))
  );
  if (!friendship) {
    res.status(400).json({ error: "Bu kullanıcı arkadaş listenizde değil", code: "NOT_FRIENDS" });
    return;
  }

  const activeChallenges = await db.select({ count: sql<number>`count(*)` })
    .from(challengesTable)
    .where(
      and(
        or(eq(challengesTable.challengerId, userId), eq(challengesTable.challengedId, userId)),
        eq(challengesTable.status, "active")
      )
    );
  if ((activeChallenges[0]?.count || 0) >= MAX_ACTIVE_CHALLENGES) {
    res.status(400).json({ error: `Maksimum ${MAX_ACTIVE_CHALLENGES} aktif düello olabilir`, code: "CHALLENGE_LIMIT" });
    return;
  }

  const [existingChallenge] = await db.select().from(challengesTable).where(
    and(
      or(
        and(eq(challengesTable.challengerId, userId), eq(challengesTable.challengedId, friendUserId)),
        and(eq(challengesTable.challengerId, friendUserId), eq(challengesTable.challengedId, userId))
      ),
      eq(challengesTable.status, "active")
    )
  );
  if (existingChallenge) {
    res.status(400).json({ error: "Bu arkadaşınızla zaten aktif bir düellonuz var", code: "ALREADY_CHALLENGING" });
    return;
  }

  const [myChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, userId));
  const [friendChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, friendUserId));
  if (!myChar || !friendChar) {
    res.status(404).json({ error: "Karakter bulunamadı" });
    return;
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + CHALLENGE_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const challengeId = Date.now().toString() + Math.random().toString(36).substr(2, 6);

  await db.insert(challengesTable).values({
    id: challengeId,
    challengerId: userId,
    challengedId: friendUserId,
    type: challengeType,
    status: "active",
    challengerScore: 0,
    challengedScore: 0,
    startsAt: now,
    endsAt,
  });

  const notifId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  await db.insert(notificationsTable).values({
    id: notifId,
    userId: friendUserId,
    type: "challenge_received",
    title: "Düello Daveti!",
    message: `${myChar.name} seni ${CHALLENGE_DURATION_DAYS} günlük XP düellosuna davet etti!`,
    data: JSON.stringify({ challengeId, challengerName: myChar.name }),
  });

  res.json({
    success: true,
    challenge: {
      id: challengeId,
      type: challengeType,
      opponentName: friendChar.name,
      endsAt,
    },
  });
});

router.get("/challenges", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  const challenges = await db.select().from(challengesTable).where(
    or(eq(challengesTable.challengerId, userId), eq(challengesTable.challengedId, userId))
  ).orderBy(desc(challengesTable.createdAt));

  const enriched = await Promise.all(challenges.map(async (c) => {
    const opponentId = c.challengerId === userId ? c.challengedId : c.challengerId;
    const [opponent] = await db.select().from(charactersTable).where(eq(charactersTable.userId, opponentId));

    const isChallenger = c.challengerId === userId;
    const myScore = isChallenger ? c.challengerScore : c.challengedScore;
    const opponentScore = isChallenger ? c.challengedScore : c.challengerScore;

    return {
      id: c.id,
      type: c.type,
      status: c.status,
      myScore,
      opponentScore,
      opponentName: opponent?.name || "Bilinmeyen",
      opponentClass: opponent?.class || "fighter",
      opponentLevel: opponent?.level || 1,
      winnerId: c.winnerId,
      isWinner: c.winnerId === userId,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      resolvedAt: c.resolvedAt,
    };
  }));

  res.json({
    active: enriched.filter((c) => c.status === "active"),
    completed: enriched.filter((c) => c.status !== "active").slice(0, 20),
  });
});

router.post("/challenges/resolve", authenticateUser, async (req, res) => {
  const userId = req.user!.id;
  const { challengeId } = req.body;

  if (!challengeId) {
    res.status(400).json({ error: "Düello ID'si gerekli" });
    return;
  }

  let winnerId: string | null = null;
  let resolveResult: { challenge: any; winnerId: string | null } | null = null;

  try {
    resolveResult = await db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(challengesTable)
        .where(eq(challengesTable.id, challengeId))
        .for("update");
      if (!challenge) {
        throw { status: 404, error: "Düello bulunamadı" };
      }
      if (challenge.status !== "active") {
        throw { status: 400, error: "Bu düello zaten sonuçlanmış" };
      }
      if (challenge.challengerId !== userId && challenge.challengedId !== userId) {
        throw { status: 403, error: "Bu düelloya erişim yetkiniz yok" };
      }
      const now = new Date();
      if (now < new Date(challenge.endsAt)) {
        throw { status: 400, error: "Düello henüz bitmedi", endsAt: challenge.endsAt };
      }

      let w: string | null = null;
      if (challenge.challengerScore > challenge.challengedScore) {
        w = challenge.challengerId;
      } else if (challenge.challengedScore > challenge.challengerScore) {
        w = challenge.challengedId;
      }

      await tx.update(challengesTable).set({
        status: "completed",
        winnerId: w,
        resolvedAt: now,
      }).where(eq(challengesTable.id, challengeId));

      if (w) {
        await tx.update(charactersTable).set({
          gems: sql`${charactersTable.gems} + ${CHALLENGE_WINNER_GEMS}`,
          gymCoins: sql`${charactersTable.gymCoins} + ${CHALLENGE_WINNER_COINS}`,
          updatedAt: new Date(),
        }).where(eq(charactersTable.userId, w));
      }

      return { challenge, winnerId: w };
    });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.error, endsAt: err.endsAt });
      return;
    }
    throw err;
  }

  const challenge = resolveResult!.challenge;
  winnerId = resolveResult!.winnerId;

  if (winnerId) {

    const [winnerChar] = await db.select().from(charactersTable).where(eq(charactersTable.userId, winnerId));
    const loserId = winnerId === challenge.challengerId ? challenge.challengedId : challenge.challengerId;

    const notifWin = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const notifLose = (Date.now() + 1).toString() + Math.random().toString(36).substr(2, 6);

    await db.insert(notificationsTable).values([
      {
        id: notifWin,
        userId: winnerId,
        type: "challenge_won",
        title: "Düello Kazandın!",
        message: `Düelloyu kazandınız! +${CHALLENGE_WINNER_GEMS} Gem, +${CHALLENGE_WINNER_COINS} Altın!`,
        data: JSON.stringify({ challengeId, gems: CHALLENGE_WINNER_GEMS, coins: CHALLENGE_WINNER_COINS }),
      },
      {
        id: notifLose,
        userId: loserId,
        type: "challenge_lost",
        title: "Düello Sonucu",
        message: `${winnerChar?.name || "Rakip"} düelloyu kazandı. Bir dahaki sefere!`,
        data: JSON.stringify({ challengeId }),
      },
    ]);
  } else {
    const notifDraw1 = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const notifDraw2 = (Date.now() + 1).toString() + Math.random().toString(36).substr(2, 6);
    await db.insert(notificationsTable).values([
      {
        id: notifDraw1,
        userId: challenge.challengerId,
        type: "challenge_draw",
        title: "Düello Berabere!",
        message: "Düello berabere bitti!",
        data: JSON.stringify({ challengeId }),
      },
      {
        id: notifDraw2,
        userId: challenge.challengedId,
        type: "challenge_draw",
        title: "Düello Berabere!",
        message: "Düello berabere bitti!",
        data: JSON.stringify({ challengeId }),
      },
    ]);
  }

  res.json({
    success: true,
    winnerId,
    isDraw: !winnerId,
    rewards: winnerId ? { gems: CHALLENGE_WINNER_GEMS, coins: CHALLENGE_WINNER_COINS } : null,
  });
});

export default router;
