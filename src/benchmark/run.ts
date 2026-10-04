import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { MistralProviderError } from "../infrastructure/mistral-provider";
import { benchmarkProvider, benchmarkProviderNames } from "./providers";
import { runScenario, scenarios } from "./scenarios";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repetitionsIndex = args.indexOf("--repetitions");
  const repetitions = repetitionsIndex >= 0 ? Number(args[repetitionsIndex + 1]) : 3;
  const outputIndex = args.indexOf("--output");
  const directory = outputIndex >= 0 ? args[outputIndex + 1] : `docs/benchmarks/inference-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const providersIndex = args.indexOf("--providers");
  const names = providersIndex >= 0 ? (args[providersIndex + 1] ?? "").split(",") : ["gemma", "gemini-flash-lite"];
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10 || !directory ||
    !names.length || new Set(names).size !== names.length || !names.every((name) => (benchmarkProviderNames as readonly string[]).includes(name))) {
    throw new Error("Invalid benchmark options.");
  }
  const providers = names.map(benchmarkProvider);
  await mkdir(directory, { recursive: true });
  const path = join(directory, "requests.jsonl");
  await writeFile(path, "", { flag: "wx" }); // Never overwrite an existing benchmark.
  await writeFile(join(directory, "method.json"), JSON.stringify({ repetitions, providers: providers.map(({ name, model }) => ({ name, model })),
    scenarios, generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }, timeoutMs: 120000,
    structuredOutput: names.includes("mistral-native-schema")
      ? "prompted JSON for every provider; mistral-native-schema additionally sends strict native JSON Schema per response contract"
      : "prompted JSON for every provider; native-schema probe excluded", order: "sequential paired scenarios; provider order alternates each repetition",
    context: "fixed accepted proposal; independent fixed adaptive recipe; pasta done for burning, pasta and saute done for missing/scaling",
    prompts: "unchanged CookingAgent prompts; only hashes stored", warmups: 0, retries: 0,
    culinaryAssessment: "manual review of validated synthetic cooking output required" }, null, 2));
  const hashes = new Map<string, string>();
  const unavailable = new Set<string>();
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
        // 400/422 indicate a rejected request (e.g. an unsupported schema): an integration error, not a model result.
        if (["http-400", "http-401", "http-402", "http-403", "http-404", "http-422", "http-429"].includes(result.failureKind ?? "")) {
          unavailable.add(selected.name);
          console.log(`[benchmark] stopping ${selected.name} after request/access/billing/quota failure; remaining trials skipped.`);
        }
      }
    }
  }
  console.log(`[benchmark] complete; request records saved to ${path}. No provider selected as winner.`);
}

main().catch((error) => {
  // Provider errors carry only fixed, sanitized text (e.g. a missing key), never remote diagnostics.
  if (error instanceof MistralProviderError) console.error(`Benchmark could not start: ${error.message}`);
  console.error("Benchmark could not complete. Check options, output directory and provider configuration; remote diagnostics and credentials omitted.");
  process.exitCode = 1;
});
