import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_FLASH_LITE_MODEL, GeminiFlashLiteProvider } from "../infrastructure/gemini-flash-lite-provider";
import { runScenario } from "./scenarios";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf("--output");
  const path = index >= 0 ? args[index + 1] : "docs/benchmarks/native-schema-probe.json";
  if (!path) throw new Error("An output path is required.");
  const model = process.env.BENCH_FLASH_LITE_MODEL ?? DEFAULT_FLASH_LITE_MODEL;
  const schema = { type: "object", properties: {
    dishName: { type: "string" }, description: { type: "string" },
    estimatedCookingMinutes: { type: "integer", minimum: 1 }, servings: { type: "integer", minimum: 1 },
  }, required: ["dishName", "description", "estimatedCookingMinutes", "servings"], additionalProperties: false };
  const result = await runScenario("proposal", new GeminiFlashLiteProvider(process.env.GEMINI_API_KEY ?? "", model, fetch, schema));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ provider: "gemini-flash-lite", model, mode: "native JSON Schema; separate from baseline benchmark",
    configuration: "generationConfig.responseFormat.text: mimeType APPLICATION_JSON and schema", ...result }, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ model, success: result.success, failureKind: result.failureKind, validStructuredOutput: result.validStructuredOutput,
    correctStateTransition: result.correctStateTransition, timing: result.timing }));
}

main().catch(() => {
  console.error("Native-schema probe could not complete; credentials and remote diagnostics omitted.");
  process.exitCode = 1;
});
