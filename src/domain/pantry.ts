import type { Ingredient, Recipe } from "./types";

/**
 * Task 6.2 availability model. Ingredients the cook says they have are available (not mandatory).
 * Only these staples may be assumed without confirmation; names are English/Polish base forms.
 * Everything else (onion, garlic, butter, herbs, cheese, stock, tomato paste/purée/passata,
 * other spices, ...) is unavailable until the cook confirms it.
 */
export const assumedStaples = {
  water: ["water", "woda"],
  salt: ["salt", "sea salt", "table salt", "kosher salt", "sól", "sól morska", "sól kuchenna"],
  "black pepper": ["black pepper", "ground black pepper", "freshly ground black pepper", "pepper",
    "pieprz", "czarny pieprz", "pieprz czarny", "mielony pieprz", "świeżo mielony pieprz"],
  "cooking oil": ["oil", "cooking oil", "neutral oil", "vegetable oil", "sunflower oil", "rapeseed oil", "canola oil",
    "olive oil", "extra virgin olive oil", "extra-virgin olive oil",
    "olej", "olej roślinny", "olej rzepakowy", "olej słonecznikowy", "oliwa", "oliwa z oliwek"],
} as const;
export type AssumedStaple = keyof typeof assumedStaples;

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/gu, " ");
const stapleNames = new Set<string>(Object.values(assumedStaples).flat());

export function isAssumedStaple(name: string): boolean {
  return stapleNames.has(normalize(name));
}

// Whole-word mentions in step prose (English and common Polish forms). "salted"/"boil"/"bell pepper" do not match.
// Water is assumed but not enforced: pasta water and similar unmeasured uses need no structured ingredient.
const word = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "iu");
const mentions: Partial<Record<AssumedStaple, RegExp>> = {
  salt: word("salt|sól|soli|solą|solę|posól|dosól|posolić|dosolić"),
  "black pepper": word("(?<!(?:bell|red|green|yellow|orange|sweet|hot|chil+i|cayenne|white|sichuan|szechuan)\\s)pepper|pieprz|pieprzu|pieprzem|popieprz"),
  "cooking oil": word("oil|olej|oleju|olejem|oliwa|oliwy|oliwę|oliwą|oliwie"),
};

/** Steps whose prose uses salt, black pepper or cooking oil without referencing a matching structured ingredient. */
export function unrepresentedStaples(recipe: Recipe): { stepId: string; staple: AssumedStaple }[] {
  const missing: { stepId: string; staple: AssumedStaple }[] = [];
  for (const step of recipe.steps) {
    const referenced = recipe.ingredients.filter((ingredient) => step.ingredientIds.includes(ingredient.id));
    for (const [staple, pattern] of Object.entries(mentions) as [AssumedStaple, RegExp][]) {
      if (pattern.test(`${step.headline} ${step.instruction}`) && !referenced.some((ingredient) => pattern.test(ingredient.name))) {
        missing.push({ stepId: step.id, staple });
      }
    }
  }
  return missing;
}

export interface IngredientAvailability {
  ingredientId: string;
  /** assumed_staple: named in the staple policy. cook_confirmed: evidence quotes the cook saying they have it. */
  basis: "assumed_staple" | "cook_confirmed";
  evidence: string | null;
}

/** Ingredients an adaptive change would add to the plan (a same-name replacement is a quantity correction, not new). */
export function introducedIngredients(recipe: Recipe, change: {
  originalIngredientId?: string; replacement?: Ingredient | null; additionalIngredients?: Ingredient[];
}): Ingredient[] {
  const original = recipe.ingredients.find((ingredient) => ingredient.id === change.originalIngredientId);
  const replacement = change.replacement && (!original || normalize(original.name) !== normalize(change.replacement.name)) ? [change.replacement] : [];
  return [...replacement, ...(change.additionalIngredients ?? [])];
}

/** True when every introduced ingredient is a policy staple or is backed by a quote from the cook's own words. */
export function ingredientsAvailable(introduced: Ingredient[], availability: IngredientAvailability[], cookStatements: string[]): boolean {
  if (availability.length !== introduced.length) return false;
  const statements = cookStatements.map(normalize);
  return introduced.every((ingredient) => {
    const entry = availability.find((candidate) => candidate.ingredientId === ingredient.id);
    if (!entry) return false;
    if (entry.basis === "assumed_staple") return entry.evidence === null && isAssumedStaple(ingredient.name);
    const quote = normalize(entry.evidence ?? "");
    return quote.length > 0 && statements.some((statement) => statement.includes(quote));
  });
}
