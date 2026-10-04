import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingAgent } from "../application/cooking-agent";
import { responseContracts } from "../application/response-schemas";
import { GemmaProvider } from "./gemma-provider";
import { GeminiFlashLiteProvider } from "./gemini-flash-lite-provider";
import { MistralProvider } from "./mistral-provider";
import { selectProvider } from "./provider-selection";

describe("explicit provider selection", () => {
  const mistralOnly = { MISTRAL_API_KEY: "fictional-mistral-key" };
  const gemini = { GEMINI_API_KEY: "fictional-key" };

  it("defaults to Mistral Small 4 (mistral-small-2603) with only MISTRAL_API_KEY; no Gemma/Gemini credentials needed", () => {
    const selected = selectProvider(mistralOnly);
    assert.equal(selected.name, "mistral");
    assert.equal(selected.model, "mistral-small-2603");
    assert.ok(selected.provider instanceof MistralProvider);
    // A leftover GEMMA_MODEL does not change the default.
    assert.equal(selectProvider({ ...mistralOnly, GEMMA_MODEL: "gemma-4-31b-it" }).model, "mistral-small-2603");
    assert.throws(() => selectProvider(gemini), /MISTRAL_API_KEY is required/);
    assert.equal(selectProvider({ ...mistralOnly, LLM_MODEL: "mistral-small-2506" }).model, "mistral-small-2506");
    assert.throws(() => selectProvider({ ...mistralOnly, LLM_MODEL: "mistral-small-latest" }), /pinned open-weight Mistral Small/);
  });

  it("keeps Gemma and Flash-Lite as explicit, non-default alternates", () => {
    const gemma = selectProvider({ ...gemini, LLM_PROVIDER: "gemma" });
    assert.ok(gemma.provider instanceof GemmaProvider);
    assert.equal(gemma.model, "gemma-4-26b-a4b-it");
    assert.equal(selectProvider({ ...gemini, LLM_PROVIDER: "gemma", GEMMA_MODEL: "gemma-4-31b-it" }).model, "gemma-4-31b-it");
    const flash = selectProvider({ ...gemini, LLM_PROVIDER: "gemini-flash-lite", GEMMA_MODEL: "gemma-4-31b-it" });
    assert.ok(flash.provider instanceof GeminiFlashLiteProvider);
    assert.equal(flash.model, "gemini-3.5-flash-lite");
    assert.equal(selectProvider({ ...gemini, LLM_PROVIDER: "gemini-flash-lite", LLM_MODEL: "gemini-3.1-flash-lite" }).model, "gemini-3.1-flash-lite");
  });

  it("rejects unknown provider configuration without reflecting its value", () => {
    assert.throws(() => selectProvider({ ...mistralOnly, LLM_PROVIDER: "fictional-sensitive-input" }), (error: Error) => {
      assert.equal(error.message.includes("fictional-sensitive-input"), false);
      return true;
    });
    assert.throws(() => selectProvider({ ...gemini, LLM_PROVIDER: "gemini-flash-lite", LLM_MODEL: "gemma-4-26b-a4b-it" }));
  });

  it("the default provider sends the matching native schema for proposal, recipe and adaptive requests", async () => {
    const proposal = { dishName: "Rice", description: "Plain rice.", estimatedCookingMinutes: 15, servings: 1, assumedStaples: ["salt", "water"], optionalAdditions: [], shoppingAdditions: [] };
    const recipe = { id: "rice", title: "Rice", servings: 1, ingredients: [{ id: "rice", name: "Rice", quantity: 80, unit: "g" }, { id: "salt", name: "Salt", quantity: null, unit: null }],
      steps: [{ id: "cook", headline: "Cook the rice", instruction: "Simmer 80 g rice with a pinch of salt.", ingredientIds: ["rice", "salt"] },
        { id: "rest", headline: "Rest the rice", instruction: "Rest covered for 5 minutes.", ingredientIds: ["rice"] }] };
    const outputs = [proposal, recipe, { type: "cooking_problem", message: "Lower the heat.", stepUpdates: [], additionalIngredients: [], ingredientAvailability: [] }];
    const formats: { type: string; json_schema: { name: string; schema: unknown; strict: boolean } }[] = [];
    const request: typeof fetch = async (url, options) => {
      assert.equal(String(url), "https://api.mistral.ai/v1/chat/completions");
      assert.equal(new Headers(options?.headers).get("authorization"), "Bearer fictional-mistral-key");
      formats.push(JSON.parse(String(options?.body)).response_format);
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(outputs.shift()) } }] }));
    };
    const agent = new CookingAgent(selectProvider(mistralOnly, request).provider);
    await agent.proposeDish("I have rice.");
    await agent.acceptProposal();
    await agent.adaptCooking("It's bubbling over.");
    assert.deepEqual(formats, [responseContracts.proposal, responseContracts.recipe, responseContracts.adaptive]
      .map(({ name, schema }) => ({ type: "json_schema", json_schema: { name, schema, strict: true } })));
  });
});
