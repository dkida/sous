# Task 6 — Wake-word feasibility decision

Research date: **2026-10-04**. Target: **“Hey Sous”** in the existing web cooking
session. Decision: **NO-GO for this milestone**. No wake-word technology selected;
Phase 2 is not implemented. Push-to-talk remains the supported voice interaction.

This is a documentation and source-inspection spike, not an acoustic benchmark.
The decision concerns reliable delivery within this personal open-source
hackathon project's scope; local browser wake detection is technically possible.
Read together with [TASK6.md](TASK6.md) and [VOICE.md](VOICE.md).

## 1. Candidate approaches

### Picovoice Porcupine Web

The strongest packaged integration candidate. Its official
[Web quickstart](https://picovoice.ai/docs/quick-start/porcupine-web/) supplies
`porcupine-web`, a worker, and `web-voice-processor`. It lists Chrome/Chromium,
Edge, Firefox and Safari. This is vendor compatibility, not verified Sous support
on those devices.

The [Web binding](https://github.com/Picovoice/porcupine/blob/master/binding/web/README.md)
supports a custom Web/WASM `.ppn`, a language `.pv`, and IndexedDB caching.
Worker use requires IndexedDB. Cross-origin isolation enables SharedArrayBuffer
multithreading; the documented ArrayBuffer fallback works without those headers.
Base64 embedding adds approximately 33% to model bytes. It requires an AccessKey
in browser engine initialization, while the documentation instructs developers
to keep that key secret. A server proxy cannot hide a credential consumed by a
local browser engine; an acceptable public deployment arrangement is unresolved.

### openWakeWord with ONNX Runtime Web

The [upstream README](https://github.com/dscripka/openWakeWord) explicitly says
the full browser implementation needs porting and is not on its roadmap. Its web
example streams audio to a Python backend, which fails the ambient-audio privacy
requirement. A local port is possible, but would require feature processing,
buffers, inference and a custom trained phrase. Upstream recommends thousands
of positive training examples and substantial negative audio. English is the
supported training language. Code is Apache-2.0; included models are
CC BY-NC-SA 4.0, with separate attribution, non-commercial and share-alike duties.
This is a port/training project, beyond a small activation seam.

### sherpa-onnx open-vocabulary keyword spotting in WASM

A real local browser candidate: upstream has a
[WASM KWS demo](https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm/kws), not
just native ASR. [Keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)
accepts custom tokenized phrases without retraining a dedicated classifier.
The [build script](https://github.com/k2-fsa/sherpa-onnx/blob/master/build-wasm-simd-kws.sh)
requires Emscripten/CMake and produces a SIMD WASM build.

The [demo capture source](https://github.com/k2-fsa/sherpa-onnx/blob/master/wasm/kws/app.js)
uses main-thread `ScriptProcessorNode`, decodes synchronously, retains recording
buffers and requests the microphone during setup. Its Stop disconnects audio
nodes without stopping the input tracks. It cannot be copied as Sous's lifecycle
implementation. [ScriptProcessorNode is deprecated](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode);
reliable integration needs bounded capture, AudioWorklet/worker processing,
explicit enablement and full cleanup.

The [framework license](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)
is Apache-2.0. That alone does not establish the pretrained weights' terms. The
reviewed KWS model docs do not establish explicit redistribution permission;
[upstream issue #3802](https://github.com/k2-fsa/sherpa-onnx/issues/3802) asks this
specific question and the accessible page has no maintainer answer. This is
unresolved provenance, not a claim that using these models is forbidden.

### Browser Web Speech recognition plus phrase matching

Chrome's [139 release notes](https://developer.chrome.com/release-notes/139)
document on-device recognition. This can be local when explicitly forced;
ordinary `SpeechRecognition` does not guarantee that property.
[MDN's API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
defaults `processLocally` to false, allowing either remote or local processing.
It must be true with availability checked and a language pack installed; no
remote fallback is acceptable for ambient detection.

It runs continuous general transcription to match text rather than a dedicated
wake model. [Phrase biasing](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
can help unusual names but does not guarantee correct recognition. Language-pack
availability, recognizer endings and handoff to request capture remain practical
problems. A restart loop or matching “hey sue” as a substitute would not establish
reliable “Hey Sous” support.

## 2. Browser compatibility and platform constraints

| Approach | Chrome/Chromium desktop | Safari/iOS | Other browsers |
| --- | --- | --- | --- |
| Porcupine Web | Vendor-supported; needs WASM, microphone, model and valid AccessKey | Safari listed; physical iOS behavior unverified | Edge/Firefox listed; worker storage restrictions apply |
| openWakeWord local port | Technically possible with ONNX WASM; no upstream complete browser port | Runtime capability is not end-to-end support | Port and device validation required |
| sherpa-onnx KWS | Actual upstream browser demo; chosen build needs SIMD | Capture/runtime/lifecycle need device validation | No verified Sous matrix |
| Forced-local Web Speech | Chrome 139+ documented; feature and pack checks still required | `processLocally` unavailable in reviewed compatibility data | Edge data mirrors Chrome; Firefox preview only, not stable support; Chrome Android local processing unavailable |

Web Speech entries use current
[MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json).
Chromium-derived branding alone is not sufficient: browser speech backends and
language-pack availability must be checked at runtime. No mobile/Safari support
is claimed for Sous by this spike.

- [Microphone access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
  requires explicit permission and a secure context. Localhost is trustworthy;
  a phone visiting a desktop's plain HTTP LAN address is not equivalent. The
  permission promise can remain pending. Denial, track loss and late grants need
  cleanup; disable/reset/hide/unmount must release microphone resources.
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
  provides audio processing off the main thread in a secure context. Resampling
  and bounded transfers to the inference worker remain integration work.
  [ONNX deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
  needs separately served, version-matched WASM assets; threaded builds need
  cross-origin isolation. This is not a universal requirement for single-thread
  WASM. Header changes would also need testing against existing remote STT/TTS.
- [Chrome's lifecycle documentation](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
  describes freezing/discarding hidden pages. Background operation is out of
  scope, but a future mode must visibly stop on hide and require deliberate
  recovery. [WebKit's background audio report](https://bugs.webkit.org/show_bug.cgi?id=231105)
  also illustrates platform lifecycle differences; it is not a current universal
  Safari failure assertion. Screen lock/app switching are not reliable web
  listening guarantees. Existing Sous already cancels voice on hide/pagehide.
- [Autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
  applies to media and Web Audio. A wake detection callback is not a user gesture.
  An enable click may allow audio setup but does not establish every later
  asynchronous `Audio.play()` succeeds. [WebKit's policy explanation](https://webkit.org/blog/6784/new-video-policies-for-ios/)
  distinguishes a directly triggered gesture from a later callback. Existing
  playback failure recovery preserves the text response; a truly hands-free
  claim requires physical browser verification.

## 3. Whether detection is genuinely local

Porcupine inference and sherpa-onnx WASM inference can process ambient PCM on the
device. Downloading weights does not send ambient audio. Porcupine still requires
account authorization; its [current terms](https://picovoice.ai/docs/terms-of-use/)
describe usage-data reporting, so local audio inference is not a claim of zero
network traffic or permanently independent offline licensing.

A full openWakeWord browser port could be local. Its Python-over-WebSocket demo
is not. Web Speech is local only when `processLocally=true` is supported and
enforced. Default/prefixed speech recognition is not an acceptable privacy
shortcut. Continuous ElevenLabs transcription and voice-activity detection
alone are rejected: one uploads ambient sound and the other cannot recognize
an intentional wake phrase.

No detector was enabled or microphone accessed in this spike. Current Sous
still uploads only the finite, explicitly initiated recording to ElevenLabs;
the provider's retention policy remains as documented in VOICE.md.

## 4. Custom “Hey Sous” feasibility

Porcupine's [Model API](https://picovoice.ai/docs/model-api/porcupine/) accepts a
phrase and a `wasm` platform and returns a `.ppn`; creation uses a remote service,
while inference is local. English is supported; Polish is not listed. An English
wake phrase can precede an existing Polish request without changing STT language,
but Polish-accented activation has not been validated.

For sherpa-onnx, an English tokenized phrase is feasible in principle. For
openWakeWord, train a new model. For Web Speech, match recognized text with optional
biasing. None supplies a verified “Hey Sous” model/result for this project.

Inference: if Sous is pronounced like “soo”, “Hey Sous” is a short, low-diversity
phrase, with plausible confusion with “Hey Sue”. Picovoice's
[phrase guidance](https://picovoice.ai/docs/tips/choosing-a-wake-word/) recommends
at least six phonemes and diverse sounds. This increases evaluation risk; it is
not proof the requested phrase cannot work. Do not silently change the phrase.

## 5. Bundle and runtime cost

Published artifact/native figures below are **not measurements in Sous**.
Compressed transfer, browser heap/WASM memory, sustained CPU, battery and wake
latency were not measured. No candidate was installed or added to the bundle.

| Candidate | Cost evidence and implications |
| --- | --- |
| Porcupine | Published [English `.pv`](https://github.com/Picovoice/porcupine/blob/master/lib/common/porcupine_params.pv) is 962 KB; JS/WASM, processor and custom `.ppn` are additional. [Vendor FAQ](https://picovoice.ai/docs/faq/porcupine/) reports approximately 1 MB memory and under 4% of one Raspberry Pi 3 core for its standard native model; these are not browser totals. Exact shipped Web SDK cost was not audited. |
| openWakeWord | Mel frontend, embedding and phrase classifier plus ONNX JS/WASM runtime, capture and caches. [Upstream feature code](https://github.com/dscripka/openWakeWord/blob/main/openwakeword/utils.py) shows separate feature models and rolling buffers. No maintained full-browser bundle size or browser CPU result established. Training infrastructure is an additional development cost. |
| sherpa-onnx | [Published English model listing](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html): encoder 12M + decoder 1.1M + joiner 628K for FP32, or 4.6M + 272K + 160K for int8 (about 13.7M / 5M, rounded listing units). WASM/JS, tokens and any tokenizer assets are additional. The newer bilingual model documents 160/320 ms chunk latency; that is not measured wake-to-capture latency. Continuous streaming decode needs browser profiling. |
| Web Speech | No app-shipped inference runtime, but browser/OS language packs and continuous general ASR consume resources. Reviewed docs do not give a dependable pack-size/CPU/memory figure for the target devices. Zero npm bytes does not mean zero runtime cost. |

## 6. Licensing and shipping fit

Porcupine's [repository license](https://github.com/Picovoice/porcupine/blob/master/LICENSE)
is Apache-2.0. Separately, the current account/engine/model terms must be satisfied.
The [vendor FAQ](https://picovoice.ai/docs/faq/general/) currently offers an
enterprise trial and says there are no dedicated personal/non-commercial plans.
Its terms make trial access limited/revocable and require applicable fees for
ongoing services. A free AccessKey in a quickstart does not establish a durable
free deployed demo. No agreement or usable custom model was obtained. This
project has no established shipping arrangement for the candidate.

openWakeWord code and supplied weights have different licenses as described
above; sherpa-onnx framework permission cannot be extended to unclarified KWS
weights by assumption. Browser speech recognition adds no redistributed
third-party model to the repo but depends on browser/OS facilities and terms.

## 7. Reliability and existing integration review

Unmeasured risks include kitchen fan/water/pan noise, distant microphones,
English/Polish accents, ordinary nearby speech and TV, similar names, false wakes
and missed activations. Changing a threshold trades misses for false positives;
it does not demonstrate reliability. A false wake can capture unintended speech
and submit a cooking command, including deterministic completion.

Wake recognition also does not finish the request. `VoiceTurn` currently ends on
Stop or a 30-second limit; reliable hands-free operation needs local endpointing
and a no-speech timeout. Waiting 30 seconds per turn would be a poor cooking
interaction. Handoff must avoid clipping a request spoken immediately after the
wake phrase, exclude pre-wake ambient buffers from STT and prevent duplicate
turns. Detection must pause throughout capture/STT/thinking/TTS, discard delayed
callbacks and avoid speaker-tail echo before resuming. These needs are small in
concept but require real acoustic/lifecycle verification.

Reviewed `src/web/voice-client.ts`, `src/app/cooking-screen.tsx`,
`src/web/cooking-input.ts` and `src/web/cooking-service.ts`. A future integration
would activate the existing guarded start/finish path, preserving its captured
revision, cancellation, one-turn lock and the shared deterministic resolver.
No second agent, composer or provider pipeline is needed.

Spoken-output review: `spokenResponse` already returns the current instruction,
completion, or adaptive advice/clarification message rather than the whole recipe
or conversation. The adaptive schema requests short actionable advice and a
short clarification question; urgent advice starts with immediate action.
Existing EN/PL fixtures exercise concise advice.
No evidence here warrants truncating instructions (which could drop quantities,
time or safety detail) or changing the working agent/TTS presentation.

## 8. Recommendation and verification

**NO-GO for Task 6 wake-word implementation now.** Porcupine is the simplest
technical route, but its account/credential/shipping fit is unresolved under
current terms. openWakeWord needs a substantial browser port and training;
sherpa-onnx needs capture modernization and explicit model provenance. Forced-local
Web Speech is a narrow experimental desktop option with no dedicated wake-word
reliability evidence. None establishes a sufficiently reliable, legally
ship-ready, reasonably scoped “Hey Sous” path for this milestone.

Stop the wake-word portion as TASK6.md requires. No hands-free toggle, background
microphone, new dependency or integration seam is added. Task 7 remains untouched.

Reconsider only after a candidate has explicit distributable model/engine terms,
an actual custom phrase, a maintained local capture/runtime path, and physical
microphone evidence for activation, false wakes, endpointing, TTS feedback,
cleanup and resource use. Safari/mobile claims require those actual devices.
This is a future evidence gate, not additional work started by this spike.

Actual devices/browsers tested for wake detection: **none**. No physical
microphone, phone, Safari or noisy-kitchen test was performed; no wake latency,
accuracy, CPU or memory result is claimed. Earlier Task 5 synthetic speech
measurements remain valid for that pipeline, not for wake detection.

Regression checks for this documentation-only change are recorded in STATUS.md.
