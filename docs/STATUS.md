# Sous — Project Status

Last updated: 2026-10-04

Product source of truth: [PROJECT.md](PROJECT.md).

## Current milestone

[Task 1](TASK1.md), [Task 2](TASK2.md), and [Task 3](TASK3.md) are complete.
[Task 4](TASK4.md) is complete: the responsive web interface exposes the existing
cooking agent. Task 5 is complete; the user reports voice is working. Task 5.1
English/Polish support is complete, including live Polish cooking and provider
verification. Task 5.2 is implemented and passes automated checks; the preview
is restored, with remaining manual mobile checks documented below. English remains the public
demo default. Task 6 has not been started.

## Task 5.2 — Unified cooking composer

Implemented the UI refinement with one square, ruled Ask Sous composer inside the
existing dark Pass interaction area. Text, microphone and send share the existing
screen callbacks. The separate voice panel, permanent instructional text and
“Heard” transcript are removed. Recognized speech temporarily occupies the
composer during processing/playback and clears at idle, cancellation or failure.

- Listening shows a restrained accent rule, concise status, generous Stop action
  (finishes/sends) and Cancel. Transcribing/thinking/speaking are inline statuses;
  speaking exposes Stop. Recoverable errors keep the text draft and controls
  available. Detailed existing voice errors remain accessible.
- Mic/send targets are at least 56×56 px. Text enables the accent send action.
  Enter sends; Shift+Enter inserts a newline; IME composition cannot accidentally
  submit. Busy/voice requests retain the existing lock and sequencing protection.
- Removed Show current step from primary controls because the instruction is
  already prominent. Typed/spoken repeat/current commands still work. Done · next
  follows the composer on desktop and remains a single large mobile bottom action.
  Final voice playback retains its Stop control even after cooking completes.
- CookingAgent, domain semantics, provider selection and ElevenLabs integration
  are untouched by Task 5.2. No continuous listening, chat history or Task 6 work.

Verification on 2026-10-04:

- Preview recovery: cleared the expired in-memory session after the dev-server
  restart and restored the user's ingredient draft. Verified Find something to
  cook is enabled. Disabled buttons now show a blocked cursor; the waiting cursor
  is reserved for an actual cooking request in progress.
- `npm test`: **191 tests passed**; `npm run typecheck` and `npm run build` passed.
  Re-ran all 191 tests and typecheck before committing. A fresh production build
  also passed with `npm run build -- --webpack` in an isolated temporary copy,
  avoiding disruption of the active preview. The earlier default Turbopack build
  passed as well.
  Added composer interaction checks for keyboard/IME behavior, send availability,
  active transcript lifecycle, listening/speaking actions and recoverable errors.
  Client/server boundary verification also traverses the new TSX component.
- Used an isolated temporary harness rendering the actual CookingScreen/composer,
  with native MediaRecorder fed synthesized test audio. Requests reached the real
  local cooking/voice endpoints, live Flash-Lite and ElevenLabs STT/TTS. Test-only
  transport holds exposed intermediate states; no debug controls enter the app.
- Manually verified typed two-line input (Shift+Enter then Enter), listening,
  Stop-to-submit, transcribing, temporary recognized question, thinking, actual
  browser speech playback and Stop-to-cancel. Transcript cleared, and text/mic
  controls were available afterward. See
  [desktop thinking](design/task52-verification/desktop-thinking.jpg),
  [listening](design/task52-verification/desktop-listening.jpg),
  [transcribing](design/task52-verification/desktop-transcribing.jpg),
  [voice thinking](design/task52-verification/desktop-voice-thinking.jpg),
  [speaking](design/task52-verification/desktop-speaking.jpg).
- Inspected 1440×1000 desktop and 390×844 mobile layouts. Mobile had no horizontal
  overflow and mic/send measured 56×56 px. A local-server interruption produced
  an inline recoverable voice error with the instruction unchanged and controls
  available: [mobile fallback](design/task52-verification/mobile-network-error.jpg).
- The temporary browser harness server stopped during mobile verification. Its
  tab became a connection-error `data:` page, which browser URL policy prevents
  automation from operating. The regular demo was restarted and reopened at
  `http://127.0.0.1:3005/`. Verified expired-session recovery, restored the user's
  ingredient draft, and observed the resulting live Polish cooking screen with
  the unified composer. Final mobile listening/typed recovery and manual
  Done · next checks are not recorded as verified yet; the user's active cooking
  session was left intact.
- Physical microphone speech, physical phones and Safari were not tested by the
  agent; the user reports Task 5 voice is working. No ambient audio or secrets
  were submitted during these checks.

## Task 5.1 — English / Polish

- Added a restrained EN / PL header switch and a small typed copy dictionary.
  Static UI, status/voice/error messages, clarification labels, completion,
  accessibility labels, counts, and ingredient presentation support both languages.
  The document language follows the selection. English is the initial default.
- Language is fixed presentation context on the retained web flow and existing
  `CookingAgent`, not duplicated domain state. Proposal, recipe and adaptive
  prompts explicitly request the selected language for all human-readable output.
  Structured JSON keys, IDs, action types and standard unit codes remain unchanged.
  Gemma, Flash-Lite and `LLMProvider` architecture remain intact.
- Selection locks during requests and once a flow/proposal exists, including after
  completion. Start over / Cook something else removes the flow and unlocks it.
  Reload restores the retained flow language. No locale persistence, routing,
  accounts, automatic detection or recipe translation/regeneration was added.
- Polish deterministic input (`gotowe`, `zrobione`, `dalej`, `powtórz`,
  `pokaż bieżący krok`, `co teraz`, `co dalej`) resolves to the same guarded domain
  commands. `tak` / `nie` stay adaptive clarification answers. Behavior never
  depends on translated button labels.
