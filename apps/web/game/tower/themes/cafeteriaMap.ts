import { css, darken, hash2, lighten, type Color } from "../../sprites/pixel";
import { digits } from "./serverRoomMap";

// 11/15 구내식당 지도: 방 여덟 가지 배치(layout.ts MAKE가 부른다) + 바닥·벽·소품 그림(arena/art.ts가 부른다). Phaser 없음.
// 어느 층이 어느 방인지는 lib/rpg/towerThemes/cafeteria cfRoom(판 시드, 층). 마지막(7)이 우두머리 층 특식 배식대.
// 움직이는 것(국솥 김·줄서기 행렬·퇴식 컨베이어·메뉴판 글씨·현수막)은 cafeteriaStage.ts가 그린다.
// 순환 참조를 피하려고 layout.ts·art.ts를 가져오지 않는다 → 지도 크기는 여기 숫자를 같이 쓴다.

const AW = 448;
const AH = 288;
const TOP = 30;
const SIDE = 10;

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };
type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };
/** arena/layout ArenaLayout 중 여기서 쓰는 것 */
type L = { variant: number; decals: readonly Decal[] };

function R(c: Ctx, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function E(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = (y + 0.5 - cy) / ry;
    if (t * t > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

// ── 방 배치 (순수 데이터 — 지도·실행부·테스트가 같이 쓴다) ──

/** 줄서기 선: 가로(hor)면 y = at, from..to는 x 범위 · 세로면 x = at. dir = 사람들이 걷는 쪽 (+1 오른쪽/아래) */
export type CfLane = { hor: boolean; at: number; from: number; to: number; dir: 1 | -1 };
type P = { kind: string; x: number; y: number; v?: number; flip?: boolean };
export type CfRoomPlan = { props: P[]; decals: Decal[]; lanes: CfLane[]; start: Pt; spawns: [number, number][]; lights: [number, number, number, number][] };

const EDGE: [number, number][] = [
  [30, 80],
  [AW - 30, 80],
  [30, AH - 24],
  [AW - 30, AH - 24],
  [AW / 2, AH - 20],
];

/** 국솥이 놓인 소품 (국물이 튀는 자리) */
const POT_KINDS = new Set(["cf_pot_counter", "cf_stove"]);

/** 방 v의 배치 (seed는 식판·반찬 같은 작은 그림만 바꾼다 — 자리·줄·국솥은 방마다 같다) */
export function cfRoomPlan(v: number, seed = 0): CfRoomPlan {
  const props: P[] = [];
  const decals: Decal[] = [];
  const lanes: CfLane[] = [];
  const lights: [number, number, number, number][] = [];
  let start: Pt = { x: AW / 2, y: 180 };
  const spawns: [number, number][] = [...EDGE];
  const pv = (k: number) => Math.floor(hash2(k, v, 4100 + (seed & 0xff)) * 6);
  const counterRow = (xs: number[], y: number, pots: number[]) =>
    xs.forEach((x, i) => {
      props.push({ kind: pots.includes(x) ? "cf_pot_counter" : "cf_counter", x, y, v: pv(i) });
      if (pots.includes(x)) lights.push([x, y - 26, 30, 0xffd8a0]);
    });
  const tables = (pts: [number, number][]) =>
    pts.forEach(([x, y], i) => {
      props.push({ kind: "cf_table4", x, y, v: pv(i + 20) });
    });
  const lane = (l: CfLane) => {
    lanes.push(l);
    if (l.hor) decals.push({ kind: "cf_queue", x: l.from, y: l.at - 15, w: l.to - l.from, h: 30, v: l.dir > 0 ? 1 : 0 });
    else decals.push({ kind: "cf_queue_v", x: l.at - 15, y: l.from, w: 30, h: l.to - l.from, v: l.dir > 0 ? 1 : 0 });
  };
  const ceiling = (ys: number[]) => {
    for (const y of ys) for (const x of [96, 224, 352]) lights.push([x, y, 46, 0xfff6e0]);
  };
  switch (v) {
    // 배식 줄: 위쪽 긴 배식대(국솥 셋)와 그 앞 줄서기 선, 아래로 4인 테이블 두 줄
    case 0: {
      counterRow([72, 120, 168, 216, 264, 312, 360], 78, [120, 216, 312]);
      props.push({ kind: "cf_tray_rack", x: 30, y: 74 }, { kind: "cf_water", x: 418, y: 72 });
      lane({ hor: true, at: 104, from: 20, to: AW - 20, dir: -1 });
      tables([
        [72, 160],
        [168, 160],
        [280, 160],
        [376, 160],
        [72, 236],
        [168, 236],
        [280, 236],
        [376, 236],
      ]);
      ceiling([130, 214]);
      start = { x: AW / 2, y: 198 };
      spawns.push([224, 124], [AW - 30, 196]);
      break;
    }
    // 4인 테이블 홀: 가운데 통로를 사이에 둔 테이블 섬, 통로가 줄서기 선
    case 1: {
      for (const y of [108, 170, 232]) tables([
        [76, y],
        [156, y],
        [292, y],
        [372, y],
      ]);
      counterRow([160, 288], 66, [160, 288]);
      props.push({ kind: "cf_water", x: 30, y: 66 }, { kind: "cf_tray_rack", x: 418, y: 66 }, { kind: "plant", x: 116, y: 60 }, { kind: "plant", x: 332, y: 60 });
      lane({ hor: false, at: 224, from: 36, to: AH - 12, dir: 1 });
      ceiling([96, 200]);
      start = { x: AW / 2, y: 176 };
      spawns.push([116, 134], [332, 134], [116, 200], [332, 200]);
      break;
    }
    // 창가 바 좌석: 창 아래 긴 바 테이블과 높은 의자, 가운데 줄서기 선, 아래쪽 국 코너
    case 2: {
      for (const x of [80, 176, 272, 368]) {
        props.push({ kind: "cf_bar", x, y: 62, v: pv(x) });
        for (const dx of [-24, -8, 8, 24]) props.push({ kind: "cf_stool", x: x + dx, y: 78 });
      }
      lane({ hor: true, at: 150, from: 20, to: AW - 20, dir: 1 });
      tables([
        [72, 212],
        [376, 212],
      ]);
      counterRow([176, 224, 272], 264, [224]);
      props.push({ kind: "cf_tray_rack", x: 120, y: 262 }, { kind: "cf_water", x: 328, y: 260 });
      ceiling([110, 214]);
      start = { x: AW / 2, y: 112 };
      spawns.push([224, 206], [26, 150], [AW - 26, 150]);
      break;
    }
    // 자판기 코너: 벽에 붙은 자판기 여섯, 정수기, 국 섬 하나, 작은 테이블
    case 3: {
      [40, 66, 92].forEach((x, i) => props.push({ kind: "cf_vending", x, y: 64, v: i }));
      [356, 382, 408].forEach((x, i) => props.push({ kind: "cf_vending", x, y: 64, v: 2 - i }));
      props.push({ kind: "cf_water", x: 130, y: 58 }, { kind: "cf_water", x: 318, y: 58 });
      lane({ hor: true, at: 80, from: 20, to: AW - 20, dir: 1 });
      counterRow([176, 224, 272], 110, [224]);
      tables([
        [150, 160],
        [298, 160],
        [224, 222],
        [96, 244],
        [352, 244],
      ]);
      ceiling([130, 220]);
      start = { x: AW / 2, y: 178 };
      spawns.push([30, 160], [AW - 30, 160]);
      break;
    }
    // 퇴식구: 오른쪽 위 식판 반납 창과 컨베이어, 잔반통, 왼쪽 위 작은 배식대
    case 4: {
      props.push({ kind: "cf_return", x: 330, y: 76 }, { kind: "cf_waste", x: 404, y: 74 }, { kind: "cf_waste", x: 262, y: 74, v: 1 });
      counterRow([72, 120], 74, [72]);
      props.push({ kind: "cf_tray_rack", x: 166, y: 72 });
      lane({ hor: true, at: 102, from: 20, to: AW - 20, dir: 1 });
      tables([
        [72, 164],
        [168, 164],
        [280, 164],
        [376, 164],
        [72, 240],
        [168, 240],
        [280, 240],
        [376, 240],
      ]);
      decals.push({ kind: "cf_wet", x: 300, y: 112, w: 70, h: 18 });
      ceiling([130, 214]);
      start = { x: AW / 2, y: 202 };
      spawns.push([224, 130], [224, 270]);
      break;
    }
    // 조리실 뒤편: 화구 넷(큰 국솥), 스테인리스 작업대, 배수구, 아래쪽 배식 통로
    case 5: {
      for (const x of [72, 152, 296, 376]) props.push({ kind: "cf_stove", x, y: 76, v: pv(x) });
      props.push({ kind: "cf_tray_rack", x: 224, y: 72 });
      props.push({ kind: "cf_prep", x: 140, y: 172 }, { kind: "cf_prep", x: 308, y: 172 });
      props.push({ kind: "cf_tray_rack", x: 40, y: 276 }, { kind: "cf_tray_rack", x: 408, y: 276 });
      lane({ hor: true, at: 228, from: 20, to: AW - 20, dir: -1 });
      decals.push({ kind: "cf_drain", x: 216, y: 136, w: 16, h: 10 }, { kind: "cf_drain", x: 216, y: 196, w: 16, h: 10 }, { kind: "cf_wet", x: 120, y: 112, w: 80, h: 20 }, { kind: "cf_wet", x: 280, y: 190, w: 70, h: 16 });
      for (const x of [72, 152, 296, 376]) lights.push([x, 90, 26, 0xffb060]);
      ceiling([140]);
      start = { x: AW / 2, y: 120 };
      spawns.push([224, 172], [100, 252], [348, 252]);
      break;
    }
    // 샐러드 바: 가운데 샐러드 섬 양 끝에 국솥, 위쪽 줄서기 선, 아래 테이블
    case 6: {
      props.push({ kind: "cf_salad", x: 224, y: 164, v: pv(1) });
      props.push({ kind: "cf_pot_counter", x: 138, y: 164, v: 1 }, { kind: "cf_pot_counter", x: 310, y: 164, v: 2 });
      lights.push([138, 138, 30, 0xffd8a0], [310, 138, 30, 0xffd8a0], [224, 140, 50, 0xe8ffe0]);
      lane({ hor: true, at: 98, from: 20, to: AW - 20, dir: 1 });
      tables([
        [72, 240],
        [168, 240],
        [280, 240],
        [376, 240],
      ]);
      props.push({ kind: "cf_water", x: 30, y: 60 }, { kind: "plant", x: 418, y: 58 }, { kind: "plant", x: 60, y: 58 }, { kind: "cf_tray_rack", x: 388, y: 60 });
      ceiling([200]);
      start = { x: AW / 2, y: 204 };
      spawns.push([30, 170], [AW - 30, 170]);
      break;
    }
    // 특식 배식대 (우두머리 층): 긴 배식대에 큰 국솥 셋, 기둥 넷, 줄서기 선 둘
    default: {
      counterRow([88, 136, 184, 232, 280, 328, 376], 76, [136, 232, 328]);
      for (const [x, y] of [
        [96, 152],
        [352, 152],
        [96, 240],
        [352, 240],
      ] as const)
        props.push({ kind: "cf_pillar", x, y });
      lane({ hor: true, at: 104, from: 20, to: AW - 20, dir: -1 });
      lane({ hor: true, at: 200, from: 20, to: AW - 20, dir: 1 });
      decals.push({ kind: "cf_carpet", x: 200, y: 120, w: 48, h: 158 });
      ceiling([140, 236]);
      start = { x: AW / 2, y: 146 };
      spawns.push([30, 146], [AW - 30, 146], [224, 250]);
    }
  }
  // 소품에 걸린 출현 자리는 뺀다 (몸 반지름 + 여유 10)
  const clear = spawns.filter(([x, y]) =>
    props.every((q) => {
      const meta = (CF_PROP_META as Record<string, { solid?: { t: "r"; dx: number; dy: number; w: number; h: number } | { t: "c"; dx: number; dy: number; r: number } }>)[q.kind];
      const sd = meta?.solid ?? { t: "c" as const, dx: 0, dy: -4, r: 6 };
      if (sd.t === "c") return Math.hypot(x - q.x - sd.dx, y - q.y - sd.dy) > sd.r + 10;
      const cx = Math.max(q.x + sd.dx, Math.min(x, q.x + sd.dx + sd.w));
      const cy = Math.max(q.y + sd.dy, Math.min(y, q.y + sd.dy + sd.h));
      return Math.hypot(x - cx, y - cy) > 10;
    }),
  );
  return { props, decals, lanes, start, spawns: clear, lights };
}

/** 방 v의 국솥 자리 (김이 나는 솥 입구) — 국물은 여기서 튄다 */
export function cfPots(v: number): Pt[] {
  return cfRoomPlan(v).props.filter((p) => POT_KINDS.has(p.kind)).map((p) => ({ x: p.x, y: p.y - (p.kind === "cf_stove" ? 42 : 40) }));
}
/** 솥에서 국물이 튀는 세로 범위: 배식대 앞쪽 (방 아래쪽 배식대면 위로) — 지도 안으로 자른다 */
export function cfSpillBand(pot: Pt): { y0: number; y1: number } {
  const up = pot.y + 40 > AH * 0.6;
  const y0 = up ? pot.y - 70 : pot.y + 56;
  const y1 = up ? pot.y - 8 : pot.y + 116;
  return { y0: Math.max(TOP + 30, y0), y1: Math.min(AH - SIDE - 12, y1) };
}
/** 방 v의 줄서기 선 */
export const cfLanes = (v: number): CfLane[] => cfRoomPlan(v).lanes;
/** 메뉴판 자리 (벽 그림 위에 실행부가 오늘의 메뉴를 쓴다) */
export const CF_MENU = { x: 154, y: 2, w: 140, h: 24 } as const;

/** layout.ts Builder 중 여기서 쓰는 것 */
type B = {
  start: Pt;
  prop(kind: string, x: number, y: number, extra?: { flip?: boolean; v?: number }): B;
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): B;
  light(x: number, y: number, r: number, color: number, flicker?: boolean): B;
  spawn(...pts: [number, number][]): B;
};

export function cafeteriaLayout(b: B, v: number, seed: number): void {
  const p = cfRoomPlan(v, seed);
  for (const d of p.decals) b.decal(d.kind, d.x, d.y, d.w, d.h, d.v);
  for (const q of p.props) b.prop(q.kind, q.x, q.y, { ...(q.v !== undefined ? { v: q.v } : {}), ...(q.flip ? { flip: true } : {}) });
  p.lights.forEach(([x, y, r, col], i) => b.light(x, y, r, col, (seed + i) % 9 === 0));
  b.spawn(...p.spawns);
  b.start = p.start;
}

// ── 소품 크기·충돌 (layout.ts PROP_META에 펼쳐 넣는다). 발밑 띠만 막는다 ──

const Rs = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const Cs = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

export const CF_PROP_META = {
  cf_counter: { w: 48, h: 36, solid: Rs(-24, -14, 48, 13) },
  cf_pot_counter: { w: 48, h: 44, solid: Rs(-24, -14, 48, 13) },
  cf_table4: { w: 44, h: 34, solid: Rs(-18, -15, 36, 12) },
  cf_bar: { w: 74, h: 26, solid: Rs(-35, -12, 70, 10) },
  cf_stool: { w: 8, h: 12 },
  cf_vending: { w: 24, h: 44, solid: Rs(-11, -12, 22, 11) },
  cf_water: { w: 14, h: 32, solid: Rs(-6, -8, 12, 8) },
  cf_waste: { w: 20, h: 22, solid: Cs(0, -5, 8) },
  cf_return: { w: 96, h: 46, solid: Rs(-47, -14, 94, 13) },
  cf_stove: { w: 40, h: 46, solid: Rs(-19, -14, 38, 13) },
  cf_prep: { w: 60, h: 30, solid: Rs(-28, -12, 56, 11) },
  cf_salad: { w: 124, h: 44, solid: Rs(-60, -16, 120, 15) },
  cf_pillar: { w: 18, h: 52, solid: Cs(0, -5, 7) },
  cf_tray_rack: { w: 22, h: 32, solid: Rs(-10, -10, 20, 9) },
};

// ── 바닥 ──

type FloorStyle = { a: Color; b: Color; grout: Color; size: number; kind: "terrazzo" | "check" | "quarry" | "wood" | "gloss" };
const FLOOR_STYLE: FloorStyle[] = [
  { a: 0xd8d2c4, b: 0xd2ccbe, grout: 0xbab4a6, size: 24, kind: "terrazzo" },
  { a: 0xdcd6c8, b: 0xb8c4c0, grout: 0xa8b0ac, size: 16, kind: "check" },
  { a: 0xb08a62, b: 0xa8825a, grout: 0x8a6a46, size: 12, kind: "wood" },
  { a: 0xcfd4d6, b: 0xc6cbcd, grout: 0xa8aeb2, size: 24, kind: "terrazzo" },
  { a: 0xc8ccc4, b: 0xbcc2b8, grout: 0x9aa098, size: 24, kind: "check" },
  { a: 0xa8503a, b: 0x9c4a36, grout: 0x6a3426, size: 16, kind: "quarry" },
  { a: 0xd8dccc, b: 0xd0d6c2, grout: 0xb4baa6, size: 20, kind: "terrazzo" },
  { a: 0xe4dccc, b: 0xdcd4c2, grout: 0xb8ae9a, size: 32, kind: "gloss" },
];

export function cafeteriaFloor(c: Ctx, l: L): void {
  const v = l.variant;
  const st = FLOOR_STYLE[Math.max(0, Math.min(FLOOR_STYLE.length - 1, v))];
  const T = st.size;
  for (let y = 0; y < AH; y += T)
    for (let x = 0; x < AW; x += T) {
      const alt = ((x + y) / T) % 2;
      if (st.kind === "wood") {
        // 나무 마루 (엇갈린 판)
        const off = (y / T) % 2 ? T * 1.5 : 0;
        R(c, x, y, T, T, hash2(Math.floor((x + off) / (T * 3)), y, 4200) < 0.5 ? st.a : st.b);
        R(c, x, y, T, 1, st.grout);
        if (((x + off) / T) % 3 === 0) R(c, x, y, 1, T, st.grout);
        continue;
      }
      R(c, x, y, T, T, alt ? st.a : st.b);
      if (st.kind === "terrazzo") for (let k = 0; k < 9; k++) R(c, x + hash2(x + k, y, 4201) * T, y + hash2(x, y + k, 4202) * T, 1, 1, hash2(k, x + y, 4203) < 0.5 ? darken(st.a, 0.2) : lighten(st.a, 0.25));
      if (st.kind === "quarry") R(c, x + 1, y + 1, T - 2, 1, lighten(st.a, 0.12));
      if (st.kind === "gloss") R(c, x + 2, y + 2, T / 2, 1, lighten(st.a, 0.35));
    }
  if (st.kind !== "wood") {
    for (let y = 0; y < AH; y += T) R(c, 0, y, AW, 1, st.grout);
    for (let x = 0; x < AW; x += T) R(c, x, 0, 1, AH, st.grout);
  }
  // 윤이 나는 바닥에 비친 형광등
  for (let k = 0; k < 3; k++) R(c, 70 + k * 128, TOP + 6, 24, AH - TOP - 16, 0xffffff, st.kind === "gloss" ? 0.12 : 0.05);
  // 식판에서 떨어진 밥알·얼룩
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hash2(k, 1, 4210 + v) * AW);
    const y = TOP + Math.floor(hash2(k, 2, 4210 + v) * (AH - TOP));
    const t = hash2(k, 3, 4211);
    if (t < 0.6) R(c, x, y, 1, 1, 0xf6f4ec, 0.9);
    else if (t < 0.85) E(c, x, y, 2.5, 1.5, 0x8a6a3a, 0.18);
    else R(c, x, y, 2, 1, 0x3a8a3a, 0.6);
  }
  for (const d of l.decals) decal(c, d);
}

