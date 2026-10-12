import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users, type User } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, "passwordHash">;
      sessionId?: string;
    }
  }
}

export const SESSION_COOKIE = "restaurango_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getSessionToken(req: Request) {
  const cookies = req.headers.cookie?.split(";").map((part) => part.trim()) ?? [];
  const cookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null;
}

export function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`,
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    id: hashSessionToken(rawToken),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return rawToken;
}

export async function getUserForRequest(req: Request) {
  const rawToken = getSessionToken(req);
  if (!rawToken) return null;
  const session = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashSessionToken(rawToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const record = session[0];
  if (!record) return null;
  const { passwordHash: _passwordHash, ...safeUser } = record.user;
  return { user: safeUser, sessionId: record.session.id };
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const record = await getUserForRequest(req);
    if (record) {
      req.user = record.user;
      req.sessionId = record.sessionId;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !["staff", "admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Staff access required." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Administrator access required." });
    return;
  }
  next();
}