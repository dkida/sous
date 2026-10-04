import { copy } from "./i18n";
import { NextRequest, NextResponse } from "next/server";
import type { ServiceReply, WebCookingService } from "./cooking-service";

export const cookieName = "sous-session";
function response(result: ServiceReply): NextResponse {
  const reply = NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  if (result.id) reply.cookies.set(cookieName, result.id, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/",
  });
  return reply;
}

/** Injected service keeps HTTP tests deterministic, without loading server credentials. */
export function cookingHandlers(service: WebCookingService) {
  return {
    GET(request: NextRequest): NextResponse {
      return response(service.read(request.cookies.get(cookieName)?.value));
    },
    async POST(request: NextRequest): Promise<NextResponse> {
      const language = service.read(request.cookies.get(cookieName)?.value).body.language ?? "en";
      const sameOrigin = isSameOrigin(request);
      if (!sameOrigin) {
        return NextResponse.json({ state: null, error: { code: "invalid", message: copy[language].origin, key: "origin" } }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      let input: unknown;
      try { input = await request.json(); } catch {
        return NextResponse.json({ state: null, error: { code: "invalid", message: copy[language].unreadable, key: "unreadable" } }, { status: 400, headers: { "Cache-Control": "no-store" } });
      }
      const reply = response(await service.execute(request.cookies.get(cookieName)?.value, input));
      if (typeof input === "object" && input !== null && "action" in input && input.action === "reset" && reply.ok) {
        reply.cookies.delete(cookieName);
      }
      return reply;
    },
  };
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  // Next's internal URL can use the bind address (0.0.0.0), while the browser
  // uses localhost or a public host. Compare the browser Origin to HTTP Host.
  let sameOrigin = true;
  if (origin) {
    try {
      const browserOrigin = new URL(origin);
      sameOrigin = ["http:", "https:"].includes(browserOrigin.protocol) && browserOrigin.host === (request.headers.get("host") ?? request.nextUrl.host);
    } catch { sameOrigin = false; }
  }
  return sameOrigin;
}