/** 발자국 (줄서기 선에 칠한 노란 발 모양) */
function foot(c: Ctx, x: number, y: number, hor: boolean, col: Color): void {
  if (hor) {
    R(c, x, y, 4, 2, col);
    R(c, x + 1, y + 3, 3, 2, col);
  } else {
    R(c, x, y, 2, 4, col);
    R(c, x + 3, y + 1, 2, 3, col);
  }
}

function decal(c: Ctx, d: Decal): void {
  switch (d.kind) {
    case "cf_queue":
    case "cf_queue_v": {
      const hor = d.kind === "cf_queue";
      const dir = d.v ? 1 : -1;
      // 줄 양옆 노란 선 + 바닥 발자국 + 진행 방향 화살표 (칠이 조금 벗겨졌다)
      if (hor) {
        R(c, d.x, d.y, d.w, 2, 0xe8b830, 0.85);
        R(c, d.x, d.y + d.h - 2, d.w, 2, 0xe8b830, 0.85);
        for (let x = d.x + 4; x < d.x + d.w; x += 8) R(c, x, d.y + 1, 4, 1, 0x2a2a2a, 0.5);
        for (let x = d.x + 14; x < d.x + d.w - 10; x += 26) {
          foot(c, x, d.y + 8, true, 0xd8a828);
          foot(c, x + 8, d.y + 16, true, 0xd8a828);
        }
        for (let x = d.x + 40; x < d.x + d.w - 20; x += 96) {
          const cy = d.y + d.h / 2;
          for (let i = 0; i < 6; i++) R(c, x + (dir > 0 ? i : 6 - i), cy - i, 1, i * 2 + 1, 0xf0c838, 0.7);
          R(c, x + (dir > 0 ? -10 : 7), cy - 1, 10, 3, 0xf0c838, 0.7);
        }
      } else {
        R(c, d.x, d.y, 2, d.h, 0xe8b830, 0.85);
        R(c, d.x + d.w - 2, d.y, 2, d.h, 0xe8b830, 0.85);
        for (let y = d.y + 4; y < d.y + d.h; y += 8) R(c, d.x + 1, y, 1, 4, 0x2a2a2a, 0.5);
        for (let y = d.y + 14; y < d.y + d.h - 10; y += 26) {
          foot(c, d.x + 8, y, false, 0xd8a828);
          foot(c, d.x + 16, y + 8, false, 0xd8a828);
        }
        for (let y = d.y + 40; y < d.y + d.h - 20; y += 90) {
          const cx = d.x + d.w / 2;
          for (let i = 0; i < 6; i++) R(c, cx - i, y + (dir > 0 ? i : 6 - i), i * 2 + 1, 1, 0xf0c838, 0.7);
          R(c, cx - 1, y + (dir > 0 ? -10 : 7), 3, 10, 0xf0c838, 0.7);
        }
      }
      for (let k = 0; k < (d.w * d.h) / 40; k++) R(c, d.x + hash2(k, 1, 4220) * d.w, d.y + hash2(k, 2, 4220) * d.h, 1, 1, 0xd8d2c4, 0.6);
      break;
    }
    case "cf_wet":
      E(c, d.x + d.w / 2, d.y + d.h / 2, d.w / 2, d.h / 2, 0x8ab8d8, 0.22);
      E(c, d.x + d.w / 2 - 6, d.y + d.h / 2 - 2, d.w / 4, d.h / 5, 0xffffff, 0.3);
      break;
    case "cf_drain":
      R(c, d.x, d.y, d.w, d.h, 0x5a5e64);
      for (let x = d.x + 2; x < d.x + d.w - 1; x += 3) R(c, x, d.y + 2, 1, d.h - 4, 0x1a1c20);
      break;
    case "cf_carpet":
      R(c, d.x, d.y, d.w, d.h, 0xa82a30);
      R(c, d.x, d.y, 2, d.h, 0xe8c050);
      R(c, d.x + d.w - 2, d.y, 2, d.h, 0xe8c050);
      for (let y = d.y + 6; y < d.y + d.h; y += 12) R(c, d.x + d.w / 2 - 2, y, 4, 4, 0xc83a40);
      break;
  }
}

