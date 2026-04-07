import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { authTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Yetkilendirme gereklidir" });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: "Geçersiz token" });
    return;
  }

  try {
    const [auth] = await db
      .select()
      .from(authTokensTable)
      .where(eq(authTokensTable.token, token));

    if (!auth) {
      res.status(401).json({ error: "Geçersiz veya süresi dolmuş token" });
      return;
    }

    req.user = { id: auth.userId };
    next();
  } catch {
    res.status(500).json({ error: "Yetkilendirme hatası" });
  }
}
