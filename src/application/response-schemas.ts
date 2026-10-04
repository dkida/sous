/**
 * JSON Schemas mirroring the existing response validators (validateProposal, validateRecipe,
 * validateAdaptiveAction). Every field those validators require is required here, with no extra fields;
 * fields the validators accept as absent (proposal lists, ingredientAvailability) are optional here too.
 * A provider may use them as an additional constraint; application validation stays authoritative.
 * Rules the schemas cannot express (trimmed non-empty strings, headline word count, unique IDs,
 * known ingredient references, staple policy/references, cook-confirmed availability, state applicability)
 * are enforced only by the validators and agent.
 */
type Schema = Record<string, unknown>;

const text = { type: "string", minLength: 1 };
const positiveInteger = { type: "integer", minimum: 1 };
function object(properties: Record<string, Schema>, optional: string[] = []): Schema {
  return { type: "object", properties, required: Object.keys(properties).filter((key) => !optional.includes(key)), additionalProperties: false };
}
const names = (maxItems: number) => ({ type: "array", maxItems, items: text });

const ingredient = object({
  id: text, name: text,
  quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
  unit: { type: ["string", "null"], minLength: 1 },
});
const step = object({ id: text, headline: text, instruction: text, ingredientIds: { type: "array", items: text } });
const availability = object({ ingredientId: text, basis: { type: "string", enum: ["assumed_staple", "cook_confirmed"] }, evidence: { type: ["string", "null"], minLength: 1 } });
const plan = { stepUpdates: { type: "array", items: step }, additionalIngredients: { type: "array", items: ingredient },
  ingredientAvailability: { type: "array", items: availability } };
const action = (type: string, properties: Record<string, Schema> = {}) =>
  object({ type: { type: "string", enum: [type] }, message: text, ...properties }, ["ingredientAvailability"]);

export const proposalSchema = object({ dishName: text, description: text, estimatedCookingMinutes: positiveInteger, servings: positiveInteger,
  assumedStaples: names(4), optionalAdditions: names(3), shoppingAdditions: names(3) }, ["assumedStaples", "optionalAdditions", "shoppingAdditions"]);

export const recipeSchema = object({
  id: text, title: text, servings: positiveInteger,
  ingredients: { type: "array", minItems: 1, items: ingredient },
  steps: { type: "array", minItems: 1, items: step },
});

export const adaptiveActionSchema = { anyOf: [
  action("ingredient_change", { originalIngredientId: text, replacement: { anyOf: [ingredient, { type: "null" }] }, reason: text, ...plan }),
  action("scale_servings", { servings: positiveInteger, unscaledIngredientIds: { type: "array", items: text }, ...plan }),
  action("cooking_problem", plan),
  action("reconcile_progress", { completedSteps: { type: "array", minItems: 1, items: object({ stepId: text, evidence: text }) } }),
  action("clarification"),
] };

export interface ResponseContract { name: "dish_proposal" | "recipe" | "adaptive_action"; schema: Record<string, unknown> }
/** One contract per CookingAgent request type. */
export const responseContracts = {
  proposal: { name: "dish_proposal", schema: proposalSchema },
  recipe: { name: "recipe", schema: recipeSchema },
  adaptive: { name: "adaptive_action", schema: adaptiveActionSchema },
} as const satisfies Record<string, ResponseContract>;
