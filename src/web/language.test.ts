import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import CookingScreen from "../app/cooking-screen";
import { WebCookingService } from "./cooking-service";
import { cookingInput } from "./cooking-input";
import { voiceHandlers } from "./voice-http";
import { transcribeRecording, VoiceTurn } from "./voice-client";
import { ElevenLabsProvider } from "../infrastructure/elevenlabs-provider";
import { copy, servings, stepsCompleted } from "./i18n";
import { formatIngredient } from "./ingredient-format";
import type { Language } from "../shared/language";

const proposal = { dishName: "Marchew na patelni", description: "Prosta marchew z odrobiną oliwy.", estimatedCookingMinutes: 10, servings: 1 };
const recipe = { id: "carrot-pan", title: proposal.dishName, servings: 1,
  ingredients: [{ id: "carrot", name: "marchew", quantity: 1, unit: "piece" }],
  steps: [{ id: "cut", instruction: "Pokrój marchew.", ingredientIds: ["carrot"] }, { id: "fry", instruction: "Usmaż marchew i podaj.", ingredientIds: ["carrot"] }] };
function fixture(outputs: unknown[] = [proposal, recipe]) {
  const prompts: string[] = [];
  const service = new WebCookingService(() => ({ async generate(prompt) { prompts.push(prompt); return JSON.stringify(outputs.shift()); } }));
  return { service, prompts };
}
async function start(service: WebCookingService, language: Language = "pl") {
  const proposed = await service.execute(undefined, { action: "propose", ingredients: "marchew dla jednej osoby", language });
  assert.equal(proposed.status, 200);
  return service.execute(proposed.id, { action: "accept" });
}

it("English remains the default rendered UI and Polish renders the translated entry and header control", () => {
  const english = renderToStaticMarkup(createElement(CookingScreen));
  assert.match(english, /lang="en"/);
  assert.match(english, /WHAT DO<br\/>YOU HAVE\?/);
  assert.match(english, /Opening the kitchen/);
  assert.equal(copy.en.findDish, "Find something to cook");
  assert.match(english, /Pasta, tomatoes, garlic, parmesan/);
  const polish = renderToStaticMarkup(createElement(CookingScreen, { initialLanguage: "pl" }));
  assert.match(polish, /lang="pl"/);
  assert.match(polish, /CO MASZ<br\/>W KUCHNI\?/);
  assert.match(polish, /Otwieram kuchnię/);
  assert.equal(copy.pl.findDish, "Znajdź pomysł na danie");
  assert.match(polish, /Makaron, pomidory, czosnek, parmezan/);
  assert.match(polish, /Etapy gotowania/);
  assert.match(polish, /aria-label="Polski" aria-pressed="true"/);
  assert.doesNotMatch(polish, /Find something|ONE THING|Your kitchen|Opening the kitchen/);
  assert.equal(copy.pl.question, "KRÓTKIE PYTANIE");
  assert.equal(copy.pl.speaking, "MÓWIĘ");
  assert.equal(copy.pl.mealComplete, "Wszystkie kroki są gotowe. Smacznego!");
});

