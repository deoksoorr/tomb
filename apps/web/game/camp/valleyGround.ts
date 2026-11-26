// 11/26 캠핑장 바닥 색 (6차 시안에서 옮김): campArt.groundColor(가을 바탕) + campWinter.campWinterGroundColor(겨울 변환)와 같은 생각에
// 폭포 계곡 바닥(소·위 마루 강·카라반 자갈 마당·저수지 석축)을 더했다. 바닥 덩어리는 CampMap이 화면 근처만 굽는다.

import { darken, hash2, mix, vnoise, type Color } from "../sprites/pixel";
import { ICE, SNOW } from "../sprites/winterArt";
import { CAMP_BUS_BAY } from "../bus/busBays";
import { hashU } from "./campLayout";
import * as L from "./campLayout";
import { embankColor } from "./valleyHomeArt";

const GC = {
  grass: [0x8a8642, 0x7a7a3a, 0x9a9450, 0x6e7036] as const,
  blade: 0xa8a258,
  path: [0xa88a5e, 0x96784e, 0xbc9c6c] as const,
  plaza: [0xb49a6e, 0xa2875c, 0xc4aa7c] as const,
  road: [0x55524e, 0x4a4744, 0x625f5a] as const,
  bank: [0xb0a690, 0x968c78, 0xc8bea8] as const,
  rock: [0x9c968a, 0x86817a, 0xb4ae9e, 0x7a8a4a] as const,
};
const LEAF_COLORS: readonly Color[] = [0xf2c444, 0xe68a38, 0xd65632, 0xb4783a];
const GROUND_LEAF: readonly Color[] = LEAF_COLORS.map((c) => mix(c, GC.grass[0], 0.4));

// campWinter 색
const SNOW_SHADOW = 0x8a9cb6;
const FOREST_SNOW = 0xdde5ec;
const MUD = 0x5a4a3c;
const MUD_WET = 0x3e3630;
const PACKED = 0xb4bcc4;
const WET_EARTH = 0x4a3e34;
const PUDDLE = 0x46505c;
const COLD_WATER = { deep: 0x24485a, mid: 0x2e5a6c, light: 0x7aaabc, foam: 0xdcecf2 } as const;
/** 웅덩이: 가운데는 더 깊고 짙게, 가장자리는 얕아 밝게 */
const POOL_C = { abyss: 0x1e4254, deep: 0x204656, mid: 0x285466, shallow: 0x326676, shelf: 0x4f8896 } as const;

const lum = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

/** 눈이 녹은 자리 (모닥불·화롯대·그릴) */
const MELT: readonly { x: number; y: number; r: number }[] = [
  { x: L.FIRE.x, y: L.FIRE.y + 4, r: 66 },
  { x: L.BBQ.grill.x, y: L.BBQ.grill.y - 2, r: 22 },
  { x: L.SMALL_FIRE.x, y: L.SMALL_FIRE.y + 4, r: 24 },
  ...L.PITS.map((p) => ({ x: p.x, y: p.y + 4, r: 22 })),
];
/** 광장 둘레 반지름 환산 (큰 광장 또는 폭포 앞 작은 모닥불 — 작은 쪽은 큰 광장 크기로 늘려 같은 규칙) */
function plazaR(x: number, y: number): { r: number; cx: number; cy: number } {
  const sr = Math.hypot(x - L.SMALL_FIRE.x, (y - L.SMALL_FIRE.y - 6) * 1.25);
  if (sr < 40) return { r: (sr / 30) * L.PLAZA_R, cx: L.SMALL_FIRE.x, cy: L.SMALL_FIRE.y };
  for (const p of L.PITS) {
    const pr = Math.hypot(x - p.x, (y - p.y - 4) * 1.25);
    if (pr < 36) return { r: (pr / 26) * L.PLAZA_R, cx: p.x, cy: p.y };
  }
  return { r: Math.hypot(x - L.FIRE.x, (y - L.FIRE.y) * 1.12), cx: L.FIRE.x, cy: L.FIRE.y };
}
function meltAt(x: number, y: number): number {
  for (const m of MELT) {
    const d = Math.hypot(x - m.x, (y - m.y) * 1.2);
    if (d < m.r) return 1;
    const band = m.r * 0.08 + 4;
    if (d < m.r + band) return hash2(x, y, 401) > (d - m.r) / band ? 1 : 0;
  }
  return 0;
}
function snowAt(x: number, y: number, base: Color, bias = 0): Color {
  const drift = vnoise(x, y, 52, 403) - 0.5;
  const ripple = vnoise(x + y * 0.6, y, 7, 405) - 0.5;
  const t = drift * 0.6 + ripple * 0.16 + bias;
  if (t >= 0) return mix(base, SNOW.hi, Math.min(1, t * 1.8));
  return mix(base, SNOW_SHADOW, Math.min(0.8, -t * 1.1));
}
function footprint(x: number, y: number, rate: number, salt: number): boolean {
  const fx = Math.floor(x / 6);
  const fy = Math.floor(y / 6);
  if (hash2(fx, fy, salt) >= rate) return false;
  const ox = fx * 6 + 1 + Math.floor(hash2(fx, fy, salt + 1) * 3);
  const oy = fy * 6 + 1 + Math.floor(hash2(fx, fy, salt + 2) * 3);
  return x >= ox && x < ox + 2 && y >= oy && y < oy + 3;
}
function wetGround(x: number, y: number, c0: Color): Color {
  const puddle = vnoise(x, y, 7, 407) * 0.7 + vnoise(x, y, 23, 408) * 0.3;
  if (puddle > 0.79) return mix(PUDDLE, 0x8a96a4, hash2(x >> 1, y, 409) < 0.12 ? 0.5 : 0);
  if (puddle > 0.76) return MUD_WET;
  const damp = vnoise(x, y, 12, 410);
  return mix(c0, damp > 0.55 ? MUD_WET : WET_EARTH, 0.5 + damp * 0.2);
}
function slushAt(x: number, y: number, c0: Color): Color {
  const wet = vnoise(x, y, 11, 453);
  let out = mix(c0, MUD, 0.55);
  if (wet > 0.64) out = mix(out, MUD_WET, 0.45);
  else if (wet < 0.26) out = mix(out, PACKED, 0.6);
  if (footprint(x, y, 0.16, 455)) out = mix(out, 0x2e2824, 0.4);
  return out;
}

