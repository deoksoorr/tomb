import { handler, HttpError, json } from "@/lib/http";
import { VillageQuerySchema } from "@/lib/housing/schemas";
import { getHouseStore, village } from "@/lib/housing/service";
import type { VillageResponse } from "@/lib/housing/types";

/** 서버 메모리 캐시 (채널별). 화면은 5분마다 묻고, 저장 직후 갱신(`&t=`)은 캐시를 건너뛰고 새로 채운다 */
const MEMO_MS = 60_000;
const memo = new Map<number, { at: number; v: Promise<VillageResponse> }>();

function cachedVillage(ch: number, fresh: boolean): Promise<VillageResponse> {
  const now = Date.now();
  const hit = memo.get(ch);
  if (!fresh && hit && now - hit.at < MEMO_MS) return hit.v;
  const v = village(getHouseStore(), ch, now);
  memo.set(ch, { at: now, v });
  // 실패한 결과는 남기지 않는다 (다음 요청이 다시 읽는다)
  v.catch(() => {
    if (memo.get(ch)?.v === v) memo.delete(ch);
  });
  return v;
}

/**
 * 한 채널의 분양 마을 `?ch=N`: 번지별 집 외관·문패 (채널마다 주거 구역이 따로다. ch가 없으면 1채널).
 * 방문자와 무관해서 CDN에 15초 캐시한다 (주소에 ch가 들어가 채널마다 따로 캐시된다. 브라우저는 no-store).
 * 서버 메모리에도 1분 둔다 (`t`가 있는 저장 직후 요청은 빼고)
 */
export const GET = handler(async (req) => {
  const raw = req.nextUrl.searchParams.get("ch");
  const parsed = VillageQuerySchema.safeParse(raw ?? 1);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  return json<VillageResponse>(await cachedVillage(parsed.data, req.nextUrl.searchParams.has("t")), {
    headers: { "Vercel-CDN-Cache-Control": "max-age=15, stale-while-revalidate=86400", "Cache-Control": "no-store" },
  });
});
