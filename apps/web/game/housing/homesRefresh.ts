import type { HomesZone } from "@tomb/protocol";
import { bridge } from "../bridge";

// 11/26 집 목록 바뀜 알림(실시간 서버 homes → bridge "homes:changed")을 받아 그 구역 집 그림을 다시 받게 한다.
// 같은 채널 화면들이 한꺼번에 묻지 않게 조금씩 흩고(HOMES_JITTER_MS), 같은 v는 한 번만. 받는 쪽은 /api/housing/village?…&v=로 묻는다
// (주소가 같아 CDN이 v마다 한 번만 서버에 묻는다 — 서버 메모리 캐시는 v가 있으면 건너뛴다).

/** 알림을 받고 다시 받기까지 (최소, 최대 ms) — 같은 채널 화면들이 흩어져 묻게 */
export const HOMES_JITTER_MS = [300, 1800] as const;

/** zone 알림을 들으면 흩은 뒤 run(v). 끄는 함수 (기다리던 것도 지운다) */
export function onHomesChanged(zone: HomesZone, run: (v: number) => void, rand: () => number = Math.random): () => void {
  let lastV = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const off = bridge.on("homes:changed", (m) => {
    if (m.zone !== zone || m.v <= lastV) return;
    lastV = m.v;
    if (timer) clearTimeout(timer);
    const [a, b] = HOMES_JITTER_MS;
    timer = setTimeout(() => {
      timer = null;
      run(m.v);
    }, a + Math.floor(rand() * (b - a)));
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