/** 가을 바탕 색 (campArt.groundColor와 같은 규칙) */
function autumn(x: number, y: number, k: L.CampGround, nearPath: boolean): Color {
  const n = hashU(x, y, 1);
  switch (k) {
    case "bank":
      return n < 0.18 ? GC.bank[1] : n > 0.84 ? GC.bank[2] : hashU(x >> 1, y >> 1, 3) < 0.2 ? 0xa49a84 : GC.bank[0];
    case "road": {
      let c: Color = n < 0.12 ? GC.road[1] : n > 0.9 ? GC.road[2] : GC.road[0];
      if (y < L.ROAD.y + 5) c = n < 0.5 ? 0x9a968c : 0xb4b0a4;
      // 정류장 앞 노란 정차 칸 (테두리 점선) — 「버스 타기」 E 범위와 같은 상자 (game/bus/busBays).
      // 11/26 폭포 계곡 바닥으로 옮기며 빠졌던 것을 되살림 (운영자 「바닥 표시 왜 사라짐」). 겨울판은 campWinter가 바랜 채로 남긴다
      const B = CAMP_BUS_BAY;
      const bx1 = B.x + B.w;
      const by1 = B.y + B.h;
      const inBay = x >= B.x && x <= bx1 && y >= B.y && y <= by1;
      if (inBay) {
        const onEdge = y === B.y || y === B.y + 1 || y === by1 || y === by1 - 1 ? (x >> 2) % 2 === 0 : x === B.x || x === B.x + 1 || x === bx1 || x === bx1 - 1;
        if (onEdge) c = 0xe8c040;
      }
      // 길 가운데 바랜 흰 점선 (정차 칸 밖)
      if (y >= L.ROAD.y + 40 && y <= L.ROAD.y + 41 && (x >> 3) % 2 === 0 && (x < B.x - 4 || x > bx1 + 4)) c = 0xc8c4b8;
      return c;
    }
    case "rock":
    case "cliff": {
      if (hashU(x >> 2, y >> 1, 41) > 0.94) return GC.rock[1];
      if (hashU(x >> 2, y >> 2, 43) < 0.1) return GC.rock[3];
      return n < 0.15 ? GC.rock[1] : n > 0.85 ? GC.rock[2] : GC.rock[0];
    }
    case "plaza": {
      const { r } = plazaR(x, y);
      if (r > L.PLAZA_R - 6) {
        const cell = hashU(Math.floor(x / 4), Math.floor(y / 3), 51);
        return cell < 0.55 ? (n < 0.5 ? 0xb4ae9e : 0x9c968a) : GC.plaza[1];
      }
      if (r < 30 && n < (30 - r) / 40) return 0x6a5a48;
      return n < 0.14 ? GC.plaza[1] : n > 0.88 ? GC.plaza[2] : GC.plaza[0];
    }
    case "path":
    case "pad": {
      if (hashU(x >> 1, y >> 1, 61) < 0.08) return GROUND_LEAF[Math.floor(hashU(x, y, 62) * GROUND_LEAF.length)];
      if (hashU(x, y, 63) > 0.97) return 0xc8b89a;
      return n < 0.16 ? GC.path[1] : n > 0.86 ? GC.path[2] : GC.path[0];
    }
    default: {
      const inPile = hashU(x >> 4, y >> 4, 71) > 0.65;
      const rate = inPile ? 0.46 : 0.1 + (nearPath ? 0.06 : 0);
      const gx = inPile ? x >> 2 : x >> 1;
      const gy = inPile ? y >> 2 : y >> 1;
      if (hashU(gx, gy, 72) < rate) {
        const li = Math.floor(hashU(gx, gy, 73) * GROUND_LEAF.length);
        return n < 0.25 ? darken(GROUND_LEAF[li], 0.08) : GROUND_LEAF[li];
      }
      if (n > 0.95) return GC.blade;
      const g0 = n < 0.18 ? GC.grass[1] : n > 0.86 ? GC.grass[2] : GC.grass[0];
      return hashU(x >> 3, y >> 3, 75) < 0.18 ? mix(g0, GC.grass[3], 0.5) : g0;
    }
  }
}

