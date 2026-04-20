import { inviteCodes, users } from "@reel/database";
import { inviteCreateInputSchema, signupInputSchema } from "@reel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";
import { hashPassword, newInviteCode, newUserId } from "../lib/crypto";

export const adminRouter = new Hono<AppEnv>();

adminRouter.use("/*", async (c, next) => {
  const configured = c.env.ADMIN_API_KEY;
  if (!configured) {
    return c.json({ error: "admin_not_configured" }, 503);
  }
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !constantTimeEqual(token, configured)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Create an admin account. Username/password required. No invite needed.
// Works whether the users table is empty or not (you can create multiple admins).
adminRouter.post("/setup", zValidator("json", signupInputSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  const db = getDb(c);

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) return c.json({ error: "username_taken" }, 409);

  const { hash, salt } = await hashPassword(password);
  const id = newUserId();
  await db.insert(users).values({
    id,
    username,
    passwordHash: hash,
    salt,
    role: "admin",
  });
  return c.json({ user: { id, username, role: "admin" } }, 201);
});

// Mint an invite code.
adminRouter.post("/invites", zValidator("json", inviteCreateInputSchema), async (c) => {
  const { expiresAt } = c.req.valid("json") ?? {};
  const db = getDb(c);

  // Any admin user owns the mint; pick any for the `created_by` FK.
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) {
    return c.json({ error: "no_admin" }, 400);
  }

  const id = newInviteCode();
  const code = newInviteCode();
  await db.insert(inviteCodes).values({
    id,
    code,
    createdBy: admin.id,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
  return c.json({ code });
});

// List invite codes (active + used + expired).
adminRouter.get("/invites", async (c) => {
  const db = getDb(c);
  const rows = await db.select().from(inviteCodes);
  return c.json({ invites: rows });
});

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
