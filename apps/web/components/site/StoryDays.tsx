"use client";

import { useSyncExternalStore } from "react";

/** 시작일(KST)부터 오늘(KST)까지 며칠째 */
export function daysSince(y: number, m: number, d: number, now: number): number {
  return Math.floor((now + 9 * 3_600_000 - Date.UTC(y, m - 1, d)) / 86_400_000) + 1;
}

const noSubscribe = () => () => {};

/** 「오늘로 N일째」 (KST 날짜로 센다. 서버에서 그린 HTML과 어긋나지 않게 화면에서만 채운다) */
export default function StoryDays({ y, m, d }: { y: number; m: number; d: number }) {
  const days = useSyncExternalStore(
    noSubscribe,
    () => daysSince(y, m, d, Date.now()),
    () => null,
  );
  return <>{days === null ? "첫 커밋부터 지금까지" : `오늘로 ${days}일째`}</>;
}