- The existing ElevenLabs integrations explicitly use STT `eng` / `pol` with
  Scribe v2 and TTS `en` / `pl` with Flash v2.5. TTS language is resolved from the
  authoritative retained session. Credentials, token authentication, microphone
  lifecycle, cancellation, request/revision guards and playback are shared.
  No new environment variables or credential changes were required.

Verification on 2026-10-04:

- `npm test`: **187 tests passed**. Added English/Polish rendering, prompt/context,
  Polish recipe/clarification/advice/adaptation, immutable language, shared domain
  quantity/progression operations, stale guards, localizable errors, ingredient
  formatting, STT/TTS configuration and Polish voice-failure coverage.
- `npm run typecheck` and `npm run build` passed; `git diff --check` passed.
- Manually exercised the production build with live Gemini Flash-Lite entirely
  in Polish: ingredients → “Jajecznica na oleju” → four cooking steps →
  “Mam też cebulę.” → Polish clarification → “Tak, dodaj cebulę.” → updated plan →
  current-step read → typed “Gotowe.” → button progression → Polish completion.
  Reload preserved Polish; reset unlocked the switch; English entry still rendered
  correctly. This was a simulated cooking workflow, not preparation of a meal.
- Inspected desktop 1440×1000 and mobile 390×844 / 320×740 views. The header switch,
  dark interaction strip and fixed mobile actions remain usable; no horizontal
  overflow was observed. Narrow-phone labels use the existing ruled layout.
  [Desktop](design/task51-verification/desktop-polish.jpg),
  [mobile cooking](design/task51-verification/mobile-polish.jpg),
  [mobile completion](design/task51-verification/mobile-complete.jpg),
  [narrow entry](design/task51-verification/mobile-entry-320.jpg).
- Real ElevenLabs Polish TTS generated a synthetic input phrase; the shared STT
  function recognized “Mam też cebulę”. The actual cooking endpoint replied
  “Czy chcesz dodać cebulę do jajecznicy?” and its retained speech handle produced
  Polish MP3 audio. STT **587 ms**, agent **842 ms**, buffered TTS **253 ms**;
  total **1.68 s**, excluding input synthesis/capture and response playback.
  This check used Node with the browser STT function and real HTTP endpoints;
  it did not test physical Polish microphone speech or browser playback.
  [Measurements](design/task51-verification/live-metrics.json) and
  [generated response](design/task51-verification/polish-response.mp3).
- Provider documentation rechecked for explicit ISO language hints and Polish
  model support; see [VOICE.md](VOICE.md). No secrets were displayed or modified.

## Completed

- Implemented Task 5 push-to-talk in the existing dark Pass / Mise en place strip,
  with idle/listening/transcribing/thinking/speaking/error labels, secondary
  transcript, Speak, Finish & send, Cancel, and Stop speech controls. Typed
  interaction and deterministic buttons remain functional after voice failures.
- Verified current ElevenLabs documentation before choosing authentication/APIs.
  The server issues supported single-use `batch_scribe` tokens; the browser sends
  short MediaRecorder captures directly to Scribe v2. Server-side HTTP TTS uses
  Flash v2.5 and forwards MP3 audio for ordinary browser playback. Long-lived keys
  never enter browser code. Speech endpoints resolve retained cooking-response
  handles rather than accepting arbitrary text. See [VOICE.md](VOICE.md).
- Voice transcripts use the same web `send` function, cooking HTTP endpoint,
  retained `CookingAgent`, clarification context and domain operations as typed
  messages. Exact done/complete and current/next/repeat commands share one web
  resolver and bypass inference. CookingAgent, LLMProvider, Gemma/Flash-Lite
  adapters, provider selection and the cooking domain are unchanged.
- Added per-flow revisions and bounded duplicate-request IDs around existing
  server busy/expected-step/agent stale-state guards. A recording cannot apply
  after another tab changes the same step or clarification. Browser turn generations,
  abort signals and response sequences reject stale asynchronous callbacks.
  Speech requests reject stale handles and synthesis invalidated during preparation.
- Added microphone track cleanup on finish, cancellation, errors, hide/teardown
  and late permission grants; a 30-second capture limit and 5 MB cap; one voice
  turn/audio playback at a time; and concise sanitized errors. TTS failure never
  rolls back an already successful cooking operation. No wake word/background
  listening or Task 6 behavior was added.
- Added development-only voice timing for capture/completion, STT, cooking-agent
  HTTP latency, TTS-to-first-playback and total turn duration. Metrics contain
  fixed phase/outcome labels and times, never audio, transcript, prompts or keys.
  Documented `ELEVENLABS_API_KEY` and optional `ELEVENLABS_VOICE_ID`, browser/server
  responsibilities, provider/browser limitations and remaining live checks.

- Added a subordinate Start over control beneath cooking recipe metadata, using
  the existing server reset action and clearing both input fields. Verified the
  fresh ingredient screen, eight HTTP tests, typecheck and production build.
- Addressed Task 4 manual-testing findings: retained the desktop ingredient sidebar,
  made its full list primary (expanded by default on desktop), and reduced servings
  to secondary metadata. Mobile retains an ingredient disclosure. Removed forced
  cooking-area height and placed adaptive feedback immediately after the current
  step quantities, independently of sidebar expansion or viewport height.
- Corrected same-ingredient quantity changes in the domain: update the canonical
  ingredient in place and preserve its ID, including normalization of a legacy
  model response that invents a replacement ID. Remaining references use the
  canonical ID. Quantity corrections do not create substitution records or a
  duplicate recipe ingredient. Prior amounts and the completed-step prefix are
  retained separately in `CookingSession.quantityChanges` and sent to the agent
  for subsequent reasoning. Completed instructions remain unchanged.
