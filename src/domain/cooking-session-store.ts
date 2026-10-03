import type { CookingSession, Recipe } from "./types";

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
    if (!Number.isInteger(recipe.servings) || recipe.servings <= 0) {
      throw new Error("Recipe servings must be a positive integer.");
    }
    if (recipe.steps.length === 0) {
      throw new Error("A recipe must contain at least one step.");
    }
    const stepIds = recipe.steps.map((step) => step.id);
    if (stepIds.some((stepId) => !stepId.trim()) || new Set(stepIds).size !== stepIds.length) {
      throw new Error("Recipe step IDs must be non-empty and unique.");
    }

    const session: CookingSession = {
      id,
      recipe: structuredClone(recipe),
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

  private requireSession(id: string): CookingSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} does not exist.`);
    }
    return session;
  }
}
