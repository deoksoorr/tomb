import { handler } from "@/lib/http";
import { parseMoveWire } from "@/lib/moveLog";
import { logMoves } from "@/lib/opsLog";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";

/**
 * 11/27 화면이 알려 주는 자리 옮김 `{ rows }` (맵·채널 옮기기, 집에서 나옴, 커진 몸으로 못 들어감 — lib/moveLog). 그 계정 접속 기록에만 남긴다.
 * 기록일 뿐 아무것도 바꾸지 않는다. 로그인 전이면 버린다. 204
 */
export const POST = handler(async (req) => {
  const visitorId = await getVisitorId(req);
  if (!visitorId) return new Response(null, { status: 204 });
  await rateLimit("moves", req, visitorId);
  const body = (await req.json().catch(() => null)) as { rows?: unknown } | null;
  logMoves(parseMoveWire(body?.rows, visitorId, Date.now()));
  return new Response(null, { status: 204 });
});
