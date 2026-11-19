import type { MapConcept } from "@/lib/mapConcept";
import { isTowerZoneId, type ZoneId } from "@/lib/rpg/catalog";
import { css, darken, Grid, hash2, lighten, makeCanvas, mix, vnoise, type Color } from "../../sprites/pixel";
import { doorWreath, SNOW, snowCap, snowman, SNOWMAN_H, type Bulb } from "../../sprites/winterArt";
import { drawBulbs, miniXmasTree, snowField, XMAS_BULBS } from "../../sprites/winterScenery";
import { CF_MENU } from "../../tower/themes/cafeteriaMap";
import { EX_TOP, exWindows } from "../../tower/themes/execMap";
import { MT_WALL_H } from "../../tower/themes/meetingRoomArt";
import { AH, AW, inRegion, PROP_META, SIDE, standable, TOP, type ArenaLayout, type Solid } from "./layout";

// 11/17 사냥터·야근 빌딩 겨울판·크리스마스판 그림 (캔버스 2D, Phaser 없이 — 로비 미리보기도 같은 함수로 그린다).
// 몬스터·판정·충돌·기믹 구역은 그대로이고 겉모습만 바꾼다:
//  - 바깥 사냥터(결재 늪·방학 숙제 사막·12월 31일 축제장·옥상 정원): 바닥을 눈밭으로(원래 무늬는 밝기 차이로 눈 결에 남는다, 기믹 구역은 그대로),
//    소품 윗면에 눈, 눈사람. 크리스마스면 하늘에 전구 줄·작은 트리·선물 더미·소품에 전구와 리본
//  - 실내(사무실·빌딩): 창밖 눈(창턱 눈 둔덕·서리·종이 눈송이 — 내리는 눈은 실행부가), 히터·외투 걸이·의자 담요.
//    크리스마스면 벽 위 솔잎 줄과 전구·리스, 파티션·선반 위 전구, 책상 위 작은 트리, 모니터 산타 모자, 구석 트리와 선물 상자, 구내식당 특식
// 전구 자리(Bulb)는 그림 좌표로 돌려준다 — 실행부(conceptStage)가 빛 두 장을 번갈아 띄워 반짝인다.

type Ctx = CanvasRenderingContext2D;
export type Rect = { x: number; y: number; w: number; h: number };

const OUT = 0x1f1d1a;
const WIRE = 0x2a2622;

// ── 사냥터마다 ──

type Look = {
  /** 바깥 (바닥에 눈이 쌓이고 내린다, 입김) */
  outdoor?: boolean;
  /** 위 벽 높이 (전구 줄·리스를 거는 높이) */
  wallH?: number;
  /** 바깥이 보이는 창 (안쪽 유리 — 서리·창턱 눈·내리는 눈) */
  windows?: (v: number) => Rect[];
  /** 서리만 끼는 창 (지하 터널 같은 것) */
  frost?: Rect[];
  /** 창밖이 밤 */
  night?: boolean;
  /** 사무실 창에 붙인 종이 눈송이 */
  paper?: boolean;
  /** 벽에 리스를 걸지 않는다 (벽 그림을 실행부가 따로 깔 때) */
  noWreath?: boolean;
  /** 리스를 피할 벽 자리 (실행부가 글씨를 쓰는 판) */
  avoid?: Rect[];
};

const SUBWAY_WINDOWS: Rect[] = [];
for (const [x0, x1] of [
  [SIDE + 6, 90],
  [136, 312],
  [360, AW - SIDE - 6],
])
  for (let x = x0; x < x1 - 30; x += 44) SUBWAY_WINDOWS.push({ x: x + 2, y: 8, w: 34, h: 10 });

const LOOK: Partial<Record<ZoneId, Look>> = {
  "meeting-room": {
    windows: () => [
      { x: 32, y: 5, w: 74, h: 14 },
      { x: 342, y: 5, w: 74, h: 14 },
    ],
    paper: true,
  },
  subway: { frost: SUBWAY_WINDOWS },
  "legacy-forest": { windows: () => [{ x: 62, y: 2, w: AW - 124, h: TOP - 6 }], night: true, paper: true },
  library: { windows: () => [60, 150, 298, 388].map((x) => ({ x: x - 12, y: 8, w: 24, h: TOP - 11 })), night: true },
  "deadline-swamp": { outdoor: true },
  "homework-desert": { outdoor: true },
  "new-year-eve": { outdoor: true },
  "quarter-close": { windows: () => [{ x: 26, y: 2, w: 296, h: TOP - 6 }], night: true, paper: true },
  cf_cafeteria: { windows: (v) => (v === 2 ? [20, 160, 300].map((x) => ({ x: x + 2, y: 4, w: 124, h: TOP - 10 })) : []), paper: true, avoid: [{ x: CF_MENU.x - 4, y: 0, w: CF_MENU.w + 8, h: TOP }] },
  rf_rooftop: { outdoor: true },
  ex_exec: { wallH: EX_TOP, windows: (v) => exWindows(v) },
  // 끝없는 회의실 창은 층마다 다른 방 그림(MeetingArena)이 직접 겨울로 그린다
  mt_meeting: { wallH: MT_WALL_H, noWreath: true },
};

/** 바깥 사냥터 (눈밭·눈 내림·입김) */
export const isOutdoorZone = (z: ZoneId): boolean => !!LOOK[z]?.outdoor;
/** 위 벽 높이 */
export const wallHeight = (z: ZoneId): number => LOOK[z]?.wallH ?? TOP;
/** 바깥이 보이는 창 (내리는 눈을 흘릴 자리) */
export const zoneWindows = (z: ZoneId, v: number): Rect[] => LOOK[z]?.windows?.(v) ?? [];
export const zoneNight = (z: ZoneId): boolean => !!LOOK[z]?.night;

/** 분위기 곱하기 색: 바깥 겨울은 차갑게 (실내는 그대로 — 난방된 사무실) */
export function conceptAmbient(z: ZoneId, tone: { color: Color; alpha: number }, c: MapConcept): { color: Color; alpha: number } {
  if (c === "default" || !isOutdoorZone(z)) return tone;
  return { color: mix(tone.color, 0xc4d4ec, 0.55), alpha: Math.max(tone.alpha, 0.12) };
}

