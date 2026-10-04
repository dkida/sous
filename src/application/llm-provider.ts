import type { ResponseContract } from "./response-schemas";

/**
 * Returns untrusted JSON text. Providers never receive a store or mutable session.
 * contract names the response shape the caller will validate; a provider with native structured
 * output enforces its schema, others may ignore it. Sous validation always runs afterwards.
 */
export interface LLMProvider {
  generate(prompt: string, contract?: ResponseContract): Promise<string>;
}
