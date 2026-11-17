"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { ambienceAt, parseAmbienceOverride, type Ambience } from "@/lib/ambience";

const RECOMPUTE_MS = 60_000;
/** 장면이 이만큼 안에 날씨를 알려 줬으면 시계로 따로 계산하지 않는다 (장면은 1분마다 알린다, 조금 늦는 프레임 여유) */
const GAME_FRESH_MS = RECOMPUTE_MS + 10_000;

let current: Ambience | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** 장면(Atmosphere)이 마지막으로 날씨를 알려 준 시각 */
let gameAt = -Infinity;
let gameHooked = false;
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

function apply(next: Ambience) {
  if (current && same(current, next)) return;
  current = next;
  listeners.forEach((fn) => fn());
}

function recompute() {
  // 11/17 장면이 날씨를 알려 주는 동안에는 그 값만 따른다. 시계를 따로 돌리면 1분 주기가 장면과 어긋나 글이 최대 1분 늦게(또는 먼저) 바뀌었다
  if (Date.now() - gameAt < GAME_FRESH_MS) return;
  apply(compute());
}

function fromGame(a: Ambience) {
  gameAt = Date.now();
  apply(a);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 장면 소식은 한 번 붙이면 계속 듣는다 (구독자가 잠깐 없을 때 온 값도 놓치지 않게)
  if (!gameHooked) {
    gameHooked = true;
    bridge.on("ambience:now", fromGame);
  }
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
 * 게임 장면이 떠 있으면 장면이 쓰는 값(bridge ambience:now)을 그대로 받아 장면 날씨와 같은 순간에 바뀐다.
 */
export function useAmbience(): Ambience | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** 테스트용: 모듈 상태와 함수 (React 없이 확인) */
export const ambienceStoreForTest = {
  subscribe,
  getSnapshot,
  recompute,
  reset() {
    current = null;
    gameAt = -Infinity;
  },
};