/** 떠다니는 입자 색 (사막 모래바람 → 눈보라, 늪 반딧불 → 눈 반짝임) */
export function conceptParticleColors(z: ZoneId, cols: Color[], c: MapConcept): Color[] {
  if (c === "default") return cols;
  if (z === "homework-desert") return [0xf4f8ff, 0xe2eaf4, 0xf0dca0];
  if (z === "deadline-swamp") return [0xdff0ff, 0xb8d8f8];
  return cols;
}

// ── 바닥 ──

const lumOf = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/**
 * 바깥 바닥을 눈밭으로 (mask 안은 그대로 — 웅덩이·고무 매트 같은 기믹 무늬). 원래 무늬는 밝기 차이로 눈 결에 남고,
 * 군데군데 땅이 비쳐 보인다
 */
export function snowGround(ctx: Ctx, mask: readonly Rect[], salt: number): void {
  const img = ctx.getImageData(0, 0, AW, AH);
  const d = img.data;
  const skip = new Uint8Array(AW * AH);
  for (const r of mask)
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(AH, Math.ceil(r.y + r.h)); y++)
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(AW, Math.ceil(r.x + r.w)); x++) skip[y * AW + x] = 1;
  let sum = 0;
  let n = 0;
  for (let y = TOP; y < AH; y += 2)
    for (let x = 0; x < AW; x += 2) {
      const i = (y * AW + x) * 4;
      sum += lumOf(d[i], d[i + 1], d[i + 2]);
      n++;
    }
  const mean = Math.max(1, sum / Math.max(1, n));
  for (let y = 0; y < AH; y++)
    for (let x = 0; x < AW; x++) {
      const p = y * AW + x;
      if (skip[p]) continue;
      const i = p * 4;
      const orig = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      const ratio = Math.max(0.55, Math.min(1.5, lumOf(d[i], d[i + 1], d[i + 2]) / mean));
      const s = snowField(1 + (ratio - 1) * 0.55, x, y);
      const bare = vnoise(x, y, 26, salt);
      const c = bare < 0.12 ? mix(orig, s, 0.6 + bare * 3.3) : s;
      d[i] = (c >> 16) & 255;
      d[i + 1] = (c >> 8) & 255;
      d[i + 2] = c & 255;
    }
  ctx.putImageData(img, 0, 0);
}

/** 바닥 무늬(모래 언덕·광장 무늬)에 눈: 거의 눈으로 덮되 밝기 차이로 모양은 남는다 */
export function dustSnow(src: HTMLCanvasElement): void {
  const ctx = src.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let p = 0; p < src.width * src.height; p++) {
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const x = p % src.width;
    const y = (p - x) / src.width;
    const orig = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const ratio = Math.max(0.6, Math.min(1.3, lumOf(d[i], d[i + 1], d[i + 2]) / 150));
    const c = mix(orig, snowField(1 + (ratio - 1) * 0.7, x, y), 0.82);
    d[i] = (c >> 16) & 255;
    d[i + 1] = (c >> 8) & 255;
    d[i + 2] = c & 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ── 벽 겹 (창 서리·창턱 눈·전구 줄·리스) ──

const SNOWFLAKE = ["...x...", ".x.x.x.", "..xxx..", "xxx.xxx", "..xxx..", ".x.x.x.", "...x..."];

/** 창 하나를 겨울로: 멈춘 눈송이 · 네 귀퉁이 서리 · 가장자리 결정 · 창턱 눈 둔덕 · (사무실) 종이 눈송이 */
export function windowWinter(c: Ctx, r: Rect, o: { night: boolean; salt: number; paper?: boolean; frostOnly?: boolean }): void {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  if (!o.frostOnly)
    for (let i = 0; i < (r.w * r.h) / 34; i++) {
      const x = r.x + Math.floor(hash2(i, 1, o.salt) * r.w);
      const y = r.y + Math.floor(hash2(i, 2, o.salt) * r.h);
      c.fillStyle = css(0xffffff, (o.night ? 0.45 : 0.6) + hash2(i, 3, o.salt) * 0.35);
      c.fillRect(x, y, hash2(i, 4, o.salt) < 0.15 ? 2 : 1, 1);
    }
  const R = Math.max(5, Math.min(r.h * 0.95, 18));
  for (const [cx, cy] of [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, "rgba(238,247,255,0.8)");
    g.addColorStop(0.45, "rgba(222,238,252,0.32)");
    g.addColorStop(1, "rgba(222,238,252,0)");
    c.fillStyle = g;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  // 가장자리 서리 결정 (바깥 3px 띠에 듬성듬성)
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const e = Math.min(x - r.x, r.x + r.w - 1 - x, y - r.y, r.y + r.h - 1 - y);
      if (e > 2) continue;
      if (hash2(x, y, o.salt + 5) < 0.42 - e * 0.12) {
        c.fillStyle = css(0xf2f8ff, 0.55 + hash2(x, y, o.salt + 6) * 0.35);
        c.fillRect(x, y, 1, 1);
      }
    }
  if (!o.frostOnly) {
    // 창턱 눈 둔덕 (바닥 줄부터 1~3px)
    const by = r.y + r.h - 1;
    for (let x = r.x; x < r.x + r.w; x++) {
      const hgt = 1 + Math.floor(vnoise(x, 0, 9, o.salt) * 3);
      for (let k = 0; k < hgt; k++) {
        c.fillStyle = css(k === hgt - 1 ? SNOW.hi : k === 0 ? SNOW.lo : SNOW.mid);
        c.fillRect(x, by - k, 1, 1);
      }
    }
    // 종이 눈송이 (넓은 창이면 둘)
    if (o.paper && r.h >= 9) {
      const n = r.w > 90 ? 2 : r.w > 40 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const fx = r.x + Math.round(r.w * (0.2 + 0.6 * ((k + hash2(k, 7, o.salt) * 0.6) / Math.max(1, n))));
        const fy = r.y + Math.max(1, Math.round((r.h - 7) * (0.3 + hash2(k, 8, o.salt) * 0.3)));
        for (const [j, row] of SNOWFLAKE.entries())
          for (let i = 0; i < row.length; i++)
            if (row[i] === "x") {
              c.fillStyle = css(j === 3 && i === 3 ? 0xdfe9f4 : 0xfdfdfd);
              c.fillRect(fx + i - 3, fy + j, 1, 1);
            }
      }
    }
  }
  c.restore();
}

