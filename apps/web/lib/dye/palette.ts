// 46번 염색 팔레트: 서버가 정한 시드(seed)와 등급(tier)으로 만드는 큰 색 판. 서버(결과 색 판정)와 화면(그리기)이
// 같은 함수를 쓰므로, 클라이언트는 "판 위의 좌표"만 보내고 색은 서버가 이 함수로 계산한다 → 색을 위조할 수 없다.
//
// 판 = DYE_BOARD_W × DYE_BOARD_H 칸. 색 덩어리(blob) K개를 무작위 자리에 뿌리고, 칸마다 가장 가까운 덩어리의 색을 칠한다
// (덩어리마다 크기 가중치 + 좌표를 살짝 비틀어 경계가 구불구불). 시드가 다르면 색도 자리도 다 다르다.

export const DYE_BOARD_W = 160;
export const DYE_BOARD_H = 100;
/** 제한 시간 (모든 염색권 같음, 11/11 사용자 지시) */
export const DYE_TIME_MS = 60_000;
/** 시간이 끝난 뒤 마지막 좌표가 서버에 닿기까지 봐주는 여유 */
export const DYE_GRACE_MS = 6_000;

export type DyeTier = 1 | 2 | 3;

type TierSpec = {
  /** 색 덩어리 수 */
  blobs: number;
  /** 색상(hue) 묶음 수 (0 = 묶지 않고 전체에서 고르게) */
  hueGroups: number;
  /** 묶음 안에서 퍼지는 색상 폭 (도) */
  hueSpread: number;
  sat: [number, number];
  light: [number, number];
  /** 조준점 흔들림 (화면 px, 확대해도 같은 px → 확대할수록 판 위에서는 덜 흔들린다) */
  wobblePx: number;
};

export const DYE_TIERS: Record<DyeTier, TierSpec> = {
  1: { blobs: 34, hueGroups: 3, hueSpread: 34, sat: [0.22, 0.62], light: [0.32, 0.72], wobblePx: 16 },
  2: { blobs: 64, hueGroups: 7, hueSpread: 48, sat: [0.18, 0.82], light: [0.26, 0.82], wobblePx: 9 },
  3: { blobs: 120, hueGroups: 0, hueSpread: 360, sat: [0.08, 0.96], light: [0.16, 0.9], wobblePx: 3 },
};

export type DyeBlob = { x: number; y: number; w: number; color: string };
export type DyePalette = { seed: string; tier: DyeTier; blobs: DyeBlob[]; warp: [number, number, number, number] };

/** 문자열 → 32비트 해시 (FNV-1a) */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 시드 고정 난수 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** HSL(0~360, 0~1, 0~1) → "#rrggbb" */
export function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${hex2((r + m) * 255)}${hex2((g + m) * 255)}${hex2((b + m) * 255)}`;
}

/** 시드·등급 → 팔레트 (같은 인자면 언제나 같은 판) */
export function buildPalette(seed: string, tier: DyeTier): DyePalette {
  const spec = DYE_TIERS[tier];
  const r = rng(hash32(`dye:${tier}:${seed}`));
  const lerp = (a: number, b: number) => a + (b - a) * r();
  const groups = spec.hueGroups > 0 ? Array.from({ length: spec.hueGroups }, () => r() * 360) : [];
  const blobs: DyeBlob[] = [];
  for (let i = 0; i < spec.blobs; i++) {
    const hue = groups.length ? groups[Math.floor(r() * groups.length)] + (r() - 0.5) * spec.hueSpread : r() * 360;
    blobs.push({
      x: r() * DYE_BOARD_W,
      y: r() * DYE_BOARD_H,
      // 덩어리 크기 가중치 (작을수록 넓게 퍼진다)
      w: lerp(0.7, 1.35),
      color: hslHex(hue, lerp(spec.sat[0], spec.sat[1]), lerp(spec.light[0], spec.light[1])),
    });
  }
  return { seed, tier, blobs, warp: [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28] };
}

/** 판 안의 칸 좌표인지 (서버가 받는 좌표 검사) */
export function inBoard(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < DYE_BOARD_W && y < DYE_BOARD_H;
}

/** 칸(cx, cy 정수)의 색 */
export function cellColor(p: DyePalette, cx: number, cy: number): string {
  const x = cx + 0.5;
  const y = cy + 0.5;
  // 경계를 구불구불하게: 좌표를 사인파로 살짝 비튼다
  const [a, b, c, d] = p.warp;
  const wx = x + 3.2 * Math.sin(y * 0.19 + a) + 1.6 * Math.sin((x + y) * 0.11 + b);
  const wy = y + 3.2 * Math.sin(x * 0.17 + c) + 1.6 * Math.sin((x - y) * 0.13 + d);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < p.blobs.length; i++) {
    const o = p.blobs[i];
    const dx = wx - o.x;
    const dy = wy - o.y;
    const dist = (dx * dx + dy * dy) * o.w;
    if (dist < bestD) {
      bestD = dist;
      best = i;
    }
  }
  return p.blobs[best].color;
}

/** 판 위 좌표(실수)의 색. 판 밖이면 가장자리로 붙인다 */
export function colorAt(p: DyePalette, x: number, y: number): string {
  const cx = Math.min(DYE_BOARD_W - 1, Math.max(0, Math.floor(Number.isFinite(x) ? x : 0)));
  const cy = Math.min(DYE_BOARD_H - 1, Math.max(0, Math.floor(Number.isFinite(y) ? y : 0)));
  return cellColor(p, cx, cy);
}

/** 시간이 지나도록 아무 좌표도 오지 않은 판은 처음 조준점(판 가운데) 색으로 정한다 */
export const DYE_CENTER = { x: DYE_BOARD_W / 2, y: DYE_BOARD_H / 2 } as const;
