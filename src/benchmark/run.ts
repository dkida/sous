import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { selectProvider, type ProviderName } from "../infrastructure/provider-selection";
import { DEFAULT_FLASH_LITE_MODEL } from "../infrastructure/gemini-flash-lite-provider";
import { runScenario, scenarios } from "./scenarios";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repetitionsIndex = args.indexOf("--repetitions");
  const repetitions = repetitionsIndex >= 0 ? Number(args[repetitionsIndex + 1]) : 3;
  const outputIndex = args.indexOf("--output");
  const directory = outputIndex >= 0 ? args[outputIndex + 1] : `docs/benchmarks/inference-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10 || !directory) throw new Error("Invalid benchmark options.");
  const gemmaModel = process.env.BENCH_GEMMA_MODEL ?? "gemma-4-26b-a4b-it";
  const flashModel = process.env.BENCH_FLASH_LITE_MODEL ?? DEFAULT_FLASH_LITE_MODEL;
  const providers = (["gemma", "gemini-flash-lite"] as const).map((name) => selectProvider({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY, LLM_PROVIDER: name, LLM_MODEL: name === "gemma" ? gemmaModel : flashModel,
  }));
  await mkdir(directory, { recursive: true });
  const path = join(directory, "requests.jsonl");
  await writeFile(path, "", { flag: "wx" }); // Never overwrite an existing benchmark.
  await writeFile(join(directory, "method.json"), JSON.stringify({ repetitions, providers: providers.map(({ name, model }) => ({ name, model })),
    scenarios, generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }, timeoutMs: 120000,
    structuredOutput: "prompted JSON for both; native-schema probe excluded", order: "sequential paired scenarios; provider order alternates each repetition",
    context: "fixed accepted proposal; independent fixed adaptive recipe; pasta done for burning, pasta and saute done for missing/scaling",
    prompts: "unchanged CookingAgent prompts; only hashes stored", warmups: 0, retries: 0,
    culinaryAssessment: "manual review of validated synthetic cooking output required" }, null, 2));
  const hashes = new Map<string, string>();
  const unavailable = new Set<ProviderName>();
  for (let iteration = 1; iteration <= repetitions; iteration++) {
    const order = iteration % 2 === 1 ? providers : [...providers].reverse();
    for (const scenario of scenarios) {
      for (const selected of order) {
        if (unavailable.has(selected.name)) continue;
        console.log(`[benchmark] starting ${iteration}/${repetitions} ${selected.name}/${selected.model} ${scenario}`);
        const result = await runScenario(scenario, selected.provider);
        if (hashes.has(scenario) && hashes.get(scenario) !== result.promptHash) throw new Error("Benchmark prompts differed between trials.");
        hashes.set(scenario, result.promptHash);
        await appendFile(path, `${JSON.stringify({ provider: selected.name, model: selected.model, iteration, scenario, ...result })}\n`);
        const { totalMs, llmMs, validationMs, operationMs } = result.timing;
        console.log(`[benchmark] ${selected.name}/${selected.model} ${scenario} ${result.success ? "ok" : result.failureKind} total=${totalMs.toFixed(2)}ms provider=${llmMs?.toFixed(2)}ms parse=${validationMs?.toFixed(2) ?? "n/a"}ms app=${operationMs?.toFixed(2) ?? "n/a"}ms state=${result.correctStateTransition} history=${result.completedHistoryPreserved}`);
        if (["http-402", "http-403", "http-404", "http-429"].includes(result.failureKind ?? "")) {
          unavailable.add(selected.name);
          console.log(`[benchmark] stopping ${selected.name} after access/billing/quota failure; remaining trials skipped.`);
        }
      }
    }
  }
  console.log(`[benchmark] complete; request records saved to ${path}. No provider selected as winner.`);
}

main().catch(() => {
  console.error("Benchmark could not complete. Check options, output directory and provider configuration; remote diagnostics and credentials omitted.");
  process.exitCode = 1;
});
