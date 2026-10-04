import { speechLanguage, type Language } from "../shared/language";
import type { SpeechProvider } from "../web/speech-provider";

export class ElevenLabsProvider implements SpeechProvider {
  constructor(private readonly key: string, private readonly voiceId = "JBFqnCBsd6RMkjVDRZzb", private readonly transport: typeof fetch = fetch) {
    if (!key?.trim() || !/^[a-zA-Z0-9_-]+$/.test(voiceId)) throw new Error("Voice is not configured.");
  }
  private signal(signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(30_000);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }
  async batchToken(signal?: AbortSignal): Promise<string> {
    const response = await this.transport("https://api.elevenlabs.io/v1/single-use-token/batch_scribe", {
      method: "POST", headers: { "xi-api-key": this.key }, signal: this.signal(signal),
    });
    if (!response.ok) throw new Error("Voice is unavailable.");
    const body = await response.json();
    if (typeof body.token !== "string" || !body.token) throw new Error("Voice is unavailable.");
    return body.token;
  }
  async synthesize(text: string, signal?: AbortSignal, language: Language = "en"): Promise<Response> {
    const response = await this.transport(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5", language_code: speechLanguage[language].tts }), signal: this.signal(signal),
    });
    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("audio/")) throw new Error("Speech is unavailable.");
    return response;
  }
}
