"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import RideButton from "../zoo/RideButton";
import { ExprButton } from "./ExprRadial";
import { pressProps } from "./pressProps";
import styles from "./MobileControls.module.css";

/** 손잡이가 바닥 원 반지름의 몇 배까지 움직이는지 */
const KNOB_TRAVEL = 0.55;

/**
 * 터치 기기 전용: 좌하단 아날로그 조이스틱 + 우하단 [상호작용] [점프] [달리기] [앉기]
 * + 점프 왼쪽에 작은 [표현] (누르면 표현 창, 길게 누르면 즐겨찾기 원형 — 아래 바로 가기 줄이 없어져 여기로)
 * + 그 위 같은 크기 [채팅] (누르면 키보드 위 한 줄 입력칸, ChatSheet). 채팅 중에는 조이스틱·버튼을 숨긴다.
 */
export default function MobileControls({
  onSay,
  onRadial,
  onChat,
  chatOpen = false,
}: {
  onSay: () => void;
  onRadial: () => void;
  /** 없으면 [채팅] 버튼을 안 보인다 (상점·사냥터 등 말풍선이 없는 곳) */
  onChat?: () => void;
  chatOpen?: boolean;
}) {
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
      <Joystick hidden={chatOpen} />
      <div className={styles.actions} data-hidden={chatOpen || undefined}>
        <button
          type="button"
          className={styles.action}
          data-slot="interact"
          data-near={nearGrave}
          {...pressProps(() => bridge.emit("input:interact"))}
        >
          {inShop ? "말 걸기" : nearGrave ? "살펴보기" : "상호작용"}
        </button>
        <button type="button" className={styles.action} data-slot="jump" {...pressProps(() => bridge.emit("input:jump"))}>
          점프
        </button>
        <button
          type="button"
          className={styles.action}
          data-slot="sit"
          data-near={nearSeat != null}
          {...pressProps(() => bridge.emit("input:sit"))}
        >
          {nearSeat ? (nearSeat.kind === "bench" ? "벤치에 앉기" : "의자에 앉기") : "앉기"}
        </button>
        <button
          type="button"
          className={styles.action}
          data-slot="run"
          aria-pressed={running}
          {...pressProps(toggleRun)}
        >
          달리기
        </button>
        <ExprButton className={cx(styles.action, styles.expr)} onOpen={onSay} onRadial={onRadial}>
          <PixelIcon name="chat" />
          표현
        </ExprButton>
        {onChat && (
          <button
            type="button"
            className={cx(styles.action, styles.chat)}
            aria-label="채팅: 머리 위 말풍선으로 한마디"
            // pressProps(누르는 순간) 대신 click: iOS는 탭 처리 안에서 포커스해야 키보드를 띄운다.
            // flushSync로 입력칸을 바로 그려 같은 탭 안에서 포커스한다 (ChatInput autoFocus는 레이아웃 효과)
            onClick={() => flushSync(onChat)}
          >
            <PixelIcon name="type" />
            채팅
          </button>
        )}
        {/* 탈 수 있는 펫을 데리고 있을 때만 (달리기 위) */}
        <RideButton variant="touch" className={styles.action} />
      </div>
    </>
  );
}

function Joystick({ hidden = false }: { hidden?: boolean }) {
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
      data-hidden={hidden || undefined}
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
