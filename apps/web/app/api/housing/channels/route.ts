import { handler, json } from "@/lib/http";
import { fullSaleChannels, type SaleKind } from "@/lib/housing/catalog";
import { getHouseStore } from "@/lib/housing/service";

/** full = 11/26 분양 종류(마을·포구·카라반·펜션·촌캉스)마다 터가 다 찬 채널 (분양 창이 「남은 채널」을 센다 — 같은 집 목록이라 읽기가 늘지 않는다) */
export type HouseChannelsResponse = { channels: number[]; full: Record<SaleKind, number[]> };

/** 서버 메모리 캐시 (분양·철거가 잦지 않아 1분이면 충분하다) */
const MEMO_MS = 60_000;
let memo: { at: number; v: Promise<HouseChannelsResponse> } | null = null;

function houseChannels(now: number): Promise<HouseChannelsResponse> {
  if (memo && now - memo.at < MEMO_MS) return memo.v;
  const v = getHouseStore()
    .listAll()
    .then((houses) => ({
      channels: [...new Set(houses.map((h) => h.ch))].filter((ch) => Number.isInteger(ch) && ch > 0).sort((a, b) => a - b),
      full: fullSaleChannels(houses),
    }));
  memo = { at: now, v };
  v.catch(() => {
    if (memo?.v === v) memo = null;
  });
  return v;
}

/**
 * 11/16 집이 하나라도 있는 채널 목록. 붐빌 때 더 열린 채널(3채널~)은 비면 목록에서 숨는데,
 * 누가 거기 집을 샀으면 그 채널은 늘 목록에 보이게 한다 (화면 useLobby가 합친다 — 자동 배정에는 쓰지 않는다).
 * 방문자와 무관해서 CDN에 1분 캐시한다
 */
export const GET = handler(async () =>
  json<HouseChannelsResponse>(
    await houseChannels(Date.now()),
    { headers: { "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=86400", "Cache-Control": "no-store" } },
  ),
);
