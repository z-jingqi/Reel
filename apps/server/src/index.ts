import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { AppEnv } from "./env";
import { requireAuth } from "./lib/auth";
import { adminRouter } from "./routes/admin";
import { aiRouter } from "./routes/ai";
import { articlesRouter } from "./routes/articles";
import { authRouter } from "./routes/auth";
import { categoriesRouter } from "./routes/categories";
import { configRouter } from "./routes/config";
import { itemsRouter } from "./routes/items";
import { lookupRouter } from "./routes/lookup";
import { memoriesRouter } from "./routes/memories";
import { peopleRouter } from "./routes/people";
import { referencesRouter } from "./routes/references";
import { searchRouter } from "./routes/search";
import { seasonsRouter } from "./routes/seasons";
import { tagsRouter } from "./routes/tags";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));

// Public auth endpoints — registered before the requireAuth guard so they
// bypass it via terminal response.
app.route("/api/auth", authRouter);

// Admin endpoints — gated by their own bearer-token middleware.
app.route("/api/admin", adminRouter);

// Guard every other /api/* route.
app.use("/api/*", requireAuth);

app.route("/api/items", itemsRouter);
app.route("/api/seasons", seasonsRouter);
app.route("/api/articles", articlesRouter);
app.route("/api/categories", categoriesRouter);
app.route("/api/references", referencesRouter);
app.route("/api/tags", tagsRouter);
app.route("/api/ai", aiRouter);
app.route("/api/memories", memoriesRouter);
app.route("/api/people", peopleRouter);
app.route("/api/lookup", lookupRouter);
app.route("/api/search", searchRouter);
app.route("/api/config", configRouter);

export default app;
export type AppType = typeof app;
