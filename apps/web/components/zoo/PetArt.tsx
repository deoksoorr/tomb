"use client";

import { useEffect, useRef } from "react";
import { COSMETIC_FX, FX_ART, type FxArtId } from "@/game/sprites/cosmeticFx";
import { useMediaQuery } from "@/lib/hooks/useMedia";

// 펫 그림 크게 (분양 창). 게임과 같은 그림(cosmeticFx FX_ART)을 정수 배율로 키워 두 프레임을 번갈아 보여 준다 (움직임 줄이기면 멈춤).
// 11/17 멈춤·동작이 있는 새 펫(pose)은 걷기 → 앉아 쉬기 → 귀여운 동작을 차례로 돌려 보여 준다.
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

/** 보여 줄 차례 [프레임, ms, 들어 올림] (pose가 없으면 걷기 두 장) */
function playlist(petId: string): [number, number, number][] {
  const spec = COSMETIC_FX[petId];
  if (spec?.kind !== "pet" || !spec.pose) return [[0, 420, 0], [1, 420, 0]];
  const p = spec.pose;
  const walk = Math.max(140, Math.round(1000 / spec.fps));
  const rest = Math.round(1000 / spec.idleFps);
  return [
    ...[0, 1, 0, 1, 0, 1].map((f): [number, number, number] => [f, walk, 0]),
    ...[...p.idle, ...p.idle].map((f): [number, number, number] => [f, rest, 0]),
    ...p.act.map((f, i): [number, number, number] => [f, p.actMs, p.lift?.[i] ?? 0]),
    ...p.idle.map((f): [number, number, number] => [f, rest, 0]),
  ];
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
    const list = playlist(petId);
    const pad = Math.max(...list.map(([, , lift]) => lift));
    const scale = Math.max(1, Math.floor(Math.min(box / a.w, box / (a.h + pad))));
    c.width = a.w * scale;
    c.height = (a.h + pad) * scale;
    ctx.imageSmoothingEnabled = false;
    const src = sheetOf(art);
    let i = 0;
    const draw = () => {
      const [frame, , lift] = list[i];
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(src, frame * a.w, 0, a.w, a.h, 0, (pad - lift) * scale, a.w * scale, a.h * scale);
    };
    draw();
    if (reduced) return;
    let id = 0;
    const next = () => {
      id = window.setTimeout(() => {
        i = (i + 1) % list.length;
        draw();
        next();
      }, list[i][1]);
    };
    next();
    return () => window.clearTimeout(id);
  }, [art, petId, box, reduced]);

  if (!art) return null;
  return <canvas ref={ref} className={className} aria-hidden="true" style={{ imageRendering: "pixelated" }} />;
}
