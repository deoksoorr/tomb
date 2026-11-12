import { isFixedDyeId } from "@tomb/protocol";
import { Grid, parseHex } from "./pixel";

// 46번 염색권 아이콘 (16×16): 물감 병 + 물방울. 등급이 높을수록 물감 띠가 다양해진다 (무지개는 일곱 색).
// 고정 색 염색권(dyefix_*)은 그 색을 몰라도 그릴 수 있게 color를 받는다 (없으면 분홍)

export const DYE_ICON_IDS = ["dye_basic", "dye_vivid", "dye_pastel", "dye_neon", "dye_fine", "dye_metal", "dye_rainbow", "dye_sparkle"] as const;

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
