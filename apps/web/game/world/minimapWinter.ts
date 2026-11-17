import type { Color } from "../sprites/pixel";

// 11/17 마을 밖 맵(캠핑장·바닷가) 미니맵 겨울 색 (순수 계산 — DOM 없이 테스트한다).
// 이미 구운 미니맵 바탕(RGBA)을 받아 겨울·크리스마스 판 색으로 바꾼 새 배열을 돌려준다 (원본은 그대로 — 기본 판으로 돌아가면 원본을 쓴다).
//  - palette: 그 맵이 정한 색 → 겨울 색 (바탕이 칸마다 한 색이라 정확히 같은 색만 바꾼다)
//  - 목록에 없는 색은 색 계열로 짐작한다: 풀·숲(초록) → 눈밭·눈 쌓인 숲, 물(파랑) → 차가운 물(얼지 않는다),
//    밝은 모래·흙 → 눈 덮인 모래, 나머지(나무 판·돌·길) → 살짝 눈가루

const SNOW = 0xd6dee6;
const SNOW_HI = 0xe6ecf2;
const SNOWY_PINE = 0x5a7064;
const COLD = 0x24485a;

function mix(a: Color, b: Color, t: number): Color {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** 목록에 없는 색 하나를 겨울 색으로 (색 계열로 짐작) */
export function winterMinimapColor(c: Color): Color {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  // 물: 파랑이 가장 세다 → 더 차갑고 짙게 (바다·계곡 가운데는 얼지 않는다)
  if (b > r + 18 && b >= g - 6) return mix(c, COLD, 0.28);
  // 풀·숲: 초록이 가장 세다 → 짙으면 눈 쌓인 숲, 밝으면 눈밭
  if (g >= r && g > b + 4) return L < 0.31 ? mix(c, SNOWY_PINE, 0.65) : mix(SNOW, SNOW_HI, Math.min(1, Math.max(0, (L - 0.31) * 2)));
  // 밝은 모래·마당 → 눈 덮인 모래
  if (r >= g && g >= b && L > 0.62) return mix(c, SNOW_HI, 0.62);
  // 나머지 (나무 판·돌·길·지붕) → 눈가루
  return mix(c, SNOW, 0.32);
}

/** 미니맵 바탕을 겨울 색으로 바꾼 새 배열 (palette에 있는 색은 그 색으로, 없는 색은 winterMinimapColor) */
export function winterizeMinimap(src: Uint8ClampedArray, palette: ReadonlyMap<Color, Color> = new Map()): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const memo = new Map<Color, Color>();
  for (let i = 0; i < src.length; i += 4) {
    const c = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    let w = memo.get(c);
    if (w === undefined) {
      w = palette.get(c) ?? winterMinimapColor(c);
      memo.set(c, w);
    }
    out[i] = (w >> 16) & 255;
    out[i + 1] = (w >> 8) & 255;
    out[i + 2] = w & 255;
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * 바닷가 미니맵 겨울 색 (game/sea/seaMinimap 색 → 겨울 색). 지붕은 파란·붉은 지붕이라 짐작하면 물·흙이 되니 눈 지붕으로 정해 둔다.
 * 나머지(갯벌·모래·바다·소나무)는 짐작(winterMinimapColor)으로 충분하다
 */
export const SEA_WINTER_PALETTE: ReadonlyMap<Color, Color> = new Map([
  [0x5e98b4, 0xdce4ec], // 집 지붕
  [0xb24e36, 0xe2e8ee], // 부동산 지붕
  [0x2e6a8c, 0x285a74], // 먼바다 (얼지 않는다, 차갑게)
]);