/** 벽 위 솔잎 줄 (늘어진 줄을 이어 붙이고 고리마다 빨간 리본, 줄마다 전구). 전구 자리를 돌려준다 */
function garland(c: Ctx, w: number, y0: number, gap: number, sag: number, salt: number): Bulb[] {
  const bulbs: Bulb[] = [];
  const px = (x: number, y: number, col: Color, a = 1) => {
    c.fillStyle = css(col, a);
    c.fillRect(x, y, 1, 1);
  };
  const hooks: number[] = [];
  for (let x0 = 2; x0 < w - 6; x0 += gap) {
    const x1 = Math.min(w - 2, x0 + gap);
    hooks.push(x0);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const y = Math.round(y0 + sag * 4 * t * (1 - t));
      const h = hash2(x, y, salt);
      px(x, y - 1, h < 0.35 ? 0x4e8c58 : 0x2b5a36);
      px(x, y, h < 0.5 ? 0x3e7a48 : 0x2f6a3e);
      px(x, y + 1, h < 0.4 ? 0x23482c : 0x2b5a36);
      if (h > 0.86) px(x, y + 2, 0x23482c);
      // 금빛 반짝이 몇 점
      if (hash2(x, y, salt + 1) < 0.08) px(x, y, 0xf2d060);
      if ((x - x0) % 6 === 3 && t > 0.06 && t < 0.94) bulbs.push({ x, y: y + 2, c: XMAS_BULBS[bulbs.length % XMAS_BULBS.length] });
    }
  }
  hooks.push(Math.min(w - 2, hooks[hooks.length - 1] + gap));
  // 고리 리본 (빨강 나비 + 늘어진 꼬리) · 가끔 금빛 방울
  for (const [i, x] of hooks.entries()) {
    const y = y0 - 1;
    for (const [dx, dy, col] of [
      [-2, 0, 0xd8323a],
      [-1, 0, 0xf04a4a],
      [-2, 1, 0xb82a30],
      [0, 0, 0xffe0e0],
      [1, 0, 0xf04a4a],
      [2, 0, 0xd8323a],
      [2, 1, 0xb82a30],
      [-1, 2, 0xd8323a],
      [1, 2, 0xd8323a],
      [-1, 3, 0xb82a30],
      [1, 3, 0xb82a30],
    ] as const)
      px(x + dx, y + dy, col);
    if (i % 2 === 1) {
      const col = i % 4 === 1 ? 0xf2c040 : 0xd8323a;
      px(x, y + 4, 0x6a6058);
      px(x, y + 5, lighten(col, 0.35));
      px(x - 1, y + 6, col);
      px(x, y + 6, lighten(col, 0.2));
      px(x + 1, y + 6, col);
      px(x, y + 7, darken(col, 0.25));
    }
  }
  return bulbs;
}

/** 바깥 하늘에 건 전구 줄 (전선 + 전구만, 늘어진 줄을 이어 붙인다) */
function skyString(c: Ctx, w: number, y0: number, gap: number, sag: number): Bulb[] {
  const bulbs: Bulb[] = [];
  for (let x0 = -4; x0 < w; x0 += gap) {
    const x1 = x0 + gap;
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= w) continue;
      const t = (x - x0) / gap;
      const y = Math.round(y0 + sag * 4 * t * (1 - t));
      c.fillStyle = css(WIRE);
      c.fillRect(x, y, 1, 1);
      if ((x - x0) % 7 === 3 && t > 0.05 && t < 0.95) {
        const b = { x, y: y + 1, c: XMAS_BULBS[bulbs.length % XMAS_BULBS.length] };
        bulbs.push(b);
      }
    }
  }
  return bulbs;
}

/** 벽의 밋밋한 자리 (리스를 걸 곳): 13×13 칸의 밝기 흩어짐이 작은 곳, 창과 겹치지 않게, 서로 멀리 */
function plainSpots(floor: HTMLCanvasElement, wallH: number, avoid: readonly Rect[], want: number): { x: number; y: number }[] {
  const ctx = floor.getContext("2d", { willReadFrequently: true });
  if (!ctx || wallH < 18) return [];
  const y = Math.max(2, Math.round((wallH - 14) / 2));
  const d = ctx.getImageData(0, y, AW, 13).data;
  const cand: { x: number; s: number }[] = [];
  for (let x = SIDE + 14; x < AW - SIDE - 26; x += 3) {
    if (avoid.some((r) => x + 13 > r.x - 3 && x < r.x + r.w + 3 && y + 13 > r.y && y < r.y + r.h)) continue;
    let s1 = 0;
    let s2 = 0;
    for (let j = 0; j < 13; j++)
      for (let i = 0; i < 13; i++) {
        const k = (j * AW + x + i) * 4;
        const L = lumOf(d[k], d[k + 1], d[k + 2]);
        s1 += L;
        s2 += L * L;
      }
    const m = s1 / 169;
    cand.push({ x, s: s2 / 169 - m * m });
  }
  cand.sort((a, b) => a.s - b.s);
  const out: { x: number; y: number }[] = [];
  for (const c of cand) {
    if (c.s > 160) break;
    if (out.some((o) => Math.abs(o.x - c.x) < 110)) continue;
    out.push({ x: c.x, y });
    if (out.length >= want) break;
  }
  return out;
}

/**
 * 벽 겹 한 장 (AW × 벽 높이+12, 투명 바탕): 창 서리·창턱 눈·종이 눈송이, 크리스마스면 솔잎 줄(실내)·하늘 전구 줄(바깥)·리스.
 * floor = 같은 판 바닥 그림 (리스 걸 밋밋한 자리를 찾는다)
 */
export function wallOverlay(l: ArenaLayout, concept: MapConcept, floor: HTMLCanvasElement): { canvas: HTMLCanvasElement; bulbs: Bulb[] } {
  const look = LOOK[l.zone] ?? {};
  const wallH = look.wallH ?? TOP;
  const { canvas, ctx } = makeCanvas(AW, wallH + 12);
  const bulbs: Bulb[] = [];
  if (concept === "default") return { canvas, bulbs };
  const wins = look.windows?.(l.variant) ?? [];
  for (const [i, r] of wins.entries()) windowWinter(ctx, r, { night: !!look.night, salt: 300 + i * 17 + l.variant, paper: look.paper });
  for (const [i, r] of (look.frost ?? []).entries()) windowWinter(ctx, r, { night: true, salt: 400 + i * 13, frostOnly: true });
  if (concept === "christmas") {
    if (look.outdoor) bulbs.push(...skyString(ctx, AW, 2, 56, 6));
    else {
      bulbs.push(...garland(ctx, AW, 2, 64, 4, 811 + l.variant));
      for (const s of look.noWreath ? [] : plainSpots(floor, wallH, [...wins, ...(look.avoid ?? [])], 2)) {
        ctx.drawImage(doorWreath(), s.x + 1, s.y + 1);
        ctx.fillStyle = css(0x6a6058);
        ctx.fillRect(s.x + 6, 3, 1, Math.max(0, s.y - 2));
      }
    }
  }
  drawBulbs(canvas, bulbs);
  return { canvas, bulbs };
}

