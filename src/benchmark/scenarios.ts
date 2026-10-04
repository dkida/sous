import { createHash } from "node:crypto";
import { CookingAgent, CookingAgentError, type AdaptiveCookingResult, type CookingProgress, type DishProposal } from "../application/cooking-agent";
import type { InteractionTiming } from "../application/interaction-timing";
import type { LLMProvider } from "../application/llm-provider";
import { CookingSessionStore } from "../domain/cooking-session-store";
import { InvalidAdaptiveActionError } from "../domain/adaptive-action";
import { InvalidRecipeError } from "../domain/recipe-validation";
import type { CookingSession, Recipe } from "../domain/types";
import { GemmaProviderError } from "../infrastructure/gemma-provider";
import { GeminiFlashLiteProviderError } from "../infrastructure/gemini-flash-lite-provider";
import { MistralProviderError } from "../infrastructure/mistral-provider";

export const scenarios = ["proposal", "recipe", "missing-paste", "scale-2-to-4", "burning-onions"] as const;
export type Scenario = typeof scenarios[number];
export const ingredientsInput = "I have pasta, onion, garlic, canned tomatoes, tomato paste and parmesan. Make two servings of tomato pasta.";
export const acceptedProposal: DishProposal = {
  dishName: "Tomato Parmesan Pasta", description: "Pasta with tomato sauce and parmesan.", estimatedCookingMinutes: 25, servings: 2,
  assumedStaples: ["salt", "olive oil"], optionalAdditions: [], shoppingAdditions: [],
};

