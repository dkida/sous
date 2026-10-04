# Task 7 release audit and Render runbook

Audited 2026-10-05 before changing deployment configuration or product code.
Baseline: master at c180a0e, with pre-existing staged/untracked planning files.
Feature freeze: no product/runtime changes made by this release preparation.

## Audit

- Next.js 16.3.8 / React / TypeScript, Node 22+, npm lockfile. Static home page
  renders the client UI; dynamic Node routes provide cooking, voice token and
  speech. A static export cannot serve the application.
- CookingAgent validates untrusted model JSON and owns one domain memory store
  per retained browser flow. The process-global WebCookingService retains its map
  across requests/dev module reloads. Voice uses that same map and agent.
- Server-only roots select the provider and ElevenLabs adapter. Credentials never
  enter the client import graph; the existing automated boundary check covers it.
- **Required for the full demo:** MISTRAL_API_KEY and ELEVENLABS_API_KEY.
- **Optional:** LLM_PROVIDER, LLM_MODEL, ELEVENLABS_VOICE_ID.
- **Deployment/runtime:** NODE_VERSION, NODE_ENV, PORT. No NEXT_PUBLIC_
  variables are required.
- **Not needed for a normal deployment:** GEMINI_API_KEY and GEMMA_MODEL. They
  apply only to the explicit Gemma or Flash-Lite alternates.
- **Production reasoning (2026-10-05):** Mistral Small 4, `mistral-small-2603`,
  is both the application default and the explicit `render.yaml` setting.
  - Each request carries its contract's native JSON Schema, and Sous validation
    still runs afterwards.
  - There is no automatic fallback.
  - Gemma and Flash-Lite remain selectable but non-default.
  - Not yet verified on a live Render deployment.
- ElevenLabs: Scribe v2 batch STT (eng/pol), server-issued one-use batch_scribe
  token, Flash v2.5 TTS (en/pl), MP3 44.1 kHz/128 kbps, existing default voice
  unless ELEVENLABS_VOICE_ID is supplied. Token issuance/TTS stay server-side;
  only finite recorded audio goes directly from browser to provider.
- Secure/HttpOnly/SameSite=Strict session cookie, path /. It is a browser-session
  cookie, not a durable recipe. APIs are no-store. Same-origin guards compare
  browser Origin host to HTTP Host because proxy TLS termination may leave the
  internal Next URL as HTTP/bind address. Verify this on the actual Render origin.
- Browser API calls are relative; no runtime localhost URLs, LAN inference or
  development-only routes. CLI commands load .env.local; production must use
  Render environment settings. Timing console output is development-only.
- Microphone needs public HTTPS, permission and MediaRecorder; localhost checks
  do not establish phone/browser compatibility or production CORS/playback.
- No authentication/rate limiting/flow expiry scheduler. Public visitors can use
  provider quota; abandoned flows stay in memory until reset/process exit.

## Source reconciliation gate

Resolved on 2026-10-05. Task 6.2 had only been specified, never implemented. It
is now implemented in this checkout and covered by deterministic tests (see
STATUS.md). The live qualitative scenarios are prepared (`npm run bench:quality`)
but not yet run.

## Deployment plan

1. Task 6.2 is implemented (see STATUS.md); re-run verification if the source
   changes again before deployment.
2. Use one native Node web service with one instance/process and no autoscaling,
   database, disk, extra worker or custom server.
3. Candidate: smallest always-on Starter instance. Account/billing confirmation
   is pending. Free is an explicit alternative with idle memory loss/cold starts.
4. Build: npm ci --include=dev && npm run build -- --webpack. Start:
   npm run start -- --hostname 0.0.0.0 --port "$PORT". Root directory: repository
   root. Pin NODE_VERSION=22.18.0; NODE_ENV=production. Render supplies PORT.
5. Configure secrets privately in Render. Blueprint sync:false prompts for key
   values without committing them. Optional voice override stays server-only.