// ── 소품 손질 ──

/** 손질한 소품 그림은 위로 이만큼 키운다 (모자·트리·눈이 그림 밖으로 나가지 않게, 원점은 바닥 가운데 그대로) */
export const PROP_PAD = 10;

type Role = {
  /** 윗면에 늘어진 전구 줄 */
  lights?: boolean;
  /** 모니터 [왼쪽 x, 윗면 y, 폭] — 산타 모자 */
  hats?: readonly (readonly [number, number, number])[];
  /** 책상 위 작은 트리 (가로 자리 비율) */
  tree?: number;
  /** 의자·소파 담요 */
  seat?: boolean;
  /** 잎에 전구 + 꼭대기 별 */
  plant?: boolean;
  /** 마른 가지에 전구 */
  branches?: boolean;
  /** 기둥에 사탕 지팡이 리본 */
  pole?: boolean;
  /** 기둥 가운데 리스 */
  wreath?: boolean;
  /** 배식대 위 크리스마스 특식 */
  food?: boolean;
  /** 실내라도 윗면 눈 (밖에서 들어온 차) */
  snow?: boolean;
};

const ROLES: Record<string, Role> = {
  plant: { plant: true },
  palm: { plant: true },
  conf_table: { tree: 0.82 },
  chair: { seat: true },
  bench_seat: { seat: true },
  pole: { pole: true },
  dumbbell_rack: { lights: true },
  treadmill_head: { hats: [[1, 0, 12]] },
  cubicle: {
    lights: true,
    hats: [
      [10, 10, 16],
      [-26, 10, 16],
    ],
  },
  bookshelf: { lights: true },
  read_table: { tree: 0.5 },
  gondola: { lights: true },
  dead_tree: { branches: true },
  cactus: { plant: true },
  pub_table: { tree: 0.5 },
  crates: { lights: true },
  stall: { lights: true },
  lantern_post: { pole: true },
  light_tree: { plant: true },
  night_desk: {
    hats: [
      [6, 2, 15],
      [-22, 2, 15],
    ],
    tree: 0.6,
  },
  file_cabinet: { lights: true },
  empty_desk: { tree: 0.25 },
  // 야근 빌딩
  sv_rack: { lights: true },
  sv_rack_v: { lights: true },
  sv_patch: { lights: true },
  sv_noc_desk: { tree: 0.15 },
  sv_tape_shelf: { lights: true },
  sv_mainframe: { lights: true },
  sv_chair: { seat: true },
  pk_car: { snow: true },
  pk_car_side: { snow: true },
  pk_wreck: { snow: true },
  pk_pillar: { wreath: true },
  pk_booth: { lights: true },
  cf_counter: { food: true },
  cf_pot_counter: { food: true },
  cf_salad: { food: true },
  cf_prep: { food: true },
  cf_bar: { tree: 0.5 },
  cf_vending: { lights: true },
  cf_return: { lights: true },
  cf_pillar: { wreath: true },
  rf_planter_box: { plant: true },
  rf_shrub: { plant: true },
  rf_pot: { plant: true },
  rf_tank: { lights: true },
  rf_lamp: { pole: true },
  rf_shelter: { lights: true },
  rf_bed: { plant: true },
  rf_shed: { lights: true },
  rf_scarecrow: { hats: [[7, 1, 8]] },
  rf_pole: { pole: true },
  rf_sign: { lights: true },
  ex_sec_desk: { tree: 0.8 },
  ex_trophy_case: { lights: true },
  ex_sofa: { seat: true },
  ex_armchair: { seat: true },
  ex_coffee_table: { tree: 0.5 },
  ex_bar: { lights: true },
  ex_board_table: { tree: 0.5 },
  ex_exec_desk: { tree: 0.85 },
  ex_bookshelf: { lights: true },
  ex_bonsai_stand: { plant: true },
  ex_ceo_desk: { tree: 0.12 },
  ex_pillar: { wreath: true },
  ex_plant: { plant: true },
  ex_piano: { lights: true },
  ex_conf_chair: { seat: true },
  // 끝없는 회의실 가구 (meetingRoomArena가 mt_ 를 붙여 부른다)
  mt_long_table: { tree: 0.5 },
  mt_round_table: { tree: 0.5 },
  mt_chair: { seat: true },
  mt_desk_pod: { tree: 0.3 },
  mt_sofa: { seat: true },
  mt_plant: { plant: true },
  mt_cafe_table: { tree: 0.5 },
  mt_counter: { lights: true },
  mt_vending: { lights: true },
  mt_booth: { lights: true },
  mt_credenza: { tree: 0.7 },
  mt_bench_row: { lights: true },
  mt_lectern: { tree: 0.5 },
  mt_podium: { wreath: true },
  mt_board_stand: { lights: true },
};

type Img = { w: number; h: number; d: Uint8ClampedArray };
const solidAt = (m: Img, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.d[(y * m.w + x) * 4 + 3] >= 200;
function put(m: Img, x: number, y: number, c: Color, a = 255): void {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = (y * m.w + x) * 4;
  m.d[i] = (c >> 16) & 255;
  m.d[i + 1] = (c >> 8) & 255;
  m.d[i + 2] = c & 255;
  m.d[i + 3] = a;
}
const rgbAt = (m: Img, x: number, y: number): Color => {
  const i = (y * m.w + x) * 4;
  return (m.d[i] << 16) | (m.d[i + 1] << 8) | m.d[i + 2];
};
/** x 줄의 맨 위 불투명 픽셀 (없으면 -1) */
function topAt(m: Img, x: number, maxY = m.h): number {
  for (let y = 0; y < maxY; y++) if (solidAt(m, x, y)) return y;
  return -1;
}
function drawGrid(m: Img, g: Grid, ox: number, oy: number): void {
  const c = g.toCanvas();
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i + 3] < 128) continue;
      put(m, ox + x, oy + y, (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], d[i + 3]);
    }
}

