import { chairHall, type ChairHallResponse } from "@/lib/chairman/hall";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

/** 11/22 회장님 독대 명예의 전당: 지난 주들 모드별 1위 (노멀·헬 함께, 최근 주부터 · 52주). 누구에게나 같다 → CDN 30초 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  return json<ChairHallResponse>(await chairHall(), { headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" } });
});
