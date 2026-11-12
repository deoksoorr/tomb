import { handler, json } from "@/lib/http";
import { LIST_LIMIT } from "@/lib/housing/catalog";
import { SortSchema } from "@/lib/housing/schemas";
import { getHouseStore, toSummary } from "@/lib/housing/service";
import { staffAccountId } from "@/lib/staff";
import type { HouseListResponse } from "@/lib/housing/types";

/**
 * 분양지 목록·랭킹 `?sort=score|likes|new` (상위 50). 방문자와 무관해서 CDN에 30초 캐시한다 (쿠키를 읽지 않는다).
 * 브라우저는 캐시하지 않는다 (묘비 목록과 같은 정책).
 */
export const GET = handler(async (req) => {
  const sort = SortSchema.parse(req.nextUrl.searchParams.get("sort") ?? "score");
  const [list, staffId] = await Promise.all([getHouseStore().list(sort, LIST_LIMIT), staffAccountId()]);
  const houses = list.map((h) => toSummary(h, staffId)); // 운영자 집주인은 "운영자"로
  return json<HouseListResponse>(
    { sort, houses, generatedAt: Date.now() },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=30, stale-while-revalidate=86400", "Cache-Control": "no-store" } },
  );
});
