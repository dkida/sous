import assert from "node:assert/strict";
import { it } from "node:test";
import { recordMicrophone, playResponse } from "./voice-client";

it("MediaRecorder finishes once, emits one audio blob, and releases every microphone track", async (t) => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldRecorder = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
  let stopped = 0;
  let acquired = 0;
  let recorderStops = 0;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { async getUserMedia() { acquired++; return { getTracks: () => [{ stop() { stopped++; } }] }; } } } });
  class Recorder {
    static isTypeSupported(type: string) { return type.includes("webm"); }
    mimeType = "audio/webm;codecs=opus";
    state = "inactive";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    start() { this.state = "recording"; }
    stop() {
      recorderStops++; this.state = "inactive";
      queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["mock audio"]) }); this.onstop?.(); });
    }
  }
  Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: Recorder });
  t.after(() => {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    if (oldRecorder) Object.defineProperty(globalThis, "MediaRecorder", oldRecorder); else Reflect.deleteProperty(globalThis, "MediaRecorder");
  });
  const recording = await recordMicrophone();
  assert.equal(acquired, 1);
  const first = recording.finish(); const duplicate = recording.finish();
  assert.equal(first, duplicate); assert.equal(await (await first).text(), "mock audio");
  assert.equal(recorderStops, 1); assert.ok(stopped > 0);
  recording.cancel(); assert.equal(recorderStops, 1);
  const cancelled = await recordMicrophone(); cancelled.cancel();
  await assert.rejects(cancelled.finish());
  assert.equal(recorderStops, 2);
});

it("playback failure revokes audio URLs and never changes the successful cooking reply", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  let paused = 0;
  let revoked = 0;
  class AudioMock {
    onended?: () => void;
    onerror?: () => void;
    onplaying?: () => void;
    async play() { throw new Error("Autoplay denied"); }
    pause() { paused++; }
    removeAttribute() {}
    load() {}
  }
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: AudioMock });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "Audio", previous); else Reflect.deleteProperty(globalThis, "Audio"); });
  t.mock.method(URL, "createObjectURL", () => "blob:test");
  t.mock.method(URL, "revokeObjectURL", () => { revoked++; });
  t.mock.method(globalThis, "fetch", async () => new Response("mock audio", { headers: { "Content-Type": "audio/mpeg" } }));
  const reply = { state: { proposal: null, progress: null, response: { kind: "changed" as const, message: "Skip paste" } }, revision: "revision", speech: { id: "response", text: "Skip paste" } };
  const before = structuredClone(reply);
  await assert.rejects(playResponse(reply, new AbortController().signal, () => assert.fail("Must not report playback")));
  assert.deepEqual(reply, before); assert.equal(revoked, 1); assert.ok(paused > 0);
});
