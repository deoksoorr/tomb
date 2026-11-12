"use client";

import { useEffect, useRef } from "react";
import { COSMETIC_FX, FX_ART, type FxArtId } from "@/game/sprites/cosmeticFx";
import { useMediaQuery } from "@/lib/hooks/useMedia";

// 펫 그림 크게 (분양 창). 게임과 같은 그림(cosmeticFx FX_ART)을 정수 배율로 키워 두 프레임을 번갈아 보여 준다 (움직임 줄이기면 멈춤).
// 그림자 유령 친구(pet_ghost)는 예전 그림이라 아이콘으로 대신한다 (호출한 쪽이 ItemIcon을 쓴다).

const sheets = new Map<string, HTMLCanvasElement>();

function sheetOf(art: FxArtId): HTMLCanvasElement {
  let c = sheets.get(art);
  if (!c) sheets.set(art, (c = FX_ART[art].build().toCanvas()));
  return c;
}

/** 이 펫에 큰 그림이 있는지 (없으면 아이콘으로) */
export function hasPetArt(petId: string): boolean {
  return COSMETIC_FX[petId]?.kind === "pet";
}

export default function PetArt({ petId, box = 96, className }: { petId: string; box?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const spec = COSMETIC_FX[petId];
  const art = spec?.kind === "pet" ? spec.art : null;

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !art) return;
    const a = FX_ART[art];
    const scale = Math.max(1, Math.floor(Math.min(box / a.w, box / a.h)));
    c.width = a.w * scale;
    c.height = a.h * scale;
    ctx.imageSmoothingEnabled = false;
    const src = sheetOf(art);
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(src, frame * a.w, 0, a.w, a.h, 0, 0, a.w * scale, a.h * scale);
    };
    draw();
    if (reduced) return;
    const id = window.setInterval(() => {
      frame = frame ? 0 : 1;
      draw();
    }, 420);
    return () => window.clearInterval(id);
  }, [art, box, reduced]);

  if (!art) return null;
  return <canvas ref={ref} className={className} aria-hidden="true" style={{ imageRendering: "pixelated" }} />;
}