/** 산타 모자 (8×7, 끝이 오른쪽으로 늘어진다) */
function santaHat(): Grid {
  const g = new Grid(9, 7);
  for (const [y, x0, x1] of [
    [0, 5, 6],
    [1, 4, 6],
    [2, 3, 6],
    [3, 2, 6],
    [4, 1, 6],
  ] as const)
    for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 ? 0xf04a4a : y < 2 ? 0xb82a30 : 0xd8323a);
  g.set(7, 1, 0xd8323a);
  g.set(7, 2, 0xffffff);
  g.set(8, 2, 0xe8eef4);
  g.set(8, 3, 0xffffff);
  g.hline(0, 7, 5, 0xffffff);
  g.hline(0, 7, 6, 0xdfe6ee);
  g.outline(OUT, false, 200);
  return g;
}

/** 책상 위 작은 트리 (9×14): 별 · 세 층 잎 · 화분. 전구 자리는 그림 좌표 */
function deskTree(): { g: Grid; bulbs: Bulb[] } {
  const g = new Grid(9, 14);
  const cx = 4;
  // 줄마다 잎 반폭 (세 층이 겹친 모양)
  const half = [0, 1, 2, 1, 2, 3, 2, 3, 4];
  for (const [i, hw] of half.entries()) for (let x = cx - hw; x <= cx + hw; x++) g.set(x, 2 + i, x < cx ? 0x3e7a48 : 0x2b5a36);
  g.rect(3, 11, 3, 2, 0xb83a30);
  g.hline(2, 6, 11, 0xd8463c);
  g.outline(OUT, false, 200);
  g.set(cx, 0, 0xfff2a8);
  g.set(cx - 1, 1, 0xf2c040);
  g.set(cx, 1, 0xfff2a8);
  g.set(cx + 1, 1, 0xf2c040);
  const bulbs: Bulb[] = [
    { x: 3, y: 4, c: XMAS_BULBS[0] },
    { x: 5, y: 6, c: XMAS_BULBS[1] },
    { x: 2, y: 8, c: XMAS_BULBS[2] },
    { x: 6, y: 9, c: XMAS_BULBS[4] },
    { x: 4, y: 9, c: XMAS_BULBS[3] },
  ];
  for (const b of bulbs) g.set(b.x, b.y, b.c);
  return { g, bulbs };
}

/** 크리스마스 특식 접시: 0 = 통닭구이, 1 = 딸기 케이크, 2 = 지팡이 사탕 컵 */
function feastDish(k: number): Grid {
  if (k === 0) {
    const g = new Grid(11, 7);
    g.ellipse(5, 5.5, 5.4, 1.5, 0xf2f2ee);
    g.ellipse(5, 3.5, 3.8, 2.6, 0xb8662a);
    g.ellipse(4.5, 2.8, 2.4, 1.4, 0xd88a44);
    g.set(3, 2, 0xf0b070);
    g.set(9, 2, 0xf2ead3);
    g.set(8, 3, 0xb8662a);
    g.set(1, 2, 0xf2ead3);
    g.set(2, 3, 0xb8662a);
    g.set(5, 6, 0x5ab04a);
    g.set(7, 6, 0xd8323a);
    g.outline(OUT, false, 200);
    return g;
  }
  if (k === 1) {
    const g = new Grid(9, 8);
    g.ellipse(4, 6.5, 4.4, 1.2, 0xf2f2ee);
    g.rect(1, 2, 7, 4, 0xfaf4ec);
    g.hline(1, 7, 4, 0xf08ab0);
    g.hline(1, 7, 2, 0xffffff);
    g.set(2, 1, 0xd8323a);
    g.set(4, 1, 0xd8323a);
    g.set(6, 1, 0xd8323a);
    g.set(4, 0, 0x5ab04a);
    g.outline(OUT, false, 200);
    return g;
  }
  const g = new Grid(7, 9);
  g.rect(1, 4, 5, 4, 0x3a8a4a);
  g.hline(1, 5, 4, 0x5ab04a);
  for (const x of [2, 4]) {
    g.vline(x, 1, 4, 0xffffff);
    g.set(x + 1, 0, 0xffffff);
    g.set(x, 2, 0xd8323a);
    g.set(x + 1, 1, 0xd8323a);
  }
  g.outline(OUT, false, 200);
  return g;
}

const BLANKETS: readonly [Color, Color][] = [
  [0xb8443c, 0xe8d8c0],
  [0x3e7a48, 0xd8323a],
  [0xe8dcc0, 0x7a5a3a],
  [0x3a4a7a, 0xe8e0d0],
];

/**
 * 소품 그림 한 장을 이 판으로 (원본은 그대로). 위로 PROP_PAD만큼 키운 새 캔버스와 전구 자리(새 캔버스 좌표)를 돌려준다.
 * flip = 원본이 좌우로 뒤집혀 그려졌나 (모니터 자리를 거울로)
 */
