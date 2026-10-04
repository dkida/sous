import { isLanguage, type Language } from "../shared/language";
import { copy, type CopyKey } from "./i18n";
import { CookingAgent, CookingAgentError } from "../application/cooking-agent";
import type { LLMProvider } from "../application/llm-provider";
import { InvalidRecipeError, hasOnlyKeys, isRecord } from "../domain/recipe-validation";
import { InvalidAdaptiveActionError } from "../domain/adaptive-action";
import { cookingInput, spokenResponse } from "./cooking-input";
import type { CookingCommand, CookingReply, WebCookingState } from "./contracts";

interface Flow {
  agent: CookingAgent;
  language: Language;
  state: WebCookingState;
  busy: boolean;
  revision: string;
  requests: Set<string>;
  speech?: { id: string; text: string };
}
export interface ServiceReply { status: number; body: CookingReply; id?: string }
const emptyState = (): WebCookingState => ({ proposal: null, progress: null, response: null });
const failure = (status: number, code: NonNullable<CookingReply["error"]>["code"], key: CopyKey, state: WebCookingState | null = null, language?: Language): ServiceReply =>
  ({ status, body: { state: structuredClone(state), error: { code, message: copy[language ?? "en"][key], key }, language } });

/** Transport orchestration only; the existing agent/store own all cooking behavior. */
export class WebCookingService {
  private readonly flows = new Map<string, Flow>();
  constructor(private readonly createProvider: () => LLMProvider) {}

  read(id?: string): ServiceReply {
    if (!id) return { status: 200, body: { state: emptyState() } };
    const flow = this.flows.get(id);
    return flow ? this.snapshot(id, flow) : this.missing();
  }

  async execute(id: string | undefined, input: unknown): Promise<ServiceReply> {
    const language = (id ? this.flows.get(id)?.language : undefined) ?? (isRecord(input) && isLanguage(input.language) ? input.language : undefined);
    if (!isRecord(input)) return failure(400, "invalid", "incomplete", null, language);
    const { expectedRevision, requestId, ...payload } = input;
    if ((expectedRevision !== undefined && typeof expectedRevision !== "string") ||
        (requestId !== undefined && (typeof requestId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(requestId)))) {
      return failure(400, "invalid", "incomplete", null, language);
    }
    let command = this.command(payload);
    if (!command) return failure(400, "invalid", "incomplete", id ? this.flows.get(id)?.state ?? null : null, language);
    let flow = id ? this.flows.get(id) : undefined;
    if (id && !flow && command.action !== "reset") return this.missing();
    if (flow?.busy) return failure(409, "busy", "busyError", flow.state, flow.language);
    if (flow && ((expectedRevision !== undefined && expectedRevision !== flow.revision) || (typeof requestId === "string" && flow.requests.has(requestId)))) return this.invalid(flow);
    if (flow && command.action === "propose" && (command.language ?? "en") !== flow.language) return this.invalid(flow);
    if (flow && command.action === "adapt") command = cookingInput(command.message, flow.state, flow.language);
    if (command.action === "reset") {
      if (id) this.flows.delete(id);
      return { status: 200, body: { state: emptyState() } };
    }
    if (!flow) {
      if (command.action !== "propose") return this.missing();
      try {
        id = crypto.randomUUID();
        // Each retained agent owns its existing in-memory CookingSessionStore.
        flow = { agent: new CookingAgent(this.createProvider(), undefined, id, undefined, language ?? "en"), language: language ?? "en", state: emptyState(), busy: false, revision: crypto.randomUUID(), requests: new Set() };
        this.flows.set(id, flow);
      } catch {
        return failure(503, "unavailable", "unavailable", null, language);
      }
    }
    const active = flow;
    active.busy = true;
    if (typeof requestId === "string") {
      active.requests.add(requestId);
      if (active.requests.size > 100) active.requests.delete(active.requests.values().next().value!);
    }
    try {
      switch (command.action) {
        case "propose":
          if (active.state.proposal || active.state.progress) return this.invalid(active);
          active.state.proposal = await active.agent.proposeDish(command.ingredients);
          break;
        case "accept":
          if (!active.state.proposal || active.state.progress) return this.invalid(active);
          active.state.progress = await active.agent.acceptProposal();
          active.state.proposal = null;
          break;
        case "current":
          if (!active.state.progress) return this.invalid(active);
          active.state.progress = active.agent.getCurrentStep();
          break;
        case "complete":
          if (active.state.progress?.session.status !== "cooking" || active.state.progress.currentStep?.id !== command.expectedStepId) return this.invalid(active);
          active.state.progress = active.agent.completeCurrentStep(command.expectedStepId);
          active.state.response = null;
          break;
        case "adapt": {
          if (active.state.progress?.session.status !== "cooking") return this.invalid(active);
          const before = active.state.progress;
          const result = await active.agent.adaptCooking(command.message);
          active.state.progress = { session: result.session, currentStep: result.currentStep };
          active.state.response = {
            kind: result.action.type === "clarification" ? "clarification" : JSON.stringify(before.session) === JSON.stringify(result.session) ? "advice" : "changed",
            message: result.message,
          };
          break;
        }
      }
      if (command.action !== "current") active.revision = crypto.randomUUID();
      active.speech = { id: crypto.randomUUID(), text: spokenResponse(command, active.state, active.language) };
      const result = this.snapshot(id!, active);
      if (requestId && active.speech.text) result.body.speech = structuredClone(active.speech);
      return result;
    } catch (error) {
      // Fixed public messages: never serialize raw errors, configuration or diagnostics.
      const key = error instanceof InvalidRecipeError || error instanceof InvalidAdaptiveActionError || error instanceof CookingAgentError
        ? "invalidResponse"
        : "modelError";
      return { status: 502, id, body: { ...failure(502, "model", key, active.state, active.language).body, revision: active.revision } };
    } finally {
      active.busy = false;
    }
  }

  speech(id: string | undefined, speechId: string, revision: string): string | null {
    const flow = id ? this.flows.get(id) : undefined;
    return flow && !flow.busy && flow.revision === revision && flow.speech?.id === speechId ? flow.speech.text : null;
  }

  private snapshot(id: string, flow: Flow): ServiceReply {
    return { status: 200, id, body: { state: structuredClone(flow.state), revision: flow.revision, language: flow.language } };
  }
  private missing(): ServiceReply {
    return failure(410, "missing", "missing");
  }
  private invalid(flow: Flow): ServiceReply {
    const result = failure(409, "invalid", "stale", flow.state, flow.language);
    result.body.revision = flow.revision;
    return result;
  }
  private command(input: unknown): CookingCommand | null {
    if (!isRecord(input)) return null;
    const text = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 4000;
    switch (input.action) {
      case "propose": return hasOnlyKeys(input, ["action", "ingredients", "language"]) && (input.language === undefined || isLanguage(input.language)) && text(input.ingredients) ? input as CookingCommand : null;
      case "adapt": return hasOnlyKeys(input, ["action", "message"]) && text(input.message) ? input as CookingCommand : null;
      case "complete": return hasOnlyKeys(input, ["action", "expectedStepId"]) && text(input.expectedStepId) ? input as CookingCommand : null;
      case "accept": case "current": case "reset": return hasOnlyKeys(input, ["action"]) ? input as CookingCommand : null;
      default: return null;
    }
  }
}
