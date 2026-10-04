import { speechLanguage, type Language } from "../shared/language";
import { copy } from "./i18n";
import type { CookingReply } from "./contracts";

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
export interface Recording { finish(): Promise<Blob>; cancel(): void }
export interface VoicePorts {
  language?: Language;
  record(): Promise<Recording>;
  token(signal: AbortSignal): Promise<string>;
  transcribe(audio: Blob, token: string, signal: AbortSignal): Promise<string>;
  submit(text: string, signal: AbortSignal): Promise<CookingReply | null>;
  play(reply: CookingReply, signal: AbortSignal, ready: () => void): Promise<void>;
  state(value: VoiceState, error?: string): void;
  transcript(text: string): void;
  timing?(metrics: Record<string, number | string>): void;
}

/** One finite push-to-talk turn. Cancellation invalidates every later callback. */
export class VoiceTurn {
  private generation = 0;
  private active = false;
  private recording?: Promise<Recording>;
  private token?: Promise<string>;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private finishing = false;
  private started = 0;
  private captureStarted = 0;
  constructor(private readonly ports: VoicePorts) {}

  start(): void {
    if (this.active) return;
    const generation = ++this.generation;
    this.active = true;
    this.finishing = false;
    this.started = performance.now();
    this.abort = new AbortController();
    this.ports.transcript("");
    this.ports.state("listening");
    // Prepare the supported token while the user is recording, not after capture.
    this.token = this.ports.token(this.abort.signal);
    void this.token.catch(() => { if (this.isCurrent(generation)) this.fail(copy[this.ports.language ?? "en"].voiceUnavailable); });
    this.recording = this.ports.record().then((recording) => {
      if (!this.isCurrent(generation)) { recording.cancel(); return recording; }
      this.captureStarted = performance.now();
      this.timer = setTimeout(() => { void this.finish(); }, 30_000);
      return recording;
    });
    void this.recording.catch(() => { if (this.isCurrent(generation)) this.fail(copy[this.ports.language ?? "en"].microphoneUnavailable); });
  }

  async finish(): Promise<void> {
    if (!this.active || this.finishing) return;
    this.finishing = true;
    const generation = this.generation;
    const signal = this.abort!.signal;
    const metrics: Record<string, number | string> = {};
    clearTimeout(this.timer);
    this.ports.state("transcribing");
    let phase: "capture" | "stt" | "agent" | "tts" = "capture";
    try {
      const recording = await this.recording!;
      if (!this.isCurrent(generation)) return;
      clearTimeout(this.timer);
      const captureCompletion = performance.now();
      const audio = await recording.finish();
      metrics.captureCompletionMs = performance.now() - captureCompletion;
      metrics.captureMs = performance.now() - this.captureStarted;
      if (!this.isCurrent(generation)) return;
      phase = "stt";
      const stt = performance.now();
      const text = await this.ports.transcribe(audio, await this.token!, signal);
      metrics.sttMs = performance.now() - stt;
      if (!this.isCurrent(generation)) return;
      if (!text.trim() || text.length > 4000) throw new Error("Empty transcript");
      this.ports.transcript(text);
      this.ports.state("thinking");
      phase = "agent";
      const agent = performance.now();
      const reply = await this.ports.submit(text, signal);
      metrics.agentMs = performance.now() - agent;
      if (!this.isCurrent(generation)) return;
      if (!reply || reply.error) throw new Error("Cooking request failed");
      phase = "tts";
      const tts = performance.now();
      await this.ports.play(reply, signal, () => {
        metrics.ttsPlayableMs = performance.now() - tts;
        metrics.totalToAudioMs = performance.now() - this.started;
        if (this.isCurrent(generation)) this.ports.state("speaking");
      });
      if (this.isCurrent(generation)) {
        this.cleanup();
        this.ports.state("idle");
        metrics.outcome = "success";
      }
    } catch {
      if (this.isCurrent(generation)) {
        metrics.outcome = phase + "-failed";
        this.fail(phase === "tts" ? copy[this.ports.language ?? "en"].playbackFailed
          : phase === "agent" ? copy[this.ports.language ?? "en"].voiceAgentFailed
          : phase === "capture" ? copy[this.ports.language ?? "en"].captureFailed
          : copy[this.ports.language ?? "en"].transcriptionFailed);
      }
    } finally {
      metrics.totalMs = performance.now() - this.started;
      // Only fixed phase labels and durations; never transcript/audio/token data.
      try { if (metrics.outcome) this.ports.timing?.(metrics); } catch { /* diagnostics cannot affect cooking */ }
    }
  }

