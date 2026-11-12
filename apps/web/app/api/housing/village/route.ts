import { handler, HttpError, json } from "@/lib/http";
import { VillageQuerySchema } from "@/lib/housing/schemas";
import { getHouseStore, village } from "@/lib/housing/service";
import type { VillageResponse } from "@/lib/housing/types";

/**
 * 한 채널의 분양 마을 `?ch=N`: 번지별 집 외관·문패 (채널마다 주거 구역이 따로다. ch가 없으면 1채널).
 * 방문자와 무관해서 CDN에 15초 캐시한다 (주소에 ch가 들어가 채널마다 따로 캐시된다. 브라우저는 no-store)
 */
export const GET = handler(async (req) => {
  const raw = req.nextUrl.searchParams.get("ch");
  const parsed = VillageQuerySchema.safeParse(raw ?? 1);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  return json<VillageResponse>(await village(getHouseStore(), parsed.data), {
    headers: { "Vercel-CDN-Cache-Control": "max-age=15, stale-while-revalidate=86400", "Cache-Control": "no-store" },
  });
});
