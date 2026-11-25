"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { bridge } from "@/game/bridge";
import { BALLOON_ICON, BUMPER_ICON, FERRIS_ICON, FISH_ICON, LANDMARK_COLOR, LANDMARKS, MINIMAP_H, MINIMAP_W, minimapPixels, NODE_DOT_COLOR, PAW_ICON, toMinimap } from "@/game/world/minimapArt";
import { SEA_SCOPES, type AwayMapId, type MapId } from "@tomb/protocol";
import { CAMP_LANDMARK_COLOR, CAMP_LANDMARKS, CAMP_MINIMAP_H, CAMP_MINIMAP_W, CAMP_WINTER_PALETTE, campMinimapPixels, toCampMinimap } from "@/game/camp/campMinimap";
import { SEA_LANDMARK_COLOR, SEA_LANDMARKS, SEA_MINIMAP_H, SEA_MINIMAP_W, seaMinimapPixels, toSeaMinimap } from "@/game/sea/seaMinimap";
import { gatherNodeById } from "@/lib/forage/catalog";
import { MAP_ICONS } from "@/game/world/minimapIcons";
import { estimateTextWidth, MAP_LABELS, placeLabels, type LabelGroup, type LabelItem, type Rect } from "@/game/world/minimapLabels";
import { SEA_WINTER_PALETTE, winterizeMinimap } from "@/game/world/minimapWinter";
import { isSnowy } from "@/lib/mapConcept";
import { toUi } from "@/lib/uiScale";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { PLACE_TITLE } from "@/lib/placeName";
import styles from "./Minimap.module.css";

// F17 미니맵: 화면 오른쪽 위에 늘 떠 있는 작은 지도 (맵 모양·물·주요 장소·나·같은 채널 사람). 접기/펴기는 이 브라우저에 기억한다.
// 바탕은 처음 한 번만 굽고(game/world/minimapArt), 사람 점만 게임이 0.25초마다 보내는 minimap:dots로 다시 그린다.
// 나에게 피어 있는 채집 지점(forage:nodes)은 종류 색의 작은 점으로.

const STORE_KEY = "tomb.minimap";

/** 캔버스 해상도 배율: 지도 1칸을 3×3 픽셀로 그려 화면에서 크게 늘려도 점이 또렷하게 (바탕 그림은 같은 그림을 그대로 확대) */
const SCALE = 3;
/** 11/25 크게 보기 지도는 1칸을 8×8 픽셀로 (폰 화면 너비·데스크톱 창에서도 도트가 또렷하게) */
const BIG_SCALE = 8;

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
  landmarks: readonly { id: string; x: number; y: number; kind: string }[];
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
  sea: { w: SEA_MINIMAP_W, h: SEA_MINIMAP_H, pixels: seaMinimapPixels, to: toSeaMinimap, landmarks: [...SEA_LANDMARKS, ...SEA_SCOPES.map((s) => ({ id: s.id, x: s.x, y: s.y, kind: "telescope" }))], color: (k) => SEA_LANDMARK_COLOR[k as keyof typeof SEA_LANDMARK_COLOR] ?? "#ffffff", big: new Set(["lighthouse"]), label: "바닷가 지도", winter: SEA_WINTER_PALETTE },
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

/** 11/25 다른 맵으로 가는 정류장 (그림을 두 배로, 가는 곳 색 고리를 두른다) → 고리 색 */
const BUS_TINT: Readonly<Record<string, string>> = { busCamp: "#9ae0a8", busSea: "#5ac8f0", bus: "#ffd84a" };

/** 11/16 장소 도트 그림 (글씨 없이): 칸마다 검은 테 3×3을 먼저, 그 위에 색 1×1. 그림이 없는 종류면 false. 11/25 k = 칸 크기 (정류장은 2) */
function drawIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, k = 1): boolean {
  const ic = MAP_ICONS[kind];
  if (!ic) return false;
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  for (const [dx, dy] of ic.px) ctx.fillRect(px + dx * k - 1, py + dy * k - 1, k + 2, k + 2);
  for (const [dx, dy, acc] of ic.px) {
    ctx.fillStyle = acc ? ic.accent : ic.color;
    ctx.fillRect(px + dx * k, py + dy * k, k, k);
  }
  return true;
}

/** 11/25 정류장 표시 크기: 작은 지도(1칸이 화면 2px 미만)는 그림 두 배, 고리는 화면에서 반지름 11px 이상 (unit = 지도 1칸의 화면 px) */
function busMark(unit: number): { k: number; r: number } {
  const k = unit < 2 ? 2 : 1;
  return { k, r: Math.max(k === 2 ? 7.5 : 5.5, 11 / unit) };
}

