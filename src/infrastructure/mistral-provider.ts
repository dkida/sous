import type { LLMProvider } from "../application/llm-provider";
import type { ResponseContract } from "../application/response-schemas";

export class MistralProviderError extends Error {}
// Mistral Small 4, Apache 2.0 open weights, hosted on La Plateforme.
export const DEFAULT_MISTRAL_MODEL = "mistral-small-2603";

/** Default Sous reasoning provider. Server/CLI only: the key travels in a header, never a URL or prompt. */
export class MistralProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_MISTRAL_MODEL,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new MistralProviderError("MISTRAL_API_KEY is required.");
    if (!/^mistral-small-\d{4}$/.test(model)) throw new MistralProviderError("The Mistral model must be a pinned open-weight Mistral Small model ID, such as mistral-small-2603.");
  }

  async generate(prompt: string, contract?: ResponseContract): Promise<string> {
    try {
      const response = await this.request("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        // Native strict JSON Schema for the caller's contract; the prompt still describes the shape. Default reasoning behavior.
        body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 8192,
          ...(contract ? { response_format: { type: "json_schema", json_schema: { name: contract.name, schema: contract.schema, strict: true } } } : {}) }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        throw new MistralProviderError(`Mistral request failed (HTTP ${response.status}). Check model access and quota; cooking state has not changed.`);
      }
      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason !== "stop" || (typeof content !== "string" && !Array.isArray(content))) {
        throw new MistralProviderError("Mistral did not return a complete response. Please try again.");
      }
      // Content may be chunked; reasoning ("thinking") chunks are never returned to the agent.
      const text = typeof content === "string" ? content : content
        .filter((chunk: { type?: unknown; text?: unknown }) => chunk?.type === "text" && typeof chunk.text === "string")
        .map((chunk: { text: string }) => chunk.text).join("");
      if (!text.trim()) throw new MistralProviderError("Mistral returned no text. Please try again.");
      if (text.includes(this.apiKey)) throw new MistralProviderError("Mistral returned an unsafe response.");
      return text;
    } catch (error) {
      if (error instanceof MistralProviderError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        throw new MistralProviderError("Mistral request timed out; cooking state has not changed.");
      }
      throw new MistralProviderError("Mistral could not be reached or returned an invalid response. Please try again.");
    }
  }
}
