import type { Language } from "../shared/language";
import type { CopyKey } from "./i18n";
import type { DishProposal, CookingProgress } from "../application/cooking-agent";

export interface WebCookingState {
  proposal: DishProposal | null;
  progress: CookingProgress | null;
  response: { kind: "changed" | "advice" | "clarification"; message: string } | null;
}
export type CookingCommand =
  | { action: "propose"; ingredients: string; language?: Language }
  | { action: "accept" }
  | { action: "current" }
  | { action: "complete"; expectedStepId: string }
  | { action: "adapt"; message: string }
  | { action: "reset" };
export interface CookingReply {
  language?: Language;
  revision?: string;
  speech?: { id: string; text: string };
  state: WebCookingState | null;
  error?: { code: "missing" | "invalid" | "busy" | "model" | "unavailable"; message: string; key?: CopyKey };
}
