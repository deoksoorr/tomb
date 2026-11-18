import { handler, json } from "@/lib/http";
import { earnBoostAt, isBoosted, type PointEventResponse } from "@/lib/pointEvent";
import { cachedPointEvent, POINT_EVENT_FRESH_MS } from "@/lib/store/pointEvent";

/**
 * 포인트 배수 이벤트 (게임 화면 위 안내 띠). 게임이 1분마다 가볍게 확인한다 — 모두 같은 값이라 CDN에 30초 캐시.
 * 이벤트 공지를 들은 화면은 ?fresh=시각을 붙여 캐시를 건너뛴다 (components/overlay/PointEventBadge).
 * 지금 적립에 아무 영향이 없는(끝난) 이벤트는 null로 준다
 */
export const GET = handler(async (req) => {
  const now = Date.now();
  // ?fresh= (이벤트 공지를 들은 화면): 인스턴스 기억도 짧게 (적립 경로는 30초, 여기는 5초)
  const ev = await cachedPointEvent(now, req.nextUrl.searchParams.has("fresh") ? POINT_EVENT_FRESH_MS : undefined);
  return json<PointEventResponse>(
    { event: isBoosted(earnBoostAt(ev, now)) ? ev : null },
    {
      headers: {
        "Vercel-CDN-Cache-Control": "max-age=30, stale-while-revalidate=60",
        "Cache-Control": "no-store",
      },
    },
  );
});
