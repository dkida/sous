import type { CookingSession, Recipe } from "./types";
import { validateRecipe } from "./recipe-validation";
import { InvalidAdaptiveActionError, validateAdaptiveAction, type AdaptiveAction, type RemainingPlanChanges } from "./adaptive-action";

/** Process-local storage. All public results are detached snapshots. */
export class CookingSessionStore {
  private readonly sessions = new Map<string, CookingSession>();

  createSession(id: string, recipe: Recipe): CookingSession {
    if (!id.trim()) {
      throw new Error("A session ID is required.");
    }
    if (this.sessions.has(id)) {
      throw new Error(`Session ${id} already exists.`);
    }
    const validatedRecipe = validateRecipe(recipe);

    const session: CookingSession = {
      id,
      recipe: validatedRecipe,
      status: "ready",
      currentStepId: null,
      completedStepIds: [],
      substitutions: [],
      timers: [],
    };
    this.sessions.set(id, session);
    return structuredClone(session);
  }

  getSession(id: string): CookingSession | undefined {
    const session = this.sessions.get(id);
    return session ? structuredClone(session) : undefined;
  }

  startSession(id: string): CookingSession {
    const session = this.requireSession(id);
    if (session.status !== "ready") {
      throw new Error("Only a ready session can be started.");
    }
    // createSession guarantees at least one step.
    session.currentStepId = session.recipe.steps[0]!.id;
    session.status = "cooking";
    return structuredClone(session);
  }

  /** The expected step ID prevents stale requests from completing the next step. */
  completeCurrentStep(id: string, stepId: string): CookingSession {
    const session = this.requireSession(id);
    if (session.status !== "cooking") {
      throw new Error("Steps can only be completed while cooking.");
    }
    if (session.currentStepId !== stepId) {
      throw new Error("Only the current step can be completed.");
    }

    session.completedStepIds.push(stepId);
    const nextStep = session.recipe.steps[session.completedStepIds.length];
    session.currentStepId = nextStep?.id ?? null;
    if (!nextStep) {
      session.status = "completed";
    }
    return structuredClone(session);
  }

  changeIngredient(id: string, expectedStepId: string, input: Extract<AdaptiveAction, { type: "ingredient_change" }>): CookingSession {
    const action = validateAdaptiveAction(input);
    if (action.type !== "ingredient_change") this.invalidAdaptation();
    return this.adaptRemainingPlan(id, expectedStepId, (session) => {
      const original = session.recipe.ingredients.find((ingredient) => ingredient.id === action.originalIngredientId);
      if (!original || !session.recipe.steps.slice(session.completedStepIds.length)
        .some((step) => step.ingredientIds.includes(original.id))) this.invalidAdaptation();
      if (action.replacement) {
        if (session.recipe.ingredients.some((ingredient) => ingredient.id === action.replacement!.id)) this.invalidAdaptation();
        session.recipe.ingredients.push(structuredClone(action.replacement));
      }
      this.updateRemainingPlan(session, action);
      // Require explicit rewritten instructions for every remaining use of the old ingredient.
      if (session.recipe.steps.slice(session.completedStepIds.length).some((step) => step.ingredientIds.includes(original.id))) {
        this.invalidAdaptation();
      }
      if (action.replacement && !session.recipe.steps.slice(session.completedStepIds.length)
        .some((step) => step.ingredientIds.includes(action.replacement!.id))) this.invalidAdaptation();
      // Retain used originals for historical references; remove unused originals from the active plan.
      if (!this.usedIngredientIds(session).has(original.id)) {
        session.recipe.ingredients = session.recipe.ingredients.filter((ingredient) => ingredient.id !== original.id);
      }
      session.substitutions.push({ originalIngredientId: original.id, replacement: structuredClone(action.replacement), reason: action.reason });
    });
  }

