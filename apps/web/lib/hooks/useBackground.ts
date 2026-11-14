"use client";

import { useSyncExternalStore } from "react";
import { isBackground, onBackgroundChange } from "@/lib/background";

/** 뒤로 간 상태(숨긴 탭·다른 창을 보는 중, lib/background)인지 — 바뀌면 다시 그린다 */
export function useBackground(): boolean {
  return useSyncExternalStore(onBackgroundChange, isBackground, () => false);
}
