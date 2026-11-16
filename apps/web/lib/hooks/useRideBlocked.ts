"use client";

import { rideBlockReason } from "@/lib/ridePolicy";
import { useBridgeValue } from "./useBridge";

/** 11/16 탈것에 타 있으면 그 안내 문구 (버튼을 흐리게 하고 툴팁으로), 아니면 null — lib/rideGate와 같은 규칙 */
export function useRideBlocked(todo?: string): string | null {
  const st = useBridgeValue("player:ride");
  const bus = useBridgeValue("bus:state")?.riding === true;
  return rideBlockReason(st, bus, todo);
}