- Kept the existing adaptive action schema. The agent now instructs quantity
  corrections to reuse the original ID/name/unit and specify the new total,
  account for previous preparation/use, and revise all affected remaining steps.
  Partial/invalid corrections roll back amount, instructions and history together.
  Same-named duplicates disguised as additions are rejected. True substitutions
  retain their existing behavior; used quantities still do not auto-scale.
- Added a presentation-only ingredient formatter: “1 carrot” / “3 carrots”, natural
  count-unit plurals, readable measured quantities and unspecified amounts. Canonical
  quantities, names and units remain unchanged by display formatting. Added ten
  regression tests across domain, HTTP/agent continuity and formatting.

- Implemented the Task 4 ingredient → proposal → acceptance → cooking → adaptation
  → completion web flow in the selected “Pass — Mise en place” direction, using
  `DESIGN.md` and `docs/design/sous-reference.png` as the visual sources of truth.
- Added one Node.js `/api/cooking` route with GET state retrieval and validated
  POST commands for proposal, acceptance, current step, completion, adaptation,
  and reset. All cooking operations delegate to `CookingAgent` and the domain
  store. `LLMProvider` and provider adapters are unchanged; quantity-correction
  semantics were subsequently extended in the follow-up recorded below.
- Retained one agent (and its existing `CookingSessionStore`) per browser flow in
  a process-global service. The agent retains pending proposals and clarification
  context across requests. An HTTP-only, SameSite cookie identifies the flow;
  production uses a Secure cookie. Reset releases that flow and its store.
- Kept provider selection and credentials behind a `server-only` composition root,
  using existing `LLM_PROVIDER`, `LLM_MODEL`, `GEMMA_MODEL`, and `GEMINI_API_KEY`
  configuration. No provider/model is selected by browser code, no credentials
  were inspected or changed, and no inference optimization was introduced.
- Built a flat cream cooking surface with charcoal controls, orange accents,
  strong rules, numbered progress, prominent instructions and real quantities.
  Long instructions are split at sentence/clause boundaries for typography only;
  every instruction word is retained. Current-step queries never advance.
- Designed mobile cooking separately: vertical instruction/quantity hierarchy,
  no desktop work rail, and fixed, 64 px tall completion/current-step controls.
  Text questions use the dark action strip. The latest adaptive response is
  secondary to the current state and distinguishes changes, advice and questions.
- Added understandable errors, manual retries, missing-session recovery, disabled
  controls during requests, expected-step checks, and per-flow concurrency guards.
  API responses are uncached, snapshots are detached, and diagnostics are not
  returned. Invalid operations preserve confirmed cooking state.
- Added seven web/HTTP tests covering the complete flow, inference/malformed-output
  failures and retries, invalid/stale operations, session isolation/loss,
  clarification continuity, concurrency, origin checks, private cookies, and the
  client import boundary. Existing application/domain tests remain intact.

- Bootstrapped a minimal Next.js/TypeScript project with a placeholder page.
- Defined `Ingredient`, `Recipe`, `RecipeStep`, `CookingSession`, `Substitution`,
  and `CookingTimer` in `src/domain/types.ts`.
- Implemented a framework-independent, in-memory `CookingSessionStore` with
  session creation, retrieval, starting, and current-step completion.
- Added the `ready → cooking → completed` lifecycle, ordered step progression,
  and rejection of invalid or repeated transitions.
- Protected stored state by copying recipe inputs and returned session snapshots.
- Added 14 unit tests covering lifecycle transitions, invalid operations,
  recipe progression requirements, snapshot protection, and session isolation.
- Documented setup, commands, and domain behavior in the README.
- Added a small replaceable `LLMProvider` interface and a hosted Gemma adapter
  using Google's Gemini API (`gemma-4-26b-a4b-it` by default, configurable with
  `GEMMA_MODEL`). Credentials remain in the untracked local environment file;
  requests use an API-key header and errors never echo remote diagnostics.
- Added a framework-independent `CookingAgent` for ingredient input → one dish
  proposal → acceptance → structured recipe → cooking session → ordered progress.
- Kept state ownership in `CookingSessionStore`: the model returns untrusted
  JSON, and the application validates it before explicit create/start operations.
  Current/next-step queries and step completion require no model calls.
- Added runtime recipe validation at both the application and store boundaries:
  required fields, servings, quantities, unique IDs, instructions, references,
  and rejection of extra state fields. Recipes must match the accepted dish and
  servings. Invalid output leaves state untouched and allows a manual retry.
- Added concurrency guards and retained expected-step-ID checks for progression.
- Added `npm run dev:agent` for the complete terminal flow, with acceptance,
  current-step questions, completion/advancement, help and exit commands.
- Expanded deterministic tests with mock LLM providers and HTTP transports;
  tests never load secrets, call the real API or consume model credits.
- Added active-session adaptive reasoning through `CookingAgent.adaptCooking`.
  Gemma receives recipe, servings, ingredients, completed/current/remaining steps,
  used ingredient IDs, substitutions, and pending clarification context. Session
  identity, lifecycle metadata, and timers are excluded from adaptive context.
- Added a strict discriminated runtime schema for `ingredient_change`,
  `scale_servings`, `cooking_problem`, `reconcile_progress`, and `clarification`.
  No action accepts a replacement session/recipe or arbitrary state fields.
- Added explicit store operations `changeIngredient`, `scaleServings`,
  `adjustCookingInstructions`, and `reconcileProgress`. Each validates the action,
  works on a detached copy, checks recipe/history invariants, and commits once.
  Invalid actions and inference failures cannot leave partially changed state.
