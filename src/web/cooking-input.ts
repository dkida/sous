import type { Language } from "../shared/language";
import { copy } from "./i18n";
import type { CookingCommand, WebCookingState } from "./contracts";
import { spokenStep } from "./spoken-step";

/** Shared by typed and transcribed cooking input; exact commands only. */
export function cookingInput(message: string, state: WebCookingState, language: Language = "en"): CookingCommand {
  const command = message.trim().toLowerCase().replace(/[?.!]+$/, "");
  const step = state.progress?.currentStep;
  if (step && (language === "pl" ? ["gotowe", "zrobione", "dalej", "ukończone"] : ["done", "complete", "completed"]).includes(command)) return { action: "complete", expectedStepId: step.id };
  if ((language === "pl" ? ["teraz", "powtórz", "pokaż bieżący krok", "pokaż aktualny krok", "co teraz", "co dalej", "co mam teraz zrobić"] : ["now", "what now", "next", "current", "repeat", "show current step", "what do i do now", "what do i do next", "what's next"]).includes(command)) return { action: "current" };
  // In particular, yes/no answers remain adaptive while clarification is active.
  return { action: "adapt", message };
}

export function spokenResponse(command: CookingCommand, state: WebCookingState, language: Language = "en", previousStepId?: string | null): string {
  const step = state.progress?.currentStep;
  if (command.action === "adapt" && state.response) {
    const message = state.response.message;
    if (state.progress?.session.status === "completed") return `${message} ${copy[language].mealComplete}`;
    // Natural completion reports use the adaptive reconciliation path. Speak
    // the newly reached step too, rather than only its transition acknowledgement.
    if (previousStepId && step && state.progress && step.id !== previousStepId) {
      const instruction = spokenStep(step, state.progress.session.recipe, language);
      const normalize = (text: string) => text.trim().replace(/\s+/gu, " ").toLowerCase();
      return normalize(message).includes(normalize(instruction)) ? message : `${message} ${instruction}`;
    }
    return message;
  }
  if (state.progress?.session.status === "completed") return copy[language].mealComplete;
  return step && state.progress ? spokenStep(step, state.progress.session.recipe, language) : "";
}
