"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { BALLOON_ICON, BUMPER_ICON, FERRIS_ICON, FISH_ICON, LANDMARK_COLOR, LANDMARKS, MINIMAP_H, MINIMAP_W, minimapPixels, NODE_DOT_COLOR, PAW_ICON, toMinimap } from "@/game/world/minimapArt";
import { SEA_SCOPES, type AwayMapId, type MapId } from "@tomb/protocol";
import { CAMP_LANDMARK_COLOR, CAMP_LANDMARKS, CAMP_MINIMAP_H, CAMP_MINIMAP_W, CAMP_WINTER_PALETTE, campMinimapPixels, toCampMinimap } from "@/game/camp/campMinimap";
import { SEA_LANDMARK_COLOR, SEA_LANDMARKS, SEA_MINIMAP_H, SEA_MINIMAP_W, seaMinimapPixels, toSeaMinimap } from "@/game/sea/seaMinimap";
import { gatherNodeById } from "@/lib/forage/catalog";
import { MAP_ICONS } from "@/game/world/minimapIcons";
import { SEA_WINTER_PALETTE, winterizeMinimap } from "@/game/world/minimapWinter";
import { isSnowy } from "@/lib/mapConcept";
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

let baseCache: { concept: string; canvas: HTMLCanvasElement } | null = null;
/** 마을 바탕 (11/17 맵 컨셉이 바뀌면 다시 굽는다 — bridge map:concept) */
function baseImage(): HTMLCanvasElement {
  const concept = bridge.last("map:concept")?.concept ?? "default";
  if (!baseCache || baseCache.concept !== concept) {
    const canvas = document.createElement("canvas");
    canvas.width = MINIMAP_W;
    canvas.height = MINIMAP_H;
    canvas.getContext("2d")?.putImageData(new ImageData(minimapPixels(concept) as unknown as Uint8ClampedArray<ArrayBuffer>, MINIMAP_W, MINIMAP_H), 0, 0);
    baseCache = { concept, canvas };
  }
  return baseCache.canvas;
}

/** 11/15 마을 밖 맵(캠핑장·11/16 바닷가) 지도 한 벌: 바탕 크기·굽기·좌표·주요 장소 */
type AwayMinimap = {
  w: number;
  h: number;
  pixels: () => Uint8ClampedArray;
  to: (x: number, y: number) => { x: number; y: number };
  landmarks: readonly { x: number; y: number; kind: string }[];
  color: (kind: string) => string;
  /** 큰 표시로 그리는 주요 장소 (캠핑장 모닥불 등) */
  big: ReadonlySet<string>;
  label: string;
  /** 11/17 겨울·크리스마스 판 색 (기본 색 → 겨울 색, 목록에 없는 색은 minimapWinter가 짐작) */
  winter: ReadonlyMap<number, number>;
};
const AWAY_MINIMAP: Record<AwayMapId, AwayMinimap> = {
  camp: { w: CAMP_MINIMAP_W, h: CAMP_MINIMAP_H, pixels: campMinimapPixels, to: toCampMinimap, landmarks: CAMP_LANDMARKS, color: (k) => CAMP_LANDMARK_COLOR[k as keyof typeof CAMP_LANDMARK_COLOR] ?? "#ffffff", big: new Set(["fire"]), label: "캠핑장 지도", winter: CAMP_WINTER_PALETTE },
  // 11/16 바닷가 동전 망원경은 바닷가 맵 모듈 밖(protocol scopes.ts)에 있어서 여기서 덧붙인다
  sea: { w: SEA_MINIMAP_W, h: SEA_MINIMAP_H, pixels: seaMinimapPixels, to: toSeaMinimap, landmarks: [...SEA_LANDMARKS, ...SEA_SCOPES.map((s) => ({ x: s.x, y: s.y, kind: "telescope" }))], color: (k) => SEA_LANDMARK_COLOR[k as keyof typeof SEA_LANDMARK_COLOR] ?? "#ffffff", big: new Set(["lighthouse"]), label: "바닷가 지도", winter: SEA_WINTER_PALETTE },
};

