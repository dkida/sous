# Sous — Project Status

Last updated: 2026-10-04

Product source of truth: [PROJECT.md](PROJECT.md).

## Current milestone

[Task 1](TASK1.md), [Task 2](TASK2.md), and [Task 3](TASK3.md) are complete.
The next milestone is web cooking UI. Task 4 has not been started.

## Completed

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
- Completed step instructions/references and ingredients referenced by completed
  steps are immutable. Adaptations cannot insert, delete, reorder, or edit
  completed steps. Existing substitution records are retained.
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

- Sessions exist only in memory within each store instance and are lost when
  the instance or process is discarded.
- The placeholder web page is not connected to the session store.
- Timer scheduling is not implemented.
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
  Partial use within a step is not measured. Already-used quantities are locked;
  model-directed compensation requires separate ingredients in remaining steps.
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
- Voice, speech-to-text/text-to-speech, push-to-talk, hands-free use and wake words.
- Web UI integration, database, authentication and deployment.
- Task 4 / web cooking UI implementation.

## Next milestone: web cooking UI

Connect the existing cooking agent to a web cooking interface in the next
milestone. This milestone has not been started; no Task 4 work was implemented.