it("Polish proposal, recipe and clarification follow-up request Polish output in the same agent context", async () => {
  const clarification = { type: "clarification", message: "Czy chcesz użyć trzech marchewek?" };
  const changed = { type: "ingredient_change", message: "Użyj trzech marchewek.", originalIngredientId: "carrot", replacement: { ...recipe.ingredients[0], quantity: 3 }, reason: "Większa porcja.", stepUpdates: [
    { ...recipe.steps[0], instruction: "Pokrój trzy marchewki." }, { ...recipe.steps[1], instruction: "Usmaż trzy marchewki i podaj." },
  ], additionalIngredients: [] };
  const { service, prompts } = fixture([proposal, recipe, clarification, changed]);
  const started = await start(service);
  assert.equal(started.body.language, "pl");
  assert.equal(service.read(started.id).body.language, "pl");
  const question = await service.execute(started.id, { action: "adapt", message: "Mam trzy marchewki." });
  assert.deepEqual(question.body.state?.progress?.session, started.body.state?.progress?.session);
  assert.equal(question.body.state?.response?.kind, "clarification");
  const answer = await service.execute(started.id, { action: "adapt", message: "Tak." });
  assert.equal(answer.body.state?.response?.message, "Użyj trzech marchewek.");
  assert.equal(answer.body.state?.progress?.session.recipe.ingredients[0]?.quantity, 3);
  assert.equal(answer.body.state?.progress?.session.recipe.ingredients[0]?.id, "carrot");
  assert.equal(answer.body.state?.progress?.session.quantityChanges.length, 1);
  assert.equal(answer.body.state?.progress?.session.substitutions.length, 0);
  for (const prompt of prompts) {
    assert.match(prompt, /Selected output language: Polish \(pl\)/);
    assert.match(prompt, /ALL human-readable output in natural Polish/);
    assert.equal(JSON.parse(prompt.split("Context: ")[1]!).language, "pl");
  }
  assert.match(prompts[3]!, /previousClarification.*Czy chcesz użyć trzech marchewek/);
  assert.match(prompts[3]!, /"userMessage":"Tak\."/);
  // Deterministic Polish commands use the same guarded domain operations without inference.
  const repeat = await service.execute(started.id, { action: "adapt", message: "Powtórz." });
  assert.deepEqual(repeat.body.state?.progress, answer.body.state?.progress);
  await service.execute(started.id, { action: "adapt", message: "Gotowe!", requestId: "first-done", expectedRevision: answer.body.revision });
  const finished = await service.execute(started.id, { action: "adapt", message: "Gotowe!", requestId: "second-done" });
  assert.equal(finished.body.state?.progress?.session.status, "completed");
  assert.equal(finished.body.speech?.text, copy.pl.mealComplete);
  assert.equal(prompts.length, 4);
});

it("language is immutable session context; invalid changes and stale commands cannot bypass domain guards", async () => {
  const { service, prompts } = fixture();
  const started = await start(service);
  for (const input of [{ action: "current", language: "en" }, { action: "propose", ingredients: "carrot", language: "en" }, { action: "complete", expectedStepId: "fry" }, { action: "complete", expectedStepId: "cut", expectedRevision: "stale" }]) {
    const rejected = await service.execute(started.id, input);
    assert.ok(rejected.status >= 400);
    assert.deepEqual(rejected.body.state?.progress, started.body.state?.progress);
    assert.equal(service.read(started.id).body.language, "pl");
    assert.doesNotMatch(rejected.body.error!.message, /That |Sous is/);
  }
  assert.equal(prompts.length, 2);
  assert.deepEqual(cookingInput("tak", started.body.state!, "pl"), { action: "adapt", message: "tak" });
  assert.deepEqual(cookingInput("done", started.body.state!, "en"), cookingInput("gotowe", started.body.state!, "pl"));
  const reset = await service.execute(started.id, { action: "reset" });
  assert.equal(reset.body.language, undefined);
  assert.equal(service.read().body.language, undefined); // Public default belongs to the UI.
  const english = fixture();
  const proposed = await english.service.execute(undefined, { action: "propose", ingredients: "carrot" });
  assert.equal(proposed.body.language, "en");
  assert.match(english.prompts[0]!, /Selected output language: English \(en\)/);
  assert.equal((await service.execute(undefined, { action: "propose", ingredients: "carrot", language: "de" })).status, 400);
});

