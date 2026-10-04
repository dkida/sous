import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { CookingAgent, CookingAgentError, type CookingProgress } from "../application/cooking-agent";
import { InvalidRecipeError } from "../domain/recipe-validation";
import { InvalidAdaptiveActionError } from "../domain/adaptive-action";
import { GemmaProviderError } from "../infrastructure/gemma-provider";
import { GeminiFlashLiteProviderError } from "../infrastructure/gemini-flash-lite-provider";
import { selectProvider } from "../infrastructure/provider-selection";
import { logInteractionTiming } from "../application/interaction-timing";

function showProgress(progress: CookingProgress, first = false): void {
  if (!progress.currentStep) {
    console.log("Sous: All steps are complete. Enjoy your meal!");
  } else {
    console.log(`Sous: ${first ? "Great. First, " : "Next, "}${progress.currentStep.instruction}`);
  }
}

async function main(): Promise<void> {
  const selected = selectProvider({ GEMINI_API_KEY: process.env.GEMINI_API_KEY, GEMMA_MODEL: process.env.GEMMA_MODEL,
    LLM_PROVIDER: process.env.LLM_PROVIDER, LLM_MODEL: process.env.LLM_MODEL });
  const agent = new CookingAgent(selected.provider, undefined, undefined, logInteractionTiming);
  const input = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  let phase: "ingredients" | "proposal" | "cooking" | "completed" = "ingredients";
  console.log("Sous: Tell me which ingredients you have. Type help for commands or exit to quit.");
  if (stdin.isTTY) stdout.write("User: ");
  try {
    // Async iteration also handles piped input without dropping lines during model calls.
    for await (const line of input) {
      const command = line.trim().toLowerCase().replace(/[?.!]$/, "");
      if (["exit", "quit"].includes(command)) break;
      try {
        if (command === "help") {
          console.log("Sous: Enter ingredients, then yes to accept (or no to try new ingredients). During cooking: now/next/what do I do now?/what do I do next? reads the current step; done completes it and advances. You can also describe missing ingredients, substitutions, changed portions, cooking problems, or work already done. Type exit to quit.");
        } else if (phase === "ingredients") {
          const proposal = await agent.proposeDish(line);
          console.log(`Sous: We can make ${proposal.dishName}. ${proposal.description} It takes about ${proposal.estimatedCookingMinutes} minutes and serves ${proposal.servings}. Would you like to make it?`);
          phase = "proposal";
        } else if (phase === "proposal") {
          if (["yes", "y", "accept", "let's make it"].includes(command)) {
            showProgress(await agent.acceptProposal(), true);
            phase = "cooking";
          } else if (["no", "n"].includes(command)) {
            phase = "ingredients";
            console.log("Sous: Tell me which ingredients you would like to use.");
          } else {
            console.log("Sous: Say yes to accept the proposal, or no to enter ingredients again.");
          }
        } else if (phase === "cooking") {
          if (["done", "complete", "completed"].includes(command)) {
            const current = agent.getCurrentStep().currentStep!;
            const progress = agent.completeCurrentStep(current.id);
            showProgress(progress);
            if (progress.session.status === "completed") phase = "completed";
          } else if (["now", "next", "current", "what do i do now", "what do i do next", "what's next"].includes(command)) {
            showProgress(agent.getCurrentStep());
          } else {
            const result = await agent.adaptCooking(line);
            console.log(`Sous: ${result.message}`);
            if (result.session.status === "completed") {
              phase = "completed";
              showProgress(result);
            }
          }
        } else {
          console.log("Sous: Your recipe is complete. Type exit to quit; restart the CLI for another meal.");
        }
      } catch (error) {
        // Only known, locally authored errors may be displayed; never raw provider errors.
        if (error instanceof CookingAgentError || error instanceof InvalidRecipeError || error instanceof InvalidAdaptiveActionError || error instanceof GemmaProviderError || error instanceof GeminiFlashLiteProviderError) {
          console.log(`Sous: ${error.message}`);
        } else {
          console.log("Sous: Something went wrong. Please try again.");
        }
      }
      if (stdin.isTTY) stdout.write("User: ");
    }
  } finally {
    input.close();
  }
}

main().catch(() => {
  console.error("Sous: Could not start. Set GEMINI_API_KEY and check LLM_PROVIDER / LLM_MODEL (or GEMMA_MODEL for Gemma). Gemma remains the default; Gemini Flash-Lite is experimental.");
  process.exitCode = 1;
});
