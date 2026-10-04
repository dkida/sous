# Sous — Project Status

Last updated: 2026-10-05

Product source of truth: [PROJECT.md](PROJECT.md).

## Current milestone

[Task 1](TASK1.md), [Task 2](TASK2.md), and [Task 3](TASK3.md) are complete.
[Task 4](TASK4.md) is complete: the responsive web interface exposes the existing
cooking agent. Task 5 is complete; the user reports voice is working. Task 5.1
English/Polish support is complete, including live Polish cooking and provider
verification. Task 5.2 and the subsequent instruction, ingredient voice, spoken
quantity and mobile interaction refinements are complete. The preview retains
the active cooking session. English remains the public demo default. Task 6
Phase 1 is complete with a **NO-GO** decision for wake-word implementation in this
milestone; Phase 2 was not started. Push-to-talk remains available.
[Task 6.2](TASK6-2.md) (recipe quality and pantry awareness) was found specified
but never implemented; it was implemented on 2026-10-05 as the last product
change before deployment. See the section below. **Mistral Small 4
(`mistral-small-2603`) is now the default production reasoning model**; Gemma is
no longer the default.

Latest verification on 2026-10-05: **212 tests passed**, typecheck, isolated
production webpack build and whitespace checks passed. Responsive cooking was
verified at 390 × 844, 430 × 932 and 360 × 800, including simulated keyboard space
and all voice state layouts. Physical phone/Safari, microphone and noisy-kitchen
checks remain pending as detailed below. Task 7 release preparation is now in progress;
public deployment and human release gates are not yet verified.

## Production reasoning provider — Mistral Small 4 (2026-10-05)

**Final configuration**:
- **Provider and model:** `LLM_PROVIDER` defaults to `mistral` and `LLM_MODEL`
  to `mistral-small-2603` (Mistral Small 4, Apache 2.0 open weights, Mistral's
  hosted chat-completions API).
- **Settings:** temperature 0.2, 8192 max tokens, 120 s timeout, default
  reasoning behaviour.
- **Credential:** `MISTRAL_API_KEY`, server-side only.
- **Render:** `render.yaml` sets the same provider and model explicitly and
  prompts for `MISTRAL_API_KEY` and `ELEVENLABS_API_KEY`. `GEMINI_API_KEY` is no
  longer declared or needed.
- **Not yet verified:** the live Render deployment itself.

**Native JSON Schema in production**:
- `LLMProvider.generate(prompt, contract?)` gained an optional contract
  argument.
- `CookingAgent` passes `responseContracts.proposal`, `.recipe` or `.adaptive`
  with every request. These are the existing native schemas, unchanged in
  strictness.
- Mistral sends the contract as
  `response_format: {type: "json_schema", json_schema: {name, schema, strict: true}}`.
- Production Mistral never uses prompt-only mode. Responses are still parsed and
  checked by the unchanged Sous validators and domain rules.
- Gemma and Flash-Lite ignore the contract and keep prompted JSON.

**Alternates**:
- Gemma 4 and Gemini Flash-Lite stay implemented but non-default, selectable
  only with `LLM_PROVIDER=gemma` or `gemini-flash-lite` plus `GEMINI_API_KEY`.
- A leftover `GEMMA_MODEL` no longer changes the default.
- There is no automatic fallback.
- Gemma was not removed, because benchmarks, tests and the alternate path use
  it, so removal would not be trivial.
- Historical Gemma and Flash-Lite benchmark results are unchanged.

**Benchmark harness**:
- `mistral-native-schema` is now exactly the production provider.
- `mistral` keeps its recorded meaning: prompt-only, via a wrapper that drops
  the contract.
- Shared setup lives in `src/benchmark/providers.ts`.

**Verification**: 253 tests pass.
- **New or updated tests:**
  - The default resolves to Mistral and `mistral-small-2603`.
  - Only `MISTRAL_API_KEY` is needed; Gemini/Gemma credentials are not.
  - Model IDs must be pinned.
  - A default-configured agent sends the `dish_proposal`, `recipe` and
    `adaptive_action` schemas, in that order.
  - The CLI default path runs end to end through a mocked Mistral endpoint that
    requires a strict schema on every request.
  - The client import graph may not reference `MISTRAL_API_KEY` or the Mistral
    API host.
