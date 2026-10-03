export interface Ingredient {
  id: string;
  name: string;
  /** Null represents an unspecified amount, such as salt to taste. */
  quantity: number | null;
  /** Free text supports units such as g, ml, cloves, or cans. */
  unit: string | null;
}

export interface RecipeStep {
  id: string;
  instruction: string;
  ingredientIds: string[];
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  /** Array order is the cooking order. */
  steps: RecipeStep[];
}

export interface Substitution {
  originalIngredientId: string;
  replacement: Ingredient;
  reason?: string;
}

export interface CookingTimer {
  id: string;
  label: string;
  stepId: string | null;
  durationSeconds: number;
  /** ISO 8601 timestamp. Timer scheduling is outside this domain model. */
  startedAt: string;
  status: "running" | "completed" | "cancelled";
}

export interface CookingSession {
  id: string;
  /** A snapshot of the accepted recipe, including ingredient quantities. */
  recipe: Recipe;
  status: "ready" | "cooking" | "completed";
  /** Null before starting and after completing the recipe. */
  currentStepId: string | null;
  completedStepIds: string[];
  substitutions: Substitution[];
  timers: CookingTimer[];
}
