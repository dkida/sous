import assert from "node:assert/strict";
import { it } from "node:test";
import { CookingAgent } from "./cooking-agent";
import { validateAdaptiveAction } from "../domain/adaptive-action";

for (const language of ["en", "pl"] as const) {
  it(`generated ${language} steps retain short actions and full cooking detail`, async () => {
    const headline = language === "pl" ? "Ugotuj makaron" : "Cook the pasta";
    const instruction = language === "pl" ? "Ugotuj 200 g makaronu w osolonej wodzie zgodnie z instrukcją na opakowaniu, a następnie odcedź." : "Cook 200 g pasta in salted water according to the package instructions, then drain.";
    const prompts: string[] = [];
    const proposal = { dishName: "Pasta", description: "Pasta", estimatedCookingMinutes: 20, servings: 2 };
    const recipe = { id: "r", title: "Pasta", servings: 2, ingredients: [{ id: "p", name: "Pasta", quantity: 200, unit: "g" }], steps: [{ id: "s", headline, instruction, ingredientIds: ["p"] }] };
    let generated: unknown = recipe;
    const agent = new CookingAgent({ async generate(prompt) { prompts.push(prompt); return JSON.stringify(prompts.length === 1 ? proposal : generated); } }, undefined, undefined, undefined, language);
    await agent.proposeDish("pasta");
    for (const badHeadline of [undefined, "", instruction]) {
      generated = { ...recipe, steps: [{ ...recipe.steps[0], headline: badHeadline }] };
      await assert.rejects(agent.acceptProposal());
      assert.throws(() => agent.getCurrentStep());
    }
    generated = recipe;
    const progress = await agent.acceptProposal();
    assert.equal(progress.currentStep?.headline, headline);
    assert.equal(progress.currentStep?.instruction, instruction);
    assert.match(prompts[1]!, /headline is a short imperative action/);
    assert.match(prompts[1]!, /timing, temperature\/heat, technique and immediate safety/);
    assert.match(prompts[1]!, /Polish example: headline "Ugotuj makaron"/);
  });
}

it("adaptive step updates require the same short headline contract", () => {
  const action = { type: "cooking_problem", message: "Simmer gently.", additionalIngredients: [], stepUpdates: [{ id: "s", headline: "Simmer gently", instruction: "Simmer for 8 minutes over low heat.", ingredientIds: [] }] };
  assert.deepEqual(validateAdaptiveAction(action), action);
  assert.throws(() => validateAdaptiveAction({ ...action, stepUpdates: [{ ...action.stepUpdates[0], headline: "Simmer the sauce over low heat for eight minutes until thickened" }] }));
});
