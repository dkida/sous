import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CookingAgent } from "../application/cooking-agent";
import type { LLMProvider } from "../application/llm-provider";
import { CookingSessionStore } from "../domain/cooking-session-store";
import { isAssumedStaple } from "../domain/pantry";
import type { Language } from "../shared/language";
import { benchmarkProvider, benchmarkProviderNames } from "./providers";
import { runScenario } from "./scenarios";

/** Task 6.2 qualitative scenarios. Planning: proposal + recipe each; adaptive: the fixed benchmark fixtures. */
export const planningScenarios: { id: string; language: Language; input: string }[] = [
  { id: "A-basic-pasta", language: "en", input: "I have pasta, tomatoes, parmesan and cream." },
  { id: "B-irrelevant-banana", language: "en", input: "I have pasta, tomatoes, parmesan, cream and a banana." },
  { id: "C-sparse", language: "en", input: "I have eggs and bread." },
  { id: "D-shopping-allowed", language: "en", input: "I have pasta, tomatoes and parmesan. I can buy a couple things." },
  { id: "E-polish", language: "pl", input: "Mam makaron, pomidory, śmietanę i parmezan." },
];
export const adaptiveChecks = ["missing-paste", "burning-onions"] as const;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const name = args[args.indexOf("--provider") + 1] ?? "";
  const output = args[args.indexOf("--output") + 1] ?? "";
  if (!args.includes("--provider") || !args.includes("--output") || !(benchmarkProviderNames as readonly string[]).includes(name) || !output) {
    throw new Error("Usage: --provider <name> --output <file.json>");
  }
  const selected = benchmarkProvider(name);
  const planning = [];
  for (const scenario of planningScenarios) {
    let lastText: string | null = null;
    const provider: LLMProvider = { generate: async (prompt, contract) => (lastText = await selected.provider.generate(prompt, contract)) };
    const agent = new CookingAgent(provider, new CookingSessionStore(), `quality-${scenario.id}`, undefined, scenario.language);
    const record: Record<string, unknown> = { ...scenario };
    try {
      record.proposal = await agent.proposeDish(scenario.input);
      const recipe = (await agent.acceptProposal()).session.recipe;
      // Review aid only: everything that is neither a policy staple nor obviously the cook's must be checked by hand.
      record.recipe = recipe;
      record.nonStapleIngredients = recipe.ingredients.filter((ingredient) => !isAssumedStaple(ingredient.name)).map((ingredient) => ingredient.name);
    } catch (error) {
      record.failure = { stage: record.proposal ? "recipe" : "proposal", kind: (error as Error).constructor.name, message: (error as Error).message, rejectedModelText: lastText };
    }
    console.log(`[quality] ${scenario.id} ${record.failure ? "failed" : "ok"}`);
    planning.push(record);
  }
  const adaptive = [];
  for (const scenario of adaptiveChecks) {
    const result = await runScenario(scenario, selected.provider);
    console.log(`[quality] ${scenario} ${result.success ? "ok" : result.failureKind}`);
    adaptive.push({ scenario, ...result });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ provider: selected.name, model: selected.model, maxRequests: planning.length * 2 + adaptive.length,
    review: "Manual: availability (no unconfirmed non-staples), unused supplied ingredients allowed, staples structured, prose vs quantities, technique, language.",
    planning, adaptive }, null, 2), { flag: "wx" });
}

main().catch(() => {
  console.error("Quality scenarios could not complete. Check options, output path and provider configuration; credentials and remote diagnostics omitted.");
  process.exitCode = 1;
});
