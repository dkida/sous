import type { Ingredient, Recipe, RecipeStep } from "../domain/types";
import type { Language } from "../shared/language";
import { formatIngredient } from "./ingredient-format";
import { polishForm } from "./i18n";

const units: Record<string, { en: [string, string]; pl: [string, string, string]; aliases: string[] }> = {
  g: { en: ["gram", "grams"], pl: ["gram", "gramy", "gramów"], aliases: ["g", "grams?", "gram(?:a|y|ów)?"] },
  kg: { en: ["kilogram", "kilograms"], pl: ["kilogram", "kilogramy", "kilogramów"], aliases: ["kg", "kilograms?", "kilogram(?:a|y|ów)?"] },
  ml: { en: ["millilitre", "millilitres"], pl: ["mililitr", "mililitry", "mililitrów"], aliases: ["ml", "millilit(?:re|er)s?", "mililitr(?:a|y|ów)?"] },
  l: { en: ["litre", "litres"], pl: ["litr", "litry", "litrów"], aliases: ["l", "lit(?:re|er)s?", "litr(?:a|y|ów)?"] },
  tsp: { en: ["teaspoon", "teaspoons"], pl: ["łyżeczka", "łyżeczki", "łyżeczek"], aliases: ["tsp", "teaspoons?", "łyżeczk(?:a|i|ę|ek)"] },
  tbsp: { en: ["tablespoon", "tablespoons"], pl: ["łyżka", "łyżki", "łyżek"], aliases: ["tbsp", "tablespoons?", "łyż(?:ka|ki|kę|ek)"] },
  clove: { en: ["clove", "cloves"], pl: ["ząbek", "ząbki", "ząbków"], aliases: ["cloves?", "ząb(?:ek|ka|ki|ków)"] },
  can: { en: ["can", "cans"], pl: ["puszka", "puszki", "puszek"], aliases: ["cans?", "pusz(?:ka|ki|kę|ek)"] },
  cup: { en: ["cup", "cups"], pl: ["szklanka", "szklanki", "szklanek"], aliases: ["cups?", "szklan(?:ka|ki|kę|ek)"] },
};
const unitKeys: Record<string, string> = { grams: "g", gram: "g", kilograms: "kg", kilogram: "kg", teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp", cloves: "clove", cans: "can", cups: "cup" };
const counts = /^(?:pieces?|units?|items?|whole|szt\.?|sztuki?)$/iu;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Bounded forms for common ingredients; unknown nouns keep their literal name.
const nouns: Record<string, string> = {
  makaron: "makaron(?:u|em)?", cebula: "cebul(?:a|ę|e|i)?", marchew: "marchew(?:kę|ki|ek|ka)?",
  marchewka: "marchew(?:kę|ki|ek|ka)?", pomidor: "pomidor(?:y|a|ów)?", pomidory: "pomidor(?:y|a|ów)?",
  śmietana: "śmietan(?:a|ę|y)", czosnek: "czosn(?:ek|ku)", onion: "onions?", onions: "onions?",
  carrot: "carrots?", carrots: "carrots?", tomato: "tomato(?:es)?", tomatoes: "tomato(?:es)?",
  koktajlowe: "koktajlow(?:e|ych|ymi)",
};

function unitFor(ingredient: Ingredient) {
  const unit = ingredient.unit?.toLowerCase().trim() ?? "";
  return units[unitKeys[unit] ?? unit];
}

/** Detect an amount bound to this ingredient, including partial amounts in the instruction.
 * Do not mistake an unrelated timer or temperature for an ingredient quantity. */
function hasAmount(instruction: string, ingredient: Ingredient): boolean {
  // Fat percentages describe the product, not a distinct quantity/use (śmietana 30%).
  const name = ingredient.name.toLowerCase().replace(/\s*\(?\d+(?:[.,]\d+)?\s*%\)?/gu, "").trim()
    .split(/\s+/u).map((word) => nouns[word] ?? escape(word)).join("\\s+");
  const numberWords = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|half|quarter|jed(?:ną|na|en|no|nej)|dwa|dwie|dwóch|trzy|trzech|cztery|czterech|pięć|sześć|siedem|osiem|dziewięć|dziesięć|dwadzieścia|trzydzieści|czterdzieści|pięćdziesiąt|sto|dwieście|trzysta|czterysta|pięćset|sześćset|siedemset|osiemset|dziewięćset|tysiąc|pół";
  const value = `(?:\\d+(?:[.,]\\d+)?(?:[ /]\\d+)?|(?:${numberWords})(?:[ -](?:${numberWords})){0,5}|a|an)`;
  const unit = unitFor(ingredient);
  const unitPattern = unit ? `(?:${unit.aliases.join("|")})\\.?\\s*(?:of\\s+)?`
    : ingredient.unit && !counts.test(ingredient.unit) ? `${escape(ingredient.unit)}\\s*(?:of\\s+)?`
    : "(?:(?:pieces?|szt\\.?|sztuk(?:a|i)?)\\s+)?";
  const amount = `${value}\\s*${unitPattern}`;
  // At most three descriptive words, e.g. "one finely chopped onion".
  const adjectives = "(?:[\\p{L}-]+\\s+){0,3}";
  return new RegExp(`(?:^|[^\\p{L}\\d])(?:${amount}${adjectives}${name}|${name}\\s*[:—,(]?\\s*${amount})(?=$|[^\\p{L}\\d])`, "iu").test(instruction);
}

function spokenIngredient(ingredient: Ingredient, language: Language): string {
  const unit = unitFor(ingredient);
  const amount = new Intl.NumberFormat(language, { maximumSignificantDigits: 10 }).format(ingredient.quantity!);
  if (language === "en") return formatIngredient({ ...ingredient, unit: unit ? unit.en[ingredient.quantity === 1 ? 0 : 1] : ingredient.unit });
  // Labels preserve arbitrary Polish names without guessing grammatical case.
  const count = !ingredient.unit || counts.test(ingredient.unit);
  const label = unit ? polishForm(ingredient.quantity!, unit.pl)
    : count ? polishForm(ingredient.quantity!, ["sztuka", "sztuki", "sztuk"]) : ingredient.unit;
  return `${ingredient.name}, ${amount}${label ? ` ${label}` : ""}`;
}

/** Speak the full instruction and only missing, known quantities for THIS step.
 * Instruction remains authoritative for timing, heat, safety and partial use. */
export function spokenStep(step: RecipeStep, recipe: Recipe, language: Language = "en"): string {
  const missing = recipe.ingredients.filter((ingredient) => step.ingredientIds.includes(ingredient.id) &&
    ingredient.quantity !== null && !hasAmount(step.instruction, ingredient));
  if (!missing.length) return step.instruction;
  const instruction = step.instruction.trim();
  return `${instruction}${/[.!?]$/u.test(instruction) ? "" : "."} ${language === "pl" ? "Do tego kroku" : "For this step"}: ${missing.map((ingredient) => spokenIngredient(ingredient, language)).join("; ")}.`;
}
