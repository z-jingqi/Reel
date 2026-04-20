import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { ModelSelection, ProviderCredentials } from "./types";

export function getModelInstance(
  selection: ModelSelection,
  credentials: ProviderCredentials,
): LanguageModel {
  const { provider, modelId } = selection;

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: credentials.anthropicApiKey });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: credentials.openaiApiKey });
      return openai(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: credentials.googleApiKey });
      return google(modelId);
    }
    case "deepseek": {
      // DeepSeek is OpenAI-compatible.
      const deepseek = createOpenAI({
        apiKey: credentials.deepseekApiKey,
        baseURL: "https://api.deepseek.com/v1",
      });
      return deepseek(modelId);
    }
    case "openrouter": {
      const openrouter = createOpenAI({
        apiKey: credentials.openrouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      return openrouter(modelId);
    }
    case "cloudflare": {
      if (!credentials.cloudflareAccountId || !credentials.cloudflareApiKey) {
        throw new Error("Cloudflare Workers AI requires cloudflareAccountId + cloudflareApiKey");
      }
      // Workers AI is OpenAI-compatible via the /ai/v1 endpoint.
      const cf = createOpenAI({
        apiKey: credentials.cloudflareApiKey,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${credentials.cloudflareAccountId}/ai/v1`,
      });
      return cf(modelId);
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive as string}`);
    }
  }
}

export function hasCredentials(
  provider: ModelSelection["provider"],
  credentials: ProviderCredentials,
): boolean {
  switch (provider) {
    case "anthropic":
      return Boolean(credentials.anthropicApiKey);
    case "openai":
      return Boolean(credentials.openaiApiKey);
    case "google":
      return Boolean(credentials.googleApiKey);
    case "deepseek":
      return Boolean(credentials.deepseekApiKey);
    case "openrouter":
      return Boolean(credentials.openrouterApiKey);
    case "cloudflare":
      return Boolean(credentials.cloudflareAccountId && credentials.cloudflareApiKey);
  }
}
