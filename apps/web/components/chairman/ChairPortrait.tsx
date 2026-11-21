"use client";

import { useEffect, useRef } from "react";
import { chairPortrait, PORTRAIT } from "./chairPortraitArt";
import s from "./ChairEntry.module.css";

/** 카드 초상 (숨쉬기 · 눈 깜빡임, 헬은 눈빛 번쩍). 움직임 줄이기면 한 장 */
export default function ChairPortrait({ hell, className }: { hell: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const paint = (k: number) => {
      ctx.clearRect(0, 0, PORTRAIT, PORTRAIT);
      ctx.drawImage(chairPortrait(hell, Math.floor(k / 3) % 2, !hell && k % 14 === 13, hell && k % 9 >= 7), 0, 0);
    };
    paint(0);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let k = 0;
    const t = window.setInterval(() => paint(++k), 220);
    return () => clearInterval(t);
  }, [hell]);
  return <canvas ref={ref} className={className ?? s.art} width={PORTRAIT} height={PORTRAIT} aria-hidden="true" />;
}
