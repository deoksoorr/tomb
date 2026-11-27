import type { MoveVia } from "../moveLog";

// 11/27 집으로 바로 들어가는 길(portal:open housing houseId)을 연 버튼 — 기록용 (lib/moveLog). 여는 쪽이 적고, 분양 사무소 창이 그 집을 열 때 한 번 꺼낸다.
// bridge 이벤트 모양을 바꾸지 않으려고 따로 둔다. 10초가 지난 것은 쓰지 않는다

let pending: { houseId: string; via: MoveVia; at: number } | null = null;

export function markVisitVia(houseId: string, via: MoveVia): void {
  pending = { houseId, via, at: Date.now() };
}

export function takeVisitVia(houseId: string): MoveVia | undefined {
  const p = pending;
  if (!p || p.houseId !== houseId) return undefined;
  pending = null;
  return Date.now() - p.at < 10_000 ? p.via : undefined;
}
