# Inference comparison — 2026-10-04

This is an experimental benchmark, not a migration. Gemma remains the default open-weight provider. No winner was selected and no Task 4 work was performed.

## Method

- Three repetitions × five scenarios × two models = 30 sequential requests. No quota failures, timeouts, retries, or excluded main trials occurred.
- Models: `gemma-4-26b-a4b-it` and `gemini-3.5-flash-lite`, both available to the configured API project. The latter is an explicit experimental opt-in.
- Unchanged CookingAgent prompts/contracts and runtime/domain validators. Exactly one prompt hash per scenario across all six trials confirms byte-identical prompts within each scenario; no complete prompts are saved.
- Identical explicit generation settings: temperature 0.2, max output tokens 8192, timeout 120 seconds, prompted JSON. No streaming, native schema, thinking override, warmup, or app optimization in the main comparison. Model-specific thinking defaults and output lengths differ naturally.
- Provider order alternated by repetition (Gemma first in 1/3, Flash-Lite first in 2). Each trial starts from independent fixtures. Recipe trials seed the same accepted proposal without a network call. Missing/scaling fixtures have pasta and onion/garlic already completed; burning has only pasta completed.
- Adaptive trials use a fixed four-step recipe rather than either generated recipe. This isolates inference differences but does not test an entire meal using each generated plan. Historical single-session timing samples are not pooled with these controlled trials.
- Total means agent entry to prepared result/failure. Provider spans generation, network/remote service, decoding and lightweight benchmark prompt fingerprinting; it is not isolated model computation. Parse/validate is the structured application boundary; app/domain includes state operations, defensive validation and snapshots. Logging, fixture seeding and saved-record I/O are outside the measured interaction.
- Culinary grades are qualitative inspection of saved outputs; structural checks do not verify every prose instruction or physical serving adequacy.

## Median comparison

Total/provider columns are seconds; parse/application columns are milliseconds. Medians are computed independently for each field.

| Provider/model | Scenario | n / successes | Total median (range), s | Provider median, s | Parse median, ms | App/domain median, ms |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| gemma-4-26b-a4b-it | proposal | 3 / 3 | 11.842 (9.038–12.436) | 11.842 | 0.078 | 0.051 |
| gemma-4-26b-a4b-it | recipe | 3 / 3 | 116.205 (85.246–117.837) | 116.205 | 0.187 | 0.370 |
| gemma-4-26b-a4b-it | missing-paste | 3 / 3 | 39.404 (33.875–51.720) | 39.400 | 0.160 | 0.623 |
| gemma-4-26b-a4b-it | scale-2-to-4 | 3 / 3 | 36.760 (30.278–44.687) | 36.759 | 0.191 | 0.544 |
| gemma-4-26b-a4b-it | burning-onions | 3 / 3 | 37.694 (24.038–42.673) | 37.694 | 0.148 | 0.578 |
| gemini-3.5-flash-lite | proposal | 3 / 3 | 0.731 (0.727–0.888) | 0.731 | 0.081 | 0.042 |
| gemini-3.5-flash-lite | recipe | 3 / 3 | 2.167 (1.507–2.279) | 2.166 | 0.185 | 0.577 |
| gemini-3.5-flash-lite | missing-paste | 3 / 3 | 1.139 (1.120–1.146) | 1.137 | 0.121 | 0.643 |
| gemini-3.5-flash-lite | scale-2-to-4 | 3 / 3 | 1.176 (1.013–1.190) | 1.175 | 0.140 | 0.547 |
| gemini-3.5-flash-lite | burning-onions | 3 / 3 | 0.967 (0.912–1.123) | 0.967 | 0.148 | 0.432 |

Provider spans account for 99.9963% of aggregate interaction duration. The ranges do not overlap between models for any scenario; this supports a consistent delivered-latency difference in this small sample. Three trials per cell do not establish p95/p99 latency or generalize to other models, prompts, quotas or deployment conditions. No winner or production provider change follows automatically.

