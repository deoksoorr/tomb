"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { cx } from "./cx";
import s from "./FloatingStick.module.css";

// 11/15 떠다니는 조이스틱 (폰·태블릿): 화면 왼쪽 약 45%(위 HUD 아래) 어디든 누르면 그 자리에 바닥 원이 생기고,
// 끌면 손잡이가 따라온다. 떼면 사라지고 마지막 자리에 흐린 원만 남는다 (처음엔 왼쪽 아래 기본 자리).
// 크기는 화면에 맞춘다: 지름 clamp(120px, 22vmin, 200px) — 태블릿은 큰 쪽.
// 손가락 하나만 잡는다 (다른 손가락은 오른쪽 버튼·화면으로). 값은 -1..1, 데드존은 게임이 처리한다.
// onTap: 움직이지 않고 짧게 뗀 터치 (월드: 아래 캔버스로 넘겨 소품·사람 누르기가 그대로 되게)

/** 손잡이가 움직이는 거리 (바닥 원 반지름의 배수) — 여기까지 끌면 1 */
const TRAVEL = 0.62;
/** 이만큼 안 움직이고 이 시간 안에 떼면 탭 */
const TAP_SLOP = 8;
const TAP_MS = 300;

type Pt = { x: number; y: number };

export default function FloatingStick({
  onStick,
  onTap,
  hidden = false,
  className,
}: {
  onStick: (x: number, y: number) => void;
  onTap?: (clientX: number, clientY: number) => void;
  hidden?: boolean;
  /** 영역 위치·깊이 덮어쓰기 */
  className?: string;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0, t: 0, moved: false });
  const last = useRef<Pt>({ x: 0, y: 0 });
  // 지금 잡은 자리 / 마지막으로 놓은 자리 (영역 안 좌표)
  const [at, setAt] = useState<Pt | null>(null);
  const [idle, setIdle] = useState<Pt | null>(null);

  const send = (x: number, y: number) => {
    if (x === last.current.x && y === last.current.y) return;
    last.current = { x, y };
    onStick(x, y);
  };

  const reset = useEffectEvent(() => {
    const id = pid.current;
    pid.current = null;
    if (id !== null && zoneRef.current?.hasPointerCapture(id)) zoneRef.current.releasePointerCapture(id);
    if (knobRef.current) knobRef.current.style.transform = "";
    setAt(null);
    last.current = { x: 0, y: 0 };
    onStick(0, 0);
  });

  // 앱 전환·탭 숨김·화면을 떠날 때 계속 걸어가지 않게
  useEffect(() => {
    const onLeave = () => reset();
    const onVis = () => {
      if (document.hidden) reset();
    };
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      reset();
    };
  }, []);

  useEffect(() => {
    if (hidden) reset();
  }, [hidden]);

  function move(e: PointerEvent<HTMLDivElement>) {
    const base = baseRef.current;
    const reach = ((base?.offsetWidth ?? 120) / 2) * TRAVEL;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.hypot(dx, dy) > TAP_SLOP) start.current.moved = true;
    let x = dx / reach;
    let y = dy / reach;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${x * reach}px, ${y * reach}px)`;
    send(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  }

  function release(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (e.pointerId !== pid.current) return;
    const st = start.current;
    const tap = !cancelled && !st.moved && performance.now() - st.t < TAP_MS;
    if (at) setIdle(at);
    reset();
    if (tap) onTap?.(e.clientX, e.clientY);
  }

  const spot = at ?? idle;
  return (
    <div
      ref={zoneRef}
      className={cx(s.zone, className)}
      data-hidden={hidden || undefined}
      role="application"
      aria-label="이동 조이스틱 (왼쪽 아무 데나 누르고 끌기)"
      onPointerDown={(e) => {
        if (e.button > 0) return;
        // 이미 잡은 손가락이 있으면 무시 (캡처가 풀린 묵은 값이면 새 손가락이 이어받는다)
        if (pid.current !== null && e.currentTarget.hasPointerCapture(pid.current)) return;
        e.stopPropagation();
        pid.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        start.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
        if (knobRef.current) knobRef.current.style.transform = "";
        setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pid.current) move(e);
      }}
      onPointerUp={(e) => release(e, false)}
      onPointerCancel={(e) => release(e, true)}
      onLostPointerCapture={(e) => release(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={baseRef} className={s.base} data-active={!!at || undefined} data-default={!spot || undefined} style={spot ? { left: spot.x, top: spot.y } : undefined} aria-hidden="true">
        <div ref={knobRef} className={s.knob} />
      </div>
    </div>
  );
}

/** 짧은 탭을 그 자리의 게임 캔버스로 넘긴다 (조이스틱 영역이 캔버스를 덮고 있어서) */
let fakeId = 50_000;
export function tapCanvasAt(clientX: number, clientY: number): void {
  const pointerId = ++fakeId;
  const canvas = document.elementsFromPoint(clientX, clientY).find((el): el is HTMLCanvasElement => el instanceof HTMLCanvasElement);
  if (!canvas) return;
  const init: PointerEventInit = { bubbles: true, cancelable: true, pointerId, pointerType: "touch", isPrimary: true, clientX, clientY, button: 0, buttons: 1 };
  canvas.dispatchEvent(new PointerEvent("pointerdown", init));
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
}
