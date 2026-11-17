import { bridge } from "@/game/bridge";
import { request } from "../api";
import { readItem, writeItem } from "../storage";
import type { SnackBuyResult, SnackThrowResult } from "./gullService";
import type { GullSnacks, SnackKind } from "./gull";

// 11/17 브라우저 → 포구 갈매기 과자 API · 손에 든 과자 (이 브라우저 기억) · 게임에 알리기 (sea:gull:snacks)

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const HAND_KEY = "tomb.sea.snackHand";

export const gullApi = {
  get: () => request<GullSnacks>("/api/sea/gull"),
  buy: (kind: SnackKind) => request<SnackBuyResult>("/api/sea/gull", post({ op: "buy", kind })),
  throw: (kind: SnackKind) => request<SnackThrowResult>("/api/sea/gull", post({ op: "throw", kind })),
};

/** 손에 든 과자 (없으면 갈매기 과자) */
export function snackHand(): SnackKind {
  return readItem(HAND_KEY) === "spicy" ? "spicy" : "plain";
}
export function setSnackHand(hand: SnackKind): void {
  writeItem(HAND_KEY, hand);
  const last = bridge.last("sea:gull:snacks");
  if (last) bridge.emit("sea:gull:snacks", { ...last, hand });
}
/** 가진 과자를 게임·창에 알려요 */
export function publishSnacks(s: { plain: number; spicy: number }): void {
  bridge.emit("sea:gull:snacks", { plain: s.plain, spicy: s.spicy, hand: snackHand() });
}
