"use client";

import { useCallback, useSyncExternalStore } from "react";

/** 서버 렌더와 하이드레이션 중에는 false */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noSubscribe = () => () => {};

/** 하이드레이션이 끝났는지. localStorage처럼 서버에 없는 값을 그리기 전에 쓴다 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}