- **Checks:** typecheck and `git diff --check` pass.
- **Production build:** the webpack build passes in a disposable copy without
  `.env` files, built with a sentinel `MISTRAL_API_KEY`. `.next/static` contains
  no sentinel value, `MISTRAL_API_KEY`, Mistral API host, model ID,
  `GEMINI_API_KEY` or `ELEVENLABS_API_KEY`. The sentinel value appears nowhere
  in the build output, and the Mistral API host appears only in the server
  bundle.
- No live model calls were made.

`PROJECT.md` now names Mistral Small 4 as the reasoning model and in the stack.

## Task 6.2 — Recipe quality & pantry awareness

Implemented 2026-10-05. Before this, `docs/TASK6-2.md` existed only as an
untracked specification: no commit, branch, stash or worktree contained an
implementation.

**Availability model**, centralized in `src/domain/pantry.ts`:
- Ingredients the cook says they have are available but not mandatory.
- The only assumed staples are water, salt, black pepper, and one cooking oil
  (neutral or olive). English and Polish base names are recognized.
- Everything else, including onion, garlic, butter, herbs, cheese, stock, tomato
  paste, purée, passata and other spices, is unavailable until the cook
  confirms it.

**Contracts**:
- `DishProposal` gained `assumedStaples` (must be policy staples, at most 4),
  `optionalAdditions` (at most 3; "better if you have", never part of the plan)
  and `shoppingAdditions` (at most 3; only when the cook offers to shop). Lists
  may not overlap, and additions may not be staples. All three default to empty
  lists, so older proposal shapes stay valid.
- Recipe validation now rejects any step whose text uses salt, black pepper or
  cooking oil without referencing a matching structured ingredient. Matching is
  whole-word in English and Polish, so "salted water", "bell pepper" and "boil"
  do not count. Water is assumed but not enforced, because pasta water and
  similar unmeasured uses need no structured ingredient. The rule applies at
  generation and after every adaptation.
- A generated recipe may not contain one of the proposal's optional additions
  (exact-name guard).