  scaleServings(id: string, expectedStepId: string, input: Extract<AdaptiveAction, { type: "scale_servings" }>): CookingSession {
    const action = validateAdaptiveAction(input);
    if (action.type !== "scale_servings") this.invalidAdaptation();
    return this.adaptRemainingPlan(id, expectedStepId, (session) => {
      if (action.unscaledIngredientIds.some((ingredientId) => !session.recipe.ingredients.some((ingredient) => ingredient.id === ingredientId))) {
        this.invalidAdaptation();
      }
      const ratio = action.servings / session.recipe.servings;
      const used = this.usedIngredientIds(session);
      for (const ingredient of session.recipe.ingredients) {
        if (!used.has(ingredient.id) && !action.unscaledIngredientIds.includes(ingredient.id) && ingredient.quantity !== null) {
          ingredient.quantity *= ratio;
        }
      }
      session.recipe.servings = action.servings;
      this.updateRemainingPlan(session, action);
    });
  }

  adjustCookingInstructions(id: string, expectedStepId: string, input: Extract<AdaptiveAction, { type: "cooking_problem" }>): CookingSession {
    const action = validateAdaptiveAction(input);
    if (action.type !== "cooking_problem") this.invalidAdaptation();
    return this.adaptRemainingPlan(id, expectedStepId, (session) => this.updateRemainingPlan(session, action));
  }

  reconcileProgress(id: string, expectedStepId: string, input: Extract<AdaptiveAction, { type: "reconcile_progress" }>, userMessage: string): CookingSession {
    const action = validateAdaptiveAction(input);
    if (action.type !== "reconcile_progress") this.invalidAdaptation();
    return this.adaptRemainingPlan(id, expectedStepId, (session) => {
      const remaining = session.recipe.steps.slice(session.completedStepIds.length);
      for (const [index, completion] of action.completedSteps.entries()) {
        if (remaining[index]?.id !== completion.stepId || !userMessage.includes(completion.evidence)) this.invalidAdaptation();
      }
      session.completedStepIds.push(...action.completedSteps.map((completion) => completion.stepId));
      session.currentStepId = session.recipe.steps[session.completedStepIds.length]?.id ?? null;
      if (!session.currentStepId) session.status = "completed";
    });
  }

  /** Work on a copy and commit once, after every invariant has been checked. */
  private adaptRemainingPlan(id: string, expectedStepId: string, update: (session: CookingSession) => void): CookingSession {
    const before = this.requireSession(id);
    if (before.status !== "cooking" || before.currentStepId !== expectedStepId) this.invalidAdaptation();
    const session = structuredClone(before);
    update(session);
    session.recipe = validateRecipe(session.recipe);
    for (const stepId of before.completedStepIds) {
      if (JSON.stringify(session.recipe.steps.find((step) => step.id === stepId)) !==
          JSON.stringify(before.recipe.steps.find((step) => step.id === stepId))) this.invalidAdaptation();
    }
    for (const ingredientId of this.usedIngredientIds(before)) {
      if (JSON.stringify(session.recipe.ingredients.find((ingredient) => ingredient.id === ingredientId)) !==
          JSON.stringify(before.recipe.ingredients.find((ingredient) => ingredient.id === ingredientId))) this.invalidAdaptation();
    }
    this.sessions.set(id, session);
    return structuredClone(session);
  }

  private updateRemainingPlan(session: CookingSession, changes: RemainingPlanChanges): void {
    for (const ingredient of changes.additionalIngredients) {
      if (session.recipe.ingredients.some((existing) => existing.id === ingredient.id)) this.invalidAdaptation();
      session.recipe.ingredients.push(structuredClone(ingredient));
    }
    for (const step of changes.stepUpdates) {
      const index = session.recipe.steps.findIndex((existing) => existing.id === step.id);
      if (index < session.completedStepIds.length || index === -1) this.invalidAdaptation();
      session.recipe.steps[index] = structuredClone(step);
    }
    for (const ingredient of changes.additionalIngredients) {
      if (!session.recipe.steps.slice(session.completedStepIds.length).some((step) => step.ingredientIds.includes(ingredient.id))) {
        this.invalidAdaptation();
      }
    }
  }

  private usedIngredientIds(session: CookingSession): Set<string> {
    return new Set(session.recipe.steps.filter((step) => session.completedStepIds.includes(step.id)).flatMap((step) => step.ingredientIds));
  }

  private invalidAdaptation(): never {
    throw new InvalidAdaptiveActionError("The adaptive action cannot apply to this cooking state. State has not changed; please clarify or try again.");
  }

  private requireSession(id: string): CookingSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} does not exist.`);
    }
    return session;
  }
}