6. Disable automatic deploys during cooking/recording. Health check / verifies
   process reachability only, not provider health. Deploy manually after checks.
7. Verify assigned HTTPS URL, actual non-secret provider/model settings, cookies,
   clean browser full flow, EN/PL voice and recovery. Capture screenshots only
   from that public product. Record exact evidence in VERIFICATION.md/STATUS.md.
8. Obtain physical phone and Natalia observations using HUMAN-CHECKS.md. Task 7
   remains open until its release gates have evidence.

## Create the service

The Render dashboard currently opens at sign-in; there is no accessible Render
CLI, API token or signed-in browser session. No service has been created.

Once access is available, commit/push the reviewed release files to the intended
repository branch (origin is github.com/dkida/sous). Connect that exact branch to
Render through a Blueprint, or enter the settings above in a Node Web Service.
Inspect the plan before creation; do not create a paid instance without billing
approval. Do not invent a subdomain: copy the assigned HTTPS URL from Render.
Supply secrets directly to Render, never through chat or Git. Confirm non-secret
provider/model selectors before testing. Record service, branch and deployed SHA.

If using an existing service, inspect it first; do not overwrite other settings or
secrets. Updating sync:false keys in YAML does not update an existing service:
set missing keys privately in its dashboard. No credentials are needed to build.

## Memory and recovery on Render

One live process preserves normal reloads and shared-cookie tabs. Separate
profiles should have independent flows. Restart/redeploy/process replacement
loses proposals, recipes, progress, clarification and speech handles. Even a
paid instance has no durable memory; zero-downtime deploys replace processes.
A disk alone would not preserve the current memory architecture.

Free spins down after 15 minutes without inbound traffic; the next visit can
cold-start for about a minute, and prior cooking state is lost. This makes Free
an unreliable uninterrupted kitchen session. Do not add keepalive workarounds.

A lost-cookie-map entry returns 410. The existing Start again button resets the
flow/deletes the cookie; no manual storage editing is needed. There is no server
TTL: test missing/stale IDs rather than invent an expiration interval. Validate
restart only using a disposable release-test session, with no real cook active.

## Public validation procedure

Use the assigned public HTTPS URL and actual production configuration. No local
harness, fixed recipe injection or development shortcut is final evidence.

- Clean browser: entry → proposal → accept → cooking → Done → adaptive change →
  real voice repeat with known quantities → completion → reset. Record wall-clock
  waits, errors and unexpected UI. This walkthrough simulates cooking, not a meal.
- Reload after an adaptation: confirm step, language, quantities and progress.
- Second tab: confirm shared state and stale-operation rejection. Separate browser
  profile/private session: confirm independent fresh entry. A second tab is not
  independent-browser evidence.
- Cookie: verify Secure, HttpOnly, SameSite=Strict and no-store API replies over
  public origin. Confirm browser same-origin requests succeed behind Render TLS.
- Disposable restart: keep a cooking session, restart/redeploy, reload, receive the
  missing-session state, Start again, and begin another session.
- Voice: speak ingredients in EN and PL, review/edit, submit; during cooking say
  repeat/powtórz and hear actionable quantities. Record microphone and speaker
  evidence separately from browser playback events/synthetic audio.
- Deny microphone and check typed fallback. Where practical, interrupt STT/TTS
  network and confirm controls recover, speech failure retains committed state,
  and no silent progression occurs. Mock coverage is separate evidence.
- Finish phone and Natalia checks. Fix only demonstrated release blockers.

## Primary deployment references

Checked 2026-10-05: [Next.js on Render](https://render.com/docs/deploy-nextjs-app),
[port/TLS requirements](https://render.com/docs/web-services),
[free-instance behavior](https://render.com/docs/free),
[Blueprint fields/secrets](https://render.com/docs/blueprint-spec),
[Node version precedence](https://render.com/docs/node-version).
Installed Next guides were read for Node deployment, environment variables and
CLI build/start flags before preparing the configuration.
