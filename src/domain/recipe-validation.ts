import type { Recipe } from "./types";

export class InvalidRecipeError extends Error {}

function invalid(message: string): never {
  throw new InvalidRecipeError(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Runtime boundary: build a detached Recipe from untrusted input. */
export function validateRecipe(value: unknown): Recipe {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "title", "servings", "ingredients", "steps"])) {
    invalid("Expected a recipe object with only recipe fields.");
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.title)) {
    invalid("Recipe ID and title must be non-empty strings.");
  }
  if (typeof value.servings !== "number" || !Number.isSafeInteger(value.servings) || value.servings <= 0) {
    invalid("Recipe servings must be a positive integer.");
  }
  if (!Array.isArray(value.ingredients) || value.ingredients.length === 0) {
    invalid("A recipe must contain at least one ingredient.");
  }
  const ingredientIds = new Set<string>();
  const ingredients = value.ingredients.map((ingredient: unknown) => {
    if (!isRecord(ingredient) || !hasOnlyKeys(ingredient, ["id", "name", "quantity", "unit"]) ||
        !isNonEmptyString(ingredient.id) || !isNonEmptyString(ingredient.name)) {
      invalid("Ingredients require non-empty IDs and names, and only ingredient fields.");
    }
    const id = ingredient.id.trim();
    if (ingredientIds.has(id)) invalid("Ingredient IDs must be unique.");
    ingredientIds.add(id);
    if (ingredient.quantity !== null && (typeof ingredient.quantity !== "number" ||
        !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0)) {
      invalid("Ingredient quantities must be positive finite numbers or null.");
    }
    if (ingredient.unit !== null && !isNonEmptyString(ingredient.unit)) {
      invalid("Ingredient units must be non-empty strings or null.");
    }
    return { id, name: ingredient.name.trim(), quantity: ingredient.quantity, unit: ingredient.unit?.trim() ?? null };
  });
  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    invalid("A recipe must contain at least one step.");
  }
  const stepIds = new Set<string>();
  const steps = value.steps.map((step: unknown) => {
    if (!isRecord(step) || !hasOnlyKeys(step, ["id", "instruction", "ingredientIds"]) || !isNonEmptyString(step.id)) {
      invalid("Recipe step IDs must be non-empty and unique.");
    }
    const id = step.id.trim();
    if (stepIds.has(id)) invalid("Recipe step IDs must be non-empty and unique.");
    stepIds.add(id);
    if (!isNonEmptyString(step.instruction)) invalid("Step instructions must be non-empty strings.");
    if (!Array.isArray(step.ingredientIds) || !step.ingredientIds.every(isNonEmptyString)) {
      invalid("Step ingredient references must be an array of ingredient IDs.");
    }
    const references = step.ingredientIds.map((reference) => reference.trim());
    if (references.some((reference) => !ingredientIds.has(reference)) || new Set(references).size !== references.length) {
      invalid("Step ingredient references must be known and unique.");
    }
    return { id, instruction: step.instruction.trim(), ingredientIds: references };
  });
  return { id: value.id.trim(), title: value.title.trim(), servings: value.servings, ingredients, steps };
}
