import type { LLMProvider } from "../application/llm-provider";
import { GemmaProvider } from "./gemma-provider";
import { DEFAULT_FLASH_LITE_MODEL, GeminiFlashLiteProvider } from "./gemini-flash-lite-provider";
import { DEFAULT_MISTRAL_MODEL, MistralProvider } from "./mistral-provider";

export type ProviderName = "mistral" | "gemma" | "gemini-flash-lite";
export interface ProviderEnvironment {
  MISTRAL_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMMA_MODEL?: string;
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
}
export class ProviderConfigurationError extends Error {}

/**
 * Mistral Small 4 (open weights, native JSON Schema) is the default. Gemma and Gemini Flash-Lite
 * remain explicit, non-default alternates that need GEMINI_API_KEY. Never an automatic fallback.
 */
export function selectProvider(environment: ProviderEnvironment, request: typeof fetch = fetch): {
  name: ProviderName; model: string; provider: LLMProvider;
} {
  const name = environment.LLM_PROVIDER ?? "mistral";
  if (name === "mistral") {
    const model = environment.LLM_MODEL ?? DEFAULT_MISTRAL_MODEL;
    return { name, model, provider: new MistralProvider(environment.MISTRAL_API_KEY ?? "", model, request) };
  }
  if (name !== "gemma" && name !== "gemini-flash-lite") {
    throw new ProviderConfigurationError("LLM_PROVIDER must be mistral (default), gemma or gemini-flash-lite.");
  }
  const model = environment.LLM_MODEL ?? (name === "gemma" ? environment.GEMMA_MODEL ?? "gemma-4-26b-a4b-it" : DEFAULT_FLASH_LITE_MODEL);
  const apiKey = environment.GEMINI_API_KEY ?? "";
  return { name, model, provider: name === "gemma" ? new GemmaProvider(apiKey, model, request) : new GeminiFlashLiteProvider(apiKey, model, request) };
}
