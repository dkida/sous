import { copy, type CopyKey } from "./i18n";
import { NextRequest, NextResponse } from "next/server";
import { cookieName, isSameOrigin } from "./http";
import type { WebCookingService } from "./cooking-service";
import type { SpeechProvider } from "./speech-provider";
import { isLanguage } from "../shared/language";
import { hasOnlyKeys, isRecord } from "../domain/recipe-validation";

const headers = { "Cache-Control": "no-store" };


export function voiceHandlers(service: WebCookingService, provider: () => SpeechProvider) {
  const tokens = new Set<string>();
  const speaking = new Set<string>();
  const failure = (request: NextRequest, status: number, key: CopyKey) => NextResponse.json({ error: copy[service.read(request.cookies.get(cookieName)?.value).body.language ?? "en"][key] }, { status, headers });
  return {
    async token(request: NextRequest): Promise<Response> {
      if (!isSameOrigin(request)) return failure(request, 403, "voiceOrigin");
      const id = request.cookies.get(cookieName)?.value;
      let input: unknown;
      if (request.body) {
        try { input = await request.json(); } catch { return failure(request, 400, "speechUnreadable"); }
        if (!isRecord(input) || !hasOnlyKeys(input, ["mode", "language"]) ||
            !["ingredients", "cooking"].includes(String(input.mode)) || !isLanguage(input.language)) return failure(request, 400, "speechIncomplete");
      }
      const entry = isRecord(input) && input.mode === "ingredients";
      const snapshot = service.read(id).body;
      // Entry transcription must not create a cooking flow or invoke the model.
      // A browser Origin is required for token issuance before a session exists.
      if (entry && !request.headers.get("origin")) return failure(request, 403, "voiceOrigin");
      if (entry ? !snapshot.state || Boolean(snapshot.state.proposal || snapshot.state.progress)
        : !id || snapshot.state?.progress?.session.status !== "cooking") return failure(request, 409, "voiceStart");
      const tokenKey = id ?? crypto.randomUUID();
      if (tokens.has(tokenKey)) return failure(request, 409, "voicePreparing");
      tokens.add(tokenKey);
      try { return NextResponse.json({ token: await provider().batchToken(request.signal) }, { headers }); }
      catch { return entry && isRecord(input) && isLanguage(input.language)
        ? NextResponse.json({ error: copy[input.language].voiceUnavailable }, { status: 503, headers })
        : failure(request, 503, "voiceUnavailable"); }
      finally { tokens.delete(tokenKey); }
    },
    async speech(request: NextRequest): Promise<Response> {
      if (!isSameOrigin(request)) return failure(request, 403, "voiceOrigin");
      const id = request.cookies.get(cookieName)?.value;
      let input;
      try { input = await request.json(); } catch { return failure(request, 400, "speechUnreadable"); }
      if (!input || typeof input.id !== "string" || typeof input.revision !== "string") return failure(request, 400, "speechIncomplete");
      const text = service.speech(id, input.id, input.revision);
      if (!id || !text) return failure(request, 409, "kitchenChanged");
      if (speaking.has(id)) return failure(request, 409, "speechPreparing");
      speaking.add(id);
      try {
        const response = await provider().synthesize(text, request.signal, service.read(id).body.language ?? "en");
        if (!service.speech(id, input.id, input.revision)) {
          await response.body!.cancel();
          speaking.delete(id);
          return failure(request, 409, "kitchenChanged");
        }
        // Forward the documented HTTP audio stream; never return provider headers/diagnostics.
        const reader = response.body!.getReader();
        return new Response(new ReadableStream({
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (chunk.done) { speaking.delete(id); controller.close(); }
              else controller.enqueue(chunk.value);
            } catch { speaking.delete(id); controller.error(new Error("Speech was interrupted.")); }
          },
          async cancel() { speaking.delete(id); await reader.cancel(); },
        }), { headers: { ...headers, "Content-Type": "audio/mpeg" } });
      } catch { speaking.delete(id); return failure(request, 503, "speechUnavailable"); }
    },
  };
}
