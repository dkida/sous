import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import CookingComposer from "../app/cooking-composer";
import { VoiceTurn, transcribeRecording, type VoicePorts, type VoiceState } from "./voice-client";
import { WebCookingService } from "./cooking-service";
import { cookingHandlers } from "./http";
import { voiceHandlers } from "./voice-http";
import { copy } from "./i18n";

function capture(overrides: Partial<VoicePorts> = {}) {
  let draft = "Typed ingredients"; let submits = 0; let plays = 0; let cancels = 0;
  const states: VoiceState[] = [];
  const turn = new VoiceTurn({ mode: "ingredients", async record() { return { async finish() { return new Blob(["audio"]); }, cancel() { cancels++; } }; },
    async token() { return "temporary"; }, async transcribe() { return "pasta, onion"; },
    async submit() { submits++; return null; }, async play() { plays++; },
    transcript(text) { if (text) draft = text; }, state(value) { states.push(value); }, ...overrides });
  return { turn, states, get draft() { return draft; }, get submits() { return submits; }, get plays() { return plays; }, get cancels() { return cancels; } };
}

for (const language of ["en", "pl"] as const) {
  it(`${language} ingredient STT produces an editable draft before using the same typed proposal HTTP path`, async (t) => {
    const transcript = language === "pl" ? "Mam 200 gramów makaronu, pomidory, cebulę i śmietanę." : "I have 200 grams of pasta, tomatoes, an onion and cream.";
    const prompts: string[] = [];
    const service = new WebCookingService(() => ({ async generate(prompt) { prompts.push(prompt); return JSON.stringify({ dishName: "Pasta", description: "Pasta", estimatedCookingMinutes: 20, servings: 2 }); } }));
    const voice = voiceHandlers(service, () => ({ async batchToken() { return "temporary"; }, async synthesize() { assert.fail("Entry capture needs no TTS"); } }));
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      assert.equal((init?.body as FormData).get("language_code"), language === "pl" ? "pol" : "eng");
      return Response.json({ text: transcript });
    });
    const entry = capture({ language,
      async token() {
        const response = await voice.token(new NextRequest("http://localhost/api/voice/token", { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ingredients", language }) }));
        assert.equal(response.status, 200);
        return (await response.json()).token;
      }, transcribe: (audio, token, signal) => transcribeRecording(audio, token, signal, language) });
    entry.turn.start(); entry.turn.start();
    await Promise.all([entry.turn.finish(), entry.turn.finish()]);
    assert.equal(entry.draft, transcript);
    assert.deepEqual(entry.states, ["listening", "transcribing", "idle"]);
    assert.equal(entry.submits, 0); assert.equal(entry.plays, 0); assert.ok(entry.cancels > 0);
    assert.equal(prompts.length, 0); assert.equal(service.read().body.state?.proposal, null);
    let draft = entry.draft;
    let pending: Promise<Response> | undefined;
    const props = { mode: "ingredients" as const, language, message: draft, busy: false, voiceState: "idle" as const, voiceError: "", transcript: "",
      onMessage(value: string) { draft = value; }, onSend() { pending = cookingHandlers(service).POST(new NextRequest("http://localhost/api/cooking", { method: "POST", headers: { origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify({ action: "propose", ingredients: draft, language }) })); }, onRecord() {}, onFinish() {}, onCancel() {} };
    const markup = renderToStaticMarkup(createElement(CookingComposer, props));
    assert.match(markup, /id="ingredients"/); assert.ok(markup.includes(transcript)); assert.doesNotMatch(markup, /readOnly/);
    // Review/edit before the same explicit submit used for typed ingredients.
    props.onMessage(`${draft} ${language === "pl" ? "Bez śmietany." : "No cream."}`);
    props.onSend(); assert.equal((await pending!).status, 200);
    assert.equal(prompts.length, 1); assert.ok(prompts[0]!.includes(draft));
    assert.equal((await (await pending!).json()).state.proposal.dishName, "Pasta");
  });
}

it("ingredient STT failure or empty speech preserves typed input and never submits", async () => {
  for (const transcribe of [async () => { throw new Error("private diagnostic"); }, async () => ""]) {
    const entry = capture({ transcribe }); entry.turn.start(); await entry.turn.finish();
    assert.equal(entry.draft, "Typed ingredients"); assert.equal(entry.states.at(-1), "error");
    assert.equal(entry.submits, 0); assert.equal(entry.plays, 0); assert.ok(entry.cancels > 0);
  }
});

it("ingredient capture handles permission denial and cancellation of late STT", async () => {
  const denied = capture({ async record() { throw new Error("denied"); } });
  denied.turn.start(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(denied.states.at(-1), "error"); assert.equal(denied.draft, "Typed ingredients");
  let resolve!: (text: string) => void;
  const entry = capture({ transcribe: () => new Promise((done) => { resolve = done; }) });
  entry.turn.start(); const pending = entry.turn.finish(); await new Promise((done) => setImmediate(done));
  entry.turn.cancel(); resolve("late ingredients"); await pending;
  assert.equal(entry.draft, "Typed ingredients"); assert.equal(entry.submits, 0); assert.equal(entry.states.at(-1), "idle");
});

it("pre-session tokens enforce entry mode, origin and proposal/session boundaries without creating a flow", async () => {
  let calls = 0;
  const service = new WebCookingService(() => ({ async generate() { return JSON.stringify({ dishName: "Pasta", description: "Pasta", estimatedCookingMinutes: 20, servings: 2 }); } }));
  const endpoints = voiceHandlers(service, () => ({ async batchToken() { calls++; return "temporary"; }, async synthesize() { throw new Error(); } }));
  const request = (body?: unknown, cookie?: string, origin = "http://localhost") => new NextRequest("http://localhost/api/voice/token", { method: "POST", headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie: `sous-session=${cookie}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const body = { mode: "ingredients", language: "pl" };
  assert.equal((await endpoints.token(request())).status, 409);
  assert.equal((await endpoints.token(request(body, undefined, "https://other.example"))).status, 403);
  assert.equal((await endpoints.token(request(body, undefined, ""))).status, 403);
  assert.equal((await endpoints.token(request(body, "expired"))).status, 409);
  const entry = await endpoints.token(request(body)); assert.equal(entry.status, 200); assert.equal(entry.headers.get("set-cookie"), null);
  const proposal = await service.execute(undefined, { action: "propose", ingredients: "pasta", language: "pl" });
  assert.equal((await endpoints.token(request(body, proposal.id))).status, 409);
  assert.equal(calls, 1);
});

it("EN/PL Ask Sous placeholders are neutral and ingredient composer keeps typed input usable", () => {
  assert.equal(copy.en.questionPlaceholder, "Ask about this step or change something…");
  assert.equal(copy.pl.questionPlaceholder, "Zapytaj o ten krok lub zmień coś…");
  for (const language of ["en", "pl"] as const) {
    const props = { language, message: "pasta", busy: false, voiceState: "idle" as const, voiceError: "", transcript: "", onMessage() {}, onSend() {}, onRecord() {}, onFinish() {}, onCancel() {} };
    const cooking = renderToStaticMarkup(createElement(CookingComposer, props));
    assert.ok(cooking.includes(copy[language].questionPlaceholder));
    const entry = renderToStaticMarkup(createElement(CookingComposer, { ...props, mode: "ingredients" }));
    assert.ok(entry.includes(copy[language].findDish)); assert.doesNotMatch(entry, /disabled|readOnly/);
    const listening = renderToStaticMarkup(createElement(CookingComposer, { ...props, mode: "ingredients", voiceState: "listening" }));
    assert.ok(listening.includes(copy[language].finishCapture));
  }
});
