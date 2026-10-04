import { cookingService } from "../../../web/server";
import { cookingHandlers } from "../../../web/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = cookingHandlers(cookingService);
