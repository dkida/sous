# Task 5 voice integration

Voice wraps the existing web cooking interaction. It does not add another cooking
agent, modify the cooking domain, or change `LLMProvider`/provider selection.
Gemma remains the default; existing Flash-Lite development overrides still work.

## Local configuration

Set `ELEVENLABS_API_KEY` in the existing untracked `.env.local`, then restart Next.
Do not use a `NEXT_PUBLIC_` variable or paste credentials into the browser/chat.
The key needs access to Speech to Text and Text to Speech.

Optional: `ELEVENLABS_VOICE_ID` selects an available ElevenLabs voice. Without it,
the adapter uses the George voice ID shown in ElevenLabs' official quickstart.
No existing credentials or environment files are changed by this implementation.
Missing voice configuration does not prevent cooking through text/buttons.

## Browser and server responsibilities

1. On ingredient entry or during active cooking, use the microphone in the unified **Ask Sous** composer,
   allow microphone access and speak. On entry, **Stop** finishes transcription into
   the existing ingredient draft; review/edit it, then use **Find something to cook**.
   Entry capture makes no proposal or TTS request automatically. During cooking,
   **Stop** finishes and sends the turn. **Cancel**
   discards the recording. While playback runs, **Stop** stops speech. A 30-second limit
   finishes automatically; audio is capped at 5 MB. There is no background
   microphone or wake word. Microphone tracks stop immediately on finish/cancel,
   capture failure, page hide, or component teardown. Late permission grants are
   cleaned up without sending audio.
2. While capture starts, `/api/voice/token` uses the server key to issue a
   `batch_scribe` single-use token. The browser sends the finished MediaRecorder
   blob directly to ElevenLabs `POST /v1/speech-to-text?token=...`, with
   `model_id=scribe_v2`, diarization/audio event tagging disabled. No audio passes
   through Sous's server or is retained by application code. ElevenLabs' own
   retention follows the provider/account policy; this is not zero retention.
3. Recognized speech appears temporarily in the composer and enters the same `send({action: "adapt"})`
   function and `/api/cooking` path as typed input. Exact done/complete commands
   complete the expected step; next/now/current/repeat/show-current-step queries
   read it. All other text, including yes/no clarification answers, reaches the
   retained `CookingAgent.adaptCooking`. Queries never advance.
4. A successful reply carries an opaque speech handle and the useful response:
   adaptive advice/question/change acknowledgement, current/next instruction, or
   completion. `/api/voice/speech` resolves this handle against the retained flow
   and revision. It does not accept arbitrary text or make cooking decisions.
5. The server adapter sends that text to ElevenLabs' HTTP TTS stream with
   `eleven_flash_v2_5` and `mp3_44100_128`. It forwards audio without provider
   headers/diagnostics. The browser buffers this short MP3 before ordinary audio
   playback, avoiding MediaSource/WebSocket complexity and Safari differences.
   Consequently first-playable latency includes downloading the full response.
   TTS failure leaves the already committed cooking state and text response intact.

The browser has only a time-bound, one-use STT credential (documented expiry:
15 minutes), never the long-lived key. The speech endpoint requires a
retained cookie flow. Token issuance also supports explicit ingredient-entry mode
before a flow exists, requires a same-origin browser Origin in that mode, and
rejects expired sessions or entry capture after a proposal/cooking session exists.
Token issuance never creates a cooking agent or recipe flow. Both endpoints reject
cross-origin requests. Responses are
uncached. Provider implementation is outside the cooking domain behind the small
`SpeechProvider` interface.

## States and concurrency

The strip displays idle, listening, transcribing, thinking, speaking, and error.
Listening includes the initial permission request; recording starts once access
is granted. Thinking also covers preparation of response audio. Only actual audio
playback enters speaking. **Stop speech** stops and releases that audio.
Text/buttons are disabled during a voice turn and restored on completion/error.

