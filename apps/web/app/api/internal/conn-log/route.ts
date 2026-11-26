import { INTERNAL_SIG_HEADER, verifyInternal } from "@tomb/protocol";
import { env } from "@/lib/env";
import { apiError, handler, json } from "@/lib/http";
import { recordConnRows } from "@/lib/opsLog";

/**
 * 11/26 접속 기록 받기. 실시간 서버 로비 DO가 들어옴·나감을 1분마다(또는 60줄이 차면) 모아 보낸다 (apps/realtime connLog.ts).
 * 본문 서명(JOIN_SECRET, {op:"connLog"})이 맞을 때만 — 틀리면 경로가 없는 것처럼 404. 묶음 하나 = Redis 명령 1개
 */
export const POST = handler(async (req) => {
  const sig = req.headers.get(INTERNAL_SIG_HEADER);
  const r = sig ? await verifyInternal(env.joinSecret(), await req.text(), sig) : null;
  if (!r || r.op !== "connLog") return apiError(404, "NOT_FOUND", "없는 경로예요.");
  return json({ saved: await recordConnRows(r.rows) }, { headers: { "cache-control": "no-store" } });
});