- Ingredient changes can record replacements or omissions (`replacement: null`),
  revise remaining instructions, and add ingredients at explicit quantities.
  Unused originals are removed; used originals remain for historical references.
- Serving scaling multiplies unused numeric quantities by new/old servings,
  preserving unspecified amounts and model-selected exceptions. Already-used
  ingredients retain their recorded values. Compensation uses distinct additional
  ingredients and revised current/future instructions chosen by Gemma.
- Completed step instructions/references are immutable. Used ingredients cannot
  auto-scale or be silently overwritten; explicit quantity corrections preserve
  their previous snapshot separately. Adaptations cannot insert, delete, reorder,
  or edit completed steps. Existing substitution records are retained.
- Cooking problems can return advice without any state changes or explicit
  current/future instruction adjustments. Clarification changes no session state;
  its context is retained in the agent for the next natural-language reply.
- Progress reconciliation requires a contiguous prefix starting at the current
  step, with exact evidence quotes from the latest user message for each whole
  step. It cannot skip, repeat, or complete unknown steps; invalid batches roll back.
- Routed other messages during active cooking through adaptive reasoning in the
  existing CLI. `done` and `next`/`now` retain deterministic behavior. Added
  overlapping-request and stale-session checks for adaptive model responses.
- Added 50 tests for adaptive application/domain behavior and the CLI, including
  the missing-tomato-paste acceptance scenario, immutable history, quantity
  scaling, compensation, advice, instruction changes, reconciliation, clarification,
  invalid/malformed output, failures, retries, concurrency, and snapshot isolation.
- Added isolated development/CLI timing instrumentation for proposal, recipe, and
  adaptive interactions. Summaries report total, provider request, structured
  parsing/validation, and application/domain durations using `performance.now()`.
  Only fixed labels, outcomes, and elapsed times are logged to stderr. Reporting
  failures cannot affect results; deterministic commands emit no timing summary.
  No prompts, model output, error diagnostics, credentials, or headers are logged
  by the instrumentation. Provider settings and cooking behavior are unchanged.
- Added an experimental Gemini Flash-Lite adapter behind the unchanged
  `LLMProvider.generate(prompt)` boundary, and explicit `LLM_PROVIDER` / `LLM_MODEL`
  configuration. Gemma 4 remains the existing/default open-weight provider;
  `GEMMA_MODEL` compatibility is retained. No fallback or winner selection is added.
- Added a repeatable fixed-context inference benchmark, sanitized model-availability
  check, and separate native JSON Schema probe. The main comparison keeps
  temperature 0.2, max output tokens 8192, the 120-second timeout, and prompted JSON
  identical for both providers. Model-specific thinking defaults remain unchanged.
  CookingAgent, the provider interface, domain semantics, and Gemma adapter were
  preserved; their source hashes were checked before and after implementation.

## Validation

Task 5 live-provider follow-up (2026-10-04):

- The user configured the ElevenLabs key through local environment files. Verified
  configuration by presence only and successfully exercised the default voice.
  No secret values were displayed or modified by the agent.
- Four real in-app browser voice turns passed using synthesized test utterances
  encoded through Web Audio/MediaRecorder as WebM/Opus: missing tomato paste,
  burning onions, carrot clarification, and spoken “yes”. Used the actual browser
  `VoiceTurn`, direct ElevenLabs STT with server-issued batch tokens, existing
  cooking HTTP/agent path and ElevenLabs TTS browser playback. Browser CORS and
  single-use authentication worked; every turn traversed all five active/idle
  states and playback ended normally. No cooking/provider architecture changed.
- Missing-paste input removed the unused paste and spoke the result. Burning-onion
  input at the saute step spoke immediate advice to remove the pan from heat.
  Clarification spoke “Do you want to use all three carrots in the recipe?” and
  retained one carrot; recognized “Yes” then updated the quantity to three and
  revised future instructions. Completed preparation/pasta history was preserved.
- One sample each: STT 536–856 ms; cooking HTTP 895–1231 ms; TTS to actual playback
  306–808 ms. The sum of these post-capture phases was 1843–2658 ms. Capture took
  836–5848 ms; recording completion 2.5–5.4 ms. Activation to first audio was
  3078–7961 ms, including synthetic utterance duration and fixture preparation.
  These functional samples use Flash-Lite selected only through server environment
  overrides; they are not a representative microphone/noisy-kitchen benchmark.
  Full table and method: [VOICE.md](VOICE.md); [records](design/task5-verification/live-metrics.json).
- Simulated browser STT failure preserved the entire live session and restored
  controls; [record](design/task5-verification/live-failure.json). Actual Sous
  desktop/mobile Speak → Cancel restored typing/buttons without submitting
  ambient microphone audio. Typed fallback continued to reach the same agent.
  Configured-state evidence: [desktop listening](design/task5-verification/desktop-listening.jpg),
  [mobile listening](design/task5-verification/mobile-listening.jpg).
- All 178 mocked tests passed again; typecheck, production build, diff and
  client-secret checks passed. Temporary browser test assets were removed.
- Physical microphone spoken input, acoustic speaker output and Safari/physical
  mobile-device behavior remain unverified. The browser checks verified actual
  audio playback events through completion, rather than human assessment of sound.
  The user was asked to try “repeat” through Speak/Finish on their own device.
  Task 6 has not been started.

Task 5 implementation (2026-10-04):

- `npm test`: all 178 tests passed (155 existing plus 23 voice tests). New tests
  mock providers/network and cover shared typed/STT routing, adaptation,
  clarification questions/voice answers, authoritative TTS text, STT/TTS failure
  semantics, deterministic commands/completion, duplicate/concurrent submissions,
  stale same-step/session/synthesis responses, microphone denial/late permission,
  capture cleanup, playback URL cleanup, automatic recording limit, origin/session
  checks and sanitized errors. Tests never load credentials or consume credits.
  Existing CLI subprocess tests required approved execution outside the sandbox.
