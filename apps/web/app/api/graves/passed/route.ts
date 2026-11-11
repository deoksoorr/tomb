import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { normalizeQuery, pagePassed, toPassedEntry } from "@/lib/store/passing";
import type { PassedListResponse } from "@/lib/types";

/**
 * 성불한 이야기들 (49번): 최신 성불 순, `?q=` 검색(이름·묘비명·상주·한마디), `?offset=` 다음 쪽.
 * 방문자와 무관한 응답이라 검색어가 없으면 CDN에 1분 캐시한다
 */
export const GET = handler(async (req) => {
  await rateLimit("detail", req);
  const params = req.nextUrl.searchParams;
  const q = normalizeQuery(params.get("q"));
  const offset = Number(params.get("offset") ?? 0);
  const page = pagePassed(await getStore().passedAll(), { q, offset: Number.isFinite(offset) ? offset : 0 });
  return json<PassedListResponse>(
    { entries: page.items.map(toPassedEntry), next: page.next, total: page.total },
    {
      headers: q
        ? { "Cache-Control": "private, no-store" }
        : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=60, stale-while-revalidate=600" },
    },
  );
});
