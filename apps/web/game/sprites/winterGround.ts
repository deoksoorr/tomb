import { TILE } from "@tomb/protocol";
import { groundKind, PLAZA_FIRE, type GroundKind, type Rect } from "../world/layout";
import { hash2, mix, vnoise, type Color } from "./pixel";
import { ICE, SNOW } from "./winterArt";

// 11/17 겨울·크리스마스 판 바닥 (lib/mapConcept): 가을 바닥을 다 구운 뒤 덩어리 픽셀을 한 번 훑어 겨울 바닥으로 바꾼다.
//  - 풀밭·묘역·언덕: 눈밭. 원래 그림의 밝기 차(얼룩·담장·절벽 그림자)를 그대로 살려 그늘은 푸르게, 큰 눈 둔덕 명암과 마른 풀 몇 가닥
//  - 흙길: 밟혀 질척한 진흙빛 (가운데 젖은 얼룩·발자국), 길가는 치워 둔 눈둑
//  - 광장·골목 포석·자갈: 줄눈에 눈이 차고 돌은 서리, 군데군데 눈 더미. 광장 큰 모닥불 둘레는 녹아 젖은 돌
//  - 담 윗면·절벽 턱·계단 디딤면에 눈, 담 앞면 위쪽에 고드름
// 물(얼음)·판자·봉분·언덕 마당은 ground.ts가 각 그림에서 winter 값을 보고 따로 그린다.

/** 그늘진 눈 (푸른빛) */
const SNOW_SHADOW = 0x8a9cb6;
const SOFT_BASE: Partial<Record<GroundKind, { ref: number; snow: Color }>> = {
  grass: { ref: 87, snow: 0xe2e9ef },
  grave: { ref: 63, snow: 0xd3dce5 },
  hill: { ref: 108, snow: 0xeaf0f5 },
};
const PATHS = new Set<GroundKind>(["dirt", "gate"]);
const PAVED = new Set<GroundKind>(["stone", "cobble", "gravel"]);
const isSoft = (k: GroundKind) => k === "grass" || k === "hill" || k === "grave";
/** 큰 모닥불 둘레 눈이 녹은 반지름 (광장 둥근 무늬 R 92와 같게 — 무늬 안은 젖은 돌, 바깥은 눈) */
const MELT_R = 90;

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

