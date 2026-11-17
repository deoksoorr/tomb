import { handler, json } from "@/lib/http";
import type { MapConceptResponse } from "@/lib/mapConcept";
import { cachedMapConcept, MAP_CONCEPT_FRESH_MS } from "@/lib/store/mapConcept";

/**
 * 11/17 마을 맵 컨셉 (lib/mapConcept). 게임이 1분마다 가볍게 확인한다 — 모두 같은 값이라 CDN에 30초 캐시.
 * 바뀜 공지를 들은 화면은 ?fresh=시각을 붙여 캐시를 건너뛴다 (lib/mapConceptClient)
 */
export const GET = handler(async (req) => {
  const concept = await cachedMapConcept(Date.now(), req.nextUrl.searchParams.has("fresh") ? MAP_CONCEPT_FRESH_MS : undefined);
  return json<MapConceptResponse>(
    { concept },
    {
      headers: {
        "Vercel-CDN-Cache-Control": "max-age=30, stale-while-revalidate=60",
        "Cache-Control": "no-store",
      },
    },
  );
});