/** 11/25 정류장: 어두운 원 + 가는 곳 색 고리 위에 큰 그림 (다른 맵으로 가는 길이 한눈에) */
function drawBus(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, unit: number) {
  const { k, r } = busMark(unit);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,12,14,0.62)";
  ctx.fill();
  ctx.lineWidth = 1.5 / unit;
  ctx.strokeStyle = BUS_TINT[kind] ?? "#ffd84a";
  ctx.stroke();
  drawIcon(ctx, kind, x, y, k);
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
    if (l.kind in BUS_TINT) {
      drawBus(ctx, l.kind, p.x, p.y, c.clientWidth / M.w || 1);
      continue;
    }
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
    dot(ctx, p.x, p.y, px(3), px(1.5), "#c49bff", "rgba(8,10,14,0.9)");
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

  /** 11/25 크게 보기 창 (폰은 [지도] 단추·작은 지도 누르기, 데스크톱은 작은 지도 누르기) */
  const [big, setBig] = useState(false);
  const bigCanvas = useRef<HTMLCanvasElement | null>(null);
  const [coarse] = useState(() => !firstOpen());

  /** 작은 지도·크게 보기 지도 둘 다 (열려 있는 것만) */
  const draw = () => {
    paint(canvas.current, SCALE);
    paint(bigCanvas.current, BIG_SCALE);
  };

  const paint = (c: HTMLCanvasElement | null, scale: number) => {
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // 지도 칸 좌표로 그리고 캔버스는 scale배 해상도
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const away = last.current?.map;
    if (away) {
      drawAway(ctx, c, away, last.current, nodes.current);
      return;
    }
    ctx.drawImage(baseImage(), 0, 0);
    for (const l of LANDMARKS) {
      const p = toMinimap(l.x, l.y);
      // 11/25 정류장 둘은 두 배 그림 + 가는 곳 색 고리
      if (l.kind in BUS_TINT) {
        drawBus(ctx, l.kind, p.x, p.y, c.clientWidth / MINIMAP_W || 1);
        continue;
      }
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
    // 다른 사람: 연보라 점 + 검은 테두리 (11/25 운영자 — 하늘색은 물·얼음 위에서 묻혀서. 노랑=나, 분홍 하트=친구와도 갈린다)
    for (let i = 0; i + 1 < d.others.length; i += 2) {
      const p = toMinimap(d.others[i], d.others[i + 1]);
      dot(ctx, p.x, p.y, px(3), px(1.5), "#c49bff", "rgba(8,10,14,0.9)");
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

  // 작은 지도·크게 보기 지도가 둘 다 닫혀 있으면 draw는 아무것도 안 한다
  useBridgeEvent("forage:nodes", ({ ids }) => {
    nodes.current = ids;
    draw();
  });

  useBridgeEvent("minimap:dots", (d) => {
    last.current = d;
    const now = d.map ?? "village";
    if (now !== map) setMap(now);
    else draw();
  });

  // 맵이 바뀌면 캔버스 크기가 바뀐다 → 다시 그린다. 11/25 크게 보기 창이 열릴 때도
  useEffect(() => {
    draw();
    // draw는 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, big]);

  useEffect(() => {
    if (open) draw();
    try {
      localStorage.setItem(STORE_KEY, open ? "1" : "0");
    } catch {
      /* 저장 못 해도 괜찮다 */
    }
    // draw는 ref만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 11/18 데스크톱 M: 지도 펴기·접기 (입력칸에 쓰는 중이거나 창이 떠 있으면 그 몫 — 다른 창 단축키와 같은 조건).
  // 11/25 큰 지도가 떠 있으면 M·Esc는 큰 지도를 닫는다 (다른 키는 그대로 게임으로 — 걸으면서 본다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code !== "KeyM" && !(big && e.key === "Escape")) || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (big) setBig(false);
      else setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  // 11/25 [지도] 단추·작은 지도 묶음 맨 아래 y를 --minimap-bottom(문서 루트)으로 알린다 → 폰 바닷가 과자 칸이 지도 아래로 (GullSnacks)
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!wrapEl) return;
    const root = document.documentElement;
    const put = () => {
      const r = wrapEl.getBoundingClientRect();
      if (r.height > 0) root.style.setProperty("--minimap-bottom", `${Math.ceil(toUi(r.bottom))}px`);
      else root.style.removeProperty("--minimap-bottom");
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(wrapEl);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--minimap-bottom");
    };
  }, [wrapEl]);

  const size = mapSize(map);
  const crop = edgeCrop(map);
  const vw = size.w - crop.l - crop.r;
  const vh = size.h - crop.t - crop.b;
  return (
    <>
      <div ref={setWrapEl} className={styles.wrap}>
        {/* 11/19 화살표 대신 핀 그림, 누르면 켜고 끄기 (켜져 있으면 밝게) — 단축키 M은 그대로.
            11/25 폰도 데스크톱과 같다: [지도]는 작은 지도 켜고 끄기, 큰 지도는 작은 지도·[크게]를 누를 때만 */}
        <button
          type="button"
          className={cx(ui.button, ui.top, styles.toggle)}
          data-on={open || undefined}
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          aria-label={open ? "지도 끄기 (M)" : "지도 켜기 (M)"}
          title={open ? "지도 끄기 (M)" : "지도 켜기 (M)"}
        >
          <PixelIcon name="map" />
          지도
          {/* 위쪽 줄 다른 단추([내 정보] P·[랭킹] L)와 같은 단축키 칸 */}
          <span className={styles.key} aria-hidden="true">
            M
          </span>
        </button>
        {open && (
          // 11/25 운영자: 펼친 지도에 지금 맵 이름 딱지 하나 (왼쪽 위) · [크게] (오른쪽 위) · 다른 맵 가는 정류장 이름표
          <div className={styles.mapBox}>
            {/* 11/25 큰 지도처럼 가장자리 검은 담장 줄은 잘라 낸다 (테두리 칸 = 보이는 지도, 캔버스는 잘린 만큼 밖으로) */}
            <div className={styles.mapFrame} style={{ aspectRatio: `${vw} / ${vh}` }}>
              <canvas
                ref={canvas}
                className={styles.map}
                // 11/22 터치 왼쪽 위 칩 묶음이 펼친 지도 칸을 비운다 (TopLeftCluster.module.css)
                data-minimap=""
                width={size.w * SCALE}
                height={size.h * SCALE}
                // 11/16 r19 지도 비율 그대로 (가로세로 같은 배율 — 바닷가 지도가 늘어나 보이던 것 고침)
                style={{ left: `${(-crop.l / vw) * 100}%`, top: `${(-crop.t / vh) * 100}%`, width: `${(size.w / vw) * 100}%`, height: `${(size.h / vh) * 100}%` }}
                aria-label={`${map !== "village" ? AWAY_MINIMAP[map].label : "마을 지도"} (노란 점이 나, 분홍 하트가 친구)`}
                role="img"
                onClick={() => setBig(true)}
              />
            </div>
            <MapLabels map={map} corner coarse={coarse} crop={crop} />
            {/* 바닷가 정류장이 오른쪽 위 끝이라 [크게]도 왼쪽 위 이름 딱지 옆에 */}
            <div className={styles.mapChips}>
              <span className={styles.mapName}>{PLACE_TITLE[map]}</span>
              <button type="button" className={styles.bigBtn} onClick={() => setBig(true)} aria-label="지도 크게 보기" title="지도 크게 보기">
                크게
              </button>
            </div>
          </div>
        )}
      </div>
      {big && <MapPanel map={map} canvasRef={bigCanvas} onClose={() => setBig(false)} coarse={coarse} />}
    </>
  );
}

/** 그 맵 지도 크기 (지도 칸) */
function mapSize(map: MapId): { w: number; h: number } {
  return map !== "village" ? { w: AWAY_MINIMAP[map].w, h: AWAY_MINIMAP[map].h } : { w: MINIMAP_W, h: MINIMAP_H };
}

/** 지도 가장자리에서 잘라 낼 칸 수 (왼·위·오른·아래) */
type Crop = { l: number; t: number; r: number; b: number };
const NO_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };
const cropCache = new Map<MapId, Crop>();
/**
 * 11/25 운영자 「지도랑 바깥 사이 검은 간격을 다 붙이자」: 큰 지도는 가장자리의 검은 담장 줄(마을 바깥 담 — 왼·위·오른 4칸, 아래 2칸)을 잘라
 * 지도 그림이 테두리 줄에 바로 붙게. 줄의 90% 이상이 거의 검은 칸이면 담장 줄로 본다 (성문 길 몇 칸은 같이 잘린다)
 */
function edgeCrop(map: MapId): Crop {
  const hit = cropCache.get(map);
  if (hit) return hit;
  const { w, h } = mapSize(map);
  const px = map !== "village" ? AWAY_MINIMAP[map].pixels() : minimapPixels();
  const dark = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return px[i] + px[i + 1] + px[i + 2] < 0x30 * 3;
  };
  const col = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (dark(x, y)) n++;
    return n >= h * 0.9;
  };
  const row = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (dark(x, y)) n++;
    return n >= w * 0.9;
  };
  const run = (len: number, f: (i: number) => boolean) => {
    let n = 0;
    while (n < Math.min(8, len / 4) && f(n)) n++;
    return n;
  };
  const c = { l: run(w, col), t: run(h, row), r: run(w, (i) => col(w - 1 - i)), b: run(h, (i) => row(h - 1 - i)) };
  cropCache.set(map, c);
  return c;
}

