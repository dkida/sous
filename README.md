# Sous

The product source of truth is [docs/PROJECT.md](docs/PROJECT.md).

Task 1 provides a minimal Next.js/TypeScript app and a framework-independent
cooking domain. It has no model, voice, database, authentication, or deployment integration.

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
one process; each test creates its own store.

## Domain

`src/domain/types.ts` defines ingredients (including quantities), recipes,
ordered steps, sessions, substitutions, and timers. Timer scheduling and
substitution operations are not implemented in Task 1.

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
