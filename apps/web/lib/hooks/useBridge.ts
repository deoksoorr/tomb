"use client";

import { useCallback, useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { bridge, type GameEvents, type UiEvents } from "@/game/bridge";

type AllEvents = GameEvents & UiEvents;

/** 브리지 이벤트 구독. handler는 매 렌더 최신 값을 본다 */
export function useBridgeEvent<K extends keyof AllEvents>(event: K, handler: (payload: AllEvents[K]) => void): void {
  const onEvent = useEffectEvent(handler);
  useEffect(() => bridge.on(event, (payload) => onEvent(payload)), [event]);
}

/** sticky 이벤트(net:status, camera:state …)의 현재 값 */
export function useBridgeValue<K extends keyof AllEvents>(event: K): AllEvents[K] | undefined {
  const subscribe = useCallback((onChange: () => void) => bridge.on(event, onChange), [event]);
  return useSyncExternalStore(
    subscribe,
    () => bridge.last(event),
    () => undefined,
  );
}
