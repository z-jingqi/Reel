export const PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "cloudflare",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export interface ModelSelection {
  provider: Provider;
  modelId: string;
}

export interface ProviderCredentials {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  deepseekApiKey?: string;
  openrouterApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiKey?: string;
}

export type Feature = "writing" | "chat" | "default";

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-4-7",
  openai: "gpt-4o",
  google: "gemini-2.0-flash-exp",
  deepseek: "deepseek-chat",
  openrouter: "anthropic/claude-opus-4-7",
  cloudflare: "@cf/meta/llama-3.1-70b-instruct",
};
