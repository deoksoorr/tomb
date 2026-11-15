import { speciesById } from "@/lib/forage/catalog";
import { handler, json } from "@/lib/http";
import { kstWeek } from "@/lib/store/accounts";
import { champBoard } from "@/lib/weeklyChamp";

/** 수조 한 칸: 물고기 id · 이름 · 크기(cm×10) · 낚은 사람 */
export type AquariumFish = { sp: string; fish: string; size: number; name: string };
export type AquariumResponse = { week: string; top: AquariumFish[] };

/** 같은 서버 인스턴스는 5분에 한 번만 랭킹을 읽는다 (CDN도 5분) */
const TTL_MS = 5 * 60_000;
let memo: { at: number; data: AquariumResponse } | null = null;
let inflight: Promise<AquariumResponse> | null = null;

async function load(): Promise<AquariumResponse> {
  const week = kstWeek();
  // 이번 주 최대어 전체 판 (직접 낚은 것만 기록된다 — lib/forage/fishRank, 운영자 제외)
  const r = await champBoard("fish", week, 3, null);
  const top = r.rows
    .filter((x) => x.sp && x.value > 0)
    .map((x) => ({ sp: x.sp!, fish: speciesById(x.sp!)?.name ?? x.sp!, size: x.value, name: x.name }));
  return { week, top };
}

/**
 * 11/15 납품 부두 기록 수족관: 이번 주 가장 큰 물고기 1~3위 (주간 최대어 랭킹 전체 판).
 * 방문자와 무관한 응답이라 CDN에 5분 캐시하고, 서버도 인스턴스마다 5분 동안 기억한다 → Redis는 인스턴스당 5분에 한 번(정렬 집합 1번 + 이름 파이프라인 1번)
 */
export const GET = handler(async () => {
  const now = Date.now();
  if (!memo || now - memo.at > TTL_MS || memo.data.week !== kstWeek()) {
    inflight ??= load().finally(() => (inflight = null));
    memo = { at: now, data: await inflight };
  }
  return json<AquariumResponse>(memo.data, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } });
});
