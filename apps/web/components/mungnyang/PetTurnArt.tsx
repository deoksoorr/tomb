"use client";

import { useEffect, useRef } from "react";
import { COSMETIC_FX, type FxArtId } from "@/game/sprites/cosmeticFx";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import type { PetView } from "./mungnyangText";
import { petPreviewSheet } from "./petPreviewSheet";

// 11/19 분양사 보리 창의 펫 미리보기: 게임과 같은 그림(cosmeticFx FX_ART)을 정수 배율로 키워 걷는 모습을 보여 준다.
//  - 네 방향 펫(품종 펫 — PetSpec.dirs): 옆(오른쪽) → 앞 → 옆(왼쪽) → 뒤로 돌려 본다. 앞·뒤는 걷기 두 장 → 앉아 쉬기
//  - 옆모습은 걷기 → 앉아 쉬기 → 품종 동작 한 번 → 쉬기 (actKey가 바뀌면 동작부터 바로)
//  - 방향이 없는 펫(퇴근 강아지·사무실 고양이·듬직한 큰 개)은 옆모습 좌우만
//  움직임 줄이기면 첫 장 그대로
//  11/20 칸 끝에 닿은 그림이 옆모습에서 잘려 보였다 → 둘레 여백을 둔 미리보기 시트로 그린다 (petPreviewSheet)

/** 이 펫이 네 방향으로 돌아보는지 (아니면 좌우만) */
export function petTurnWays(petId: string): 2 | 4 {
  const s = COSMETIC_FX[petId];
  return s?.kind === "pet" && s.dirs ? 4 : 2;
}
/** 돌려 보기 차례 → 방향 */
export function petViewAt(petId: string, turn: number): PetView {
  return petTurnWays(petId) === 4 ? (["right", "front", "left", "back"] as const)[turn % 4] : (["right", "left"] as const)[turn % 2];
}
/** 품종 동작(pose)이 있는지 */
export function hasPetAct(petId: string): boolean {
  const s = COSMETIC_FX[petId];
  return s?.kind === "pet" && !!s.pose;
}

const sheets = new Map<string, HTMLCanvasElement>();
function sheetOf(art: FxArtId): HTMLCanvasElement {
  let c = sheets.get(art);
  if (!c) sheets.set(art, (c = petPreviewSheet(art).grid.toCanvas()));
  return c;
}

type Step = [frame: number, ms: number, lift: number];

/** 보여 줄 차례와 다시 돌 자리 (동작부터 시작했으면 그 뒤 평소 차례로) */
function playlist(petId: string, view: PetView, actFirst: boolean): { list: Step[]; loop: number } {
  const spec = COSMETIC_FX[petId];
  if (spec?.kind !== "pet") return { list: [[0, 420, 0]], loop: 0 };
  const walkMs = Math.max(140, Math.round(1000 / spec.fps));
  const restMs = Math.round(1000 / spec.idleFps);
  const walk = (frames: readonly number[]): Step[] => Array.from({ length: 8 }, (_, i): Step => [frames[i % frames.length], walkMs, 0]);
  if ((view === "front" || view === "back") && spec.dirs) {
    const d = view === "front" ? spec.dirs.down : spec.dirs.up;
    return { list: [...walk(d.walk), ...[...d.rest, ...d.rest].map((f): Step => [f, restMs, 0])], loop: 0 };
  }
  const p = spec.pose;
  if (!p) return { list: walk([0, 1]), loop: 0 };
  const act = p.act.map((f, i): Step => [f, p.actMs, p.lift?.[i] ?? 0]);
  const idle = p.idle.map((f): Step => [f, restMs, 0]);
  const loop = [...walk([0, 1]), ...idle, ...act, ...idle];
  return actFirst ? { list: [...act, ...idle, ...loop], loop: act.length + idle.length } : { list: loop, loop: 0 };
}

export default function PetTurnArt({ petId, view, actKey = 0, box = 112, className }: { petId: string; view: PetView; actKey?: number; box?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const spec = COSMETIC_FX[petId];
  const art = spec?.kind === "pet" ? spec.art : null;

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !art) return;
    const a = petPreviewSheet(art);
    const side = view === "right" || view === "left";
    const { list, loop } = playlist(petId, view, side && actKey > 0);
    // 들어 올리는 동작(포메 폴짝)이 있으면 그만큼 위 여백 (옆모습 차례에만 있다)
    const pad = Math.max(0, ...playlist(petId, "right", false).list.map(([, , lift]) => lift));
    const scale = Math.max(1, Math.floor(Math.min(box / a.w, box / (a.h + pad))));
    c.width = a.w * scale;
    c.height = (a.h + pad) * scale;
    ctx.imageSmoothingEnabled = false;
    const src = sheetOf(art);
    let i = 0;
    const draw = () => {
      const [frame, , lift] = list[i];
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      // 그림은 오른쪽을 본다 → 왼쪽은 좌우 반전
      if (view === "left") {
        ctx.translate(c.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(src, frame * a.w, 0, a.w, a.h, 0, (pad - lift) * scale, a.w * scale, a.h * scale);
      ctx.restore();
    };
    draw();
    if (reduced) return;
    let id = 0;
    const next = () => {
      id = window.setTimeout(() => {
        i = i + 1 < list.length ? i + 1 : loop;
        draw();
        next();
      }, list[i][1]);
    };
    next();
    return () => window.clearTimeout(id);
  }, [art, petId, view, actKey, box, reduced]);

  if (!art) return null;
  return <canvas ref={ref} className={className} aria-hidden="true" style={{ imageRendering: "pixelated" }} />;
}
