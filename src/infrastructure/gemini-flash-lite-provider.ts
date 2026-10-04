import type { LLMProvider } from "../application/llm-provider";

export class GeminiFlashLiteProviderError extends Error {}
export const DEFAULT_FLASH_LITE_MODEL = "gemini-3.5-flash-lite";

/** Experimental comparison only. Baseline generation settings match hosted Gemma. */
export class GeminiFlashLiteProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_FLASH_LITE_MODEL,
    private readonly request: typeof fetch = fetch,
    // Only the separate schema probe uses this; normal comparisons use prompted JSON.
    private readonly responseSchema?: Record<string, unknown>,
  ) {
    if (!apiKey.trim()) throw new GeminiFlashLiteProviderError("GEMINI_API_KEY is required.");
    if (!/^gemini-[a-z0-9.-]+-flash-lite(?:-[a-z0-9-]+)?$/.test(model)) {
      throw new GeminiFlashLiteProviderError("The experimental model must be a Gemini Flash-Lite model ID.");
    }
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
            generationConfig: {
              temperature: 0.2, maxOutputTokens: 8192,
              ...(this.responseSchema ? { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: this.responseSchema } } } : {}),
            },
          }),
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!response.ok) {
        throw new GeminiFlashLiteProviderError(`Experimental Gemini request failed (HTTP ${response.status}). Check model access and quota; cooking state has not changed.`);
      }
      const data = await response.json();
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason !== "STOP" || !Array.isArray(candidate?.content?.parts)) {
        throw new GeminiFlashLiteProviderError("Experimental Gemini did not return a complete response. Please try again.");
      }
      const text = candidate.content.parts
        .filter((part: { text?: unknown; thought?: boolean }) => !part.thought && typeof part.text === "string")
        .map((part: { text: string }) => part.text).join("");
      if (!text.trim()) throw new GeminiFlashLiteProviderError("Experimental Gemini returned no text. Please try again.");
      if (text.includes(this.apiKey)) throw new GeminiFlashLiteProviderError("Experimental Gemini returned an unsafe response.");
      return text;
    } catch (error) {
      if (error instanceof GeminiFlashLiteProviderError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
        throw new GeminiFlashLiteProviderError("Experimental Gemini request timed out; cooking state has not changed.");
      }
      throw new GeminiFlashLiteProviderError("Experimental Gemini could not be reached or returned an invalid response. Please try again.");
    }
  }
}
