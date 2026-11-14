import { handler, json } from "@/lib/http";
import { findVisibleHouse, getHouseStore, toPublicHouse } from "@/lib/housing/service";
import type { HouseDetailResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";

/** 집 하나 (배치 포함). 방문자와 무관해서 CDN에 10초 캐시한다. 내 상태(좋아요 여부)는 /viewer */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("detail", req);
  const house = toPublicHouse(await findVisibleHouse(getHouseStore(), id));
  return json<HouseDetailResponse>(
    { house },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=10, stale-while-revalidate=600", "Cache-Control": "no-store" } },
  );
});
