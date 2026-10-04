import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

it("routes adaptive CLI messages, retains deterministic commands and handles reconciliation completion", () => {
  const directory = mkdtempSync(join(tmpdir(), "sous-cli-test-"));
  const fixture = join(directory, "mock-http.mjs");
  // Child process has a fictional credential and mocked fetch. No environment file is loaded.
  const outputs = [
    { dishName: "Tomato pasta", description: "Simple pasta.", estimatedCookingMinutes: 20, servings: 2 },
    { id: "pasta", title: "Tomato pasta", servings: 2,
      ingredients: [{ id: "pasta", name: "Pasta", quantity: 200, unit: "g" }, { id: "paste", name: "Tomato paste", quantity: 30, unit: "g" }],
      steps: [{ id: "boil", headline: "Boil pasta", instruction: "Boil pasta.", ingredientIds: ["pasta"] },
        { id: "sauce", headline: "Add tomato paste", instruction: "Add tomato paste.", ingredientIds: ["paste"] }] },
    { type: "ingredient_change", message: "Skip the paste; continue cooking the sauce.", originalIngredientId: "paste", replacement: null,
      reason: "Omit unavailable paste.", additionalIngredients: [], stepUpdates: [{ id: "sauce", headline: "Simmer the sauce longer", instruction: "Simmer the sauce longer.", ingredientIds: [] }] },
    { type: "clarification", message: "How thick is the sauce?" },
    { type: "cooking_problem", message: "Lower the heat now.", stepUpdates: [], additionalIngredients: [] },
    { type: "reconcile_progress", message: "The sauce is ready.", completedSteps: [{ stepId: "sauce", evidence: "I simmered the sauce" }] },
  ];
  writeFileSync(fixture, `const outputs = ${JSON.stringify(outputs)};
globalThis.fetch = async (_url, options) => {
  const prompt = JSON.parse(options.body).contents[0].parts[0].text;
  if (outputs.length === 1 && !prompt.includes('"previousClarification":null')) throw new Error('Stale clarification');
  const output = outputs.shift();
  if (!output) throw new Error('Unexpected model call');
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }));
};
`);
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", fixture, "src/cli/agent.ts"], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "test", GEMINI_API_KEY: "fictional-cli-key" }, encoding: "utf8", timeout: 10_000,
      input: ["pasta and tomato paste", "yes", "next", "done", "oh i dont have tomato paste, my bad", "now",
        "The sauce is too thick", "Very thick", "I simmered the sauce", "next", "exit", ""].join("\n"),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`CLI exited ${result.status}: ${result.stdout}${result.stderr}`);
    const timings = result.stderr.trim().split("\n");
    assert.equal(timings.length, 6); // proposal, recipe, four adaptive requests; no next/done timings
    for (const timing of timings) {
      assert.match(timing, /^\[timing\] (proposal|recipe|adaptive) ok total=\d+\.\d+ms llm=\d+\.\d+ms parse\/validate=\d+\.\d+ms app\/domain=\d+\.\d+ms$/);
    }
    assert.doesNotMatch(result.stderr, /fictional-cli-key|Context:|Skip the paste|How thick|x-goog-api-key/);
    assert.match(result.stdout, /First, Boil pasta/);
    assert.match(result.stdout, /Next, Boil pasta/);
    assert.match(result.stdout, /Skip the paste/);
    assert.match(result.stdout, /Next, Simmer the sauce longer/);
    assert.match(result.stdout, /How thick is the sauce/);
    assert.match(result.stdout, /Lower the heat now/);
    assert.match(result.stdout, /All steps are complete/);
    assert.match(result.stdout, /Your recipe is complete/);
    assert.doesNotMatch(result.stdout, /Something went wrong|failed|invalid|could not/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("includes newly available garlic in the experimental CLI while next reads and done advances", () => {
  const directory = mkdtempSync(join(tmpdir(), "sous-cli-garlic-test-"));
  const fixture = join(directory, "mock-http.mjs");
  const outputs = [
    { dishName: "Creamy Mushroom Pasta", description: "Mushroom cream sauce.", estimatedCookingMinutes: 20, servings: 2 },
    { id: "creamy-pasta", title: "Creamy Mushroom Pasta", servings: 2,
      ingredients: [{ id: "pasta", name: "Pasta", quantity: 200, unit: "g" },
        { id: "onion", name: "Onion", quantity: 1, unit: null },
        { id: "mushrooms", name: "Mushrooms", quantity: 200, unit: "g" },
        { id: "cream", name: "Heavy cream", quantity: 150, unit: "ml" }],
      steps: [{ id: "boil", headline: "Boil pasta", instruction: "Boil pasta.", ingredientIds: ["pasta"] },
        { id: "prep", headline: "Dice onion and slice mushrooms", instruction: "Dice onion and slice mushrooms.", ingredientIds: ["onion", "mushrooms"] },
        { id: "saute", headline: "Sauté onion and mushrooms", instruction: "Sauté onion and mushrooms, then stir in cream and pasta.", ingredientIds: ["onion", "mushrooms", "cream", "pasta"] }] },
    { type: "cooking_problem", message: "Mince two cloves of garlic and add them after browning the mushrooms.",
      additionalIngredients: [{ id: "garlic", name: "Garlic", quantity: 2, unit: "cloves" }],
      stepUpdates: [{ id: "prep", headline: "Prepare onion, mushrooms and garlic", instruction: "Dice onion, slice mushrooms and mince two cloves of garlic.", ingredientIds: ["onion", "mushrooms", "garlic"] },
        { id: "saute", headline: "Brown onion and mushrooms", instruction: "Brown onion and mushrooms; briefly sauté garlic, then stir in cream and pasta.", ingredientIds: ["onion", "mushrooms", "garlic", "cream", "pasta"] }] },
  ];
  writeFileSync(fixture, `const outputs = ${JSON.stringify(outputs)};
globalThis.fetch = async (url) => {
  if (!String(url).includes('gemini-3.5-flash-lite:generateContent')) throw new Error('Unexpected provider');
  const output = outputs.shift();
  if (!output) throw new Error('Unexpected model request');
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }));
};
`);
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--import", fixture, "src/cli/agent.ts"], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "test", GEMINI_API_KEY: "fictional-garlic-key",
        LLM_PROVIDER: "gemini-flash-lite", LLM_MODEL: "gemini-3.5-flash-lite" }, encoding: "utf8", timeout: 10_000,
      input: ["mushrooms, heavy cream, pasta, milk, onion", "yes", "next", "next", "done", "oh i have garlic too", "next", "done", "next", "exit", ""].join("\n"),
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0);
    assert.equal((result.stdout.match(/Next, Boil pasta/g) ?? []).length, 2);
    assert.match(result.stdout, /Next, Dice onion, slice mushrooms and mince two cloves of garlic/);
    assert.equal((result.stdout.match(/Next, Brown onion and mushrooms; briefly sauté garlic/g) ?? []).length, 2);
    assert.doesNotMatch(result.stdout, /invalid|cannot apply|Something went wrong|fictional-garlic-key/);
    assert.equal(result.stderr.trim().split("\n").length, 3); // proposal, recipe, one adaptation
    assert.doesNotMatch(result.stderr, /failed|fictional-garlic-key|Context:/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
