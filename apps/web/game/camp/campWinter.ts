import { CAMP_CAMPFIRES, CAMP_FIRE, CAMP_PLAZA_R, CAMP_ROAD, CAMP_STREAM_HALF_W, campStreamX } from "@tomb/protocol";
import { Grid, hash2, mix, rng, vnoise, type Color } from "../sprites/pixel";
import { ICE, SNOW } from "../sprites/winterArt";
import { CAMP_BBQ, type CampGround } from "./campLayout";

// 11/17 캠핑장 겨울·크리스마스 판 바닥과 작은 그림 (순수 계산 — Phaser·DOM 없이 테스트한다).
// 마을 winterGround와 같은 생각: 가을 바닥 색(c0)을 받아 그 자리 바닥 종류에 맞는 겨울 색으로 바꾼다.
//  - 풀밭(숲 바닥): 큰 눈 둔덕 명암 + 잔물결, 마른 풀 몇 가닥. 길 가까이는 발자국
//  - 흙길: 밟혀 질척한 진흙빛 + 다져진 눈 얼룩·발자국, 길가는 치워 둔 눈둑
//  - 모닥불 광장: 불 둘레는 눈이 녹아 젖은 땅(물웅덩이), 바깥은 밟힌 눈, 돌 테두리 위에 눈. 화롯대·바베큐 그릴 둘레도 녹는다
//  - 계곡: 물가만 얼고(얼음 결·눈가루) 가운데는 차가운 물이 흐른다. 둑·바위 마당은 눈, 바위 끝만 삐죽
//  - 버스 길: 젖은 아스팔트 + 바퀴 자국, 연석·길가에 눈. 노란 정차 칸은 바랜 채로 남는다
// 배치·충돌·바닥 종류(campGroundKind)는 그대로라 겉모습만 바뀐다.

/** 그늘진 눈 (푸른빛) */
const SNOW_SHADOW = 0x8a9cb6;
/** 숲 바닥 눈 (마을 풀밭 눈보다 살짝 차갑게 — 나무 그늘이 많은 숲) */
const FOREST_SNOW = 0xdde5ec;
const MUD = 0x5a4a3c;
const MUD_WET = 0x3e3630;
const PACKED = 0xb4bcc4;
const WET_EARTH = 0x4a3e34;
const PUDDLE = 0x46505c;
const COLD_WATER = { deep: 0x24485a, mid: 0x2e5a6c, light: 0x7aaabc, foam: 0xdcecf2 } as const;

/** 눈이 녹은 자리 (가운데·반지름 — 광장 큰 모닥불은 통나무 의자 고리까지) */
export const CAMP_MELT_SPOTS: readonly { x: number; y: number; r: number }[] = [
  { x: CAMP_FIRE.x, y: CAMP_FIRE.y + 4, r: 70 },
  // 11/26 작은 불 넷 (폭포 다리 앞·불멍 쉼터 둘·펜션 정원 화로대)
  ...CAMP_CAMPFIRES.filter((f) => !f.big).map((f) => ({ x: f.x, y: f.y + 4, r: 22 })),
  { x: CAMP_BBQ.grill.x, y: CAMP_BBQ.grill.y - 2, r: 22 },
];

/** 녹은 정도 0(눈) ~ 1(젖은 땅). 경계는 픽셀 디더 (부드러운 번짐 대신) */
export function campMeltAt(x: number, y: number): number {
  for (const m of CAMP_MELT_SPOTS) {
    const d = Math.hypot(x - m.x, (y - m.y) * 1.2);
    if (d < m.r) return 1;
    const band = m.r * 0.08 + 4;
    if (d < m.r + band) return hash2(x, y, 401) > (d - m.r) / band ? 1 : 0;
  }
  return 0;
}

/** 눈밭 한 점: 큰 둔덕 명암 + 잔물결 (ratio > 1이면 밝은 쪽) */
function snowAt(x: number, y: number, base: Color, bias = 0): Color {
  const drift = vnoise(x, y, 52, 403) - 0.5;
  const ripple = vnoise(x + y * 0.6, y, 7, 405) - 0.5;
  const t = drift * 0.6 + ripple * 0.16 + bias;
  if (t >= 0) return mix(base, SNOW.hi, Math.min(1, t * 1.8));
  return mix(base, SNOW_SHADOW, Math.min(0.8, -t * 1.1));
}

/** 6px 칸마다 드문드문 짧은 자국 (진흙·눈 위 발자국) */
function footprint(x: number, y: number, rate: number, salt: number): boolean {
  const fx = Math.floor(x / 6);
  const fy = Math.floor(y / 6);
  if (hash2(fx, fy, salt) >= rate) return false;
  const ox = fx * 6 + 1 + Math.floor(hash2(fx, fy, salt + 1) * 3);
  const oy = fy * 6 + 1 + Math.floor(hash2(fx, fy, salt + 2) * 3);
  return x >= ox && x < ox + 2 && y >= oy && y < oy + 3;
}

