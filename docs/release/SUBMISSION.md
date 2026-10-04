# Sous — submission draft

Draft only. Public deployment, the Task 6.2 live quality check, phone/Natalia
results, final screenshots and video are pending. Do not submit as verified yet.

**One line:** A voice-first cooking companion that adapts the remaining meal when
real life changes the plan.

I built Sous for Natalia, my partner. Recipes are useful until your hands are
occupied, an ingredient is missing, something starts burning or portions change.
Scrolling, searching and recalculating interrupts the cooking itself.

Sous proposes one dish from ingredient input, turns acceptance into a structured
plan, and guides one step at a time. The app owns the recipe, quantities, current
step and completed history. Done advances deterministically; ordinary questions
and unexpected changes reach the same agent through text or push-to-talk.

The core demonstration: begin a pasta dish, complete preparation, discover that
cream is missing, adapt the remaining sauce instructions and continue without
rewriting completed work. This exact public scenario still needs rehearsal; it
is not an account of an observed Natalia cooking session.

**Architecture:** TypeScript, Next.js/React; CookingAgent reasons through the
small replaceable LLMProvider boundary; CookingSessionStore validates and applies
operations in server memory. Model JSON is untrusted. History/progression are
application state rather than a chat transcript. No database/auth/RAG.

**Open weights:** Sous reasons with Mistral Small 4 (`mistral-small-2603`,
Apache 2.0 open weights), served by Mistral's hosted API. It uses native JSON
Schema for each response contract, with Sous validation on top.
- **How it was chosen:** after benchmarks against Gemma 4 and Gemini Flash-Lite.
  Hosted Gemma was too slow for interactive cooking.
- **What open weights allow:** other hosting, self-hosting or fine-tuning, in
  principle. Local/offline inference is not implemented or verified.
- **Alternates:** Gemma and Flash-Lite remain selectable but are not the default.
- **Not yet verified:** the public deployment's actual configuration.

**Voice:** ElevenLabs Scribe v2 transcribes finite explicitly initiated recordings
using server-issued single-use browser tokens. Recognized text uses the same
cooking application path. Server-side Flash v2.5 TTS returns useful instructions
and known quantities for browser playback. English and Polish share the path.
Natural physical microphone accuracy and phone playback await reported checks.

**Hosting:** Prepared for one Render Node web service, one always-on instance,
secure cookies and HTTPS; actual deployment is pending. Sessions survive reload
only while that process lives; restart/redeploy loses them and Start again recovers.

**Deliberate scope:** wake-word feasibility received a NO-GO after reliability,
shipping and browser constraints were reviewed. Push-to-talk shipped; no continuous
or background listening claim. Task 7 is feature freeze.

**Recipe planning:** ingredient-aware model reasoning, no external recipe database.
Task 6.2 adds a conservative pantry: only water, salt, black pepper and cooking
oil are assumed. Proposals list optional additions separately, and adaptive
changes cannot treat an unconfirmed ingredient as available. This is enforced in
code and tested deterministically; the live quality evaluation is pending.

**Limitations:** network/account/quota dependency; in-memory sessions; no persistent
pantry/history, auth or rate limiting; browser microphone/autoplay constraints;
probabilistic culinary reasoning and conservative partial-ingredient tracking;
no timer scheduler or wake word. Physical Safari/iOS and Android/Chrome results
are not yet established. No eligibility, partner/category or fully offline claim.

Repository: https://github.com/dkida/sous (configured Git remote; accessibility
not independently verified).
Live demo: **PENDING — assigned public HTTPS Render URL**.
Video: **PENDING — recording URL**.
Screenshots: **PENDING — public product captures**.
Natalia findings: **PENDING — actual owner observations**.

Adapt this draft to the actual submission form after public gates pass. Confirm
any event/category/partner eligibility against its official requirements first.
