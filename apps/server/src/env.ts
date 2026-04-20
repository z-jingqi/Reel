import type { D1Database } from "@cloudflare/workers-types";

export interface Bindings {
  DB: D1Database;
  ADMIN_API_KEY?: string;
  DEFAULT_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_KEY?: string;
  TMDB_API_KEY?: string;
  RAWG_API_KEY?: string;
  GOOGLE_BOOKS_API_KEY?: string;
}

export type AppEnv = { Bindings: Bindings };