One synchronous browser lock spans capture → STT → cooking → TTS → playback.
Duplicate start/finish calls cannot submit twice. Generation IDs plus abort
signals discard late capture/STT/playback results after cancellation/navigation.
Client request sequence guards also prevent older cooking snapshots from replacing
newer ones. A flow revision captured at microphone activation is checked before
server command dispatch, including same-step adaptations/clarifications from
another tab. Modern web requests use unique IDs; the server remembers the last
100 IDs to reject duplicates. Expected-step checks and the existing agent's
busy/stale-store guards remain intact. Reset releases the flow.

Speech handles/revisions reject obsolete audio requests; synthesis that becomes
stale while awaiting provider headers is discarded. One server speech request per
flow and one browser audio object per voice turn prevent overlapping playback.
The MVP is still process-local; tabs share a cookie and multiple workers do not
share flows. A request already committed on the server cannot be undone by closing
the page; reload/current-step recovery retrieves authoritative state.

## Development latency instrumentation

Development-only `[sous voice timing]` console summaries contain fixed phase/outcome
labels and elapsed milliseconds, never audio, transcript, prompts, tokens or keys:

- `captureMs`: recording duration including recording completion;
- `captureCompletionMs`: finishing MediaRecorder and obtaining its final blob;
- `sttMs`: token readiness plus STT request/decoding;
- `agentMs`: existing cooking HTTP/application request;
- `ttsPlayableMs`: TTS request, download, decoding and first playback;
- `totalToAudioMs`: microphone activation to first spoken audio (includes user speech);
- `totalMs`: turn through playback completion/failure.

These spans include transport time and cannot isolate provider compute. Phases
not reached are omitted. Automated tests validate timing fields with mocked
providers; they do not consume credits or establish real provider latency.

## Live verification — 2026-10-04

After local key configuration, real browser STT → cooking HTTP → TTS turns passed
for missing tomato paste, burning onions, a carrot clarification and its spoken
“yes” answer. Scribe transcripts matched all four synthetic phrases. Browser audio
playback entered `speaking` and ended normally for all four responses. The paste
was removed, urgent advice was returned at the sauteing-onion step, and the carrot
quantity changed from one to three only after the clarification answer. Completed
preparation/pasta steps remained intact.

Input was ElevenLabs-generated test speech re-encoded to WebM/Opus through browser
Web Audio/MediaRecorder, not a physical microphone. The temporary test harness
used the actual `VoiceTurn`, `transcribeRecording`, `playResponse`, real single-use
browser authentication/CORS and existing cooking HTTP path; it was removed after
verification. No provider calls were mocked for these four turns. Flash-Lite was
selected through server process environment only; Gemma support was unchanged.

One sample per turn, milliseconds:

| Turn | Capture | STT | Cooking HTTP | TTS to playback | STT + cooking + TTS | Activation to audio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Missing paste | 1910 | 687 | 1164 | 808 | 2658 | 4601 |
| Burning onions | 1530 | 642 | 895 | 306 | 1843 | 3421 |
| Clarification | 5848 | 856 | 908 | 310 | 2073 | 7961 |
| Spoken yes | 836 | 536 | 1231 | 433 | 2200 | 3078 |

Recording completion took 2.5–5.4 ms. Capture includes playback of the synthetic
utterance and a short final silence. Activation-to-audio includes fixture loading/
decoding and capture; phase sums isolate the approximate post-capture request path.
`totalMs` in the detailed records also includes the full spoken response duration.
These are functional samples, not representative latency benchmarks, noisy-kitchen
accuracy tests or physical microphone permission/device measurements.

Full measurements and synthetic transcripts/responses:
[voice records](design/task5-verification/live-metrics.json).
A browser-injected STT failure left the live session identical and released voice
controls; [failure record](design/task5-verification/live-failure.json). The actual
Sous desktop/mobile Speak → Cancel interaction restored typed/button controls
without sending ambient microphone audio. Typed fallback still reached the agent.
A physical microphone spoken-command check on the user's browser remains pending.

## Browser/provider limitations

- Microphone capture requires HTTPS or trustworthy localhost, permission, a usable
  input device and MediaRecorder support. Chromium uses WebM/Opus; Safari can use
  MP4; Ogg/Opus is also negotiated. Physical phones and Safari are not verified.
