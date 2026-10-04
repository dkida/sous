import "server-only";
import { selectProvider } from "../infrastructure/provider-selection";
import { WebCookingService } from "./cooking-service";

// Retain the service across requests and development module reloads in this process.
// Deliberately neither persisted nor shared across workers/server instances.
const processState = globalThis as typeof globalThis & { sousCookingService?: WebCookingService };
export const cookingService = processState.sousCookingService = new WebCookingService(() => selectProvider({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMMA_MODEL: process.env.GEMMA_MODEL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_MODEL: process.env.LLM_MODEL,
}).provider, processState.sousCookingService);