/** 흐르는 물 한 점 (계곡·위 마루 강): 물가는 얼고 가운데는 차가운 물 (campWinter water와 같다) */
function coldWater(x: number, y: number, edge: number): Color {
  const ice = 0.5 + vnoise(x, y, 22, 411) * 0.26;
  if (edge >= ice) {
    if (edge < ice + 0.06) return hash2(x, y, 413) < 0.5 ? ICE.hi : SNOW.hi;
    const dust = vnoise(x, y, 9, 415);
    if (edge > 0.9 || dust > 0.66) return mix(SNOW.mid, SNOW.hi, Math.min(1, (dust - 0.5) * 2));
    if (Math.abs(vnoise(x, y, 11, 417) - 0.5) < 0.02) return ICE.lo;
    return hash2(Math.floor((x + y) / 3), Math.floor((x - y) / 8), 419) < 0.14 ? ICE.hi : ICE.mid;
  }
  if (edge > ice - 0.08 && hash2(x, y, 421) < 0.55) return COLD_WATER.foam;
  const flow = hash2(Math.floor((x + Math.sin(y * 0.09) * 3) / 2), Math.floor(y / 7), 31);
  let c: Color = edge > ice * 0.6 ? COLD_WATER.mid : COLD_WATER.deep;
  if (flow > 0.9) c = COLD_WATER.light;
  else if (flow > 0.8) c = mix(c, COLD_WATER.light, 0.4);
  if (hash2(x >> 2, y >> 2, 33) > 0.94) c = mix(c, 0x5a6066, 0.35);
  // 물살 턱 (하얀 거품 띠 — 흐름 방향 아래로 짧게)
  for (const ry of L.RAPIDS) {
    const d = y - ry - Math.sin(x * 0.4) * 1.5;
    if (d >= 0 && d < 3 && hash2(x, y, 461) < 0.8) return d < 1 ? SNOW.hi : COLD_WATER.foam;
    if (d >= 3 && d < 7 && hash2(x, y >> 1, 463) < 0.35) return COLD_WATER.light;
    if (d > -3 && d < 0) c = mix(c, 0x1a3442, 0.35); // 턱 위 매끈한 물
  }
  return c;
}