- Adaptive `ingredient_change`, `scale_servings` and `cooking_problem` actions
  may carry `ingredientAvailability`: one entry per introduced ingredient (a new
  substitute or an additional ingredient), with basis either `assumed_staple`
  (the name must be in the policy) or `cook_confirmed` (the evidence must quote
  the cook's own words). The agent keeps the cook's statements — the original
  ingredient list plus every adaptive message — and rejects any action that
  introduces an unconfirmed ingredient. State is left untouched. A same-name
  quantity correction or an omission (`replacement: null`) needs no entry. The
  quote is checked as an exact substring; whether it really refers to that
  ingredient is not machine-verified.
- The native response schemas mirror these fields.

**Prompts**: one shared availability block is used by the proposal, recipe and
adaptive prompts.
- Proposal: plan a sensible dish rather than combine everything; keep sparse
  ingredients simple; the dish must be cookable without unconfirmed additions;
  shopping only when the cook offers.
- Recipe: only available, staple and shopping ingredients; every staple used is
  structured and referenced; technique guidance ("examples, not a checklist:
  keep simple food simple"); prose quantities must agree with structured ones,
  including per-portion splits.
- Adaptive: the context now includes `cookStatements`, `assumedStaples` and
  `unconfirmedSuggestions`; when an ingredient is missing, prefer omission, then
  available ingredients or staples, then asking.
- No food-specific rules were added.

**UI and CLI**: the existing proposal view and the CLI list assumed staples,
optional additions and purchases, with English and Polish labels. This was not
visually checked, because rendering a proposal needs a live model call. Voice
formatting is unchanged and reads the structured staples.

**Tests**: 252 pass (238 before, plus 14 Task 6.2 tests in
`src/application/pantry-awareness.test.ts`). Existing fixtures that added
ingredients now state their availability.
- Typecheck passes.
- A secret-free production webpack build in a disposable copy passes.
- `git diff --check` passes.
- No live model calls were made.

**Scenario runner**: `npm run bench:quality -- --provider <name> --output
<file>` runs scenarios A–E (pasta/cream, plus banana, eggs and bread, shopping
allowed, Polish) and the missing-paste and burning-onion checks. That is at most
12 requests. I dry-ran it offline with networking disabled; the owner then ran
it live (see below).

**Live quality check** (owner-run, Mistral Small 4 with native schema, one
sample each, 12 requests; [review](benchmarks/2026-10-05-task62-quality/REVIEW.md)):
- 11 of 12 responses were accepted; 6 of 7 scenario flows completed.
- The banana was omitted, eggs and bread stayed simple, and shopping produced 2
  purchases.
- Missing tomato paste was handled by omission (no invented purée), and burning
  onions by heat control (no invented second onion).
- The Polish recipe was rejected because it seasoned with black pepper that was
  not a structured ingredient. That is the staple rule working as intended.
- Minor issues: "ice water" for blanching, and optional extra parmesan beyond
  the stored total.
- Other providers were not run.

**Remaining from the specification**:
- The live check above is a single-sample smoke test, not the full evaluation;
  Polish recipe generation was not accepted in it.
- Shopping intent is left to the model; nothing deterministic detects it.
- Whether a recipe uses only the cook's ingredients is not machine-checked,
  because free-text ingredient lists can't be matched reliably. Only staple
  references, optional-addition names and adaptive additions are enforced.
- Spec test "voice ingredient input reaches the same planning behavior" is
  covered by the existing path (voice transcript → same `proposeDish`), not by
  a new test.

## Task 7 — Feature freeze / release preparation

Started 2026-10-05. No UI, cooking semantics, provider architecture, voice or
language features changed. No later feature milestone started.

**Source discrepancy, resolved 2026-10-05:** Task 6.2 had been specified but
never implemented. It was implemented as the last product change before
deployment (see the Task 6.2 section above); its live qualitative evaluation is
pending.

Production audit preceded changes; see [audit and runbook](release/DEPLOYMENT.md).
The app needs a Render Node web service, one process/instance, server-only provider
keys and public HTTPS. Session cookies are Secure in production, HttpOnly and
SameSite=Strict. In-memory flows are lost on restart/redeploy; multiple workers
cannot share them. Free idle sleep would also lose them.

Prepared [render.yaml](../render.yaml): one Starter instance, pinned Node 22.18.0,
manual deploys, npm clean install / webpack build, PORT binding, root health check,
secret prompts. Starter billing choice remains pending. Health checks establish
reachability, not provider function. [Environment template](../.env.example)
contains names and empty placeholders only; local secret files were not changed.

**Provider truth (superseded 2026-10-05):** Mistral Small 4 is now the default
and the Blueprint setting; see "Production reasoning provider" above. Earlier
note: local config has key names present but no model/provider selectors;
application default was then Gemma gemma-4-26b-a4b-it. Prior STATUS
records interactive Flash-Lite checks. The Blueprint then selected
gemini-flash-lite / gemini-3.5-flash-lite for public-demo latency; no Render
runtime selection has been verified. Gemma remains supported behind LLMProvider;
ElevenLabs Scribe v2 / Flash v2.5 and EN/PL remain intact.

Prepared the external-reader [README](../README.md),
[demo scenario and 60–120 second recording outline](release/DEMO.md),
[submission draft](release/SUBMISSION.md), and
[exact phone/Natalia handoff](release/HUMAN-CHECKS.md).
Final public screenshots are pending; previous local screenshots are not
relabeled as public release evidence. No video or Natalia result is fabricated.

**Deployment blocker:** no Render CLI/token or accessible signed-in session.
The dashboard opens at Sign In to Render. No public service/URL has been supplied
or created; no paid instance was purchased. Access and completed source location
were requested. The public HTTPS walkthrough, cookies, browser isolation,
restart recovery, live EN/PL voice, microphone and actual speaker checks remain
unverified. Physical phone/Safari/Android and Natalia observations remain pending.
Task 7 is **not complete** and the release gate remains open.

Final automated checks on the current checkout: **228 tests passed**, 0 failed,
0 skipped (212/212 also passed before concurrent benchmark additions and after
fresh installation); `npm ci --include=dev` passed
with 0 reported vulnerabilities; `npm run typecheck`, secret-free production
`npm run build -- --webpack`, `git diff --check`, release whitespace/link checks
and the existing client-boundary test passed. Production browser JS contained no
provider/credential configuration identifiers or model IDs. Approved execution
resolved sandbox subprocess EPERM for the two CLI tests and npm binary install
check. No live providers were used. The build/install ran in a disposable copy
without environment files; the preview/session was not rebuilt/reset.
Concurrent external Mistral benchmark-only additions were preserved; they are not
Task 7 feature work or part of app provider selection. Final tests/typecheck/build
were repeated on the current source; the source remained stable during those
checks. Mistral benchmark credentials are not required for Render cooking/voice.
Full evidence and pending public gates: [release verification](release/VERIFICATION.md).

## Mistral open-weight benchmark spike (2026-10-05)

- Narrow spike, not a migration or Task 7 feature. Added `MistralProvider` behind
  the unchanged `LLMProvider.generate(prompt)` boundary, defaulting to the pinned
  Apache 2.0 open-weight Mistral Small 4 (`mistral-small-2603`) on Mistral's hosted
  chat-completions API. Settings match the Task 3.6 baseline: temperature 0.2,
  8192 max output tokens, 120-second timeout, prompted JSON, default reasoning
  behaviour; reasoning chunks are discarded and errors are sanitized.
- Benchmark-only: `selectProvider`, the web app and the CLI cannot select Mistral.
  `npm run bench:inference` gained an opt-in `--providers` list (default remains
  `gemma,gemini-flash-lite`) and reads `MISTRAL_API_KEY` / `BENCH_MISTRAL_MODEL`.
- Every current scenario prompt hash differs from the 2026-10-04 records (prompts
  were refined after Task 3.6), so Mistral results are only comparable with
  baselines re-run in the same benchmark.
- `npm test` — all 228 tests passed (212 previous plus 16 new, mocked HTTP only).
  `npm run typecheck` passed.
- Live run: 45 sequential requests (3 repetitions × 5 scenarios × Gemma 4,
  Flash-Lite and Mistral Small 4), one prompt hash per scenario, with no
  access or quota failures. Successes: Gemma 13/15 (two 120 s timeouts),
  Flash-Lite 14/15, Mistral 10/15 (recipe 1/3, missing paste 1/3, burning 2/3).
  Mistral's median latency was 0.5–1.4 s for proposals and adaptive turns and
  4.1 s for one valid recipe, against 10–88 s for Gemma. Every failure was
  rejected atomically, leaving state and history unchanged.
- Post-run diagnostics traced Mistral's recipe and missing-paste failures to a
  recurring omission of the required step `ingredientIds` field. Not reliable
  enough as-is; native JSON schema was not tested. No winner was selected and
  no provider default changed. See
  [the spike report](benchmarks/2026-10-05-mistral/REPORT.md).
- **Final model experiment before release: native-schema Mistral.** Exactly 15
  new Mistral Small 4 requests, and no other model was called. The only change was
  Mistral's strict native JSON Schema (`response_format: json_schema`). The
  schemas mirror the existing proposal, recipe and full adaptive-action-union
  validators, keeping every required field including step `ingredientIds`. Sous
  parsing, validation and domain rules are unchanged and still run afterwards.
  Prompt hashes are identical to the prompt-only run.
- Result: **12/15 accepted, 11/15 also passing the state-transition check**,
  against 10/15 for prompt-only. The `ingredientIds` omission was eliminated:
  0 of 15 responses omitted it, and recipes went from 1/3 to 3/3.
  - Remaining failures: three domain-applicability rejections (an unreferenced
    added ingredient, and a duplicate added "Onion" twice) and one scaling
    response that left unused parmesan unscaled.
  - Semantic review of every response found invented ingredient availability in
    6/6 missing-paste and burning-onion responses: unlisted tomato purée as a
    substitute, and assuming a second onion is available.
  - 2/3 recipes say "N g parmesan over each serving" against an N g stored
    total, which contradicts structured state.
  - Latency: 0.6–4.0 s medians, with all failed trials included.
- **Recommendation B:** Mistral Small 4 remains unsuitable, and model
  experimentation stops for this release. No production default, prompt or
  domain rule changed; the provider decision is left to the owner.
- Native-schema verification: `npm test` passed all 238 tests (10 new: schema
  vs validator agreement, provider schema request, rejected-text recording).
  Typecheck, the production build and `git diff --check` passed. None of
  these makes live inference calls.

## Mobile cooking interaction refinement before Task 7

Implemented on 2026-10-05. Task 7 remains unstarted.

- At phone widths (600 px and below), the existing Ask Sous composer and
  deterministic Done / next action share one fixed bottom interaction area.
  Idle text, mic and send fit on one row, with short EN/PL placeholders; focusing
  the same textarea expands it for typing. Enter, Shift+Enter, IME handling,
  submission locks and all voice callbacks retain their existing implementation.
  Ingredient entry, proposal and completion keep their existing treatment.
- Mobile cooking spacing is tighter around the masthead, headline, quantities,
  plan update and secondary recipe context. Full actionable instructions and
  model-generated plan messages remain intact; adaptive/domain behavior is unchanged.
- Decorative “SOUS / JEDNO DANIE, OD POCZĄTKU DO KOŃCA.” / English footer is hidden
  only during active mobile cooking. No replacement decoration was added. Wide
  desktop/tablet rules and the desktop footer/composer stay in flow.
- Mic, send, Stop, Cancel and Done retain at least 48 px touch targets on mobile.
  Status, recognized speech and accessible errors stay in the same composer.
  A ResizeObserver reserves the measured bottom panel height plus a 16 px gap,
  including expanded input, listening Cancel and error rows, so final content
  scrolls clear of the controls. Safe-area bottom padding, viewport-fit=cover,
  resizes-content and a VisualViewport keyboard inset support reduced keyboard
  space without disabling pinch zoom.

Verification:

- Real retained Polish cooking preview inspected at **390 × 844**, **430 × 932**
  and **360 × 800**. At initial scroll position, Ask Sous, mic and Done were visible;
  the complete tomato instruction and **250 g** quantity remained prominent.
  Idle panel measured 126 px. No horizontal page overflow was observed.
- Opened full recipe ingredients and scrolled to the end at 360 px: Start over
  cleared the fixed panel (content bottom 642 px, panel top 674 px). Secondary
  content remains scrollable. No recipe progression, generation or reset was made.
- Typed a draft with Shift+Enter, then simulated keyboard space at **360 × 440**:
  the focused 88 px textarea, enabled send, mic and Done stayed inside the viewport.
  Cleared the temporary draft after verification; no message was submitted.
- A temporary localhost fixture rendered the actual CookingScreen/composer with
  mocked voice state callbacks for listening, transcribing, thinking, speaking
  and error. All controls fit at 360 × 800; Stop/Cancel were reachable, targets
  measured 48 px high, and reserved padding tracked panel growth. No provider or
  microphone calls were made in this visual fixture.
- Desktop **1280 × 900** retained the full composer, normal action-strip flow,
  large typography, recipe context and visible decorative footer.
- Existing **212 tests passed**, typecheck, isolated production webpack build and
  `git diff --check` passed. Build output was kept separate from the live preview.
- Evidence: [390 px cooking](design/mobile-cooking-verification/cooking-390.jpg),
  [430 px cooking](design/mobile-cooking-verification/cooking-430.jpg),
  [listening](design/mobile-cooking-verification/listening-360.jpg),
  [speaking](design/mobile-cooking-verification/speaking-360.jpg),
  [error](design/mobile-cooking-verification/error-360.jpg),
  [desktop](design/mobile-cooking-verification/desktop.jpg).
  Physical phones, Safari/iOS browser chrome, virtual keyboards and nonzero
  device safe-area insets remain unverified; viewport resizing is a simulation.

## Final focused product refinement before Task 7

Implemented on 2026-10-04 without starting Task 7.

- Generated and adaptive RecipeStep objects now require a separate short imperative
  `headline` (prefer 2–5 words, validated maximum 8) and full `instruction`, with
  explicit EN/PL examples in the shared generation rules. Missing/verbose headlines
  fail validation before state changes; detailed instructions are never truncated.
  The cooking UI renders these fields directly with restrained responsive `clamp()`
  typography and wrapping. Old retained development snapshots can still render
  their full instruction until a fresh plan is generated.
- Ask Sous uses the exact neutral EN/PL placeholders requested.
- Initial ingredient entry uses the same ruled composer and VoiceTurn/MediaRecorder/
  ElevenLabs STT lifecycle. Stop produces an editable ingredient draft; the existing
  explicit proposal action starts generation. Both languages, typed fallback,
  permission denial, STT failure, cancellation (including late results), duplicate
  start/finish and cleanup are covered. Pre-session token issuance is limited to
  explicit entry mode with a same-origin browser Origin and creates no cooking flow.
  No acknowledgement TTS, extra generation path or continuous listening was added.
- Current-step speech preserves the complete instruction and supplements only
  missing known quantities for the current step's structured ingredient references.
  Common EN/PL numeric/word quantities, inflections and partial uses avoid awkward
  duplication. Null quantities stay unknown; unrelated recipe ingredients, timer
  numbers and temperatures cannot become ingredient amounts. Polish fallback uses
  concise quantity labels for arbitrary names. Repeat/current/next-step speech
  shares this formatter; adaptive advice/clarification keeps its existing TTS path.
  English “what now?” is also an exact deterministic current-step command.

Verification:

- `npm test`: **205 tests passed** (14 additional focused regressions). Two existing
  mocked CLI subprocess tests required approved execution outside the sandbox's
  `spawnSync EPERM` restriction. No live providers are used by the test suite.
- `npm run typecheck`, production `npm run build -- --webpack` and
  `git diff --check` passed. Production build used an isolated temporary source
  copy with the installed dependencies and no environment files, preserving the
  active preview's build output.
- Manually exercised a temporary browser harness rendering the actual CookingScreen,
  composer, VoiceTurn and browser STT/playback functions against the actual HTTP
  handlers, cooking service, live Flash-Lite and ElevenLabs. Native MediaRecorder
  captured synthetic EN/PL fixture speech via Web Audio; no physical microphone
  speech or ambient audio was used. The harness and provider override remained
  outside the application source.
- Polish fixture: “Mam 200 gramów makaronu, pomidory, cebulę i śmietanę.” Scribe
  returned an editable ingredient list (with “dwieście”); edited it, submitted the
  existing proposal action and accepted the generated recipe. The screen showed
  **UGOTUJ MAKARON** above the full instruction. Spoken “co teraz?” and “powtórz”
  both reached TTS with the same actionable **200 g makaronu** instruction, returned
  to idle without a voice error and kept the current step unchanged.
- English fixture: “I have 200 grams of pasta, tomatoes, an onion and cream.”
  Scribe returned an editable draft; edited it, used the same proposal action,
  and verified the English proposal and recipe flow.
- Inspected desktop and 390×844 mobile ingredient/cooking layouts. No horizontal
  overflow was observed; mic controls were at least 56×56 px, and the Polish
  action stayed compact above the complete cooking detail.
- Evidence: [Polish transcript review](design/refinement-verification/polish-ingredient-review.jpg),
  [Polish cooking](design/refinement-verification/polish-cooking.jpg),
  [mobile cooking](design/refinement-verification/mobile-polish-cooking.jpg),
  [English listening](design/refinement-verification/mobile-english-listening.jpg),
  [English transcript review](design/refinement-verification/mobile-english-review.jpg),
  [English cooking](design/refinement-verification/english-cooking.jpg),
  [retained TTS instructions](design/refinement-verification/spoken-instructions.json).
- Physical microphone speech, physical phones, Safari and noisy-kitchen recognition
  remain unverified by the agent. These functional synthetic checks do not establish
  real-world microphone accuracy or latency.

### Adaptive progression speech correction

Browser feedback exposed a remaining functional gap: natural completion reports
reach `reconcile_progress`, but adaptive TTS previously read only the model's
acknowledgement (“Przechodzimy do pomidorów”) even after the structured state
advanced to a step with a complete 250 g tomato instruction. The preview reload
fix alone did not address this path.

Speech now compares the authoritative current step ID before and after the
operation. When an adaptive response advances cooking, it speaks the acknowledgement
followed by the complete new instruction through the existing current-step
quantity formatter. Same-step advice, plan adjustments and clarification keep
their existing message behavior. Final completion stays a completion response.
An acknowledgement already containing the complete spoken instruction is not
repeated; no extra model request is made to compose speech. The formatter also
recognizes “pomidory koktajlowe” / “pomidorów koktajlowych”, so the full 250 g
instruction does not trigger a duplicate quantity label.

- Added six regression cases: EN/PL adaptive progression with embedded or omitted
  instruction quantities, final-step adaptive completion, and an acknowledgement
  already containing the complete instruction. Voice integration tests run through
  actual cooking and retained-speech HTTP handlers with mocked providers, checking
  the full instruction, one quantity, timing, progression and deterministic repeat.
- **212 tests passed**, typecheck, isolated production webpack build and
  `git diff --check` passed. Existing advice, clarification, deterministic commands,
  STT failures, cancellation, duplicate/stale guards and playback checks still pass.
- Live browser verification used the actual CookingScreen/VoiceTurn/MediaRecorder
  with a controlled two-step recipe fixture and synthetic Polish speech: “Dodałem
  cebulę i czosnek na patelnię.” Real ElevenLabs STT → one live Flash-Lite adaptive
  reconciliation → real ElevenLabs TTS → browser playback succeeded. Speech was:
  “Świetnie, cebula i czosnek zostały dodane. Przechodzimy do dodania pomidorów.
  Wrzuć na patelnię 250 g pomidorów koktajlowych i smaż wszystko razem przez około
  4 minuty, od czasu do czasu mieszając, aż pomidory zaczną pękać i puszczać sok.”
  It included 250 once, reached the tomato step, and returned to idle without a
  voice error. No physical microphone or ambient audio was used.
- Evidence: [transition screen](design/adaptive-speech-verification/polish-transition.jpg),
  [actual generated speech](design/adaptive-speech-verification/response.mp3),
  [speech and resulting fixture state](design/adaptive-speech-verification/result.json).
  The temporary harness did not modify, advance or reset the user's active cooking
  session. Task 7 remains unstarted.

### Preview speech correction

The live preview retained an obsolete WebCookingService instance across development
reloads, so a tomato step with a canonical 400 g quantity still used the earlier
instruction-only speech handler. The server now re-creates the transport service
with current code and shares its retained flow map, preserving the recipe, current
step, revisions, duplicate-request guards and existing agents. New flows use the
current provider factory and recipe-generation prompt. No quantity or tomato count
is inferred: the observed live recipe specifies **400 g tomatoes**.

Added a regression that replaces obsolete handlers while retaining the tomato
step; Polish current/repeat both produce **400 gramów**, make no model call, retain
state/revision, reject duplicate/stale requests and share reset semantics. The
existing preview accepted typed “powtórz” and stayed at step 3 without an error.
`npm test`: **206 passed**; typecheck, isolated production webpack build and
`git diff --check` passed. Actual microphone playback of this retained session is
left for the user to verify; no live recipe reset or regeneration was performed.

## Task 6 — Wake-word feasibility spike

Completed the required research before writing application code on 2026-10-04.
The full eight-part assessment, primary sources and decision are in
[WAKE_WORD_FEASIBILITY.md](WAKE_WORD_FEASIBILITY.md).

- **NO-GO; wake-word work stopped.** Local browser detection is technically
  possible, but no reviewed candidate establishes a reliable, legally ship-ready,
  reasonably scoped custom “Hey Sous” mode for this personal open-source project.
  No wake-word technology was selected or installed; no hands-free UI was added.
- **Candidates:** Porcupine Web offers packaged local inference and custom WASM
  keywords. Its current enterprise trial/ongoing service terms and browser
  AccessKey exposure leave the shipping arrangement unresolved. openWakeWord's
  upstream browser example sends ambient audio to Python; a genuinely local
  implementation needs a port and training. Its code is Apache-2.0 but supplied
  models are CC BY-NC-SA. sherpa-onnx has a real local WASM KWS demo and custom
  tokenized phrases, but its deprecated capture/lifecycle needs modernization
  and the reviewed pretrained weights lack established redistribution terms.
  Forced-local Web Speech is experimental general ASR, without verified custom
  wake reliability. Primary references are linked beside each finding in the report.
- **Browser limitations:** Chrome 139+ documents local Web Speech; runtime
  feature/language-pack checks remain necessary. Reviewed compatibility data has
  no local-processing Safari/iOS or Chrome Android support; Firefox is preview
  only. Porcupine lists Safari, but no candidate was physically verified in Sous.
  HTTPS/localhost permission, worker/WASM assets, conditional cross-origin
  isolation, hidden-page suspension and asynchronous autoplay need handling.
  Background operation remains out of scope.
- **Privacy:** no ambient microphone capture or provider calls were made during
  this spike. Existing finite push-to-talk recording/STT behavior remains as
  documented in VOICE.md. Local inference must not be confused with zero network
  activity; default Web Speech and Python streaming cannot satisfy the local
  ambient-detection claim. No new privacy claim is made for an unimplemented mode.
- **Cost/reliability:** report distinguishes published model/native figures from
  browser measurements. Porcupine's published English parameter file is 962 KB
  before runtime/custom keyword; sherpa's English model components total about
  5M int8 or 13.7M FP32 before WASM/JS. No wake latency, CPU, memory, battery or
  acoustic accuracy was measured. The short phrase, accents, kitchen noise,
  false activations, capture handoff, automatic endpointing and TTS echo need
  physical verification before calling the mode reliable.
- **Existing voice/spoken-output review:** the shared resolver already handles
  EN/PL deterministic commands. Speech selects the current instruction,
  completion or adaptive message; the prompt already requests short actionable
  advice and urgent action first. No evidence warrants dropping cooking details
  or changing VoiceTurn, CookingAgent, the composer, ElevenLabs or providers.
- **Actual wake devices/browsers tested: none.** No physical microphone, phone,
  Safari or noisy-kitchen validation is claimed. Earlier synthetic Task 5 tests
  establish the existing pipeline only. Task 7 was not read or started.

Verification on 2026-10-04:

- `npm test`: **191 tests passed**. The sandbox initially blocked two existing
  mocked CLI subprocess tests with `spawnSync EPERM`; the full unchanged suite
  passed with approved execution outside that restriction. No live providers
  or credentials are used by these tests.
- `npm run typecheck` and `npm run build -- --webpack` passed in an isolated
  temporary source copy using the existing installed dependencies and no local
  environment files. This avoids rebuilding the active preview's `.next` output.
- `git diff --check` passed; the new report was also checked for trailing whitespace.
- Documentation-only result; no application code, dependencies or credentials
  changed. Push-to-talk, typing and existing cancellation/error guards are intact.

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
  Task 7 public deployment is pending; multi-instance hosting remains unsupported.
- Timer scheduling is not implemented.
- Voice requires local ElevenLabs configuration. The configured account’s browser
  STT/TTS path has been verified with synthesized input; physical-device validation
  remains.
  Batch STT waits for recording completion; short TTS MP3s are buffered before
  playback. Provider CORS/quota/accuracy and browser microphone/autoplay policies
  can affect availability and latency. Hiding the page cancels local voice work.
  Voice also supports initial ingredients as an editable draft; proposal acceptance
  retains its button flow. See [VOICE.md](VOICE.md).
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
- Wake-word/hands-free implementation after the Task 6 NO-GO; background listening.
- Database and authentication. Deployment is the current Task 7 release work.

## Remaining Task 5 verification

Real STT, TTS, adaptive and clarification voice turns and phase latency are verified
with synthesized input. The user reports Task 5 voice is working. Physical Polish microphone speech,
Safari and physical mobile devices have not been tested by the agent; no
ambient microphone audio was submitted during automated/manual agent checks.
Task 6 feasibility is complete with a NO-GO; no wake-word mode is implemented.
