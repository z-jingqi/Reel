import { inviteCodes, users } from "@reel/database";
import { signinInputSchema, signupInputSchema } from "@reel/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";
import { createSession, destroySession, loadUserFromRequest } from "../lib/auth";
import { hashPassword, newUserId, verifyPassword } from "../lib/crypto";

export const authRouter = new Hono<AppEnv>();

authRouter.post("/signup", zValidator("json", signupInputSchema), async (c) => {
  const { username, password, inviteCode } = c.req.valid("json");
  if (!inviteCode) return c.json({ error: "invite_required" }, 400);

  const db = getDb(c);

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) return c.json({ error: "username_taken" }, 409);

  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(and(eq(inviteCodes.code, inviteCode), isNull(inviteCodes.usedBy)))
    .limit(1);
  if (!invite) return c.json({ error: "invite_invalid" }, 400);
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return c.json({ error: "invite_expired" }, 400);
  }

  const { hash, salt } = await hashPassword(password);
  const userId = newUserId();

  await db.insert(users).values({
    id: userId,
    username,
    passwordHash: hash,
    salt,
    role: "user",
  });

  await db
    .update(inviteCodes)
    .set({ usedBy: userId, usedAt: new Date() })
    .where(eq(inviteCodes.id, invite.id));

  await createSession(c, userId);
  return c.json({ user: { id: userId, username, role: "user" } }, 201);
});

authRouter.post("/signin", zValidator("json", signinInputSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const db = getDb(c);
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!row) return c.json({ error: "invalid_credentials" }, 401);
  const ok = await verifyPassword(password, row.passwordHash, row.salt);
  if (!ok) return c.json({ error: "invalid_credentials" }, 401);

  await createSession(c, row.id);
  return c.json({ user: { id: row.id, username: row.username, role: row.role } });
});

authRouter.post("/signout", async (c) => {
  await destroySession(c);
  return c.body(null, 204);
});

authRouter.get("/me", async (c) => {
  const user = await loadUserFromRequest(c);
  if (!user) return c.json({ user: null });
  return c.json({ user });
});