- `npm run typecheck`, `npm run build`, and `git diff --check` passed. Production
  includes Node.js cooking, token and speech routes. Client import-boundary tests
  include ElevenLabs configuration identifiers; browser bundles contain no
  ElevenLabs/LLM credential or provider configuration identifiers.
- Manually tested the development app with Flash-Lite selected only through
  process environment overrides: ingredients → proposal → acceptance → cooking.
  With ElevenLabs configuration absent, Speak on desktop/mobile returned the
  concise voice-unavailable error and restored all cooking controls. Typed
  missing-paste input then updated the remaining recipe and removed the unused
  paste. Typed `next` retained the current step; Done advanced. A subsequent typed
  three-onion correction updated the quantity/current/future instructions while
  retaining completed pasta. No browser warning/error logs were observed.
- Inspected desktop 1440 × 1000, mobile 390 × 844 and narrow mobile 320 × 740.
  The cream instruction surface, dark strip, restrained accent and fixed mobile
  deterministic dock are preserved. Voice controls remain in the strip with
  56 px mobile Speak targets; both mobile sizes had no horizontal overflow.
  Evidence: [desktop fallback](design/task5-verification/desktop-fallback.jpg) and
  [mobile fallback](design/task5-verification/mobile-fallback.jpg).
- **Initial implementation verification had no key.** Presence-only checks of the normal local
  environment found no `ELEVENLABS_API_KEY`; configuration was requested through
  the existing untracked `.env.local` workflow. No secret values were printed,
  inspected, changed or committed. Real microphone→STT, TTS playback, complete
  adaptive voice scenarios A–C and real voice latency were therefore not verified.
  Missing-configuration fallback was verified in-browser; denial, STT failure and
  TTS failure were verified with mocks. No real provider latency numbers are
  claimed for that initial run. The live-provider follow-up above supersedes this
  configuration limitation; physical-device capture and Safari remain unverified.


Task 4 manual-testing follow-up (2026-10-04):

- Investigated the visible Chicken and Vegetable Pasta session: the full list
  contained “1 piece carrot” and “3 piece carrot” while the current step referenced
  three carrots. The previous store path appended replacements and retained any
  original referenced by a completed step. Reproduced this state shape in focused
  fixtures, including completed preparation and a model-generated replacement ID.
- `npm test`: all 155 tests passed (145 prior plus ten new regression tests).
  Tests cover corrections before/after preparation, original/fresh IDs, repeated
  corrections, snapshots, immutable completed instructions, stale/partial/invalid
  corrections and atomic history rollback, duplicate additions, scaling guards,
  canonical HTTP snapshots, next-request reasoning context and natural formatting.
  Existing mocked CLI subprocess tests ran with approved execution outside the
  sandbox restriction; no live requests or credential loading occur in tests.
- `npm run typecheck`, `npm run build`, and `git diff --check` passed. Browser
  bundle inspection found no credential/configuration identifiers or model IDs.
- Live production browser verification used the existing configurable Flash-Lite
  adapter through server environment overrides. After completed carrot preparation,
  a request for three carrots produced one canonical “3 carrots” entry in both
  the full ingredient list and relevant current-step quantities. Sous explicitly
  directed preparation of the extra two carrots rather than claiming they were
  already prepared. Reload retained the correction; deterministic completion
  advanced to the revised carrot instruction in the first verification session.
- Checked the final build at actual 1440 × 1000 desktop, 390 × 844 mobile, and
  320 × 740 mobile viewports with no horizontal overflow. Desktop keeps the full
  list at the right, with secondary servings metadata; mobile disclosure works.
  Adaptive updates and a live clarification (“How many carrots would you like
  to use in total?”) appeared 24 px after the quantities. Expanding/collapsing the
  desktop list did not move that feedback gap. UP NEXT follows the feedback;
  the cooking grid has no forced minimum height. No console errors/warnings
  were observed on the final build. Compared palette, rules and hierarchy with
  the original Pass reference; no new visual direction was introduced.
- Evidence: [desktop carrot correction](design/task4-verification/carrot-correction-desktop.jpg),
  [mobile carrot correction](design/task4-verification/carrot-correction-mobile.jpg),
  [desktop clarification](design/task4-verification/clarification-desktop.jpg).
- Quantity corrections retain the canonical name/unit. Ambiguous unit conversions
  are rejected rather than appended as another ingredient. Formatting uses a
  bounded English food-noun/unit vocabulary; unknown nouns retain a readable
  count-unit fallback. Free-form model prose is displayed intact.
- Provider interfaces/settings, inference optimization, voice, persistence,
  authentication and Task 5 remain unchanged/out of scope.


Task 4 web UI (2026-10-04):

- `npm test`: all 145 tests passed (138 existing plus seven web/HTTP tests).
  The existing mocked CLI subprocess checks required approved execution outside
  the sandbox's `spawnSync` restriction. Tests never load credentials or make
  live inference requests.
- `npm run typecheck`, `npm run build`, and `git diff --check` passed. Production
  build includes a static home page and dynamic Node.js cooking API. Inspection
  of browser bundles found no credential/configuration identifiers or model IDs.
- Manually verified the final production build in the in-app browser, with
  Flash-Lite selected solely through server environment overrides. Ingredient
  input → Tomato Parmesan Pasta proposal → acceptance → all seven cooking steps
  → completed state → cook-again reset succeeded. All model calls remained
  server-side, with the existing credential loader; Gemma remains supported and
  remains the default when no provider override is configured.
- At step four, “I don't have tomato paste after all” revised the instruction to
  add garlic without paste, removed the unused paste from the active ingredients,
  and left the first three completed steps intact. The concise “Plan updated”
  response and revised instruction were visible. Reload restored that state.
