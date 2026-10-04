import type { Language } from "../shared/language";
/** Voice transport only. No cooking state or model decisions. */
export interface SpeechProvider {
  batchToken(signal?: AbortSignal): Promise<string>;
  synthesize(text: string, signal?: AbortSignal, language?: Language): Promise<Response>;
}
