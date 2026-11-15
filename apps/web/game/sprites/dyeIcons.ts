import { isFixedDyeId } from "@tomb/protocol";
import { Grid, parseHex } from "./pixel";

// 46번 염색권 아이콘 (16×16): 물감 병 + 물방울. 등급이 높을수록 물감 띠가 다양해진다 (무지개는 일곱 색).
// 고정 색 염색권(dyefix_*)은 그 색을 몰라도 그릴 수 있게 color를 받는다 (없으면 분홍)

export const DYE_ICON_IDS = ["dye_basic", "dye_vivid", "dye_pastel", "dye_neon", "dye_fine", "dye_metal", "dye_rainbow", "dye_sparkle", "q_dye_pick", "q_dye_special"] as const;

const BANDS: Record<string, number[]> = {
  dye_basic: [0x8fb3d9, 0xd9a38f, 0x9fc5a8],
  dye_fine: [0xc3a6d9, 0x8fb3d9, 0x9fc5a8, 0xe0c36a, 0xd9a38f],
  dye_rainbow: [0xe0504a, 0xf0a040, 0xf2dc4a, 0x6ac46a, 0x4aa0e0, 0x5a6ad8, 0xb060d0],
  // 11/12 추가 종류
  dye_vivid: [0xf01e1e, 0xffe000, 0x1e5af0, 0xf8f8f8, 0x141414],
  dye_pastel: [0xf7c6d9, 0xc9e7f7, 0xfbeeb0, 0xcdeccd, 0xdcccf2],
  dye_neon: [0x39ff14, 0xff1493, 0x00ffff, 0xffff00],
  dye_metal: [0x9a6a2a, 0xd4af37, 0xc0c2c9, 0xb87333, 0x53586a],
  dye_sparkle: [0xc89a2a, 0xffd86a, 0xff7ab8, 0x8fe0ff, 0xb98cff],
};
/** 병 둘레에 반짝 별을 더 그리는 염색권 (특수 색이 잘 나오는 종류) */
const SPARKLY = new Set(["dye_sparkle", "dye_metal"]);

/** 염색권 아이콘. 고정 색이면 color 하나로 병을 채운다 */
export function dyeIcon(itemId: string, color?: string): Grid | null {
  if (itemId === "q_dye_pick") return pickIcon();
  if (itemId === "q_dye_special") return specialIcon();
  const bands = BANDS[itemId] ?? (isFixedDyeId(itemId) ? [parseHex(color ?? "#f4a7b9")] : null);
  if (!bands) return null;
  const g = new Grid(16, 16);
  // 마개
  g.rect(6, 1, 4, 2, 0x8a6a48);
  g.rect(7, 3, 2, 1, 0xd8d0c0);
  // 병 몸통 (유리)
  g.rect(4, 4, 8, 10, 0xd8e8f0);
  g.rect(3, 6, 10, 7, 0xd8e8f0);
  // 물감: 아래부터 띠를 쌓는다
  const rows = [12, 11, 10, 9, 8, 7, 6];
  const h = Math.max(1, Math.floor(rows.length / bands.length));
  rows.forEach((y, i) => {
    const c = bands[Math.min(bands.length - 1, Math.floor(i / h))];
    for (let x = y >= 6 && y <= 12 ? 3 : 4; x <= (y >= 6 && y <= 12 ? 12 : 11); x++) g.set(x, y, c);
  });
  g.rect(4, 13, 8, 1, bands[0]);
  // 유리 반짝임
  g.set(5, 7, 0xffffff);
  g.set(5, 8, 0xffffff);
  g.outline(0x1e1c1a, false, 170);
  if (SPARKLY.has(itemId)) {
    // 반짝 별 (병 왼쪽 위)
    g.set(1, 2, 0xfff6c8);
    g.set(0, 2, 0xfff6c8, 150);
    g.set(2, 2, 0xfff6c8, 150);
    g.set(1, 1, 0xfff6c8, 150);
    g.set(1, 3, 0xfff6c8, 150);
    g.set(13, 4, 0xffffff);
  }
  // 떨어지는 물방울
  g.set(14, 12, bands[bands.length - 1]);
  g.set(14, 13, bands[bands.length - 1]);
  return g;
}