## Correctness observations

- All 30 requests returned structurally valid output; all 30 fixture transition and completed-history checks passed. This includes preserving used ingredient quantities when serving counts change. There were no failure outcomes in this controlled run.
- Both models proposed appropriate dishes, omitted unavailable paste, and gave urgent heat control first for burning onions.
- All six scaling responses were incomplete on compensation: none added pasta/aromatics or clearly explained smaller pasta portions after preserving the already-cooked 200 g pasta. The structured serving update passed; that is not proof of sufficient portions.
- All three Flash-Lite recipes omitted pantry cooking-medium/seasoning ingredients from structured state: no oil/fat for sauteing, and salt/water mentioned in prose but not listed. Gemma recipes listed those ingredients, although some preparation/timing details were terse.
- Optional extra ingredients in advice and some persisted burning-step prose were not fully represented as quantities/references. See per-request caveats below; these semantic gaps were recorded, not fixed by changing application behavior.

## Every request

All durations below are milliseconds. The raw JSONL retains full precision, model IDs, phase outcome, prompt hashes, state/history checks and validated synthetic output. G = gemma-4-26b-a4b-it; F = gemini-3.5-flash-lite.

| Model | Repeat | Scenario | Total | Provider | Parse/validate | App/domain | Outcome | Structured | Transition | History | Culinary |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| G | 1 | proposal | 12436.22 | 12435.02 | 0.71 | 0.12 | ok | pass | pass | pass | sensible |
| F | 1 | proposal | 726.51 | 726.13 | 0.32 | 0.04 | ok | pass | pass | pass | sensible |
| G | 1 | recipe | 85245.97 | 85244.85 | 0.61 | 0.46 | ok | pass | pass | pass | sensible |
| F | 1 | recipe | 1507.06 | 1506.17 | 0.19 | 0.65 | ok | pass | pass | pass | sensible with caveats |
| G | 1 | missing-paste | 39404.31 | 39399.78 | 1.53 | 2.57 | ok | pass | pass | pass | sensible |
| F | 1 | missing-paste | 1145.89 | 1145.04 | 0.11 | 0.47 | ok | pass | pass | pass | sensible with caveats |
| G | 1 | scale-2-to-4 | 30278.35 | 30276.74 | 0.20 | 1.22 | ok | pass | pass | pass | partially sensible |
| F | 1 | scale-2-to-4 | 1176.30 | 1174.95 | 0.19 | 0.91 | ok | pass | pass | pass | partially sensible |
| G | 1 | burning-onions | 24037.64 | 24036.54 | 0.21 | 0.71 | ok | pass | pass | pass | sensible |
| F | 1 | burning-onions | 1122.94 | 1122.14 | 0.15 | 0.43 | ok | pass | pass | pass | sensible with caveats |
| F | 2 | proposal | 888.20 | 888.05 | 0.06 | 0.05 | ok | pass | pass | pass | sensible |
| G | 2 | proposal | 9037.75 | 9037.57 | 0.06 | 0.05 | ok | pass | pass | pass | sensible |
| F | 2 | recipe | 2279.25 | 2278.42 | 0.22 | 0.58 | ok | pass | pass | pass | sensible with caveats |
| G | 2 | recipe | 117837.19 | 117836.72 | 0.14 | 0.30 | ok | pass | pass | pass | sensible |
| F | 2 | missing-paste | 1138.60 | 1137.28 | 0.17 | 0.98 | ok | pass | pass | pass | sensible |
| G | 2 | missing-paste | 33875.12 | 33874.36 | 0.11 | 0.48 | ok | pass | pass | pass | sensible |
| F | 2 | scale-2-to-4 | 1190.03 | 1189.19 | 0.14 | 0.55 | ok | pass | pass | pass | partially sensible |
| G | 2 | scale-2-to-4 | 44686.55 | 44685.88 | 0.14 | 0.41 | ok | pass | pass | pass | partially sensible |
| F | 2 | burning-onions | 967.46 | 966.94 | 0.09 | 0.32 | ok | pass | pass | pass | sensible |
| G | 2 | burning-onions | 42672.53 | 42671.64 | 0.14 | 0.58 | ok | pass | pass | pass | sensible with caveats |
| G | 3 | proposal | 11842.23 | 11842.04 | 0.08 | 0.04 | ok | pass | pass | pass | sensible |
| F | 3 | proposal | 730.85 | 730.68 | 0.08 | 0.04 | ok | pass | pass | pass | sensible |
| G | 3 | recipe | 116205.41 | 116204.81 | 0.19 | 0.37 | ok | pass | pass | pass | sensible |
| F | 3 | recipe | 2166.62 | 2166.46 | 0.04 | 0.08 | ok | pass | pass | pass | sensible with caveats |
| G | 3 | missing-paste | 51719.70 | 51718.88 | 0.16 | 0.62 | ok | pass | pass | pass | sensible |
| F | 3 | missing-paste | 1120.45 | 1119.55 | 0.12 | 0.64 | ok | pass | pass | pass | sensible with caveats |
| G | 3 | scale-2-to-4 | 36760.37 | 36759.49 | 0.19 | 0.54 | ok | pass | pass | pass | partially sensible |
| F | 3 | scale-2-to-4 | 1013.02 | 1012.62 | 0.06 | 0.19 | ok | pass | pass | pass | partially sensible |
| G | 3 | burning-onions | 37694.35 | 37693.58 | 0.15 | 0.58 | ok | pass | pass | pass | sensible |
| F | 3 | burning-onions | 911.63 | 910.82 | 0.15 | 0.47 | ok | pass | pass | pass | sensible |

