import { Grid, type Color } from "./pixel";

// 12월 크리스마스 선물상자 여는 장면의 조각 그림 (가방 [열기] 창 — components/xmas/XmasBoxOpen이 CSS로 움직인다).
// 상자 몸통·뚜껑·리본 띠(몸통·뚜껑)·리본 고리 둘·매듭을 따로 그려서, 열 때 리본이 풀리고(고리가 양옆으로 날아가고 띠가 흘러내린다)
// 뚜껑이 튀어 오르게 한다. 단위 = 그림 1px (창에서 정수 배로 키운다)

const RED = 0xd42c3c;
const RED_HI = 0xf0505a;
const RED_LO = 0x9a1c2c;
const RED_DEEP = 0x6e1220;
const GOLD = 0xf2c84a;
const GOLD_HI = 0xfff2b0;
const GOLD_LO = 0xb88a22;
const SNOW = 0xfbf8f2;
const SNOW_LO = 0xd8dce6;
const LINE = 0x2a0a10;

/** 장면 전체 크기 (그림 px) */
export const XBOX_W = 44;
export const XBOX_H = 44;

/** 조각: 그림과 장면 안 자리 (x, y = 외곽선 여백을 포함한 왼쪽 위) */
export type XmasBoxPiece = { id: "body" | "lid" | "bandBody" | "bandLid" | "loopL" | "loopR" | "knot"; x: number; y: number; grid: Grid };

/** 둘레 1px 여백을 두고 외곽선 (조각 끝까지 칠해도 외곽선이 잘리지 않게) */
function pad(g: Grid, line: Color, a = 255): Grid {
  const o = new Grid(g.w + 2, g.h + 2);
  o.draw(g, 1, 1);
  o.outline(line, false, a);
  return o;
}

function body(): Grid {
  const w = 30;
  const h = 18;
  const g = new Grid(w, h);
  g.rect(0, 0, w, h, RED);
  g.vline(0, 0, h - 1, RED_HI);
  g.vline(1, 1, h - 2, RED_HI);
  g.rect(w - 3, 0, 3, h, RED_LO);
  g.hline(0, w - 1, h - 1, RED_DEEP);
  g.hline(0, w - 1, 0, RED_DEEP); // 뚜껑 그림자
  // 은은한 눈꽃 무늬 (상자 옆면 무늬)
  for (const [x, y] of [[6, 5], [23, 11], [8, 13]] as const) {
    g.set(x, y, 0xf0707a);
    g.set(x - 1, y, 0xe84a58);
    g.set(x + 1, y, 0xe84a58);
    g.set(x, y - 1, 0xe84a58);
    g.set(x, y + 1, 0xe84a58);
  }
  return pad(g, LINE);
}

function lid(): Grid {
  const w = 34;
  const h = 8;
  const g = new Grid(w, h);
  g.rect(0, 1, w, h - 1, RED);
  g.hline(1, w - 2, 0, RED_HI);
  g.hline(0, w - 1, 1, RED_HI);
  g.rect(w - 3, 1, 3, h - 1, RED_LO);
  g.hline(0, w - 1, h - 1, RED_LO);
  // 뚜껑 위에 쌓인 눈
  for (let x = 2; x < w - 2; x++) if ((x * 7) % 5 !== 0) g.set(x, 0, x % 3 ? SNOW : SNOW_LO);
  g.set(5, 1, SNOW);
  g.set(26, 1, SNOW);
  return pad(g, LINE);
}

function band(h: number): Grid {
  const g = new Grid(4, h);
  for (let y = 0; y < h; y++) {
    g.set(0, y, GOLD_HI);
    g.set(1, y, GOLD);
    g.set(2, y, GOLD);
    g.set(3, y, GOLD_LO);
  }
  return pad(g, 0x5a3a08, 200);
}

/** 리본 고리 (오른쪽 고리 = 왼쪽 고리 좌우 반전) */
function loop(): Grid {
  const rows = ["..yyyy....", ".yYYyyy...", "yYy..yyyy.", "yy.....yyy", "yy......yy", ".yy....yyy", "..yyyyyyy.", "...LLLL..."];
  const pal: Record<string, Color> = { y: GOLD, Y: GOLD_HI, L: GOLD_LO };
  const g = new Grid(10, 8);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(x, y, pal[ch])));
  return pad(g, 0x5a3a08, 220);
}

function knot(): Grid {
  const g = new Grid(4, 4);
  g.rect(0, 0, 4, 4, GOLD);
  g.hline(0, 3, 0, GOLD_HI);
  g.set(1, 1, 0xffffff);
  g.hline(0, 3, 3, GOLD_LO);
  return pad(g, 0x5a3a08, 220);
}

/** 장면 조각 전부 (그리는 순서 = 아래 → 위) */
export function xmasBoxPieces(): XmasBoxPiece[] {
  return [
    { id: "body", x: 6, y: 23, grid: body() },
    { id: "bandBody", x: 19, y: 23, grid: band(18) },
    { id: "lid", x: 4, y: 16, grid: lid() },
    { id: "bandLid", x: 19, y: 16, grid: band(8) },
    { id: "loopL", x: 10, y: 9, grid: loop() },
    { id: "loopR", x: 22, y: 9, grid: loop().mirrored() },
    { id: "knot", x: 19, y: 13, grid: knot() },
  ];
}