/** 큰 웅덩이 한 점 */
function poolColor(x: number, y: number, d: number): Color {
  // 가장자리 얼음 (뒤쪽 = 폭포 쪽은 물보라 때문에 얼지 않는다)
  const behind = y < L.POOL.y - L.POOL.ry * 0.35 && Math.abs(x - L.FALL_X) < 130;
  const iceAt = behind ? 1.2 : 0.86 + vnoise(x, y, 18, 471) * 0.08;
  if (d >= iceAt) {
    if (d < iceAt + 0.025) return hash2(x, y, 473) < 0.5 ? ICE.hi : SNOW.hi;
    const dust = vnoise(x, y, 8, 475);
    if (d > 0.975 || dust > 0.68) return mix(SNOW.mid, SNOW.hi, Math.min(1, (dust - 0.5) * 2));
    if (Math.abs(vnoise(x, y, 10, 477) - 0.5) < 0.025) return ICE.lo;
    return hash2(Math.floor((x + y) / 3), Math.floor((x - y) / 9), 479) < 0.12 ? ICE.hi : ICE.mid;
  }
  if (d > iceAt - 0.03 && hash2(x, y, 481) < 0.6) return COLD_WATER.foam;
  // 깊이: 가운데(폭포 바로 아래쪽 조금 앞)가 가장 깊다
  const dd = Math.hypot((x - L.POOL.x) / L.POOL.rx, (y - L.POOL.y - 6) / L.POOL.ry);
  const band = dd + (vnoise(x, y, 14, 483) - 0.5) * 0.12;
  let c: Color = band < 0.22 ? POOL_C.abyss : band < 0.5 ? POOL_C.deep : band < 0.74 ? POOL_C.mid : band < 0.84 ? POOL_C.shallow : POOL_C.shelf;
  // 얕은 곳 바닥 돌 비침
  if (band > 0.74 && hash2(x >> 2, y >> 2, 485) > 0.9) c = mix(c, 0x7a8a8c, 0.3);
  // 절벽 그늘 (웅덩이 뒤쪽은 절벽에 가려 어둡다)
  const shade = L.cliffBase(x) > 0 ? Math.max(0, 1 - (y - L.cliffBase(x)) / 34) : 0;
  if (shade > 0) c = mix(c, 0x0e1e28, shade * 0.4);
  // 폭포가 떨어지는 자리: 하얗게 일어난 물 (거품·물방울 그림은 위에 따로)
  const px = (x - L.PLUNGE.x) / 64;
  const py = (y - L.PLUNGE.y) / 30;
  const pr = Math.hypot(px, py);
  if (pr < 1) {
    const churn = vnoise(x, y, 5, 487);
    if (churn > 0.5 + pr * 0.35) c = mix(COLD_WATER.light, ICE.mid, churn - 0.4);
    else c = mix(c, COLD_WATER.light, (1 - pr) * 0.45);
  }
  // 폭포가 비친 자리 (물줄기 아래로 밝은 가로 물결 조각이 세로로 늘어선다)
  const rx = Math.abs(x - L.FALL_X + 2);
  if (pr >= 1 && rx < 30 && y < L.POOL.y + 26) {
    const k = (1 - rx / 30) * (1 - (y - L.PLUNGE.y) / 84);
    if (hash2(x >> 2, y, 495) < 0.2 * k) c = mix(c, 0xcfe8f0, 0.4);
  }
  // 바람에 이는 잔물결 (짧은 가로 획, 드문드문)
  if (pr >= 1 && hash2(x >> 3, y, 497) < 0.018 && (x & 7) < 4) c = mix(c, COLD_WATER.light, 0.22);
  // 흐름: 웅덩이 앞쪽 가운데는 계곡으로 빠져나가는 물결
  if (y > L.POOL.y + 20 && Math.abs(x - L.POOL.x) < 40) {
    const flow = hash2(Math.floor((x + Math.sin(y * 0.1) * 3) / 2), Math.floor(y / 6), 493);
    if (flow > 0.92) c = mix(c, COLD_WATER.light, 0.35);
  }
  return c;
}

