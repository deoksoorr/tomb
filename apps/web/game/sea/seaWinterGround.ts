import { SEA_BOARDWALK, SEA_FLAT_Y0, SEA_ROAD, SEA_ROAD_LOOP, SEA_SAND_Y0 } from "@tomb/protocol";
import { hash2, mix, vnoise, type Color } from "../sprites/pixel";
import { pathEdgeDist, poolDepth, type SeaGround } from "./seaLayout";

// 11/17 달물결 포구 겨울·크리스마스 바닥 (lib/mapConcept). seaArt가 덩어리를 구울 때 점마다 원래 색(c)과 바닥 종류를 받아 겨울 색으로 바꿔요.
// 원래 그림의 밝기 차(얼룩·물결 자국·그늘)는 살려 눈의 명암으로 옮겨요 (마을 winterGround와 같은 방법, 색은 바닷가 파스텔에 맞춰 조금 따뜻하게).
//  - 풀밭·마당·별장 터·뒤 언덕: 눈밭 (언덕은 상록 덤불이 군데군데, 풀밭은 마른 풀 몇 가닥)
//  - 흙길: 밟혀 다져진 눈 + 군데군데 녹은 진창, 길가는 눈둑
//  - 버스 길: 젖은 아스팔트 + 바퀴 자국, 연석 쪽은 치워 둔 눈둑. 승강장은 서리 낀 돌
//  - 산책로: 판자 위 눈 (가운데 사람이 다니는 줄만 밟혀 판자가 드러나요)
//  - 백사장: 눈. 파도가 닿는 아래쪽(seaSnowLineY 아래)은 차가운 젖은 모래, 그 경계는 서리 낀 진눈깨비 줄
//  - 갯벌: 차가운 빛 + 서리 몇 점, 물웅덩이는 가장자리에 살얼음 (바다는 얼리지 않아요 — 물은 SeaMap이 그대로 덮어요)
// 모두 순수 함수예요 (Phaser 없이 시험해요).

export const SEA_SNOW = { hi: 0xf6f9fc, mid: 0xe7edf3, lo: 0xcdd8e3, shade: 0xadbfd0, deep: 0x8ea3b9 } as const;
export const SEA_ICE = { hi: 0xeef8fd, mid: 0xc8e4f0, lo: 0xa2cade } as const;
/** 그늘진 눈 (푸른빛) */
const SHADOW = 0x8fa2bb;
/** 눈 위로 삐죽 나온 마른 풀 */
const DRY_GRASS = 0x8a7e58;
const DRY_GRASS_HI = 0xa69a6c;

const lum = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

/** 바닥마다 원래 그림의 기준 밝기 (이보다 밝으면 하얀 눈, 어두우면 푸른 그늘) */
const REF: Partial<Record<SeaGround, number>> = { grass: 172, hill: 160, yard: 226, lot: 222, sand: 226 };
/** 원래 밝기 차를 눈에 얼마나 옮길지 (풀밭은 4·8px 덩어리 무늬가 눈 위에 바둑판처럼 보여서 약하게) */
const KEEP: Partial<Record<SeaGround, number>> = { grass: 0.22, hill: 0.3, yard: 0.7, lot: 0.6, sand: 0.9 };

/**
 * 백사장 눈이 끝나는 줄 (이 아래는 파도가 닿는 젖은 모래). 만조 물가(TIDE_HIGH_Y)보다 위 — 보통 파도는 여기까지 오지 않아요.
 * 가로로 천천히 굽이쳐요 (장식 자리 고르기도 이 값을 봐요)
 */
export function seaSnowLineY(x: number): number {
  return SEA_FLAT_Y0 - 24 + (vnoise(x, 0, 46, 301) - 0.5) * 16 + (vnoise(x, 0, 9, 303) - 0.5) * 5;
}

/** 눈밭 한 점: t = 원래 밝기 차 (0이면 기준 눈빛). 큰 눈 둔덕 명암과 잔물결 */
function snowAt(x: number, y: number, t: number, base: Color = SEA_SNOW.mid): Color {
  const drift = vnoise(x, y, 52, 311) - 0.5;
  const ripple = vnoise(x + y * 0.6, y, 7, 313) - 0.5;
  const v = t * 2.2 + drift * 0.45 + ripple * 0.12;
  if (v >= 0) return mix(base, SEA_SNOW.hi, Math.min(1, v * 1.6));
  return mix(base, SHADOW, Math.min(0.85, -v * 0.9));
}

