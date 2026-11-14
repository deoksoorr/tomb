import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { ChampMeResponse } from "@/lib/types";
import { CHAMP_POINTS, champMine, ensureChampSettled } from "@/lib/weeklyChamp";

/**
 * 내 주간 1위 상태 (가볍게): 지금 1위 값(bits, 0 = 아님)과 아직 안 본 1위 알림.
 * 접속 중인 화면이 월요일 0시 직후(몇 초 흩뜨려)·"내 정보 새로 받기" 신호·몇 분마다 부른다 → 값이 바뀌면 착용 증서를 새로 받아
 * 새로고침 없이 모자·배지·전용 오라를 붙이거나 뗀다. 지난주 정리가 아직이면 여기서 한다 (한 번만)
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("rank", req);
  const now = Date.now();
  await ensureChampSettled(now);
  const m = await champMine(visitorId, now);
  return json<ChampMeResponse>({ ...m, points: CHAMP_POINTS }, { headers: { "Cache-Control": "private, no-store" } });
});
