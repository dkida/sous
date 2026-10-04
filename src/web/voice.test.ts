import assert from "node:assert/strict";
import { it } from "node:test";
import { NextRequest } from "next/server";
import { WebCookingService } from "./cooking-service";
import { VoiceTurn, transcribeRecording, type VoicePorts, type VoiceState } from "./voice-client";
import { voiceHandlers } from "./voice-http";
import { cookingHandlers } from "./http";
import type { CookingReply } from "./contracts";
import type { Recipe } from "../domain/types";
import type { Language } from "../shared/language";

const proposal = { dishName: "Pasta", description: "Tomato pasta", estimatedCookingMinutes: 20, servings: 2 };
const recipe = { id: "pasta", title: "Pasta", servings: 2,
  ingredients: [{ id: "pasta", name: "Pasta", quantity: 200, unit: "g" }, { id: "paste", name: "Tomato paste", quantity: 30, unit: "g" }],
  steps: [{ id: "prep", headline: "Prepare the paste", instruction: "Prepare the paste.", ingredientIds: ["paste"] }, { id: "cook", headline: "Add the paste", instruction: "Add the paste.", ingredientIds: ["paste"] }] };
const omission = { type: "ingredient_change", message: "Skip the paste.", originalIngredientId: "paste", replacement: null, reason: "Unavailable", additionalIngredients: [],
  stepUpdates: [{ id: "prep", headline: "Prepare the pan", instruction: "Prepare the pan.", ingredientIds: [] }, { id: "cook", headline: "Simmer the sauce", instruction: "Simmer the sauce.", ingredientIds: [] }] };
async function kitchen(outputs: unknown[] = [], plan: Recipe = recipe, language: Language = "en") {
  const prompts: string[] = [];
  const queue = [proposal, plan, ...outputs];
  const service = new WebCookingService(() => ({ async generate(prompt) { prompts.push(prompt); const next = queue.shift(); if (!next) throw new Error("Unexpected inference"); return JSON.stringify(next); } }));
  const flow = await service.execute(undefined, { action: "propose", ingredients: "pasta and tomato paste", language });
  await service.execute(flow.id, { action: "accept" });
  return { service, id: flow.id!, prompts };
}

for (const language of ["pl", "en"] as const) {
  for (const embedded of [true, false]) {
    it(`speaks the next ${language} tomato instruction after adaptive completion (${embedded ? "embedded" : "structured"} quantity)`, async () => {
      const message = language === "pl" ? "Dodałem cebulę i czosnek." : "I have added the onion and garlic.";
      const acknowledgement = language === "pl" ? "Krok z dodaniem cebuli i czosnku został ukończony. Przechodzimy do pomidorów." : "The onion and garlic step is complete. Let's move on to the tomatoes.";
      const instruction = language === "pl"
        ? `Wrzuć na patelnię ${embedded ? "250 g pomidorów koktajlowych" : "pomidory koktajlowe"} i smaż wszystko razem przez około 4 minuty, od czasu do czasu mieszając, aż pomidory zaczną pękać i puszczać sok.`
        : `Add ${embedded ? "250 g cherry tomatoes" : "the cherry tomatoes"} to the pan and fry together for about 4 minutes, stirring occasionally until the tomatoes burst and release their juices.`;
      const plan: Recipe = { id: "pasta", title: proposal.dishName, servings: 2,
        ingredients: [{ id: "onion", name: "onion", quantity: 1, unit: "piece" }, { id: "garlic", name: "garlic", quantity: 2, unit: "cloves" },
          { id: "tomatoes", name: language === "pl" ? "pomidory koktajlowe" : "cherry tomatoes", quantity: 250, unit: "g" }],
        steps: [{ id: "prep", headline: "Add onion and garlic", instruction: "Add the onion and garlic to the pan.", ingredientIds: ["onion", "garlic"] },
          { id: "cook", headline: language === "pl" ? "Dodaj pomidory" : "Add the tomatoes", instruction, ingredientIds: ["tomatoes"] }] };
      const action = { type: "reconcile_progress", message: acknowledgement, completedSteps: [{ stepId: "prep", evidence: message }] };
      const context = await kitchen([action], plan, language);
      const turn = harness(context.service, context.id, message, { language });
      turn.turn.start(); await turn.turn.finish();
      assert.equal(turn.states.at(-1), "idle");
      assert.equal(turn.spoken.length, 1);
      assert.ok(turn.spoken[0]!.startsWith(acknowledgement));
      assert.ok(turn.spoken[0]!.includes(instruction));
      assert.equal(turn.spoken[0]!.match(/250/g)?.length, 1);
      if (!embedded) assert.match(turn.spoken[0]!, language === "pl" ? /250 gramów/ : /250 grams/);
      assert.equal(context.service.read(context.id).body.state?.progress?.currentStep?.id, "cook");
      assert.deepEqual(context.service.read(context.id).body.state?.progress?.session.completedStepIds, ["prep"]);
      const repeated = harness(context.service, context.id, language === "pl" ? "powtórz" : "repeat", { language });
      repeated.turn.start(); await repeated.turn.finish();
      assert.ok(repeated.spoken[0]!.startsWith(instruction));
      assert.equal(repeated.spoken[0]!.match(/250/g)?.length, 1);
      assert.equal(context.prompts.length, 3); // Reconciliation reasons once; repeat bypasses inference.
    });
  }
}

