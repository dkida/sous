"use client";

import CookingComposer from "./cooking-composer";
import { languages, type Language } from "../shared/language";
import { copy, servings, servingsLabel, stepsCompleted } from "../web/i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { VoiceTurn, recordMicrophone, transcribeRecording, playResponse, type VoiceState } from "../web/voice-client";
import { formatIngredient } from "../web/ingredient-format";
import type { CookingCommand, CookingReply, WebCookingState } from "../web/contracts";

const initial: WebCookingState = { proposal: null, progress: null, response: null };
const number = (value: number) => String(value).padStart(2, "0");

export default function CookingScreen({ development = false, initialLanguage = "en" }: { development?: boolean; initialLanguage?: Language }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = copy[language];
  const [state, setState] = useState(initial);
  const [ingredients, setIngredients] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "opening" | "finding" | "preparing" | "thinkingChange" | "updating">("opening");
  const [error, setError] = useState<CookingReply["error"]>();
  const [notice, setNotice] = useState("");
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [transcript, setTranscript] = useState("");
  const voiceActive = !["idle", "error"].includes(voiceState);
  const voice = useRef<VoiceTurn | null>(null);
  const revision = useRef<string | undefined>(undefined);
  const voiceRevision = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const submitVoice = useRef<(text: string, signal: AbortSignal) => Promise<CookingReply | null>>(async () => null);
  const lock = useRef(true);
  const instruction = useRef<HTMLHeadingElement>(null);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1001px)");
    setIngredientsOpen(desktop.matches);
    const resize = (event: MediaQueryListEvent) => setIngredientsOpen(event.matches);
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const requestSequence = ++sequence.current;
    const abort = new AbortController();
    fetch("/api/cooking", { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const reply = await response.json() as CookingReply;
      if (mounted.current && requestSequence === sequence.current) {
        if (reply.state) setState(reply.state);
        revision.current = reply.revision;
        if (reply.language) setLanguage(reply.language);
        setError(reply.error);
      }
    }).catch(() => {
      if (mounted.current && requestSequence === sequence.current) setError({ code: "unavailable", message: copy[initialLanguage].openError, key: "openError" });
    }).finally(() => { if (mounted.current && requestSequence === sequence.current) { lock.current = false; setBusy(""); } });
    return () => { mounted.current = false; sequence.current++; abort.abort(); voice.current?.cancel(); };
  }, []);

  async function send(command: CookingCommand, fromVoice = false, signal?: AbortSignal): Promise<CookingReply | null> {
    if (lock.current && !fromVoice) return null;
    const requestSequence = ++sequence.current;
    lock.current = true;
    setError(undefined);
    setNotice("");
    setBusy(command.action === "propose" ? "finding" : command.action === "accept" ? "preparing" : command.action === "adapt" ? "thinkingChange" : "updating");
    try {
      const response = await fetch("/api/cooking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, expectedRevision: fromVoice ? voiceRevision.current : revision.current, requestId: crypto.randomUUID() }), signal });
      const reply = await response.json() as CookingReply;
      if (!mounted.current || requestSequence !== sequence.current || signal?.aborted) return null;
      if (reply.state) setState(reply.state);
      if (reply.language) setLanguage(reply.language);
      if (reply.revision) revision.current = reply.revision;
      setError(reply.error);
      if (!response.ok) return reply;
      if (command.action === "adapt") setMessage("");
      if (command.action === "reset") { revision.current = undefined; setTranscript(""); setVoiceError(""); setVoiceState("idle"); setIngredients(""); setMessage(""); setState(initial); }
      if (command.action === "current") {
        setNotice("currentNotice");
      }
      if (["current", "complete", "accept"].includes(command.action)) requestAnimationFrame(() => instruction.current?.focus());
      return reply;
    } catch {
      // Keep typed input and the last confirmed server snapshot for manual retry.
      if (!mounted.current || requestSequence !== sequence.current || signal?.aborted) return null;
      setError({ code: "unavailable", message: t.connection, key: "connection" });
      return null;
    } finally {
      if (mounted.current && requestSequence === sequence.current) { if (!fromVoice) lock.current = false; setBusy(""); }
    }
  }

  submitVoice.current = (text, signal) => send({ action: "adapt", message: text }, true, signal);
  useEffect(() => {
    voice.current = new VoiceTurn({
      language,
      record: recordMicrophone,
      async token(signal) {
        const response = await fetch("/api/voice/token", { method: "POST", signal });
        if (!response.ok) throw new Error("Voice unavailable");
        return (await response.json()).token;
      },
      transcribe: (audio, token, signal) => transcribeRecording(audio, token, signal, language),
      submit: (text, signal) => submitVoice.current(text, signal),
      play: playResponse,
      transcript: (text) => { if (mounted.current) setTranscript(text); },
      state(value, error) {
        if (!mounted.current) return;
        setVoiceState(value);
        setVoiceError(error ?? "");
        if (value === "idle" || value === "error") setTranscript("");
        if (value === "idle" || value === "error") lock.current = false;
      },
      timing: development ? (metrics) => console.info("[sous voice timing]", metrics) : undefined,
    });
    const stop = () => voice.current?.cancel();
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => { voice.current?.cancel(); window.removeEventListener("pagehide", stop); document.removeEventListener("visibilitychange", hidden); };
  }, [development, language]);

  function startVoice() {
    if (lock.current) return;
    lock.current = true;
    voiceRevision.current = revision.current;
    setError(undefined);
    setNotice("");
    voice.current?.start();
  }

  const busyCopy = busy ? t[busy] : "";
  const languageLocked = Boolean(busy) || voiceActive || Boolean(revision.current) || Boolean(state.proposal || state.progress);
  const progress = state.progress;
  const session = progress?.session;
  const recipe = session?.recipe;
  const step = progress?.currentStep;
  const completed = session?.status === "completed";
  const stepIndex = recipe?.steps.findIndex((item) => item.id === step?.id) ?? -1;
  const nextStep = recipe?.steps[stepIndex + 1];
  const phase = completed ? 4 : progress ? 2 : state.proposal ? 1 : 0;
  const sentences = step?.instruction.split(/(?<=[.!?])\s+/) ?? [];
  const firstSentence = sentences[0] ?? "";
  // A typographic split only: retain every word of the server-owned instruction.
  const clauseMatch = firstSentence.length > 65 ? /(,\s+)|\s+(?=\()|\s+(?:and|then|while|until|according to)\s+/i.exec(firstSentence) : null;
  const clause = clauseMatch && clauseMatch.index >= 25 ? clauseMatch : null;
  const splitAt = clause ? clause.index + (clause[1] ? 1 : 0) : 0;
  const hero = clause ? firstSentence.slice(0, splitAt) : firstSentence;
  const detail = [clause ? firstSentence.slice(splitAt).trim() : "", ...sentences.slice(1)].filter(Boolean).join(" ");
  const relevantIngredients = recipe?.ingredients.filter((item) => step?.ingredientIds.includes(item.id)) ?? [];
  function submitIngredients(event: FormEvent) { event.preventDefault(); void send({ action: "propose", ingredients, language }); }
  function submitMessage() { void send({ action: "adapt", message }); }

  return (
    <main className={`kitchen ${step ? "cooking" : ""}`} aria-busy={Boolean(busy)} lang={language}>
      <div className="edition"><span>PASS / MISE EN PLACE</span><span>{t.oneThing}</span></div>
      <section className={`surface ${progress && !completed ? "is-cooking" : ""}`} aria-label={t.companion}>
        <header className="masthead">
          <a className="wordmark" href="/" aria-label={t.returnSession}>SOUS</a>
          <span className="dish-label">{recipe?.title ?? state.proposal?.dishName ?? t.kitchenCompanion}</span>
          {recipe ? <div className="step-count"><strong>{number(completed ? recipe.steps.length : stepIndex + 1)}</strong><span>/ {number(recipe.steps.length)}</span></div> : <span className="header-note">{t.makeGood}</span>}
          <div className="language-switch" role="group" aria-label={t.language} title={languageLocked ? t.languageLocked : t.languageBefore}>
            {languages.map((value) => <button type="button" key={value} lang={value} aria-label={value === "en" ? "English" : "Polski"} aria-pressed={language === value} disabled={languageLocked} onClick={() => { if (!languageLocked && !lock.current) setLanguage(value); }}>{value.toUpperCase()}</button>)}
            <span className="sr-only">{languageLocked ? t.languageLocked : t.languageBefore}</span>
          </div>
        </header>
        {!progress && <ol className="phases" aria-label={t.journey}>{[t.ingredients, t.proposal, t.cooking, t.complete].map((label, index) => <li key={label} aria-current={(index === (phase === 4 ? 3 : phase)) ? "step" : undefined}><span>{number(index + 1)}</span>{label}</li>)}</ol>}
        {error && <div className="error" role="alert"><span>{error.key ? t[error.key] : error.message}</span>{(error.code === "missing" || Boolean(revision.current) && !progress && !state.proposal) && <button className="text-button" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "reset" })}>{t.startAgain}</button>}</div>}
        <div className="live-status sr-only" role="status">{busyCopy || (notice ? t.currentNotice : "")}</div>

        {!progress && !state.proposal && <div className="entry-layout">
          <div className="entry-main"><p className="eyebrow">{t.entryLabel}</p><h1>{t.whatDo}<br />{t.youHave}</h1><p className="intro">{t.introOne}<br />{t.introTwo}</p>
            <form onSubmit={submitIngredients}>
              <label className="eyebrow" htmlFor="ingredients">{t.counter}</label>
              <textarea id="ingredients" maxLength={4000} rows={3} required placeholder={t.ingredientsPlaceholder} value={ingredients} onChange={(event) => setIngredients(event.target.value)} disabled={voiceActive || Boolean(busy)} />
              <button className="primary" disabled={voiceActive || Boolean(busy) || !ingredients.trim() || error?.code === "missing"}>{busyCopy || t.findDish}<span aria-hidden="true">→</span></button>
            </form>
          </div>
          <aside className="entry-aside"><p className="eyebrow">MISE EN PLACE</p><p>{t.startWith}<br />{t.whatYouHave}</p><div className="aside-rule">{t.includeQuantities}</div><span className="small-copy">{t.takesYou}</span></aside>
        </div>}

        {state.proposal && <div className="entry-layout proposal-layout">
          <div className="entry-main"><p className="eyebrow">{t.proposalLabel}</p><h1>{state.proposal.dishName}</h1><p className="intro">{state.proposal.description}</p><p className="proposal-note">{t.soundGood}</p></div>
          <aside className="proposal-facts"><div><strong>{state.proposal.estimatedCookingMinutes}</strong><span className="eyebrow">{t.estimated}</span></div><div><strong>{state.proposal.servings}</strong><span className="eyebrow">{servingsLabel(state.proposal.servings, language)}</span></div></aside>
        </div>}

        {step && recipe && <>
          <div className="cooking-work">
            <aside className="work-rail" aria-label={`${t.step} ${stepIndex + 1} ${t.of} ${recipe.steps.length}`}><strong>{number(stepIndex + 1)}</strong><span className="rail-caption">{t.inKitchen}</span><div className="rail-marks" aria-hidden="true">{recipe.steps.map((item, index) => <i key={item.id} className={index <= stepIndex ? "passed" : ""} />)}</div></aside>
            <div className="step-content">
            <div className="current-action"><p className="eyebrow">{t.step} {number(stepIndex + 1)} / {t.doNow}</p><h1 ref={instruction} tabIndex={-1} className={hero.length > 80 ? "long-instruction" : undefined}>{hero}</h1>{detail && <p className="instruction-detail">{detail}</p>}
              {relevantIngredients.length > 0 && <div className="quantities"><p className="eyebrow">{t.forStep}</p><ul>{relevantIngredients.map((item) => <li key={item.id}>{formatIngredient(item, language)}</li>)}</ul></div>}
            </div>
            {state.response && <div className="adaptation" role="status"><p className="eyebrow">{state.response.kind === "changed" ? t.updated : state.response.kind === "clarification" ? t.question : t.fromSous}</p><p>{state.response.message}</p></div>}
            <div className="up-next"><span className="eyebrow">{nextStep ? t.upNext : t.lastStep}</span><p>{nextStep ? nextStep.instruction : t.timeToEat}</p></div>
            </div>
            <aside className="cooking-meta" aria-label={t.fullIngredients}><p className="eyebrow">{t.fullRecipe}</p><details open={ingredientsOpen} onToggle={(event) => setIngredientsOpen(event.currentTarget.open)}><summary>{t.ingredients}</summary><ul>{recipe.ingredients.map((item) => <li key={item.id}>{formatIngredient(item, language)}</li>)}</ul></details><p className="recipe-metadata">{servings(recipe.servings, language)} · {t.cooking}</p><button className="text-button start-over" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "reset" })}>{t.startOver}</button></aside>
          </div>
        </>}

        {completed && recipe && <div className="finished"><p className="eyebrow">{number(recipe.steps.length)} / {number(recipe.steps.length)} {t.stepsComplete}</p><h1>{t.toThe}<br />{t.table}</h1><p className="finished-dish">{recipe.title}</p><p className="intro">{t.enjoy}</p>{state.response && <p className="completion-response">{state.response.message}</p>}<div className="finished-facts"><span>{servings(recipe.servings, language)}</span><span>{stepsCompleted(recipe.steps.length, language)}</span></div></div>}

        {(progress || state.proposal) && <footer className="action-strip">
          {(step || voiceActive) && <CookingComposer language={language} message={message} busy={Boolean(busy)} systemStatus={busy === "thinkingChange" ? t.thinking : t.working} voiceState={voiceState}
              voiceError={voiceError} transcript={transcript}
              onMessage={(value) => { setMessage(value); if (voiceState === "error") { setVoiceError(""); setVoiceState("idle"); } }}
              onSend={submitMessage} onRecord={startVoice}
              onFinish={() => { void voice.current?.finish(); }} onCancel={() => voice.current?.cancel()} />}
          {completed && voiceError && <p className="composer-error" role="alert" title={voiceError}>{t.voiceRecovery}</p>}
          {step && <div className="deterministic"><span className="eyebrow">{busy ? t.working : t.atPace}</span><button className="primary" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "complete", expectedStepId: step.id })}>{t.doneNext} <span aria-hidden="true">→</span></button></div>}
          {state.proposal && <><span className="strip-copy">{busyCopy || t.nextDish}</span><div className="proposal-buttons"><button className="secondary" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "reset" })}>{t.startOver}</button><button className="primary" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "accept" })}>{busy ? t.preparingPlan : t.letsCook}<span aria-hidden="true">→</span></button></div></>}
          {completed && <><span className="strip-copy">{t.kitchenYours}</span><button className="primary" disabled={voiceActive || Boolean(busy)} onClick={() => void send({ action: "reset" })}>{t.cookElse} <span aria-hidden="true">→</span></button></>}
        </footer>}
      </section>
      <div className="page-foot"><span>{t.oneDish}</span><span>{t.madeKitchen}</span></div>
    </main>
  );
}
