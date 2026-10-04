import assert from "node:assert/strict";
import { it } from "node:test";
import { formatIngredient } from "./ingredient-format";

it("formats counted ingredients naturally without altering the canonical values", () => {
  const carrot = { id: "carrot", name: "carrot", quantity: 1, unit: "piece" };
  const before = structuredClone(carrot);
  assert.equal(formatIngredient(carrot), "1 carrot");
  assert.equal(formatIngredient({ ...carrot, quantity: 3 }), "3 carrots");
  assert.equal(formatIngredient({ ...carrot, name: "carrots" }), "1 carrot");
  assert.equal(formatIngredient({ ...carrot, name: "Carrot", quantity: 3, unit: "units" }), "3 Carrots");
  assert.equal(formatIngredient({ ...carrot, name: "red potato", quantity: 2 }), "2 red potatoes");
  assert.equal(formatIngredient({ ...carrot, unit: null, quantity: 3 }), "3 carrots");
  assert.equal(formatIngredient({ ...carrot, quantity: 0.5 }), "0.5 carrot");
  assert.deepEqual(carrot, before);
});

it("preserves measured/mass names, unspecified quantities and unknown count nouns", () => {
  const ingredient = { id: "food", name: "garlic", quantity: 1, unit: "cloves" };
  assert.equal(formatIngredient(ingredient), "1 clove garlic");
  assert.equal(formatIngredient({ ...ingredient, quantity: 2 }), "2 cloves garlic");
  assert.equal(formatIngredient({ ...ingredient, name: "canned tomatoes", quantity: 400, unit: "g" }), "400 g canned tomatoes");
  assert.equal(formatIngredient({ ...ingredient, name: "water", quantity: 1000, unit: "ml" }), "1,000 ml water");
  assert.equal(formatIngredient({ ...ingredient, name: "salt", quantity: null, unit: null }), "salt");
  assert.equal(formatIngredient({ ...ingredient, name: "salt", quantity: null, unit: "to taste" }), "salt (to taste)");
  assert.equal(formatIngredient({ ...ingredient, name: "feta", quantity: 2, unit: "piece" }), "2 pieces feta");
  assert.equal(formatIngredient({ ...ingredient, name: "olive oil", quantity: 0.0001, unit: "ml" }), "0.0001 ml olive oil");
});