it("adaptive completion of the final step speaks completion without rereading a finished step", async () => {
  const message = "I prepared the paste and added it.";
  const acknowledgement = "The paste is prepared and added.";
  const context = await kitchen([{ type: "reconcile_progress", message: acknowledgement,
    completedSteps: [{ stepId: "prep", evidence: message }, { stepId: "cook", evidence: message }] }]);
  const voice = harness(context.service, context.id, message);
  voice.turn.start(); await voice.turn.finish();
  assert.deepEqual(voice.spoken, [`${acknowledgement} All steps are complete. Enjoy your meal!`]);
  assert.equal(context.service.read(context.id).body.state?.progress?.session.status, "completed");
});
function request(id: string, body?: unknown, origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/voice", { method: "POST", headers: { cookie: `sous-session=${id}`, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function harness(service: WebCookingService, id: string, transcript: string, overrides: Partial<VoicePorts> = {}) {
  const states: VoiceState[] = [];
  const spoken: string[] = [];
  const metrics: Record<string, number | string>[] = [];
  let submitted = 0;
  let cancelled = 0;
  const revision = service.read(id).body.revision;
  const http = cookingHandlers(service);
  const voiceHttp = voiceHandlers(service, () => ({ async batchToken() { return "temporary"; }, async synthesize(text) { spoken.push(text); return new Response("mock-mp3", { headers: { "Content-Type": "audio/mpeg" } }); } }));
  const ports: VoicePorts = {
    async record() { return { async finish() { return new Blob(["mock recording"]); }, cancel() { cancelled++; } }; },
    async token() { return "temporary"; },
    async transcribe() { return transcript; },
    async submit(text) {
      submitted++;
      const response = await http.POST(request(id, { action: "adapt", message: text, expectedRevision: revision, requestId: crypto.randomUUID() }));
      return await response.json() as CookingReply;
    },
    async play(reply, _signal, ready) {
      const response = await voiceHttp.speech(request(id, { id: reply.speech?.id, revision: reply.revision }));
      if (!response.ok) throw new Error("Speech unavailable");
      await response.text(); ready();
    },
    state(value) { states.push(value); }, transcript() {}, timing(value) { metrics.push(value); }, ...overrides,
  };
  return { turn: new VoiceTurn(ports), ports, states, spoken, metrics, get submitted() { return submitted; }, get cancelled() { return cancelled; } };
}

