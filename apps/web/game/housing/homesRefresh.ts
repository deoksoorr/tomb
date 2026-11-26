import type { HomesMsg, HomesZone } from "@tomb/protocol";
import { bridge } from "../bridge";

// 11/26 집 목록 바뀜 알림(실시간 서버 homes → bridge "homes:changed")을 받아 그 구역 집 그림을 다시 받게 한다.
// 같은 채널 화면들이 한꺼번에 묻지 않게 조금씩 흩고(HOMES_JITTER_MS), 같은 v는 한 번만. 받는 쪽은 /api/housing/village?…&v=로 묻는다
// (주소가 같아 CDN이 v마다 한 번만 서버에 묻는다 — 서버 메모리 캐시는 v가 있으면 건너뛴다).

/** 알림을 받고 다시 받기까지 (최소, 최대 ms) — 같은 채널 화면들이 흩어져 묻게 */
export const HOMES_JITTER_MS = [300, 1800] as const;

/**
 * zone 알림을 들으면 흩은 뒤 run(v). 끄는 함수 (기다리던 것도 지운다).
 * covered(v) = 11/26 지금 그린 목록이 이미 v 뒤에 만든 것이다 → 건너뛴다 (실시간 서버가 입장 때 이 채널 마지막 v를 다시 보낸다)
 */
export function onHomesChanged(zone: HomesZone, run: (v: number) => void, rand: () => number = Math.random, covered?: (v: number) => boolean): () => void {
  let lastV = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const off = bridge.on("homes:changed", (m) => {
    if (m.zone !== zone || m.v <= lastV) return;
    lastV = m.v;
    if (timer) clearTimeout(timer);
    const [a, b] = HOMES_JITTER_MS;
    timer = setTimeout(() => {
      timer = null;
      if (covered?.(m.v)) return;
      run(m.v);
    }, a + Math.floor(rand() * (b - a)));
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

// 11/26 늦게 들어온 화면이 옛 목록을 들고 있던 것 (운영: 카라반 분양이 새로고침해야 보였다).
// 맵에 들어갈 때·5분 주기 조회는 CDN 주소(?ch&zone)라 stale-while-revalidate가 분양 전 목록을 줄 수 있다 (조용한 채널은 몇 분 묵은 것).
// homes 알림은 맵과 상관없이 채널 모두에게 오므로 구역마다 가장 새 v를 기억해 두고, 받은 목록이 그보다 먼저 만든 것이면 그 v로 한 번 더 받는다
// (같은 v 주소라 CDN이 v마다 한 번만 서버에 묻는다 — 바뀐 일이 없으면 더 묻지 않는다).
const seenV = new Map<HomesZone, number>();

/** 받은 homes를 기억한다 (WorldScene onHomes — 지금 맵과 상관없이) */
export function noteHomes(m: HomesMsg): void {
  if (m.v > (seenV.get(m.zone) ?? 0)) seenV.set(m.zone, m.v);
}

/** generatedAt에 만든 zone 목록이 이 화면이 들은 집 바뀜보다 먼저 만든 것이면 그 v (그 v로 다시 받는다), 아니면 null */
export function staleHomesV(zone: HomesZone, generatedAt: number): number | null {
  const v = seenV.get(zone) ?? 0;
  return v > generatedAt ? v : null;
}

/** 지금 그린 목록(shownAt)보다 먼저 만든 응답이다 — 늦게 온 CDN 옛 응답이 알림으로 받은 새 목록을 덮지 않게 버린다 */
export function isOlderHomes(shownAt: number, generatedAt: number): boolean {
  return generatedAt < shownAt;
}