export function winterizeGround(ctx: CanvasRenderingContext2D, area: Rect, tx0: number, ty0: number): void {
  const W = area.w;
  const H = area.h;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const n = W / TILE;
  // 덩어리 둘레 한 칸까지 바닥 종류 (길가 눈둑이 이웃 칸을 본다)
  const N = n + 2;
  const kinds: GroundKind[] = [];
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) kinds.push(groundKind(tx0 + i, ty0 + j));
  const kindAt = (i: number, j: number) => kinds[(j + 1) * N + (i + 1)];
  const set = (i: number, c: Color) => {
    d[i] = (c >> 16) & 255;
    d[i + 1] = (c >> 8) & 255;
    d[i + 2] = c & 255;
  };
  const orig = new Uint8ClampedArray(d);
  const lumAt = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return lum(orig[i], orig[i + 1], orig[i + 2]);
  };

  for (let y = 0; y < H; y++) {
    const ti = Math.floor(y / TILE);
    const ly = y % TILE;
    const wy = area.y + y;
    for (let x = 0; x < W; x++) {
      const tj = Math.floor(x / TILE);
      const lx = x % TILE;
      const wx = area.x + x;
      const k = kindAt(tj, ti);
      const i = (y * W + x) * 4;
      const r = orig[i];
      const g = orig[i + 1];
      const b = orig[i + 2];
      const L = lum(r, g, b);
      const base = SOFT_BASE[k];
      if (base) {
        set(i, snowAt(wx, wy, L / base.ref, base.snow));
        // 눈 위로 삐죽 나온 마른 풀 (묘역·언덕은 드물게)
        const h = hash2(wx, wy, 211);
        if (k === "grass" ? h < 0.0015 : h < 0.0005) {
          set(i, 0x7c7650);
          if (y > 0) {
            const j = ((y - 1) * W + x) * 4;
            d[j] = 0x96;
            d[j + 1] = 0x8e;
            d[j + 2] = 0x60;
          }
        }
        continue;
      }
      if (PATHS.has(k)) {
        // 이웃 칸이 눈밭이면 그쪽 가장자리에 눈둑
        let dist = 99;
        if (isSoft(kindAt(tj - 1, ti))) dist = Math.min(dist, lx);
        if (isSoft(kindAt(tj + 1, ti))) dist = Math.min(dist, TILE - 1 - lx);
        if (isSoft(kindAt(tj, ti - 1))) dist = Math.min(dist, ly);
        if (isSoft(kindAt(tj, ti + 1))) dist = Math.min(dist, TILE - 1 - ly);
        if (isSoft(kindAt(tj - 1, ti - 1))) dist = Math.min(dist, Math.hypot(lx, ly));
        if (isSoft(kindAt(tj + 1, ti - 1))) dist = Math.min(dist, Math.hypot(TILE - 1 - lx, ly));
        if (isSoft(kindAt(tj - 1, ti + 1))) dist = Math.min(dist, Math.hypot(lx, TILE - 1 - ly));
        if (isSoft(kindAt(tj + 1, ti + 1))) dist = Math.min(dist, Math.hypot(TILE - 1 - lx, TILE - 1 - ly));
        const bank = 2 + vnoise(wx, wy, 9, 213) * 4;
        if (dist < bank - 1) {
          set(i, snowAt(wx, wy, 1, 0xdfe6ed));
          continue;
        }
        if (dist < bank) {
          set(i, 0xa9b6c3); // 눈둑 아래 그늘 한 줄
          continue;
        }
        set(i, slushAt(wx, wy, r, g, b));
        continue;
      }
      if (PAVED.has(k)) {
        set(i, pavedAt(k, wx, wy, r, g, b, L, lumAt(x, y > 0 ? y - 1 : y)));
        continue;
      }
      if (k === "wallTop") {
        // 담 윗면: 눈이 덮고 돌 줄눈만 희미하게
        set(i, mix(snowAt(wx, wy, L / 110, 0xe6edf3), r * 65536 + g * 256 + b, 0.12));
        continue;
      }
      if (k === "wallFace" || k === "wallSide") {
        let c: Color = mix((r << 16) | (g << 8) | b, 0xc8d4e0, 0.16);
        // 앞면 맨 위: 담 윗면에서 흘러내린 눈 + 고드름
        if (k === "wallFace" && kindAt(tj, ti - 1) === "wallTop") {
          if (ly < 2) c = ly === 0 ? SNOW.mid : SNOW.lo;
          else {
            const len = Math.floor(hash2(wx, 0, 215) * 6) - 1;
            if (wx % 3 === 0 && ly - 2 < len) c = ly - 2 === len - 1 ? ICE.lo : ICE.mid;
          }
        }
        set(i, c);
        continue;
      }
      if (k === "cliff" || k === "stairs") {
        // 바위 턱(위 픽셀보다 밝아지는 줄)과 계단 디딤면에 눈
        const up = lumAt(x, Math.max(0, y - 1));
        const ledge = k === "stairs" ? wy % 4 === 0 && lx >= 2 && lx < TILE - 2 : ly <= 1 || (up + 18 < L && hash2(wx, wy, 217) < 0.8);
        set(i, ledge ? (hash2(wx, wy, 219) < 0.2 ? SNOW.lo : SNOW.mid) : mix((r << 16) | (g << 8) | b, 0x9aa8b8, 0.18));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** 눈밭 한 점: ratio = 원래 밝기 / 그 바닥의 기준 밝기 (그늘이면 푸르게, 밝은 얼룩이면 더 하얗게) + 큰 둔덕 명암 */
function snowAt(wx: number, wy: number, ratio: number, base: Color): Color {
  const drift = vnoise(wx, wy, 56, 221) - 0.5;
  const ripple = vnoise(wx + wy * 0.6, wy, 7, 223) - 0.5;
  const t = (ratio - 1) * 2.2 + drift * 0.45 + ripple * 0.12;
  if (t >= 0) return mix(base, SNOW.hi, Math.min(1, t * 1.6));
  return mix(base, SNOW_SHADOW, Math.min(0.85, -t * 0.9));
}

/** 밟혀 녹은 흙길: 진흙빛 + 물기 얼룩 + 군데군데 다져진 눈 + 발자국 */
function slushAt(wx: number, wy: number, r: number, g: number, b: number): Color {
  const c = (r << 16) | (g << 8) | b;
  const wet = vnoise(wx, wy, 11, 225);
  let out = mix(c, 0x4e4238, 0.35);
  if (wet > 0.62) out = mix(out, 0x3a3430, 0.35);
  else if (wet < 0.24) out = mix(out, 0xb8bec4, 0.55); // 다져진 눈 얼룩
  // 발자국: 6px 칸마다 드문드문 짧은 자국
  const fx = Math.floor(wx / 6);
  const fy = Math.floor(wy / 6);
  if (hash2(fx, fy, 227) < 0.16) {
    const ox = fx * 6 + 1 + Math.floor(hash2(fx, fy, 229) * 3);
    const oy = fy * 6 + 1 + Math.floor(hash2(fx, fy, 231) * 3);
    if (wx >= ox && wx < ox + 2 && wy >= oy && wy < oy + 3) out = mix(out, 0x2e2824, 0.4);
  }
  return out;
}

/** 포석·자갈: 줄눈(어두운 픽셀)에 눈, 돌은 서리, 눈 더미 얼룩. 광장 큰 모닥불 둘레는 녹아 젖은 돌 */
function pavedAt(k: GroundKind, wx: number, wy: number, r: number, g: number, b: number, L: number, upL: number): Color {
  const c = (r << 16) | (g << 8) | b;
  const fd = Math.hypot(wx - PLAZA_FIRE.x, (wy - PLAZA_FIRE.y - 4) * 1.25);
  // 녹은 자리 경계는 픽셀 디더로 (부드러운 번짐 대신)
  const melt = fd < MELT_R || (fd < MELT_R + 14 && hash2(wx, wy, 235) > (fd - MELT_R) / 14) ? 1 : 0;
  const pile = vnoise(wx, wy, k === "gravel" ? 22 : 30, 233) + (k === "stone" ? 0 : 0.08);
  const threshold = k === "stone" ? 0.6 : k === "cobble" ? 0.66 : 0.5;
  let snow: Color;
  if (pile > threshold + 0.06) snow = mix(SNOW.mid, SNOW.hi, Math.min(1, (pile - threshold) * 4));
  else if (pile > threshold) snow = SNOW.lo;
  else {
    const joint = L < (k === "gravel" ? 100 : 92) || (upL > L + 30 && k !== "gravel");
    // 골목 자갈은 사람이 다녀 돌이 드러나 있다 (서리만 살짝)
    snow = joint ? (k === "gravel" ? mix(c, SNOW.lo, 0.5) : SNOW.lo) : mix(c, 0xdfe6ee, k === "cobble" ? 0.12 : 0.3);
  }
  if (!melt) return snow;
  // 녹은 자리: 젖어 살짝 어둡고 차가운 돌
  return mix(c, 0x2e3440, 0.1);
}

// ── 물·판자·봉분 (ground.ts가 각 그림에서 부른다) ──

export const WINTER_WATER = { water: 0x2b4856, light: 0x44687a, dark: 0x1f3844 } as const;

/** 얼음 한 점 (결·금·눈가루) */
export function iceAt(wx: number, wy: number): Color {
  const streak = hash2(Math.floor((wx + wy) / 3), Math.floor((wx - wy) / 9), 241) < 0.12;
  const crack = Math.abs(vnoise(wx, wy, 13, 243) - 0.5) < 0.018;
  const dust = vnoise(wx, wy, 10, 245);
  if (dust > 0.7) return mix(SNOW.mid, SNOW.hi, (dust - 0.7) * 3);
  if (crack) return ICE.lo;
  return streak ? ICE.hi : ICE.mid;
}

/** 물가 얼음이 시작되는 정규화 거리 (0 = 가운데, 1 = 물가). 연못은 넓게 얼고 호수는 가장자리만 */
export function iceEdge(wx: number, wy: number, pond: boolean): number {
  const n = vnoise(wx, wy, 18, 247);
  return pond ? 0.12 + n * 0.2 : 0.72 + n * 0.14;
}

/** 둑(물가 돌·모래)은 눈에 덮인다 */
export function snowRim(wx: number, wy: number): Color {
  return hash2(wx, wy, 249) < 0.5 ? SNOW.lo : SNOW.mid;
}