export function dressProp(src: HTMLCanvasElement, kind: string, v: number, flip: boolean, zone: ZoneId, concept: MapConcept): { canvas: HTMLCanvasElement; bulbs: Bulb[] } {
  const W = src.width;
  const H = src.height + PROP_PAD;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.drawImage(src, 0, PROP_PAD);
  const bulbs: Bulb[] = [];
  if (concept === "default") return { canvas, bulbs };
  const role = ROLES[kind] ?? {};
  const out = isOutdoorZone(zone);
  const xmas = concept === "christmas";
  const salt = (v * 31 + kind.length * 7) | 0;
  let cur = canvas;
  // 윗면 눈 (바깥 소품 · 밖에서 들어온 차)
  if (out || role.snow) cur = snowCap(cur, { depth: 2, maxY: H - 2, seed: 70 + salt });
  const c2 = cur.getContext("2d", { willReadFrequently: true })!;
  const img = c2.getImageData(0, 0, W, H);
  const m: Img = { w: W, h: H, d: img.data };
  const mx = (x: number, w: number) => (flip ? W - x - w : x);
  // 담요 (실내 의자·소파): 윗부분에 체크무늬 담요를 걸친다
  // (의자는 절반쯤만 — 종류·모양마다 정해진다)
  if (role.seat && !out && (!kind.includes("chair") || hash2(v, kind.length, 77) < 0.55)) {
    const [a, b] = BLANKETS[(v + kind.length) % BLANKETS.length];
    let x0 = W;
    let x1 = -1;
    let y0 = H;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (solidAt(m, x, y)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
        }
    if (x1 > x0) {
      const bw = Math.max(4, Math.round((x1 - x0 + 1) * (W > 30 ? 0.42 : 0.8)));
      const bx = W > 30 ? x0 + Math.round((x1 - x0 + 1 - bw) * (v % 2 ? 0.15 : 0.85)) : x0 + Math.round((x1 - x0 + 1 - bw) / 2);
      const bh = Math.min(7, Math.max(4, Math.round((H - PROP_PAD) * 0.4)));
      for (let y = y0; y < y0 + bh; y++)
        for (let x = bx; x < bx + bw; x++) {
          if (!solidAt(m, x, y) && !(y > y0 && solidAt(m, x, y - 1))) continue;
          const plaid = (x - bx) % 3 === 1 || (y - y0) % 3 === 1;
          put(m, x, y, y === y0 ? lighten(a, 0.2) : plaid ? b : a);
        }
      // 술 장식
      for (let x = bx; x < bx + bw; x += 2) put(m, x, y0 + bh, darken(a, 0.2));
    }
  }
  if (xmas) {
    // 윗면에 늘어진 전구 줄 (8px 마디)
    if (role.lights) {
      const tops = Array.from({ length: W }, (_, x) => topAt(m, x));
      let a = tops.findIndex((t) => t >= 0) + 1;
      const last = W - 2 - [...tops].reverse().findIndex((t) => t >= 0);
      for (; a < last; a += 8) {
        const b = Math.min(last, a + 8);
        for (let x = a; x <= b; x++) {
          if (tops[x] < 0) continue;
          const t = (x - a) / Math.max(1, b - a);
          const y = tops[x] + 1 + Math.round(2 * 4 * t * (1 - t));
          if (!solidAt(m, x, y)) continue;
          put(m, x, y, WIRE);
          if (x - a === 4) {
            const bc = XMAS_BULBS[(a / 8 + v) % XMAS_BULBS.length | 0];
            put(m, x, y + 1, bc);
            bulbs.push({ x, y: y + 1, c: bc });
          }
        }
      }
    }
    // 잎에 전구 + 꼭대기 별
    if (role.plant || role.branches) {
      let sx = -1;
      let sy = H;
      for (let y = 0; y < H - 4; y++)
        for (let x = 0; x < W; x++) {
          if (!solidAt(m, x, y)) continue;
          const col = rgbAt(m, x, y);
          const r = (col >> 16) & 255;
          const g = (col >> 8) & 255;
          const b = col & 255;
          const leafy = role.branches ? y < (H - PROP_PAD) * 0.65 + PROP_PAD && r + g + b < 260 : g > r + 8 && g > b + 4;
          if (!leafy) continue;
          if (y < sy) {
            sy = y;
            sx = x;
          }
          if (hash2(x, y, 911 + salt) < (role.branches ? 0.1 : 0.09) && solidAt(m, x, y - 1)) {
            const bc = XMAS_BULBS[Math.floor(hash2(x, y, 913) * XMAS_BULBS.length)];
            put(m, x, y, bc);
            bulbs.push({ x, y, c: bc });
          }
        }
      if (sx >= 0) {
        for (const [dx, dy, col] of [
          [0, -3, 0xfff2a8],
          [-1, -2, 0xf2c040],
          [0, -2, 0xfff2a8],
          [1, -2, 0xf2c040],
          [-2, -1, 0xf2c040],
          [-1, -1, 0xfff2a8],
          [0, -1, 0xffffff],
          [1, -1, 0xfff2a8],
          [2, -1, 0xf2c040],
          [-1, 0, 0xf2c040],
          [1, 0, 0xf2c040],
        ] as const)
          put(m, sx + dx, sy + dy, col);
      }
    }
    // 기둥 사탕 지팡이 리본 (좁은 세로 줄만)
    if (role.pole) {
      for (let y = PROP_PAD + 4; y < H - 4; y++) {
        let x = 0;
        while (x < W) {
          if (!solidAt(m, x, y)) {
            x++;
            continue;
          }
          let e = x;
          while (e < W && solidAt(m, e, y)) e++;
          if (e - x <= 4) for (let k = x; k < e; k++) if (Math.floor((y + k) / 2) % 3 === 0) put(m, k, y, k === x ? 0xf04a4a : 0xc8323a);
          x = e;
        }
      }
      const tx = Array.from({ length: W }, (_, x) => x).find((x) => topAt(m, x) >= 0) ?? 0;
      const ty = topAt(m, tx);
      // 꼭대기 아래 리본 나비
      const cx = Math.round(W / 2);
      const by = Math.min(H - 6, ty + 7);
      for (const [dx, dy] of [
        [-2, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
        [2, 0],
        [-2, 2],
        [2, 2],
        [-1, 3],
        [1, 3],
      ] as const)
        put(m, cx + dx - (W % 2 ? 0 : 1), by + dy, dy === 1 && dx === 0 ? 0xffe0e0 : 0xd8323a);
    }
    if (role.wreath) {
      const wr = doorWreath();
      const wd = wr.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, wr.width, wr.height).data;
      const ox = Math.round((W - wr.width) / 2);
      const oy = PROP_PAD + 8;
      for (let y = 0; y < wr.height; y++)
        for (let x = 0; x < wr.width; x++) {
          const i = (y * wr.width + x) * 4;
          if (wd[i + 3] > 128) put(m, ox + x, oy + y, (wd[i] << 16) | (wd[i + 1] << 8) | wd[i + 2]);
        }
    }
    // 모니터 산타 모자 (둘 이상이면 번갈아)
    if (role.hats) {
      const hat = santaHat();
      for (const [i, [x0, y0, w0]] of role.hats.entries()) {
        if (role.hats.length > 1 && (i + v) % 2 === 1 && kind !== "cubicle") continue;
        const left = mx(x0 < 0 ? src.width + x0 : x0, w0);
        drawGrid(m, hat, left + (flip ? w0 - 9 : 0), PROP_PAD + y0 - 5);
      }
    }
    // 책상 위 작은 트리
    if (role.tree !== undefined) {
      const { g, bulbs: tb } = deskTree();
      const fx = flip ? 1 - role.tree : role.tree;
      const x = Math.max(0, Math.min(W - 9, Math.round(W * fx) - 4));
      let surf = H;
      for (let k = 2; k < 7; k++) {
        const t = topAt(m, x + k);
        if (t >= 0) surf = Math.min(surf, t);
      }
      if (surf < H) {
        const oy = Math.max(0, surf + 4 - 14);
        drawGrid(m, g, x, oy);
        for (const b of tb) bulbs.push({ x: b.x + x, y: b.y + oy, c: b.c });
      }
    }
    // 배식대 특식 (둘)
    if (role.food) {
      for (const [k, f] of [
        [(v + 0) % 3, 0.28],
        [(v + 1) % 3, 0.7],
      ] as const) {
        const g = feastDish(k);
        const x = Math.max(0, Math.min(W - g.w, Math.round(W * f - g.w / 2)));
        let surf = H;
        for (let i = 1; i < g.w - 1; i++) {
          const t = topAt(m, x + i);
          if (t >= 0) surf = Math.min(surf, t);
        }
        if (surf < H) drawGrid(m, g, x, Math.max(0, surf + 3 - g.h));
      }
    }
  }
  c2.putImageData(img, 0, 0);
  return { canvas: cur, bulbs };
}

