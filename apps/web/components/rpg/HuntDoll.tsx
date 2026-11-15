"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gearById, type GearSlot } from "@/lib/rpg/catalog";
import { decodeSg, enhOfId, isSgCode, SG_SETS, sgPieceOf, type SgGrade } from "@/lib/rpg/setGear";
import { iconGrid } from "@/game/rpg/icons";
import { weaponGlow } from "@/game/rpg/setGearRun";
import { huntDollGrid, type HuntDollOpts, type HuntDollPiece } from "@/game/sprites/setGear";
import { Grid } from "@/game/sprites/pixel";

// 11/15 사냥 장비창 가운데 인형: 마을 꾸미기 없이 기본 몸·색에 지금 낀 사냥 장비만 입힌다
// (세트 갑옷·머리·장신구는 몸에, 무기는 손에 — 상점 무기는 아이콘 그림 그대로). 강화 +10·+13·+15 무기는 빛 테.
// 종이 인형 무대(48×52 × 배율)에 맞춰 그린다.

const W = 48;
const H = 52;

type Equip = Record<GearSlot, string | null>;

const piece = (id: string | null): HuntDollPiece | null => {
  const it = isSgCode(id) ? decodeSg(id) : null;
  return it ? { set: SG_SETS[it.s], grade: it.g as SgGrade } : null;
};

/** 장착 칸 → 인형 그림 옵션 (테스트 쉬운 순수 함수) */
export function dollOpts(equip: Equip, color: string, body: string): HuntDollOpts {
  const accs: HuntDollPiece[] = [];
  const seen = new Set<string>();
  for (const id of [equip.acc1, equip.acc2]) {
    const p = piece(id);
    if (p && !seen.has(p.set)) {
      seen.add(p.set);
      accs.push(p);
    }
  }
  const wid = equip.weapon;
  const wsg = piece(wid);
  const wdef = wid && !wsg ? gearById(wid) : undefined;
  const glow = weaponGlow(enhOfId(wid));
  const armorIt = isSgCode(equip.armor) ? decodeSg(equip.armor) : null;
  return {
    color,
    body,
    armor: armorIt && sgPieceOf(armorIt) === "armor" ? piece(equip.armor) : null,
    head: piece(equip.head),
    accs,
    weapon: wsg ?? (wdef ? { grid: iconGrid(wdef.art) } : null),
    glow: glow?.color ?? null,
  };
}

export default function HuntDoll({ equip, color, body, label }: { equip: Equip; color: string; body: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const key = `${Object.values(equip).join("|")}|${color}|${body}`;
  const opts = useMemo(() => dollOpts(equip, color, body), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // 임원급 반짝임 두 장 (움직임 줄이기면 멈춘다)
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setFrame((f) => 1 - f), 600);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const g = new Grid(W, H);
    let doll: Grid;
    try {
      doll = huntDollGrid({ ...opts, frame });
    } catch {
      doll = huntDollGrid({ color, body: "hood", frame });
    }
    g.draw(doll, Math.round((W - doll.w) / 2), H - doll.h - 6);
    ctx.clearRect(0, 0, W, H);
    g.blit(ctx, 0, 0);
  }, [opts, frame, color]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      role="img"
      aria-label={label}
      style={{
        width: "100%",
        height: "100%",
        margin: 0,
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
}
