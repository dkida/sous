import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GemmaProvider } from "./gemma-provider";
import { GeminiFlashLiteProvider } from "./gemini-flash-lite-provider";
import { selectProvider } from "./provider-selection";

describe("explicit provider selection", () => {
  const environment = { GEMINI_API_KEY: "fictional-key" };
  it("retains Gemma 4 as default and preserves GEMMA_MODEL compatibility", () => {
    const selected = selectProvider(environment);
    assert.equal(selected.name, "gemma");
    assert.equal(selected.model, "gemma-4-26b-a4b-it");
    assert.ok(selected.provider instanceof GemmaProvider);
    assert.equal(selectProvider({ ...environment, GEMMA_MODEL: "gemma-4-31b-it" }).model, "gemma-4-31b-it");
  });
  it("requires an explicit opt-in for Flash-Lite and permits independent model overrides", () => {
    const selected = selectProvider({ ...environment, LLM_PROVIDER: "gemini-flash-lite", GEMMA_MODEL: "gemma-4-31b-it" });
    assert.ok(selected.provider instanceof GeminiFlashLiteProvider);
    assert.equal(selected.model, "gemini-3.5-flash-lite");
    assert.equal(selectProvider({ ...environment, LLM_PROVIDER: "gemini-flash-lite", LLM_MODEL: "gemini-3.1-flash-lite" }).model, "gemini-3.1-flash-lite");
    assert.equal(selectProvider({ ...environment, GEMMA_MODEL: "gemma-4-31b-it", LLM_MODEL: "gemma-4-26b-a4b-it" }).model, "gemma-4-26b-a4b-it");
  });
  it("rejects unknown provider configuration without reflecting its value", () => {
    assert.throws(() => selectProvider({ ...environment, LLM_PROVIDER: "fictional-sensitive-input" }), (error: Error) => {
      assert.equal(error.message.includes("fictional-sensitive-input"), false);
      return true;
    });
    assert.throws(() => selectProvider({ ...environment, LLM_PROVIDER: "gemini-flash-lite", LLM_MODEL: "gemma-4-26b-a4b-it" }));
  });
});
