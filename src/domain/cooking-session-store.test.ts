import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingSessionStore } from "./cooking-session-store";
import type { Recipe } from "./types";

function makeRecipe(): Recipe {
  return {
    id: "tomato-pasta",
    title: "Tomato pasta",
    servings: 2,
    ingredients: [
      { id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
      { id: "tomatoes", name: "Canned tomatoes", quantity: 1, unit: "can" },
      { id: "salt", name: "Salt", quantity: null, unit: null },
    ],
    steps: [
      { id: "boil", instruction: "Boil the pasta in salted water.", ingredientIds: ["pasta", "salt"] },
      { id: "sauce", instruction: "Heat the tomatoes.", ingredientIds: ["tomatoes"] },
      { id: "combine", instruction: "Combine the pasta and sauce.", ingredientIds: ["pasta", "tomatoes"] },
    ],
  };
}

describe("CookingSessionStore", () => {
  it("creates a ready session with an accepted recipe and empty cooking state", () => {
    const store = new CookingSessionStore();
    const recipe = makeRecipe();
    const session = store.createSession("dinner", recipe);

    assert.deepEqual(session, {
      id: "dinner",
      recipe,
      status: "ready",
      currentStepId: null,
      completedStepIds: [],
      substitutions: [],
      timers: [],
    });
    assert.deepEqual(store.getSession("dinner"), session);
  });

  it("starts at the first step and advances in recipe order through completion", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", makeRecipe());

    const started = store.startSession("dinner");
    assert.equal(started.status, "cooking");
    assert.equal(started.currentStepId, "boil");
    assert.deepEqual(started.completedStepIds, []);

    const first = store.completeCurrentStep("dinner", "boil");
    assert.equal(first.status, "cooking");
    assert.equal(first.currentStepId, "sauce");
    assert.deepEqual(first.completedStepIds, ["boil"]);

    const second = store.completeCurrentStep("dinner", "sauce");
    assert.equal(second.currentStepId, "combine");
    assert.deepEqual(second.completedStepIds, ["boil", "sauce"]);

    const completed = store.completeCurrentStep("dinner", "combine");
    assert.equal(completed.status, "completed");
    assert.equal(completed.currentStepId, null);
    assert.deepEqual(completed.completedStepIds, ["boil", "sauce", "combine"]);
    assert.deepEqual(store.getSession("dinner"), completed);
    // Earlier return values remain snapshots, not live references.
    assert.equal(started.currentStepId, "boil");
    assert.deepEqual(started.completedStepIds, []);
  });

  it("completes a single-step recipe", () => {
    const store = new CookingSessionStore();
    const recipe = makeRecipe();
    recipe.steps = recipe.steps.slice(0, 1);
    store.createSession("dinner", recipe);
    store.startSession("dinner");

    const session = store.completeCurrentStep("dinner", "boil");
    assert.equal(session.status, "completed");
    assert.equal(session.currentStepId, null);
    assert.deepEqual(session.completedStepIds, ["boil"]);
  });

  it("rejects completing a step before starting without changing the session", () => {
    const store = new CookingSessionStore();
    const before = store.createSession("dinner", makeRecipe());

    assert.throws(() => store.completeCurrentStep("dinner", "boil"), /while cooking/);
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("rejects restarting a cooking session without resetting progress", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", makeRecipe());
    store.startSession("dinner");
    const before = store.completeCurrentStep("dinner", "boil");

    assert.throws(() => store.startSession("dinner"), /Only a ready session/);
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("rejects skipped, unknown, and repeated step completions without changing progress", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", makeRecipe());
    const started = store.startSession("dinner");

    for (const stepId of ["sauce", "unknown"]) {
      assert.throws(() => store.completeCurrentStep("dinner", stepId), /Only the current step/);
      assert.deepEqual(store.getSession("dinner"), started);
    }

    const progressed = store.completeCurrentStep("dinner", "boil");
    assert.throws(() => store.completeCurrentStep("dinner", "boil"), /Only the current step/);
    assert.deepEqual(store.getSession("dinner"), progressed);
  });

  it("rejects further transitions after completion", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", makeRecipe());
    store.startSession("dinner");
    store.completeCurrentStep("dinner", "boil");
    store.completeCurrentStep("dinner", "sauce");
    const before = store.completeCurrentStep("dinner", "combine");

    assert.throws(() => store.startSession("dinner"), /Only a ready session/);
    assert.throws(() => store.completeCurrentStep("dinner", "combine"), /while cooking/);
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("returns undefined for missing sessions and rejects transitions on them", () => {
    const store = new CookingSessionStore();

    assert.equal(store.getSession("missing"), undefined);
    assert.throws(() => store.startSession("missing"), /does not exist/);
    assert.throws(() => store.completeCurrentStep("missing", "boil"), /does not exist/);
  });

  it("rejects duplicate session IDs without overwriting an existing session", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", makeRecipe());
    const before = store.startSession("dinner");

    assert.throws(() => store.createSession("dinner", makeRecipe()), /already exists/);
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("rejects empty session IDs", () => {
    const store = new CookingSessionStore();
    for (const id of ["", " "]) {
      assert.throws(() => store.createSession(id, makeRecipe()), /session ID is required/);
      assert.equal(store.getSession(id), undefined);
    }
  });

  it("rejects recipes that cannot support unambiguous step progression", () => {
    const store = new CookingSessionStore();
    const empty = makeRecipe();
    empty.steps = [];
    assert.throws(() => store.createSession("dinner", empty), /at least one step/);

    const duplicate = makeRecipe();
    duplicate.steps[1]!.id = duplicate.steps[0]!.id;
    assert.throws(() => store.createSession("dinner", duplicate), /non-empty and unique/);

    const blank = makeRecipe();
    blank.steps[0]!.id = " ";
    assert.throws(() => store.createSession("dinner", blank), /non-empty and unique/);
    assert.equal(store.getSession("dinner"), undefined);
    // Rejected creation must not reserve the ID.
    assert.equal(store.createSession("dinner", makeRecipe()).status, "ready");
  });

  it("rejects invalid serving counts", () => {
    const store = new CookingSessionStore();
    for (const servings of [0, -1, 1.5, NaN, Infinity]) {
      assert.throws(() => store.createSession("dinner", { ...makeRecipe(), servings }), /positive integer/);
      assert.equal(store.getSession("dinner"), undefined);
    }
  });

  it("protects stored state from input and returned snapshot mutations", () => {
    const store = new CookingSessionStore();
    const recipe = makeRecipe();
    const created = store.createSession("dinner", recipe);
    const expected = structuredClone(created);

    recipe.ingredients[0]!.quantity = 999;
    recipe.steps[0]!.ingredientIds.push("invented");
    recipe.steps.reverse();
    created.recipe.title = "Changed";
    created.recipe.ingredients[0]!.quantity = 0;
    created.completedStepIds.push("boil");
    created.status = "completed";
    created.substitutions.push({ originalIngredientId: "pasta", replacement: recipe.ingredients[1]! });
    created.timers.push({
      id: "timer", label: "Pasta", stepId: "boil", durationSeconds: 600,
      startedAt: "2026-10-04T10:00:00.000Z", status: "running",
    });
    assert.deepEqual(store.getSession("dinner"), expected);

    const fetched = store.getSession("dinner")!;
    fetched.recipe.steps.length = 0;
    fetched.recipe.ingredients[0]!.name = "Changed";
    assert.deepEqual(store.getSession("dinner"), expected);

    const started = store.startSession("dinner");
    started.currentStepId = "combine";
    started.recipe.steps[1]!.id = "changed";
    const progressed = store.completeCurrentStep("dinner", "boil");
    progressed.completedStepIds.length = 0;
    progressed.status = "completed";
    assert.equal(store.getSession("dinner")!.currentStepId, "sauce");
    assert.equal(store.getSession("dinner")!.status, "cooking");
    assert.deepEqual(store.getSession("dinner")!.completedStepIds, ["boil"]);
  });

  it("keeps different sessions and store instances independent", () => {
    const store = new CookingSessionStore();
    const otherStore = new CookingSessionStore();
    const recipe = makeRecipe();
    store.createSession("dinner", recipe);
    const lunch = store.createSession("lunch", recipe);
    const otherDinner = otherStore.createSession("dinner", recipe);
    store.startSession("dinner");
    store.completeCurrentStep("dinner", "boil");

    assert.deepEqual(store.getSession("lunch"), lunch);
    assert.deepEqual(otherStore.getSession("dinner"), otherDinner);
    assert.equal(otherStore.getSession("lunch"), undefined);
  });
});
