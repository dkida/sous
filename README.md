# Sous

The product source of truth is [docs/PROJECT.md](docs/PROJECT.md).

Tasks 1–3 provide a text cooking agent with adaptive cooking and a terminal
interface over the framework-independent cooking domain. The web page remains
a placeholder.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 for the placeholder page.

```sh
npm test
npm run typecheck
npm run build
```

Tests use Node's built-in test runner with tsx to load TypeScript. Unit tests run
in one process with separate stores. The CLI integration test starts an isolated
child process with a fictional credential and mocked HTTP. All model calls and
HTTP requests are mocked: tests do not load local credentials, access the network,
or consume model credits.

## Text cooking flow

Set `GEMINI_API_KEY` in your untracked `.env.local`, then run:

```sh
npm run dev:agent
```

The CLI loads `.env.local` without modifying it. Never commit that file or your key.
Hosted Gemma uses Google's Gemini API, with `gemma-4-26b-a4b-it` as the default.
An optional `GEMMA_MODEL` environment variable selects another hosted Gemma model:

```sh
GEMMA_MODEL=gemma-4-31b-it npm run dev:agent
```

Gemma 4 remains the default open-weight provider. For experimental inference
comparisons only, select Gemini Flash-Lite without changing code or your secrets:

```sh
LLM_PROVIDER=gemini-flash-lite LLM_MODEL=gemini-3.5-flash-lite npm run dev:agent
LLM_PROVIDER=gemma LLM_MODEL=gemma-4-26b-a4b-it npm run dev:agent
```

`LLM_PROVIDER` accepts `gemma` (default) or `gemini-flash-lite` (experimental).
`LLM_MODEL` overrides the selected provider's model. With no override, Gemma
uses `GEMMA_MODEL` or `gemma-4-26b-a4b-it`; Flash-Lite uses
`gemini-3.5-flash-lite`. Both use the existing `GEMINI_API_KEY` loader. There is
no automatic provider/model fallback, winner selection, or migration.

The experimental adapter implements the unchanged `LLMProvider.generate(prompt)`
interface. Baseline requests use the same temperature (0.2), token limit (8192),
120-second timeout, and prompted JSON as Gemma. Model-specific default thinking
behavior is left unchanged. The agent, domain semantics, and state ownership are
the same for both providers; no streaming is added.

To check project-visible model IDs and run a controlled comparison:

```sh
npm run bench:models
npm run bench:inference -- --repetitions 3 --output docs/benchmarks/my-comparison
```

The benchmark calls the existing agent with fixed ingredient input, a fixed
accepted proposal for recipe generation, and independent fixed cooking sessions
for each adaptive scenario. It compares proposal, recipe generation, missing
tomato paste, scaling from two to four, and burning onions. Requests are paired
sequentially; provider order alternates each repetition. Prompt hashes must match
across providers and repetitions, but complete prompts are neither printed nor
saved. Each request records provider/model, all four durations, success/failure,
structured validity, transition/history checks, and validated synthetic cooking
output for manual culinary review. A successful request can still fail its
scenario check. Failed requests are recorded with unchanged-state checks.

Default repetitions are three (configurable from one to ten). Optional
`BENCH_GEMMA_MODEL` and `BENCH_FLASH_LITE_MODEL` overrides change benchmark models
without affecting the CLI default. The runner stops requesting a provider after
an access/billing/quota HTTP 402/403/404/429 failure and records completed trials;
timeouts count as failed trials without retry. Existing request logs are never
overwritten. Native structured output is excluded from the baseline comparison.