/** 그 맵 주요 장소 (월드 좌표) */
function spotsOf(map: MapId): readonly { id: string; x: number; y: number; kind: string }[] {
  return map !== "village" ? AWAY_MINIMAP[map].landmarks : LANDMARKS;
}

/** 이름표 글꼴 (갈무리11 11px — 픽셀 글꼴이 또렷한 크기) */
const LABEL_FONT = 11;
const LABEL_H = 15;
const LABEL_PAD_X = 4;
let measureCtx: CanvasRenderingContext2D | null | undefined;
/** 이름표 글자 폭 (캔버스로 재고, 못 재면 어림) */
function textWidth(text: string): number {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return estimateTextWidth(text, LABEL_FONT);
  measureCtx.font = `${LABEL_FONT}px Galmuri11, "Apple SD Gothic Neo", sans-serif`;
  return Math.ceil(measureCtx.measureText(text).width);
}

/** 상자 크기를 따라가는 훅 (이름표 자리는 지도가 화면에 그려진 크기로 고른다) */
function useBoxSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * 11/25 지도 이름표 (캔버스 위에 글자로): corner = 작은 지도 (다른 맵 가는 정류장만), 아니면 크게 보기 (MAP_LABELS 전부, 겹치면 앞 순위만).
 * focus = 목록에서 고른 장소 (맨 먼저 자리를 잡고 깜빡이는 고리)
 */
