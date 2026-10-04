import type { LLMProvider } from "../application/llm-provider";
import { DEFAULT_FLASH_LITE_MODEL } from "../infrastructure/gemini-flash-lite-provider";
import { DEFAULT_MISTRAL_MODEL } from "../infrastructure/mistral-provider";
import { selectProvider } from "../infrastructure/provider-selection";

export const benchmarkProviderNames = ["gemma", "gemini-flash-lite", "mistral", "mistral-native-schema"] as const;
export interface BenchmarkProvider { name: string; model: string; provider: LLMProvider }

/**
 * Benchmark names keep their recorded meaning: "mistral-native-schema" is the production Mistral provider
 * (native schema per CookingAgent contract); "mistral" is the historical prompt-only variant. Throws on missing configuration.
 */
export function benchmarkProvider(name: string): BenchmarkProvider {
  if (name === "mistral" || name === "mistral-native-schema") {
    const selected = selectProvider({ MISTRAL_API_KEY: process.env.MISTRAL_API_KEY, LLM_PROVIDER: "mistral",
      LLM_MODEL: process.env.BENCH_MISTRAL_MODEL ?? DEFAULT_MISTRAL_MODEL });
    const provider: LLMProvider = name === "mistral" ? { generate: (prompt) => selected.provider.generate(prompt) } : selected.provider;
    return { name, model: selected.model, provider };
  }
  const model = name === "gemma" ? process.env.BENCH_GEMMA_MODEL ?? "gemma-4-26b-a4b-it" : process.env.BENCH_FLASH_LITE_MODEL ?? DEFAULT_FLASH_LITE_MODEL;
  const { provider, model: selectedModel } = selectProvider({ GEMINI_API_KEY: process.env.GEMINI_API_KEY, LLM_PROVIDER: name, LLM_MODEL: model });
  return { name, model: selectedModel, provider };
}
