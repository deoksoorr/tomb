"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

// 11/19 꾹 누르면 계속 (능력치 +/−): 누르는 순간 한 번, 0.35초 뒤부터 되풀이하고 누를수록 빨라진다.
// 키보드(Enter·Space)는 지금처럼 한 번씩 — click의 detail이 0일 때만 받는다 (마우스·손가락 클릭은 pointerdown이 이미 셌다)

/** 처음 되풀이까지 (ms) */
const HOLD_DELAY_MS = 350;
/** 되풀이 간격: 처음 → 가장 빠를 때 (ms) */
const HOLD_FIRST_MS = 110;
const HOLD_FAST_MS = 35;

export function useHoldRepeat(step: () => void, enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(step);
  // 되풀이 도중에도 늘 마지막 step을 부른다 (렌더 뒤에 맞춘다)
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  // 막히면(포인트를 다 썼다 등) 바로 멈춘다
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);
  useEffect(() => stop, [stop]);
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    stepRef.current();
    let gap = HOLD_FIRST_MS;
    const tick = () => {
      stepRef.current();
      gap = Math.max(HOLD_FAST_MS, gap * 0.85);
      timer.current = setTimeout(tick, gap);
    };
    stop();
    timer.current = setTimeout(tick, HOLD_DELAY_MS);
  };
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0 && enabled) stepRef.current();
  };
  return { onPointerDown, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop, onClick, onContextMenu: (e: MouseEvent) => e.preventDefault() };
}
