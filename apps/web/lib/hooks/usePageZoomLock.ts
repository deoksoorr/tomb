"use client";

import { useEffect } from "react";

// 11/22 사냥(판·로비·결과)·야근 빌딩·회장님 독대 동안 페이지 확대를 막는다 (사용자 「폰에서 누르면서 사냥하면 화면이 확대된다」)
//  - 뷰포트 meta에 maximum-scale=1·user-scalable=no (안드로이드 두 손가락·두 번 누르기, iOS 입력칸 확대)
//  - iOS 사파리는 user-scalable=no를 무시해서 gesturestart·gesturechange를 막는다 (두 손가락)
//  - <html data-nozoom> → globals.css가 모든 요소에 touch-action: manipulation (iOS 두 번 누르기 확대)
// 사이트 페이지(/news 등)·마을은 그대로 확대된다 (접근성). 여러 곳이 같이 써도 마지막이 풀 때 되돌린다.

export const LOCKED_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

let holders = 0;
let saved: string | null = null;

const stop = (e: Event) => e.preventDefault();

function lock(): void {
  if (holders++ > 0) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) {
    saved = meta.content;
    meta.content = LOCKED_VIEWPORT;
  }
  document.documentElement.dataset.nozoom = "";
  document.addEventListener("gesturestart", stop, { passive: false });
  document.addEventListener("gesturechange", stop, { passive: false });
}

function unlock(): void {
  if (--holders > 0) return;
  holders = 0;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && saved !== null) meta.content = saved;
  saved = null;
  delete document.documentElement.dataset.nozoom;
  document.removeEventListener("gesturestart", stop);
  document.removeEventListener("gesturechange", stop);
}

/** 켜져 있는 동안 페이지 확대를 막는다 */
export function usePageZoomLock(on = true): void {
  useEffect(() => {
    if (!on) return;
    lock();
    return unlock;
  }, [on]);
}
