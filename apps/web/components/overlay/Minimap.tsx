"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { FISH_ICON, LANDMARK_COLOR, LANDMARKS, MINIMAP_H, MINIMAP_W, minimapPixels, NODE_DOT_COLOR, toMinimap } from "@/game/world/minimapArt";
import { gatherNodeById } from "@/lib/forage/catalog";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import styles from "./Minimap.module.css";

// F17 미니맵: 화면 오른쪽 위에 늘 떠 있는 작은 지도 (맵 모양·물·주요 장소·나·같은 채널 사람). 접기/펴기는 이 브라우저에 기억한다.
// 바탕은 처음 한 번만 굽고(game/world/minimapArt), 사람 점만 게임이 0.25초마다 보내는 minimap:dots로 다시 그린다.
// 나에게 피어 있는 채집 지점(forage:nodes)은 종류 색의 작은 점으로.

const STORE_KEY = "tomb.minimap";

let baseCache: ImageData | null = null;
function baseImage(): ImageData {
  baseCache ??= new ImageData(minimapPixels() as unknown as Uint8ClampedArray<ArrayBuffer>, MINIMAP_W, MINIMAP_H);
  return baseCache;
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) !== "0";
  } catch {
    return true;
  }
}

export default function Minimap({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(readOpen);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ me: { x: number; y: number }; others: number[] } | null>(null);
  /** 나에게 피어 있는 채집 지점 (forage:nodes) */
  const nodes = useRef<string[]>(bridge.last("forage:nodes")?.ids ?? []);

  const draw = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.putImageData(baseImage(), 0, 0);
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
    ctx.fillStyle = "#f2ead3";
    for (let i = 0; i + 1 < d.others.length; i += 2) {
      const p = toMinimap(d.others[i], d.others[i + 1]);
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
    }
    const m = toMinimap(d.me.x, d.me.y);
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(Math.round(m.x) - 2, Math.round(m.y) - 2, 5, 5);
    ctx.fillStyle = "#ffe14a";
    ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
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
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "지도 접기" : "지도 펴기"}>
        지도 {open ? "▴" : "▾"}
      </button>
      {open && <canvas ref={canvas} className={styles.map} width={MINIMAP_W} height={MINIMAP_H} aria-label="마을 지도 (노란 점이 나)" role="img" />}
    </div>
  );
}