/** 11/15 캠핑장·바닷가 바탕 (그 맵에 처음 갈 때 한 번 굽는다). 11/17 겨울·크리스마스 판이면 겨울 색 바탕을 따로 (bridge map:concept) */
const awayCache = new Map<string, HTMLCanvasElement>();
function awayImage(map: AwayMapId): HTMLCanvasElement {
  const snowy = isSnowy(bridge.last("map:concept")?.concept ?? "default");
  const key = `${map}${snowy ? "~winter" : ""}`;
  let c = awayCache.get(key);
  if (!c) {
    const m = AWAY_MINIMAP[map];
    c = document.createElement("canvas");
    c.width = m.w;
    c.height = m.h;
    const px = snowy ? winterizeMinimap(m.pixels(), m.winter) : m.pixels();
    c.getContext("2d")?.putImageData(new ImageData(px as unknown as Uint8ClampedArray<ArrayBuffer>, m.w, m.h), 0, 0);
    awayCache.set(key, c);
  }
  return c;
}

/** 11/16 장소 도트 그림 (글씨 없이): 칸마다 검은 테 3×3을 먼저, 그 위에 색 1×1. 그림이 없는 종류면 false */
function drawIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number): boolean {
  const ic = MAP_ICONS[kind];
  if (!ic) return false;
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  for (const [dx, dy] of ic.px) ctx.fillRect(px + dx - 1, py + dy - 1, 3, 3);
  for (const [dx, dy, acc] of ic.px) {
    ctx.fillStyle = acc ? ic.accent : ic.color;
    ctx.fillRect(px + dx, py + dy, 1, 1);
  }
  return true;
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

/** 친구: 테두리 두른 분홍 하트 (지도 칸 단위 좌표·크기) */
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, line: number) {
  const path = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.95);
    ctx.bezierCurveTo(x - s * 1.7, y - s * 0.15, x - s * 0.75, y - s * 1.45, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.75, y - s * 1.45, x + s * 1.7, y - s * 0.15, x, y + s * 0.95);
    ctx.closePath();
  };
  path(r + line);
  ctx.fillStyle = "rgba(8,10,14,0.9)";
  ctx.fill();
  path(r);
  ctx.fillStyle = "#ff8fb8";
  ctx.fill();
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 11/16 처음엔 폰(터치)은 접어 둔다 (화면을 가린다). 한 번 펴거나 접으면 그 뒤로는 이 브라우저가 기억한다 */
const firstOpen = () => !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);

function readOpen(): boolean {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === null ? firstOpen() : v !== "0";
  } catch {
    return firstOpen();
  }
}

/** 11/15 캠핑장 지도 (11/16 바닷가도 같은 방식): 바탕·주요 장소·같은 맵 사람 */
function drawAway(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, map: AwayMapId, d: { me: { x: number; y: number }; others: number[]; friends?: number[] } | null, nodeIds: readonly string[] = []): void {
  const M = AWAY_MINIMAP[map];
  const toMap = M.to;
  ctx.drawImage(awayImage(map), 0, 0);
  for (const l of M.landmarks) {
    const p = toMap(l.x, l.y);
    if (drawIcon(ctx, l.kind, p.x, p.y)) continue;
    const big = M.big.has(l.kind);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, big ? 5 : 4, big ? 5 : 4);
    ctx.fillStyle = M.color(l.kind);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, big ? 3 : 2, big ? 3 : 2);
  }
  // A-6 캠핑장 채집 지점 (나에게 피어 있는 것만, 종류 색의 작은 점)
  for (const id of nodeIds) {
    const n = gatherNodeById(id);
    if (!n || n.map !== map) continue;
    const p = toMap(n.x, n.y);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    ctx.fillStyle = NODE_DOT_COLOR[n.kind] ?? "#ffffff";
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  if (!d) return;
  const unit = c.clientWidth / M.w || 1;
  const px = (n: number) => n / unit;
  for (let i = 0; i + 1 < d.others.length; i += 2) {
    const p = toMap(d.others[i], d.others[i + 1]);
    dot(ctx, p.x, p.y, px(3), px(1.5), "#6fe3ff", "rgba(8,10,14,0.9)");
  }
  const fs = d.friends ?? [];
  for (let i = 0; i + 1 < fs.length; i += 2) {
    const p = toMap(fs[i], fs[i + 1]);
    heart(ctx, p.x, p.y, px(4.5), px(1.5));
  }
  const m = toMap(d.me.x, d.me.y);
  if (reducedMotion() || Math.floor(Date.now() / 600) % 2 === 0) {
    ctx.beginPath();
    ctx.arc(m.x, m.y, px(9), 0, Math.PI * 2);
    ctx.lineWidth = px(2);
    ctx.strokeStyle = "rgba(255,241,170,0.95)";
    ctx.stroke();
  }
  dot(ctx, m.x, m.y, px(4.5), px(2), "#ffe14a", "#14110d");
  dot(ctx, m.x, m.y, px(1.5), 0, "#fffbe6", "#fffbe6");
}

