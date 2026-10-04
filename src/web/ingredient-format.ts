import type { Language } from "../shared/language";
import { polishForm } from "./i18n";
import type { Ingredient } from "../domain/types";

const countUnits = new Set(["piece", "pieces", "unit", "units", "item", "items", "whole"]);
// Bounded English food nouns. Unknown/mass nouns retain their name and a count unit.
const nouns: Record<string, string> = {
  carrot: "carrots", onion: "onions", potato: "potatoes", tomato: "tomatoes",
  pepper: "peppers", egg: "eggs", mushroom: "mushrooms", leek: "leeks",
  courgette: "courgettes", zucchini: "zucchini", cucumber: "cucumbers",
  aubergine: "aubergines", eggplant: "eggplants", apple: "apples", lemon: "lemons",
  lime: "limes", orange: "oranges", avocado: "avocados", shallot: "shallots",
  fillet: "fillets", breast: "breasts", thigh: "thighs", sausage: "sausages",
};
const units: Record<string, string> = {
  clove: "cloves", can: "cans", cup: "cups", slice: "slices", stalk: "stalks",
  sprig: "sprigs", bunch: "bunches", head: "heads", teaspoon: "teaspoons",
  tablespoon: "tablespoons", handful: "handfuls",
};
function inflect(word: string, plural: boolean, forms: Record<string, string>): string | null {
  const lower = word.toLowerCase();
  const singular = Object.keys(forms).find((key) => key === lower || forms[key] === lower);
  if (!singular) return null;
  const result = plural ? forms[singular]! : singular;
  return word[0] === word[0]?.toUpperCase() ? result[0]!.toUpperCase() + result.slice(1) : result;
}

/** Display only. Canonical ingredient names, quantities and units are never mutated. */
export function formatIngredient(ingredient: Ingredient, language: Language = "en"): string {
  if (language === "pl") return formatPolishIngredient(ingredient);
  const { name, quantity, unit } = ingredient;
  if (quantity === null) return unit ? `${name} (${unit})` : name;
  const amount = new Intl.NumberFormat("en", { maximumSignificantDigits: 6 }).format(quantity);
  const plural = quantity > 1;
  const normalizedUnit = unit?.trim().toLowerCase();
  if (!unit || (normalizedUnit && countUnits.has(normalizedUnit))) {
    const words = name.trim().split(/\s+/);
    const noun = inflect(words.at(-1)!, plural, nouns);
    if (noun) return `${amount} ${[...words.slice(0, -1), noun].join(" ")}`;
    return unit ? `${amount} ${plural ? "pieces" : "piece"} ${name}` : `${amount} ${name}`;
  }
  return `${amount} ${inflect(unit, plural, units) ?? unit} ${name}`;
}

const polishUnits: Record<string, readonly [string, string, string]> = {
  piece: ["szt.", "szt.", "szt."], clove: ["ząbek", "ząbki", "ząbków"], tsp: ["łyżeczka", "łyżeczki", "łyżeczek"], tbsp: ["łyżka", "łyżki", "łyżek"],
  teaspoon: ["łyżeczka", "łyżeczki", "łyżeczek"], tablespoon: ["łyżka", "łyżki", "łyżek"], cup: ["szklanka", "szklanki", "szklanek"], can: ["puszka", "puszki", "puszek"], slice: ["plaster", "plastry", "plastrów"],
};
const polishNouns: Record<string, readonly [string, string, string]> = {
  marchew: ["marchew", "marchewki", "marchewek"], marchewka: ["marchewka", "marchewki", "marchewek"], cebula: ["cebula", "cebule", "cebul"], ziemniak: ["ziemniak", "ziemniaki", "ziemniaków"], pomidor: ["pomidor", "pomidory", "pomidorów"], jajko: ["jajko", "jajka", "jajek"],
};
const fractionalUnits: Record<string, string> = { clove: "ząbka", tsp: "łyżeczki", tbsp: "łyżki", teaspoon: "łyżeczki", tablespoon: "łyżki", cup: "szklanki", can: "puszki", slice: "plastra" };
function formatPolishIngredient({ name, quantity, unit }: Ingredient): string {
  const normalized = unit?.trim().toLowerCase();
  const displayedUnit = normalized && polishUnits[normalized]
    ? quantity !== null && !Number.isInteger(quantity) ? fractionalUnits[normalized] ?? polishUnits[normalized][2] : polishForm(quantity ?? 1, polishUnits[normalized])
    : unit;
  if (quantity === null) return displayedUnit ? `${name} (${displayedUnit})` : name;
  const amount = new Intl.NumberFormat("pl", { maximumSignificantDigits: 6 }).format(quantity);
  const noun = polishNouns[name.toLowerCase()];
  if ((!unit || normalized && countUnits.has(normalized)) && noun && Number.isInteger(quantity)) return `${amount} ${polishForm(quantity, noun)}`;
  // Labels avoid guessing the grammatical case of arbitrary ingredient names.
  return `${name} — ${amount}${displayedUnit ? ` ${normalized && countUnits.has(normalized) ? "szt." : displayedUnit}` : ""}`;
}