it("routes STT through the typed HTTP/application path, performs the same adaptation and synthesizes the authoritative response", async () => {
  const typed = await kitchen([omission]);
  const spoken = await kitchen([omission]);
  const expected = await typed.service.execute(typed.id, { action: "adapt", message: "I don't have tomato paste" });
  const voice = harness(spoken.service, spoken.id, "I don't have tomato paste");
  voice.turn.start(); await voice.turn.finish();
  assert.deepEqual(voice.states, ["listening", "transcribing", "thinking", "speaking", "idle"]);
  assert.equal(voice.submitted, 1);
  assert.equal(spoken.service.read(spoken.id).body.state?.progress?.currentStep?.instruction, expected.body.state?.progress?.currentStep?.instruction);
  assert.deepEqual(spoken.service.read(spoken.id).body.state?.progress?.session.recipe, expected.body.state?.progress?.session.recipe);
  assert.match(spoken.prompts[2]!, /I don't have tomato paste/);
  assert.deepEqual(voice.spoken, ["Skip the paste."]);
  assert.ok(voice.cancelled > 0);
  for (const name of ["captureMs", "sttMs", "agentMs", "ttsPlayableMs", "totalToAudioMs", "totalMs"]) assert.equal(typeof voice.metrics[0]?.[name], "number");
  assert.doesNotMatch(JSON.stringify(voice.metrics), /paste|temporary|mock recording/);
});

it("retains clarification context when voice says yes, with no voice-specific intent handling", async () => {
  const context = await kitchen([{ type: "clarification", message: "Would you like to skip it?" }, omission]);
  await context.service.execute(context.id, { action: "adapt", message: "I don't have tomato paste" });
  const voice = harness(context.service, context.id, "yes");
  voice.turn.start(); await voice.turn.finish();
  assert.match(context.prompts[3]!, /previousClarification/);
  assert.match(context.prompts[3]!, /Would you like to skip it/);
  assert.equal(context.service.read(context.id).body.state?.response?.kind, "changed");
  assert.deepEqual(voice.spoken, ["Skip the paste."]);
});

it("speaks a clarification question without changing the cooking session", async () => {
  const context = await kitchen([{ type: "clarification", message: "How much paste do you have?" }]);
  const before = context.service.read(context.id).body.state?.progress;
  const voice = harness(context.service, context.id, "I have more paste");
  voice.turn.start(); await voice.turn.finish();
  assert.deepEqual(context.service.read(context.id).body.state?.progress, before);
  assert.deepEqual(voice.spoken, ["How much paste do you have?"]);
});

it("STT failure and empty transcript leave cooking state unchanged and allow typed fallback", async () => {
  for (const transcribe of [async () => { throw new Error("provider-secret"); }, async () => ""]) {
    const context = await kitchen([omission]);
    const before = context.service.read(context.id).body.state;
    const voice = harness(context.service, context.id, "", { transcribe });
    voice.turn.start(); await voice.turn.finish();
    assert.equal(voice.states.at(-1), "error"); assert.equal(voice.submitted, 0);
    assert.deepEqual(context.service.read(context.id).body.state, before);
    assert.equal((await context.service.execute(context.id, { action: "adapt", message: "I don't have tomato paste" })).status, 200);
  }
});

it("TTS failure keeps a successfully changed cooking state and permits another typed action", async () => {
  const context = await kitchen([omission]);
  const voice = harness(context.service, context.id, "I don't have tomato paste", { async play() { throw new Error("private diagnostics"); } });
  voice.turn.start(); await voice.turn.finish();
  assert.equal(voice.states.at(-1), "error");
  assert.equal(context.service.read(context.id).body.state?.progress?.currentStep?.instruction, "Prepare the pan.");
  assert.equal((await context.service.execute(context.id, { action: "complete", expectedStepId: "prep" })).status, 200);
});

it("duplicate start/finish cannot submit the same recording twice", async () => {
  const context = await kitchen([omission]);
  const voice = harness(context.service, context.id, "I don't have tomato paste");
  voice.turn.start(); voice.turn.start();
  await Promise.all([voice.turn.finish(), voice.turn.finish()]);
  assert.equal(voice.submitted, 1); assert.equal(voice.spoken.length, 1);
});

it("server rejects duplicate and concurrent turns, and stale same-step adaptations", async () => {
  const context = await kitchen([omission]);
  const revision = context.service.read(context.id).body.revision;
  const input = { action: "adapt", message: "I don't have tomato paste", expectedRevision: revision, requestId: "turn-1" };
  const pending = context.service.execute(context.id, input);
  assert.equal((await context.service.execute(context.id, input)).status, 409);
  await pending;
  const after = context.service.read(context.id).body.state;
  assert.equal((await context.service.execute(context.id, { ...input, requestId: "turn-2" })).status, 409);
  assert.equal((await context.service.execute(context.id, { ...input, expectedRevision: context.service.read(context.id).body.revision })).status, 409);
  assert.deepEqual(context.service.read(context.id).body.state, after);
});

it("a recording captured before another tab changes the kitchen cannot apply its transcript", async () => {
  const context = await kitchen([omission]);
  const voice = harness(context.service, context.id, "I don't have tomato paste");
  voice.turn.start();
  await context.service.execute(context.id, { action: "complete", expectedStepId: "prep" });
  await voice.turn.finish();
  assert.equal(voice.states.at(-1), "error"); assert.deepEqual(voice.spoken, []);
  assert.deepEqual(context.service.read(context.id).body.state?.progress?.session.completedStepIds, ["prep"]);
  assert.equal(context.prompts.length, 2);
});

it("cancelling a late STT result prevents submission and cleans up capture", async () => {
  const context = await kitchen();
  let resolve!: (text: string) => void;
  const voice = harness(context.service, context.id, "", { transcribe: () => new Promise((done) => { resolve = done; }) });
  voice.turn.start(); const pending = voice.turn.finish();
  await new Promise((done) => setImmediate(done));
  voice.turn.cancel(); resolve("done"); await pending;
  assert.equal(voice.submitted, 0); assert.equal(voice.states.at(-1), "idle"); assert.ok(voice.cancelled > 0);
});

it("late microphone permission after cancellation immediately releases its stream", async () => {
  const context = await kitchen();
  let resolve!: (recording: Awaited<ReturnType<VoicePorts["record"]>>) => void;
  let cancelled = 0;
  const voice = harness(context.service, context.id, "", { record: () => new Promise((done) => { resolve = done; }) });
  voice.turn.start(); voice.turn.cancel();
  resolve({ async finish() { throw new Error("Must not finish"); }, cancel() { cancelled++; } });
  await new Promise((done) => setImmediate(done));
  assert.ok(cancelled > 0); assert.equal(voice.submitted, 0);
});

it("microphone denial returns error with unchanged session and no raw diagnostics", async () => {
  const context = await kitchen();
  const before = context.service.read(context.id).body.state;
  const voice = harness(context.service, context.id, "", { async record() { throw new Error("private-device"); } });
  voice.turn.start(); await new Promise((done) => setImmediate(done));
  assert.equal(voice.states.at(-1), "error"); assert.equal(voice.submitted, 0);
  assert.deepEqual(context.service.read(context.id).body.state, before);
});

it("typed and voiced next/repeat/current/done remain deterministic and completion is spoken", async () => {
  const context = await kitchen();
  for (const message of ["Next.", "what now?", "repeat", "show current step", "what do I do next?"]) {
    const voice = harness(context.service, context.id, message); voice.turn.start(); await voice.turn.finish();
    assert.deepEqual(voice.spoken, ["Prepare the paste. For this step: 30 grams Tomato paste."]);
    assert.equal(context.service.read(context.id).body.state?.progress?.currentStep?.id, "prep");
  }
  const voice = harness(context.service, context.id, "Done!"); voice.turn.start(); await voice.turn.finish();
  assert.deepEqual(voice.spoken, ["Add the paste. For this step: 30 grams Tomato paste."]);
  const last = harness(context.service, context.id, "done"); last.turn.start(); await last.turn.finish();
  assert.deepEqual(last.spoken, ["All steps are complete. Enjoy your meal!"]);
  assert.equal(context.prompts.length, 2);
});

it("speech endpoints sanitize failures, enforce origin/session, and only accept retained response handles", async () => {
  const context = await kitchen();
  const endpoints = voiceHandlers(context.service, () => { throw new Error("credential-value"); });
  assert.equal((await endpoints.token(request(context.id, undefined, "https://other.example"))).status, 403);
  assert.equal((await endpoints.token(request("missing"))).status, 409);
  const unavailable = await endpoints.token(request(context.id));
  assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /credential-value/);
  assert.equal((await endpoints.speech(request(context.id, { text: "arbitrary speech" }))).status, 400);
  const reply = await context.service.execute(context.id, { action: "adapt", message: "next", requestId: "request-1" });
  const speechRequest = { id: reply.body.speech!.id, revision: reply.body.revision };
  const failed = await endpoints.speech(request(context.id, speechRequest));
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /credential-value/);
  await context.service.execute(context.id, { action: "complete", expectedStepId: "prep" });
  assert.equal((await endpoints.speech(request(context.id, speechRequest))).status, 409);
});

