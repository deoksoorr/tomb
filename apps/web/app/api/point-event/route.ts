import { handler, json } from "@/lib/http";
import { earnBoostAt, isBoosted, type PointEventResponse } from "@/lib/pointEvent";
import { cachedPointEvent } from "@/lib/store/pointEvent";

/**
 * 포인트 배수 이벤트 (게임 화면 위 안내 띠). 게임이 몇 분마다 가볍게 확인한다 — 모두 같은 값이라 CDN에 1분 캐시.
 * 오늘 한도에 아무 영향이 없는(끝난) 이벤트는 null로 준다
 */
export const GET = handler(async () => {
  const now = Date.now();
  const ev = await cachedPointEvent(now);
  return json<PointEventResponse>(
    { event: isBoosted(earnBoostAt(ev, now)) ? ev : null },
    {
      headers: {
        "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=120",
        "Cache-Control": "no-store",
      },
    },
  );
});
