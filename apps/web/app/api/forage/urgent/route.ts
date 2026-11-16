import { rateLimit } from "@/lib/ratelimit";
import { handler, json } from "@/lib/http";
import { urgentPublic } from "@/lib/forage/quests/urgentService";
import type { UrgentPublic } from "@/lib/forage/quests/urgentTypes";

/**
 * 11/15 긴급 의뢰 서버 전체 상태 (위쪽 막대·게시판). 누구에게나 같아 CDN이 몇 초 캐시한다 (진행 중 5초, 없을 땐 다음 시작 전까지 최대 10초).
 * 의뢰가 없을 때는 저장소를 읽지 않는다
 */
export const GET = handler(async (req) => {
  // 공개 조회: 쿼리를 바꿔 CDN 캐시를 건너뛰는 반복 호출 방지 (메모리 한도)
  await rateLimit("publicGet", req);
  const { body, cacheSec } = await urgentPublic();
  return json<UrgentPublic>(body, { headers: { "cache-control": "no-store", "vercel-cdn-cache-control": `s-maxage=${cacheSec}` } });
});
