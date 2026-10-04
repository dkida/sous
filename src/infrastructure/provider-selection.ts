import type { LLMProvider } from "../application/llm-provider";
import { GemmaProvider } from "./gemma-provider";
import { DEFAULT_FLASH_LITE_MODEL, GeminiFlashLiteProvider } from "./gemini-flash-lite-provider";

export type ProviderName = "gemma" | "gemini-flash-lite";
export interface ProviderEnvironment {
  GEMINI_API_KEY?: string;
  GEMMA_MODEL?: string;
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
}
export class ProviderConfigurationError extends Error {}

/** Explicit opt-in, never automatic model/provider fallback. */
export function selectProvider(environment: ProviderEnvironment, request: typeof fetch = fetch): {
  name: ProviderName; model: string; provider: LLMProvider;
} {
  const name = environment.LLM_PROVIDER ?? "gemma";
  if (name !== "gemma" && name !== "gemini-flash-lite") {
    throw new ProviderConfigurationError("LLM_PROVIDER must be gemma or gemini-flash-lite (experimental).");
  }
  const model = environment.LLM_MODEL ?? (name === "gemma" ? environment.GEMMA_MODEL ?? "gemma-4-26b-a4b-it" : DEFAULT_FLASH_LITE_MODEL);
  const apiKey = environment.GEMINI_API_KEY ?? "";
  return { name, model, provider: name === "gemma" ? new GemmaProvider(apiKey, model, request) : new GeminiFlashLiteProvider(apiKey, model, request) };
}
