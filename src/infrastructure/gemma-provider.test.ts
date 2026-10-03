import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GemmaProvider } from "./gemma-provider";

// Fictional credential only. Tests never load environment files or access the network.
const fakeKey = "test-credential";
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
function successful(text = '{"dishName":"Pasta"}'): Response {
  return response({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "internal reasoning" }, { text }] } }] });
}

describe("GemmaProvider", () => {
  it("uses the hosted Gemma endpoint and an API key header, and returns only output text", async () => {
    const request: typeof fetch = async (url, options) => {
      assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent");
      assert.equal(String(url).includes(fakeKey), false);
      assert.equal(options?.method, "POST");
      assert.equal(new Headers(options?.headers).get("x-goog-api-key"), fakeKey);
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "Return JSON" }] }]);
      assert.equal(String(options?.body).includes(fakeKey), false);
      assert.ok(options?.signal);
      return successful();
    };
    assert.equal(await new GemmaProvider(fakeKey, undefined, request).generate("Return JSON"), '{"dishName":"Pasta"}');
  });

  it("allows another Gemma model while rejecting missing keys and non-Gemma models", async () => {
    assert.throws(() => new GemmaProvider(" "), /required/);
    assert.throws(() => new GemmaProvider(fakeKey, "gemini-2.5-flash"), /Gemma model ID/);
    const request: typeof fetch = async (url) => {
      assert.match(String(url), /gemma-3-27b-it:generateContent$/);
      return successful();
    };
    await new GemmaProvider(fakeKey, "gemma-3-27b-it", request).generate("JSON");
  });

  it("reports HTTP failures without reflecting remote error bodies", async () => {
    const request: typeof fetch = async () => response({ error: { message: fakeKey } }, 429);
    await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
      assert.match(error.message, /HTTP 429/);
      assert.equal(error.message.includes(fakeKey), false);
      return true;
    });
  });

  it("identifies HTTP 402 as depleted credits and makes no automatic retry", async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls += 1;
      return response({ error: { message: fakeKey } }, 402);
    };
    await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
      assert.match(error.message, /HTTP 402/);
      assert.match(error.message, /prepaid API credits are depleted/);
      assert.match(error.message, /use a key from a Free Tier project/);
      assert.match(error.message, /restore credits before retrying/);
      assert.equal(error.message.includes(fakeKey), false);
      return true;
    });
    assert.equal(calls, 1);
  });

  it("sanitizes transport exceptions rather than exposing requests or credentials", async () => {
    const request: typeof fetch = async () => { throw new Error(fakeKey); };
    await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
      assert.match(error.message, /could not be reached/);
      assert.equal(error.message.includes(fakeKey), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  });

  it("reports timeouts explicitly without reflecting exception details", async () => {
    const request: typeof fetch = async () => { throw new DOMException(fakeKey, "TimeoutError"); };
    await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
      assert.match(error.message, /timed out/);
      assert.equal(error.message.includes(fakeKey), false);
      return true;
    });
  });

  for (const [name, body] of [
    ["blocked", { promptFeedback: { blockReason: "SAFETY" } }],
    ["truncated", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }] }],
    ["empty", { candidates: [{ finishReason: "STOP", content: { parts: [] } }] }],
    ["invalid parts", { candidates: [{ finishReason: "STOP", content: { parts: [null] } }] }],
  ]) {
    it(`rejects ${name} responses`, async () => {
      const request: typeof fetch = async () => response(body);
      await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"));
    });
  }

  it("rejects reflected credentials", async () => {
    const request: typeof fetch = async () => successful(fakeKey);
    await assert.rejects(new GemmaProvider(fakeKey, undefined, request).generate("JSON"), /unsafe response/);
  });
});