/** 녹은 젖은 땅 (광장·화롯대·그릴 둘레): 짙은 흙 + 물웅덩이 + 재 */
function wetGround(x: number, y: number, c0: Color): Color {
  // 작은 물웅덩이 (드문드문) + 젖어 얼룩진 흙
  const puddle = vnoise(x, y, 7, 407) * 0.7 + vnoise(x, y, 23, 408) * 0.3;
  if (puddle > 0.79) return mix(PUDDLE, 0x8a96a4, hash2(x >> 1, y, 409) < 0.12 ? 0.5 : 0); // 웅덩이에 비친 하늘 한 점
  if (puddle > 0.76) return MUD_WET;
  const damp = vnoise(x, y, 12, 410);
  return mix(c0, damp > 0.55 ? MUD_WET : WET_EARTH, 0.5 + damp * 0.2);
}

/**
 * 겨울 바닥 한 점.
 * c0 = 가을 바닥 색(groundColor), k = 바닥 종류, nearPath = 길 가까운 풀밭, pathEdge = 흙길 가장자리까지 거리(길 안쪽은 음수, 흙길에서만 쓴다)
 */
export function campWinterGroundColor(x: number, y: number, k: CampGround, c0: Color, nearPath: boolean, pathEdge = -9): Color {
  switch (k) {
    case "water": {
      const sx = x - campStreamX(y);
      const edge = Math.abs(sx) / CAMP_STREAM_HALF_W;
      // 물가에서 얼음이 시작되는 자리 (굽이마다 넓었다 좁았다)
      const ice = 0.5 + vnoise(x, y, 22, 411) * 0.26;
      if (edge >= ice) {
        // 얼음: 결·금·눈가루, 물과 닿는 끝은 하얀 테 한 줄
        if (edge < ice + 0.06) return hash2(x, y, 413) < 0.5 ? ICE.hi : SNOW.hi;
        const dust = vnoise(x, y, 9, 415);
        if (edge > 0.9 || dust > 0.66) return mix(SNOW.mid, SNOW.hi, Math.min(1, (dust - 0.5) * 2));
        const crack = Math.abs(vnoise(x, y, 11, 417) - 0.5) < 0.02;
        if (crack) return ICE.lo;
        return hash2(Math.floor((x + y) / 3), Math.floor((x - y) / 8), 419) < 0.14 ? ICE.hi : ICE.mid;
      }
      // 흐르는 물: 차갑고 짙게. 흐름 방향(아래)으로 길쭉한 물결, 얼음 끝 바로 안쪽은 거품
      if (edge > ice - 0.08 && hash2(x, y, 421) < 0.55) return COLD_WATER.foam;
      const flow = hash2(Math.floor((x + Math.sin(y * 0.09) * 3) / 2), Math.floor(y / 7), 31);
      let c: Color = edge > ice * 0.6 ? COLD_WATER.mid : COLD_WATER.deep;
      if (flow > 0.9) c = COLD_WATER.light;
      else if (flow > 0.8) c = mix(c, COLD_WATER.light, 0.4);
      // 바닥 돌 비침
      if (hash2(x >> 2, y >> 2, 33) > 0.94) c = mix(c, 0x5a6066, 0.35);
      return c;
    }
    case "bank": {
      // 물가 돌·모래는 눈에 덮이고 어두운 돌만 군데군데
      const L = lum(c0);
      if (L < 140 && hash2(x >> 1, y >> 1, 423) < 0.35) return mix(c0, 0x8090a0, 0.3);
      return hash2(x, y, 425) < 0.4 ? SNOW.lo : SNOW.mid;
    }
    case "rock": {
      // 산꼭대기 바위 마당: 눈 밭 사이로 바위 결(어두운 금)만 삐죽
      const L = lum(c0);
      const bare = vnoise(x, y, 18, 427);
      if (L < 125 && bare > 0.55) return mix(c0, 0x6a7480, 0.25);
      if (bare > 0.72) return mix(c0, 0xc0ccd8, 0.35);
      return snowAt(x, y, 0xe6edf3, 0.05);
    }
    case "road": {
      // 노란 정차 칸·흰 점선은 바랜 채로
      const r = (c0 >> 16) & 255;
      const b = c0 & 255;
      if (r > 200 && b < 120) return mix(c0, 0xa8aeb4, 0.35);
      // 연석 위·길 가장자리는 눈
      if (y < CAMP_ROAD.y + 5) return hash2(x, y, 429) < 0.6 ? SNOW.mid : SNOW.lo;
      if (y < CAMP_ROAD.y + 8 + vnoise(x, 0, 10, 431) * 4) return hash2(x, y, 433) < 0.5 ? SNOW.lo : PACKED;
      // 바퀴 자국 둘 (짙게 젖음), 그 사이는 다져진 눈
      const ly = y - CAMP_ROAD.y;
      const track = (ly >= 15 && ly <= 18) || (ly >= 28 && ly <= 31);
      if (track) return mix(c0, 0x2a2828, 0.45);
      if (ly > 19 && ly < 27 && vnoise(x, y, 12, 435) > 0.45) return mix(PACKED, 0x9aa2aa, hash2(x, y, 437) * 0.4);
      return mix(c0, 0x3a3838, 0.3);
    }
    case "plaza": {
      const r = Math.hypot(x - CAMP_FIRE.x, (y - CAMP_FIRE.y) * 1.12);
      if (r > CAMP_PLAZA_R - 6) {
        // 돌 테두리: 돌(밝은 픽셀)은 윗면에 눈, 사이는 눈
        const stone = lum(c0) > 150;
        if (!stone) return hash2(x, y, 439) < 0.5 ? SNOW.mid : SNOW.lo;
        return hash2(x, y >> 1, 441) < 0.6 ? SNOW.hi : mix(c0, 0xc8d4e0, 0.3);
      }
      if (campMeltAt(x, y)) return wetGround(x, y, c0);
      // 녹은 자리 바깥: 밟혀 다져진 눈 + 진흙이 비치는 자국
      const slush = vnoise(x, y, 10, 443);
      if (slush > 0.62) return mix(c0, MUD, 0.55);
      if (footprint(x, y, 0.2, 445)) return 0x98a4b0;
      return mix(PACKED, SNOW.mid, slush);
    }
    case "path": {
      if (campMeltAt(x, y)) return wetGround(x, y, c0);
      // 길가 눈둑 (이웃 풀밭 쪽 가장자리 두세 줄), 둑 아래 그늘 한 줄
      const bank = -1.5 - vnoise(x, y, 9, 447) * 2.5;
      if (pathEdge > bank + 1) return snowAt(x, y, 0xdfe6ed, 0.08);
      if (pathEdge > bank) return 0xa9b6c3;
      return slushAt(x, y, c0);
    }
    case "pad":
    case "grass":
    default: {
      if (campMeltAt(x, y)) return wetGround(x, y, 0x6a5a40);
      // 길 가까이는 사람이 다닌 발자국
      if (nearPath && footprint(x, y, 0.12, 449)) return 0xa4b2c0;
      // 눈 위로 삐죽 나온 마른 풀 (위 픽셀은 밝은 풀끝)
      const h = hash2(x, y, 451);
      if (h < 0.0018) return 0x7c7650;
      if (hash2(x, y + 1, 451) < 0.0018) return 0x968e60;
      return snowAt(x, y, FOREST_SNOW);
    }
  }
}

