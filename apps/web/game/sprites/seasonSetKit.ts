import type { GearM, GearView } from "./avatarGear";
import { Grid, mix, type Color } from "./pixel";

// 11/20 계절 한정 세트 그림 도우미 (코디 기획안 시안 kit.ts와 같다 — seasonSetGear2·seasonSetFx2가 쓴다).
// seasonSetGear.ts에도 같은 도우미가 있지만, 서로 불러 초기화 순서가 꼬이지 않게 따로 둔다.

export type FB = string;
export type V = GearView;

/** 시트에 그려지는 계절 한정 꾸미기 한 점의 자리별 그리기 (seasonSetGear SsItem과 같다) */
export type SsItem = {
  /** 두건 꼭지·새싹을 덮는 모자 */
  covers?: boolean;
  /** 머리에 무언가 쓴 것으로 본다 (기본: head가 있으면 true) */
  headWorn?: boolean;
  head?(g: Grid, v: V, m: GearM, fb: FB, top: number, body: string): void;
  neck?(g: Grid, v: V, m: GearM, fb: FB, body: string): void;
  hand?(g: Grid, v: V, m: GearM, fb: FB, body: string): void;
  back?(g: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void;
  glow?(g: Grid, v: V, m: GearM, fb: FB, top: number, body: string): void;
};

/** 프레임 맨 위 세 줄은 비워 둔다 (xmasGear safe와 같다) */
export const SAFE_TOP = 3;
export function safe(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => (y >= SAFE_TOP ? set(x, y, c, a) : undefined),
  });
}

/** 이미 칠한 칸은 건너뛰는 붓 (몸·머리 뒤에 놓인다 — 몸 명암 칠에 휩쓸리지 않게 머리 다음에 그린다). ok = 덮어써도 되는 칸 */
export function under(g: Grid, ok: (x: number, y: number) => boolean = () => false): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => (!g.filled(x, y) || ok(x, y) ? set(x, y, c, a) : undefined),
  });
}

/** 문자 그림 → 그리드 ('.' 투명) */
export function rows(g: Grid, a: readonly string[], pal: Record<string, Color>, ox = 0, oy = 0): void {
  a.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === "." || pal[ch] === undefined) return;
      g.set(ox + x, oy + y, pal[ch]);
    }),
  );
}

/** 문자 그림 → 새 그리드 */
export function art(a: readonly string[], pal: Record<string, Color>): Grid {
  const g = new Grid(Math.max(...a.map((r) => r.length)), a.length);
  rows(g, a, pal);
  return g;
}

/** 16×16 아이콘: 문자 그림을 가운데에 + 외곽선 */
export function iconOf(a: readonly string[], pal: Record<string, Color>, after?: (g: Grid, ox: number, oy: number) => void, lineC = 0x1e1c1a): Grid {
  const g = new Grid(16, 16);
  const w = Math.max(...a.map((r) => r.length));
  const ox = Math.floor((16 - w) / 2);
  const oy = Math.max(0, Math.floor((16 - a.length) / 2));
  rows(g, a, pal, ox, oy);
  g.outline(lineC, false, 170);
  after?.(g, ox, oy);
  return g;
}

export function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, a = 255): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.set(x0, y0, c, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 다른 그리드를 알파 섞어 겹친다 (a 0..1 배율) */
export function over(dst: Grid, src: Grid, ox: number, oy: number, a = 1): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.px[y * src.w + x];
      const sa = ((v & 255) / 255) * a;
      if (sa <= 0) continue;
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const d = dst.px[ty * dst.w + tx];
      const da = (d & 255) / 255;
      const oa = sa + da * (1 - sa);
      const sc = v >>> 8;
      const dc = d >>> 8;
      const c = da <= 0 ? sc : mix(dc, sc, sa / oa);
      dst.px[ty * dst.w + tx] = Grid.rgba(c, Math.round(oa * 255));
    }
}

/** 한 점을 알파 섞어 찍는다 */
export function dot(g: Grid, x: number, y: number, c: Color, a = 255): void {
  const s = new Grid(1, 1);
  s.set(0, 0, c, a);
  over(g, s, Math.round(x), Math.round(y));
}

