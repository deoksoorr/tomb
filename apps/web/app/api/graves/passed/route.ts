import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { normalizeQuery, pagePassed, toPassedEntry } from "@/lib/store/passing";
import type { PassedListResponse } from "@/lib/types";

/** 11/18 검색어마다 성불 기록 전체(HGETALL)를 읽지 않게 인스턴스가 잠깐 기억하는 시간 */
const ALL_MEMO_MS = 15_000;
const g = globalThis as typeof globalThis & { __tombPassedMemo?: { at: number; all: Awaited<ReturnType<ReturnType<typeof getStore>["passedAll"]>> } };

async function passedAllMemo(now: number) {
  const hit = g.__tombPassedMemo;
  if (hit && now >= hit.at && now - hit.at < ALL_MEMO_MS) return hit.all;
  const all = await getStore().passedAll();
  g.__tombPassedMemo = { at: now, all };
  return all;
}

/**
 * 성불한 이야기들 (49번): 최신 성불 순, `?q=` 검색(이름·묘비명·상주·한마디), `?offset=` 다음 쪽.
 * 방문자와 무관한 응답이라 CDN에 1분 캐시한다. 11/18 보안: 검색 결과도 같은 검색어끼리는 CDN에 (예전에는 검색마다 전체를 읽었다),
 * 검색어를 바꿔 가며 부르면 인스턴스 기억(ALL_MEMO_MS)으로 전체 읽기를 아낀다. 쪽 위치는 0..1만까지
 */
export const GET = handler(async (req) => {
  await rateLimit("detail", req);
  const params = req.nextUrl.searchParams;
  const q = normalizeQuery(params.get("q"));
  const raw = Number(params.get("offset") ?? 0);
  const offset = Number.isFinite(raw) ? Math.min(10_000, Math.max(0, raw)) : 0;
  const page = pagePassed(await passedAllMemo(Date.now()), { q, offset });
  return json<PassedListResponse>(
    { entries: page.items.map(toPassedEntry), next: page.next, total: page.total },
    { headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=60, stale-while-revalidate=600" } },
  );
});
