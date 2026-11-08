"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./MobileControls.module.css";

/** 손잡이가 바닥 원 반지름의 몇 배까지 움직이는지 */
const KNOB_TRAVEL = 0.55;

/** 터치 기기 전용: 좌하단 아날로그 조이스틱 + 우하단 [달리기] [앉기] [상호작용] */
export default function MobileControls() {
  const [running, setRunning] = useState(false);
  // sticky라 마운트 전에 다가간 묘비·좌석도 바로 반영된다
  const nearGrave = useBridgeValue("grave:near") != null;
  const nearSeat = useBridgeValue("seat:near");
  const inShop = useBridgeValue("scene:changed")?.scene === "shop";

  function toggleRun() {
    const on = !running;
    setRunning(on);
    bridge.emit("input:runToggle", { on });
  }

  return (
    <>
      <Joystick />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          data-slot="interact"
          data-near={nearGrave}
          onClick={() => bridge.emit("input:interact")}
        >
          {inShop ? "말 걸기" : nearGrave ? "살펴보기" : "상호작용"}
        </button>
        <button
          type="button"
          className={styles.action}
          data-slot="sit"
          data-near={nearSeat != null}
          onClick={() => bridge.emit("input:sit")}
        >
          {nearSeat ? (nearSeat.kind === "bench" ? "벤치에 앉기" : "의자에 앉기") : "앉기"}
        </button>
        <button
          type="button"
          className={styles.action}
          data-slot="run"
          aria-pressed={running}
          onClick={toggleRun}
        >
          달리기
        </button>
      </div>
    </>
  );
}

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const send = (x: number, y: number) => {
    if (x === last.current.x && y === last.current.y) return;
    last.current = { x, y };
    bridge.emit("input:joystick", { x, y });
  };

  // 화면을 떠날 때 캐릭터가 계속 걸어가지 않게
  useEffect(() => () => bridge.emit("input:joystick", { x: 0, y: 0 }), []);

  function move(e: PointerEvent<HTMLDivElement>) {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    let x = (e.clientX - (rect.left + radius)) / radius;
    let y = (e.clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    knob.style.transform = `translate(${x * radius * KNOB_TRAVEL}px, ${y * radius * KNOB_TRAVEL}px)`;
    // 데드존(히스테리시스 포함)은 게임이 처리한다 → 원시 값을 보낸다
    send(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  }

  function release(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    if (knobRef.current) knobRef.current.style.transform = "";
    send(0, 0);
  }

  return (
    <div
      ref={baseRef}
      className={styles.joystick}
      role="application"
      aria-label="이동 조이스틱"
      onPointerDown={(e) => {
        if (pointerId.current !== null) return;
        pointerId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointerId.current) move(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={knobRef} className={styles.knob} />
    </div>
  );
}
