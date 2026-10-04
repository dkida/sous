# Task 6.2 live quality check — Mistral Small 4, native schema

- **When and who:** run by the owner on 2026-10-05 with `npm run bench:quality -- --provider mistral-native-schema`. Raw output is in [mistral.json](mistral.json).
- **Scope:** one sample per scenario, 12 requests, Mistral only. This is a qualitative smoke test, not a benchmark, and draws no conclusions about other providers.
- **Review method:** every output read by hand.

## Outcome

| Scenario | Proposal | Recipe | Notes |
| --- | --- | --- | --- |
| A — pasta, tomatoes, parmesan, cream | ok | ok | Sensible. Staples (oil, salt, pepper, water) are structured and referenced. |
| B — plus a banana | ok | ok | **The banana is omitted.** Parmesan is added off the heat. |
| C — eggs and bread | ok | ok | Kept simple: scrambled eggs on toast, 5 steps. |
| D — shopping allowed | ok | ok | Two purchases, garlic and basil. Both are used, and both are listed under "to buy". |
| E — Polish | ok | **rejected** | Two steps say "Dopraw … czarnym pieprzem" (season with black pepper), but pepper is not a structured ingredient. The new staple rule rejected it correctly. |
| Missing tomato paste | — | ok | **Omits the paste and reduces the tomatoes.** No invented purée or passata; `ingredientAvailability: []`. |
| Burning onions | — | ok | Off the heat now, lower the heat, then continue. No invented second onion. |

**Result:** 11 of 12 responses were accepted, and 6 of 7 scenario flows completed. Both adaptive checks took about 1.3 s; the planning runner does not record latency.

## Findings

- **Invented availability, the main reason for Task 6.2: not seen in the accepted outputs.**
  - Both adaptive checks fixed the earlier patterns (the purée substitute and the second onion), though on one sample each.
  - Minor exception: B and D blanch tomatoes in "ice water", and ice is not a staple.
- **Supplied ingredients are not mandatory:** the banana was left out (B), and the sparse input stayed simple (C).
- **Additions stay restrained:** D suggested two purchases. A, B and C suggested no optional additions; E suggested one ("czosnek", garlic) and kept it out of the recipe.
- **Pantry consistency:** every accepted recipe structures and references the staples it uses. E's omission of pepper was caught rather than shipped.
- **Quantity versus prose:** no direct contradictions. A and B end with "extra grated parmesan if desired" beyond the stored total. It's optional, but the amount is not represented. A's oil is "a drizzle" with no quantity.
- **Technique:** pasta water is reserved and used in A, B and D; tomatoes are reduced; parmesan goes in off the heat in B and D. A simmers the sauce after adding parmesan, which is less ideal.
- **E's rejected recipe:** besides the missing pepper, it stirs raw diced tomatoes into the pasta without cooking them. That is weak technique, but it never reached cooking state.

One sample per scenario cannot establish reliability. The Polish failure shows that staple omission can still happen; Sous now rejects it instead of showing prose that contradicts the stored state.