/** 밟혀 녹은 흙길: 진흙빛 + 물기 얼룩 + 군데군데 다져진 눈 + 발자국 */
function slushAt(x: number, y: number, c0: Color): Color {
  const wet = vnoise(x, y, 11, 453);
  let out = mix(c0, MUD, 0.55);
  if (wet > 0.64) out = mix(out, MUD_WET, 0.45);
  else if (wet < 0.26) out = mix(out, PACKED, 0.6); // 다져진 눈 얼룩
  if (footprint(x, y, 0.16, 455)) out = mix(out, 0x2e2824, 0.4);
  return out;
}

/** 징검다리 돌 한 점 (가을 색 c0, 돌 가운데 기준 dy): 윗면은 눈, 물에 닿는 아래는 젖어 짙게 */
export function campWinterStoneColor(c0: Color, dy: number, x: number, y: number): Color {
  if (dy < -1) return hash2(x, y, 457) < 0.2 ? SNOW.lo : SNOW.hi;
  if (dy < 1) return SNOW.lo;
  return mix(c0, 0x2a3440, 0.3);
}

const lum = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

/** 눈 더미 (16×7 — 낙엽 무더기·버섯 자리를 채운다). 위는 밝고 아래는 푸른 그늘 */
export function snowDriftArt(v: number): Grid {
  const g = new Grid(16, 7);
  const r = rng(1201 + v * 7);
  const rx = 5.5 + v;
  g.ellipse(8, 4.2, rx, 2.4, SNOW.mid);
  if (v !== 1) g.ellipse(8 + (r() - 0.5) * 6, 4.6, 3.2, 1.9, SNOW.mid);
  g.recolor((x, y) => !g.filled(x, y - 1), SNOW.hi);
  g.recolor((x, y) => !g.filled(x, y + 1) || !g.filled(x + 1, y), SNOW.shade);
  // 마른 풀 한두 가닥
  for (let i = 0; i < 1 + (v % 2); i++) {
    const x = 4 + Math.floor(r() * 8);
    g.set(x, 1, 0x8a8058);
    g.set(x, 2, 0x7c7650);
  }
  return g;
}