// ── 바닥에 놓는 장식 (충돌 없음) ──

export type DecorKind = "tree" | "gifts" | "heater" | "coat" | "snowman";
export type Decor = { kind: DecorKind; x: number; y: number; v: number };
export type DecorArt = { canvas: HTMLCanvasElement; bulbs: Bulb[]; stars: { x: number; y: number }[]; glow?: { x: number; y: number; color: Color; w: number; h: number } };

const DECOR_SIZE: Record<DecorKind, { w: number; h: number }> = {
  tree: { w: 39, h: 38 },
  gifts: { w: 20, h: 13 },
  heater: { w: 13, h: 16 },
  coat: { w: 14, h: 30 },
  snowman: { w: 18, h: SNOWMAN_H },
};

/** 선물 상자 두세 개 (20×13). snowy = 바깥 (위에 눈) */
function giftsCanvas(v: number, snowy: boolean): HTMLCanvasElement {
  const g = new Grid(20, 13);
  const sets: [Color, Color][] = [
    [0xc8323a, 0xf2d060],
    [0x2f8a52, 0xf2f2f2],
    [0x3a6ec8, 0xf2d060],
    [0xe8e0d0, 0xc8323a],
    [0x8a4ac8, 0xf2f2f2],
  ];
  const box = (x: number, y: number, w: number, h: number, i: number) => {
    const [body, rib] = sets[(i + v) % sets.length];
    g.rect(x, y, w, h, body);
    g.hline(x, x + w - 1, y, lighten(body, 0.22));
    g.vline(x + w - 1, y + 1, y + h - 1, darken(body, 0.22));
    const rx = x + Math.floor(w / 2);
    g.vline(rx, y, y + h - 1, rib);
    g.hline(x, x + w - 1, y + Math.floor(h / 2), rib);
    g.set(rx - 1, y - 1, rib);
    g.set(rx + 1, y - 1, rib);
    g.set(rx - 2, y - 2, lighten(rib, 0.25));
    g.set(rx + 2, y - 2, lighten(rib, 0.25));
  };
  box(1, 5, 8, 6, 0);
  box(10, 7, 7, 4, 1);
  if (v % 2 === 0) box(5, 2, 6, 4, 2);
  else box(15, 8, 4, 3, 3);
  g.outline(OUT);
  for (let x = 1; x < 19; x++) if (!g.filled(x, 12)) g.set(x, 12, 0x30486a, 60);
  return snowy ? snowCap(g.toCanvas(), { depth: 1, maxY: 11, seed: 41 + v }) : g.toCanvas();
}

/** 전기 히터 (13×16): 크림색 몸통 · 주황으로 달아오른 열선 · 다이얼 */
function heaterCanvas(): HTMLCanvasElement {
  const g = new Grid(13, 16);
  g.rect(1, 2, 11, 11, 0xe8e0cc);
  g.hline(1, 11, 2, 0xf8f2e4);
  g.vline(11, 3, 12, 0xc8bea8);
  g.rect(2, 4, 9, 6, 0x5a3a2a);
  for (let y = 5; y < 10; y += 2) g.hline(3, 9, y, y === 7 ? 0xffd070 : 0xff8a3a);
  g.set(9, 11, 0xd8323a);
  g.set(3, 11, 0x6a6e78);
  g.rect(2, 13, 2, 1, 0x6a6e78);
  g.rect(9, 13, 2, 1, 0x6a6e78);
  g.hline(4, 8, 1, 0xc8bea8);
  g.outline(OUT, false, 220);
  for (let x = 1; x < 12; x++) if (!g.filled(x, 15)) g.set(x, 15, 0x000000, 60);
  return g.toCanvas();
}

/** 외투 걸이 (14×30): 기둥 · 패딩 · 목도리 · 털모자 */
function coatCanvas(v: number): HTMLCanvasElement {
  const g = new Grid(14, 30);
  g.vline(7, 2, 27, 0x6a4a30);
  g.vline(6, 3, 27, 0x8a6a4a);
  g.hline(3, 11, 28, 0x5a3e28);
  g.hline(4, 10, 2, 0x8a6a4a);
  // 패딩 (왼쪽 고리)
  const pad = [0x2a3a5a, 0x5a2a2a, 0x2f5a3e][v % 3];
  for (let y = 4; y < 19; y++) {
    const w = y < 6 ? 2 : 4;
    for (let x = 6 - w; x < 6; x++) g.set(x, y, (y - 4) % 4 === 3 ? darken(pad, 0.25) : x === 6 - w ? lighten(pad, 0.15) : pad);
  }
  // 목도리 (오른쪽 고리, 끝이 늘어진다)
  const sc = [0xd8323a, 0xe8d8c0, 0x3a8a4a][v % 3];
  g.rect(8, 4, 3, 2, sc);
  for (let y = 6; y < 16; y++) g.set(9 + (y > 11 ? 1 : 0), y, (y >> 1) % 2 ? darken(sc, 0.2) : sc);
  g.hline(9, 11, 16, 0xf2f2ee);
  // 털모자 (꼭대기)
  g.ellipse(7, 1.5, 2.6, 1.6, sc === 0xe8d8c0 ? 0x3a6ec8 : 0xe8d8c0);
  g.set(7, 0, 0xffffff);
  g.outline(OUT, false, 220);
  for (let x = 2; x < 13; x++) if (!g.filled(x, 29)) g.set(x, 29, 0x000000, 60);
  return g.toCanvas();
}

