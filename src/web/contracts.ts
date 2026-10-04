import type { DishProposal, CookingProgress } from "../application/cooking-agent";

export interface WebCookingState {
  proposal: DishProposal | null;
  progress: CookingProgress | null;
  response: { kind: "changed" | "advice" | "clarification"; message: string } | null;
}
export type CookingCommand =
  | { action: "propose"; ingredients: string }
  | { action: "accept" }
  | { action: "current" }
  | { action: "complete"; expectedStepId: string }
  | { action: "adapt"; message: string }
  | { action: "reset" };
export interface CookingReply {
  state: WebCookingState | null;
  error?: { code: "missing" | "invalid" | "busy" | "model" | "unavailable"; message: string };
}
