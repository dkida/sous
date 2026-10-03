import type { LLMProvider } from "../application/llm-provider";

export class GemmaProviderError extends Error {}

/** Server/CLI only. Credentials travel in a header, never a URL or model prompt. */
export class GemmaProvider implements LLMProvider {
  private readonly model: string;

  constructor(
    private readonly apiKey: string,
    model = "gemma-4-26b-a4b-it",
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new GemmaProviderError("GEMINI_API_KEY is required.");
    if (!/^gemma-[a-z0-9-]+$/.test(model)) throw new GemmaProviderError("GEMMA_MODEL must be a Gemma model ID.");
    this.model = model;
  }

  async generate(prompt: string): Promise<string> {
    try {
      const response = await this.request(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // Prompted JSON works across hosted Gemma models; the application validates it.
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
          }),
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!response.ok) {
        // Do not echo remote error bodies, headers, request objects or credentials.
        if (response.status === 402) {
          throw new GemmaProviderError("Gemma request failed (HTTP 402): prepaid API credits are depleted. Gemma is available on the Free Tier; use a key from a Free Tier project in Google AI Studio. If keeping prepaid billing, restore credits before retrying. Cooking state has not changed.");
        }
        throw new GemmaProviderError(`Gemma request failed (HTTP ${response.status}). Check model access and quota, then retry.`);
      }
      const data = await response.json();
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason !== "STOP" || !Array.isArray(candidate?.content?.parts)) {
        throw new GemmaProviderError("Gemma did not return a complete response. Please try again.");
      }
      const text = candidate.content.parts
        .filter((part: { text?: unknown; thought?: boolean }) => !part.thought && typeof part.text === "string")
        .map((part: { text: string }) => part.text).join("");
      if (!text.trim()) throw new GemmaProviderError("Gemma returned no text. Please try again.");
      // Also prevent accidental credential reflection in model output.
      if (text.includes(this.apiKey)) throw new GemmaProviderError("Gemma returned an unsafe response.");
      return text;
    } catch (error) {
      if (error instanceof GemmaProviderError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        throw new GemmaProviderError("Gemma request timed out. Please try again; cooking state has not changed.");
      }
      throw new GemmaProviderError("Gemma could not be reached or returned an invalid response. Please try again.");
    }
  }
}