  cancel(): void { this.cleanup(); this.ports.state("idle"); }
  private isCurrent(generation: number) { return this.active && generation === this.generation; }
  private fail(error: string) { this.cleanup(); this.ports.state("error", error); }
  private cleanup() {
    this.active = false;
    this.generation++;
    clearTimeout(this.timer);
    this.abort?.abort();
    void this.recording?.then((recording) => recording.cancel(), () => {});
  }
}

export async function recordMicrophone(): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Capture unsupported");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  try {
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    let cancelled = false;
    let finished: Promise<Blob> | undefined;
    let captureError = false;
    recorder.ondataavailable = (event) => { if (!cancelled && event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { captureError = true; stopTracks(); };
    recorder.start();
    return {
      finish() {
        if (finished) return finished;
        finished = new Promise<Blob>((resolve, reject) => {
          if (cancelled || captureError || recorder.state === "inactive") { stopTracks(); reject(new Error("Capture stopped")); return; }
          recorder.onstop = () => {
            stopTracks();
            const audio = new Blob(chunks, { type: recorder.mimeType });
            chunks.length = 0;
            if (captureError || !audio.size || audio.size > 5_000_000) reject(new Error("Invalid capture")); else resolve(audio);
          };
          recorder.onerror = () => { captureError = true; stopTracks(); reject(new Error("Capture failed")); };
          try { recorder.stop(); } finally { stopTracks(); }
        });
        return finished;
      },
      cancel() {
        cancelled = true;
        chunks.length = 0;
        try { if (recorder.state !== "inactive") recorder.stop(); } finally { stopTracks(); }
      },
    };
  } catch (error) { stopTracks(); throw error; }
}

export async function transcribeRecording(audio: Blob, token: string, signal: AbortSignal, language: Language = "en"): Promise<string> {
  const form = new FormData();
  form.set("file", audio, audio.type.includes("mp4") ? "utterance.mp4" : audio.type.includes("ogg") ? "utterance.ogg" : "utterance.webm");
  form.set("model_id", "scribe_v2");
  form.set("language_code", speechLanguage[language].stt);
  form.set("tag_audio_events", "false");
  form.set("diarize", "false");
  const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-text?token=${encodeURIComponent(token)}`, {
    method: "POST", body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error("Transcription unavailable");
  const body = await response.json();
  if (typeof body.text !== "string") throw new Error("Invalid transcript");
  return body.text.trim();
}

export async function playResponse(reply: CookingReply, signal: AbortSignal, ready: () => void): Promise<void> {
  if (!reply.speech || !reply.revision) throw new Error("No speech response");
  const response = await fetch("/api/voice/speech", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: reply.speech.id, revision: reply.revision }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error("Speech unavailable");
  // Short response MP3 buffering is compatible with Safari as well as Chromium.
  const blob = await response.blob();
  if (signal.aborted) throw new Error("Cancelled");
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      let played = false;
      const clean = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); };
      const fail = () => { clean(); audio.pause(); reject(new Error("Playback interrupted")); };
      const abort = () => fail();
      const timeout = setTimeout(fail, 120_000);
      signal.addEventListener("abort", abort, { once: true });
      audio.onended = () => { clean(); resolve(); };
      audio.onerror = () => fail();
      audio.onplaying = () => { if (!played) { played = true; ready(); } };
      void audio.play().catch(fail);
    });
  } finally { audio.pause(); audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); }
}
