import { darken, Grid, lighten, type Color } from "../sprites/pixel";
import { toneOutline } from "../sea/seaArt";

// 11/16 망원경 늘리기 — 캠핑장 별 망원경·바닷가 동전 망원경 그림 (코드로 그리는 픽셀아트, Phaser 없음).
// 원점 = 받침 가운데 아래 (0.5, 1). 마을 망원경은 world/life/sprites.ts의 놋쇠 망원경을 그대로 쓴다.
//  - 캠핑장: 캠핑장 소품처럼 따뜻한 짙은 갈색 테(campArt OUT과 같은 색), 나무 삼각대 + 짙은 초록 경통·놋쇠 띠
//  - 바닷가: 파스텔 바닷가 그림처럼 제 색에서 나온 연한 테(seaArt toneOutline), 민트색 쌍안 머리·동전 상자·둥근 받침

export const SCOPE_TEX = {
  camp: "scope-camp",
  coin: "scope-coin",
} as const;

/** 캠핑장 그림 테 (campArt.ts OUT과 같은 색) */
const CAMP_OUT: Color = 0x2c2018;

/** 캠핑장 별 망원경 (20×26): 통나무색 삼각대 위에 짙은 초록 경통이 하늘(오른쪽 위)을 본다 */
export function campScopeGrid(): Grid {
  const g = new Grid(20, 26);
  const wood = 0x8a5a34;
  const woodHi = lighten(wood, 0.22);
  const woodLo = darken(wood, 0.25);
  // 삼각대: 앞 다리 둘 + 가운데 뒷다리(어둡게), 다리 끝 고무 발
  for (let i = 0; i < 12; i++) {
    const y = 13 + i;
    g.set(10 - Math.round(i * 0.5), y, i < 2 ? woodHi : wood);
    g.set(10 + Math.round(i * 0.5), y, i < 2 ? woodHi : woodLo);
    if (i < 10) g.set(10, y, darken(wood, 0.4));
  }
  g.set(4, 24, 0x3a3030);
  g.set(16, 24, 0x3a3030);
  // 다리를 묶는 가죽 끈
  g.hline(8, 12, 18, 0x6a4a2a);
  // 받침 머리 (놋쇠 축)
  g.rect(9, 11, 3, 2, 0xc89848);
  g.set(10, 11, 0xf0d088);
  // 경통 (왼쪽 아래 접안 → 오른쪽 위 대물, 굵기 3)
  const tube = 0x3e6a4c;
  for (let i = 0; i < 13; i++) {
    const x = 3 + i;
    const y = 13 - Math.round(i * 0.7);
    g.set(x, y - 1, lighten(tube, 0.25));
    g.set(x, y, tube);
    g.set(x, y + 1, darken(tube, 0.3));
  }
  // 놋쇠 띠 둘 + 대물렌즈 테 + 접안렌즈
  for (const i of [3, 8]) {
    const x = 3 + i;
    const y = 13 - Math.round(i * 0.7);
    g.vline(x, y - 1, y + 1, 0xd8a850);
  }
  g.rect(15, 2, 3, 4, 0xd8a850);
  g.set(16, 3, 0xbfe8ff);
  g.set(17, 2, 0xfff4d0);
  g.rect(1, 12, 3, 3, 0x2a2a30);
  g.set(1, 13, 0x5a5a66);
  g.outline(CAMP_OUT, false, 220);
  return g;
}

/** 바닷가 색 (seaArt RAMP와 같은 단계에서 고른 색) */
const MINT = [0xc9eadc, 0xaddfcb, 0x91cfb8, 0x79bca5, 0x5fa08c] as const;
const GLASS = [0xe8f8fb, 0x94d3e6, 0x4588b5, 0x2f5f86] as const;
const BUTTER = 0xf1cd7e;
const STEEL = [0xe2e7ea, 0xccd4da, 0xb3bec7, 0x9aa8b4] as const;

/** 바닷가 동전 망원경 (22×32): 둥근 받침 + 기둥 + 동전 상자 + 바다를 보는 쌍안 머리 (렌즈 둘이 이쪽을 본다) */
export function coinScopeGrid(): Grid {
  const g = new Grid(22, 32);
  const cx = 11;
  // 둥근 받침 (위는 밝게, 아랫단은 한 단계 짙게)
  g.ellipse(cx, 29, 6, 2, STEEL[2]);
  g.ellipse(cx, 28.5, 5, 1.5, STEEL[1]);
  g.hline(cx - 2, cx + 2, 28, STEEL[0]);
  // 기둥 (빛은 왼쪽)
  for (let y = 15; y <= 28; y++) {
    g.set(cx - 1, y, MINT[1]);
    g.set(cx, y, MINT[2]);
    g.set(cx + 1, y, MINT[3]);
  }
  // 동전 상자 (버터색 동전 구멍)
  g.rect(cx - 3, 17, 7, 5, MINT[2]);
  g.hline(cx - 3, cx + 3, 17, MINT[1]);
  g.vline(cx + 3, 17, 21, MINT[3]);
  g.hline(cx - 3, cx + 3, 21, MINT[3]);
  g.vline(cx, 18, 19, darken(BUTTER, 0.35));
  g.set(cx - 1, 18, BUTTER);
  // 머리를 잡는 목 (돌아가는 축)
  g.rect(cx - 2, 13, 5, 2, MINT[3]);
  g.hline(cx - 2, cx + 2, 13, MINT[2]);
  // 쌍안 머리 (위 차양이 조금 더 넓다)
  g.rect(cx - 8, 5, 17, 8, MINT[2]);
  g.hline(cx - 9, cx + 9, 4, MINT[1]);
  g.hline(cx - 8, cx + 8, 3, MINT[0]);
  g.hline(cx - 8, cx + 8, 5, MINT[1]);
  g.hline(cx - 8, cx + 8, 12, MINT[3]);
  g.vline(cx + 8, 5, 12, MINT[3]);
  // 렌즈 둘 (짙은 유리 + 밝은 반짝임, 테는 한 단계 짙은 민트)
  for (const lx of [cx - 4, cx + 4]) {
    g.ellipse(lx, 8.5, 3, 3, MINT[4]);
    g.ellipse(lx, 8.5, 2.2, 2.2, GLASS[2]);
    g.set(lx, 9, GLASS[3]);
    g.set(lx + 1, 9, GLASS[3]);
    g.set(lx - 1, 7, GLASS[0]);
    g.set(lx, 7, GLASS[1]);
  }
  // 오른쪽 손잡이
  g.hline(cx + 9, cx + 10, 9, STEEL[3]);
  g.vline(cx + 10, 9, 12, STEEL[3]);
  g.set(cx + 10, 12, STEEL[2]);
  toneOutline(g);
  // 발밑 그림자 (테 밖, 아주 옅게 — 바닷가 소품과 같은 규칙: 맨 아래 줄 근처는 그림자)
  for (let x = cx - 6; x <= cx + 6; x++) if (!g.filled(x, 31)) g.set(x, 31, 0x5a463a, 60);
  return g;
}
