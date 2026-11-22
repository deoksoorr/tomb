"use client";
/* eslint-disable @next/next/no-img-element -- 코드로 만든 SVG dataURL 픽셀아트라 next/image 최적화가 필요 없다 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SPROUT_H, SPROUT_TIP, SPROUT_W, sproutSvgUri } from "@/lib/sproutArt";
import { cx } from "./cx";
import styles from "./SproutMark.module.css";

// 11/22 새싹 표시 (채팅 이름 앞): 총 접속 3시간 미만 새 이웃. 게임 이름표 새싹(game/sprites/sproutIcon)과 같은 픽셀 그림.
// 마우스를 올리거나(데스크톱) 누르면(폰) 「마을에 온 지 얼마 안 된 이웃이에요」 말풍선 — 채팅창 스크롤 상자에 잘리지 않게 body에 띄운다

const SRC = sproutSvgUri();
/** 눌러서 띄운 말풍선이 저절로 닫히는 시간 */
const TAP_TIP_MS = 2500;

/** 말풍선 (x = 새싹 가운데, y = 새싹 윗변, 화면 px). 머리 위 새싹 말풍선(SproutTip)도 같은 모양 */
export function SproutBubble({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // 화면 밖으로 나가지 않게 (좌우 8px) — 그린 뒤 폭을 재서 바로 옮긴다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    el.style.left = `${Math.min(window.innerWidth - w / 2 - 8, Math.max(w / 2 + 8, x))}px`;
  }, [x]);
  return createPortal(
    <div ref={ref} role="tooltip" className={styles.tip} style={{ left: x, top: y }}>
      <img src={SRC} width={SPROUT_W} height={SPROUT_H} alt="" className={styles.tipIcon} />
      {SPROUT_TIP}
    </div>,
    document.body,
  );
}

/** 다른 사람 메뉴(캐릭터를 눌렀을 때) 맨 위 안내 한 줄 */
export function SproutLine() {
  return (
    <p className={styles.line}>
      <img src={SRC} width={SPROUT_W} height={SPROUT_H} alt="" />
      {SPROUT_TIP}
    </p>
  );
}

export default function SproutMark({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top } : null;
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return (
    <>
      <span
        ref={ref}
        className={cx(styles.mark, className)}
        role="img"
        aria-label={SPROUT_TIP}
        tabIndex={-1}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setTip(place());
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setTip(null);
        }}
        onClick={(e) => {
          // 폰: 누르면 잠깐 띄운다 (채팅 줄을 누른 것으로 치지 않게)
          e.stopPropagation();
          clear();
          setTip(place());
          timer.current = setTimeout(() => setTip(null), TAP_TIP_MS);
        }}
      >
        <img src={SRC} width={SPROUT_W} height={SPROUT_H} alt="" draggable={false} />
      </span>
      {tip && <SproutBubble x={tip.x} y={tip.y} />}
    </>
  );
}