/** 바닥 종류 k의 원래 색 c를 겨울 색으로 */
export function seaWinterColor(x: number, y: number, k: SeaGround, c: Color): Color {
  switch (k) {
    case "grass":
    case "yard":
    case "lot": {
      // 마른 풀 (뿌리 + 그 위 한 점)
      if (k === "grass") {
        if (hash2(x, y, 321) < 0.0016) return DRY_GRASS;
        if (hash2(x, y + 1, 321) < 0.0016) return DRY_GRASS_HI;
      }
      return snowAt(x, y, (lum(c) / REF[k]! - 1) * KEEP[k]!, k === "lot" ? 0xe3eaf1 : SEA_SNOW.mid);
    }
    case "hill": {
      // 뒤 언덕: 눈 아래로 상록 덤불이 군데군데 (나무 그늘이라 조금 푸르게)
      const bush = vnoise(x, y, 9, 331);
      if (bush > 0.66) return mix(c, 0x3b5648, 0.55);
      if (bush > 0.62) return SEA_SNOW.shade;
      return snowAt(x, y, (lum(c) / REF.hill! - 1) * KEEP.hill! - 0.03, SEA_SNOW.lo);
    }
    case "platform": {
      // 서리 낀 돌 판: 이음매에 눈, 군데군데 쌓인 눈
      const pile = vnoise(x, y, 14, 341);
      if (pile > 0.7) return pile > 0.76 ? SEA_SNOW.hi : SEA_SNOW.lo;
      if (lum(c) < 196) return SEA_SNOW.lo;
      return mix(c, 0xe4ebf2, 0.42);
    }
    case "road":
      return roadAt(x, y, c);
    case "path": {
      // 흙길: 가장자리는 눈둑, 가운데는 밟혀 다져진 눈 + 녹은 진창 얼룩 + 발자국
      const e = pathEdgeDist(x, y);
      const bank = -2 - vnoise(x, y, 6, 351) * 2.5;
      if (e > bank + 1) return snowAt(x, y, 0.02, SEA_SNOW.mid);
      if (e > bank) return SEA_SNOW.shade;
      let out = mix(SEA_SNOW.lo, c, 0.32);
      const wet = vnoise(x, y, 10, 353);
      if (wet > 0.64) out = mix(c, 0x8a7a68, 0.35);
      const fx = Math.floor(x / 6);
      const fy = Math.floor(y / 6);
      if (hash2(fx, fy, 355) < 0.18) {
        const ox = fx * 6 + 1 + Math.floor(hash2(fx, fy, 357) * 3);
        const oy = fy * 6 + 1 + Math.floor(hash2(fx, fy, 359) * 3);
        if (x >= ox && x < ox + 2 && y >= oy && y < oy + 3) out = mix(out, 0x6a6460, 0.32);
      }
      return out;
    }
    case "boardwalk": {
      // 판자 위 눈: 가운데(사람이 다니는 줄)는 밟혀 판자가 드러나고, 양쪽은 눈 (판자 이음은 눈 위에 옅은 줄로)
      const rel = (y - SEA_BOARDWALK.y) / SEA_BOARDWALK.h;
      const track = Math.abs(rel - 0.52) < 0.2 + (vnoise(x, y, 12, 361) - 0.5) * 0.16;
      if (track) {
        if (vnoise(x, y, 8, 363) > 0.6) return mix(SEA_SNOW.lo, c, 0.25);
        return mix(c, 0x9aa3ae, 0.22);
      }
      if (lum(c) < 168) return SEA_SNOW.shade;
      return snowAt(x, y, 0.04 + (rel < 0.2 ? 0.06 : 0), SEA_SNOW.mid);
    }
    case "sand": {
      const line = seaSnowLineY(x);
      if (y < line - 3) {
        // 산책로 바로 밑은 그늘 (원래 그림이 어두워요 → 푸른 눈)
        const under = y - SEA_SAND_Y0;
        return snowAt(x, y, (lum(c) / REF.sand! - 1) * KEEP.sand! - (under < 4 ? 0.06 : 0), SEA_SNOW.mid);
      }
      // 경계: 서리 낀 진눈깨비 (눈 쪽에서 젖은 모래 쪽으로 디더)
      const wet = coldWetSand(x, y, c);
      if (y < line + 3) return hash2(x, y, 371) < (line + 3 - y) / 6 ? (hash2(x, y, 373) < 0.5 ? SEA_SNOW.lo : SEA_SNOW.shade) : mix(wet, SEA_ICE.mid, 0.3);
      return wet;
    }
    case "pool": {
      // 물웅덩이: 가장자리는 살얼음, 물은 차갑게
      const d = poolDepth(x, y);
      if (d < 0.18) return hash2(x, y, 381) < 0.55 ? SEA_ICE.mid : SEA_ICE.lo;
      if (d < 0.28) return mix(c, SEA_ICE.hi, 0.45);
      return mix(c, 0x8fb4cc, 0.16);
    }
    case "flat": {
      // 갯벌: 차가운 빛 + 위쪽(오래 드러나는 곳)에 서리, 드문 얼음 조각
      let out = mix(c, 0x97a3b2, 0.26);
      if (y < SEA_FLAT_Y0 + 36 && hash2(x, y, 391) < 0.03 * (1 - (y - SEA_FLAT_Y0) / 36)) out = mix(out, 0xe8eef4, 0.55);
      if (hash2(x >> 1, y >> 1, 393) < 0.003) out = SEA_ICE.hi;
      return out;
    }
    default:
      return c;
  }
}