// ── 11/15 수집 의뢰 염색권 (등급 색: 색 확정 = 고급 파랑, 특수색 확정 = 희귀 보라) ──

/** 0..1 색상 → 맑은 색 (색상환) */
function hueRgb(h: number, s = 0.85, v = 1): number {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

/** 색 확정 염색권: 색상환 원판 + 고른 색을 콕 집는 파란 스포이트 */
function pickIcon(): Grid {
  const g = new Grid(16, 16);
  const cx = 6.5;
  const cy = 9.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > 6.2) continue;
      if (d < 2.3) {
        g.set(x, y, 0xfaf6ec);
        continue;
      }
      const h = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      // 아래 오른쪽은 살짝 어둡게 (입체감)
      g.set(x, y, hueRgb(h, d < 3.4 ? 0.5 : 0.85, dx + dy > 4 ? 0.82 : 1));
    }
  // 스포이트 (오른쪽 위에서 원판 가운데로): 고무 꼭지(고급 파랑) · 유리 대롱(고른 색이 차오름) · 끝
  g.rect(12, 1, 3, 3, 0x3a74b4);
  g.set(12, 1, 0x7ab0f0);
  g.set(13, 1, 0x6aa4e4);
  g.set(14, 3, 0x2a5a94);
  g.set(11, 4, 0xe8f2f8);
  g.set(12, 4, 0xb8cede);
  g.set(10, 5, 0xff6a8a);
  g.set(11, 5, 0xd04a6a);
  g.set(9, 6, 0xff6a8a);
  g.set(10, 6, 0xd04a6a);
  g.set(8, 7, 0x3a3632);
  g.outline(0x1e1c1a, false, 190);
  // 확정 반짝 (왼쪽 위)
  g.set(1, 1, 0xffffff);
  g.set(0, 1, 0xc8dcff, 170);
  g.set(2, 1, 0xc8dcff, 170);
  g.set(1, 0, 0xc8dcff, 170);
  g.set(1, 2, 0xc8dcff, 170);
  return g;
}

/** 특수색 확정 염색권: 네 칸(금빛 광택·반짝이·무지개·야광)으로 나뉜 둥근 병 + 보랏빛 별 */
function specialIcon(): Grid {
  const g = new Grid(16, 16);
  // 마개 (희귀 보라)
  g.rect(6, 1, 4, 2, 0x8a4ad0);
  g.set(6, 1, 0xb88af0);
  g.rect(7, 3, 2, 1, 0xd8d0c0);
  // 둥근 병: 네 칸
  const cx = 8;
  const cy = 9.5;
  for (let y = 4; y < 16; y++)
    for (let x = 1; x < 15; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy * 1.15 > 30) continue;
      const left = dx < 0;
      const top = dy < 0;
      let c: number;
      if (top && left) c = (x + y) % 3 === 0 ? 0xfff0a0 : y < 7 ? 0xf2c84a : 0xc8962a; // 금빛 광택
      else if (top) c = (x * 3 + y) % 5 === 0 ? 0xffffff : 0x8fb4ff; // 반짝이
      else if (left) c = hueRgb(((y - 9) / 6 + 0.02) % 1, 0.8, 1); // 무지개 띠
      else c = dx * dx + dy * dy < 9 ? 0xd8ffe8 : 0x6af0a8; // 야광
      g.set(x, y, c);
    }
  // 칸 사이 유리 이음
  g.vline(8, 5, 14, 0xe8e0f8);
  g.hline(3, 13, 9, 0xe8e0f8);
  g.outline(0x1e1c1a, false, 190);
  // 보랏빛 별 (오른쪽 위) + 작은 반짝
  g.set(13, 2, 0xffffff);
  g.set(12, 2, 0xc8a0ff);
  g.set(14, 2, 0xc8a0ff);
  g.set(13, 1, 0xc8a0ff);
  g.set(13, 3, 0xc8a0ff);
  g.set(2, 3, 0xe8d8ff, 200);
  return g;
}
