# Task 5 — Voice Interaction

Read `PROJECT.md`, `DESIGN.md` and `STATUS.md` first and treat them as the
current sources of truth.

Tasks 1–4 are complete.

Sous currently supports the complete cooking flow through the web UI,
including adaptive cooking.

Task 5 adds voice as another interface to the existing cooking agent.

## Goal

A cook should be able to speak to Sous instead of typing and hear Sous respond.

The interaction pipeline is:

microphone
→ speech-to-text
→ existing Sous application path
→ text response
→ text-to-speech
→ speaker

Voice must reuse the same application/domain behavior as typed interaction.

Do not create a separate voice agent.

## Product principle

Voice exists because touching a phone or laptop while cooking is inconvenient.

It is not a decorative AI feature.

A voice interaction should feel like another way of operating the existing
Sous cooking session.

Typed interaction must remain fully functional as a fallback.

---

## Voice provider

Use ElevenLabs for:

- speech-to-text,
- text-to-speech.

Keep ElevenLabs-specific implementation outside the cooking domain.

Do not leak long-lived ElevenLabs credentials to the browser.

Follow the provider's supported browser/server authentication model rather
than inventing a proxy architecture unnecessarily.

Keep provider-specific code behind small interfaces where practical.

---

## Interaction model

For Task 5, implement explicit push-to-talk.

Do NOT implement:

- wake words,
- "Hey Sous",
- always-on listening,
- continuous background microphone access.

Those belong to Task 6.

The user must intentionally activate voice input.

Prefer the simplest reliable interaction:

1. user activates microphone,
2. UI clearly enters Listening state,
3. user speaks,
4. recording/transcription finishes,
5. transcript is routed through the same application path as typed input,
6. Sous processes it,
7. response is spoken.

Do not require the user to manually copy/confirm the transcript before sending
unless transcription confidence/error handling makes that necessary.

---

## Existing UI

Preserve the selected "Pass — Mise en place" visual direction.

Do not redesign Task 4.

Integrate voice into the existing dark interaction area.

Voice must not introduce:

- an AI orb,
- gradients,
- chat bubbles,
- floating assistant widgets,
- generic AI visual language.

The voice controls should feel like part of the existing kitchen instrument.

---

## Voice states

The UI must clearly represent at least:

- idle,
- listening,
- transcribing,
- thinking,
- speaking,
- error.

The distinction between these states should be understandable without
introducing excessive animation.

Examples of appropriate treatment:

LISTENING

THINKING

SPEAKING

Use restrained visual indicators consistent with `DESIGN.md`.

---

## Speech-to-text

Capture microphone input from the browser and transcribe it using ElevenLabs.

The resulting text must be passed through the SAME interaction path used by
typed adaptive messages.

For example, speaking:

"I don't have tomato paste"

must produce the same cooking-agent behavior as typing:

"I don't have tomato paste"

Do not create voice-specific intent handling.

Where useful for debugging and user confidence, display the recognized
transcript in a visually secondary way.

---

## Text-to-speech

Speak useful Sous responses using ElevenLabs.

Examples include:

- adaptive advice,
- clarification questions,
- current-step responses,
- recipe changes,
- cooking completion.

Do not blindly speak every piece of UI text or metadata.

The spoken response should communicate what the cook needs to know.

Do not create separate cooking decisions for TTS.

The underlying application response remains authoritative.

---

## Clarifications

Task 4 supports clarification during adaptive cooking.

Voice must work with the same clarification flow.

Example:

User says:

"I actually have three carrots."

Sous asks:

"Would you like to use all three?"

The user should be able to answer by voice:

"yes"

and have that response routed through the same clarification/application path
as a typed answer.

Existing contextual clarification buttons must continue to work.

---

## Deterministic cooking commands

Existing deterministic operations should remain deterministic.

For example, if appropriate in the current architecture:

- "done"
- "next"
- "repeat"
- "show current step"

should not require a separate voice-specific agent.

A transcript representing an existing deterministic command should enter the
same command handling used elsewhere.

