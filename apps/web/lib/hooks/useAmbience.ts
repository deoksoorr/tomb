"use client";

import { useSyncExternalStore } from "react";
import { ambienceAt, parseAmbienceOverride, type Ambience } from "@/lib/ambience";

const RECOMPUTE_MS = 60_000;

let current: Ambience | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const compute = () => ambienceAt(Date.now(), parseAmbienceOverride(window.location.search));

function same(a: Ambience, b: Ambience): boolean {
  return (
    a.phase === b.phase &&
    a.weather === b.weather &&
    a.intensity === b.intensity &&
    a.palette.skyTop === b.palette.skyTop &&
    a.palette.skyBottom === b.palette.skyBottom &&
    a.palette.fireflies === b.palette.fireflies &&
    a.palette.celestial === b.palette.celestial
  );
}

function recompute() {
  const next = compute();
  if (current && same(current, next)) return;
  current = next;
  listeners.forEach((fn) => fn());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(recompute, RECOMPUTE_MS);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): Ambience {
  current ??= compute();
  return current;
}

/**
 * 한국 시간 기준 하늘·날씨 (?time=dusk&weather=snow 로 QA 강제 가능).
 * 서버 렌더와 하이드레이션 중에는 null이라 밤 기본값으로 그리고, 마운트 후 실제 값으로 바뀐 뒤 1분마다 다시 계산한다.
 */
export function useAmbience(): Ambience | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
