import type { Language } from "../shared/language";
import { copy } from "./i18n";
import type { CookingCommand, WebCookingState } from "./contracts";

/** Shared by typed and transcribed cooking input; exact commands only. */
export function cookingInput(message: string, state: WebCookingState, language: Language = "en"): CookingCommand {
  const command = message.trim().toLowerCase().replace(/[?.!]+$/, "");
  const step = state.progress?.currentStep;
  if (step && (language === "pl" ? ["gotowe", "zrobione", "dalej", "ukończone"] : ["done", "complete", "completed"]).includes(command)) return { action: "complete", expectedStepId: step.id };
  if ((language === "pl" ? ["teraz", "powtórz", "pokaż bieżący krok", "pokaż aktualny krok", "co teraz", "co dalej", "co mam teraz zrobić"] : ["now", "next", "current", "repeat", "show current step", "what do i do now", "what do i do next", "what's next"]).includes(command)) return { action: "current" };
  // In particular, yes/no answers remain adaptive while clarification is active.
  return { action: "adapt", message };
}

export function spokenResponse(command: CookingCommand, state: WebCookingState, language: Language = "en"): string {
  if (command.action === "adapt" && state.response) return state.response.message + (state.progress?.session.status === "completed" ? " " + copy[language].mealComplete : "");
  if (state.progress?.session.status === "completed") return copy[language].mealComplete;
  return state.progress?.currentStep?.instruction ?? "";
}