Do not move reliable deterministic behavior into the LLM solely because the
input came from speech.

---

## Concurrency

Voice introduces asynchronous operations:

recording
→ STT
→ agent
→ TTS

Prevent obvious race conditions.

At minimum:

- do not submit the same recording twice,
- prevent accidental overlapping voice requests,
- stale responses must not overwrite newer session state,
- state-changing operations must retain existing concurrency/version guards,
- microphone or TTS failures must not corrupt CookingSession.

Prefer simple, explicit state transitions over elaborate realtime concurrency.

---

## Audio playback

Only one Sous response should play at a time.

For Task 5, use simple predictable behavior.

If necessary, stop/replace previous playback before playing a newer response.

Do not implement sophisticated conversational interruption/barge-in yet.

That belongs to later hands-free work.

---

## Failure handling

Voice is optional to the core cooking flow.

If:

- microphone permission is denied,
- microphone capture fails,
- STT fails,
- ElevenLabs is unavailable,
- TTS fails,

the cooking session must remain usable through text and buttons.

A TTS failure after a successful adaptive operation must NOT roll back the
successful cooking-state change.

Show a concise useful error without exposing provider diagnostics or secrets.

---

## Latency

Previous benchmarking showed that interactive model latency matters
significantly for Sous.

Do not introduce unnecessary sequential requests around the LLM interaction.

Instrument the voice pipeline in development so a voice turn can distinguish
approximately:

- capture/recording completion,
- STT latency,
- cooking-agent latency,
- TTS request / first playable audio latency,
- total turn latency.

Do not log raw audio, API credentials or complete prompts.

Do not attempt major inference optimization in this task.

---

## Security

Never expose long-lived ElevenLabs API keys in client-side bundles.

Do not log:

- API keys,
- authorization headers,
- raw credentials.

Do not commit secrets.

Document required environment variable names without values.

---

## Tests

Network/provider calls must be mocked in automated tests.

Tests must not consume ElevenLabs credits.

Add tests covering at minimum:

1. STT transcript is routed through the same application path as typed input.
2. Adaptive voice input produces the same valid state transition as text.
3. Voice can answer an active clarification.
4. TTS receives the resulting Sous response.
5. STT failure leaves cooking state unchanged.
6. TTS failure does not undo an already successful state change.
7. duplicate/concurrent voice submissions are safely handled.
8. stale responses cannot corrupt newer cooking state.
9. typed interaction continues to work without voice.
10. existing Task 1–4 tests continue to pass.

---

## Manual verification

Manually verify in the browser:

### Scenario A — normal adaptive interaction

During cooking say:

"I don't have tomato paste."

Verify:

- microphone capture,
- correct transcript,
- adaptive response,
- valid session update,
- spoken response.

### Scenario B — urgent cooking problem

Say:

"The onions are burning."

Verify that the response is context-aware and spoken.

### Scenario C — clarification

Trigger a clarification such as changing an ingredient quantity.

Answer the clarification using voice.

Verify the session updates correctly.

### Scenario D — failure/fallback

Verify that denying microphone permission or simulating voice failure leaves
the text cooking interface usable.

---

## Out of scope

Do NOT implement:

- wake word detection,
- "Hey Sous",
- always-on microphone,
- continuous listening,
- background listening,
- native mobile apps,
- database/persistence,
- authentication,
- recipe history,
- user profiles,
- multi-agent architecture,
- Task 6 UX features.

Do not start Task 6.

---

## Verification

Before completing Task 5:

1. run the full test suite,
2. run typecheck,
3. run production build,
4. manually test real STT,
5. manually test real TTS,
6. manually test at least one complete adaptive voice turn,
7. verify typed fallback,
8. inspect desktop and mobile voice controls,
9. update `STATUS.md`.

Document:

- ElevenLabs integration architecture,
- browser/server responsibility,
- measured voice latency,
- manually verified scenarios,
- known browser limitations,
- known provider limitations.

Do not implement anything beyond this task.