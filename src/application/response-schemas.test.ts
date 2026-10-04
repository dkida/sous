import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateAdaptiveAction } from "../domain/adaptive-action";
import { validateRecipe } from "../domain/recipe-validation";
import { CookingAgent } from "./cooking-agent";
import { adaptiveActionSchema, proposalSchema, recipeSchema } from "./response-schemas";

type Schema = Record<string, any>;

/** Smallest instance satisfying a schema: every property present (optional lists empty), one element per required array. */
function instance(schema: Schema): unknown {
  if (schema.anyOf) return instance(schema.anyOf[0]);
  if (schema.enum) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "object") return Object.fromEntries(Object.keys(schema.properties)
    .map((key) => [key, schema.required.includes(key) ? instance(schema.properties[key]) : []]));
  if (type === "array") return [instance(schema.items)];
  if (type === "string") return "x";
  return 1;
}

/** Paths of every required property in every object reached by instance(), or of the optional ones. */
function propertyPaths(schema: Schema, path: string[] = [], optional = false): string[][] {
  if (schema.anyOf) return propertyPaths(schema.anyOf[0], path, optional);
  if (schema.type === "array") return propertyPaths(schema.items, [...path, "0"], optional);
  if (schema.type !== "object") return [];
  return Object.keys(schema.properties).flatMap((key) => schema.required.includes(key)
    ? [...(optional ? [] : [[...path, key]]), ...propertyPaths(schema.properties[key], [...path, key], optional)]
    : optional ? [[...path, key]] : []);
}

function without(value: unknown, path: string[]): unknown {
  const copy = structuredClone(value) as Record<string, any>;
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  delete parent[path.at(-1)!];
  return copy;
}

async function acceptsProposal(value: unknown): Promise<boolean> {
  const agent = new CookingAgent({ generate: async () => JSON.stringify(value) }, undefined, undefined, undefined);
  return agent.proposeDish("pasta").then(() => true, () => false);
}
const accepts = (validate: (value: unknown) => unknown) => (value: unknown) => {
  try { validate(value); return true; } catch { return false; }
};

describe("native response schemas mirror the existing validators", () => {
  const contracts: [string, Schema, (value: unknown) => boolean | Promise<boolean>][] = [
    ["proposal", proposalSchema, acceptsProposal],
    ["recipe", recipeSchema, accepts(validateRecipe)],
    ...adaptiveActionSchema.anyOf.map((branch): [string, Schema, (value: unknown) => boolean] =>
      [`adaptive ${(branch as Schema).properties.type.enum[0]}`, branch as Schema, accepts(validateAdaptiveAction)]),
  ];
  for (const [name, schema, validate] of contracts) {
    it(`${name}: a schema-shaped response passes, and dropping ANY schema-required field fails, Sous validation`, async () => {
      const value = instance(schema);
      assert.equal(await validate(value), true);
      for (const path of propertyPaths(schema)) assert.equal(await validate(without(value, path)), false, path.join("."));
      for (const path of propertyPaths(schema, [], true)) assert.equal(await validate(without(value, path)), true, path.join("."));
    });
  }

  it("keeps step ingredientIds required, only Task 6.2 lists optional, and forbids extra fields everywhere", () => {
    const step = (recipeSchema.properties as Schema).steps.items;
    assert.ok(step.required.includes("ingredientIds"));
    const objects: Schema[] = [];
    const walk = (schema: unknown) => {
      if (!schema || typeof schema !== "object") return;
      if ((schema as Schema).type === "object") objects.push(schema as Schema);
      Object.values(schema).forEach(walk);
    };
    walk({ proposalSchema, recipeSchema, adaptiveActionSchema });
    assert.ok(objects.length > 0);
    const optional = new Set(["assumedStaples", "optionalAdditions", "shoppingAdditions", "ingredientAvailability"]);
    for (const object of objects) {
      assert.equal(object.additionalProperties, false);
      assert.deepEqual(object.required, Object.keys(object.properties).filter((key) => !optional.has(key)));
    }
  });
});
