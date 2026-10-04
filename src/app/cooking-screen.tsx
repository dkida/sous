"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatIngredient } from "../web/ingredient-format";
import type { CookingCommand, CookingReply, WebCookingState } from "../web/contracts";

const initial: WebCookingState = { proposal: null, progress: null, response: null };
const number = (value: number) => String(value).padStart(2, "0");

export default function CookingScreen() {
  const [state, setState] = useState(initial);
  const [ingredients, setIngredients] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("Opening the kitchen");
  const [error, setError] = useState<CookingReply["error"]>();
  const [notice, setNotice] = useState("");
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const lock = useRef(true);
  const instruction = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1001px)");
    setIngredientsOpen(desktop.matches);
    const resize = (event: MediaQueryListEvent) => setIngredientsOpen(event.matches);
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/cooking", { cache: "no-store" }).then(async (response) => {
      const reply = await response.json() as CookingReply;
      if (mounted) {
        if (reply.state) setState(reply.state);
        setError(reply.error);
      }
    }).catch(() => {
      if (mounted) setError({ code: "unavailable", message: "Sous could not open the kitchen. Please try again." });
    }).finally(() => { if (mounted) { lock.current = false; setBusy(""); } });
    return () => { mounted = false; };
  }, []);

  async function send(command: CookingCommand): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setError(undefined);
    setNotice("");
    setBusy(command.action === "propose" ? "Finding a dish" : command.action === "accept" ? "Preparing your cooking plan" : command.action === "adapt" ? "Thinking through your change" : "Updating the kitchen");
    try {
      const response = await fetch("/api/cooking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const reply = await response.json() as CookingReply;
      if (reply.state) setState(reply.state);
      setError(reply.error);
      if (!response.ok) return false;
      if (command.action === "adapt") setMessage("");
      if (command.action === "reset") { setIngredients(""); setMessage(""); setState(initial); }
      if (command.action === "current") {
        setNotice("Current step shown. Complete it when you’re ready.");
      }
      if (["current", "complete", "accept"].includes(command.action)) requestAnimationFrame(() => instruction.current?.focus());
      return true;
    } catch {
      // Keep typed input and the last confirmed server snapshot for manual retry.
      setError({ code: "unavailable", message: "The connection was interrupted. Use Show current step to check cooking progress, or retry your request." });
      return false;
    } finally { lock.current = false; setBusy(""); }
  }

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
  const clause = firstSentence.length > 65 ? /(,\s+)|\s+(?=\()|\s+(?:and|then|while|until|according to)\s+/i.exec(firstSentence) : null;
  const splitAt = clause ? clause.index + (clause[1] ? 1 : 0) : 0;
  const hero = clause ? firstSentence.slice(0, splitAt) : firstSentence;
  const detail = [clause ? firstSentence.slice(splitAt).trim() : "", ...sentences.slice(1)].filter(Boolean).join(" ");
  const relevantIngredients = recipe?.ingredients.filter((item) => step?.ingredientIds.includes(item.id)) ?? [];
  function submitIngredients(event: FormEvent) { event.preventDefault(); void send({ action: "propose", ingredients }); }
  function submitMessage(event: FormEvent) { event.preventDefault(); void send({ action: "adapt", message }); }

  return (
    <main className={`kitchen ${step ? "cooking" : ""}`} aria-busy={Boolean(busy)}>
      <div className="edition"><span>PASS / MISE EN PLACE</span><span>ONE THING AT A TIME.</span></div>
      <section className={`surface ${progress && !completed ? "is-cooking" : ""}`} aria-label="Sous cooking companion">
        <header className="masthead">
          <a className="wordmark" href="/" aria-label="Sous — return to your cooking session">SOUS</a>
          <span className="dish-label">{recipe?.title ?? state.proposal?.dishName ?? "YOUR KITCHEN COMPANION"}</span>
          {recipe ? <div className="step-count"><strong>{number(completed ? recipe.steps.length : stepIndex + 1)}</strong><span>/ {number(recipe.steps.length)}</span></div> : <span className="header-note">LET’S MAKE SOMETHING GOOD.</span>}
        </header>
        {!progress && <ol className="phases" aria-label="Cooking journey">{["Ingredients", "Proposal", "Cooking", "Complete"].map((label, index) => <li key={label} aria-current={(index === (phase === 4 ? 3 : phase)) ? "step" : undefined}><span>{number(index + 1)}</span>{label}</li>)}</ol>}
        {error && <div className="error" role="alert"><span>{error.message}</span>{error.code === "missing" && <button className="text-button" disabled={Boolean(busy)} onClick={() => void send({ action: "reset" })}>Start again →</button>}</div>}
        <div className="live-status sr-only" role="status">{busy || notice}</div>

        {!progress && !state.proposal && <div className="entry-layout">
          <div className="entry-main"><p className="eyebrow">01 / INGREDIENTS</p><h1>WHAT DO<br />YOU HAVE?</h1><p className="intro">A few ingredients. A dish worth making.<br />Tell Sous what’s in your kitchen.</p>
            <form onSubmit={submitIngredients}>
              <label className="eyebrow" htmlFor="ingredients">ON YOUR COUNTER</label>
              <textarea id="ingredients" maxLength={4000} rows={3} required placeholder="Pasta, tomatoes, garlic, parmesan…" value={ingredients} onChange={(event) => setIngredients(event.target.value)} disabled={Boolean(busy)} />
              <button className="primary" disabled={Boolean(busy) || !ingredients.trim() || error?.code === "missing"}>{busy || "Find something to cook"}<span aria-hidden="true">→</span></button>
            </form>
          </div>
          <aside className="entry-aside"><p className="eyebrow">MISE EN PLACE</p><p>Start with<br />what you have.</p><div className="aside-rule">Include any quantities, how many people you’re cooking for, and anything you’d like to avoid.</div><span className="small-copy">Sous takes you from ingredients to the last step. You can ask for changes as you cook.</span></aside>
        </div>}

        {state.proposal && <div className="entry-layout proposal-layout">
          <div className="entry-main"><p className="eyebrow">02 / PROPOSAL</p><h1>{state.proposal.dishName}</h1><p className="intro">{state.proposal.description}</p><p className="proposal-note">Sound good? Sous will prepare the steps, then we’ll cook one at a time.</p></div>
          <aside className="proposal-facts"><div><strong>{state.proposal.estimatedCookingMinutes}</strong><span className="eyebrow">MINUTES / ESTIMATED</span></div><div><strong>{state.proposal.servings}</strong><span className="eyebrow">SERVINGS</span></div></aside>
        </div>}

        {step && recipe && <>
          <div className="cooking-work">
            <aside className="work-rail" aria-label={`Step ${stepIndex + 1} of ${recipe.steps.length}`}><strong>{number(stepIndex + 1)}</strong><span className="rail-caption">IN THE KITCHEN</span><div className="rail-marks" aria-hidden="true">{recipe.steps.map((item, index) => <i key={item.id} className={index <= stepIndex ? "passed" : ""} />)}</div></aside>
            <div className="step-content">
            <div className="current-action"><p className="eyebrow">STEP {number(stepIndex + 1)} / DO THIS NOW</p><h1 ref={instruction} tabIndex={-1} className={hero.length > 80 ? "long-instruction" : undefined}>{hero}</h1>{detail && <p className="instruction-detail">{detail}</p>}
              {relevantIngredients.length > 0 && <div className="quantities"><p className="eyebrow">FOR THIS STEP</p><ul>{relevantIngredients.map((item) => <li key={item.id}>{formatIngredient(item)}</li>)}</ul></div>}
            </div>
            {state.response && <div className="adaptation" role="status"><p className="eyebrow">{state.response.kind === "changed" ? "PLAN UPDATED" : state.response.kind === "clarification" ? "A QUICK QUESTION" : "FROM SOUS"}</p><p>{state.response.message}</p></div>}
            <div className="up-next"><span className="eyebrow">{nextStep ? "UP NEXT" : "LAST STEP"}</span><p>{nextStep ? nextStep.instruction : "Then it’s time to eat."}</p></div>
            </div>
            <aside className="cooking-meta" aria-label="Full recipe ingredients"><p className="eyebrow">FULL RECIPE</p><details open={ingredientsOpen} onToggle={(event) => setIngredientsOpen(event.currentTarget.open)}><summary>Ingredients</summary><ul>{recipe.ingredients.map((item) => <li key={item.id}>{formatIngredient(item)}</li>)}</ul></details><p className="recipe-metadata">{recipe.servings} servings · Cooking</p><button className="text-button start-over" disabled={Boolean(busy)} onClick={() => void send({ action: "reset" })}>Start over</button></aside>
          </div>
        </>}

        {completed && recipe && <div className="finished"><p className="eyebrow">{number(recipe.steps.length)} / {number(recipe.steps.length)} STEPS COMPLETE</p><h1>TO THE<br />TABLE.</h1><p className="finished-dish">{recipe.title}</p><p className="intro">All steps complete. Enjoy what you’ve made.</p>{state.response && <p className="completion-response">{state.response.message}</p>}<div className="finished-facts"><span>{recipe.servings} servings</span><span>{recipe.steps.length} steps completed</span></div></div>}

        {(progress || state.proposal) && <footer className="action-strip">
          {step && <>
            <div className="deterministic"><span className="eyebrow">{busy ? "WORKING" : "AT YOUR PACE"}</span><div className="step-buttons"><button className="secondary" disabled={Boolean(busy)} onClick={() => void send({ action: "current" })}>Show current step</button><button className="primary" disabled={Boolean(busy)} onClick={() => void send({ action: "complete", expectedStepId: step.id })}>Done · next <span aria-hidden="true">→</span></button></div></div>
            <form className="ask-form" onSubmit={submitMessage}><label htmlFor="question" className="eyebrow">{busy || "ASK SOUS / NEED TO CHANGE SOMETHING?"}</label><div className="ask-row"><input id="question" maxLength={4000} required placeholder="I don’t have tomato paste…" value={message} onChange={(event) => setMessage(event.target.value)} disabled={Boolean(busy)} /><button className="send-button" disabled={Boolean(busy) || !message.trim()}>Ask <span aria-hidden="true">→</span></button></div></form>
          </>}
          {state.proposal && <><span className="strip-copy">{busy || "YOUR INGREDIENTS. YOUR NEXT DISH."}</span><div className="proposal-buttons"><button className="secondary" disabled={Boolean(busy)} onClick={() => void send({ action: "reset" })}>Start over</button><button className="primary" disabled={Boolean(busy)} onClick={() => void send({ action: "accept" })}>{busy ? "Preparing the plan…" : "Let’s cook"}<span aria-hidden="true">→</span></button></div></>}
          {completed && <><span className="strip-copy">THE KITCHEN IS YOURS.</span><button className="primary" disabled={Boolean(busy)} onClick={() => void send({ action: "reset" })}>Cook something else <span aria-hidden="true">→</span></button></>}
        </footer>}
      </section>
      <div className="page-foot"><span>SOUS / ONE DISH, FROM START TO FINISH.</span><span>MADE FOR THE KITCHEN.</span></div>
    </main>
  );
}