/** 저수지: 가장자리에서 멀수록 깊다. 겨울 판은 가장자리 한 띠가 얼고(얼음낚시 구멍은 그림으로) 가운데·좌대 둘레는 물 */
function pondColor(x: number, y: number, snowy: boolean): Color {
  const e = -L.resEdge(x, y); // 물가에서 안쪽으로 px
  const band = e + (vnoise(x, y, 16, 541) - 0.5) * 8;
  // 석축 그늘 (북쪽 벽 아래·서쪽 벽 옆 물은 어둡게)
  const shadeN = Math.max(0, 1 - (y - L.RES.y0) / 14);
  if (snowy) {
    const iceW = 18 + vnoise(x, y, 26, 543) * 10;
    if (e < iceW) {
      if (e > iceW - 1.5) return hash2(x, y, 545) < 0.5 ? ICE.hi : SNOW.hi;
      const dust = vnoise(x, y, 8, 547);
      if (dust > 0.66) return mix(SNOW.mid, SNOW.hi, Math.min(1, (dust - 0.5) * 2));
      if (Math.abs(vnoise(x, y, 12, 549) - 0.5) < 0.022) return ICE.lo;
      return hash2(Math.floor((x + y) / 3), Math.floor((x - y) / 9), 551) < 0.12 ? ICE.hi : ICE.mid;
    }
    if (e < iceW + 2 && hash2(x, y, 553) < 0.55) return COLD_WATER.foam;
    let c: Color = band > 70 ? POOL_C.deep : band > 40 ? POOL_C.mid : POOL_C.shallow;
    if (hash2(x >> 3, y, 555) < 0.02 && (x & 7) < 4) c = mix(c, COLD_WATER.light, 0.3);
    return mix(c, 0x0e1e28, shadeN * 0.4);
  }
  let c: Color = band > 70 ? 0x2c6c80 : band > 40 ? AW.deep : band > 16 ? AW.mid : AW.shallow;
  if (e < 2) c = hash2(x, y, 531) < 0.5 ? AW.foam : AW.shallow;
  // 연잎 (일반 판만, 가장자리 몇 군데)
  if (e > 4 && e < 22 && vnoise(x, y, 10, 559) > 0.8) c = hash2(x, y, 561) < 0.2 ? 0x9ac46a : 0x6a9a4a;
  if (hash2(x >> 3, y, 563) < 0.02 && (x & 7) < 4) c = mix(c, AW.light, 0.35);
  return mix(c, 0x10303a, shadeN * 0.35);
}
/** 석축 한 점: 북쪽은 물 쪽 돌 벽 면이 보이고(남향), 남쪽은 갓돌만, 동·서는 갓돌 + 얇은 면 */
function embankAt(x: number, y: number, snowy: boolean): Color {
  const o = L.resEdge(x, y); // 물가에서 밖으로 0..EMBANK
  const R = L.RES;
  const north = y < R.y0 && x >= R.x0 - 2 && x <= R.x1 + 2;
  const south = y > R.y1 && x >= R.x0 - 2 && x <= R.x1 + 2;
  const along = north || south ? x : y;
  let depth = o / L.EMBANK;
  if (south) depth = o < 2 ? 0.1 : 0.9;
  else if (!north) depth = o < 3 ? 0.35 : 0.9;
  return embankColor(x, y, along, depth, snowy);
}

/** 카라반 마당: 테두리 없이 둘레 눈밭(풀밭)에 스며든다. 가운데·앞쪽만 자갈이 비치고 바퀴 자국·발자국 (빈 자리는 거의 새 눈) */
function padColor(x: number, y: number, s: L.Site, snowy: boolean, around: Color): Color {
  const lx = x - (s.x - L.SITE_W / 2);
  const ly = y - (s.y - L.SITE_H / 2);
  const W = L.SITE_W;
  const H = L.SITE_H;
  const e = Math.min(lx, W - 1 - lx, ly, H - 1 - ly);
  // 가장자리 6~12px는 둘레 바닥과 섞인다 (덩어리 노이즈 — 반듯한 사각 테가 보이지 않게)
  const soft = 5 + vnoise(x, y, 7, 517) * 9;
  if (e < soft && hash2(x, y, 519) > (e / soft) ** 1.5) return around;
  const used = true; // 11/26 자리마다 바퀴 자국·자갈 (카라반은 집 화면 담당이 얹는다)
  const tire = used && ((lx > 17 && lx < 21) || (lx > W - 21 && lx < W - 17)) && ly > H * 0.42 && ly < H - 6 && hash2(x, y >> 1, 521) < 0.8;
  const worn = used && vnoise(x, y, 9, 503) > 0.56 - (ly / H) * 0.12;
  if (!snowy) {
    let c: Color = hashU(x, y, 1) < 0.16 ? GC.path[1] : hashU(x, y, 1) > 0.86 ? GC.path[2] : mix(GC.path[0], 0xb0a690, 0.4);
    if (!used) c = mix(around, GC.path[0], 0.25);
    if (hash2(x, y, 507) < 0.1) c = hash2(x, y, 508) < 0.5 ? 0x7a766e : 0xc8c0b0;
    if (hash2(x >> 1, y >> 1, 509) < 0.07) c = GROUND_LEAF[Math.floor(hash2(x, y, 510) * GROUND_LEAF.length)];
    if (tire) c = mix(c, 0x6a5a44, 0.35);
    return c;
  }
  let c: Color = used ? mix(snowAt(x, y, 0xe2e8ee, 0.04), PACKED, 0.35) : snowAt(x, y, FOREST_SNOW, 0.02);
  if (worn) c = mix(PACKED, 0x9a948a, 0.22);
  if ((worn || tire) && hash2(x, y, 507) < 0.1) c = hash2(x, y, 508) < 0.5 ? 0x7a766e : 0xc8c0b0;
  if (tire) c = mix(c, 0x8a8478, 0.35);
  if (footprint(x, y, used ? 0.1 : 0.05, 509)) c = 0xa4b2c0;
  return c;
}