it("browser STT uses the documented single-use token and multipart recording, never a long-lived key", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://api.elevenlabs.io/v1/speech-to-text?token=temporary");
    assert.equal(init?.headers, undefined);
    assert.equal((init?.body as FormData).get("model_id"), "scribe_v2");
    assert.ok((init?.body as FormData).get("file") instanceof Blob);
    return Response.json({ text: " done " });
  });
  assert.equal(await transcribeRecording(new Blob(["mock"], { type: "audio/webm" }), "temporary", new AbortController().signal), "done");
});

it("token failure closes capture and permits a fresh voice turn", async () => {
  const context = await kitchen();
  let fail = true;
  const voice = harness(context.service, context.id, "next", { async token() { if (fail) throw new Error("secret"); return "temporary"; } });
  voice.turn.start(); await new Promise((done) => setImmediate(done));
  assert.equal(voice.states.at(-1), "error"); assert.ok(voice.cancelled > 0);
  fail = false; voice.turn.start(); await voice.turn.finish();
  assert.equal(voice.states.at(-1), "idle"); assert.equal(voice.submitted, 1);
});

it("cancelling late playback prevents speaking callbacks from a previous turn", async () => {
  const context = await kitchen();
  let finish!: () => void;
  let ready!: () => void;
  const voice = harness(context.service, context.id, "next", { play: (_reply, _signal, callback) => { ready = callback; return new Promise((done) => { finish = done; }); } });
  voice.turn.start(); const pending = voice.turn.finish();
  await new Promise((done) => setImmediate(done));
  voice.turn.cancel(); ready(); finish(); await pending;
  assert.equal(voice.states.at(-1), "idle"); assert.ok(!voice.states.includes("speaking"));
});

