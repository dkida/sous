# Sous

Sous is a voice-first cooking companion built for Natalia, my partner. Tell it
what ingredients you have, accept a dish, and cook one step at a time. When real
life changes the plan, Sous can adapt the remaining work while preserving what
has already happened.

Recipes work until real life happens: your hands are occupied, an ingredient is
missing, something starts burning, or the number of servings changes. Searching,
scrolling and recalculating in the middle of cooking is annoying. Sous keeps the
cooking plan and current step together so you can continue cooking.

**Release status:** feature freeze; public Render deployment and physical-device
validation are pending. No verified live URL or final production screenshots are
available yet. See [release verification](docs/release/VERIFICATION.md) and
[project status](docs/STATUS.md).

## Cook with Sous

1. Choose EN or PL before starting. English is the default.
2. Type ingredients and quantities, or press the microphone, speak, and Stop.
   Review/edit the transcribed ingredients, then request a proposal.
3. Accept the dish to start cooking. The current action, complete instruction and
   relevant quantities remain prominent.
4. Use **Done · next** to finish a step. Ask questions or report changes through
   the same composer, by text or microphone. **Repeat / powtórz** reads the current
   instruction without advancing; Stop finishes a recording and Cancel discards it.
5. Finish the remaining steps, then **Cook something else** to reset.

The differentiator is **plan → cook → reality changes → adapt remaining plan →
continue cooking**, rather than recipe generation alone. Application-owned state,
deterministic progression, ingredient quantities, validated adaptive operations
and immutable completed instructions keep the model from freely replacing history.
English and Polish share the same agent, state and voice path.

## Architecture

```text
Browser: responsive Next.js / React UI (not an offline PWA)
  |-- finite microphone recording --> ElevenLabs Scribe v2 STT
  |                                   ^ one-use token from server
  |-- typed text / recognized speech / buttons
  v
Next.js Node server: /api/cooking
  |-- retained CookingAgent --> LLMProvider.generate(prompt, contract)
  |                             |-- Mistral Small 4 (default; native JSON Schema)
  |                             `-- Gemma / Flash-Lite (explicit alternates)
  |-- CookingSessionStore (memory; validated operations)
  `-- retained speech handle --> /api/voice/speech
                                  --> ElevenLabs Flash v2.5 TTS
                                  --> browser MP3 playback
```

Long-lived provider keys remain on the server. The browser receives only a
short-lived single-use STT token. Model output is untrusted JSON: validation and
the domain store control state changes. Current/repeat and Done need no inference.
Voice is an interface around the same cooking application, not another agent.

## Open-weight reasoning

Sous reasons with **Mistral Small 4 (`mistral-small-2603`)**, an Apache 2.0
open-weight model, served by Mistral's hosted API. It is the application default
and the model the Render configuration selects.

Every request names its contract (dish proposal, recipe or adaptive action).
Mistral enforces that contract's JSON Schema natively, and Sous still parses and
validates every response before any state changes:

Mistral → native JSON Schema → parse → Sous validation → domain/state transition.

Open weights mean the reasoning layer could in principle be self-hosted, run
locally on suitable hardware, or fine-tuned without redesigning cooking state or
the UI. No local inference endpoint is implemented or verified, and the deployed
app needs network access for Mistral and ElevenLabs.

Gemma 4 and Gemini Flash-Lite remain explicit, non-default alternates
(`LLM_PROVIDER=gemma` or `gemini-flash-lite`, with `GEMINI_API_KEY`). How the
choice was made:
- [Gemma vs Flash-Lite](docs/benchmarks/2026-10-04-flash-lite/REPORT.md):
  hosted Gemma was too slow for interactive cooking.
- [Mistral prompt-only vs native schema](docs/benchmarks/2026-10-05-mistral/REPORT.md).
- [Task 6.2 quality check](docs/benchmarks/2026-10-05-task62-quality/REVIEW.md).

There is no automatic provider fallback and no browser provider selector. The
Render deployment itself has not yet been verified.

## Voice

Microphone → ElevenLabs STT → same application path as typed input → validated
cooking operation → ElevenLabs TTS → browser playback. Ingredient capture stops
at an editable draft; cooking voice responses include the complete current
instruction and useful known quantities. EN/PL uses explicit language hints.

Push-to-talk requires HTTPS, microphone permission, MediaRecorder and network
access. Hiding the page cancels local voice work. Text/buttons remain available
after recoverable voice failures; TTS failure preserves a committed cooking change.
Physical phones, microphone accuracy and acoustic playback still require testing.
Wake-word feasibility was investigated and deliberately not shipped because it
failed the reliability/deployment release bar. See [VOICE.md](docs/VOICE.md) and
the [NO-GO decision](docs/WAKE_WORD_FEASIBILITY.md).