// ── 벽 ──

/** 위 벽: 방마다 다른 벽 (타일 벽·창·자판기 광고·조리실 후드·특식 현수막). 메뉴판 글씨·층 번호는 실행부가 위에 쓴다 */
export function cafeteriaWall(c: Ctx, l: L): void {
  const v = l.variant;
  const kitchen = v === 5;
  const base = kitchen ? 0xd8dcdc : v === 7 ? 0xe8dcc4 : 0xece4d4;
  R(c, 0, 0, AW, TOP, base);
  // 타일 줄눈 (아래 절반)
  for (let y = 14; y < TOP - 3; y += 5) R(c, 0, y, AW, 1, darken(base, 0.08));
  for (let y = 14; y < TOP - 3; y += 5) for (let x = (y / 5) % 2 ? 0 : 5; x < AW; x += 10) R(c, x, y, 1, 5, darken(base, 0.08));
  R(c, 0, 13, AW, 1, kitchen ? 0x8a9298 : 0x3a8a5a);
  if (v === 2) {
    // 창가: 큰 창 셋 (바깥 하늘과 건물)
    for (const x of [20, 160, 300]) {
      R(c, x, 2, 128, TOP - 6, 0x6a7a8a);
      R(c, x + 2, 4, 124, TOP - 10, 0x9ac8e8);
      for (let k = 0; k < 10; k++) {
        const bx = x + 4 + k * 12;
        const bh = 6 + Math.floor(hash2(k, x, 4230) * 10);
        R(c, bx, TOP - 6 - bh, 10, bh, 0x7a8aa0);
        for (let j = 0; j < bh - 2; j += 3) R(c, bx + 2, TOP - 6 - bh + 2 + j, 2, 1, 0xd8e8f0);
      }
      R(c, x + 63, 4, 2, TOP - 10, 0x6a7a8a);
      R(c, x + 6, 6, 18, 2, 0xffffff, 0.6);
    }
  } else if (v === 3) {
    // 자판기 광고 포스터 + 동전 교환기
    for (const [x, col] of [
      [118, 0xd83a2a],
      [146, 0x2a6ad8],
      [292, 0x3a9a5a],
      [320, 0xe8a030],
    ] as const) {
      R(c, x, 3, 22, 20, col);
      R(c, x + 2, 5, 18, 8, 0xffffff, 0.85);
      E(c, x + 11, 17, 4, 3, 0xffffff, 0.7);
    }
  } else if (kitchen) {
    // 조리실: 스테인리스 후드 + 환풍기
    for (const x of [44, 124, 268, 348]) {
      R(c, x, 0, 56, 14, 0xa8b0b6);
      R(c, x + 4, 14, 48, 3, 0x7a8288);
      for (let i = 0; i < 6; i++) R(c, x + 8 + i * 7, 4, 4, 6, 0x5a6268);
    }
    E(c, 224, 14, 10, 10, 0x6a7278);
    for (let k = 0; k < 4; k++) R(c, 223, 5 + k * 5, 2, 4, 0x2a2e32);
  } else if (v === 7) {
    // 특식: 금색 띠와 붉은 커튼
    for (let x = 0; x < AW; x += 20) {
      R(c, x, 0, 10, 12, 0xa82a30);
      R(c, x + 10, 0, 10, 10, 0xc83a40);
    }
    R(c, 0, 12, AW, 2, 0xe8c050);
  } else {
    // 게시판·시계·포스터
    R(c, 30, 3, 70, 20, 0xb08a5a);
    R(c, 32, 5, 66, 16, 0xd8b888);
    for (const [x, y, col] of [
      [36, 7, 0xf2f2ee],
      [52, 8, 0xf0d860],
      [70, 6, 0x8ad0f0],
      [84, 9, 0xf2f2ee],
    ] as const)
      R(c, x, y, 12, 10, col);
    E(c, 380, 12, 8, 8, 0x3a3a40);
    E(c, 380, 12, 6.5, 6.5, 0xf2f2ee);
    R(c, 380, 7, 1, 5, 0x1a1a1a);
    R(c, 380, 12, 4, 1, 0x1a1a1a);
    // 「잔반 줄이기」 포스터
    R(c, 330, 4, 26, 19, 0x3a9a5a);
    R(c, 332, 6, 22, 7, 0xf2f2ee);
    E(c, 343, 18, 5, 2, 0xf2f2ee);
  }
  // 메뉴판 (글씨는 실행부가)
  const m = CF_MENU;
  R(c, m.x - 2, m.y - 1, m.w + 4, m.h + 3, 0x5a3e22);
  R(c, m.x, m.y + 1, m.w, m.h - 1, 0x1e3a2a);
  R(c, m.x + 2, m.y + 3, 30, 1, 0xf2ead3, 0.5);
  R(c, 0, TOP - 3, AW, 3, kitchen ? 0x8a9298 : 0x9a8a72);
  R(c, 0, TOP - 1, AW, 1, 0x3a3428);
}

