"use client";

import { useEffect, useRef } from "react";
import { drawConstellationIcon } from "@/game/rpg/starArt";
import type { Constellation } from "@/lib/rpg/constellations";
import s from "./ConstellationDex.module.css";

// 별자리 도감 칸 아이콘: 작은 픽셀 격자에 코드로 그리고 CSS로 키운다 (픽셀 그대로). 등록 전은 점만 = 실루엣.

const GRID = 28;

export default function ConstellationIcon({ con, known, size = 40 }: { con: Constellation; known: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawConstellationIcon(ctx, con, GRID, known);
  }, [con, known]);
  return <canvas ref={ref} width={GRID} height={GRID} className={s.icon} style={{ width: size, height: size }} aria-hidden="true" />;
}