Per-request qualitative notes are in [qualitative-review.json](qualitative-review.json); validated output and full-precision measurements are in [requests.jsonl](requests.jsonl). Aggregates are in [summary.json](summary.json) and configuration is in [method.json](method.json).

## Native JSON Schema investigation

A separate Flash-Lite proposal probe succeeded in 0.995 s (provider 0.994 s; parsing 0.311 ms; application 0.042 ms). It is excluded from the 30-request baseline and no performance conclusion is drawn from that one sample.

The configured API accepts `generationConfig.responseFormat.text` with `mimeType: APPLICATION_JSON` and a JSON Schema. The optional adapter constructor schema still returns untrusted JSON text via unchanged `generate(prompt)`; existing application validation and state ownership remain in force. No schema mode is enabled by default. The existing provider interface has no per-request contract metadata; cleanly selecting proposal/recipe/adaptive schemas for a general agent would need an explicit design decision, which is deferred. Only the proposal schema was tested live; recipe schemas and the adaptive union were not tested in native mode. Native schema enforcement does not prove culinary correctness.

Google documents the [Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [GenerateContent response-format fields](https://ai.google.dev/api/generate-content#ResponseFormatConfig), and [supported JSON Schema subset](https://ai.google.dev/gemini-api/docs/structured-output). Probe data: [native-schema-probe.json](native-schema-probe.json).

## Verification and boundaries

- All 133 deterministic tests passed (108 previous tests plus 25 provider/configuration/benchmark tests). Tests never load local credentials or call the API.
- Typecheck, production build and diff checks passed. An initial TypeScript weak-type mismatch at the CLI environment/configuration boundary was corrected by passing explicit fields.
- CookingAgent, LLMProvider, domain types/store/action validation, and the existing Gemma adapter were preserved. No application performance optimization, migration, streaming, UI, voice, persistence, auth, deployment or Task 4 work was added.
- The environment file was loaded only by existing Node loader flags; secrets/file contents were not inspected, displayed, changed or saved. Remote diagnostics, headers and complete prompts are excluded from benchmark output.
