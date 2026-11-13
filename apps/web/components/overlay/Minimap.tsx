"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { BALLOON_ICON, FERRIS_ICON, FISH_ICON, LANDMARK_COLOR, LANDMARKS, MINIMAP_H, MINIMAP_W, minimapPixels, NODE_DOT_COLOR, PAW_ICON, toMinimap } from "@/game/world/minimapArt";
import { gatherNodeById } from "@/lib/forage/catalog";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Minimap.module.css";

// F17 미니맵: 화면 오른쪽 위에 늘 떠 있는 작은 지도 (맵 모양·물·주요 장소·나·같은 채널 사람). 접기/펴기는 이 브라우저에 기억한다.
// 바탕은 처음 한 번만 굽고(game/world/minimapArt), 사람 점만 게임이 0.25초마다 보내는 minimap:dots로 다시 그린다.
// 나에게 피어 있는 채집 지점(forage:nodes)은 종류 색의 작은 점으로.

const STORE_KEY = "tomb.minimap";

/** 캔버스 해상도 배율: 지도 1칸을 3×3 픽셀로 그려 화면에서 크게 늘려도 점이 또렷하게 (바탕 그림은 같은 그림을 그대로 확대) */
const SCALE = 3;

let baseCache: HTMLCanvasElement | null = null;
function baseImage(): HTMLCanvasElement {
  if (!baseCache) {
    baseCache = document.createElement("canvas");
    baseCache.width = MINIMAP_W;
    baseCache.height = MINIMAP_H;
    baseCache.getContext("2d")?.putImageData(new ImageData(minimapPixels() as unknown as Uint8ClampedArray<ArrayBuffer>, MINIMAP_W, MINIMAP_H), 0, 0);
  }
  return baseCache;
}

/** 테두리 두른 동그란 점 (지도 칸 단위 좌표·반지름) */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, line: number, fill: string, edge: string) {
  ctx.beginPath();
  ctx.arc(x, y, r + line, 0, Math.PI * 2);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function Minimap() {
  const [open, setOpen] = useState(readOpen);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ me: { x: number; y: number }; others: number[]; residents?: number[] } | null>(null);
  /** 나에게 피어 있는 채집 지점 (forage:nodes) */
  const nodes = useRef<string[]>(bridge.last("forage:nodes")?.ids ?? []);

  const draw = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // 지도 칸 좌표로 그리고 캔버스는 SCALE배 해상도
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseImage(), 0, 0);
    for (const l of LANDMARKS) {
      const p = toMinimap(l.x, l.y);
      if (l.kind === "fish") {
        // 낚시터: 테두리를 두른 작은 물고기
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        for (const [dx, dy] of FISH_ICON) ctx.fillRect(px + dx - 1, py + dy - 1, 3, 3);
        ctx.fillStyle = LANDMARK_COLOR.fish;
        for (const [dx, dy] of FISH_ICON) ctx.fillRect(px + dx, py + dy, 1, 1);
        ctx.fillStyle = "#10202a";
        ctx.fillRect(px + 1, py - 1, 1, 1); // 눈
        continue;
      }
      if (l.kind === "ferris" || l.kind === "balloon") {
        // 관람차·열기구: 테두리를 두른 작은 그림
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        const icon = l.kind === "ferris" ? FERRIS_ICON : BALLOON_ICON;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        for (const [dx, dy] of icon) ctx.fillRect(px + dx - 1, py + dy - 1, 3, 3);
        ctx.fillStyle = LANDMARK_COLOR[l.kind];
        for (const [dx, dy] of icon) ctx.fillRect(px + dx, py + dy, 1, 1);
        continue;
      }
      if (l.kind === "zoo") {
        // 동물원: 테두리를 두른 발바닥
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        for (const [dx, dy] of PAW_ICON) ctx.fillRect(px + dx - 1, py + dy - 1, 3, 3);
        ctx.fillStyle = LANDMARK_COLOR.zoo;
        for (const [dx, dy] of PAW_ICON) ctx.fillRect(px + dx, py + dy, 1, 1);
        continue;
      }
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, l.kind === "fire" ? 5 : 4, l.kind === "fire" ? 5 : 4);
      ctx.fillStyle = LANDMARK_COLOR[l.kind];
      if (l.kind === "grave") {
        // 십자가
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 2, 1, 4);
        ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 1, 3, 1);
      } else ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, l.kind === "fire" ? 3 : 2, l.kind === "fire" ? 3 : 2);
    }
    // 채집 지점: 종류 색의 작은 점 (테두리)
    for (const id of nodes.current) {
      const n = gatherNodeById(id);
      if (!n) continue;
      const p = toMinimap(n.x, n.y);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      ctx.fillStyle = NODE_DOT_COLOR[n.kind] ?? "#ffffff";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    const d = last.current;
    if (!d) return;
    // 점 크기는 화면 픽셀 기준으로 정한다 (지도 칸 1개가 화면에서 몇 px인지로 나눈다 — 데스크톱·폰 크기가 달라도 같은 크기로 보이게)
    const unit = c.clientWidth / MINIMAP_W || 1;
    const px = (n: number) => n / unit;
    // 마을 주민: 작은 회색 점 (사람보다 작게, 사람 점 아래에)
    const rs = d.residents ?? [];
    for (let i = 0; i + 1 < rs.length; i += 2) {
      const p = toMinimap(rs[i], rs[i + 1]);
      dot(ctx, p.x, p.y, px(2), px(1), "#a9aaa4", "rgba(8,10,14,0.8)");
    }
    // 다른 사람: 하늘색 점 + 검은 테두리 (어두운 바탕에서도 또렷하게)
    for (let i = 0; i + 1 < d.others.length; i += 2) {
      const p = toMinimap(d.others[i], d.others[i + 1]);
      dot(ctx, p.x, p.y, px(3), px(1.5), "#6fe3ff", "rgba(8,10,14,0.9)");
    }
    // 나: 더 큰 노란 점 + 검은 테두리 + 흰 속점, 1.2초마다 깜빡이는 밝은 고리
    const m = toMinimap(d.me.x, d.me.y);
    if (reducedMotion() || Math.floor(Date.now() / 600) % 2 === 0) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, px(9), 0, Math.PI * 2);
      ctx.lineWidth = px(2);
      ctx.strokeStyle = "rgba(255,241,170,0.95)";
      ctx.stroke();
    }
    dot(ctx, m.x, m.y, px(4.5), px(2), "#ffe14a", "#14110d");
    dot(ctx, m.x, m.y, px(1.5), 0, "#fffbe6", "#fffbe6");
  };

  useBridgeEvent("forage:nodes", ({ ids }) => {
    nodes.current = ids;
    if (open) draw();
  });

  useBridgeEvent("minimap:dots", (d) => {
    last.current = d;
    if (open) draw();
  });

  useEffect(() => {
    if (open) draw();
    try {
      localStorage.setItem(STORE_KEY, open ? "1" : "0");
    } catch {
      /* 저장 못 해도 괜찮다 */
    }
    // draw는 ref만 읽는다
  }, [open]);

  return (
    <div className={styles.wrap}>
      <button type="button" className={cx(ui.top, styles.toggle)} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "지도 접기" : "지도 펴기"}>
        지도 {open ? "▴" : "▾"}
      </button>
      {open && <canvas ref={canvas} className={styles.map} width={MINIMAP_W * SCALE} height={MINIMAP_H * SCALE} aria-label="마을 지도 (노란 점이 나)" role="img" />}
    </div>
  );
}
