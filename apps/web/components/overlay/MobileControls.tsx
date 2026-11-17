"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import FloatingStick, { tapCanvasAt } from "../ui/FloatingStick";
import PixelIcon from "../ui/PixelIcon";
import RideButton from "../zoo/RideButton";
import { ExprButton } from "./ExprRadial";
import { pressProps } from "./pressProps";
import styles from "./MobileControls.module.css";

/**
 * 터치 기기 전용: 왼쪽 떠다니는 조이스틱(11/15 — 왼쪽 아무 데나 누르면 그 자리에, 짧은 탭은 아래 캔버스로 넘겨 소품·사람 누르기) + 우하단 [상호작용] [점프] [달리기] [앉기]
 * + 점프 왼쪽에 작은 [표현] (누르면 표현 창, 길게 누르면 즐겨찾기 원형 — 아래 바로 가기 줄이 없어져 여기로)
 * + 그 위 같은 크기 [채팅] (누르면 키보드 위 한 줄 입력칸, ChatSheet). 채팅 중에는 조이스틱·버튼을 숨긴다.
 * 11/18 캠핑장 눈덩이를 들고 있으면 [점프] 자리가 [굴리기]가 된다 (RollButton — 누르고 있는 동안 굴리기, 떼면 다시 안기).
 */
export default function MobileControls({
  onSay,
  onRadial,
  onChat,
  chatOpen = false,
  viewing = false,
}: {
  onSay: () => void;
  onRadial: () => void;
  /** 없으면 [채팅] 버튼을 안 보인다 (상점·사냥터 등 말풍선이 없는 곳) */
  onChat?: () => void;
  chatOpen?: boolean;
  /** 11/16 r19 바라보는 장면 중: [채팅]만 남기고 행동 버튼을 숨겨요 (조이스틱은 움직여 나가기로 남아요) */
  viewing?: boolean;
}) {
  const [running, setRunning] = useState(false);
  // sticky라 마운트 전에 다가간 묘비·좌석도 바로 반영된다
  const nearGrave = useBridgeValue("grave:near") != null;
  const nearSeat = useBridgeValue("seat:near");
  const inShop = useBridgeValue("scene:changed")?.scene === "shop";
  // 11/15 오리배 위에서는 점프 대신 꽥 (게임이 Space·점프를 꽥으로 받는다)
  const duck = useBridgeValue("boat:duck")?.riding === true;
  // 11/16 범퍼카 위에서도 점프 대신 빵빵
  const car = useBridgeValue("bumper:riding")?.riding === true;
  // 11/18 캠핑장 눈덩이를 들고 있으면 점프 대신 굴리기 (들고 있는 동안 점프는 막혀 있다)
  const snowball = useBridgeValue("camp:snowball")?.held === true;
  useTouchGuards();

  function toggleRun() {
    const on = !running;
    setRunning(on);
    bridge.emit("input:runToggle", { on });
  }

  return (
    <>
      <FloatingStick className={styles.stickZone} hidden={chatOpen} onStick={(x, y) => bridge.emit("input:joystick", { x, y })} onTap={tapCanvasAt} />
      <div className={styles.actions} data-hidden={chatOpen || undefined} data-viewing={viewing || undefined}>
        <button
          type="button"
          className={styles.action}
          data-slot="interact"
          data-near={nearGrave}
          {...pressProps(() => bridge.emit("input:interact"))}
        >
          {inShop ? "말 걸기" : nearGrave ? "살펴보기" : "상호작용"}
        </button>
        {snowball ? (
          <RollButton off={chatOpen || viewing} />
        ) : (
          <button
            type="button"
            className={styles.action}
            data-slot="jump"
            aria-label={duck ? "꽥! 오리배 경적" : car ? "빵빵! 범퍼카 경적" : undefined}
            {...pressProps(() => bridge.emit("input:jump"))}
          >
            {duck ? "꽥!" : car ? "빵빵!" : "점프"}
          </button>
        )}
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
 * 11/18 [굴리기] (눈덩이를 들고 있을 때 [점프] 자리): 누르고 있는 동안 굴리기(input:roll on), 떼면 다시 안기.
 * 누른 손가락을 붙잡아(setPointerCapture) 버튼 밖으로 미끄러져도 뗄 때까지 굴린다. 누르는 동안은 눌린 모습에 덩이 그림이 돈다.
 * off(채팅 입력·바라보는 장면)이거나 버튼이 사라지면(내려놓음) 뗀 것으로 친다.
 */
function RollButton({ off }: { off: boolean }) {
  const [held, setHeld] = useState(false);
  const pointer = useRef<number | null>(null);

  function release() {
    if (pointer.current === null) return;
    pointer.current = null;
    setHeld(false);
    bridge.emit("input:roll", { on: false });
  }

  useEffect(() => {
    if (off) release();
  });
  // 내려놓아 버튼이 사라지면 뗀 것으로
  useEffect(
    () => () => {
      if (pointer.current !== null) bridge.emit("input:roll", { on: false });
    },
    [],
  );

  function onDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointer.current !== null) return;
    e.preventDefault();
    pointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 붙잡지 못해도 pointerup·cancel로 뗀다
    }
    setHeld(true);
    bridge.emit("input:roll", { on: true });
  }

  function onUp(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerId === pointer.current) release();
  }

  return (
    <button
      type="button"
      className={cx(styles.action, styles.roll)}
      data-slot="jump"
      data-held={held || undefined}
      aria-pressed={held}
      aria-label="굴리기: 누른 채 걸으면 눈덩이가 굴러가며 커져요"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    >
      <span className={styles.rollIcon}>
        <PixelIcon name="snowball" size={18} />
      </span>
      {held ? "굴리는 중" : "굴리기"}
    </button>
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