it("Polish ingredient and count formatting changes presentation without mutating recipe data", () => {
  const ingredient = { ...recipe.ingredients[0]!, quantity: 3 };
  const before = structuredClone(ingredient);
  assert.equal(formatIngredient(ingredient, "pl"), "3 marchewki");
  assert.equal(formatIngredient({ ...ingredient, quantity: 5 }, "pl"), "5 marchewek");
  assert.equal(formatIngredient({ id: "oil", name: "oliwa", quantity: 1.5, unit: "tbsp" }, "pl"), "oliwa — 1,5 łyżki");
  assert.equal(servings(1, "pl"), "1 porcja");
  assert.equal(servings(2, "pl"), "2 porcje");
  assert.equal(servings(5, "pl"), "5 porcji");
  assert.equal(stepsCompleted(3, "pl"), "3 kroki ukończone");
  assert.deepEqual(ingredient, before);
});

it("STT explicitly selects English or Polish on the shared single-use-token endpoint", async (t) => {
  const codes: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.match(String(url), /\/v1\/speech-to-text\?token=/);
    const form = init!.body as FormData;
    codes.push(form.get("language_code"));
    assert.equal(form.get("model_id"), "scribe_v2");
    assert.equal((init!.headers as Record<string, string> | undefined)?.["xi-api-key"], undefined);
    return Response.json({ text: "Gotowe." });
  });
  const signal = new AbortController().signal;
  const blob = new Blob(["audio"], { type: "audio/webm" });
  await transcribeRecording(blob, "single-use", signal);
  await transcribeRecording(blob, "single-use", signal, "pl");
  assert.deepEqual(codes, ["eng", "pol"]);
});

it("TTS uses Flash's supported Polish language code and trusts the session, not browser language", async () => {
  const { service } = fixture();
  const started = await start(service);
  const spoken = await service.execute(started.id, { action: "current", requestId: "polish-speech" });
  const calls: unknown[] = [];
  const adapter = new ElevenLabsProvider("fictional-server-key", "voice-id", async (_url, init) => {
    calls.push(JSON.parse(init!.body as string));
    return new Response("audio", { headers: { "Content-Type": "audio/mpeg" } });
  });
  const response = await voiceHandlers(service, () => adapter).speech(new NextRequest("http://localhost/api/voice/speech", {
    method: "POST", headers: { cookie: `sous-session=${started.id}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: spoken.body.speech!.id, revision: spoken.body.revision, language: "en" }),
  }));
  assert.equal(response.status, 200);
  await response.text();
  assert.deepEqual(calls, [{ text: "Pokrój marchew.", model_id: "eleven_flash_v2_5", language_code: "pl" }]);
});

it("Polish voice failures remain Polish while preserving the same cancellation state machine", async () => {
  const states: string[] = [];
  const voice = new VoiceTurn({ language: "pl", record: async () => { throw new Error("private"); }, token: async () => "token",
    transcribe: async () => "", submit: async () => null, play: async () => {}, transcript() {}, state(value, error) { states.push(value); if (error) states.push(error); } });
  voice.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(states, ["listening", "error", copy.pl.microphoneUnavailable]);
  voice.cancel();
  assert.equal(states.at(-1), "idle");
});

it("Polish cooking advice stays Polish without altering structured state", async () => {
  const { service, prompts } = fixture([proposal, recipe, { type: "cooking_problem", message: "Zmniejsz ogień i delikatnie mieszaj.", stepUpdates: [], additionalIngredients: [] }]);
  const started = await start(service);
  const advised = await service.execute(started.id, { action: "adapt", message: "Marchew się przypala." });
  assert.equal(advised.body.state?.response?.kind, "advice");
  assert.equal(advised.body.state?.response?.message, "Zmniejsz ogień i delikatnie mieszaj.");
  assert.deepEqual(advised.body.state?.progress, started.body.state?.progress);
  assert.match(prompts[2]!, /ALL human-readable output in natural Polish/);
});

it("expired sessions expose a localizable error key without forcing Polish clients to English", async () => {
  const { service } = fixture();
  const reply = service.read("expired").body;
  assert.equal(reply.language, undefined);
  assert.equal(reply.error?.key, "missing");
  assert.equal(copy.pl[reply.error!.key!], "Ta sesja gotowania nie jest już dostępna. Zacznij od nowa i podaj składniki.");
});
