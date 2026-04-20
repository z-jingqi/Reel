import { sessions, users, type User } from "@reel/database";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { getDb } from "../db";
import type { AppEnv } from "../env";
import { newSessionToken } from "./crypto";

export const SESSION_COOKIE = "reel_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthedUser = Pick<User, "id" | "username" | "role">;

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date) {
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttps,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<string> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);
  const db = getDb(c);
  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt,
  });
  setSessionCookie(c, token, expiresAt);
  return token;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const db = getDb(c);
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  clearSessionCookie(c);
}

export async function loadUserFromRequest(c: Context<AppEnv>): Promise<AuthedUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const db = getDb(c);
  const [row] = await db
    .select({
      sessionExpiresAt: sessions.expiresAt,
      sessionLastActiveAt: sessions.lastActiveAt,
      userId: users.id,
      username: users.username,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token))
    .limit(1);

  if (!row) return null;

  const now = Date.now();
  if (row.sessionExpiresAt.getTime() < now) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  // Sliding expiry: renew cookie + row if nearing expiry.
  if (row.sessionExpiresAt.getTime() - now < RENEW_THRESHOLD_MS) {
    const newExpiry = new Date(now + THIRTY_DAYS_MS);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiry, lastActiveAt: new Date(now) })
      .where(eq(sessions.id, token));
    setSessionCookie(c, token, newExpiry);
  } else if (now - row.sessionLastActiveAt.getTime() > 60_000) {
    await db
      .update(sessions)
      .set({ lastActiveAt: new Date(now) })
      .where(eq(sessions.id, token));
  }

  return { id: row.userId, username: row.username, role: row.role };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await loadUserFromRequest(c);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
};