- On mobile, “How much garlic should I use in this step?” returned advice to use
  two cloves without changing the current step. Show current step retained the
  same step; Done advanced deterministically through the final serving step.
- Server restarts during verification produced the missing-session error; Start
  again recovered to ingredient entry. Boundary tests also verify malformed
  outputs, provider failures, stale completion and invalid operations with
  unchanged snapshots. Those failure cases were not forced through live inference.
- Visually compared desktop (1440 × 1000) and mobile (390 × 844) against the primary
  reference. Preserved palette, typography, flat rules, quantities, numbered rail
  and dark action strip. Corrected overly long mobile headlines using intact
  instruction clauses and kept cooking actions reachable in a fixed bottom dock.
  Also checked cooking at 320 × 740 with no horizontal overflow. Mobile input,
  adaptive response, completion and return to ingredients worked. No browser
  console warnings/errors were observed on the final build.
- Browser evidence: [desktop adaptation](design/task4-verification/desktop.jpg),
  [mobile cooking](design/task4-verification/mobile.jpg), and
  [mobile completion](design/task4-verification/completed-mobile.jpg). These are
  verification snapshots, not replacement design references.
- No voice, timer scheduling, persistence, authentication, deployment, model
  optimization or Task 5 work was implemented.


Newly available ingredient follow-up (2026-10-04):

- Investigated a user CLI report where `oh i have garlic too` and `i have garlic`
  failed during mushroom-pasta preparation. In a matching fixed live Flash-Lite
  context, the old prompt produced an `ingredient_change` with an empty original
  ID and an unsupported `additional_ingredient` action. Both were rejected without
  changing state. These reproduce the failure class; the user's original raw
  model responses were not available.
- Corrected only adaptive protocol guidance: additions use the already-supported
  `cooking_problem` remaining-plan adjustment with `additionalIngredients` and
  current/future `stepUpdates`. Replacement/omission requires an existing original
  ingredient ID; ambiguous availability can request clarification. No action
  schema, store behavior, provider boundary, or deterministic CLI command changed.
- Added five regression cases: addition with immutable history and no invented
  substitution, clarification/follow-up, rejection of the two reproduced invalid
  actions, and an experimental-provider CLI flow retaining garlic instructions.
  `npm test` passed all 138 tests; typecheck, production build and diff checks passed.
- Five live corrected fixed-context adaptive requests passed: both user phrases
  tested twice, plus a clarification's explicit two-clove follow-up. Observed total
  latency was 0.989–1.359 s. Completed pasta instructions, recorded quantity and
  completed-step IDs remained unchanged. Garlic was incorporated into current
  preparation and future sauté steps; no replacement was fabricated.
- Actual Flash-Lite CLI ingredients → proposal → recipe → completed pasta → garlic
  availability → follow-up → `next`/`done` succeeded. Proposal/recipe totals were
  0.970/1.415 s; adaptive totals were 1.080/0.919 s. `next` read adapted instructions
  without advancing, and `done` advanced to the sauté step.
- These are focused functional checks, not a new comparative benchmark. The
  comparison below used the earlier prompt and remains a historical measurement.
  Model-selected actions remain probabilistic; invalid output is still rejected
  atomically. Gemma was not live-retested for this correction. Credentials were
  neither inspected nor changed; no Task 4 work was performed.

Experimental inference benchmark (2026-10-04; not a migration or Task 4):

- Project-visible model listing and actual generation confirmed access to
  `gemini-3.5-flash-lite`. Compared it with `gemma-4-26b-a4b-it`, using the existing
  credential loader without inspecting or changing environment file contents.
- Completed 30 requests: three trials per scenario/provider, sequential paired
  requests with provider order alternating by repetition. No quota failures,
  timeouts, retries, or excluded main trials occurred. Each scenario had exactly
  one prompt hash across all six trials, confirming identical agent prompts.
- Recipe trials used a fixed accepted proposal; adaptive trials used independent
  fixed four-step recipe sessions. Missing/scaling had pasta and onion/garlic done;
  burning had only pasta done. This is a controlled comparison, not an end-to-end
  meal generated by each model. Prior single-session measurements are not pooled.
- Total latency, seconds — median (observed range), three trials in every cell:

  | Scenario | Gemma 4 | Gemini 3.5 Flash-Lite | Successes G / F |
  | --- | ---: | ---: | --- |
  | Proposal | 11.842 (9.038–12.436) | 0.731 (0.727–0.888) | 3/3 / 3/3 |
  | Recipe generation | 116.205 (85.246–117.837) | 2.167 (1.507–2.279) | 3/3 / 3/3 |
  | Missing tomato paste | 39.404 (33.875–51.720) | 1.139 (1.120–1.146) | 3/3 / 3/3 |
  | Scaling 2 → 4 | 36.760 (30.278–44.687) | 1.176 (1.013–1.190) | 3/3 / 3/3 |
  | Burning onions | 37.694 (24.038–42.673) | 0.967 (0.912–1.123) | 3/3 / 3/3 |

  Provider calls dominated latency (99.9963% of summed interaction duration).
  Per-scenario latency ranges did not overlap in this small sample, supporting a
  consistent difference rather than one anomalous request. Three trials do not
  establish tail latency, token-normalized throughput, or performance under other
  prompts/quota/deployment conditions. Provider spans include network/remote
  service, decoding and benchmark prompt fingerprinting; model compute and
  server queueing were not separately measured. No winner was selected.
- All 30 outputs passed structured validation and the fixture's transition and
  completed-history checks. Used quantities/instructions remained immutable.
  These structural checks do not prove culinary completeness or prose accounting.
