import { Grid } from "./pixel";

// 23번 확성기 아이콘 (16×16). 전체 확성기(mega_all)는 금색 몸통 + 퍼지는 소리 줄이 더 많다

export const MEGAPHONE_ICON_IDS = ["mega_ch", "mega_all"] as const;

export function megaphoneIcon(itemId: string): Grid | null {
  if (itemId !== "mega_ch" && itemId !== "mega_all") return null;
  const all = itemId === "mega_all";
  const g = new Grid(16, 16);
  const body = all ? 0xe0b54a : 0xc8463c;
  const dark = all ? 0xa87a26 : 0x8e2f28;
  const light = all ? 0xfbe39a : 0xe8786a;
  // 손잡이
  g.rect(3, 9, 2, 4, 0x6a5a48);
  // 뒤쪽 좁은 입
  g.rect(2, 6, 3, 4, dark);
  // 나팔 (오른쪽으로 넓어진다)
  for (let x = 5; x <= 11; x++) {
    const half = 2 + Math.floor((x - 5) / 2);
    g.vline(x, 8 - half, 7 + half, body);
    g.set(x, 8 - half, light);
  }
  g.vline(11, 3, 12, dark);
  g.outline(0x1e1c1a, false, 170);
  // 소리 줄
  const wave = all ? 0xffe8a0 : 0xffffff;
  for (const [x, y] of [[13, 5], [14, 7], [14, 8], [13, 10]]) g.set(x, y, wave);
  if (all) for (const [x, y] of [[15, 3], [15, 12], [13, 1], [13, 14]]) g.set(x, y, wave, 200);
  return g;
}
