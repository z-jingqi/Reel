import { createDb, type Database } from "@reel/database";
import type { Context } from "hono";

import type { AppEnv } from "./env";

export function getDb(c: Context<AppEnv>): Database {
  return createDb(c.env.DB);
}
