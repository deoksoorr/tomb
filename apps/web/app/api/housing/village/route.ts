import { handler, json } from "@/lib/http";
import { getHouseStore, village } from "@/lib/housing/service";
import type { VillageResponse } from "@/lib/housing/types";

/** 분양 마을: 번지별 집 외관·문패. 방문자와 무관해서 CDN에 15초 캐시한다 (브라우저는 no-store) */
export const GET = handler(async () =>
  json<VillageResponse>(await village(getHouseStore()), {
    headers: { "Vercel-CDN-Cache-Control": "max-age=15, stale-while-revalidate=86400", "Cache-Control": "no-store" },
  }),
);