function MapLabels({ map, corner = false, focus = null, coarse = false, crop = NO_CROP }: { map: MapId; corner?: boolean; focus?: string | null; coarse?: boolean; crop?: Crop }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const box = useBoxSize(ref);
  // 글꼴이 늦게 들어오면 폭을 다시 잰다
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  const layout = useMemo(() => {
    if (!box.w || !box.h) return { placed: [], anchors: new Map<string, { x: number; y: number }>() };
    const size = mapSize(map);
    // 이름표 칸 = 보이는 지도 (큰 지도는 가장자리 담장 줄을 잘라 낸 만큼 당겨 놓는다)
    const unit = box.w / (size.w - crop.l - crop.r);
    const labels = MAP_LABELS[map];
    const to = map !== "village" ? AWAY_MINIMAP[map].to : toMinimap;
    const items: (LabelItem & { group: LabelGroup })[] = [];
    const anchors = new Map<string, { x: number; y: number }>();
    /** 이름표 없는 장소 그림 (망원경 등 — 되도록 안 덮는다) */
    const soft: Rect[] = [];
    for (const l of spotsOf(map)) {
      const lab = labels[l.id];
      const p = to(l.x, l.y);
      const x = (p.x - crop.l) * unit;
      const y = (p.y - crop.t) * unit;
      if (!lab || (corner && lab.group !== "bus")) {
        const g = Math.max(2, Math.round(3 * unit));
        soft.push({ x: x - g, y: y - g, w: g * 2, h: g * 2 });
        continue;
      }
      anchors.set(l.id, { x, y });
      const g = Math.max(3, Math.round((l.kind in BUS_TINT ? busMark(unit).r : 3) * unit));
      items.push({ id: l.id, x, y, w: textWidth(lab.text) + LABEL_PAD_X * 2, h: LABEL_H, g, pri: l.id === focus ? -1 : lab.pri, hard: lab.group === "bus", group: lab.group });
    }
    // 작은 지도: 왼쪽 위 맵 이름 딱지·[크게] 단추 자리는 비운다 (딱지 둘 = 글자 + 좌우 여백 12px씩, 사이 4px, 바깥 4px — 폰 [크게]는 손가락 크기라 더 크게)
    const obstacles: Rect[] = corner && !coarse ? [{ x: 0, y: 0, w: textWidth(PLACE_TITLE[map]) + textWidth("크게") + (coarse ? 44 : 36), h: coarse ? 30 : 24 }] : [];
    return { placed: placeLabels(items, box.w, box.h, obstacles, 2, soft), anchors };
    // fontsTick: 글꼴이 들어오면 다시 잰다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h, map, corner, focus, fontsTick, coarse, crop]);
  const labels = MAP_LABELS[map];
  const f = focus ? layout.anchors.get(focus) : undefined;
  return (
    <div ref={ref} className={styles.labels} data-corner={corner || undefined} aria-hidden="true">
      {f && <span className={styles.focusRing} style={{ left: f.x, top: f.y }} />}
      {layout.placed.map((p) => (
        <span key={p.id} className={styles.label} data-group={labels[p.id].group} data-dest={labels[p.id].group === "bus" ? p.id : undefined} data-focus={p.id === focus || undefined} style={{ left: p.left, top: p.top }}>
          {labels[p.id].text}
        </span>
      ))}
    </div>
  );
}

/**
 * 11/25 크게 보기 지도 (운영자 「길치 이슈」): 큰 지도 + 장소 이름표 + 장소 목록 (누르면 지도에서 그 자리가 깜빡여요).
 * 운영자 「큰 지도 켜 놓은 상태에서 이동 가능하게」: 창(dialog)이 아니라 떠 있는 판 — 게임 키(WASD·방향키)·조이스틱이 그대로 되고,
 * 열려 있는 동안 내 점이 0.25초마다 움직여 깜빡이는 고리 쪽으로 찾아갈 수 있다 (canvasRef — Minimap draw).
 * 데스크톱은 오른쪽에 붙어 캐릭터를 가리지 않고 Esc·M·×로 닫는다. 폰은 화면 가운데 카드 (아래 조이스틱·버튼, 위 HUD는 보이게),
 * 11/25 장소 목록·안내 글은 뺐다. 판을 눌러도 아래 화면으로 넘어가지 않는다 (캐릭터가 안 움직인다)
 */
function MapPanel({ map, canvasRef, onClose, coarse }: { map: MapId; canvasRef: RefObject<HTMLCanvasElement | null>; onClose: () => void; coarse: boolean }) {
  const size = mapSize(map);
  // 11/25 가장자리 검은 담장 줄은 잘라 내고 보이는 칸만큼의 비율로 (캔버스는 통째로 그리고 잘린 만큼 바깥으로 밀어 둔다 — 점 좌표는 그대로)
  const crop = edgeCrop(map);
  const vw = size.w - crop.l - crop.r;
  const vh = size.h - crop.t - crop.b;
  return (
    <section className={styles.panel} style={{ "--map-aspect": vw / vh } as CSSProperties} data-coarse={coarse || undefined} data-bigmap="" aria-label={`${PLACE_TITLE[map]} 큰 지도`} onPointerDown={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{PLACE_TITLE[map]}</h2>
        <button type="button" className={cx(ui.button, ui.quiet, ui.icon)} onClick={onClose} aria-label="큰 지도 닫기" title={coarse ? "닫기" : "닫기 (Esc·M)"}>
          <PixelIcon name="close" />
        </button>
      </header>
      <div className={styles.big}>
        <div className={styles.bigFrame} data-zoomout={coarse ? undefined : ""} onClick={coarse ? undefined : onClose} title={coarse ? undefined : "누르면 작은 지도로"} style={{ aspectRatio: `${vw} / ${vh}` }}>
          <div className={styles.bigCrop} style={{ left: `${(-crop.l / vw) * 100}%`, top: `${(-crop.t / vh) * 100}%`, width: `${(size.w / vw) * 100}%`, height: `${(size.h / vh) * 100}%` }}>
            <canvas ref={canvasRef} className={styles.bigMap} width={size.w * BIG_SCALE} height={size.h * BIG_SCALE} role="img" aria-label={`${PLACE_TITLE[map]} 큰 지도 (노란 점이 나, 분홍 하트가 친구)`} />
          </div>
          <MapLabels map={map} focus={null} crop={crop} />
        </div>
        <div className={styles.legendRow}>
          <p className={styles.legend}>
            <span className={styles.legendMe} aria-hidden="true" />나
            <span className={styles.legendOther} aria-hidden="true" />다른 사람
            <span className={styles.legendFriend} aria-hidden="true">
              <PixelIcon name="heart" />
            </span>
            친구
          </p>
        </div>
        {/* 11/25 운영자: 큰 지도 아래 장소 목록은 뺐다 (지도 이름표로 충분) */}
      </div>
    </section>
  );
}