/** 장식 하나의 그림 (원점 = 바닥 가운데) */
export function decorArt(d: Decor, outdoor: boolean): DecorArt {
  switch (d.kind) {
    case "tree": {
      const t = miniXmasTree(34);
      const { canvas, ctx } = makeCanvas(t.canvas.width + 14, t.canvas.height + 4);
      const ox = 7;
      // 나무 밑 선물 (양옆)
      ctx.drawImage(t.canvas, ox, 0);
      const gifts = giftsCanvas(d.v, outdoor);
      ctx.drawImage(gifts, 0, 0, 10, 13, 0, canvas.height - 13, 10, 13);
      ctx.drawImage(gifts, 10, 0, 10, 13, canvas.width - 10, canvas.height - 13, 10, 13);
      return { canvas, bulbs: t.bulbs.map((b) => ({ ...b, x: b.x + ox })), stars: [{ x: t.star.x + ox, y: t.star.y }] };
    }
    case "gifts":
      return { canvas: giftsCanvas(d.v, outdoor), bulbs: [], stars: [] };
    case "heater":
      return { canvas: heaterCanvas(), bulbs: [], stars: [], glow: { x: 6.5, y: 7, color: 0xff8a3a, w: 34, h: 22 } };
    case "coat":
      return { canvas: coatCanvas(d.v), bulbs: [], stars: [] };
    case "snowman":
      return { canvas: snowman(d.v), bulbs: [], stars: [] };
  }
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * 장식 자리 (판 시드·지도로 정해진다): 소품 그림·기믹 구역·출현 지점·시작점과 겹치지 않는 빈 바닥.
 * extra = 지도 밖에서 따로 그리는 가구 (끝없는 회의실 테이블 같은 것)
 */
export function decorPlan(l: ArenaLayout, concept: MapConcept, extra: readonly Rect[] = []): Decor[] {
  // 끝없는 회의실은 가장자리에서 테이블 줄이 밀려와 바닥 장식을 덮는다 → 벽 겹·가구 손질만
  if (concept === "default" || l.zone === "mt_meeting") return [];
  const out = isOutdoorZone(l.zone);
  const wallH = wallHeight(l.zone);
  // 야근 빌딩 바닥 무늬는 차 길·웅덩이·매트 같은 기믹 자리라 피한다
  const tower = isTowerZoneId(l.zone);
  const salt = 1201 + l.variant * 7;
  const boxes: Rect[] = [
    ...l.props.map((p) => {
      const m = PROP_META[p.kind];
      return { x: p.x - m.w / 2 - 3, y: p.y - m.h - 2, w: m.w + 6, h: m.h + 5 };
    }),
    ...extra,
  ];
  const solids: Solid[] = l.solids;
  const placed: Decor[] = [];
  const want: { kind: DecorKind; n: number; near: "corner" | "wall" | "top" | "any" }[] = [];
  if (out) want.push({ kind: "snowman", n: concept === "christmas" ? 1 : 2, near: "any" });
  if (concept === "christmas") want.push({ kind: "tree", n: 1, near: "corner" }, { kind: "gifts", n: 2, near: "wall" });
  if (!out) want.push({ kind: "heater", n: 2, near: "top" }, { kind: "coat", n: 1, near: "top" });
  if (out && concept === "christmas") want.push({ kind: "tree", n: 1, near: "any" });
  for (const wnt of want) {
    for (let k = 0; k < wnt.n; k++) {
      const sz = DECOR_SIZE[wnt.kind];
      let best: { x: number; y: number; s: number } | null = null;
      for (let y = wallH + sz.h - 4; y <= AH - SIDE - 3; y += 5)
        for (let x = SIDE + sz.w / 2 + 3; x <= AW - SIDE - sz.w / 2 - 3; x += 5) {
          const box = { x: x - sz.w / 2, y: y - sz.h, w: sz.w, h: sz.h };
          if (boxes.some((b) => overlaps(b, box))) continue;
          if (l.regions.some((r) => inRegion(r, x, y, 1.25) || inRegion(r, x, y - sz.h / 2, 1.25))) continue;
          if (tower && l.decals.some((d) => overlaps(d, { x: box.x, y: y - 6, w: sz.w, h: 6 }))) continue;
          if (Math.hypot(x - l.start.x, y - l.start.y) < 46) continue;
          if (l.spawns.some((s) => Math.hypot(x - s.x, y - s.y) < 18)) continue;
          if (placed.some((p) => Math.hypot(x - p.x, y - p.y) < 56)) continue;
          if (!standable(solids, x, y, 6)) continue;
          const toWall = Math.min(x - SIDE, AW - SIDE - x, AH - SIDE - y);
          const toTop = y - sz.h - wallH;
          let s: number;
          if (wnt.near === "corner") s = Math.min(Math.hypot(x - SIDE, toTop), Math.hypot(AW - SIDE - x, toTop)) + (toTop > 40 ? 40 : 0);
          else if (wnt.near === "top") s = toTop * 2 + Math.abs(x - AW / 2) * 0.05;
          else if (wnt.near === "wall") s = Math.min(toWall, toTop);
          else s = 30;
          s += hash2(x, y, salt + k) * (wnt.near === "any" ? 200 : 26);
          if (!best || s < best.s) best = { x, y, s };
        }
      if (best) placed.push({ kind: wnt.kind, x: best.x, y: best.y, v: (l.variant + k + placed.length) % 6 });
    }
  }
  return placed;
}

/** 창밖 내리는 눈 무늬 (32×32 바둑 반복 — 실행부가 아래로 흘린다) */
export function snowTileCanvas(night: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(32, 32);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(hash2(i, 1, 991) * 32);
    const y = Math.floor(hash2(i, 2, 991) * 32);
    ctx.fillStyle = css(0xffffff, (night ? 0.7 : 0.85) - hash2(i, 3, 991) * 0.3);
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }
  return canvas;
}
