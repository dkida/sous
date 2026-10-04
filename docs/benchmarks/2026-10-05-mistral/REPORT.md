# Mistral open-weight spike — 2026-10-05

A narrowly scoped benchmark of one Mistral open-weight model, `mistral-small-2603` (Mistral Small 4), through the existing `LLMProvider` boundary. It is not a migration. The app and CLI cannot select Mistral, Gemma remains the default open-weight provider, and no production default changed.

The spike ran in two parts, which differ only in how structured output was requested:

- **Part 1, prompt-only Mistral:** JSON requested in the prompt, as for every other provider. This run was paired with fresh Gemma and Flash-Lite baselines.
- **Part 2, native-schema Mistral:** the same requests, plus Mistral's strict native JSON Schema. This was the final model experiment before release, and only Mistral was called.

Jump to the [prompt-only vs native-schema comparison](#comparison-prompt-only-vs-native-schema-mistral) and [recommendation](#recommendation).

# Part 1 — prompt-only Mistral

## Method

- Model: `mistral-small-2603` (Mistral Small 4, Apache 2.0 open weights), served by Mistral's hosted chat-completions API. It ran alongside fresh baselines for `gemma-4-26b-a4b-it` and `gemini-3.5-flash-lite`.
- 3 repetitions × 5 scenarios × 3 models = 45 sequential requests. Each scenario had one prompt hash across all nine trials. There were no access, billing or quota failures, no retries and no warmups.
- Same harness, fixtures and settings as the [2026-10-04 benchmark](../2026-10-04-flash-lite/REPORT.md): temperature 0.2, 8192 max output tokens, 120 s timeout, JSON requested in the prompt, and each model's default thinking or reasoning behaviour. Provider order reversed on alternate repetitions.
- **Not comparable with the 2026-10-04 numbers:** every scenario prompt has changed since then, so all three models were re-run here.
- Latency statistics cover successful trials only. Failed trials are listed separately with their durations. Provider calls accounted for 99.995% of total interaction time.

## Prompt-only results

Total latency in seconds: median (range) over successful trials.

| Scenario | Gemma 4 | Gemini 3.5 Flash-Lite | Mistral Small 4 | Successes G / F / M |
| --- | ---: | ---: | ---: | --- |
| Proposal | 10.541 (9.884–10.938) | 0.707 (0.697–0.825) | 0.549 (0.529–0.676) | 3/3 · 3/3 · 3/3 |
| Recipe generation | 87.814 (86.970–88.658) | 2.272 (2.034–2.608) | 4.143 (n = 1) | 2/3 · 3/3 · **1/3** |
| Missing tomato paste | 34.842 (34.461–43.540) | 1.136 (1.113–1.159) | 1.432 (n = 1) | 3/3 · 2/3 · **1/3** |
| Scaling 2 → 4 | 60.372 (38.543–82.202) | 1.169 (1.026–1.181) | 1.388 (1.321–1.893) | 2/3 · 3/3 · 3/3 |
| Burning onions | 29.684 (18.071–45.616) | 1.023 (0.969–1.029) | 0.835 (0.624–1.047) | 3/3 · 3/3 · 2/3 |
| **Total** | | | | **13/15 · 14/15 · 10/15** |

Failures:

- Gemma timed out at 120 s twice (recipe in repetition 3, scaling in repetition 2).
- Flash-Lite returned one invalid adaptive action (missing paste, repetition 3).
- Mistral produced two invalid recipes (repetitions 2 and 3) and three invalid actions (missing paste in repetitions 2 and 3, burning onions in repetition 3).

Every failure was rejected atomically: cooking state and completed history stayed unchanged in all 45 trials.

Sample sizes are three trials per cell, and only one trial for two of the Mistral cells. They show a large difference in latency between Gemma and the other two models. They do not establish tail latency or a reliable latency ranking between Flash-Lite and Mistral.

## Why prompt-only Mistral fails validation

Failed trials save no output, so the failures were reproduced after the main run with the same prompts and fixtures ([failure-diagnostics.json](failure-diagnostics.json)). Those diagnostic calls are excluded from the table above.

- **Recipe:** 3 of 3 extra samples failed with *"Step ingredient references must be an array of ingredient IDs."* In each one, every step left out the required `ingredientIds` field. The rest of the recipe was otherwise well formed.
- **Missing paste:** 3 of 11 extra samples failed, and all three had the same omission in the replacement step update. All three also substituted tomato purée, which the cook never said they had.
- **Burning onions:** 0 of 11 extra samples failed, so the cause of the single benchmark failure is unknown.

The dominant failure mode is a schema omission, not a reasoning error. Mistral's API supports `response_format: json_schema`, which might remove it. That was not tested, because the other providers were benchmarked with JSON requested in the prompt only.

## Quality of prompt-only Mistral's valid outputs

These notes come from reading the 10 saved Mistral outputs. Gemma and Flash-Lite outputs were only spot-checked, and nothing was cooked.

- **Proposals:** sensible tomato-parmesan pasta dishes, 3 of 3.
- **Recipe:** the one valid recipe is sensible and complete. Its structured ingredients include olive oil, salt and pepper. By contrast, all three Flash-Lite recipes in this run again left oil and salt out of the ingredient list. Gemma's two recipes included them.
- **Missing paste:** the one valid response substitutes 30 ml tomato purée, an ingredient the cook did not list. The response is structurally valid but culinarily questionable.
- **Scaling:** all three double the unused tomatoes, paste and parmesan correctly in structured state. None compensates for the 200 g of pasta that was already cooked. Repetition 2 says *"no extra is needed"*, which matches the Task 3.6 caveat that applied to every model. In repetition 3, the step text says *"400 g chopped tomatoes"* while the structured quantity is 800 g, so the spoken instruction would contradict the stored state.
- **Burning onions:** both valid responses say to take the pan off the heat immediately. Repetition 2 is weaker: it lowers the heat first and removes the pan only *"if needed"*.

## Prompt-only conclusion

Mistral Small 4 integrates cleanly behind the unchanged provider interface. On these prompts its latency is in the same range as Flash-Lite and much lower than hosted Gemma. As-is, though, it is not reliable enough for Sous: 10 of 15 trials succeeded, recipe generation passed only 1 time in 3, and there is a recurring `ingredientIds` omission. Promising follow-ups were a native JSON-schema run or a small prompt-compatibility check. The native-schema run became Part 2.

# Part 2 — native-schema Mistral

## Method

- **Only one variable changed:** each request also sends `response_format: {type: "json_schema", json_schema: {name, schema, strict: true}}`. Everything else matches Part 1: model, scenarios, inputs, fixtures, temperature 0.2, 8192 max tokens, 120 s timeout, default reasoning, prompts and validators. All five scenario prompt hashes are byte-identical to the prompt-only Mistral trials, which was checked offline before any request.
- **Exactly 15 new requests**, 3 per scenario, to Mistral only. No other model was called, no historical baseline was re-run, and there were no diagnostic, retry or exploratory calls. The rejected responses are saved in the raw records, so failures were explained by replaying them offline.
- **Schemas** ([response-schemas.ts](../../../src/application/response-schemas.ts)) are hand-written mirrors of the existing validators, chosen per contract:
  - proposal scenario: the dish-proposal schema;
  - recipe scenario: the recipe schema;
  - the three adaptive scenarios: the full five-way adaptive-action union (`anyOf`), not just the action each scenario expects.
- **Every schema keeps every field the validator requires**, including step `ingredientIds`, and forbids extra fields (`additionalProperties: false`). A unit test generates a minimal schema-shaped response for each contract, checks that Sous's validators accept it, and checks that removing any single field makes them reject it.
- **What the schema cannot express** is still enforced only by Sous: trimmed non-empty strings, the eight-word headline limit, unique IDs, references to known ingredients, and whether an action can apply to the current cooking state. The pipeline stays Mistral → native schema → parse → existing Sous validation → domain/state transition. Nothing was loosened.
- **What Mistral guarantees:** its API reference says JSON schema mode "guarantees the message the model generates is in JSON and follows the schema you provide". Which JSON Schema keywords are supported is not documented on the pages I could read. Here, all 15 responses parsed and passed Sous's shape validation, which is at least as strict as the schema, so no schema violation was observed. That is 15 samples, not proof of the guarantee.
- **Limitations:** the provider interface has no per-request contract metadata, so the benchmark picks the schema by scenario at construction time, as the earlier Flash-Lite probe did. Using this in the app would need per-call schema selection, which is a design change and was not made.

## Native-schema results

| Outcome | Count |
| --- | ---: |
| Accepted by Sous (structurally valid and applied) | **12/15** |
| Accepted **and** passed the scenario state-transition check | **11/15** |
| Provider/API failures | 0 |
| Malformed JSON | 0 |
| JSON Schema / shape-validation failures | 0 |
| Steps missing `ingredientIds` (all 15 responses, incl. rejected) | **0** |
| Domain-applicability rejections (valid shape, cannot apply to cooking state) | 3 |
| Accepted but failed the state-transition check | 1 |

| Scenario | Accepted | Total latency, all trials, s: median (range) | Provider, all trials, s: median |
| --- | --- | ---: | ---: |
| Proposal | 3/3 | 0.674 (0.603–0.763) | 0.674 |
| Recipe generation | 3/3 | 3.982 (3.650–4.040) | 3.979 |
| Missing tomato paste | 2/3 | 1.851 (1.682–2.918) | 1.847 |
| Scaling 2 → 4 | 3/3, one with a failed state check | 1.492 (1.423–1.529) | 1.490 |
| Burning onions | 1/3 | 1.244 (1.162–1.270) | 1.243 |

Latency here covers **all** trials, so failures are included. Over accepted trials only, the medians are missing paste 2.300 s and burning onions 1.162 s; the other rows are unchanged. Provider calls were 99.93% of total interaction time.

**Structural failures.** Each one was replayed offline against the unchanged store to name the rule it broke:

1. **Missing paste, repetition 1 (rejected):** adds `sugar` as an additional ingredient that no remaining step references. The store requires every added ingredient to be used in a remaining step. It also proposes "tomato juice or passata", which the cook never listed.
2. **Burning onions, repetitions 2 and 3 (rejected):** each adds a new ingredient named "Onion" for a restart. The store rejects it as a duplicate of the existing onion by name, and no step references it.
3. **Scaling, repetition 3 (accepted, failed the state check):** lists unused parmesan as unscaled, so four servings keep 40 g parmesan.

## Does native schema eliminate the missing `ingredientIds` failures?

**Yes, in this sample.** None of the 15 native-schema responses, including the rejected ones, omitted `ingredientIds`. Recipe generation went from 1/3 to 3/3. The remaining failures are no longer field omissions. They are semantically wrong actions that a JSON Schema cannot rule out, and the domain rules rejected them correctly.

## Semantic quality of native-schema Mistral

Every response was read. Per-response notes are in [native-schema/semantic-review.json](native-schema/semantic-review.json).

- **Invented ingredient availability. Repeated: 3/3 missing-paste responses and 3/3 burning-onion responses.**
  - Both accepted missing-paste responses store 30 g **tomato purée** as the replacement. The rejected one proposes tomato juice or passata plus sugar. None of these was listed, and none is an assumed staple under the Task 6.2 policy.
  - Omitting the paste (`replacement: null`) and simmering longer was available and safer.
  - Every burning-onions response tells the cook to discard the batch and restart with a fresh onion, assuming a second onion exists. Only one of them hedges this with "if possible", and only in its message.
  - At the time of this run, the Task 6.2 pantry policy was documented but not implemented. It was implemented afterwards on 2026-10-05 (see STATUS.md), so these results predate it. The prompts then said only "available ingredients and basic pantry staples only".
- **Structured quantity versus prose contradictions. 2 of 3 recipes, plus 1 adaptive response:**
  - Recipe repetition 1: structured parmesan is **30 g** in total, but the step says "Grate **30 g** parmesan over **each** serving" across two plates, which is 60 g.
  - Recipe repetition 3: structured parmesan is **50 g** in total, but the step says "Grate **50 g** parmesan over **each** serving", which is 100 g.
  - Burning onions repetition 1 (accepted): the restart step needs a second onion and another 15 ml of oil, but structured state still holds one onion and 15 ml oil in total.
  - The Part 1 scaling contradiction (800 g stored, "400 g" in text) did **not** recur. All three native-schema scaling instructions match their structured quantities.
- **Scaling:**
  - Repetitions 1 and 2 scale correctly in structured state.
  - Repetition 1's message wrongly says the sauce step is "already completed". That is prose only; completed state was not rewritten.
  - Repetition 3 leaves parmesan unscaled for four servings.
  - None of the three compensates for the 200 g of pasta already cooked, which has been a known gap for every model since Task 3.6.
- **Completed history:** respected in all 15 trials. The store enforces this.
- **Proposals:** 3/3 sensible.
- **Recipes:** sequencing and technique are otherwise sensible. Oil, salt and pepper are structured as staples.
- **Burning onions:** the immediate "off the heat" advice is correct every time. Jumping straight to discarding everything is heavier than needed.
- **Language:** English throughout, matching the scenario.

# Comparison: prompt-only vs native-schema Mistral

Both runs used the same model, prompts (identical hashes), fixtures and settings. Part 1 values are the recorded prompt-only trials; nothing from Part 1 was re-run.

| | Accepted by Sous | Accepted + correct state transition |
| --- | ---: | ---: |
| Mistral prompt-only | 10/15 | 10/15 |
| Mistral native schema | **12/15** | **11/15** |

Total latency, median over **all** trials in seconds (successful-only medians in brackets where they differ):

| Scenario | Prompt-only | Native schema |
| --- | ---: | ---: |
| Proposal | 0.549 | 0.674 |
| Recipe | 3.264 [4.143, n=1] | 3.982 |
| Missing ingredient | 1.865 [1.432, n=1] | 1.851 [2.300, n=2] |
| Scale 2 → 4 | 1.388 | 1.492 |
| Burning onions | 0.919 [0.835, n=2] | 1.244 [1.162, n=1] |

Native schema adds roughly 0.1–0.3 s on the short turns, a difference within the noise of three-trial cells. Every interactive turn stays at or below about 4 s.

# Recommendation

**B. Mistral Small 4 remains unsuitable; stop model experimentation for this release.**

- **Structural reliability improved but is not production grade.** Native schema fixed the `ingredientIds` omission (recipes 1/3 → 3/3). However, 4 of 15 trials still failed: three domain rejections and one incorrect scaling. Adaptive turns were the weakest at 6/9 accepted and 5/9 correct.
- **Semantic correctness is the deciding problem.** In 6 of 6 missing-ingredient and burning-onion responses, Mistral treated ingredients the cook never confirmed as available. 2 of 3 recipes say a per-serving parmesan amount that contradicts the stored total, so a spoken instruction would tell the cook to use twice the recorded amount. These are exactly the failures Sous cannot hide from a cook, and no schema can prevent them.
- **Latency is excellent** (0.6–4 s), but speed alone does not qualify a model.
- **Culinary quality is sensible on the routine path** (proposals and recipe structure). It breaks down in exactly the adaptive moments Sous exists for.
- **Integration complexity:** the provider itself is small. Using it in production would also need per-request schema selection through the provider interface, which is a design change under feature freeze.

Per the release brief, the result is borderline at best on structure and fails on semantics, so the safer recommendation applies. The production-provider decision is left to the owner. No default was changed.

## Files

- Part 1, prompt-only Mistral: [requests.jsonl](requests.jsonl) holds all 45 records, including the Gemma and Flash-Lite baselines. Also [summary.json](summary.json), [method.json](method.json), and [failure-diagnostics.json](failure-diagnostics.json) (post-run reproduction calls, excluded from all figures).
- Part 2, native-schema Mistral: [native-schema/requests.jsonl](native-schema/requests.jsonl) holds the 15 records, with rejected model text kept visible. Also [native-schema/summary.json](native-schema/summary.json), [native-schema/method.json](native-schema/method.json) and [native-schema/semantic-review.json](native-schema/semantic-review.json).
