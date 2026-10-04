import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CookingAgent } from "./cooking-agent";
import { InteractionTimer, logInteractionTiming, type InteractionTiming } from "./interaction-timing";

describe("interaction timing", () => {
  it("measures total and each phase independently with a monotonic clock", async () => {
    const clock = [0, 10, 210, 220, 223, 230, 235, 250];
    const timings: InteractionTiming[] = [];
    const timer = new InteractionTimer("recipe", (timing) => timings.push(timing), () => clock.shift()!);
    assert.equal(await timer.request(async () => "json"), "json");
    assert.equal(timer.measure("validationMs", () => "valid"), "valid");
    assert.equal(timer.measure("operationMs", () => "applied"), "applied");
    timer.finish(true);
    assert.deepEqual(timings, [{ interaction: "recipe", outcome: "ok", totalMs: 250, llmMs: 200, validationMs: 3, operationMs: 5 }]);
  });

  it("measures failed phases, marks unattempted phases n/a and preserves errors", async () => {
    let clock = 0;
    const timings: InteractionTiming[] = [];
    const timer = new InteractionTimer("adaptive", (timing) => timings.push(timing), () => clock += 10);
    const failure = new Error("Fictional private provider diagnostic");
    await assert.rejects(timer.request(async () => { throw failure; }), (error) => error === failure);
    timer.finish(false);
    assert.deepEqual(timings, [{ interaction: "adaptive", outcome: "failed", totalMs: 30, llmMs: 10, validationMs: null, operationMs: null }]);
  });

  it("reports success and failures at the correct boundary for all agent flows", async () => {
    const proposal = { dishName: "Rice", description: "Simple rice.", estimatedCookingMinutes: 15, servings: 2 };
    const recipe = { id: "rice", title: "Rice", servings: 2,
      ingredients: [{ id: "rice", name: "Rice", quantity: 200, unit: "g" }],
      steps: [{ id: "cook", instruction: "Cook rice.", ingredientIds: ["rice"] }] };
    const advice = { type: "cooking_problem", message: "Cook a little longer.", stepUpdates: [], additionalIngredients: [] };
    const invalidOperation = { ...advice, stepUpdates: [{ id: "unknown", instruction: "Cook.", ingredientIds: [] }] };
    const failure = new Error("Fictional sensitive transport error");
    const outputs = [JSON.stringify(proposal), JSON.stringify(recipe), JSON.stringify(advice), "{broken", JSON.stringify(invalidOperation), failure];
    const timings: InteractionTiming[] = [];
    const agent = new CookingAgent({ generate: async () => {
      const output = outputs.shift()!;
      if (output instanceof Error) throw output;
      return output;
    } }, undefined, "dinner", (timing) => timings.push(timing));
    await agent.proposeDish("rice");
    const before = await agent.acceptProposal();
    assert.deepEqual((await agent.adaptCooking("Rice is still hard")).session, before.session);
    await assert.rejects(agent.adaptCooking("Again"), /malformed JSON/);
    await assert.rejects(agent.adaptCooking("Again"), /cannot apply/);
    await assert.rejects(agent.adaptCooking("Again"), (error) => error === failure);
    assert.deepEqual(agent.getCurrentStep(), before);
    assert.deepEqual(timings.map((timing) => [timing.interaction, timing.outcome]), [
      ["proposal", "ok"], ["recipe", "ok"], ["adaptive", "ok"], ["adaptive", "failed"], ["adaptive", "failed"], ["adaptive", "failed"],
    ]);
    for (const timing of timings) {
      assert.ok(timing.totalMs >= timing.llmMs!);
      assert.ok(timing.llmMs! >= 0);
    }
    assert.equal(timings[3]!.operationMs, null);
    assert.ok(timings[3]!.validationMs! >= 0);
    assert.ok(timings[4]!.operationMs! >= 0);
    assert.equal(timings[5]!.validationMs, null);
    assert.equal(timings[5]!.operationMs, null);
    agent.completeCurrentStep("cook");
    assert.equal(timings.length, 6);
  });

  it("a failing reporter cannot change successful results or failure behavior", async () => {
    const agent = new CookingAgent({ generate: async () => JSON.stringify({ dishName: "Rice", description: "Rice.", estimatedCookingMinutes: 10, servings: 2 }) },
      undefined, "dinner", () => { throw new Error("Logger failed"); });
    assert.equal((await agent.proposeDish("rice")).dishName, "Rice");
    // The returned proposal cannot be parsed as a recipe; that error still wins over logger failure.
    await assert.rejects(agent.acceptProposal(), /recipe/);
  });

  it("logs only whitelisted timing fields even when other data is attached", (context) => {
    const logs: string[] = [];
    context.mock.method(console, "error", (line: string) => logs.push(line));
    const summary = { interaction: "adaptive" as const, outcome: "failed" as const, totalMs: 101, llmMs: 100,
      validationMs: 0.25, operationMs: null,
      prompt: "Fictional private prompt", apiKey: "fictional-secret", headers: { authorization: "fictional-credential" } };
    logInteractionTiming(summary);
    assert.deepEqual(logs, ["[timing] adaptive failed total=101.00ms llm=100.00ms parse/validate=0.25ms app/domain=n/a"]);
  });
});
