import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingSessionStore } from "../domain/cooking-session-store";
import type { Recipe } from "../domain/types";
import { CookingAgent, type DishProposal } from "./cooking-agent";
import type { LLMProvider } from "./llm-provider";

const proposal: DishProposal = {
  dishName: "Tomato Parmesan Pasta", description: "Simple tomato pasta.", estimatedCookingMinutes: 25, servings: 2,
};

function makeRecipe(): Recipe {
  return {
    id: "pasta", title: proposal.dishName, servings: 2,
    ingredients: [
      { id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
      { id: "tomatoes", name: "Canned tomatoes", quantity: 1, unit: "can" },
      { id: "salt", name: "Salt", quantity: null, unit: null },
    ],
    steps: [
      { id: "boil", headline: "Boil pasta in salted water", instruction: "Boil pasta in salted water.", ingredientIds: ["pasta", "salt"] },
      { id: "sauce", headline: "Heat the tomatoes", instruction: "Heat tomatoes and combine with pasta.", ingredientIds: ["tomatoes", "pasta"] },
    ],
  };
}

class MockProvider implements LLMProvider {
  readonly prompts: string[] = [];
  constructor(readonly outputs: (string | Error)[] = [JSON.stringify(proposal), JSON.stringify(makeRecipe())]) {}
  async generate(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("Unexpected model call.");
    return output;
  }
}

function setup(outputs?: (string | Error)[]) {
  const provider = new MockProvider(outputs);
  const store = new CookingSessionStore();
  return { provider, store, agent: new CookingAgent(provider, store, "dinner") };
}

describe("CookingAgent", () => {
  it("proposes one dish without generating a recipe or creating a session until acceptance", async () => {
    const { agent, store, provider } = setup();
    const result = await agent.proposeDish("I have pasta, onion, garlic, canned tomatoes and parmesan.");
    assert.deepEqual(result, proposal);
    assert.equal(provider.prompts.length, 1);
    assert.equal(store.getSession("dinner"), undefined);
    assert.match(provider.prompts[0]!, /I have pasta/);
    assert.match(provider.prompts[0]!, /"currentSession":null/);
    result.servings = 100; // Returned proposal cannot change the accepted proposal.

    const progress = await agent.acceptProposal();
    assert.equal(provider.prompts.length, 2);
    assert.match(provider.prompts[1]!, /"servings":2/);
    assert.deepEqual(progress.session.recipe, makeRecipe());
    assert.equal(progress.session.status, "cooking");
    assert.equal(progress.currentStep?.id, "boil");
    assert.deepEqual(progress.session.completedStepIds, []);
    assert.deepEqual(progress.session.timers, []);
    assert.deepEqual(progress.session.substitutions, []);
  });

  it("reads the current/next step without advancing or making model calls", async () => {
    const { agent, provider } = setup();
    await agent.proposeDish("pasta and tomatoes");
    const before = await agent.acceptProposal();
    assert.deepEqual(agent.getCurrentStep(), before);
    const snapshot = agent.getCurrentStep();
    snapshot.currentStep!.instruction = "Changed";
    snapshot.session.recipe.ingredients[0]!.quantity = 999;
    assert.deepEqual(agent.getCurrentStep(), before);
    assert.equal(provider.prompts.length, 2);
  });

  it("completes steps in order, rejects stale completion and returns completed state", async () => {
    const { agent, provider } = setup();
    await agent.proposeDish("pasta and tomatoes");
    await agent.acceptProposal();
    const next = agent.completeCurrentStep("boil");
    assert.equal(next.currentStep?.id, "sauce");
    assert.deepEqual(next.session.completedStepIds, ["boil"]);
    assert.throws(() => agent.completeCurrentStep("boil"), /Only the current step/);
    assert.deepEqual(agent.getCurrentStep(), next);
    const final = agent.completeCurrentStep("sauce");
    assert.equal(final.currentStep, null);
    assert.equal(final.session.status, "completed");
    assert.deepEqual(final.session.completedStepIds, ["boil", "sauce"]);
    assert.deepEqual(agent.getCurrentStep(), final);
    assert.equal(provider.prompts.length, 2);
  });

  it("rejects out-of-order requests without calling the model", async () => {
    const { agent, provider } = setup();
    await assert.rejects(agent.acceptProposal(), /proposal first/);
    await assert.rejects(agent.proposeDish(" "), /available ingredients/);
    assert.throws(() => agent.getCurrentStep(), /start cooking first/);
    assert.equal(provider.prompts.length, 0);
    await agent.proposeDish("pasta");
    const before = await agent.acceptProposal();
    await assert.rejects(agent.acceptProposal(), /already exists/);
    await assert.rejects(agent.proposeDish("onions"), /already exists/);
    assert.deepEqual(agent.getCurrentStep(), before);
    assert.equal(provider.prompts.length, 2);
  });

  it("accepts a single JSON fence and validates its contents", async () => {
    const { agent } = setup([`\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``, `\`\`\`json\n${JSON.stringify(makeRecipe())}\n\`\`\``]);
    await agent.proposeDish("pasta");
    assert.equal((await agent.acceptProposal()).currentStep?.id, "boil");
  });

  for (const [name, output] of [
    ["malformed JSON", "not JSON"],
    ["multiple dishes", JSON.stringify([proposal, proposal])],
    ["invalid time", JSON.stringify({ ...proposal, estimatedCookingMinutes: 0 })],
    ["invalid servings", JSON.stringify({ ...proposal, servings: 1.5 })],
    ["premature recipe", JSON.stringify({ ...proposal, recipe: makeRecipe() })],
  ]) {
    it(`rejects ${name} proposals without writing cooking state`, async () => {
      const { agent, store } = setup([output!]);
      await assert.rejects(agent.proposeDish("pasta"));
      assert.equal(store.getSession("dinner"), undefined);
      await assert.rejects(agent.acceptProposal(), /proposal first/);
    });
  }

  const mutations: [string, (recipe: Recipe) => unknown][] = [
    ["missing fields", () => ({ title: "Pasta" })],
    ["zero servings", (recipe) => ({ ...recipe, servings: 0 })],
    ["empty steps", (recipe) => ({ ...recipe, steps: [] })],
    ["empty ingredients", (recipe) => ({ ...recipe, ingredients: [] })],
    ["duplicate ingredients", (recipe) => ({ ...recipe, ingredients: [recipe.ingredients[0], recipe.ingredients[0]] })],
    ["negative quantity", (recipe) => { recipe.ingredients[0]!.quantity = -1; return recipe; }],
    ["missing quantity", (recipe) => { return { ...recipe, ingredients: [{ id: "pasta", name: "Pasta", unit: "g" }] }; }],
    ["invalid unit", (recipe) => { recipe.ingredients[0]!.unit = ""; return recipe; }],
    ["unknown ingredient reference", (recipe) => { recipe.steps[0]!.ingredientIds = ["invented"]; return recipe; }],
    ["duplicate steps", (recipe) => { recipe.steps[1]!.id = recipe.steps[0]!.id; return recipe; }],
    ["blank instruction", (recipe) => { recipe.steps[0]!.instruction = " "; return recipe; }],
    ["session fields", (recipe) => ({ ...recipe, status: "completed", completedStepIds: ["boil"] })],
    ["different dish", (recipe) => ({ ...recipe, title: "Onion soup" })],
    ["different servings", (recipe) => ({ ...recipe, servings: 4 })],
  ];
  for (const [name, mutate] of mutations) {
    it(`validates generated recipes: rejects ${name} before state creation and permits retry`, async () => {
      const { agent, store } = setup([JSON.stringify(proposal), JSON.stringify(mutate(makeRecipe())), JSON.stringify(makeRecipe())]);
      await agent.proposeDish("pasta");
      await assert.rejects(agent.acceptProposal());
      assert.equal(store.getSession("dinner"), undefined);
      assert.equal((await agent.acceptProposal()).currentStep?.id, "boil");
    });
  }

  it("malformed recipe JSON and provider failures leave a proposal retryable", async () => {
    const { agent, store } = setup([JSON.stringify(proposal), "{broken", new Error("Unavailable"), JSON.stringify(makeRecipe())]);
    await agent.proposeDish("pasta");
    await assert.rejects(agent.acceptProposal(), /malformed JSON/);
    await assert.rejects(agent.acceptProposal(), /Unavailable/);
    assert.equal(store.getSession("dinner"), undefined);
    assert.equal((await agent.acceptProposal()).session.status, "cooking");
  });

  it("a failed replacement proposal preserves the prior validated proposal", async () => {
    const { agent } = setup([JSON.stringify(proposal), "broken", JSON.stringify(makeRecipe())]);
    await agent.proposeDish("pasta");
    await assert.rejects(agent.proposeDish("onions"));
    assert.equal((await agent.acceptProposal()).session.recipe.title, proposal.dishName);
  });

  it("prevents overlapping model operations from creating or overwriting state", async () => {
    let resolve!: (text: string) => void;
    const provider: LLMProvider = { generate: () => new Promise<string>((done) => { resolve = done; }) };
    const store = new CookingSessionStore();
    const agent = new CookingAgent(provider, store, "dinner");
    const proposing = agent.proposeDish("pasta");
    await assert.rejects(agent.proposeDish("onions"), /already in progress/);
    await assert.rejects(agent.acceptProposal(), /already in progress/);
    resolve(JSON.stringify(proposal));
    await proposing;
    const accepting = agent.acceptProposal();
    await assert.rejects(agent.acceptProposal(), /already in progress/);
    resolve(JSON.stringify(makeRecipe()));
    assert.equal((await accepting).session.status, "cooking");
  });
});