/** 가을(일반 판) 물 (campArt groundColor water와 같은 색) */
const AW = { deep: 0x3a7a8e, mid: 0x4a92a4, shallow: 0x6cb4c0, light: 0xa8dce0, foam: 0xe8f6f4 } as const;
function autumnWater(x: number, y: number, edge: number): Color {
  const n = hashU(x, y, 1);
  const flow = hashU(Math.floor((x + Math.sin(y * 0.09) * 3) / 2), Math.floor(y / 7), 31);
  let c: Color = edge > 0.8 ? AW.shallow : edge > 0.45 ? AW.mid : AW.deep;
  if (flow > 0.9) c = AW.light;
  else if (flow > 0.82 && edge < 0.8) c = mix(c, AW.light, 0.45);
  if (edge > 0.9 && n > 0.6) c = AW.foam;
  if (edge < 0.7 && hashU(x >> 2, y >> 2, 33) > 0.93) c = mix(c, 0x7a7a6a, 0.35);
  for (const ry of L.RAPIDS) {
    const d = y - ry - Math.sin(x * 0.4) * 1.5;
    if (d >= 0 && d < 3 && hash2(x, y, 461) < 0.8) return AW.foam;
    if (d >= 3 && d < 7 && hash2(x, y >> 1, 463) < 0.35) return AW.light;
  }
  return c;
}
function autumnPool(x: number, y: number, d: number): Color {
  if (d > 0.965) return hash2(x, y, 531) < 0.5 ? AW.foam : AW.shallow;
  const dd = Math.hypot((x - L.POOL.x) / L.POOL.rx, (y - L.POOL.y - 6) / L.POOL.ry);
  const band = dd + (vnoise(x, y, 14, 483) - 0.5) * 0.12;
  let c: Color = band < 0.22 ? 0x245e72 : band < 0.5 ? 0x2c6c80 : band < 0.74 ? AW.deep : band < 0.86 ? AW.mid : AW.shallow;
  if (band > 0.8 && hash2(x >> 2, y >> 2, 485) > 0.88) c = mix(c, 0xb0a690, 0.35); // 얕은 곳 모래·돌
  const shade = Math.max(0, 1 - (y - L.cliffBase(x)) / 34);
  if (shade > 0 && L.cliffBase(x) > 0) c = mix(c, 0x10303a, shade * 0.35);
  const px = (x - L.PLUNGE.x) / 64;
  const py = (y - L.PLUNGE.y) / 30;
  const pr = Math.hypot(px, py);
  if (pr < 1) {
    const churn = vnoise(x, y, 5, 487);
    c = churn > 0.5 + pr * 0.35 ? mix(AW.light, 0xffffff, churn - 0.4) : mix(c, AW.light, (1 - pr) * 0.45);
  }
  if (pr >= 1 && hash2(x >> 3, y, 497) < 0.02 && (x & 7) < 4) c = mix(c, AW.light, 0.3);
  return c;
}

