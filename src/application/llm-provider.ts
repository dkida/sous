/** Returns untrusted JSON text. Providers never receive a store or mutable session. */
export interface LLMProvider {
  generate(prompt: string): Promise<string>;
}
