import { CookingAgent, CookingAgentError } from "../application/cooking-agent";
import type { LLMProvider } from "../application/llm-provider";
import { InvalidRecipeError, hasOnlyKeys, isRecord } from "../domain/recipe-validation";
import { InvalidAdaptiveActionError } from "../domain/adaptive-action";
import type { CookingCommand, CookingReply, WebCookingState } from "./contracts";

interface Flow {
  agent: CookingAgent;
  state: WebCookingState;
  busy: boolean;
}
export interface ServiceReply { status: number; body: CookingReply; id?: string }
const emptyState = (): WebCookingState => ({ proposal: null, progress: null, response: null });
const failure = (status: number, code: NonNullable<CookingReply["error"]>["code"], message: string, state: WebCookingState | null = null): ServiceReply =>
  ({ status, body: { state: structuredClone(state), error: { code, message } } });

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
    const command = this.command(input);
    if (!command) return failure(400, "invalid", "That request is incomplete. Please try again.", id ? this.flows.get(id)?.state ?? null : null);
    let flow = id ? this.flows.get(id) : undefined;
    if (id && !flow && command.action !== "reset") return this.missing();
    if (flow?.busy) return failure(409, "busy", "Sous is still working. Wait for the response, then try again.", flow.state);
    if (command.action === "reset") {
      if (id) this.flows.delete(id);
      return { status: 200, body: { state: emptyState() } };
    }
    if (!flow) {
      if (command.action !== "propose") return this.missing();
      try {
        id = crypto.randomUUID();
        // Each retained agent owns its existing in-memory CookingSessionStore.
        flow = { agent: new CookingAgent(this.createProvider(), undefined, id), state: emptyState(), busy: false };
        this.flows.set(id, flow);
      } catch {
        return failure(503, "unavailable", "Sous cannot connect to the cooking service right now. Please try again later.");
      }
    }
    const active = flow;
    active.busy = true;
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
      return this.snapshot(id!, active);
    } catch (error) {
      // Fixed public messages: never serialize raw errors, configuration or diagnostics.
      const message = error instanceof InvalidRecipeError || error instanceof InvalidAdaptiveActionError || error instanceof CookingAgentError
        ? "Sous could not use that response. Your cooking state is unchanged. Please retry or clarify your request."
        : "Sous could not get a cooking response. Your cooking state is unchanged. Please try again.";
      return { ...failure(502, "model", message, active.state), id };
    } finally {
      active.busy = false;
    }
  }

  private snapshot(id: string, flow: Flow): ServiceReply {
    return { status: 200, id, body: { state: structuredClone(flow.state) } };
  }
  private missing(): ServiceReply {
    return failure(410, "missing", "This cooking session is no longer available. Start again with your ingredients.");
  }
  private invalid(flow: Flow): ServiceReply {
    return failure(409, "invalid", "That action does not match the current cooking step. The latest state is shown; please try again.", flow.state);
  }
  private command(input: unknown): CookingCommand | null {
    if (!isRecord(input)) return null;
    const text = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= 4000;
    switch (input.action) {
      case "propose": return hasOnlyKeys(input, ["action", "ingredients"]) && text(input.ingredients) ? input as CookingCommand : null;
      case "adapt": return hasOnlyKeys(input, ["action", "message"]) && text(input.message) ? input as CookingCommand : null;
      case "complete": return hasOnlyKeys(input, ["action", "expectedStepId"]) && text(input.expectedStepId) ? input as CookingCommand : null;
      case "accept": case "current": case "reset": return hasOnlyKeys(input, ["action"]) ? input as CookingCommand : null;
      default: return null;
    }
  }
}