/** 캠핑장 바닥 한 점. snowy = 겨울·크리스마스 판 (아니면 늦가을 일반 판) */
export function valleyGroundColor(x: number, y: number, k: L.CampGround, nearPath: boolean, pathEdge: number, snowy = true): Color {
  const c0 = autumn(x, y, k, nearPath);
  if (!snowy) {
    switch (k) {
      case "pool":
        return autumnPool(x, y, L.poolD(x, y));
      case "pond":
        return pondColor(x, y, false);
      case "embank":
        return embankAt(x, y, false);
      case "water":
        return autumnWater(x, y, Math.abs(x - L.streamX(y)) / L.STREAM_HW);
      case "river":
        return autumnWater(x, y + 400, Math.abs(x - L.upperRiverX(y)) / L.UPPER_RIVER_HW);
      case "pad": {
        const st = L.inSite(x, y, -1);
        return st ? padColor(x, y, st, false, autumn(x, y, "grass", false)) : c0;
      }
      case "foot": {
        if (pathEdge > -2 && hash2(x, y, 511) < 0.55) return autumn(x, y, "grass", true);
        return mix(autumn(x, y, "path", false), GC.grass[0], 0.45);
      }
      default:
        return c0;
    }
  }
  switch (k) {
    case "pool":
      return poolColor(x, y, L.poolD(x, y));
    case "pond":
      return pondColor(x, y, true);
    case "embank":
      return embankAt(x, y, true);
    case "water": {
      const edge = Math.abs(x - L.streamX(y)) / L.STREAM_HW;
      return coldWater(x, y, edge);
    }
    case "river": {
      const edge = Math.abs(x - L.upperRiverX(y)) / L.UPPER_RIVER_HW;
      return coldWater(x, y + 400, edge);
    }
    case "pad": {
      const st = L.inSite(x, y, -1);
      return st ? padColor(x, y, st, true, snowAt(x, y, FOREST_SNOW)) : snowAt(x, y, FOREST_SNOW);
    }
    case "bank": {
      const L0 = lum(c0);
      if (L0 < 140 && hash2(x >> 1, y >> 1, 423) < 0.35) return mix(c0, 0x8090a0, 0.3);
      return hash2(x, y, 425) < 0.4 ? SNOW.lo : SNOW.mid;
    }
    case "rock":
    case "cliff": {
      const L0 = lum(c0);
      const bare = vnoise(x, y, 18, 427);
      if (L0 < 125 && bare > 0.55) return mix(c0, 0x6a7480, 0.25);
      if (bare > 0.72) return mix(c0, 0xc0ccd8, 0.35);
      return snowAt(x, y, 0xe6edf3, 0.05);
    }
    case "road": {
      const r = (c0 >> 16) & 255;
      const b = c0 & 255;
      if (r > 200 && b < 120) return mix(c0, 0xa8aeb4, 0.35);
      if (y < L.ROAD.y + 5) return hash2(x, y, 429) < 0.6 ? SNOW.mid : SNOW.lo;
      if (y < L.ROAD.y + 8 + vnoise(x, 0, 10, 431) * 4) return hash2(x, y, 433) < 0.5 ? SNOW.lo : PACKED;
      const ly = y - L.ROAD.y;
      const track = (ly >= 15 && ly <= 18) || (ly >= 28 && ly <= 31);
      if (track) return mix(c0, 0x2a2828, 0.45);
      if (ly > 19 && ly < 27 && vnoise(x, y, 12, 435) > 0.45) return mix(PACKED, 0x9aa2aa, hash2(x, y, 437) * 0.4);
      return mix(c0, 0x3a3838, 0.3);
    }
    case "plaza": {
      const { r } = plazaR(x, y);
      if (r > L.PLAZA_R - 6) {
        const stone = lum(c0) > 150;
        if (!stone) return hash2(x, y, 439) < 0.5 ? SNOW.mid : SNOW.lo;
        return hash2(x, y >> 1, 441) < 0.6 ? SNOW.hi : mix(c0, 0xc8d4e0, 0.3);
      }
      if (meltAt(x, y)) return wetGround(x, y, c0);
      const slush = vnoise(x, y, 10, 443);
      if (slush > 0.62) return mix(c0, MUD, 0.55);
      if (footprint(x, y, 0.2, 445)) return 0x98a4b0;
      return mix(PACKED, SNOW.mid, slush);
    }
    case "foot": {
      // 눈 다진 오솔길: 밟혀 굳은 눈 + 발자국, 가장자리는 부드럽게 눈밭으로
      if (pathEdge > -2 && hash2(x, y, 511) < 0.55) return snowAt(x, y, FOREST_SNOW);
      if (footprint(x, y, 0.2, 513)) return 0xa4b2c0;
      const n = vnoise(x, y, 10, 515);
      return mix(0xc6d0da, SNOW.mid, 0.3 + n * 0.45);
    }
    case "path": {
      if (meltAt(x, y)) return wetGround(x, y, c0);
      const bank = -1.5 - vnoise(x, y, 9, 447) * 2.5;
      if (pathEdge > bank + 1) return snowAt(x, y, 0xdfe6ed, 0.08);
      if (pathEdge > bank) return 0xa9b6c3;
      return slushAt(x, y, c0);
    }
    default: {
      if (meltAt(x, y)) return wetGround(x, y, 0x6a5a40);
      if (nearPath && footprint(x, y, 0.12, 449)) return 0xa4b2c0;
      const h = hash2(x, y, 451);
      if (h < 0.0018) return 0x7c7650;
      if (hash2(x, y + 1, 451) < 0.0018) return 0x968e60;
      return snowAt(x, y, FOREST_SNOW);
    }
  }
}

