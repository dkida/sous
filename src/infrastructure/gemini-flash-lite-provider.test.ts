import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GemmaProvider } from "./gemma-provider";
import { GeminiFlashLiteProvider } from "./gemini-flash-lite-provider";

const fakeKey = "fictional-flash-lite-credential";
function successful(text = '{"message":"Hello"}') {
  return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "Hidden reasoning" }, { text }] } }] }));
}

describe("experimental Gemini Flash-Lite provider", () => {
  it("uses the preferred model, credential header, timeout and exactly the Gemma baseline request body", async () => {
    const bodies: unknown[] = [];
    const request: typeof fetch = async (url, options) => {
      assert.equal(new Headers(options?.headers).get("x-goog-api-key"), fakeKey);
      assert.equal(String(url).includes(fakeKey), false);
      assert.ok(options?.signal);
      assert.equal(options?.method, "POST");
      bodies.push(JSON.parse(String(options?.body)));
      assert.ok(String(url).endsWith(bodies.length === 1 ? "gemma-4-26b-a4b-it:generateContent" : "gemini-3.5-flash-lite:generateContent"));
      return successful();
    };
    const gemmaText = await new GemmaProvider(fakeKey, undefined, request).generate("Identical prompt");
    const flashText = await new GeminiFlashLiteProvider(fakeKey, undefined, request).generate("Identical prompt");
    assert.equal(flashText, gemmaText);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(JSON.stringify(bodies).includes(fakeKey), false);
  });

  it("allows an explicitly configured Flash-Lite model and rejects missing keys or other families", async () => {
    assert.throws(() => new GeminiFlashLiteProvider(" "), /required/);
    for (const model of ["gemma-4-26b-a4b-it", "gemini-3.5-flash", "../secret", "gemini-3.5-flash-lite?key=secret"]) {
      assert.throws(() => new GeminiFlashLiteProvider(fakeKey, model), /Flash-Lite model ID/);
    }
    const request: typeof fetch = async (url) => { assert.match(String(url), /gemini-3.1-flash-lite:generateContent$/); return successful(); };
    await new GeminiFlashLiteProvider(fakeKey, "gemini-3.1-flash-lite", request).generate("JSON");
  });

  it("keeps the optional native schema probe behind generate(prompt) without enabling it for comparisons", async () => {
    const schema = { type: "object", properties: { message: { type: "string" } }, required: ["message"] };
    const request: typeof fetch = async (_url, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)).generationConfig, { temperature: 0.2, maxOutputTokens: 8192,
        responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } } });
      return successful();
    };
    assert.equal(await new GeminiFlashLiteProvider(fakeKey, undefined, request, schema).generate("JSON"), '{"message":"Hello"}');
  });

  for (const status of [402, 403, 404, 429]) {
    it(`sanitizes HTTP ${status} and makes no automatic retry or fallback`, async () => {
      let calls = 0;
      const request: typeof fetch = async () => { calls++; return new Response(JSON.stringify({ error: fakeKey }), { status }); };
      await assert.rejects(new GeminiFlashLiteProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.equal(error.message.includes(fakeKey), false);
        return true;
      });
      assert.equal(calls, 1);
    });
  }

  for (const name of ["Error", "TimeoutError", "AbortError"]) {
    it(`sanitizes ${name} without exposing credentials or exception details`, async () => {
      const request: typeof fetch = async () => { const error = new Error(fakeKey); error.name = name; throw error; };
      await assert.rejects(new GeminiFlashLiteProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
        assert.equal(error.message.includes(fakeKey), false);
        assert.equal(error.cause, undefined);
        assert.match(error.message, name === "Error" ? /could not be reached/ : /timed out/);
        return true;
      });
    });
  }

  for (const [name, body] of [
    ["blocked", {}], ["incomplete", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }] }],
    ["empty", { candidates: [{ finishReason: "STOP", content: { parts: [] } }] }],
    ["invalid parts", { candidates: [{ finishReason: "STOP", content: { parts: [null] } }] }],
  ]) {
    it(`rejects ${name} responses`, async () => {
      const request: typeof fetch = async () => new Response(JSON.stringify(body));
      await assert.rejects(new GeminiFlashLiteProvider(fakeKey, undefined, request).generate("JSON"));
    });
  }

  it("rejects reflected credentials", async () => {
    const request: typeof fetch = async () => successful(fakeKey);
    await assert.rejects(new GeminiFlashLiteProvider(fakeKey, undefined, request).generate("JSON"), /unsafe response/);
  });
});