it("token and speech requests reject overlap and release locks after errors or consumption", async () => {
  const context = await kitchen();
  let tokenDone!: (text: string) => void;
  const endpoints = voiceHandlers(context.service, () => ({ batchToken: () => new Promise((done) => { tokenDone = done; }), async synthesize() { return new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }); } }));
  const pending = endpoints.token(request(context.id));
  assert.equal((await endpoints.token(request(context.id))).status, 409);
  tokenDone("temporary"); assert.equal((await pending).status, 200);
  const reply = await context.service.execute(context.id, { action: "adapt", message: "next", requestId: "speech-test" });
  const input = { id: reply.body.speech!.id, revision: reply.body.revision };
  const speech = await endpoints.speech(request(context.id, input));
  assert.equal((await endpoints.speech(request(context.id, input))).status, 409);
  await speech.text();
  assert.equal((await endpoints.speech(request(context.id, input))).status, 200);
});

it("stale synthesis is discarded when the kitchen changes while ElevenLabs prepares audio", async () => {
  const context = await kitchen();
  let resolve!: (response: Response) => void;
  const endpoints = voiceHandlers(context.service, () => ({ async batchToken() { return "temporary"; }, synthesize: () => new Promise((done) => { resolve = done; }) }));
  const reply = await context.service.execute(context.id, { action: "adapt", message: "next", requestId: "stale-audio" });
  const pending = endpoints.speech(request(context.id, { id: reply.body.speech!.id, revision: reply.body.revision }));
  await new Promise((done) => setImmediate(done));
  await context.service.execute(context.id, { action: "complete", expectedStepId: "prep" });
  resolve(new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }));
  assert.equal((await pending).status, 409);
  assert.equal(context.service.read(context.id).body.state?.progress?.currentStep?.id, "cook");
});

it("recording limit finishes one turn automatically and releases capture", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const context = await kitchen();
  const voice = harness(context.service, context.id, "next");
  voice.turn.start(); await new Promise((done) => setImmediate(done));
  t.mock.timers.tick(30_000);
  await new Promise((done) => setImmediate(done));
  assert.equal(voice.submitted, 1); assert.equal(voice.states.at(-1), "idle"); assert.ok(voice.cancelled > 0);
});
