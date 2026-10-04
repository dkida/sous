import assert from "node:assert/strict";
import { it } from "node:test";
import type { Recipe } from "../domain/types";
import { spokenStep } from "./spoken-step";
import { spokenResponse } from "./cooking-input";
import type { WebCookingState } from "./contracts";

function recipe(language: "en" | "pl", instruction?: string): Recipe {
  return { id: "pasta", title: "Pasta", servings: 2,
    ingredients: [{ id: "pasta", name: language === "pl" ? "makaron" : "pasta", quantity: 200, unit: "g" },
      { id: "salt", name: language === "pl" ? "sól" : "salt", quantity: null, unit: null },
      { id: "onion", name: language === "pl" ? "cebula" : "onion", quantity: 1, unit: "piece" }],
    steps: [{ id: "cook", headline: language === "pl" ? "Ugotuj makaron" : "Cook the pasta",
      instruction: instruction ?? (language === "pl" ? "Ugotuj makaron w osolonej wodzie przez 8 minut, a następnie odcedź ostrożnie." : "Cook the pasta in salted water for 8 minutes, then drain carefully."), ingredientIds: ["pasta", "salt"] }] };
}

it("speaks full step details and only relevant known quantities in EN and PL", () => {
  for (const language of ["en", "pl"] as const) {
    const plan = recipe(language);
    const spoken = spokenStep(plan.steps[0]!, plan, language);
    assert.ok(spoken.startsWith(plan.steps[0]!.instruction));
    assert.match(spoken, language === "pl" ? /200 gramów/ : /200 grams/);
    assert.doesNotMatch(spoken, /onion|cebula|null/);
  }
});

it("does not duplicate quantities written as numbers, words, inflected Polish or partial amounts", () => {
  for (const [language, instruction] of [
    ["en", "Cook 200 g pasta for 8 minutes."], ["en", "Cook 200 grams of pasta, then drain."],
    ["pl", "Ugotuj 200 gramów makaronu w osolonej wodzie."], ["pl", "Ugotuj makaron (200 g) i odcedź."],
    ["pl", "Ugotuj dwieście gramów makaronu."], ["en", "Cook two hundred grams of pasta."],
    ["en", "Cook 100 g pasta; reserve the rest."],
  ] as const) {
    const plan = recipe(language, instruction);
    assert.equal(spokenStep(plan.steps[0]!, plan, language), instruction);
  }
  for (const [language, instruction] of [["en", "Dice one onion finely."], ["pl", "Pokrój jedną cebulę w drobną kostkę."]] as const) {
    const plan = recipe(language, instruction);
    plan.steps[0]!.ingredientIds = ["onion"];
    assert.equal(spokenStep(plan.steps[0]!, plan, language), instruction);
  }
  const cream = recipe("pl", "Dodaj 100 ml śmietany i gotuj na małym ogniu.");
  cream.ingredients = [{ id: "cream", name: "śmietana 30%", quantity: 100, unit: "ml" }];
  cream.steps[0]!.ingredientIds = ["cream"];
  assert.equal(spokenStep(cream.steps[0]!, cream, "pl"), cream.steps[0]!.instruction);
  const tomatoes = recipe("pl", "Wrzuć 250 g pomidorów koktajlowych na patelnię i smaż przez 4 minuty.");
  tomatoes.ingredients = [{ id: "tomatoes", name: "pomidory koktajlowe", quantity: 250, unit: "g" }];
  tomatoes.steps[0]!.ingredientIds = ["tomatoes"];
  assert.equal(spokenStep(tomatoes.steps[0]!, tomatoes, "pl"), tomatoes.steps[0]!.instruction);
});

it("keeps timing and heat and does not treat their numbers as ingredient amounts", () => {
  const plan = recipe("en", "Cook pasta for 200 seconds at 200 degrees.");
  assert.match(spokenStep(plan.steps[0]!, plan), /200 seconds at 200 degrees\. For this step: 200 grams pasta/);
});

it("inventing no amount when a step's structured quantity is absent", () => {
  const plan = recipe("pl"); plan.ingredients[0]!.quantity = null;
  assert.equal(spokenStep(plan.steps[0]!, plan, "pl"), plan.steps[0]!.instruction);
});

it("current, repeat and step progression speech use quantities; adaptive TTS remains its existing response", () => {
  const plan = recipe("pl"); const step = plan.steps[0]!;
  const state: WebCookingState = { proposal: null, response: { kind: "advice", message: "Zdejmij patelnię z ognia." },
    progress: { currentStep: step, session: { id: "s", recipe: plan, status: "cooking", currentStepId: step.id, completedStepIds: [], substitutions: [], quantityChanges: [], timers: [] } } };
  assert.match(spokenResponse({ action: "current" }, state, "pl"), /200 gramów/);
  assert.match(spokenResponse({ action: "complete", expectedStepId: "previous" }, state, "pl"), /200 gramów/);
  assert.equal(spokenResponse({ action: "adapt", message: "Przypala się" }, state, "pl"), "Zdejmij patelnię z ognia.");
});

it("does not append the newly reached instruction if the adaptive message already contains it in full", () => {
  const plan = recipe("en", "Cook 200 g pasta for 8 minutes, then drain carefully.");
  const step = plan.steps[0]!;
  const message = `Onion preparation is complete. ${step.instruction}`;
  const state: WebCookingState = { proposal: null, response: { kind: "changed", message },
    progress: { currentStep: step, session: { id: "s", recipe: plan, status: "cooking", currentStepId: step.id, completedStepIds: ["previous"], substitutions: [], quantityChanges: [], timers: [] } } };
  assert.equal(spokenResponse({ action: "adapt", message: "I chopped the onion" }, state, "en", "previous"), message);
});