/** Controlled context, independent of either model's generated recipe. */
export function fixtureRecipe(): Recipe {
  return { id: "benchmark-tomato-pasta", title: acceptedProposal.dishName, servings: 2,
    ingredients: [
      { id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
      { id: "onion", name: "Onion", quantity: 1, unit: "whole" },
      { id: "garlic", name: "Garlic", quantity: 2, unit: "cloves" },
      { id: "tomatoes", name: "Canned tomatoes", quantity: 400, unit: "g" },
      { id: "paste", name: "Tomato paste", quantity: 30, unit: "g" },
      { id: "parmesan", name: "Parmesan", quantity: 40, unit: "g" },
      { id: "oil", name: "Olive oil", quantity: 15, unit: "ml" },
      { id: "salt", name: "Salt", quantity: null, unit: null },
    ], steps: [
      { id: "boil", headline: "Cook the pasta", instruction: "Boil 200 g pasta in salted water until al dente.", ingredientIds: ["pasta", "salt"] },
      { id: "saute", headline: "Sauté onion and garlic", instruction: "Heat 15 ml oil and sauté one chopped onion and two cloves of garlic until softened.", ingredientIds: ["oil", "onion", "garlic"] },
      { id: "sauce", headline: "Add chopped tomatoes", instruction: "Add chopped tomatoes and tomato paste to the pan and simmer until the sauce thickens.", ingredientIds: ["tomatoes", "paste"] },
      { id: "serve", headline: "Combine pasta and sauce", instruction: "Combine the cooked pasta and sauce, then top with 40 g parmesan.", ingredientIds: ["pasta", "tomatoes", "parmesan"] },
    ] };
}

const adaptiveMessages: Record<Exclude<Scenario, "proposal" | "recipe">, string> = {
  "missing-paste": "oh i dont have tomato paste, my bad",
  "scale-2-to-4": "We're actually cooking for four people.",
  "burning-onions": "the onions are burning",
};

export interface ScenarioResult {
  timing: InteractionTiming;
  promptHash: string;
  success: boolean;
  failureKind: string | null;
  validStructuredOutput: boolean | null;
  correctStateTransition: boolean;
  completedHistoryPreserved: boolean;
  culinaryAssessment: "requires manual review" | "no output";
  // Validated cooking output for qualitative review; never a prompt or HTTP diagnostic.
  output: DishProposal | Recipe | AdaptiveCookingResult["action"] | null;
  // Raw model text of a rejected response, so structural failures can be explained without extra calls.
  rejectedModelText: string | null;
}

export async function runScenario(scenario: Scenario, provider: LLMProvider): Promise<ScenarioResult> {
  const store = new CookingSessionStore();
  const sessionId = "benchmark-session";
  // Every non-proposal trial starts from the same accepted proposal, so the agent also knows what the cook said they have.
  let seedingProposal = scenario !== "proposal";
  let timing: InteractionTiming | undefined;
  let promptHash = "";
  let modelText: string | null = null;
  const trackingProvider: LLMProvider = { generate: async (prompt, contract) => {
    if (seedingProposal) {
      seedingProposal = false;
      return JSON.stringify(acceptedProposal);
    }
    promptHash = createHash("sha256").update(prompt).digest("hex");
    return modelText = await provider.generate(prompt, contract);
  } };
  const agent = new CookingAgent(trackingProvider, store, sessionId, (measurement) => {
    if (promptHash) timing = measurement;
  });
  // Seed the same accepted proposal without making an API call or recording it as a trial.
  if (scenario !== "proposal") await agent.proposeDish(ingredientsInput);
  if (scenario !== "proposal" && scenario !== "recipe") {
    store.createSession(sessionId, fixtureRecipe());
    store.startSession(sessionId);
    store.completeCurrentStep(sessionId, "boil");
    if (scenario !== "burning-onions") store.completeCurrentStep(sessionId, "saute");
  }
  const before = store.getSession(sessionId);
  let result: DishProposal | CookingProgress | AdaptiveCookingResult | undefined;
  let failureKind: string | null = null;
  try {
    result = scenario === "proposal" ? await agent.proposeDish(ingredientsInput)
      : scenario === "recipe" ? await agent.acceptProposal()
      : await agent.adaptCooking(adaptiveMessages[scenario]);
  } catch (error) {
    failureKind = classifyFailure(error);
  }
  if (!timing || !promptHash) throw new Error("Benchmark did not reach the provider timing boundary.");
  const after = store.getSession(sessionId);
  const output = result ? ("action" in result ? result.action : "session" in result ? result.session.recipe : result) : null;
  return { timing, promptHash, success: !!result, failureKind,
    validStructuredOutput: timing.validationMs === null ? null : timing.operationMs !== null,
    correctStateTransition: result ? transitionMatches(scenario, before, after, result)
      : JSON.stringify(before) === JSON.stringify(after),
    completedHistoryPreserved: historyPreserved(before, after),
    culinaryAssessment: output ? "requires manual review" : "no output", output, rejectedModelText: result ? null : modelText };
}

function classifyFailure(error: unknown): string {
  if (error instanceof GemmaProviderError || error instanceof GeminiFlashLiteProviderError || error instanceof MistralProviderError) {
    const status = /HTTP (\d{3})/.exec(error.message)?.[1];
    return status ? `http-${status}` : /timed out/.test(error.message) ? "timeout" : "provider-error";
  }
  if (error instanceof InvalidAdaptiveActionError) return "invalid-action";
  if (error instanceof InvalidRecipeError) return "invalid-recipe";
  if (error instanceof CookingAgentError) return /malformed JSON/.test(error.message) ? "malformed-json" : "invalid-model-output";
  return "unexpected-error";
}

function historyPreserved(before: CookingSession | undefined, after: CookingSession | undefined): boolean {
  if (!before) return true;
  if (!after || JSON.stringify(before.completedStepIds) !== JSON.stringify(after.completedStepIds)) return false;
  const used = new Set<string>();
  for (const id of before.completedStepIds) {
    const step = before.recipe.steps.find((candidate) => candidate.id === id)!;
    if (JSON.stringify(step) !== JSON.stringify(after.recipe.steps.find((candidate) => candidate.id === id))) return false;
    for (const ingredient of step.ingredientIds) used.add(ingredient);
  }
  return [...used].every((id) => JSON.stringify(before.recipe.ingredients.find((ingredient) => ingredient.id === id)) ===
    JSON.stringify(after.recipe.ingredients.find((ingredient) => ingredient.id === id)));
}

function transitionMatches(scenario: Scenario, before: CookingSession | undefined, after: CookingSession | undefined,
  result: DishProposal | CookingProgress | AdaptiveCookingResult): boolean {
  if (scenario === "proposal") return !after;
  if (scenario === "recipe") return after?.status === "cooking" && after.currentStepId === after.recipe.steps[0]?.id && after.completedStepIds.length === 0;
  if (!before || !after || !("action" in result) || after.status !== "cooking" || before.currentStepId !== after.currentStepId) return false;
  if (scenario === "missing-paste") return result.action.type === "ingredient_change" &&
    after.substitutions.some((substitution) => substitution.originalIngredientId === "paste") &&
    !after.recipe.steps.slice(after.completedStepIds.length).some((step) => step.ingredientIds.includes("paste"));
  if (scenario === "scale-2-to-4") return result.action.type === "scale_servings" && after.recipe.servings === 4 &&
    ["tomatoes", "paste", "parmesan"].every((id) => after.recipe.ingredients.find((ingredient) => ingredient.id === id)?.quantity ===
      before.recipe.ingredients.find((ingredient) => ingredient.id === id)!.quantity! * 2);
  return result.action.type === "cooking_problem";
}
