# Sous — Project Status

Last updated: 2026-10-04

Product source of truth: [PROJECT.md](PROJECT.md).

## Current milestone

[Task 1](TASK1.md) is complete. [Task 2](TASK2.md) has not started.

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

## Validation

The following checks passed after Task 1 implementation:

- `npm test` — 14 tests passed.
- `npm run typecheck` — Next.js route type generation and TypeScript checks passed.
- `npm run build` — the production build succeeded.

## Current limitations

- Sessions exist only in memory within each store instance and are lost when
  the instance or process is discarded.
- The placeholder web page is not connected to the session store.
- Substitutions and timers are represented as domain types and session fields;
  substitution operations and timer scheduling are not implemented.
- No LLM, voice, database, authentication, or deployment integration is implemented.

## Next task

Task 2 specifies a small replaceable LLM provider abstraction, Gemma integration,
structured recipe/state interactions, and a CLI/debug interface. No Task 2 work
has been implemented.
