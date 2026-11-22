import { rideGate, rideKindNow } from "./rideGate";
import type { RideKind } from "./ridePolicy";

// 11/22 탈것에 탄 채 다른 장면으로 가려다 막혔을 때 띄우는 가운데 알림 하나 (화면 전체에 하나 — GameShell의 RideStopHost가 그린다).
// 창을 닫고 알림만 남기는 곳(곤충 채집·잡화점·분양 사무소 걷기·[사냥] 버튼)이 쓴다. 창이 살아 있어야 이어서 할 수 있는 곳
// (사냥터·귀신의 집·별자리·집 창)은 components/overlay/RideStopDialog의 useRideStopGate로 그 창 자리에 띄운다.

export type RideStopReq = {
  kind: RideKind;
  /** 하려는 일 ("곤충 채집을 할" …) */
  todo: string;
  /** 펫이면 [label]: 내린 뒤 run (없으면 [확인]만) */
  go?: { label: string; run: () => void };
  /** [확인]·×로 닫을 때 */
  onClose?: () => void;
};

let cur: RideStopReq | null = null;
const subs = new Set<() => void>();
const tell = () => subs.forEach((f) => f());

export const rideStopNow = (): RideStopReq | null => cur;
export function subscribeRideStop(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}
export function showRideStop(r: RideStopReq): void {
  cur = r;
  tell();
}
export function clearRideStop(): void {
  if (!cur) return;
  cur = null;
  tell();
}

/** rideGate와 같지만 막히면 아래 토스트 대신 가운데 알림. 막힌 문구를 돌려준다 (가도 되면 null — 앉아 있었으면 일으켜 세운다) */
export function rideGateAlert(todo: string, go?: RideStopReq["go"], onClose?: () => void): string | null {
  const why = rideGate(todo, true);
  if (why) showRideStop({ kind: rideKindNow() ?? "other", todo, ...(go ? { go } : {}), ...(onClose ? { onClose } : {}) });
  return why;
}
