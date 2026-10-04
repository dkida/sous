/** Presentation/session context only; cooking actions and domain state stay language-independent. */
export type Language = "en" | "pl";
export const languages = ["en", "pl"] as const;
export function isLanguage(value: unknown): value is Language { return value === "en" || value === "pl"; }
export const speechLanguage = {
  en: { stt: "eng", tts: "en" },
  pl: { stt: "pol", tts: "pl" },
} as const;
export function outputLanguage(language: Language): string {
  return `Selected output language: ${language === "pl" ? "Polish (pl)" : "English (en)"}. Write ALL human-readable output in ${language === "pl" ? "natural Polish" : "English"}: dish names, descriptions, ingredient names, instructions, messages, advice, questions and reasons. This applies even if the user writes in another language. Keep JSON field names, action types, IDs and standard unit codes language-independent. Use base-form ingredient names and standard unit codes (g, kg, ml, l, piece, clove, tsp, tbsp). Preserve exact evidence quotes from the user and existing canonical names/IDs where the protocol requires them. Examples illustrate the schema, not the output language.`;
}
