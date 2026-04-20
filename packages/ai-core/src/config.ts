import { hasCredentials } from "./registry";
import {
  DEFAULT_MODELS,
  PROVIDERS,
  type Feature,
  type ModelSelection,
  type Provider,
  type ProviderCredentials,
} from "./types";

export interface Env {
  DEFAULT_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_KEY?: string;
}

export function credentialsFromEnv(env: Env): ProviderCredentials {
  return {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiKey: env.CLOUDFLARE_API_KEY,
  };
}

function isProvider(value: string | undefined): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolve the model to use for a feature.
 *
 * Precedence:
 *   1. Stored override (e.g. from app_config table) — caller passes it in.
 *   2. DEFAULT_PROVIDER env var, using provider's default model.
 *   3. First provider with credentials configured.
 */
export function resolveModel(
  feature: Feature,
  env: Env,
  override?: ModelSelection | null,
): ModelSelection {
  void feature;
  const credentials = credentialsFromEnv(env);

  if (override && hasCredentials(override.provider, credentials)) {
    return override;
  }

  if (isProvider(env.DEFAULT_PROVIDER) && hasCredentials(env.DEFAULT_PROVIDER, credentials)) {
    return { provider: env.DEFAULT_PROVIDER, modelId: DEFAULT_MODELS[env.DEFAULT_PROVIDER] };
  }

  for (const provider of PROVIDERS) {
    if (hasCredentials(provider, credentials)) {
      return { provider, modelId: DEFAULT_MODELS[provider] };
    }
  }

  throw new Error(
    "No AI provider configured. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
      "GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or " +
      "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_KEY.",
  );
}

export function availableProviders(env: Env): Provider[] {
  const credentials = credentialsFromEnv(env);
  return PROVIDERS.filter((p) => hasCredentials(p, credentials));
}