The separate `npm run bench:schema -- --output docs/benchmarks/my-schema-probe.json`
probe tests a proposal JSON Schema with Flash-Lite's optional constructor-level
schema configuration. It still returns untrusted text through the existing
provider boundary and uses the existing agent's validation. It does not redesign
the application or enable native schemas for normal CLI/benchmark requests.
Google documents [Flash-Lite model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
and [REST response-format/schema configuration](https://ai.google.dev/api/generate-content#ResponseFormatConfig).

See Google's [hosted Gemma documentation](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
for model availability. The provider uses the REST API and Node's built-in fetch,
so no inference SDK dependency is needed.

Example terminal conversation:

```text
User: I have pasta, onion, garlic, canned tomatoes and parmesan.
Sous: We can make Tomato Parmesan Pasta. ... Would you like to make it?
User: yes
Sous: Great. First, finely dice the onion and mince the garlic.
User: what do I do next?
Sous: Next, finely dice the onion and mince the garlic.
User: done
Sous: Next, heat olive oil...
```

Actual dishes and instructions depend on the model. `yes` accepts the proposal,
generates and validates a recipe, and starts cooking at its first step. `no`
allows new ingredient input before acceptance. `now`, `next`, `what do I do now?`,
and `what do I do next?` read the current instruction without advancing.
`done` completes the current step and advances; repeat until Sous confirms completion.
`help` lists commands and `exit` quits. Restart the CLI for a new meal.
Piped input is supported as well.

During cooking, other messages go to adaptive reasoning. For example:

```text
User: oh i dont have tomato paste, my bad
User: Can I use pecorino instead of parmesan?
User: We're actually cooking for four people.
User: The sauce is too thick.
User: I already chopped them and added them to the pan.
```

Sous can explain an ingredient replacement or omission, adapt remaining
instructions, scale unused ingredients, give immediate advice, reconcile clear
progress, or ask a follow-up question. Reply naturally to clarification questions.
Exact advice and adaptations come from Gemma; the application applies only
validated operations. `next` still reads the current instruction and `done`
still completes it without a model call. Failed adaptive requests leave state
intact; repeat your message or clarify it to retry.

Model failures or invalid JSON leave state intact. After a failed proposal,
enter ingredients again; after failed recipe generation, enter `yes` again.
There are no automatic retries or fallbacks to a different model family.

The CLI prints one concise `[timing]` summary to stderr for each proposal,
recipe, and adaptive request. Development-mode agents (`NODE_ENV=development`)
also enable these summaries; other agents are silent unless given a timing
reporter as the fourth constructor argument. Diagnostics contain only fixed flow
labels, success/failure, and durations, never prompts, model responses, errors,
credentials, or headers.

Timings use the monotonic `performance.now()` clock:

- `total`: agent method entry through result preparation or failure, excluding
  time waiting for user input and terminal output/reporting.
- `llm`: the complete `LLMProvider.generate` call, including HTTP/network latency,
  remote generation, and provider response decoding. This does not separately
  measure model compute time.
- `parse/validate`: structured JSON parsing, action/recipe/proposal validation,
  and accepted-proposal matching.
- `app/domain`: application state changes, explicit store operations (including
  their defensive validation), stale-state checks, and detached result snapshots.

Prompt/context preparation and preflight checks contribute to `total`; the phase
durations need not sum exactly to it. Failed requests include durations through
the failed phase; phases not reached show `n/a`. Reporting errors are ignored so
diagnostics cannot turn a successful interaction into a failure. Deterministic
`done` and `next` commands do not call the model or emit these summaries.

HTTP 402 means the API key's billing account has depleted prepaid credits,
according to Google's [API error reference](https://ai.google.dev/gemini-api/docs/generate-content/api-errors).
Google lists Gemma 4 as free on the [Free Tier](https://ai.google.dev/gemini-api/docs/pricing#gemma-4).
For free access, use a key from a Free Tier project in Google AI Studio, with
no linked billing account. Google's [billing guide](https://ai.google.dev/gemini-api/docs/billing)
also describes returning an existing project to the Free Tier by disabling its
billing; a separate project avoids affecting its other Cloud services.
Prepaid projects do not automatically return to the Free Tier when credits run
out. If you choose to retain prepaid billing, restore credits before retrying.
Changing ingredients or choosing another model with the same depleted billing
account will not resolve this billing error.

## Application and provider boundary

`src/application/cooking-agent.ts` exposes `proposeDish`, `acceptProposal`,
`getCurrentStep`, `completeCurrentStep(expectedStepId)`, and
`adaptCooking(userMessage)` for use without the
CLI or web UI. `LLMProvider` has a single `generate(prompt)` method returning
untrusted text; `src/infrastructure/gemma-provider.ts` implements it.

Gemma receives JSON context containing ingredient input, the accepted proposal
when generating a recipe, and `currentSession` (null before session creation).
Adaptive requests include the recipe, servings, ingredients, completed/current/
remaining steps, already-used ingredient IDs, substitutions, and any pending
clarification. Session IDs, timers, and lifecycle metadata are omitted. Current
step queries and explicit completion still require no inference.

The application requests JSON and parses it strictly, allowing a single JSON
markdown fence. It validates proposals and recipes at runtime before any session
write. Recipe validation checks required fields, quantities, unique IDs, ordered
steps and ingredient references, rejects extra fields, and requires the accepted
dish and servings. The domain store also validates recipes at its creation boundary.
Only `CookingSessionStore` creates, progresses, or adapts sessions. The model
cannot replace a session, choose its lifecycle status, or edit timers or history.

`src/domain/adaptive-action.ts` defines and validates these discriminated actions:

| Action | Payload and operation |
| --- | --- |
| `ingredient_change` | Original ingredient ID, replacement ingredient (null for omission), reason, remaining step updates and additional ingredients → `changeIngredient` |
| `scale_servings` | Positive integer servings, exceptions to scaling, remaining step updates and additional ingredients → `scaleServings` |
| `cooking_problem` | Advice plus remaining step updates and additional ingredients → `adjustCookingInstructions`; empty arrays mean advice only |
| `reconcile_progress` | Step IDs with exact quotes from the latest user message → `reconcileProgress` |
| `clarification` | A short question; no store mutation |

All actions require a non-empty `message`. Extra fields, unknown actions, invalid
quantities/references, new or completed step IDs, skipped progression, and
invented evidence are rejected. Operations validate on a copy and commit once;
an invalid action cannot leave a partially changed session. The agent rejects
overlapping operations and responses whose session context changed during inference.

Completed instructions and ingredient references stay unchanged. Any ingredient
referenced in a completed step keeps its recorded quantity and identity, even
when also referenced later. Scaling multiplies only unused numeric quantities
by the new/old servings ratio; unspecified quantities and explicit exceptions
remain unchanged. Gemma can add distinct ingredients with explicit quantities
and revise remaining instructions to compensate for amounts already used.
Substitutions are recorded, including omissions; used originals are retained
for historical references.

This is conservative ingredient tracking: partial use within a step is not
measured. Reconciliation accepts only a contiguous prefix beginning at the
current step, with quoted user evidence for each whole step. Whether the evidence
actually implies that the whole step happened, culinary suitability, and wording
of updated instructions depend on model reasoning. Ambiguous cases are prompted
to request clarification. Steps cannot be inserted, deleted, or reordered;
additional work must fit within current/future instructions.

The adapter rejects blocked, incomplete, or empty responses and uses a 120-second
request timeout. The API key is sent only in a header; remote error bodies and
transport diagnostics are never displayed.

## Domain

`src/domain/types.ts` defines ingredients (including quantities), recipes,
ordered steps, sessions, substitutions, and timers. Timer scheduling remains
outside this milestone.

`CookingSessionStore` in `src/domain/cooking-session-store.ts` stores session
snapshots in memory, independently of Next.js:

```ts
const store = new CookingSessionStore();
store.createSession("dinner", recipe); // ready, no current step
store.startSession("dinner"); // cooking, first step is current
store.completeCurrentStep("dinner", recipe.steps[0]!.id);
const session = store.getSession("dinner");
```

Completing a step advances to the next one; completing the final step marks the
session completed and clears the current step. The caller supplies the expected
step ID so a repeated request cannot accidentally advance another step. Invalid
operations throw without changing state; fetching an unknown session returns
`undefined`. Inputs and returned snapshots are copied to protect stored state.

Each store instance is separate. Sessions are lost when the instance or process
is discarded and are not shared between processes. No route or UI is wired to
the store yet.
