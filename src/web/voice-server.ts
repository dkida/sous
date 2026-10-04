import "server-only";
import { ElevenLabsProvider } from "../infrastructure/elevenlabs-provider";
import { cookingService } from "./server";
import { voiceHandlers } from "./voice-http";

export const voice = voiceHandlers(cookingService, () => new ElevenLabsProvider(
  process.env.ELEVENLABS_API_KEY ?? "", process.env.ELEVENLABS_VOICE_ID,
));
