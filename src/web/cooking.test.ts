import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { it } from "node:test";
import { NextRequest } from "next/server";
import type { LLMProvider } from "../application/llm-provider";
import { WebCookingService } from "./cooking-service";
import { cookingHandlers } from "./http";
import type { CookingReply } from "./contracts";

const proposal = { dishName: "Tomato Pasta", description: "A simple tomato sauce.", estimatedCookingMinutes: 20, servings: 2,
  assumedStaples: ["salt"], optionalAdditions: ["basil"], shoppingAdditions: [] };
const recipe = { id: "pasta", title: proposal.dishName, servings: 2,
  ingredients: [{ id: "pasta", name: "Pasta", quantity: 200, unit: "g" }, { id: "paste", name: "Tomato paste", quantity: 30, unit: "g" }],
  steps: [{ id: "boil", headline: "Boil the pasta", instruction: "Boil the pasta.", ingredientIds: ["pasta"] }, { id: "sauce", headline: "Add the paste", instruction: "Add the paste.", ingredientIds: ["paste"] }] };
class Provider implements LLMProvider {
  prompts: string[] = [];
  constructor(private outputs: (unknown | Error)[]) {}
  async generate(prompt: string) {
    this.prompts.push(prompt);
    const output = this.outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("Unexpected inference call");
    return typeof output === "string" ? output : JSON.stringify(output);
  }
}
function browser(service: WebCookingService) {
  const handlers = cookingHandlers(service);
  let cookie = "";
  return {
    async send(input?: unknown, origin = "http://localhost:3000") {
      const request = new NextRequest("http://localhost:3000/api/cooking", {
        method: input === undefined ? "GET" : "POST",
        headers: { cookie, origin, "Content-Type": "application/json" },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
      const response = input === undefined ? handlers.GET(request) : await handlers.POST(request);
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0]!;
      return { response, body: await response.json() as CookingReply, cookie };
    },
  };
}

it("refreshes speech handlers across reloads while retaining the current tomato step and guards", async (t) => {
  const tomatoRecipe = { id: "tomatoes", title: proposal.dishName, servings: 2,
    ingredients: [{ id: "tomatoes", name: "pomidory", quantity: 400, unit: "g" }],
    steps: [{ id: "sauce", headline: "Dodaj pomidory", instruction: "Dodaj pomidory do czosnku i duś przez kilka minut.", ingredientIds: ["tomatoes"] }] };
  const provider = new Provider([proposal, tomatoRecipe]);
  const retained = new WebCookingService(() => provider);
  const flow = await retained.execute(undefined, { action: "propose", ingredients: "pomidory", language: "pl" });
  await retained.execute(flow.id, { action: "accept" });
  const before = retained.read(flow.id);
  t.mock.method(retained, "execute", async () => { throw new Error("Obsolete handlers must not be reused"); });
  const refreshed = new WebCookingService(() => { throw new Error("A current-step query needs no provider"); }, retained);
  for (const message of ["co teraz?", "powtórz"]) {
    const response = await refreshed.execute(flow.id, { action: "adapt", message, expectedRevision: before.body.revision, requestId: message === "powtórz" ? "repeat" : "current" });
    assert.equal(response.status, 200);
    assert.match(response.body.speech!.text, /400 gramów/);
    assert.equal(refreshed.speech(flow.id, response.body.speech!.id, response.body.revision!), response.body.speech!.text);
    assert.deepEqual(response.body.state, before.body.state);
    assert.equal(response.body.revision, before.body.revision);
  }
  assert.equal(provider.prompts.length, 2);
  assert.equal((await refreshed.execute(flow.id, { action: "current", requestId: "repeat" })).status, 409);
  assert.equal((await refreshed.execute(flow.id, { action: "current", expectedRevision: "stale" })).status, 409);
  await refreshed.execute(flow.id, { action: "reset" });
  assert.equal(retained.read(flow.id).status, 410);
});

it("completes the web flow with existing agent adaptation, authoritative snapshots and private cookies", async () => {
  const provider = new Provider([proposal, recipe, { type: "ingredient_change", message: "Skip the paste and simmer the sauce.", originalIngredientId: "paste", replacement: null, reason: "Unavailable.", additionalIngredients: [], stepUpdates: [{ id: "sauce", headline: "Simmer the sauce", instruction: "Simmer the sauce.", ingredientIds: [] }] }]);
  const ui = browser(new WebCookingService(() => provider));
  assert.equal((await ui.send()).body.state?.progress, null);
  const proposed = await ui.send({ action: "propose", ingredients: "pasta and tomato paste" });
  assert.deepEqual(proposed.body.state?.proposal, proposal);
  assert.match(proposed.response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(proposed.response.headers.get("set-cookie")!, /SameSite=strict/);
  assert.equal(proposed.response.headers.get("cache-control"), "no-store");
  assert.equal(proposed.body.state?.progress, null);
  assert.match(provider.prompts[0]!, /pasta and tomato paste/);
  const started = await ui.send({ action: "accept" });
  assert.equal(started.body.state?.progress?.currentStep?.id, "boil");
  assert.equal(started.body.state?.progress?.session.status, "cooking");
  assert.deepEqual((await ui.send({ action: "current" })).body, started.body);
  const advanced = await ui.send({ action: "complete", expectedStepId: "boil" });
  assert.equal(advanced.body.state?.progress?.currentStep?.id, "sauce");
  const stale = await ui.send({ action: "complete", expectedStepId: "boil" });
  assert.equal(stale.response.status, 409);
  assert.deepEqual(stale.body.state, advanced.body.state);
  const adapted = await ui.send({ action: "adapt", message: "I don't have tomato paste" });
  assert.equal(adapted.body.state?.progress?.currentStep?.instruction, "Simmer the sauce.");
  assert.equal(adapted.body.state?.response?.kind, "changed");
  assert.match(provider.prompts[2]!, /I don't have tomato paste/);
  assert.deepEqual(adapted.body.state?.progress?.session.completedStepIds, ["boil"]);
  assert.equal((await ui.send()).body.state?.progress?.currentStep?.instruction, "Simmer the sauce.");
  const finished = await ui.send({ action: "complete", expectedStepId: "sauce" });
  assert.equal(finished.body.state?.progress?.session.status, "completed");
  assert.equal(finished.body.state?.progress?.currentStep, null);
  assert.equal(provider.prompts.length, 3); // current/complete never invoke inference
  assert.equal((await ui.send({ action: "adapt", message: "Too thick" })).response.status, 409);
  assert.deepEqual((await ui.send({ action: "reset" })).body.state, { proposal: null, progress: null, response: null });
  assert.equal((await ui.send()).body.state?.progress, null);
});

it("retains proposal and session across malformed/failed requests; sanitized errors permit retry", async () => {
  const provider = new Provider(["not json", proposal, new Error("fictional-key model=private provider=config"), recipe, { type: "unknown", message: "No" }]);
  const ui = browser(new WebCookingService(() => provider));
  const failedProposal = await ui.send({ action: "propose", ingredients: "pasta" });
  assert.equal(failedProposal.response.status, 502);
  assert.equal(failedProposal.body.state?.proposal, null);
  await ui.send({ action: "propose", ingredients: "pasta" });
  const failedRecipe = await ui.send({ action: "accept" });
  assert.equal(failedRecipe.response.status, 502);
  assert.deepEqual(failedRecipe.body.state?.proposal, proposal);
  assert.doesNotMatch(JSON.stringify(failedRecipe.body), /fictional-key|private|provider=config/);
  const started = await ui.send({ action: "accept" });
  const failedAdaptation = await ui.send({ action: "adapt", message: "Change something" });
  assert.equal(failedAdaptation.response.status, 502);
  assert.deepEqual(failedAdaptation.body.state, started.body.state);
  for (const bad of [{ action: "complete" }, { action: "adapt", message: "" }, { action: "propose", ingredients: "pasta", provider: "gemma" }, { action: "replace_session", session: {} }]) {
    assert.equal((await ui.send(bad)).response.status, 400);
    assert.deepEqual((await ui.send()).body.state, started.body.state);
  }
});

it("keeps clarification context in the retained agent across HTTP requests", async () => {
  const provider = new Provider([proposal, recipe, { type: "clarification", message: "How thick is it?" }, { type: "cooking_problem", message: "Add a splash of water.", additionalIngredients: [], stepUpdates: [] }]);
  const ui = browser(new WebCookingService(() => provider));
  await ui.send({ action: "propose", ingredients: "pasta" });
  await ui.send({ action: "accept" });
  const question = await ui.send({ action: "adapt", message: "The sauce is too thick" });
  assert.equal(question.body.state?.response?.kind, "clarification");
  const advice = await ui.send({ action: "adapt", message: "It hardly moves" });
  assert.equal(advice.body.state?.response?.kind, "advice");
  assert.match(provider.prompts[3]!, /"previousClarification":\{"userMessage":"The sauce is too thick","question":"How thick is it\?"\}/);
});

it("reports expired sessions after process loss and isolates separate browsers", async () => {
  const service = new WebCookingService(() => new Provider([proposal, recipe]));
  const one = browser(service);
  const two = browser(service);
  const created = await one.send({ action: "propose", ingredients: "pasta" });
  assert.equal((await two.send()).body.state?.proposal, null);
  await two.send({ action: "propose", ingredients: "pasta" });
  await one.send({ action: "accept" });
  assert.deepEqual((await two.send()).body.state?.proposal, proposal);
  const restarted = cookingHandlers(new WebCookingService(() => new Provider([])));
  const request = new NextRequest("http://localhost:3000/api/cooking", { headers: { cookie: created.cookie } });
  const missing = restarted.GET(request);
  assert.equal(missing.status, 410);
  assert.equal((await missing.json()).error.code, "missing");
  assert.equal((await restarted.POST(new NextRequest(request.url, { method: "POST", headers: { cookie: created.cookie }, body: JSON.stringify({ action: "reset" }) }))).status, 200);
});

it("rejects overlapping acceptance, progress and reset requests without discarding an in-flight flow", async () => {
  let finish!: (text: string) => void;
  let calls = 0;
  const provider = { generate: async () => ++calls === 1 ? JSON.stringify(proposal) : new Promise<string>((resolve) => { finish = resolve; }) };
  const service = new WebCookingService(() => provider);
  const proposed = await service.execute(undefined, { action: "propose", ingredients: "pasta" });
  const flowId = proposed.id!;
  const pending = service.execute(flowId, { action: "accept" });
  assert.equal(service.read(flowId).status, 200);
  for (const action of ["reset", "accept", "current"]) assert.equal((await service.execute(flowId, { action })).status, 409);
  finish(JSON.stringify(recipe));
  const result = await pending;
  assert.equal(result.status, 200);
  assert.equal(service.read(flowId).body.state?.progress?.currentStep?.id, "boil");
});

it("rejects malformed JSON and cross-origin mutation at the HTTP boundary", async () => {
  const handlers = cookingHandlers(new WebCookingService(() => new Provider([])));
  const malformed = await handlers.POST(new NextRequest("http://localhost:3000/api/cooking", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const boundAddress = await handlers.POST(new NextRequest("http://0.0.0.0:3000/api/cooking", {
    method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000" }, body: JSON.stringify({ action: "reset" }),
  }));
  assert.equal(boundAddress.status, 200);
  const ui = browser(new WebCookingService(() => new Provider([])));
  assert.equal((await ui.send({ action: "propose", ingredients: "pasta" }, "https://elsewhere.example")).response.status, 403);
});

it("client runtime imports contain no providers, server services or credential references", () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /MISTRAL_API_KEY|GEMINI_API_KEY|GEMMA_MODEL|LLM_PROVIDER|LLM_MODEL|ELEVENLABS_API_KEY|ELEVENLABS_VOICE_ID|process\.env|selectProvider|api\.mistral\.ai/);
    for (const match of source.matchAll(/import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/g)) {
      const path = match[1]!;
      if (!path.startsWith(".")) continue;
      assert.doesNotMatch(path, /infrastructure|application|web\/server|cooking-service/);
      const resolved = resolve(dirname(file), path);
      visit(existsSync(`${resolved}.ts`) ? `${resolved}.ts` : `${resolved}.tsx`);
    }
  }
  visit(resolve("src/app/cooking-screen.tsx"));
  assert.match(readFileSync("src/web/server.ts", "utf8"), /import "server-only"/);
});

it("returns one canonical 3-carrot ingredient after completed preparation and carries quantity history to the next adaptive request", async () => {
  const carrotRecipe = { id: "carrot-pasta", title: proposal.dishName, servings: 2,
    ingredients: [{ id: "carrot", name: "carrot", quantity: 1, unit: "piece" }],
    steps: [{ id: "prep", headline: "Dice 1 carrot", instruction: "Dice 1 carrot.", ingredientIds: ["carrot"] },
      { id: "pan", headline: "Add 1 diced carrot", instruction: "Add 1 diced carrot.", ingredientIds: ["carrot"] },
      { id: "serve", headline: "Serve the carrot pasta", instruction: "Serve the carrot pasta.", ingredientIds: ["carrot"] }] };
  const provider = new Provider([proposal, carrotRecipe, { type: "ingredient_change", message: "Use 3 carrots in total.",
    originalIngredientId: "carrot", replacement: { id: "three-carrots", name: "carrot", quantity: 3, unit: "piece" },
    reason: "Requested total.", additionalIngredients: [], stepUpdates: [
      { id: "pan", headline: "Dice the extra carrots", instruction: "Dice 2 more carrots and add all 3 carrots.", ingredientIds: ["three-carrots"] },
      { id: "serve", headline: "Serve the pasta", instruction: "Serve the pasta with all 3 carrots.", ingredientIds: ["three-carrots"] },
    ] }, { type: "cooking_problem", message: "Use 3 carrots total, including the one already prepared.", additionalIngredients: [], stepUpdates: [] }]);
  const ui = browser(new WebCookingService(() => provider));
  await ui.send({ action: "propose", ingredients: "pasta and 1 carrot" });
  await ui.send({ action: "accept" });
  await ui.send({ action: "complete", expectedStepId: "prep" });
  const adapted = await ui.send({ action: "adapt", message: "Use 3 carrots instead of 1" });
  assert.equal(adapted.response.status, 200);
  assert.deepEqual(adapted.body.state?.progress?.session.recipe.ingredients, [{ id: "carrot", name: "carrot", quantity: 3, unit: "piece" }]);
  assert.equal(adapted.body.state?.progress?.session.recipe.steps[0]!.instruction, "Dice 1 carrot.");
  assert.deepEqual(adapted.body.state?.progress?.currentStep?.ingredientIds, ["carrot"]);
  assert.deepEqual((await ui.send()).body.state, adapted.body.state);
  await ui.send({ action: "adapt", message: "How many carrots now?" });
  const context = JSON.parse(provider.prompts[3]!.split("Context: ")[1]!);
  assert.deepEqual(context.ingredients, [{ id: "carrot", name: "carrot", quantity: 3, unit: "piece" }]);
  assert.equal(context.quantityChanges[0].previousIngredient.quantity, 1);
  assert.deepEqual(context.quantityChanges[0].completedStepIds, ["prep"]);
  assert.deepEqual(context.completedSteps, [carrotRecipe.steps[0]]);
  assert.match(provider.prompts[2]!, /replacement.id BOTH set to the existing canonical ID/);
});