export const CF_SIDE: Color = 0x8a7e6a;

// ── 소품 그림 (art.ts PROPS에 펼쳐 넣는다) ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

/** 반찬 칸 (색이 다른 반찬 네 칸) */
const BANCHAN: Color[] = [0xd8302a, 0x3a9a3a, 0xe8c040, 0xf2ead3, 0x8a5a2a, 0xe87a3a];

function counterBase(c: Ctx, w: number, h: number, v: number): void {
  // 스테인리스 배식대: 앞판 + 위판 + 재채기 가림막 유리
  R(c, 0, h - 16, w, 16, 0x9aa4ac);
  R(c, 0, h - 16, w, 1, 0xd8e0e6);
  for (let x = 3; x < w; x += 8) R(c, x, h - 13, 1, 12, 0x7a848c);
  R(c, 0, h - 2, w, 2, 0x4a5258);
  R(c, 0, h - 22, w, 6, 0xc8d0d6);
  R(c, 0, h - 22, w, 1, 0xf2f6f8);
  R(c, 1, h - 30, w - 2, 1, 0xe8f4ff, 0.8);
  R(c, 1, h - 29, w - 2, 7, 0xb8dcf0, 0.18);
  R(c, 2, h - 30, 1, 8, 0xa8b0b8);
  R(c, w - 3, h - 30, 1, 8, 0xa8b0b8);
  void v;
}

