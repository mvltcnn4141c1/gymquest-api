import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { charactersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../middlewares/auth.js";
import { getEconomyStatus } from "../economy.js";

const router: IRouter = Router();

router.get("/economy", authenticateUser, async (req, res) => {
  const userId = req.user!.id;

  try {
    const [char] = await db
      .select()
      .from(charactersTable)
      .where(eq(charactersTable.userId, userId));

    if (!char) {
      res.status(404).json({ error: "Karakter bulunamadi" });
      return;
    }

    const tz = char.timezone || "Europe/Istanbul";
    const status = await getEconomyStatus(userId, tz);

    res.json({
      balance: {
        gymCoins: char.gymCoins ?? 0,
        gems: char.gems ?? 0,
      },
      daily: status,
      rules: {
        coinSources: ["Antrenman", "Gorevler", "Battle Pass", "Boss oduller"],
        gemSources: ["Zor gorevler", "Battle Pass premium", "Nadir odullerr"],
        sinks: ["Auralar (kozmetik)", "Boost (tuketim)", "Battle Pass acma"],
        dailyCoinCap: status.coinCap,
        dailyGemCap: status.gemCap,
      },
    });
  } catch (err) {
    console.error("Economy status error:", err);
    res.status(500).json({ error: "Ekonomi durumu alinamadi" });
  }
});

export default router;
