import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingSessionStore } from "../domain/cooking-session-store";
import type { AdaptiveAction } from "../domain/adaptive-action";
import type { Recipe } from "../domain/types";
import { CookingAgent } from "./cooking-agent";
import type { LLMProvider } from "./llm-provider";

function recipe(): Recipe {
  return { id: "pasta", title: "Tomato pasta", servings: 2, ingredients: [
    { id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
    { id: "garlic", name: "Garlic", quantity: 2, unit: "cloves" },
    { id: "tomatoes", name: "Chopped tomatoes", quantity: 400, unit: "g" },
    { id: "paste", name: "Tomato paste", quantity: 30, unit: "g" },
    { id: "cheese", name: "Parmesan", quantity: 40, unit: "g" },
    { id: "salt", name: "Salt", quantity: null, unit: null },
  ], steps: [
    { id: "boil", headline: "Cook the pasta", instruction: "Boil 200 g pasta in salted water.", ingredientIds: ["pasta", "salt"] },
    { id: "saute", headline: "Sauté 2 cloves of garlic", instruction: "Sauté 2 cloves of garlic.", ingredientIds: ["garlic"] },
    { id: "sauce", headline: "Add chopped tomatoes", instruction: "Add chopped tomatoes and tomato paste to the pan and simmer until the sauce thickens.", ingredientIds: ["tomatoes", "paste"] },
    { id: "serve", headline: "Combine pasta and sauce", instruction: "Combine pasta and sauce and top with 40 g parmesan.", ingredientIds: ["pasta", "tomatoes", "cheese"] },
  ] };
}

class MockProvider implements LLMProvider {
  prompts: string[] = [];
  constructor(readonly outputs: (unknown | Error)[]) {}
  async generate(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("Unexpected model request");
    return typeof output === "string" ? output : JSON.stringify(output);
  }
}

function setup(outputs: unknown[], completed = 0) {
  const store = new CookingSessionStore();
  store.createSession("dinner", recipe());
  store.startSession("dinner");
  for (const step of recipe().steps.slice(0, completed)) store.completeCurrentStep("dinner", step.id);
  const provider = new MockProvider(outputs);
  return { store, provider, agent: new CookingAgent(provider, store, "dinner") };
}

const noChanges = { stepUpdates: [], additionalIngredients: [] };
const clarification: AdaptiveAction = { type: "clarification", message: "Which cheese do you have instead?" };
const advice: AdaptiveAction = { type: "cooking_problem", message: "Take the pan off the heat now.", ...noChanges };

function omission(): AdaptiveAction {
  return { type: "ingredient_change", message: "Skip the paste and cook the tomatoes down for longer.",
    originalIngredientId: "paste", replacement: null, reason: "Tomatoes can reduce to thicken the sauce.",
    stepUpdates: [{ id: "sauce", headline: "Add chopped tomatoes", instruction: "Add chopped tomatoes and simmer longer until thickened.", ingredientIds: ["tomatoes"] }],
    additionalIngredients: [] };
}

function scaling(): AdaptiveAction {
  return { type: "scale_servings", message: "Use double the unused ingredients for four servings.", servings: 4,
    unscaledIngredientIds: [], additionalIngredients: [], stepUpdates: [
      { ...recipe().steps[0]!, headline: "Cook the pasta", instruction: "Boil 400 g pasta in salted water." },
      { ...recipe().steps[1]!, headline: "Sauté 4 cloves of garlic", instruction: "Sauté 4 cloves of garlic." },
      { ...recipe().steps[3]!, headline: "Combine pasta and sauce", instruction: "Combine pasta and sauce and top with 80 g parmesan." },
    ] };
}

describe("adaptive CookingAgent", () => {
  it("handles the real tomato-paste omission scenario without changing completed pasta or garlic", async () => {
    const { agent, store, provider } = setup([omission()], 2);
    const before = agent.getCurrentStep().session;
    const result = await agent.adaptCooking("oh i dont have tomato paste, my bad");
    assert.equal(result.currentStep?.id, "sauce");
    assert.equal(result.session.id, before.id);
    assert.deepEqual(result.session.completedStepIds, ["boil", "saute"]);
    assert.deepEqual(result.session.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
    assert.equal(result.session.recipe.ingredients.some((ingredient) => ingredient.id === "paste"), false);
    assert.deepEqual(result.currentStep?.ingredientIds, ["tomatoes"]);
    assert.deepEqual(result.session.substitutions, [{ originalIngredientId: "paste", replacement: null, reason: "Tomatoes can reduce to thicken the sauce." }]);
    const context = JSON.parse(provider.prompts[0]!.split("Context: ")[1]!);
    assert.deepEqual(context.completedSteps, before.recipe.steps.slice(0, 2));
    assert.equal(context.currentStep.id, "sauce");
    assert.deepEqual(context.remainingSteps, [before.recipe.steps[3]]);
    assert.deepEqual(context.ingredients, before.recipe.ingredients);
    assert.deepEqual(context.usedIngredientIds, ["pasta", "salt", "garlic"]);
    assert.equal(context.servings, 2);
    assert.deepEqual(context.substitutions, []);
    for (const key of ["id", "timers", "status", "sessionId"]) assert.equal(key in context, false);
    assert.match(result.message, /longer/);
    result.currentStep!.instruction = "Corrupt snapshot";
    result.session.substitutions.length = 0;
    assert.equal(store.getSession("dinner")!.substitutions.length, 1);
  });

  it("records a non-1:1 substitution and updates all remaining uses", async () => {
    const replacement = { id: "pecorino", name: "Pecorino", quantity: 25, unit: "g" };
    const change: AdaptiveAction = { type: "ingredient_change", message: "Use 25 g pecorino; it is saltier.",
      originalIngredientId: "cheese", replacement, reason: "Stronger, saltier cheese.", additionalIngredients: [],
      ingredientAvailability: [{ ingredientId: "pecorino", basis: "cook_confirmed", evidence: "I have pecorino" }],
      stepUpdates: [{ id: "serve", headline: "Combine pasta and sauce", instruction: "Combine pasta and sauce and top with 25 g pecorino.", ingredientIds: ["pasta", "tomatoes", "pecorino"] }] };
    const { agent, provider } = setup([change, advice], 2);
    const result = await agent.adaptCooking("I don't have parmesan but I have pecorino.");
    assert.deepEqual(result.session.substitutions[0]?.replacement, replacement);
    assert.deepEqual(result.session.recipe.ingredients.find((ingredient) => ingredient.id === "pecorino"), replacement);
    assert.match(result.session.recipe.steps[3]!.instruction, /25 g pecorino/);
    await agent.adaptCooking("The onions are burning.");
    assert.match(provider.prompts[1]!, /"originalIngredientId":"cheese"/);
  });

  it("preserves a used original ingredient when replacing its future use", async () => {
    const replacement = { id: "rice", name: "Cooked rice", quantity: 200, unit: "g" };
    const { agent } = setup([{ type: "ingredient_change", message: "Use rice for the remaining combination.",
      originalIngredientId: "pasta", replacement, reason: "Use what is available.", additionalIngredients: [],
      ingredientAvailability: [{ ingredientId: "rice", basis: "cook_confirmed", evidence: "I have cooked rice" }],
      stepUpdates: [{ ...recipe().steps[3], headline: "Combine rice and sauce", instruction: "Combine rice and sauce; add parmesan.", ingredientIds: ["rice", "tomatoes", "cheese"] }] }], 2);
    const before = agent.getCurrentStep().session;
    const after = (await agent.adaptCooking("I cannot use the cooked pasta; I have cooked rice.")).session;
    assert.deepEqual(after.recipe.steps[0], before.recipe.steps[0]);
    assert.deepEqual(after.recipe.ingredients.find((ingredient) => ingredient.id === "pasta"), before.recipe.ingredients[0]);
    assert.deepEqual(after.completedStepIds, before.completedStepIds);
  });

  it("scales numeric unused quantities and instructions while retaining unspecified salt", async () => {
    const { agent } = setup([scaling()]);
    const result = await agent.adaptCooking("We're actually cooking for four people.");
    assert.equal(result.session.recipe.servings, 4);
    assert.deepEqual(result.session.recipe.ingredients.map((ingredient) => ingredient.quantity), [400, 4, 800, 60, 80, null]);
    assert.match(result.currentStep!.instruction, /400 g/);
    assert.match(result.session.recipe.steps[3]!.instruction, /80 g/);
  });

  it("scales after use without rewriting physical history and accepts explicit compensation", async () => {
    const action = scaling();
    assert.equal(action.type, "scale_servings");
    action.stepUpdates = [
      { id: "sauce", headline: "Cook the extra pasta", instruction: "Boil another 200 g pasta separately. Add 800 g tomatoes, 60 g paste and 2 extra cloves of garlic; simmer.", ingredientIds: ["extra-pasta", "extra-garlic", "tomatoes", "paste"] },
      { ...recipe().steps[3]!, headline: "Combine pasta and sauce", instruction: "Combine all pasta and sauce and top with 80 g parmesan.", ingredientIds: ["pasta", "extra-pasta", "tomatoes", "cheese"] },
    ];
    action.additionalIngredients = [
      { id: "extra-pasta", name: "Additional pasta", quantity: 200, unit: "g" },
      { id: "extra-garlic", name: "Additional garlic", quantity: 2, unit: "cloves" },
    ];
    action.ingredientAvailability = action.additionalIngredients.map(({ id }) => ({ ingredientId: id, basis: "cook_confirmed" as const, evidence: "I have more pasta and garlic" }));
    const { agent } = setup([action], 2);
    const before = agent.getCurrentStep().session;
    const after = (await agent.adaptCooking("We're actually four people, and I have more pasta and garlic.")).session;
    assert.equal(after.recipe.servings, 4);
    assert.deepEqual(after.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
    assert.deepEqual(after.completedStepIds, before.completedStepIds);
    assert.deepEqual(after.recipe.ingredients.slice(0, 6).map((ingredient) => ingredient.quantity), [200, 2, 800, 60, 80, null]);
    assert.deepEqual(after.recipe.ingredients.slice(6), action.additionalIngredients);
  });

  it("supports seasoning exceptions and repeated scaling of the remaining plan", async () => {
    const first = { ...scaling(), unscaledIngredientIds: ["paste"] };
    const second = { ...scaling(), servings: 6, stepUpdates: [], unscaledIngredientIds: ["paste"] };
    const { agent } = setup([first, second]);
    await agent.adaptCooking("Four people, keep the paste amount.");
    const after = (await agent.adaptCooking("Actually six, still keep the paste amount.")).session;
    assert.deepEqual(after.recipe.ingredients.map((ingredient) => ingredient.quantity), [600, 6, 1200, 30, 120, null]);
  });

  it("returns urgent advice without changing any state", async () => {
    const { agent } = setup([advice], 1);
    const before = agent.getCurrentStep().session;
    const after = await agent.adaptCooking("The garlic is burning.");
    assert.equal(after.message, "Take the pan off the heat now.");
    assert.deepEqual(after.session, before);
  });

  it("adapts current/future problem instructions with an explicit added ingredient", async () => {
    const { agent } = setup([{ type: "cooking_problem", message: "Stir in a little water now.",
      additionalIngredients: [{ id: "water", name: "Water", quantity: 30, unit: "ml" }],
      ingredientAvailability: [{ ingredientId: "water", basis: "assumed_staple", evidence: null }],
      stepUpdates: [{ id: "sauce", headline: "Stir in water", instruction: "Stir in 30 ml water, then simmer gently.", ingredientIds: ["tomatoes", "paste", "water"] }] }], 2);
    const before = agent.getCurrentStep().session;
    const after = (await agent.adaptCooking("The sauce is too thick.")).session;
    assert.deepEqual(after.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
    assert.match(after.recipe.steps[2]!.instruction, /30 ml water/);
    assert.equal(after.recipe.ingredients.at(-1)!.id, "water");
  });

  it("includes newly available garlic through a plan adjustment without inventing a substitution", async () => {
    const garlic = { id: "extra-garlic", name: "Additional garlic", quantity: 1, unit: "clove" };
    const action: AdaptiveAction = { type: "cooking_problem", message: "Mince one extra clove and cook it with the tomatoes.",
      additionalIngredients: [garlic], ingredientAvailability: [{ ingredientId: "extra-garlic", basis: "cook_confirmed", evidence: "i have garlic too" }], stepUpdates: [{ id: "sauce",
        headline: "Mince the extra garlic", instruction: "Mince one extra clove of garlic. Add it with the tomatoes and tomato paste; simmer.",
        ingredientIds: ["tomatoes", "paste", "extra-garlic"] }] };
    const { agent } = setup([action], 2);
    const before = agent.getCurrentStep().session;
    const after = (await agent.adaptCooking("oh i have garlic too")).session;
    assert.deepEqual(after.completedStepIds, before.completedStepIds);
    assert.deepEqual(after.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
    assert.deepEqual(after.recipe.ingredients.slice(0, before.recipe.ingredients.length), before.recipe.ingredients);
    assert.deepEqual(after.recipe.ingredients.at(-1), garlic);
    assert.deepEqual(after.substitutions, before.substitutions);
    assert.equal(after.currentStepId, before.currentStepId);
    assert.match(agent.getCurrentStep().currentStep!.instruction, /extra clove/);
  });

  it("clarifies ingredient availability and then adds it without advancing completed history", async () => {
    const question: AdaptiveAction = { type: "clarification", message: "Would you like to add extra garlic?" };
    const addition: AdaptiveAction = { type: "cooking_problem", message: "Mince another clove and add it to the sauce.",
      additionalIngredients: [{ id: "extra-garlic", name: "Additional garlic", quantity: 1, unit: "clove" }],
      ingredientAvailability: [{ ingredientId: "extra-garlic", basis: "cook_confirmed", evidence: "i have garlic" }],
      stepUpdates: [{ id: "sauce", headline: "Mince another clove", instruction: "Mince another clove; add it with tomatoes and paste and simmer.",
        ingredientIds: ["tomatoes", "paste", "extra-garlic"] }] };
    const { agent, provider } = setup([question, addition], 2);
    const before = agent.getCurrentStep().session;
    assert.deepEqual((await agent.adaptCooking("i have garlic")).session, before);
    const result = await agent.adaptCooking("Yes, add it.");
    assert.deepEqual(result.session.completedStepIds, before.completedStepIds);
    assert.deepEqual(result.session.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
    assert.equal(result.session.substitutions.length, 0);
    assert.equal(result.session.recipe.ingredients.at(-1)?.id, "extra-garlic");
    const context = JSON.parse(provider.prompts[1]!.split("Context: ")[1]!);
    assert.deepEqual(context.previousClarification, { userMessage: "i have garlic", question: question.message });
  });

  it("reconciles only a justified contiguous prefix and can finish the session", async () => {
    const message = "I boiled the pasta and sautéed the garlic.";
    const action = { type: "reconcile_progress", message: "Next add tomatoes and paste.", completedSteps: [
      { stepId: "boil", evidence: "boiled the pasta" }, { stepId: "saute", evidence: "sautéed the garlic" },
    ] };
    const { agent } = setup([action, { type: "reconcile_progress", message: "Enjoy your meal.", completedSteps: [
      { stepId: "sauce", evidence: "I made the sauce" }, { stepId: "serve", evidence: "combined everything and topped with cheese" },
    ] }]);
    const before = agent.getCurrentStep().session;
    const result = await agent.adaptCooking(message);
    assert.deepEqual(result.session.completedStepIds, ["boil", "saute"]);
    assert.equal(result.currentStep?.id, "sauce");
    assert.deepEqual(result.session.recipe, before.recipe);
    const final = await agent.adaptCooking("I made the sauce, combined everything and topped with cheese.");
    assert.equal(final.session.status, "completed");
    assert.equal(final.currentStep, null);
  });

  it("asks for clarification on ambiguous progress without advancing", async () => {
    const { agent } = setup([{ type: "clarification", message: "Have you also finished boiling the pasta?" }]);
    const before = agent.getCurrentStep().session;
    assert.deepEqual((await agent.adaptCooking("I put it in.")).session, before);
  });

  it("retains clarification context for a follow-up without putting it in session state", async () => {
    const { agent, provider } = setup([clarification, advice]);
    const before = agent.getCurrentStep().session;
    assert.deepEqual((await agent.adaptCooking("I don't have the cheese.")).session, before);
    await agent.adaptCooking("Pecorino.");
    const context = JSON.parse(provider.prompts[1]!.split("Context: ")[1]!);
    assert.deepEqual(context.previousClarification, { userMessage: "I don't have the cheese.", question: clarification.message });
    assert.equal(context.userMessage, "Pecorino.");
    assert.deepEqual(agent.getCurrentStep().session, before);
  });

  const invalidOutputs: [string, unknown][] = [
    ["malformed JSON", "{broken"], ["unknown action", { type: "replace_session", session: {} }],
    ["extra session fields", { ...advice, completedStepIds: ["boil"] }],
    ["extra nested step fields", { ...advice, stepUpdates: [{ ...recipe().steps[2], status: "completed" }] }],
    ["empty message", { ...advice, message: " " }], ["missing arrays", { type: "cooking_problem", message: "Advice" }],
    ["invalid servings", { ...scaling(), servings: 0 }], ["fractional servings", { ...scaling(), servings: 1.5 }],
    ["unknown scale exception", { ...scaling(), unscaledIngredientIds: ["unknown"] }],
    ["duplicate scale exceptions", { ...scaling(), unscaledIngredientIds: ["paste", "paste"] }],
    ["unknown ingredient", { ...omission(), originalIngredientId: "unknown" }],
    ["addition disguised as an empty-original substitution", { ...omission(), originalIngredientId: "" }],
    ["invented additional-ingredient action", { ...advice, type: "additional_ingredient" }],
    ["unrevised original use", { ...omission(), stepUpdates: [] }],
    ["unused replacement", { ...omission(), replacement: { id: "new", name: "New", quantity: 1, unit: "g" } }],
    ["replacement ID collision", { ...omission(), replacement: recipe().ingredients[2] }],
    ["negative replacement", { ...omission(), replacement: { id: "new", name: "New", quantity: -1, unit: "g" } }],
    ["duplicate additional ingredients", { ...advice, additionalIngredients: [recipe().ingredients[0], recipe().ingredients[0]] }],
    ["unknown step", { ...advice, stepUpdates: [{ id: "invented", headline: "Skip", instruction: "Skip", ingredientIds: [] }] }],
    ["duplicate step updates", { ...advice, stepUpdates: [recipe().steps[2], recipe().steps[2]] }],
    ["unknown ingredient reference", { ...advice, stepUpdates: [{ id: "sauce", headline: "Cook", instruction: "Cook", ingredientIds: ["invented"] }] }],
    ["duplicate references", { ...advice, stepUpdates: [{ id: "sauce", headline: "Cook", instruction: "Cook", ingredientIds: ["tomatoes", "tomatoes"] }] }],
    ["ingredient overwrite", { ...advice, additionalIngredients: [{ ...recipe().ingredients[0], quantity: 400 }] }],
    ["unreferenced addition", { ...advice, additionalIngredients: [{ id: "extra", name: "Extra", quantity: 1, unit: null }] }],
    ["empty reconciliation", { type: "reconcile_progress", message: "Next", completedSteps: [] }],
    ["skipped progress", { type: "reconcile_progress", message: "Next", completedSteps: [{ stepId: "saute", evidence: "done" }] }],
    ["invented evidence", { type: "reconcile_progress", message: "Next", completedSteps: [{ stepId: "boil", evidence: "I boiled pasta" }] }],
    ["partial invalid progress", { type: "reconcile_progress", message: "Next", completedSteps: [{ stepId: "boil", evidence: "done" }, { stepId: "serve", evidence: "done" }] }],
    ["duplicate progress", { type: "reconcile_progress", message: "Next", completedSteps: [{ stepId: "boil", evidence: "done" }, { stepId: "boil", evidence: "done" }] }],
  ];
  for (const [name, output] of invalidOutputs) {
    it(`rejects ${name} atomically and permits retry`, async () => {
      const { agent } = setup([output, advice]);
      const before = agent.getCurrentStep().session;
      await assert.rejects(agent.adaptCooking("done"));
      assert.deepEqual(agent.getCurrentStep().session, before);
      assert.deepEqual((await agent.adaptCooking("The garlic is burning.")).session, before);
    });
  }

  it("rejects history edits even when another update was valid", async () => {
    const { agent } = setup([{ ...omission(), stepUpdates: [
      ...(omission() as Extract<AdaptiveAction, { type: "ingredient_change" }>).stepUpdates,
      { id: "boil", headline: "Cook the pasta", instruction: "Boiled 400 g pasta.", ingredientIds: ["pasta"] },
    ] }], 2);
    const before = agent.getCurrentStep().session;
    await assert.rejects(agent.adaptCooking("I don't have tomato paste."));
    assert.deepEqual(agent.getCurrentStep().session, before);
  });

  it("failed inference preserves state and clarification and allows retry", async () => {
    const { agent, provider } = setup([clarification, new Error("Unavailable"), advice], 2);
    const before = agent.getCurrentStep().session;
    await agent.adaptCooking("I don't have the cheese.");
    await assert.rejects(agent.adaptCooking("Pecorino"), /Unavailable/);
    assert.deepEqual(agent.getCurrentStep().session, before);
    await agent.adaptCooking("Pecorino");
    assert.match(provider.prompts[2]!, /Which cheese/);
  });

  it("reads and completes deterministically and clears stale clarification", async () => {
    const { agent, provider } = setup([clarification, advice]);
    await agent.adaptCooking("I don't have the cheese.");
    agent.getCurrentStep();
    agent.completeCurrentStep("boil");
    assert.equal(provider.prompts.length, 1);
    await agent.adaptCooking("The garlic is burning.");
    assert.match(provider.prompts[1]!, /"previousClarification":null/);
  });

  it("blocks overlapping adaptation/completion and rejects externally stale responses", async () => {
    const store = new CookingSessionStore();
    store.createSession("dinner", recipe());
    store.startSession("dinner");
    let resolve!: (text: string) => void;
    const provider: LLMProvider = { generate: () => new Promise((done) => { resolve = done; }) };
    const agent = new CookingAgent(provider, store, "dinner");
    const adapting = agent.adaptCooking("Four people");
    await assert.rejects(agent.adaptCooking("Missing cheese"), /already in progress/);
    assert.throws(() => agent.completeCurrentStep("boil"), /already in progress/);
    assert.equal(agent.getCurrentStep().currentStep?.id, "boil");
    store.adjustCookingInstructions("dinner", "boil", { ...advice, stepUpdates: [{ ...recipe().steps[0]!, headline: "Boil gently", instruction: "Boil gently." }] });
    const externallyChanged = store.getSession("dinner");
    resolve(JSON.stringify(scaling()));
    await assert.rejects(adapting, /changed during/);
    assert.deepEqual(store.getSession("dinner"), externallyChanged);
  });

  it("requires non-empty input and an active session before calling the provider", async () => {
    const { agent, provider } = setup([], 4);
    await assert.rejects(agent.adaptCooking("Four people"), /active/);
    const readyStore = new CookingSessionStore();
    readyStore.createSession("ready", recipe());
    await assert.rejects(new CookingAgent(provider, readyStore, "ready").adaptCooking("Four people"), /active/);
    await assert.rejects(new CookingAgent(provider).adaptCooking("Four people"), /start cooking first/);
    await assert.rejects(setup([]).agent.adaptCooking(" "), /describe/);
    assert.equal(provider.prompts.length, 0);
  });
});