- Qualitative review: both models produced appropriate proposals, workable paste
  omissions and urgent heat-control advice. All six scaling responses omitted
  compensating pasta/aromatics or a clear smaller-portion explanation after
  preserving the already-cooked 200 g pasta. All three Flash-Lite recipes omitted
  oil/fat for sauteing and salt/water from structured ingredients despite cooking
  prose relying on them. Some optional ingredient advice/persisted problem-step
  prose also lacked matching quantities/references. These caveats were recorded;
  application semantics were not changed to fix them in this benchmark task.
- Full medians for all four phases, every request's metrics/outcome, qualitative
  notes and raw validated synthetic output are saved in
  [the benchmark report](benchmarks/2026-10-04-flash-lite/REPORT.md),
  [request records](benchmarks/2026-10-04-flash-lite/requests.jsonl), and
  [qualitative review](benchmarks/2026-10-04-flash-lite/qualitative-review.json).
- Separate native JSON Schema proposal probe passed in 0.995 s, using
  `generationConfig.responseFormat.text` with `mimeType: APPLICATION_JSON` and
  schema. It returned untrusted JSON through unchanged `generate(prompt)` and
  existing agent validation. This supports a fixed constructor-level schema
  without an application redesign. No native schema is enabled in the baseline
  comparison or CLI. Per-request proposal/recipe/adaptive schema selection would
  require an explicit design decision because the current interface has no
  contract metadata; this is deferred. Native recipe/adaptive-union schemas were
  not tested. See [probe data](benchmarks/2026-10-04-flash-lite/native-schema-probe.json)
  and Google's [REST format reference](https://ai.google.dev/api/generate-content#ResponseFormatConfig).
- `npm test` — all 133 tests passed (108 previous plus 25 new tests).
  `npm run typecheck`, `npm run build`, and `git diff --check` passed. Tests use
  mocked HTTP and never load local credentials. The existing CLI subprocess
  sandbox restriction required approved execution. An initial CLI environment
  typing mismatch was corrected by passing explicit configuration fields.
- Gemma remains the default open-weight provider; opt-in is
  `LLM_PROVIDER=gemini-flash-lite LLM_MODEL=gemini-3.5-flash-lite`.
  No migration, winner selection, streaming, app optimization, UI/voice/persistence/
  auth/deployment, secret modification, or Task 4 work was performed.

Timing instrumentation validation (2026-10-04):

- `npm test` — all 108 tests passed, including the previous 103 tests and five new
  timing tests. The CLI integration test also checks summary format/count and
  excludes credentials/prompt content. Approved execution was used for the
  sandbox's existing CLI subprocess restriction; HTTP remains mocked throughout.
- `npm run typecheck`, `npm run build`, and `git diff --check` — passed.
- Total spans agent entry to prepared result/failure, excluding user think time
  and terminal output/reporting. Provider time includes HTTP/network latency,
  remote generation, and provider decoding. Parsing/validation is the structured
  application boundary; store defensive validation is included in application/
  domain work. Preflight and prompt/context preparation contribute to total.
- Failed phases retain elapsed duration; phases not attempted show `n/a`. Tests
  verify failures at provider, parsing/validation, and domain boundaries, unchanged
  result/error behavior, and logger failures that cannot break interactions.
- Live measurements through `npm run dev:agent` (milliseconds, one sample per
  interaction; no user think time included):

  | Interaction | Total | Provider request | Parse/validate | Application/domain |
  | --- | ---: | ---: | ---: | ---: |
  | Proposal | 10888.26 | 10886.92 | 0.62 | 0.09 |
  | Recipe generation | 56401.75 | 56399.94 | 1.02 | 0.67 |
  | Missing tomato paste | 84404.21 | 84401.78 | 0.89 | 1.38 |
  | Scaling to four (timed out) | 120001.35 | 120001.04 | n/a | n/a |
  | Onions starting to burn | 30578.75 | 30577.14 | 0.21 | 1.03 |

  The live omission changed the current instruction to skip tomato paste while
  retaining completed pasta and onion/garlic steps. `next` remained deterministic
  and emitted no timing summary. Scaling after those ingredients were used hit
  the existing 120-second provider timeout. Parsing and application operations
  were not attempted; `next` confirmed the unchanged current instruction. The
  burning-onion report succeeded with immediate advice to remove the pan from
  heat and add tomatoes. Three adaptive interactions were exercised (two
  succeeded, one timed out); a complete adapted meal was not measured.

  Provider calls accounted for more than 99.9% of each measured interaction.
  Successful parsing/validation took 0.21–1.02 ms and application/domain work
  0.09–1.38 ms. The dominant latency is inside the provider request boundary,
  including network/remote service time; these measurements cannot attribute it
  specifically to network, server queueing, or model computation. These are
  single-session samples, not a statistically representative benchmark.
  Credentials and environment file contents were not displayed or changed.
- No Task 4 work or performance optimizations were implemented.

Task 3 validation (2026-10-04):

- `npm test` — all 103 tests passed, including the unchanged 53 Task 1/2 tests.
  All HTTP and inference are mocked. The CLI subprocess test supplies a fictional
  credential and does not load environment files. The sandbox blocked subprocess
  output capture (`EPERM`); the complete suite passed with approved execution
  outside that restriction.
- `npm run typecheck` — passed.
- `npm run build` — production build passed. An initial build identified a missing
  `NODE_ENV` field in the CLI test's isolated child environment; this was corrected.
- `git diff --check` — passed.
- Live `npm run dev:agent`: sandbox network access initially failed; approved
  network access succeeded. Ingredient input → proposal → acceptance → recipe →
  deterministic `done`/`next` progressed through boiling pasta and sautéing garlic.
  At the tomato-paste instruction, `oh i dont have tomato paste, my bad` returned
  omission advice, and `next` read the adapted instruction to skip the paste.
  The exact combined tomatoes-and-paste instruction and preservation of completed
  history are verified by deterministic tests.