- Autoplay policy can deny asynchronous speech despite the initiating button
  gesture. The UI reports playback failure and preserves the text response.
- Hiding the page cancels capture/playback; there is no mobile background voice.
- Batch transcription waits until recording finishes. STT/token/TTS transport has
  a 30-second timeout; cooking retains its existing provider timeout. There are no
  automatic paid retries. Browser CORS, account access and the default voice were verified in the live
  samples. Quota under load, natural/noisy speech accuracy and other voices still
  depend on the account/device.
- Speech is automatic for voice turns, not every typed interaction or UI label.
  During cooking, voice operates the active session. Ingredient capture ends at
  an editable draft and uses the existing proposal submit path; proposal acceptance
  retains its existing button flow.

## API references checked on 2026-10-04

- [Create single-use token](https://elevenlabs.io/docs/api-reference/tokens/create)
- [Create transcript — batch token query authentication and Scribe v2](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Stream speech — server API-key header and MP3 output](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
- [Official quickstart — example George voice](https://elevenlabs.io/docs/eleven-api/quickstart)
- [ElevenLabs HTTP streaming guidance](https://elevenlabs.io/blog/text-to-speech-api-integration)

## Task 5.1 language context

EN / PL is selected in the header before requesting a dish. The retained web flow
owns the language, and selection stays locked until reset. The same CookingAgent
requests that language in proposals, recipes, adaptive replies and clarifications;
voice transcripts enter the same input resolver and guarded domain operations.
No new environment variables are needed, and the existing voice ID is shared.

Scribe v2 receives explicit `language_code=eng` or `pol`, without opting into
language detection. The [transcription API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
supports ISO 639-1/639-3 hints. Server TTS sends `language_code=en` or `pl`, resolved
from the retained flow, with the existing `eleven_flash_v2_5` model. The
[stream API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
supports ISO 639-1 language enforcement; this parameter is not supported by
Multilingual v2. The [model reference](https://elevenlabs.io/docs/overview/models)
lists Polish support for Scribe and Flash v2.5. Checked on 2026-10-04.

Real Polish provider verification recognized a synthesized “Mam też cebulę” and
returned a Polish clarification plus MP3 speech. Post-input STT → cooking → buffered
TTS took 1.68 seconds in one functional sample. See
[measurements](design/task51-verification/live-metrics.json). This used the shared
STT function in Node, not physical microphone capture or browser playback; the
complete Polish UI flow was manually tested separately in the production browser.

## Final product refinement — 2026-10-04

RecipeStep now separates a short imperative `headline` (prefer 2–5 words, maximum
8) from a complete `instruction`, for both generation and adaptive step updates.
The visual heading uses headline; all quantities, timing, heat and safety details
stay in instruction. No instruction is sliced or ellipsized.

Deterministic current/repeat/progression speech uses the complete instruction plus
only missing known quantities from the current step's ingredient references. The
formatter recognizes common numeric/word amounts and EN/PL units and food forms,
including partial amounts, so it does not append a recipe total when the instruction
already specifies that ingredient's use. Unknown quantities remain unknown.
Fallback quantity labels preserve arbitrary Polish ingredient names without
guessing their grammatical case. Adaptive advice and clarification keep their
existing spoken message path. When an adaptive completion report actually changes
the current step ID, speech adds the full newly reached step instruction after the
acknowledgement, unless that complete instruction is already in the message. This
uses the existing deterministic formatter and adds no inference request. Completion
of the final step keeps the completion response; deterministic commands do not
invoke inference.

Ingredient mode reuses VoiceTurn, MediaRecorder and ElevenLabs Scribe v2 with
`eng` / `pol`. Its shared lock, generation IDs, aborts, capture limits and track
cleanup apply before cooking too. Permission/STT failure leaves the typed draft
intact; cancellation also discards late transcription. Cancel remains available
during entry transcription. No TTS acknowledgement, wake word or continuous
listening is added. Live synthetic-speech and responsive verification is recorded
in [STATUS.md](STATUS.md). Physical microphone/noisy-kitchen checks remain pending.
