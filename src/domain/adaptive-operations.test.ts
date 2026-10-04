import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingSessionStore } from "./cooking-session-store";
import type { AdaptiveAction } from "./adaptive-action";

function setup() {
  const store = new CookingSessionStore();
  store.createSession("dinner", { id: "rice", title: "Rice", servings: 2,
    ingredients: [{ id: "rice", name: "Rice", quantity: 200, unit: "g" }],
    steps: [{ id: "cook", headline: "Cook rice", instruction: "Cook rice.", ingredientIds: ["rice"] },
      { id: "serve", headline: "Serve rice", instruction: "Serve rice.", ingredientIds: ["rice"] }] });
  return store;
}
const advice: Extract<AdaptiveAction, { type: "cooking_problem" }> = {
  type: "cooking_problem", message: "Cook gently.", stepUpdates: [], additionalIngredients: [],
};

describe("adaptive store boundaries", () => {
  it("rejects adaptation before starting, after completion and with a stale current step", () => {
    const store = setup();
    const ready = store.getSession("dinner");
    assert.throws(() => store.adjustCookingInstructions("dinner", "cook", advice));
    assert.deepEqual(store.getSession("dinner"), ready);
    store.startSession("dinner");
    const cooking = store.getSession("dinner");
    assert.throws(() => store.adjustCookingInstructions("dinner", "serve", advice));
    assert.deepEqual(store.getSession("dinner"), cooking);
    store.completeCurrentStep("dinner", "cook");
    store.completeCurrentStep("dinner", "serve");
    const completed = store.getSession("dinner");
    assert.throws(() => store.adjustCookingInstructions("dinner", "serve", advice));
    assert.deepEqual(store.getSession("dinner"), completed);
  });

  it("validates untrusted operations even when callers bypass application validation", () => {
    const store = setup();
    store.startSession("dinner");
    const before = store.getSession("dinner");
    for (const action of [{ ...advice, recipe: {} }, { ...advice, stepUpdates: null }, { ...advice, type: "clarification" }]) {
      assert.throws(() => store.adjustCookingInstructions("dinner", "cook", action as typeof advice));
      assert.deepEqual(store.getSession("dinner"), before);
    }
  });

  it("rejects edits to completed instructions or ingredient references", () => {
    const store = setup();
    store.startSession("dinner");
    const before = store.completeCurrentStep("dinner", "cook");
    assert.throws(() => store.adjustCookingInstructions("dinner", "serve", { ...advice,
      stepUpdates: [{ id: "cook", headline: "Cook twice as much rice", instruction: "Cook twice as much rice.", ingredientIds: [] }] }));
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("does not scale ingredients used by a completed step, even when referenced again", () => {
    const store = setup();
    store.startSession("dinner");
    const before = store.completeCurrentStep("dinner", "cook");
    const after = store.scaleServings("dinner", "serve", { type: "scale_servings", message: "Split the cooked rice into four portions.",
      servings: 4, unscaledIngredientIds: [], stepUpdates: [{ id: "serve", headline: "Split into four smaller portions", instruction: "Split into four smaller portions.", ingredientIds: ["rice"] }], additionalIngredients: [] });
    assert.equal(after.recipe.servings, 4);
    assert.deepEqual(after.recipe.ingredients, before.recipe.ingredients);
    assert.deepEqual(after.recipe.steps[0], before.recipe.steps[0]);
  });

  it("rolls back overflowed scaling without committing servings or instruction changes", () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", { id: "rice", title: "Rice", servings: 1,
      ingredients: [{ id: "rice", name: "Rice", quantity: Number.MAX_VALUE, unit: "g" }],
      steps: [{ id: "cook", headline: "Cook rice", instruction: "Cook rice.", ingredientIds: ["rice"] }] });
    const before = store.startSession("dinner");
    assert.throws(() => store.scaleServings("dinner", "cook", { type: "scale_servings", message: "Double.",
      servings: 2, unscaledIngredientIds: [], stepUpdates: [], additionalIngredients: [] }));
    assert.deepEqual(store.getSession("dinner"), before);
  });

  it("copies adaptive inputs and output snapshots and isolates other sessions", () => {
    const store = setup();
    const other = store.createSession("lunch", store.getSession("dinner")!.recipe);
    store.startSession("dinner");
    const action = { ...advice, stepUpdates: [{ id: "cook", headline: "Cook rice gently", instruction: "Cook rice gently.", ingredientIds: ["rice"] }] };
    const result = store.adjustCookingInstructions("dinner", "cook", action);
    const expected = structuredClone(result);
    action.stepUpdates[0]!.instruction = "Mutated input";
    result.recipe.steps[0]!.ingredientIds.length = 0;
    assert.deepEqual(store.getSession("dinner"), expected);
    assert.deepEqual(store.getSession("lunch"), other);
  });
});
