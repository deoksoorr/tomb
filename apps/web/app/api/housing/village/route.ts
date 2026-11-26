import { rateLimit } from "@/lib/ratelimit";
import { handler, HttpError, json } from "@/lib/http";
import { VillageQuerySchema, zoneOfQuery } from "@/lib/housing/schemas";
import { sweepReclaimIfDue } from "@/lib/housing/reclaim";
import { getHouseStore, village } from "@/lib/housing/service";
import type { HouseZone } from "@/lib/housing/catalog";
import type { VillageResponse } from "@/lib/housing/types";

/** 서버 메모리 캐시 (채널별). 화면은 5분마다 묻고, 저장 직후 갱신(`&t=`)은 캐시를 건너뛰고 새로 채운다 */
const MEMO_MS = 60_000;
const memo = new Map<string, { at: number; v: Promise<VillageResponse> }>();

function cachedVillage(ch: number, fresh: boolean, zone: HouseZone): Promise<VillageResponse> {
  const now = Date.now();
  const key = `${zone}:${ch}`;
  const hit = memo.get(key);
  if (!fresh && hit && now - hit.at < MEMO_MS) return hit.v;
  const v = village(getHouseStore(), ch, now, zone);
  memo.set(key, { at: now, v });
  // 실패한 결과는 남기지 않는다 (다음 요청이 다시 읽는다)
  v.catch(() => {
    if (memo.get(key)?.v === v) memo.delete(key);
  });
  return v;
}

/**
 * 한 채널의 분양 마을 `?ch=N`: 번지별 집 외관·문패 (채널마다 주거 구역이 따로다. ch가 없으면 1채널).
 * 방문자와 무관해서 CDN에 15초 캐시한다 (주소에 ch가 들어가 채널마다 따로 캐시된다. 브라우저는 no-store).
 * 서버 메모리에도 1분 둔다 (`t`가 있는 저장 직후 요청·`v`가 있는 집 바뀜 알림 뒤 요청은 빼고). 11/16 `&zone=sea` = 그 채널 포구 오두막 11터, 11/26 `&zone=camp` = 그 채널 캠핑장 집터 16
 */
export const GET = handler(async (req) => {
  // 공개 조회 (`?t=`는 서버 캐시를 건너뛰므로 IP 한도로 반복 호출을 막는다 — 메모리 한도라 Redis 명령 0)
  await rateLimit("publicGet", req);
  const raw = req.nextUrl.searchParams.get("ch");
  const parsed = VillageQuerySchema.safeParse(raw ?? 1);
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  // 오래 비운 집 정리 (인스턴스 메모리 + 잠금으로 3시간에 한 번. 비운 집이 있으면 이번 응답부터 빈 번지로)
  const swept = await sweepReclaimIfDue(getHouseStore()).catch((e: unknown) => {
    console.error("[housing] 오래 비운 집 정리 실패", e);
    return null;
  });
  // 11/26 `&v=` = 실시간 서버의 집 바뀜 알림(homes)을 받은 화면들이 같은 값으로 묻는다 → 서버 메모리는 건너뛰고, CDN은 v마다 한 번만 여기로 온다
  const fresh = req.nextUrl.searchParams.has("t") || req.nextUrl.searchParams.has("v") || !!swept?.reclaimed.length;
  // 11/26 stale-while-revalidate 하루 → 45초: 조용한 채널은 맵에 들어갈 때 몇 분·몇 시간 묵은 목록(분양 전)을 받아 5분 들고 있었다
  // (운영: 카라반 분양이 새로고침해야 보였다). 뒤에서 다시 받는 횟수는 같고, 1분 넘게 아무도 안 물은 주소만 한 번 기다려 새로 받는다
  return json<VillageResponse>(await cachedVillage(parsed.data, fresh, zoneOfQuery(req.nextUrl.searchParams.get("zone"))), {
    headers: { "Vercel-CDN-Cache-Control": "max-age=15, stale-while-revalidate=45", "Cache-Control": "no-store" },
  });
});
