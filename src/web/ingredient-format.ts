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
export function formatIngredient(ingredient: Ingredient): string {
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
