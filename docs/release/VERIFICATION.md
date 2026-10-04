# Task 7 verification ledger

Date: 2026-10-05. Source audited: master at c180a0e plus pre-existing planning
files. Task 7 modifies release documentation/configuration only. Task 6.2 was
found specified but unimplemented, and was then implemented on 2026-10-05 (see
STATUS.md). Its live qualitative evaluation is pending.

## Automated verification

| Check | Actual result |
| --- | --- |
| Complete npm test, current checkout after concurrent benchmark changes | 228 passed, 0 failed, 0 skipped; 10 suites |
| Clean npm ci --include=dev | Passed in a new secret-free temporary copy; 37 packages installed, 38 audited, 0 reported vulnerabilities |
| Complete npm test, fresh install | 212 passed, 0 failed, 0 skipped; 9 suites |
| npm run typecheck | Passed after clean install and again on final current-source snapshot |
| npm run build -- --webpack | Passed after clean install and again on final current-source snapshot; static home and three dynamic Node API routes |
| Existing client/server import-boundary test | Passed within complete suite |
| Production browser bundle boundary scan | Passed: 21 browser JS files; no provider/credential config identifiers or model IDs |
| Credential-pattern scan, tracked/nonignored text | No real-key patterns found; only fictional CLI test fixture matched generic assignment heuristic |
| Populated environment files tracked | None |
| .gitignore | .env, .env.local, .next and node_modules ignored; empty .env.example allowed |
| render.yaml | Parses as one Node service; remote Render validation not performed |
| git diff --check / new release text whitespace | Passed; release document links resolve |

The sandbox initially blocked two existing mocked CLI subprocess tests with EPERM
(210/212 passed). Full suite passed when executed with approved subprocess access.
The first clean install similarly hit an install-time binary subprocess restriction;
the approved clean installation passed. No production/provider keys were loaded
by tests/build/install, and no live-provider calls were made in these checks.
During verification, another process added Mistral benchmark-only source/tests.
These changes were preserved; no app provider selection was altered. The final
complete suite passed 228/228 and typecheck/build were repeated against a current
secret-free snapshot using installed dependencies. Its source remained unchanged
through final verification. Source-file hash-map SHA256:
41a6973b3c5ba4223cdf8cd74a67883e440659c0fbe9cb426a7d5a2db60bb5a3.
At the time of that run, MISTRAL_API_KEY and BENCH_MISTRAL_MODEL were
benchmark-only. Since 2026-10-05, MISTRAL_API_KEY is the required production
reasoning key (see STATUS.md).
The final bundle scan also excludes Mistral credential/model identifiers.
The live preview's build output/session was not changed. The temporary copy is
verification-only and must not be committed.

## Existing failure coverage (mocked, not public-production results)

Complete suite covers provider/malformed output with atomic state preservation,
retry, stale/duplicate/concurrent requests, fresh and missing process-local flows,
reset after simulated service replacement, origin checks and detached snapshots.
Voice tests cover permission denial/late grants, capture cleanup, token/STT failure,
cancellation, TTS/playback failure, retained speech handles, quantity-bearing EN/PL
instructions and typed fallback. These establish tested code behavior only; they
do not prove real microphone accuracy, audible sound or Render/browser behavior.

## Public verification — pending

| Release gate | Actual evidence |
| --- | --- |
| Public Render HTTPS URL | Not deployed; dashboard at sign-in, no accessible CLI/token |
| Task 6.2 implementation | Implemented 2026-10-05; 252 deterministic tests pass; live scenarios A–E not yet run |
| Render plan and deployed commit | Pending access/billing choice/source reconciliation |
| Actual provider/model selection | Configured: default and Blueprint are Mistral Small 4 `mistral-small-2603` (native schema). Deployed selection unverified |
| Fresh browser entry → proposal → acceptance | Not run on public HTTPS |
| Cooking → deterministic progression → adaptation | Not run on public HTTPS |
| Completed history retained after adaptation | Not observed on public deployment |
| EN and PL ingredient mic → STT → editable draft | Not run on public HTTPS |
| Cooking mic → STT → agent → TTS → audible playback | Not run on public HTTPS; physical/acoustic checks need owner |
| Current/repeat speaks useful known quantities | Public/physical verification pending |
| Completion → reset → fresh entry | Public verification pending |
| Secure cookie / same-origin guard behind Render TLS | Public verification pending |
| Reload, shared tabs, separate browser profile | Public verification pending |
| Restart/redeploy → 410 → Start again → fresh flow | Public verification pending; only disposable test session |
| Model/voice/network failure recovery | Mocked coverage passed; public failure pass pending |
| Major interaction latencies / provider errors | No Task 7 public samples; do not reuse local samples |
| Physical phone browser/keyboard/chrome/safe areas | Not tested; exact HUMAN-CHECKS.md checklist prepared |
| Natalia realistic cooking attempt | Not performed; minimal handoff prepared, observations pending |
| Five final screenshots | Not captured; require actual public product |
| Demo scenario / recording outline | Prepared, public rehearsal/recording pending |
| Submission draft / external README | Prepared with explicit unverified deployment/source limitations |

## Evidence template for public run

Record: assigned HTTPS origin, service/region/plan, deployed SHA, date/time, actual
non-secret provider/model settings, browser/version, clean-profile method and
language. For each operation record input/action, observed outcome, approximate
wall-clock wait, provider/session/UI errors and evidence filename. Distinguish a
simulated cooking walkthrough from preparing a meal; synthetic audio from actual
microphone input; browser playback events from human-heard speaker sound.

Do not record tokens, cookies, keys, complete environment dumps or dashboard
secret screenshots. Store clean application captures in docs/release/screenshots.
Record a failure as failure/unverified, never silently replace it with a mock/local
result. Incorporate owner-reported phone/Natalia observations into STATUS.md.

**Decision: NOT RELEASE-VERIFIED. Task 7 remains open.**