/** 바닥 덩어리 RGBA (size×size, 덩어리 cx·cy) */
export function valleyGroundPixels(cx: number, cy: number, size: number, snowy = true): Uint8ClampedArray {
  const g = valleyGroundSteps(cx, cy, size, 1 << 20, snowy);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/** 바닥 덩어리를 band줄마다 멈추며 굽는다 (버스 창밖 연출 동안 조금씩 — campPrebake) */
export function* valleyGroundSteps(cx: number, cy: number, size: number, band: number, snowy = true): Generator<void, Uint8ClampedArray> {
  const out = new Uint8ClampedArray(size * size * 4);
  const ox = cx * size;
  const oy = cy * size;
  const w = Math.max(0, Math.min(size, L.MW - ox));
  const h = Math.max(0, Math.min(size, L.MH - oy));
  const hw = Math.ceil(w / 2);
  const kinds: L.CampGround[] = new Array(hw * Math.ceil(h / 2));
  const near = new Uint8Array(kinds.length);
  const edge = new Float32Array(kinds.length);
  for (let y = 0; y < h; y += 2) {
    if (y > 0 && y % band === 0) yield;
    for (let x = 0; x < w; x += 2) {
      const i = (y >> 1) * hw + (x >> 1);
      const kd = L.campGroundKind(ox + x, oy + y);
      kinds[i] = kd;
      near[i] = kd === "grass" && L.pathEdgeDist(ox + x, oy + y, 12) < 10 ? 1 : 0;
      if (kd === "path") edge[i] = L.pathEdgeDist(ox + x, oy + y, 0, "main");
      else if (kd === "foot") edge[i] = L.pathEdgeDist(ox + x, oy + y, 0, "foot");
    }
  }
  for (let y = 0; y < h; y++) {
    if (y > 0 && y % band === 0) yield;
    for (let x = 0; x < w; x++) {
      const i = (y >> 1) * hw + (x >> 1);
      // 물·웅덩이·자리 경계는 2px 칸이 아니라 한 점씩 (물가 곡선이 계단처럼 보이지 않게)
      let k = kinds[i];
      if (k === "pool" || k === "water" || k === "bank" || k === "pad" || k === "river" || k === "pond" || k === "embank") k = L.campGroundKind(ox + x, oy + y);
      const c = valleyGroundColor(ox + x, oy + y, k, near[i] === 1, k === "path" || k === "foot" ? edge[i] : -9, snowy);
      const j = (y * size + x) * 4;
      out[j] = (c >> 16) & 255;
      out[j + 1] = (c >> 8) & 255;
      out[j + 2] = c & 255;
      out[j + 3] = 255;
    }
  }
  // 징검다리 돌
  for (const s of L.STEP_STONES) {
    for (let y = -5; y <= 5; y++)
      for (let x = -8; x <= 8; x++) {
        const d = (x / 7.5) ** 2 + (y / 5) ** 2;
        if (d > 1) continue;
        const px = Math.round(s.x + x - ox);
        const py = Math.round(s.y + y - oy);
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const c = d > 0.75 ? (y > 0 ? 0x5a5650 : 0x8a857a) : !snowy ? (y < -1 ? 0xbcb6a8 : hash2(px, py, 81) < 0.15 ? 0x7c8a4a : 0x9c968a) : y < -1 ? (hash2(px, py, 457) < 0.2 ? SNOW.lo : SNOW.hi) : y < 1 ? SNOW.lo : mix(0x9c968a, 0x2a3440, 0.3);
        const j = (py * size + px) * 4;
        out[j] = (c >> 16) & 255;
        out[j + 1] = (c >> 8) & 255;
        out[j + 2] = c & 255;
      }
    for (let x = -6; x <= 6; x++) {
      const px = Math.round(s.x + x - ox);
      const py = Math.round(s.y + 6 - oy);
      if (px >= 0 && py >= 0 && px < size && py < size && hashU(px, py, 83) < 0.7) {
        const j = (py * size + px) * 4;
        out[j] = 0xdc;
        out[j + 1] = 0xec;
        out[j + 2] = 0xf2;
      }
    }
  }
  return out;
}
