"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
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
  useTouchGuards();

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

/**
 * 터치 화면 기본 동작 막기: 길게 누르기 메뉴(contextmenu)·글자 선택 시작(selectstart)·이미지/캔버스 끌기(dragstart).
 * 이게 끼어들면 브라우저가 터치를 가져가(pointercancel) 조이스틱·버튼이 멈춘다. 입력칸은 그대로 둔다.
 */
function useTouchGuards() {
  useEffect(() => {
    // 입력칸·글자 선택을 일부러 허용한 곳(user-select가 none이 아닌 곳 — 계정 코드 등 대화창 글)은 그대로 둔다
    const allowed = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
      if (!el) return false;
      if (el.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return true;
      const cs = getComputedStyle(el);
      return (cs.userSelect || cs.webkitUserSelect) !== "none";
    };
    const block = (e: Event) => {
      if (!allowed(e.target)) e.preventDefault();
    };
    // 일부러 끌게 만든 것(가방 옷 끌어 입히기 등 draggable="true")만 빼고, 이미지·캔버스·글자 끌기는 막는다
    const onDrag = (e: DragEvent) => {
      if (!(e.target instanceof Element && e.target.closest('[draggable="true"]'))) e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", onDrag);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", onDrag);
    };
  }, []);
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

  /** 눌림을 풀고 손잡이를 가운데로 (다음 값이 0과 같아도 다시 보내도록 last도 0으로) */
  const reset = useEffectEvent(() => {
    const id = pointerId.current;
    pointerId.current = null;
    if (id !== null && baseRef.current?.hasPointerCapture(id)) baseRef.current.releasePointerCapture(id);
    if (knobRef.current) knobRef.current.style.transform = "";
    last.current = { x: 0, y: 0 };
    bridge.emit("input:joystick", { x: 0, y: 0 });
  });

  // 화면을 떠날 때·앱 전환(창 blur·탭 숨김) 때 캐릭터가 계속 걸어가거나 '눌린 채'로 남지 않게
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

  // 채팅 중엔 숨긴다: 숨는 사이 손가락을 떼면 pointerup을 못 받아 다음 터치가 막힐 수 있어 미리 푼다
  useEffect(() => {
    if (hidden) reset();
  }, [hidden]);

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
        // 이미 잡은 손가락이 있어도 캡처가 풀려 있으면(떼는 이벤트를 놓친 묵은 값) 새 손가락이 이어받는다
        if (pointerId.current !== null && e.currentTarget.hasPointerCapture(pointerId.current)) return;
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
