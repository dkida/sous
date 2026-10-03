# Sous — Project Status

Last updated: 2026-10-04

Product source of truth: [PROJECT.md](PROJECT.md).

## Current milestone

[Task 1](TASK1.md) and [Task 2](TASK2.md) are complete.
The next milestone is adaptive cooking; Step 3 has not started.

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

## Validation

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
- Substitutions and timers are represented as domain types and session fields;
  substitution operations and timer scheduling are not implemented.
- Gemma JSON generation is prompted, not guaranteed by server-side constrained
  decoding. Runtime validation rejects malformed/incompatible responses;
  the user can retry. No automatic retries are implemented.
- Hosted inference latency and availability depend on model access and quota.
  The adapter times out after 120 seconds and preserves application state.
- A subsequent user CLI run returned HTTP 402. Google's API documentation maps
  this to depleted prepaid billing credits. Live inference is currently blocked
  for that billing account until credits are restored or a Free Tier project/key
  is used. Google lists Gemma 4 as free on the Free Tier. The provider now explains
  the Free Tier option alongside prepaid billing instead of suggesting an immediate retry. This was
  verified with a mocked HTTP 402 response; no additional live calls were made.
- The CLI handles the documented cooking commands; open-ended adaptive questions
  and other natural-language intents during cooking remain outside this milestone.

## Intentionally out of scope

- Substitutions, recipe modification, portion scaling and problem handling.
- Timer scheduling and model-directed changes to active cooking sessions.
- Voice, speech-to-text/text-to-speech, push-to-talk, hands-free use and wake words.
- Web UI integration, database, authentication and deployment.
- Step 3 / adaptive cooking implementation.

## Next milestone: adaptive cooking

Extend the reasoning layer to use structured active-session context for supported
cooking adjustments and problem handling, translating validated requests into
explicit domain operations. Keep the application as state owner. This milestone
has not been started.