/** 머리 한 줄의 반폭 (타원 공식, 머리 밖이면 0) */
export function halfAt(m: GearM, y: number): number {
  const d = (y + 0.5 - m.hy) / m.ry;
  return d * d >= 1 ? 0 : m.rx * Math.sqrt(1 - d * d);
}

/** 목도리 반폭 (avatar.ts 목도리와 같은 값) */
export const neckHalf = (fb: FB) => (fb === "round" || fb === "sheet" ? 6 : fb === "tall" ? 3 : 4);

/** 여러 칸 그림 (가로로 n칸) */
export function frames(w: number, h: number, n: number, draw: (g: Grid, f: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

// ── 11/20 새 다섯 벌(seasonSetGear3·seasonSetFx3) 도우미 (코디 기획안 시안 pk.ts·kit.ts와 같다) ──

/** 글자 지도 일부만 바꾼 복사본 ([x, y, 글자]) */
export function edit(a: readonly string[], changes: readonly (readonly [number, number, string])[]): string[] {
  const r = a.map((s) => [...s]);
  for (const [x, y, ch] of changes) r[y][x] = ch;
  return r.map((s) => s.join(""));
}

/** 펫 한 장: 좌우 1칸·위 1칸 여백 + 진한 테두리(220) — petBreeds와 같은 규칙 */
export function petCel(a: readonly string[], pal: Partial<Record<string, Color>>, lineC: Color, after?: (g: Grid) => void): Grid {
  const w = Math.max(...a.map((r) => r.length));
  const g = new Grid(w + 2, a.length + 1);
  a.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (row[x] !== "." && c !== undefined) g.set(x + 1, y + 1, c);
    }
  });
  g.outline(lineC, false, 220);
  after?.(g);
  return g;
}

/** 아바타 칸 안전 범위: 테두리가 칸 안에 닫히도록 x 1..18, y ..26 (맨 위 SAFE_TOP 줄은 safe가 막는다) */
export const FIT_X0 = 1;
export const FIT_X1 = 18;
export const FIT_Y1 = 26;
export const clampX = (x: number) => Math.max(FIT_X0, Math.min(FIT_X1, x));

/** 몸 뒤에 놓기: 임시 그리드에 그린 뒤 빈 칸에만 옮긴다 (머리 명암 칠이 끝난 뒤 — head 자리에서 부른다) */
export function behind(g: Grid, draw: (t: Grid) => void): void {
  const t = new Grid(g.w, g.h);
  draw(t);
  for (let y = SAFE_TOP; y <= Math.min(g.h - 1, FIT_Y1); y++)
    for (let x = FIT_X0; x <= Math.min(g.w - 1, FIT_X1); x++) {
      const v = t.get(x, y);
      if (v & 255 && !g.filled(x, y)) g.set(x, y, v >>> 8, v & 255);
    }
}

export const objectBody = (b: string) => b === "box" || b === "cup" || b === "tube";
export const bigBody = (fb: FB) => fb === "round" || fb === "sheet";

/** 16×16 아이콘 칸에 그리드를 가운데로 (바닥 기준 y) */
export function centerIn(src: Grid, bottom = 15): Grid {
  const g = new Grid(16, 16);
  let x0 = src.w;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.get(x, y) & 255) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  g.draw(src, Math.floor((16 - (x1 - x0 + 1)) / 2) - x0, bottom - y1);
  return g;
}

/** 몸마다 눈 자리 (avatar.ts drawFace와 같은 값) */
export function eyes(body: FB, view: V, m: GearM): { xs: number[]; y: number } {
  const { cx, hy } = m;
  const side = view === "side";
  switch (body) {
    case "tall":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 2, cx + 1], y: hy };
    case "round":
      return side ? { xs: [cx + 4], y: Math.round(hy - 2) } : { xs: [cx - 2, cx + 1], y: Math.round(hy - 2) };
    case "cat":
    case "bun":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    case "sheet":
      return side ? { xs: [cx + 3], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    default:
      return side ? { xs: [cx + 3], y: hy + 1 } : { xs: [cx - 2, cx + 1], y: hy + 1 };
  }
}
