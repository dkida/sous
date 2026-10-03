import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { CookingAgent, CookingAgentError, type CookingProgress } from "../application/cooking-agent";
import { InvalidRecipeError } from "../domain/recipe-validation";
import { GemmaProvider, GemmaProviderError } from "../infrastructure/gemma-provider";

function showProgress(progress: CookingProgress, first = false): void {
  if (!progress.currentStep) {
    console.log("Sous: All steps are complete. Enjoy your meal!");
  } else {
    console.log(`Sous: ${first ? "Great. First, " : "Next, "}${progress.currentStep.instruction}`);
  }
}

async function main(): Promise<void> {
  const agent = new CookingAgent(new GemmaProvider(process.env.GEMINI_API_KEY ?? "", process.env.GEMMA_MODEL));
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
          console.log("Sous: Enter ingredients, then yes to accept (or no to try new ingredients). During cooking: now/next/what do I do now?/what do I do next? reads the current step; done completes it and advances. Type exit to quit.");
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
            console.log("Sous: Ask now/next for the current instruction, or say done to complete it.");
          }
        } else {
          console.log("Sous: Your recipe is complete. Type exit to quit; restart the CLI for another meal.");
        }
      } catch (error) {
        // Only known, locally authored errors may be displayed; never raw provider errors.
        if (error instanceof CookingAgentError || error instanceof InvalidRecipeError || error instanceof GemmaProviderError) {
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
  console.error("Sous: Could not start. Set GEMINI_API_KEY in .env.local and use a valid GEMMA_MODEL if overriding the default.");
  process.exitCode = 1;
});
