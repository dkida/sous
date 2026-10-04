import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GeminiFlashLiteProviderError } from "../infrastructure/gemini-flash-lite-provider";
import { MistralProviderError } from "../infrastructure/mistral-provider";
import { acceptedProposal, fixtureRecipe, runScenario, scenarios } from "./scenarios";

describe("fixed inference benchmark scenarios", () => {
  const outputs = {
    proposal: acceptedProposal, recipe: fixtureRecipe(),
    "missing-paste": { type: "ingredient_change", message: "Cook the tomatoes down longer without paste.", originalIngredientId: "paste", replacement: null,
      reason: "Concentrate the tomatoes instead.", stepUpdates: [{ id: "sauce", headline: "Add tomatoes and simmer longer", instruction: "Add tomatoes and simmer longer.", ingredientIds: ["tomatoes"] }], additionalIngredients: [] },
    "scale-2-to-4": { type: "scale_servings", message: "Scale the unused ingredients; cook extra pasta separately.", servings: 4,
      unscaledIngredientIds: [], stepUpdates: [], additionalIngredients: [] },
    "burning-onions": { type: "cooking_problem", message: "Remove the pan from heat now.", stepUpdates: [], additionalIngredients: [] },
  };
  for (const scenario of scenarios) {
    it(`${scenario} uses identical prompts, records one measured API call and checks history/transition`, async () => {
      const prompts: string[] = [];
      const provider = { generate: async (prompt: string) => { prompts.push(prompt); return JSON.stringify(outputs[scenario]); } };
      const first = await runScenario(scenario, provider);
      const second = await runScenario(scenario, provider);
      assert.equal(prompts.length, 2);
      assert.equal(prompts[0], prompts[1]);
      assert.equal(first.promptHash, second.promptHash);
      assert.equal(first.success, true);
      assert.equal(first.validStructuredOutput, true);
      assert.equal(first.correctStateTransition, true);
      assert.equal(first.completedHistoryPreserved, true);
      assert.equal(first.culinaryAssessment, "requires manual review");
      assert.deepEqual(first.output, outputs[scenario]);
      assert.ok(first.timing.llmMs! >= 0);
      assert.ok(first.timing.validationMs! >= 0);
      assert.ok(first.timing.operationMs! >= 0);
    });
  }
  it("distinguishes an accepted but wrong scenario action from a correct transition", async () => {
    const result = await runScenario("scale-2-to-4", { generate: async () => JSON.stringify(outputs["burning-onions"]) });
    assert.equal(result.success, true);
    assert.equal(result.validStructuredOutput, true);
    assert.equal(result.correctStateTransition, false);
    assert.equal(result.completedHistoryPreserved, true);
  });
  it("records failed provider requests without saving diagnostics or changing state", async () => {
    const result = await runScenario("missing-paste", { generate: async () => { throw new GeminiFlashLiteProviderError("Experimental Gemini request failed (HTTP 429)."); } });
    assert.equal(result.success, false);
    assert.equal(result.failureKind, "http-429");
    assert.equal(result.validStructuredOutput, null);
    assert.equal(result.timing.validationMs, null);
    assert.equal(result.timing.operationMs, null);
    assert.equal(result.correctStateTransition, true);
    assert.equal(result.completedHistoryPreserved, true);
    assert.equal(result.output, null);
  });
  it("classifies Mistral access failures so the runner can stop that provider", async () => {
    const result = await runScenario("proposal", { generate: async () => { throw new MistralProviderError("Mistral request failed (HTTP 401)."); } });
    assert.equal(result.failureKind, "http-401");
    assert.equal(result.output, null);
  });
  it("keeps rejected model text visible and separates malformed JSON from invalid contracts", async () => {
    const malformed = await runScenario("proposal", { generate: async () => "not json" });
    assert.equal(malformed.failureKind, "malformed-json");
    assert.equal(malformed.rejectedModelText, "not json");
    const stepWithoutIds = JSON.stringify({ ...fixtureRecipe(), steps: fixtureRecipe().steps.map(({ ingredientIds: _, ...step }) => step) });
    let calls = 0;
    const invalid = await runScenario("recipe", { generate: async () => { calls++; return stepWithoutIds; } });
    assert.equal(calls, 1);
    assert.equal(invalid.failureKind, "invalid-recipe");
    assert.equal(invalid.rejectedModelText, stepWithoutIds);
    assert.equal((await runScenario("proposal", { generate: async () => JSON.stringify(acceptedProposal) })).rejectedModelText, null);
  });
});