## Recipe planning

Supplied ingredients describe what the cook has. Basic pantry staples and helpful
optional additions are separate concepts: an optional addition should never be
represented as confirmed availability. A meal should use the ingredients that
make culinary sense rather than force everything into it.

Sous assumes only water, salt, black pepper and one cooking oil (neutral or
olive). Everything else, such as onion, garlic, butter, herbs or tomato
purée, is unavailable until the cook says they have it.
- A proposal lists the staples it assumes, at most three optional "better if
  you have" additions, and, only if the cook offers to shop, at most three
  purchases.
- A recipe step that mentions salt, pepper or oil must reference it as a
  structured ingredient, so the screen, voice and later adaptations all see it.
- An adaptive change may only add an ingredient that is a staple or that the
  cook confirmed in their own words.

The policy and these rules are enforced in code (Task 6.2). Recipe quality and
technique still depend on model reasoning: there is no external recipe
database, RAG or recipe retrieval.

## Run locally

Requires Node.js 22+ and npm. The Render candidate pins Node 22.18.0.

```sh
npm ci
cp .env.example .env.local
# Privately populate the required credentials in .env.local.
npm run dev
```

Open http://localhost:3000. Next.js loads the untracked server environment file.
Do not commit populated environment files or use NEXT_PUBLIC_ for provider settings.

| Environment variable | Purpose |
| --- | --- |
| MISTRAL_API_KEY | Required: default Mistral Small 4 reasoning (server-only) |
| ELEVENLABS_API_KEY | Required for STT/TTS; cooking text works without voice |
| LLM_PROVIDER | Optional: `mistral` (default), or `gemma` / `gemini-flash-lite` |
| LLM_MODEL | Optional model override (Mistral: a pinned `mistral-small-NNNN`) |
| GEMINI_API_KEY | Only for the non-default Gemma / Flash-Lite alternates |
| GEMMA_MODEL | Gemma model when `LLM_PROVIDER=gemma` and LLM_MODEL is absent |
| ELEVENLABS_VOICE_ID | Optional available voice; existing default retained |
| NODE_VERSION | Render runtime version |
| NODE_ENV | Production mode on Render |
| PORT | Render-supplied listening port |

```sh
npm test
npm run typecheck
npm run build -- --webpack
npm run start -- --hostname 0.0.0.0
```

Tests mock inference and voice/network and do not load credentials or consume
provider credits. The complete suite includes CLI subprocess and client/server
import-boundary checks. There is no lint script. For the optional terminal flow:
`npm run dev:agent`. Live benchmark commands consume provider credits and are
not part of automated verification.

## Deploy to Render

Use [render.yaml](render.yaml) and the [deployment runbook](docs/release/DEPLOYMENT.md).
A Node web service is required; static export cannot run the cooking/voice APIs.
The candidate uses one Starter instance and manual deployments to avoid idle
sleep and unintended session resets during cooking. Billing/account access is
pending; the file is preparation, not evidence of a running service.

A Secure, HttpOnly, SameSite=Strict cookie identifies one server-memory flow.
Reload retains the session while the process lives. Restart, redeploy or process
replacement loses it: use **Start again** to recover. Tabs share the cookie;
separate browser profiles have separate flows. Do not scale to multiple workers
or instances. There is no durable persistence.

## Limitations

- Hosted inference and ElevenLabs need network access, account access and quota;
  the app is not fully offline. Model requests time out after 120 seconds.
- Sessions live in memory until reset/process exit. No persistent pantry/history,
  database, accounts or authentication. A public link can consume provider quota;
  this MVP has no application rate limiting or session expiration scheduler.
- Free Render instances sleep after idle periods, causing session loss and cold
  starts. Starter avoids idle sleep but still cannot preserve memory across restarts.
- No wake word, background listening or timer scheduling.
- Browser permission, recording support and autoplay policy can interrupt voice.
  Safari/iOS and Android/Chrome physical support remain unverified.
- Shape/reference/history checks do not prove culinary correctness, food safety,
  evidence interpretation or consistency of every prose quantity. Completed steps
  are immutable; partial ingredient use is conservative; adaptations fit existing
  current/future steps without inserting or reordering steps.
- Final deployment screenshots, production walkthrough, phone and Natalia checks
  remain pending. Existing design evidence is local historical verification.

[Demo scenario and recording outline](docs/release/DEMO.md) ·
[Submission draft](docs/release/SUBMISSION.md) ·
[Phone and Natalia handoff](docs/release/HUMAN-CHECKS.md)