export default function Minimap() {
  const [open, setOpen] = useState(readOpen);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const last = useRef<{ me: { x: number; y: number }; others: number[]; residents?: number[]; friends?: number[]; map?: AwayMapId } | null>(null);
  /** 11/15 캠핑장에 있으면 캠핑장 지도 (11/16 바닷가면 바닷가 지도) */
  const [map, setMap] = useState<MapId>(() => bridge.last("map:changed")?.map ?? "village");
  /** 나에게 피어 있는 채집 지점 (forage:nodes) */
  const nodes = useRef<string[]>(bridge.last("forage:nodes")?.ids ?? []);

  const draw = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // 지도 칸 좌표로 그리고 캔버스는 SCALE배 해상도
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const away = last.current?.map;
    if (away) {
      drawAway(ctx, c, away, last.current, nodes.current);
      return;
    }
    ctx.drawImage(baseImage(), 0, 0);
    for (const l of LANDMARKS) {
      const p = toMinimap(l.x, l.y);
      // 11/16 잡화점·분양 사무소·사냥터·야근 빌딩·정류장 둘·조각배·오리배는 도트 그림으로
      if (drawIcon(ctx, l.kind, p.x, p.y)) continue;
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
      if (l.kind === "ferris" || l.kind === "balloon" || l.kind === "bumper") {
        // 관람차·열기구·범퍼카: 테두리를 두른 작은 그림
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        const icon = l.kind === "ferris" ? FERRIS_ICON : l.kind === "balloon" ? BALLOON_ICON : BUMPER_ICON;
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
      if (!n || n.map) continue; // 캠핑장 지점은 캠핑장 지도에
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
    // 친구: 분홍 하트 (다른 사람 점보다 조금 크게, 그 위에)
    const fs = d.friends ?? [];
    for (let i = 0; i + 1 < fs.length; i += 2) {
      const p = toMinimap(fs[i], fs[i + 1]);
      heart(ctx, p.x, p.y, px(4.5), px(1.5));
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
    const now = d.map ?? "village";
    if (now !== map) setMap(now);
    else if (open) draw();
  });

  // 맵이 바뀌면 캔버스 크기가 바뀐다 → 다시 그린다
  useEffect(() => {
    if (open) draw();
    // draw는 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

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
      {open && (
        <canvas
          ref={canvas}
          className={styles.map}
          width={(map !== "village" ? AWAY_MINIMAP[map].w : MINIMAP_W) * SCALE}
          height={(map !== "village" ? AWAY_MINIMAP[map].h : MINIMAP_H) * SCALE}
          // 11/16 r19 지도 비율 그대로 (가로세로 같은 배율 — 바닷가 지도가 늘어나 보이던 것 고침)
          style={{ aspectRatio: map !== "village" ? `${AWAY_MINIMAP[map].w} / ${AWAY_MINIMAP[map].h}` : `${MINIMAP_W} / ${MINIMAP_H}` }}
          aria-label={`${map !== "village" ? AWAY_MINIMAP[map].label : "마을 지도"} (노란 점이 나, 분홍 하트가 친구)`}
          role="img"
        />
      )}
    </div>
  );
}
