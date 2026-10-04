import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MistralProvider } from "./mistral-provider";

const fakeKey = "fictional-mistral-credential";
function successful(content: unknown = '{"message":"Hello"}') {
  return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }] }));
}

describe("Mistral open-weight benchmark provider", () => {
  it("uses the pinned model, bearer header, timeout and the Gemma baseline generation settings", async () => {
    const request: typeof fetch = async (url, options) => {
      assert.equal(String(url), "https://api.mistral.ai/v1/chat/completions");
      assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${fakeKey}`);
      assert.ok(options?.signal);
      assert.equal(options?.method, "POST");
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body, { model: "mistral-small-2603", messages: [{ role: "user", content: "Identical prompt" }], temperature: 0.2, max_tokens: 8192 });
      assert.equal(JSON.stringify(body).includes(fakeKey), false);
      return successful();
    };
    assert.equal(await new MistralProvider(fakeKey, undefined, request).generate("Identical prompt"), '{"message":"Hello"}');
  });

  it("sends the caller's contract as a strict native JSON Schema, and nothing without one", async () => {
    const schema = { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false };
    const formats: unknown[] = [];
    const request: typeof fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      formats.push(body.response_format);
      assert.equal(body.temperature, 0.2);
      assert.equal(body.max_tokens, 8192);
      return successful();
    };
    const provider = new MistralProvider(fakeKey, undefined, request);
    assert.equal(await provider.generate("JSON", { name: "dish_proposal", schema }), '{"message":"Hello"}');
    await provider.generate("JSON");
    assert.deepEqual(formats, [{ type: "json_schema", json_schema: { name: "dish_proposal", schema, strict: true } }, undefined]);
  });

  it("returns only text chunks, never reasoning chunks", async () => {
    const request: typeof fetch = async () => successful([
      { type: "thinking", thinking: [{ type: "text", text: "Hidden reasoning" }] }, { type: "text", text: '{"message":' }, { type: "text", text: '"Hi"}' },
    ]);
    assert.equal(await new MistralProvider(fakeKey, undefined, request).generate("JSON"), '{"message":"Hi"}');
  });

  it("rejects missing keys and models outside the pinned open-weight Small family", () => {
    assert.throws(() => new MistralProvider(" "), /required/);
    for (const model of ["mistral-small-latest", "mistral-medium-2508", "gemma-4-26b-a4b-it", "../secret", "mistral-small-2603?key=secret"]) {
      assert.throws(() => new MistralProvider(fakeKey, model), /Mistral Small model ID/);
    }
  });

  for (const status of [401, 402, 404, 429]) {
    it(`sanitizes HTTP ${status} and makes no automatic retry or fallback`, async () => {
      let calls = 0;
      const request: typeof fetch = async () => { calls++; return new Response(JSON.stringify({ error: fakeKey }), { status }); };
      await assert.rejects(new MistralProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
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
      await assert.rejects(new MistralProvider(fakeKey, undefined, request).generate("JSON"), (error: Error) => {
        assert.equal(error.message.includes(fakeKey), false);
        assert.equal(error.cause, undefined);
        assert.match(error.message, name === "Error" ? /could not be reached/ : /timed out/);
        return true;
      });
    });
  }

  for (const [name, body] of [
    ["no choices", {}], ["truncated", { choices: [{ finish_reason: "length", message: { content: "{}" } }] }],
    ["empty", { choices: [{ finish_reason: "stop", message: { content: "" } }] }],
    ["reasoning only", { choices: [{ finish_reason: "stop", message: { content: [{ type: "thinking", thinking: [] }] } }] }],
  ] as const) {
    it(`rejects ${name} responses`, async () => {
      const request: typeof fetch = async () => new Response(JSON.stringify(body));
      await assert.rejects(new MistralProvider(fakeKey, undefined, request).generate("JSON"));
    });
  }

  it("rejects reflected credentials", async () => {
    await assert.rejects(new MistralProvider(fakeKey, undefined, async () => successful(fakeKey)).generate("JSON"), /unsafe response/);
  });
});
