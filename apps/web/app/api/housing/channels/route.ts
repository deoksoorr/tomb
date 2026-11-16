import { handler, json } from "@/lib/http";
import { getHouseStore } from "@/lib/housing/service";

export type HouseChannelsResponse = { channels: number[] };

/** 서버 메모리 캐시 (분양·철거가 잦지 않아 1분이면 충분하다) */
const MEMO_MS = 60_000;
let memo: { at: number; v: Promise<number[]> } | null = null;

function houseChannels(now: number): Promise<number[]> {
  if (memo && now - memo.at < MEMO_MS) return memo.v;
  const v = getHouseStore()
    .listAll()
    .then((houses) => [...new Set(houses.map((h) => h.ch))].filter((ch) => Number.isInteger(ch) && ch > 0).sort((a, b) => a - b));
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
    { channels: await houseChannels(Date.now()) },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=86400", "Cache-Control": "no-store" } },
  ),
);
