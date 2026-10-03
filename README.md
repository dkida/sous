# Sous

The product source of truth is [docs/PROJECT.md](docs/PROJECT.md).

Step 2 adds a text cooking agent and terminal interface to the existing
framework-independent cooking domain. The web page remains a placeholder.

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

Tests use Node's built-in test runner with tsx to load TypeScript. They run in
one process; each test creates its own store. Model calls and HTTP requests are
mocked: tests do not load credentials, access the network, or consume model credits.

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

Model failures or invalid JSON leave state intact. After a failed proposal,
enter ingredients again; after failed recipe generation, enter `yes` again.
There are no automatic retries or fallbacks to a different model family.

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
`getCurrentStep`, and `completeCurrentStep(expectedStepId)` for use without the
CLI or web UI. `LLMProvider` has a single `generate(prompt)` method returning
untrusted text; `src/infrastructure/gemma-provider.ts` implements it.

Gemma receives JSON context containing ingredient input, the accepted proposal
when generating a recipe, and `currentSession` (null before session creation).
Only proposal and recipe generation call the model. During cooking, queries and
step completion read and update structured state directly, without inference.

The application requests JSON and parses it strictly, allowing a single JSON
markdown fence. It validates proposals and recipes at runtime before any session
write. Recipe validation checks required fields, quantities, unique IDs, ordered
steps and ingredient references, rejects extra fields, and requires the accepted
dish and servings. The domain store also validates recipes at its creation boundary.
Only `CookingSessionStore` creates or progresses sessions; the model cannot write
current steps, completion records, substitutions, or timers.

The adapter rejects blocked, incomplete, or empty responses and uses a 120-second
request timeout. The API key is sent only in a header; remote error bodies and
transport diagnostics are never displayed.

## Domain

`src/domain/types.ts` defines ingredients (including quantities), recipes,
ordered steps, sessions, substitutions, and timers. Timer scheduling and
substitution operations remain outside Step 2.

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
