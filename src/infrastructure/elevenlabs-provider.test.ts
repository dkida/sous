import assert from "node:assert/strict";
import { it } from "node:test";
import { ElevenLabsProvider } from "./elevenlabs-provider";

it("ElevenLabs adapter uses the current batch token and HTTP speech stream APIs with server-only key headers", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return calls.length === 1 ? Response.json({ token: "single-use" }) : new Response("audio", { headers: { "Content-Type": "audio/mpeg" } });
  };
  const provider = new ElevenLabsProvider("fictional-key", "voice-id", transport);
  assert.equal(await provider.batchToken(), "single-use");
  assert.equal(await (await provider.synthesize("Skip the paste.")).text(), "audio");
  assert.equal(calls[0]?.url, "https://api.elevenlabs.io/v1/single-use-token/batch_scribe");
  assert.equal(calls[1]?.url, "https://api.elevenlabs.io/v1/text-to-speech/voice-id/stream?output_format=mp3_44100_128");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["xi-api-key"], "fictional-key");
  assert.deepEqual(JSON.parse(calls[1]!.init!.body as string), { text: "Skip the paste.", model_id: "eleven_flash_v2_5", language_code: "en" });
  assert.ok(calls[1]?.init?.signal instanceof AbortSignal);
});

it("ElevenLabs rejects missing credentials and malformed or failed provider responses", async () => {
  assert.throws(() => new ElevenLabsProvider(""));
  assert.throws(() => new ElevenLabsProvider("key", "../bad"));
  const provider = new ElevenLabsProvider("key", "voice", async () => Response.json({ detail: "private" }, { status: 401 }));
  await assert.rejects(provider.batchToken(), /Voice is unavailable/);
  await assert.rejects(provider.synthesize("Hello"), /Speech is unavailable/);
  const invalid = new ElevenLabsProvider("key", "voice", async () => Response.json({ token: 1 }));
  await assert.rejects(invalid.batchToken());
  await assert.rejects(invalid.synthesize("Hello"));
});