export const CF_PROPS: Record<string, PropPaint> = {
  // 배식대 반찬 칸: 반찬통 넷 (색이 다르다) + 국자·집게
  cf_counter(c, w, h, v) {
    counterBase(c, w, h, v);
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 11;
      R(c, x, h - 22, 10, 5, 0x6a747c);
      R(c, x + 1, h - 21, 8, 3, BANCHAN[(i + v) % BANCHAN.length]);
      R(c, x + 2, h - 21, 2, 1, 0xffffff, 0.5);
    }
    R(c, 18, h - 26, 1, 5, 0x8a929a);
  },
  // 국솥 배식대: 큰 은빛 솥 (뚜껑 반쯤 열림, 국 색은 v)
  cf_pot_counter(c, w, h, v) {
    counterBase(c, w, h, v);
    const soup = [0xc8502a, 0xd8a040, 0x8a5a2a, 0xe8d8b0][v % 4];
    R(c, 10, h - 40, 28, 20, 0x8a929a);
    R(c, 10, h - 40, 28, 2, 0xd8e0e6);
    R(c, 12, h - 37, 2, 15, 0xb8c0c8);
    E(c, 24, h - 40, 14, 3, 0x5a6268);
    E(c, 24, h - 40, 12, 2, soup);
    R(c, 18, h - 41, 5, 1, lighten(soup, 0.35));
    R(c, 6, h - 34, 4, 3, 0x5a6268);
    R(c, 38, h - 34, 4, 3, 0x5a6268);
    // 국자 손잡이
    R(c, 30, h - 46, 2, 7, 0x6a4a2a);
    R(c, 29, h - 47, 4, 2, 0x8a6a3a);
  },
  // 4인 테이블: 하얀 상판 + 의자 넷 (위·아래), 식판 하나둘
  cf_table4(c, w, h, v) {
    const chairs = (y: number) => {
      for (const x of [8, w - 16]) {
        R(c, x, y, 8, 6, 0x3a8a5a);
        R(c, x, y, 8, 1, 0x5aaa7a);
        R(c, x + 1, y + 6, 1, 2, 0x2a2e32);
        R(c, x + 6, y + 6, 1, 2, 0x2a2e32);
      }
    };
    chairs(0);
    R(c, 2, 6, w - 4, 16, 0xe8e4dc);
    R(c, 2, 6, w - 4, 1, 0xffffff);
    R(c, 2, 21, w - 4, 2, 0xb8b2a6);
    R(c, 5, 23, 2, 4, 0x6a6e74);
    R(c, w - 7, 23, 2, 4, 0x6a6e74);
    // 식판 (칸 나뉜 스테인리스)
    const tray = (x: number, y: number, k: number) => {
      R(c, x, y, 13, 8, 0xa8b2ba);
      R(c, x, y, 13, 1, 0xd8e0e6);
      R(c, x + 1, y + 1, 4, 3, 0xf6f4ec);
      R(c, x + 6, y + 1, 3, 3, BANCHAN[k % BANCHAN.length]);
      R(c, x + 10, y + 1, 2, 3, BANCHAN[(k + 2) % BANCHAN.length]);
      R(c, x + 1, y + 5, 11, 2, k % 2 ? 0xc8502a : 0xd8b060);
    };
    if (v % 3 !== 2) tray(6, 9, v);
    if (v % 2 === 0) tray(w - 19, 12, v + 1);
    if (v % 3 === 2) {
      R(c, w / 2 - 3, 11, 6, 6, 0xf2f2ee);
      R(c, w / 2 - 2, 12, 4, 2, 0x8a5a2a);
    }
    chairs(h - 8);
  },
  // 창가 바 테이블 (긴 나무 상판 + 컵·식판)
  cf_bar(c, w, h, v) {
    R(c, 0, 4, w, 10, 0xb08050);
    R(c, 0, 4, w, 1, 0xd0a070);
    R(c, 0, 13, w, 2, 0x7a5430);
    for (const x of [4, w - 6]) R(c, x, 15, 2, h - 15, 0x3a3a40);
    for (let k = 0; k < 3; k++) {
      const x = 6 + k * 22 + (v % 5);
      if (hash2(k, v, 4240) < 0.6) {
        R(c, x, 6, 12, 6, 0xa8b2ba);
        R(c, x + 1, 7, 4, 3, 0xf6f4ec);
        R(c, x + 6, 7, 5, 3, BANCHAN[(k + v) % BANCHAN.length]);
      } else {
        R(c, x + 3, 5, 4, 6, 0xf2f2ee);
        R(c, x + 4, 6, 2, 1, 0x6a3a1a);
      }
    }
  },
  cf_stool(c, w, h) {
    E(c, w / 2, 3, 4, 2.5, 0xd84a3a);
    R(c, w / 2 - 1, 4, 2, h - 5, 0x8a929a);
    R(c, 1, h - 2, w - 2, 1, 0x6a7278);
  },
  // 자판기: 커피(갈색)·음료(빨강)·과자(파랑) — 불 켜진 진열창, 동전 투입구, 꺼내는 곳
  cf_vending(c, w, h, v) {
    const body = [0x6a3a24, 0xc8302a, 0x2a5ab0][v % 3];
    R(c, 0, 2, w, h - 2, body);
    R(c, 0, 2, w, 2, lighten(body, 0.3));
    R(c, w - 2, 2, 2, h - 2, darken(body, 0.3));
    R(c, 3, 6, 13, 22, 0x1a1a20);
    R(c, 4, 7, 11, 20, 0xe8f0f8, 0.9);
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 3; i++) {
        const col = v % 3 === 0 ? [0x6a3a1a, 0xf0d8a0, 0x2a2a2a][(i + j) % 3] : v % 3 === 1 ? [0xd8302a, 0x3a9a3a, 0xe8c040, 0x2a6ad8][(i + j) % 4] : [0xe8a030, 0xd83a2a, 0x3a9a5a][(i + j * 2) % 3];
        R(c, 5 + i * 4, 8 + j * 5, 3, 3, col);
        R(c, 4, 11 + j * 5, 11, 1, 0x9aa4ac);
      }
    R(c, 17, 8, 4, 10, 0x2a2a30);
    R(c, 18, 9, 2, 2, 0x3aff6a);
    R(c, 18, 13, 2, 1, 0xd8d0b0);
    R(c, 3, h - 12, 13, 6, 0x141418);
    R(c, 3, h - 2, w - 6, 2, 0x1a1a1a);
  },
  // 정수기: 파란 물통 + 하얀 몸통 + 꼭지 둘
  cf_water(c, w, h) {
    R(c, 2, 9, w - 4, h - 9, 0xe8ecf0);
    R(c, 2, 9, w - 4, 1, 0xffffff);
    E(c, w / 2, 5, 4.5, 5, 0x6ab8e8, 0.9);
    R(c, w / 2 - 3, 2, 2, 5, 0xc8ecff, 0.8);
    R(c, 4, 14, 2, 2, 0xd8302a);
    R(c, w - 6, 14, 2, 2, 0x2a6ad8);
    R(c, 3, 19, w - 6, 3, 0x9aa4ac);
    R(c, 2, h - 2, w - 4, 2, 0x8a929a);
  },
  // 잔반 통 (초록 통 + 음식물 표지)
  cf_waste(c, w, h, v) {
    const col = v ? 0x3a6aa8 : 0x3a8a4a;
    R(c, 3, 6, w - 6, h - 6, col);
    R(c, 2, 4, w - 4, 3, lighten(col, 0.2));
    R(c, 6, 10, w - 12, 5, 0xf2f2ee);
    R(c, 8, 12, w - 16, 1, col);
    R(c, 4, h - 2, w - 8, 2, darken(col, 0.4));
  },
  // 식판 반납 창: 벽에 난 창 + 컨베이어 (식판 그림은 실행부가 흘려 보낸다)
  cf_return(c, w, h) {
    R(c, 0, 0, w, h - 12, 0xd8d0c0);
    R(c, 6, 3, w - 12, 16, 0x2a2a30);
    R(c, 8, 5, w - 16, 12, 0x3a3e44);
    for (let x = 10; x < w - 10; x += 6) R(c, x, 15, 3, 2, 0x5a5e64);
    // 「반납하는 곳」 표지
    R(c, w / 2 - 18, 21, 36, 7, 0x3a9a5a);
    for (let x = w / 2 - 14; x < w / 2 + 14; x += 5) R(c, x, 23, 3, 3, 0xf2f2ee);
    R(c, 0, h - 14, w, 12, 0x5a6268);
    R(c, 0, h - 14, w, 1, 0x9aa4ac);
    R(c, 2, h - 12, w - 4, 7, 0x2a2e32);
    for (let x = 4; x < w - 4; x += 5) R(c, x, h - 12, 1, 7, 0x3a3e44);
    R(c, 0, h - 2, w, 2, 0x3a3e44);
  },
  // 화구 + 큰 국솥 (불꽃은 실행부가 깜빡인다)
  cf_stove(c, w, h, v) {
    R(c, 0, h - 18, w, 18, 0x6a7278);
    R(c, 0, h - 18, w, 2, 0xa8b0b6);
    R(c, 3, h - 10, 8, 6, 0x2a2e32);
    R(c, w - 11, h - 10, 8, 6, 0x2a2e32);
    for (let i = 0; i < 3; i++) E(c, 16 + i * 4, h - 7, 1.5, 1.5, 0xd8302a);
    R(c, 0, h - 2, w, 2, 0x2a2e32);
    const soup = [0xc8502a, 0xd8a040, 0x8a5a2a, 0xe8d8b0][v % 4];
    R(c, 5, h - 42, 30, 24, 0x7a848c);
    R(c, 5, h - 42, 30, 2, 0xc8d0d6);
    R(c, 8, h - 39, 2, 19, 0xa8b0b8);
    E(c, 20, h - 42, 15, 3.5, 0x4a5258);
    E(c, 20, h - 42, 13, 2.5, soup);
    R(c, 13, h - 43, 6, 1, lighten(soup, 0.4));
    R(c, 1, h - 36, 4, 3, 0x4a5258);
    R(c, 35, h - 36, 4, 3, 0x4a5258);
  },
  // 스테인리스 작업대: 도마·칼·양파 바구니
  cf_prep(c, w, h, v) {
    R(c, 0, 4, w, 12, 0xb8c0c8);
    R(c, 0, 4, w, 1, 0xe8f0f4);
    R(c, 0, 15, w, 2, 0x7a848c);
    for (const x of [2, w - 4]) R(c, x, 17, 2, h - 17, 0x6a7278);
    R(c, 2, h - 6, w - 4, 1, 0x8a929a);
    R(c, 8, 6, 16, 8, 0xd8b080);
    R(c, 12, 8, 8, 1, 0xf2f2ee);
    R(c, 26, 7, 10, 1, 0xd8dce0);
    R(c, 36, 6, 3, 3, 0x2a2a2a);
    for (let i = 0; i < 4; i++) E(c, 44 + (i % 2) * 4, 8 + Math.floor(i / 2) * 3, 2, 2, v % 2 ? 0xe8c070 : 0xd84a3a);
  },
  // 샐러드 바: 긴 섬 + 가림막 + 채소 칸 여섯
  cf_salad(c, w, h, v) {
    R(c, 0, h - 18, w, 18, 0x3a7a4a);
    R(c, 0, h - 18, w, 2, 0x6aaa7a);
    for (let x = 4; x < w; x += 10) R(c, x, h - 14, 1, 12, 0x2a5a3a);
    R(c, 0, h - 2, w, 2, 0x1a3a22);
    R(c, 0, h - 26, w, 8, 0xc8d0d6);
    R(c, 0, h - 26, w, 1, 0xf2f6f8);
    const veg: Color[] = [0x5ab84a, 0xd8302a, 0xf0d040, 0xe87a2a, 0x8a3a8a, 0xf2f2ee];
    for (let i = 0; i < 9; i++) {
      const x = 4 + i * 13;
      R(c, x, h - 25, 12, 6, 0x6a747c);
      for (let k = 0; k < 9; k++) R(c, x + 1 + (k % 5) * 2, h - 24 + Math.floor(k / 5) * 2, 2, 2, veg[(i + v + (k % 2)) % veg.length]);
    }
    R(c, 2, h - 40, w - 4, 1, 0xe8f4ff, 0.8);
    R(c, 2, h - 39, w - 4, 12, 0xb8dcf0, 0.15);
    for (const x of [2, w / 2, w - 3]) R(c, x, h - 40, 1, 14, 0xa8b0b8);
  },
  // 둥근 기둥 + 「오늘의 특식」 포스터
  cf_pillar(c, w, h) {
    R(c, 2, 4, w - 4, h - 6, 0xe8dcc4);
    R(c, 2, 4, 3, h - 6, 0xf6eedc);
    R(c, w - 5, 4, 3, h - 6, 0xc8b89c);
    R(c, 0, 0, w, 5, 0xc8b89c);
    R(c, 0, h - 4, w, 4, 0x8a7a5e);
    R(c, 4, 14, w - 8, 14, 0xc83a40);
    R(c, 5, 15, w - 10, 5, 0xf2ead3);
    E(c, w / 2, 24, 3, 2, 0xe8c050);
  },
  // 식판·수저 거치대: 쌓인 식판 + 수저통
  cf_tray_rack(c, w, h) {
    R(c, 1, h - 12, w - 2, 12, 0x6a7278);
    R(c, 1, h - 2, w - 2, 2, 0x3a3e44);
    for (let k = 0; k < 7; k++) {
      R(c, 2, h - 14 - k * 2, 13, 2, k % 2 ? 0xa8b2ba : 0xc8d0d6);
    }
    R(c, 16, h - 22, 5, 10, 0x8a929a);
    for (let i = 0; i < 3; i++) R(c, 16 + i * 2, h - 27 + (i % 2), 1, 6, i % 2 ? 0xd8dce0 : 0xc8a46a);
  },
};

/** 층 번호 표지·메뉴판에 쓰는 도트 숫자 (층 번호) */
export { digits };
