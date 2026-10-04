import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingSessionStore } from "../domain/cooking-session-store";
import { InvalidAdaptiveActionError } from "../domain/adaptive-action";
import { isAssumedStaple, unrepresentedStaples } from "../domain/pantry";
import { InvalidRecipeError, validateRecipe } from "../domain/recipe-validation";
import type { Recipe } from "../domain/types";
import type { Language } from "../shared/language";
import { CookingAgent, CookingAgentError } from "./cooking-agent";

// Task 6.2: availability model, pantry consistency and restrained additions. No provider calls.

const englishInput = "I have pasta, tomatoes, parmesan, cream and a banana.";
const proposal = { dishName: "Creamy Tomato Pasta", description: "Tomato sauce finished with cream and parmesan.", estimatedCookingMinutes: 25,
  servings: 2, assumedStaples: ["salt", "black pepper", "olive oil"], optionalAdditions: ["garlic", "dried oregano"], shoppingAdditions: [] };

function pastaRecipe(): Recipe {
  return { id: "creamy-tomato-pasta", title: proposal.dishName, servings: 2, ingredients: [
    { id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
    { id: "tomatoes", name: "Tomatoes", quantity: 400, unit: "g" },
    { id: "cream", name: "Cream", quantity: 100, unit: "ml" },
    { id: "parmesan", name: "Parmesan", quantity: 40, unit: "g" },
    { id: "oil", name: "Olive oil", quantity: 1, unit: "tbsp" },
    { id: "salt", name: "Salt", quantity: null, unit: null },
    { id: "pepper", name: "Black pepper", quantity: null, unit: null },
  ], steps: [
    { id: "boil", headline: "Cook the pasta", instruction: "Cook 200 g pasta in well-salted boiling water until al dente; reserve 100 ml pasta water.", ingredientIds: ["pasta"] },
    { id: "sauce", headline: "Cook down the tomatoes", instruction: "Heat 1 tbsp olive oil, add 400 g tomatoes and reduce for 10 minutes. Season with salt and black pepper.", ingredientIds: ["oil", "tomatoes", "salt", "pepper"] },
    { id: "cream", headline: "Stir in the cream", instruction: "Lower the heat and stir in 100 ml cream.", ingredientIds: ["cream"] },
    { id: "finish", headline: "Finish off the heat", instruction: "Toss in the pasta off the heat, loosen with pasta water and stir in 40 g parmesan.", ingredientIds: ["pasta", "parmesan"] },
  ] };
}

class Provider {
  prompts: string[] = [];
  constructor(private readonly outputs: unknown[]) {}
  async generate(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    if (!this.outputs.length) throw new Error("Unexpected model request");
    return JSON.stringify(this.outputs.shift());
  }
}

/** Proposal and recipe accepted, then `completed` steps done. */
async function cooking(adaptive: unknown[], completed = 2, input = englishInput, language: Language = "en", recipe = pastaRecipe(), accepted = proposal) {
  const provider = new Provider([accepted, recipe, ...adaptive]);
  const store = new CookingSessionStore();
  const agent = new CookingAgent(provider, store, "dinner", undefined, language);
  await agent.proposeDish(input);
  await agent.acceptProposal();
  for (const step of recipe.steps.slice(0, completed)) agent.completeCurrentStep(step.id);
  return { agent, provider, store };
}
const instructions = (prompt: string) => prompt.split("Context: ")[0]!;
const context = (prompt: string) => JSON.parse(prompt.split("Context: ")[1]!);

describe("Task 6.2 staple policy", () => {
  it("assumes only water, salt, black pepper and a neutral or olive cooking oil (English and Polish)", () => {
    for (const name of ["Water", "salt", "Sea salt", "black pepper", "pepper", "olive oil", "neutral oil", "Sunflower oil",
      "woda", "sól", "pieprz", "czarny pieprz", "oliwa z oliwek", "olej rzepakowy"]) assert.equal(isAssumedStaple(name), true, name);
  });

  it("never assumes onion, garlic, butter, herbs, cheese, stock, tomato paste, purée, passata or other spices", () => {
    for (const name of ["onion", "garlic", "butter", "basil", "dried oregano", "parmesan", "stock", "tomato paste", "tomato purée", "passata",
      "cumin", "white pepper", "sesame oil", "cebula", "czosnek", "masło", "koncentrat pomidorowy", "przecier pomidorowy", "bulion"]) {
      assert.equal(isAssumedStaple(name), false, name);
    }
  });
});

describe("Task 6.2 pantry consistency in structured recipes", () => {
  it("rejects prose that uses a staple absent from structured ingredients", () => {
    const recipe = pastaRecipe();
    recipe.ingredients = recipe.ingredients.filter((ingredient) => ingredient.id !== "oil");
    recipe.steps[1]!.ingredientIds = ["tomatoes", "salt", "pepper"];
    assert.deepEqual(unrepresentedStaples(recipe), [{ stepId: "sauce", staple: "cooking oil" }]);
    assert.throws(() => validateRecipe(recipe), InvalidRecipeError);
  });

  it("requires the step that uses a staple to reference it, so UI, voice and adaptation see it", () => {
    const recipe = pastaRecipe();
    recipe.steps[1]!.ingredientIds = ["oil", "tomatoes"];
    assert.deepEqual(unrepresentedStaples(recipe).map(({ staple }) => staple), ["salt", "black pepper"]);
    assert.throws(() => validateRecipe(recipe), /must reference it as a structured ingredient/);
    assert.equal(validateRecipe(pastaRecipe()).ingredients.length, 7);
  });

  it("matches whole staple words only, in English and Polish", () => {
    const step = (instruction: string, ingredientIds: string[] = []) => ({ id: "s", headline: "Cook", instruction, ingredientIds });
    const recipe = (instruction: string, ingredientIds?: string[]): Recipe => ({ id: "r", title: "R", servings: 1,
      ingredients: [{ id: "oliwa", name: "Oliwa z oliwek", quantity: 1, unit: "tbsp" }, { id: "sol", name: "Sól", quantity: null, unit: null }],
      steps: [step(instruction, ingredientIds)] });
    for (const text of ["Boil the pasta in salted water.", "Slice the bell pepper.", "Use unsalted butter."]) assert.deepEqual(unrepresentedStaples(recipe(text)), [], text);
    assert.deepEqual(unrepresentedStaples(recipe("Rozgrzej łyżkę oliwy i dopraw solą.")).map(({ staple }) => staple), ["salt", "cooking oil"]);
    assert.deepEqual(unrepresentedStaples(recipe("Rozgrzej łyżkę oliwy i dopraw solą.", ["oliwa", "sol"])), []);
  });
});

describe("Task 6.2 planning with the CookingAgent", () => {
  it("treats supplied ingredients as available but not mandatory, without food-specific rules", async () => {
    const { provider, agent } = await cooking([], 0);
    // The accepted recipe leaves the banana out; nothing requires every supplied ingredient.
    assert.equal(agent.getCurrentStep().session.recipe.ingredients.some((ingredient) => /banana/i.test(ingredient.name)), false);
    for (const prompt of provider.prompts.slice(0, 2)) {
      assert.match(prompt, /definitely available, but none is mandatory/);
      assert.match(prompt, /ONLY ingredients you may assume without asking: water, salt, black pepper, and one cooking oil \(neutral oil or olive oil\)/);
      assert.match(prompt, /Never silently assume onion, garlic, butter, herbs, cheese, stock, tomato paste, tomato purée, passata/);
      assert.doesNotMatch(instructions(prompt), /banana/i);
    }
    assert.match(provider.prompts[0]!, /not a dish that merely combines every listed ingredient/);
    assert.match(provider.prompts[1]!, /Never include the proposal's optionalAdditions/);
    assert.match(provider.prompts[1]!, /keep simple food simple/);
  });

  it("keeps assumed staples within policy and optional/shopping additions restrained (max 3)", async () => {
    const rejected = async (overrides: object) => assert.rejects(new CookingAgent(new Provider([{ ...proposal, ...overrides }])).proposeDish(englishInput), CookingAgentError);
    await rejected({ assumedStaples: ["salt", "onion"] });
    await rejected({ assumedStaples: ["garlic"] });
    await rejected({ optionalAdditions: ["garlic", "basil", "chili flakes", "lemon"] });
    await rejected({ shoppingAdditions: ["basil", "garlic", "lemon", "mozzarella"] });
    await rejected({ optionalAdditions: ["garlic"], shoppingAdditions: ["garlic"] });
    await rejected({ optionalAdditions: ["salt"] });
    const shopping = await new CookingAgent(new Provider([{ ...proposal, optionalAdditions: [], shoppingAdditions: ["garlic", "fresh basil"] }]))
      .proposeDish("I have pasta, tomatoes and parmesan. I can buy a couple things.");
    assert.deepEqual(shopping.shoppingAdditions, ["garlic", "fresh basil"]);
    const legacy = await new CookingAgent(new Provider([{ dishName: "Toast", description: "Eggs on toast.", estimatedCookingMinutes: 10, servings: 1 }])).proposeDish("I have eggs and bread.");
    assert.deepEqual([legacy.assumedStaples, legacy.optionalAdditions, legacy.shoppingAdditions], [[], [], []]);
    const provider = new Provider([proposal]);
    await new CookingAgent(provider).proposeDish(englishInput);
    assert.match(provider.prompts[0]!, /shoppingAdditions: \[\] unless the cook explicitly offered to buy or shop; then 0–3/);
  });

  it("keeps optional additions unconfirmed: a recipe using one is rejected", async () => {
    const recipe = pastaRecipe();
    recipe.ingredients.push({ id: "garlic", name: "Garlic", quantity: 2, unit: "clove" });
    recipe.steps[1]!.ingredientIds.push("garlic");
    const agent = new CookingAgent(new Provider([proposal, recipe]), new CookingSessionStore(), "dinner");
    await agent.proposeDish(englishInput);
    await assert.rejects(agent.acceptProposal(), /unconfirmed optional ingredient/);
    assert.throws(() => agent.getCurrentStep());
  });
});

describe("Task 6.2 availability in adaptive cooking", () => {
  const purée = { id: "puree", name: "Tomato purée", quantity: 30, unit: "g" };
  const substitution = (availability?: unknown) => ({ type: "ingredient_change", message: "Use tomato purée instead.", originalIngredientId: "cream",
    replacement: purée, reason: "Similar body.", additionalIngredients: [],
    stepUpdates: [{ id: "cream", headline: "Stir in the purée", instruction: "Stir in 30 g tomato purée.", ingredientIds: ["puree"] }],
    ...(availability === undefined ? {} : { ingredientAvailability: availability }) });

  it("rejects a substitute the cook never confirmed, however it is labelled, leaving state and history untouched", async () => {
    for (const availability of [undefined, [], [{ ingredientId: "puree", basis: "assumed_staple", evidence: null }],
      [{ ingredientId: "puree", basis: "cook_confirmed", evidence: "I have tomato purée" }]]) {
      const { agent } = await cooking([substitution(availability)]);
      const before = agent.getCurrentStep().session;
      await assert.rejects(agent.adaptCooking("I don't have cream after all."), InvalidAdaptiveActionError);
      assert.deepEqual(agent.getCurrentStep().session, before);
    }
  });

  it("accepts a substitute the cook confirmed in their own words", async () => {
    const { agent } = await cooking([substitution([{ ingredientId: "puree", basis: "cook_confirmed", evidence: "I have some tomato purée" }])]);
    const after = (await agent.adaptCooking("No cream, but I have some tomato purée.")).session;
    assert.equal(after.recipe.ingredients.some((ingredient) => ingredient.id === "puree"), true);
  });

  it("allows omission without any availability claim, and keeps completed history immutable", async () => {
    const omission = { type: "ingredient_change", message: "Skip the cream; finish with parmesan and pasta water.", originalIngredientId: "cream",
      replacement: null, reason: "The sauce works without it.", additionalIngredients: [], ingredientAvailability: [],
      stepUpdates: [{ id: "cream", headline: "Loosen with pasta water", instruction: "Loosen the sauce with a splash of pasta water.", ingredientIds: [] }] };
    const { agent } = await cooking([omission]);
    const before = agent.getCurrentStep().session;
    const after = (await agent.adaptCooking("I don't have cream after all.")).session;
    assert.equal(after.recipe.ingredients.some((ingredient) => ingredient.id === "cream"), false);
    assert.deepEqual(after.completedStepIds, before.completedStepIds);
    assert.deepEqual(after.recipe.steps.slice(0, 2), before.recipe.steps.slice(0, 2));
  });

  it("treats an ingredient from the original list as available, and an assumed staple as assumable", async () => {
    const extra = { type: "cooking_problem", message: "Grate a little extra parmesan over the top.", ingredientAvailability: [{ ingredientId: "extra-parmesan", basis: "cook_confirmed", evidence: "parmesan" }],
      additionalIngredients: [{ id: "extra-parmesan", name: "Extra parmesan", quantity: 10, unit: "g" }],
      stepUpdates: [{ id: "finish", headline: "Finish off the heat", instruction: "Toss in the pasta off the heat, loosen with pasta water, stir in 40 g parmesan and top with 10 g more.", ingredientIds: ["pasta", "parmesan", "extra-parmesan"] }] };
    // "parmesan" was only in the original ingredient list, not in this message.
    assert.equal((await (await cooking([extra])).agent.adaptCooking("It needs more cheese.")).session.recipe.ingredients.at(-1)?.id, "extra-parmesan");
    const thinner = { type: "cooking_problem", message: "Add a little water and season with salt.", stepUpdates: [
      { id: "cream", headline: "Loosen the sauce", instruction: "Stir in 50 ml water and 100 ml cream; season with salt.", ingredientIds: ["water", "cream", "salt"] }],
      additionalIngredients: [{ id: "water", name: "Water", quantity: 50, unit: "ml" }],
      ingredientAvailability: [{ ingredientId: "water", basis: "assumed_staple", evidence: null }] };
    const { agent, provider } = await cooking([thinner]);
    await agent.adaptCooking("The sauce is too thick.");
    const sent = context(provider.prompts[2]!);
    assert.deepEqual(sent.cookStatements, [englishInput]);
    assert.deepEqual(sent.assumedStaples, ["water", "salt", "black pepper", "cooking oil"]);
    assert.deepEqual(sent.unconfirmedSuggestions, ["garlic", "dried oregano"]);
    const garlic = { type: "cooking_problem", message: "Add garlic.", additionalIngredients: [{ id: "garlic", name: "Garlic", quantity: 1, unit: "clove" }],
      stepUpdates: [{ id: "cream", headline: "Add garlic", instruction: "Add 1 clove garlic, then the cream.", ingredientIds: ["garlic", "cream"] }],
      ingredientAvailability: [{ ingredientId: "garlic", basis: "cook_confirmed", evidence: "garlic" }] };
    // Garlic was only suggested; "garlic" appears nowhere in the cook's own words.
    await assert.rejects((await cooking([garlic])).agent.adaptCooking("Should I add something?"), InvalidAdaptiveActionError);
  });

  it("prompts adaptive cooking to omit, use what is available, or ask rather than invent availability", async () => {
    const { agent, provider } = await cooking([{ type: "clarification", message: "Do you have any tomato purée or passata?" }]);
    await agent.adaptCooking("I don't have tomato paste.");
    const prompt = instructions(provider.prompts[2]!);
    assert.match(prompt, /omit it when the dish still works \(replacement null\)/);
    assert.match(prompt, /never add it to state unless confirmed/);
    assert.match(prompt, /exactly one entry for every ingredient the action introduces/);
  });

  it("works the same in Polish: Polish staples, references and quoted confirmation", async () => {
    const polishProposal = { dishName: "Kremowy makaron pomidorowy", description: "Sos pomidorowy ze śmietaną i parmezanem.", estimatedCookingMinutes: 25,
      servings: 2, assumedStaples: ["sól", "oliwa z oliwek"], optionalAdditions: ["czosnek"], shoppingAdditions: [] };
    const recipe: Recipe = { id: "makaron", title: polishProposal.dishName, servings: 2, ingredients: [
      { id: "makaron", name: "Makaron", quantity: 200, unit: "g" }, { id: "pomidory", name: "Pomidory", quantity: 400, unit: "g" },
      { id: "smietana", name: "Śmietana", quantity: 100, unit: "ml" }, { id: "oliwa", name: "Oliwa z oliwek", quantity: 1, unit: "tbsp" },
      { id: "sol", name: "Sól", quantity: null, unit: null }],
    steps: [{ id: "sos", headline: "Zredukuj pomidory", instruction: "Rozgrzej 1 łyżkę oliwy, dodaj 400 g pomidorów i dopraw solą.", ingredientIds: ["oliwa", "pomidory", "sol"] },
      { id: "smietana", headline: "Dodaj śmietanę", instruction: "Zmniejsz ogień i wmieszaj 100 ml śmietany.", ingredientIds: ["smietana"] },
      { id: "makaron", headline: "Połącz z makaronem", instruction: "Ugotuj 200 g makaronu i połącz z sosem.", ingredientIds: ["makaron"] }] };
    const garlic = { type: "cooking_problem", message: "Dodaj czosnek do sosu.", additionalIngredients: [{ id: "czosnek", name: "Czosnek", quantity: 1, unit: "clove" }],
      stepUpdates: [{ id: "smietana", headline: "Dodaj czosnek i śmietanę", instruction: "Dodaj 1 ząbek czosnku, potem 100 ml śmietany.", ingredientIds: ["czosnek", "smietana"] }],
      ingredientAvailability: [{ ingredientId: "czosnek", basis: "cook_confirmed", evidence: "mam też czosnek" }] };
    const { agent, provider } = await cooking([garlic], 1, "Mam makaron, pomidory, śmietanę i parmezan.", "pl", recipe, polishProposal);
    assert.match(provider.prompts[0]!, /Polish \(pl\)/);
    assert.match(provider.prompts[0]!, /none is mandatory/);
    const after = (await agent.adaptCooking("Mam też czosnek.")).session;
    assert.equal(after.recipe.ingredients.at(-1)?.id, "czosnek");
    assert.deepEqual(after.completedStepIds, ["sos"]);
  });
});