/** 파도가 닿는 젖은 모래 (차가운 빛, 드문 얼음 알갱이) */
function coldWetSand(x: number, y: number, c: Color): Color {
  const toFlat = SEA_FLAT_Y0 - y;
  const base = mix(c, 0xcdb592, toFlat > 30 ? 0.55 : 0.25);
  if (hash2(x, y, 375) > 0.996) return SEA_ICE.hi;
  return mix(base, 0x8c9cb0, 0.2);
}

/** 버스 길: 젖은 아스팔트 + 바퀴 자국, 연석·돌림 마당 둘레는 눈둑. 정차 칸 노란 줄·가운데 흰 줄은 보여요 */
function roadAt(x: number, y: number, c: Color): Color {
  const L = lum(c);
  // 칠한 줄 (밝은 노랑·흰색) — 서리만 살짝
  if (L > 205) return mix(c, 0xe8eef4, 0.15);
  let edge: number;
  if (x < SEA_ROAD.x) edge = SEA_ROAD_LOOP.r - Math.hypot(x - SEA_ROAD_LOOP.x, y - SEA_ROAD_LOOP.y);
  else edge = Math.min(y - SEA_ROAD.y, SEA_ROAD.y + SEA_ROAD.h - y);
  const bank = 4 + vnoise(x, y, 8, 401) * 4;
  if (edge < 3) return hash2(x, y, 403) < 0.5 ? SEA_SNOW.mid : SEA_SNOW.lo; // 연석 위 눈
  if (edge < bank) return snowAt(x, y, -0.02, SEA_SNOW.lo);
  if (edge < bank + 1) return 0x9eabb8; // 눈둑 아래 그늘
  let out = mix(c, 0x4c5662, 0.36);
  // 바퀴 자국 (길 가운데 위아래로 두 줄 — 더 젖어 짙게)
  if (x >= SEA_ROAD.x) {
    const mid = SEA_ROAD.y + SEA_ROAD.h / 2;
    for (const ty of [mid - 9, mid + 8]) if (Math.abs(y - ty) < 2.5) out = mix(out, 0x343c46, 0.35);
  }
  if (vnoise(x, y, 11, 405) > 0.7) out = mix(out, SEA_SNOW.lo, 0.45); // 다져진 눈 얼룩
  return out;
}

/** 시험·장식용: 눈이 덮인 땅인지 (바닥 종류 기준, 백사장은 눈 줄 위만) */
export function seaSnowyGround(x: number, y: number, k: SeaGround): boolean {
  if (k === "grass" || k === "yard" || k === "lot" || k === "hill") return true;
  if (k === "sand") return y < seaSnowLineY(x) - 3;
  return false;
}
