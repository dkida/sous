import assert from "node:assert/strict";
import { it } from "node:test";
import { CookingSessionStore } from "./cooking-session-store";
import type { AdaptiveAction } from "./adaptive-action";

function setup(prepared: boolean) {
  const store = new CookingSessionStore();
  store.createSession("dinner", { id: "vegetables", title: "Chicken and vegetable pasta", servings: 2,
    ingredients: [{ id: "carrot", name: "carrot", quantity: 1, unit: "piece" }],
    steps: [{ id: "prep", instruction: "Dice 1 carrot.", ingredientIds: ["carrot"] },
      { id: "pan", instruction: "Add the diced carrot to the pan.", ingredientIds: ["carrot"] },
      { id: "serve", instruction: "Serve the pasta with the carrot.", ingredientIds: ["carrot"] }] });
  store.startSession("dinner");
  if (prepared) store.completeCurrentStep("dinner", "prep");
  return store;
}
function correction(id: string, prepared: boolean, quantity = 3): Extract<AdaptiveAction, { type: "ingredient_change" }> {
  return { type: "ingredient_change", message: `Use ${quantity} carrots in total.`, originalIngredientId: "carrot",
    replacement: { id, name: "carrot", quantity, unit: "piece" }, reason: "Requested quantity correction.", additionalIngredients: [],
    stepUpdates: [
      ...(!prepared ? [{ id: "prep", instruction: `Dice ${quantity} carrots.`, ingredientIds: [id] }] : []),
      { id: "pan", instruction: `Dice any additional carrots needed, then add ${quantity} carrots in total to the pan.`, ingredientIds: [id] },
      { id: "serve", instruction: `Serve the pasta with ${quantity} carrots.`, ingredientIds: [id] },
    ] };
}

for (const prepared of [false, true]) {
  for (const id of ["carrot", "three-carrots"]) {
    it(`corrects 1 carrot to 3 canonically with ${id === "carrot" ? "the existing" : "a model-generated"} ID, ${prepared ? "after preparation" : "before preparation"}`, () => {
      const store = setup(prepared);
      const before = store.getSession("dinner")!;
      const after = store.changeIngredient("dinner", prepared ? "pan" : "prep", correction(id, prepared));
      assert.deepEqual(after.recipe.ingredients, [{ id: "carrot", name: "carrot", quantity: 3, unit: "piece" }]);
      assert.deepEqual(after.substitutions, []); // A correction is not an ingredient substitution.
      assert.deepEqual(after.completedStepIds, before.completedStepIds);
      assert.equal(after.currentStepId, before.currentStepId);
      assert.deepEqual(after.recipe.steps.slice(0, prepared ? 1 : 0), before.recipe.steps.slice(0, prepared ? 1 : 0));
      for (const step of after.recipe.steps) assert.deepEqual(step.ingredientIds, ["carrot"]);
      assert.deepEqual(after.quantityChanges, [{ previousIngredient: before.recipe.ingredients[0], quantity: 3, completedStepIds: before.completedStepIds }]);
      assert.deepEqual(store.getSession("dinner"), after);
    });
  }
}

it("repeated quantity corrections preserve prior amounts, isolated snapshots and scaling's used-quantity guard", () => {
  const store = setup(true);
  const action = correction("three-carrots", true);
  const changed = store.changeIngredient("dinner", "pan", action);
  action.replacement!.quantity = 99;
  changed.quantityChanges[0]!.previousIngredient.quantity = 99;
  changed.quantityChanges[0]!.completedStepIds.length = 0;
  assert.equal(store.getSession("dinner")!.quantityChanges[0]!.previousIngredient.quantity, 1);
  assert.deepEqual(store.getSession("dinner")!.quantityChanges[0]!.completedStepIds, ["prep"]);
  const repeated = store.changeIngredient("dinner", "pan", correction("carrot", true, 5));
  assert.equal(repeated.recipe.ingredients.length, 1);
  assert.equal(repeated.recipe.ingredients[0]!.quantity, 5);
  assert.deepEqual(repeated.quantityChanges.map((item) => [item.previousIngredient.quantity, item.quantity]), [[1, 3], [3, 5]]);
  const scaled = store.scaleServings("dinner", "pan", { type: "scale_servings", message: "Share the carrots.", servings: 4,
    unscaledIngredientIds: [], stepUpdates: [], additionalIngredients: [] });
  assert.equal(scaled.recipe.ingredients[0]!.quantity, 5);
  assert.deepEqual(scaled.quantityChanges, repeated.quantityChanges);
});

it("rejects incomplete corrections and attempts to overwrite completed preparation, rolling back amount and history together", () => {
  const store = setup(true);
  const before = store.getSession("dinner");
  const action = correction("three-carrots", true);
  const invalid = [
    { ...action, stepUpdates: action.stepUpdates.slice(0, 1) },
    { ...action, stepUpdates: [...action.stepUpdates, { id: "prep", instruction: "Diced 3 carrots.", ingredientIds: ["three-carrots"] }] },
    { ...action, replacement: { ...action.replacement!, quantity: -1 } },
    { ...action, replacement: { ...action.replacement!, unit: "g" } },
    { ...action, replacement: { ...action.replacement!, id: "carrot", name: "broccoli" } },
    { ...action, stepUpdates: action.stepUpdates.map((step) => ({ ...step, ingredientIds: ["carrot", "three-carrots"] })) },
  ];
  for (const change of invalid) {
    assert.throws(() => store.changeIngredient("dinner", "pan", change));
    assert.deepEqual(store.getSession("dinner"), before);
  }
  assert.throws(() => store.changeIngredient("dinner", "prep", action));
  assert.deepEqual(store.getSession("dinner"), before);
});

it("rejects a duplicate carrot disguised as an addition instead of accumulating old and new totals", () => {
  const store = setup(true);
  const before = store.getSession("dinner");
  assert.throws(() => store.adjustCookingInstructions("dinner", "pan", { type: "cooking_problem", message: "Use 3 carrots.",
    additionalIngredients: [{ id: "three-carrots", name: "Carrot", quantity: 3, unit: "pieces" }],
    stepUpdates: [{ id: "pan", instruction: "Add 3 carrots.", ingredientIds: ["three-carrots"] }] }));
  assert.deepEqual(store.getSession("dinner"), before);
});
