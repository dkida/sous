import { hasOnlyKeys, isNonEmptyString, isRecord, validateRecipe } from "./recipe-validation";
import type { Ingredient, RecipeStep } from "./types";

export interface RemainingPlanChanges {
  stepUpdates: RecipeStep[];
  additionalIngredients: Ingredient[];
}

export type AdaptiveAction =
  | ({ type: "ingredient_change"; message: string; originalIngredientId: string;
      replacement: Ingredient | null; reason: string } & RemainingPlanChanges)
  | ({ type: "scale_servings"; message: string; servings: number;
      unscaledIngredientIds: string[] } & RemainingPlanChanges)
  | ({ type: "cooking_problem"; message: string } & RemainingPlanChanges)
  | { type: "reconcile_progress"; message: string; completedSteps: { stepId: string; evidence: string }[] }
  | { type: "clarification"; message: string };

export class InvalidAdaptiveActionError extends Error {}

function invalid(): never {
  throw new InvalidAdaptiveActionError("The adaptive action is invalid or cannot apply to this cooking state. State has not changed; please clarify or try again.");
}

/** Shape validation is independent of session state. The store checks applicability. */
export function validateAdaptiveAction(value: unknown): AdaptiveAction {
  if (!isRecord(value) || !isNonEmptyString(value.message)) invalid();
  const common = ["type", "message"];
  const plan = ["stepUpdates", "additionalIngredients"];
  switch (value.type) {
    case "clarification":
      if (!hasOnlyKeys(value, common)) invalid();
      break;
    case "reconcile_progress":
      if (!hasOnlyKeys(value, [...common, "completedSteps"]) ||
          !Array.isArray(value.completedSteps) || value.completedSteps.length === 0) invalid();
      for (const step of value.completedSteps) {
        if (!isRecord(step) || !hasOnlyKeys(step, ["stepId", "evidence"]) ||
            !isNonEmptyString(step.stepId) || !isNonEmptyString(step.evidence)) invalid();
      }
      break;
    case "ingredient_change":
      if (!hasOnlyKeys(value, [...common, ...plan, "originalIngredientId", "replacement", "reason"]) ||
          !isNonEmptyString(value.originalIngredientId) || !isNonEmptyString(value.reason) ||
          (value.replacement !== null && !validIngredient(value.replacement))) invalid();
      validatePlan(value);
      break;
    case "scale_servings":
      if (!hasOnlyKeys(value, [...common, ...plan, "servings", "unscaledIngredientIds"]) ||
          typeof value.servings !== "number" || !Number.isSafeInteger(value.servings) || value.servings <= 0 ||
          !Array.isArray(value.unscaledIngredientIds) || !value.unscaledIngredientIds.every(isNonEmptyString) ||
          new Set(value.unscaledIngredientIds).size !== value.unscaledIngredientIds.length) invalid();
      validatePlan(value);
      break;
    case "cooking_problem":
      if (!hasOnlyKeys(value, [...common, ...plan])) invalid();
      validatePlan(value);
      break;
    default: invalid();
  }
  // Every discriminant and required payload has been checked above.
  return structuredClone(value) as unknown as AdaptiveAction;
}

function validIngredient(value: unknown): boolean {
  try {
    validateRecipe({ id: "validation", title: "Validation", servings: 1,
      ingredients: [value], steps: [{ id: "validation", instruction: "Validate", ingredientIds: [] }] });
    return true;
  } catch { return false; }
}

function validatePlan(value: Record<string, unknown>): void {
  if (!Array.isArray(value.additionalIngredients) || !value.additionalIngredients.every(validIngredient) ||
      !Array.isArray(value.stepUpdates)) invalid();
  for (const step of value.stepUpdates) {
    if (!isRecord(step) || !hasOnlyKeys(step, ["id", "instruction", "ingredientIds"]) ||
        !isNonEmptyString(step.id) || !isNonEmptyString(step.instruction) ||
        !Array.isArray(step.ingredientIds) || !step.ingredientIds.every(isNonEmptyString) ||
        new Set(step.ingredientIds).size !== step.ingredientIds.length) invalid();
  }
  if (new Set(value.stepUpdates.map((step) => step.id)).size !== value.stepUpdates.length ||
      new Set(value.additionalIngredients.map((ingredient) => ingredient.id)).size !== value.additionalIngredients.length) invalid();
}