- Live scaling after pasta and garlic were cooked: the request for four servings
  returned sauce/cheese scaling and compensation guidance to cook another 200 g
  pasta and two cloves of garlic, rather than claiming those amounts were already
  cooked. `next` still read the current adapted instruction without advancing.
- Live cooking problem: burning garlic returned immediate guidance to remove the
  pan from heat and add tomatoes. `next` returned the same current instruction
  without advancing. After reconciliation, the tomato instruction included the
  urgent adjustment to add tomatoes immediately to stop the garlic from burning,
  confirming a persistent future instruction change.
- Live progress reconciliation: `I skipped the tomato paste and moved on.` was
  accepted and advanced to the canned-tomato instruction; `next` confirmed it.
- Not manually verified against live inference: replacement substitution (as
  distinct from omission), scaling before ingredient use, advice with no persistent
  instruction adjustment, clarification/follow-up, ambiguous reconciliation,
  and a complete adapted meal through its final step. These behaviors and invalid/
  failed model responses are covered by deterministic tests.
- Credentials were never displayed, edited, or committed. No `.env.local`
  contents were inspected or changed; only the existing CLI loader used it.

The following checks passed after Step 2 implementation:

- `npm test` — 53 tests passed, including the existing lifecycle/snapshot tests,
  acceptance, recipe validation, malformed output, retry, concurrency, progression,
  and provider error/credential handling.
- `npm run typecheck` — Next.js route type generation and TypeScript checks passed.
- `npm run build` — the production build succeeded.
- No lint script is configured.
- Live `npm run dev:agent` validation passed with the existing local credentials:
  ingredients → one hosted-Gemma proposal → `yes` → validated recipe → first step,
  `what do I do next?` / `now` / `next` returned the current instruction without
  advancing, and repeated `done` progressed through all five steps to completion.
- The initial sandboxed network call failed; the live check used approved network
  access. The first recipe-generation attempt also timed out at 60 seconds without
  creating a session. Raising the timeout to 120 seconds allowed the complete flow
  to succeed. Credentials were never displayed and `.env.local` was not modified.

## Current limitations

- Web sessions exist only in the server process. Reloads retain a flow while its
  process survives; restarts discard it. Separate workers/instances do not share
  sessions. Flows remain in memory until reset or process exit; there is no
  expiration scheduler or durable recipe history.
- One browser cookie identifies one flow, including across tabs. Concurrent
  operations are rejected; an out-of-date completion returns the latest state.
- The UI shows the latest adaptive response, not a conversation transcript. No
  structured per-step duration, heat level or readiness cue exists in the current
  recipe model, so separate heat/timer/readiness controls from the reference are
  omitted. Timing or heat written inside an instruction remains visible as prose.
- Very long instructions require scrolling on a phone; completion/current-step
  actions remain reachable in the bottom dock. Browser viewport emulation was
  tested, not physical devices, native keyboards or assistive technologies.
- Production cookies require HTTPS outside trustworthy localhost contexts.
  Deployment and multi-instance hosting are outside this milestone.
- Timer scheduling is not implemented.
- Voice requires local ElevenLabs configuration. The configured account’s browser
  STT/TTS path has been verified with synthesized input; physical-device validation
  remains.
  Batch STT waits for recording completion; short TTS MP3s are buffered before
  playback. Provider CORS/quota/accuracy and browser microphone/autoplay policies
  can affect availability and latency. Hiding the page cancels local voice work.
  Voice operates during active cooking; initial ingredients/proposal acceptance
  retain their existing text/button flow. See [VOICE.md](VOICE.md).
- Gemma JSON generation is prompted, not guaranteed by server-side constrained
  decoding. Runtime validation rejects malformed/incompatible responses;
  the user can retry. No automatic retries are implemented.
- Hosted inference latency and availability depend on model access and quota.
  The adapter times out after 120 seconds and preserves application state.
- A prior user CLI run returned HTTP 402 (depleted prepaid billing credits).
  The provider explains the Free Tier option alongside restoring prepaid credits;
  that error handling is covered with a mocked response. Task 3 live calls succeeded
  with the credentials available during this validation; that earlier billing
  failure was not reproduced.
- Ingredient use is conservatively inferred from completed step references.
  Partial use within a step is not measured. Already-used quantities remain locked
  for automatic serving scaling. Explicit same-ingredient quantity corrections
  update the active total with prior snapshots recorded separately; model-directed
  compensation uses distinct additional lots and remaining instructions.
- Culinary appropriateness, whether quoted user evidence implies a whole step
  was completed, and consistency of prose quantities with the structured plan
  depend on model reasoning. Runtime checks enforce valid shapes/references,
  ordered progress, and immutable recorded history; they do not prove these
  semantic judgments. Ambiguous inputs are prompted to request clarification.
- Changes fit within existing current/future steps; step insertion, deletion,
  and reordering are intentionally unsupported.
- Clarification context is local to one agent and cleared after successful
  adaptation or deterministic completion. No general conversation memory is added.

## Intentionally out of scope

- Timer scheduling and unrestricted model-directed state replacement.
- Hands-free use, wake words, always-on/background listening and Task 6.
- Database, authentication and deployment.

## Remaining Task 5 verification

Real STT, TTS, adaptive and clarification voice turns and phase latency are verified
with synthesized input. The user reports Task 5 voice is working. Physical Polish microphone speech,
Safari and physical mobile devices have not been tested by the agent; no
ambient microphone audio was submitted during automated/manual agent checks.
Task 6 has not been started.
