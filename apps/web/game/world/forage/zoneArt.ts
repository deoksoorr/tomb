import type * as Phaser from "phaser";
import { darken, Grid, lighten } from "../../sprites/pixel";
import { BUS_BAY, BUS_PLATFORM, BUS_SHELTER_H, BUS_SHELTER_W, BUS_SIGN_H, BUS_TIMETABLE_H, WHARF_BOARD_H, WHARF_BOARD_W, WHARF_CURB, type FishDecorKind } from "../fishZone";

// 낚시 자리·버스 정류장 마당 그림 (코드로 그리는 픽셀아트): 어부 노점 옆 물고기 상자·물통, 의뢰 게시판·긴급 의뢰 현판·정류장,
// 낚시 자리 표시(나무 낚시 의자 + 물결 고리 + 손짓 표시). 발 위치 = 그림 맨 아래 줄 가운데. 11/15 납품 부두 아치·그물 대·통발·등불 기둥은 부두와 함께 없앴다.

export const ZTEX = {
  decor: (k: FishDecorKind) => `fishzone-${k}`,
  stool: "fishzone-stool",
  ripple: (f: number) => `fishzone-ripple-${f}`,
  hook: "fishzone-hook",
  busBay: "fishzone-bus-bay",
  /** 11/15 정류장 승강장 바닥 · 위 마당 테두리 연석 */
  busPlatform: "fishzone-bus-platform",
  wharfCurb: "fishzone-wharf-curb",
} as const;

const OUT = 0x16121a;
const WOOD = 0x8a5e36;
const WOOD_DARK = 0x5e3e22;
const LAMP = 0xffd27a;

/** 물고기 상자 (두 단): 얼음·생선 꼬리가 삐죽. 18×16 */
function crates(): HTMLCanvasElement {
  const g = new Grid(18, 16);
  const box = (x: number, y: number, w: number, h: number) => {
    g.rect(x, y, w, h, WOOD);
    g.hline(x, x + w - 1, y, lighten(WOOD, 0.18));
    g.hline(x, x + w - 1, y + Math.floor(h / 2), WOOD_DARK);
    g.vline(x + w - 1, y, y + h - 1, WOOD_DARK);
  };
  box(1, 9, 16, 6);
  box(3, 4, 12, 5);
  g.hline(4, 13, 4, 0xd8eef8);
  for (const [x, c] of [[5, 0x8aa0b0], [9, 0xc0905a], [12, 0x7a9a6a]] as const) {
    g.set(x, 3, c);
    g.set(x + 1, 2, c);
    g.set(x - 1, 2, c);
  }
  g.set(15, 8, 0xd8eef8);
  g.outline(OUT);
  return g.toCanvas();
}

/** 물통: 쇠테 두른 나무통 + 물. 12×13 */
function barrel(): HTMLCanvasElement {
  const g = new Grid(12, 13);
  g.rect(1, 2, 10, 10, WOOD);
  g.ellipse(6, 2.5, 5, 1.6, 0x3d6878);
  g.set(4, 2, 0x8ac0d8);
  for (const y of [5, 9]) g.hline(1, 10, y, 0x5a5a64);
  g.vline(1, 2, 11, lighten(WOOD, 0.15));
  g.vline(10, 2, 11, WOOD_DARK);
  g.outline(OUT);
  return g.toCanvas();
}

/** 낚시 의자: 낮은 나무 의자 + 미끼 통. 앉으면 사람에 가려진다. 12×8 */
function stool(): HTMLCanvasElement {
  const g = new Grid(12, 8);
  g.rect(1, 2, 8, 2, 0xb07a44);
  g.hline(1, 8, 2, 0xd09a5a);
  g.vline(2, 4, 6, WOOD_DARK);
  g.vline(7, 4, 6, WOOD_DARK);
  // 미끼 통 (파란 양동이)
  g.rect(9, 3, 3, 4, 0x4a7aa8);
  g.hline(9, 11, 3, 0x7aaad8);
  g.outline(OUT, false, 220);
  return g.toCanvas();
}

/** 물결 고리 (2프레임: 작은 고리·큰 고리). 13×5 */
function ripple(f: number): HTMLCanvasElement {
  const g = new Grid(13, 5);
  const c = 0xd8f0ff;
  if (f === 0) {
    g.hline(4, 8, 1, c);
    g.hline(4, 8, 3, c);
    g.set(3, 2, c);
    g.set(9, 2, c);
  } else {
    g.hline(3, 9, 0, c);
    g.hline(3, 9, 4, c);
    g.set(1, 1, c);
    g.set(11, 1, c);
    g.set(1, 3, c);
    g.set(11, 3, c);
    g.set(0, 2, c);
    g.set(12, 2, c);
  }
  return g.toCanvas();
}

/** 가까이 오면 의자 위에 뜨는 표시: 말풍선 안 낚싯바늘. 9×11 */
function hook(): HTMLCanvasElement {
  const g = new Grid(9, 11);
  g.rect(0, 0, 9, 9, 0xfff6d8);
  for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.set(x, y, 0, 0); // 둥근 모서리 (투명)
  g.set(4, 9, 0xfff6d8);
  // 바늘
  const m = 0x2a5a7a;
  g.vline(5, 1, 6, m);
  g.hline(3, 4, 7, m);
  g.vline(2, 5, 6, m);
  g.set(2, 4, 0xe03a2a);
  g.set(5, 1, 0x6a6a74);
  g.outline(OUT);
  return g.toCanvas();
}

// ── 11/15 버스 정류장 마당 (의뢰 게시판·긴급 의뢰 현판) ──

/** 의뢰 게시판: 지붕 얹은 큰 나무 판 + 쪽지 여러 장(핀) + 꼭대기 작은 등. 글씨 "의뢰 게시판"은 이름표로 위에 얹는다. 56×48 */
function questBoard(): HTMLCanvasElement {
  const W = WHARF_BOARD_W;
  const H = WHARF_BOARD_H;
  const g = new Grid(W, H);
  // 기둥 둘
  for (const x0 of [5, W - 9]) {
    g.rect(x0, 12, 4, H - 13, WOOD_DARK);
    g.vline(x0, 12, H - 2, WOOD);
  }
  // 지붕 (양끝이 살짝 들린 널판)
  g.rect(1, 6, W - 2, 4, 0x6a3a26);
  g.hline(1, W - 2, 6, 0x8a5236);
  g.hline(3, W - 4, 5, 0x8a5236);
  g.set(0, 5, 0x6a3a26);
  g.set(W - 1, 5, 0x6a3a26);
  // 꼭대기 등 (밤 빛 = FISH_ZONE_LIGHTS)
  const cx = W / 2;
  g.rect(cx - 2, 0, 4, 4, LAMP);
  g.set(cx - 1, 1, 0xfff2c0);
  g.hline(cx - 2, cx + 1, 4, 0x4a3a2a);
  // 판 (코르크빛 + 나무 테)
  const bx0 = 3;
  const bx1 = W - 4;
  const by0 = 11;
  const by1 = 36;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, WOOD);
  g.rect(bx0 + 2, by0 + 2, bx1 - bx0 - 3, by1 - by0 - 3, 0xc89a62);
  for (let y = by0 + 3; y < by1 - 1; y += 3) for (let x = bx0 + 3 + (y % 2); x < bx1 - 1; x += 4) g.set(x, y, 0xb88a54);
  g.hline(bx0, bx1, by0, lighten(WOOD, 0.2));
  g.hline(bx0, bx1, by1, WOOD_DARK);
  // 쪽지 (크림·하늘·연분홍) + 빨간·파란 핀 + 글줄
  const notes: [number, number, number, number, number, number][] = [
    [7, 14, 10, 9, 0xfff6dc, 0xd84a3a],
    [19, 15, 9, 8, 0xd8ecff, 0x3a6ad8],
    [30, 13, 11, 10, 0xfff6dc, 0xd84a3a],
    [43, 15, 8, 9, 0xffe0e8, 0x3aa85a],
    [10, 25, 9, 8, 0xffe0e8, 0x3a6ad8],
    [22, 25, 12, 9, 0xfff6dc, 0xe0a030],
    [37, 26, 9, 7, 0xd8ecff, 0xd84a3a],
  ];
  for (const [x, y, w, h, c, pin] of notes) {
    g.rect(x, y, w, h, c);
    g.hline(x, x + w - 1, y + h - 1, darken(c, 0.12));
    for (let ly = y + 3; ly < y + h - 1; ly += 2) g.hline(x + 1, x + w - 3, ly, darken(c, 0.32));
    g.set(x + (w >> 1), y, pin);
  }
  // 다리 사이 가로대
  g.rect(7, 40, W - 14, 2, WOOD_DARK);
  g.outline(OUT);
  for (let x = 6; x < W - 6; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/** 긴급 의뢰 현판 자리: 빈 종이를 끼운 작은 나무 틀 (나중에 진행 막대를 그릴 자리). 24×30 */
function placard(): HTMLCanvasElement {
  const g = new Grid(24, 30);
  g.rect(10, 18, 4, 11, WOOD_DARK);
  g.vline(10, 18, 28, WOOD);
  g.rect(1, 2, 22, 17, WOOD);
  g.hline(1, 22, 2, lighten(WOOD, 0.2));
  g.rect(3, 4, 18, 13, 0xf4ead2);
  g.hline(3, 20, 16, 0xd8ccb0);
  // 위쪽 빨간 띠 (긴급 표시 자리) — 지금은 바랜 색
  g.rect(3, 4, 18, 2, 0xc8a090);
  g.outline(OUT);
  for (let x = 7; x < 17; x++) g.set(x, 29, 0x000000, 60);
  return g.toCanvas();
}

// ── 11/15 주말 버스 정류장 (예전 기록 수족관 자리) ──
const ROOF = { hi: 0x7fb08a, mid: 0x5a8a66, lo: 0x3e6a4c };
const STEEL = { hi: 0xb8bcc0, mid: 0x8a9096, lo: 0x5e646a };

/** 정류장 지붕: 둥근 초록 지붕(흰 테) + 기둥 넷 + 뒷벽 유리(캠핑장 포스터 한 장) + 지붕 아래 작은 등. 벤치는 가구(bE)가 따로. 64×50 */
function busShelter(): HTMLCanvasElement {
  const W = BUS_SHELTER_W;
  const H = BUS_SHELTER_H;
  const g = new Grid(W, H);
  // 뒷벽 유리 (지붕 아래 안쪽, 반투명 하늘빛 + 테)
  const gy0 = 14;
  const gy1 = 30;
  g.rect(5, gy0, W - 10, gy1 - gy0 + 1, 0x9fc8d8, 150);
  g.hline(5, W - 6, gy0, STEEL.mid);
  g.hline(5, W - 6, gy1, STEEL.lo);
  for (const x of [5, W >> 1, W - 6]) g.vline(x, gy0, gy1, STEEL.mid);
  // 유리 반사
  for (let k = 0; k < 6; k++) g.set(9 + k, gy0 + 9 - k, 0xe8f6ff, 200);
  for (let k = 0; k < 4; k++) g.set(W - 14 + k, gy0 + 7 - k, 0xe8f6ff, 200);
  // 포스터 (캠핑장: 밤하늘·산·텐트·모닥불)
  const px = (W >> 1) + 4;
  const py = gy0 + 2;
  g.rect(px, py, 14, 12, 0x2a3a5a);
  g.set(px + 3, py + 2, 0xfff2c0);
  g.set(px + 10, py + 1, 0xfff2c0);
  for (let k = 0; k < 6; k++) g.hline(px + k, px + 13 - k, py + 6 + k > py + 11 ? py + 11 : py + 6 + k, 0x3a5a4a);
  g.rect(px, py + 9, 14, 3, 0x4a7a4a);
  g.set(px + 4, py + 7, 0xe8a040);
  g.hline(px + 3, px + 5, py + 8, 0xe8a040);
  g.hline(px + 2, px + 6, py + 9, 0xd8803a);
  g.set(px + 10, py + 9, 0xffb040);
  g.set(px + 10, py + 8, 0xffd060);
  // 기둥 (앞 둘은 몸 앞에서도 보인다 — 가늘게)
  for (const x of [3, W - 5]) {
    g.rect(x, 10, 2, H - 12, STEEL.mid);
    g.vline(x, 10, H - 3, STEEL.hi);
  }
  for (const x of [6, W - 8]) g.vline(x, 10, gy1, STEEL.lo);
  // 지붕 (둥글게 휜 판 + 흰 테 + 처마 그림자)
  for (let x = 0; x < W; x++) {
    const t = (x - (W - 1) / 2) / ((W - 1) / 2);
    const top = 2 + Math.round(t * t * 4);
    for (let y = top; y <= 10; y++) g.set(x, y, y === top ? ROOF.hi : y >= 9 ? ROOF.lo : ROOF.mid);
    g.set(x, 11, 0xf0ece0);
  }
  for (let x = 4; x < W - 4; x += 6) g.vline(x, 4, 9, ROOF.lo);
  // 지붕 아래 등 (밤 빛 = FISH_ZONE_LIGHTS)
  const lx = W >> 1;
  g.rect(lx - 3, 12, 6, 2, 0x4a4a52);
  g.hline(lx - 2, lx + 1, 14, 0xfff0c8);
  // 바닥 판 (포장 위 한 단 높은 승강장)
  g.rect(1, H - 3, W - 2, 2, 0xb0aa9a);
  g.hline(1, W - 2, H - 3, 0xd0cab8);
  g.outline(OUT);
  for (let x = 2; x < W - 2; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/** 노선 팻말: 줄무늬 기둥 + 둥근 버스 표지(파란 판·흰 버스) + 아래 작은 판(텐트 그림). 18×44 */
function busSign(): HTMLCanvasElement {
  const W = 18;
  const H = BUS_SIGN_H;
  const g = new Grid(W, H);
  const cx = W >> 1;
  // 기둥 (흰·빨강 줄무늬)
  for (let y = 14; y < H - 1; y++) {
    const c = Math.floor(y / 4) % 2 ? 0xe8e4dc : 0xc8483a;
    g.set(cx - 1, y, c);
    g.set(cx, y, darken(c, 0.15));
  }
  // 둥근 표지판
  g.ellipse(cx, 7.5, 7.5, 7.5, 0x3a6ac8);
  g.ellipse(cx, 7.5, 6, 6, 0x4a86e0);
  // 흰 버스 (옆모습)
  g.rect(cx - 4, 4, 8, 5, 0xffffff);
  g.hline(cx - 3, cx + 2, 5, 0x4a86e0);
  g.set(cx - 3, 10, 0x1f1d1a);
  g.set(cx + 2, 10, 0x1f1d1a);
  g.hline(cx - 4, cx + 3, 9, 0xffffff);
  // 아래 작은 판: 텐트 (캠핑장행)
  g.rect(cx - 6, 18, 12, 8, 0xf4ead2);
  g.hline(cx - 6, cx + 5, 18, 0xd8ccb0);
  for (let k = 0; k < 4; k++) g.hline(cx - k - 1, cx + k, 20 + k, 0x4a7a4a);
  g.set(cx, 23, 0x2a3a2a);
  g.outline(OUT);
  for (let x = cx - 3; x <= cx + 3; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/** 시간표 판: 다리 둘 + 흰 종이(줄 몇 개, 맨 위 시계). 16×28 */
function timetable(): HTMLCanvasElement {
  const W = 16;
  const H = BUS_TIMETABLE_H;
  const g = new Grid(W, H);
  for (const x of [3, W - 4]) g.vline(x, 14, H - 2, STEEL.lo);
  g.rect(1, 1, W - 2, 15, STEEL.mid);
  g.rect(2, 2, W - 4, 13, 0xf6f2e8);
  // 시계
  g.ellipse(5, 5, 2.2, 2.2, 0x2a2a30);
  g.set(5, 4, 0xf6f2e8);
  g.set(6, 5, 0xf6f2e8);
  // 줄 (시간 칸 — 모두 "언젠가")
  for (const y of [5, 8, 10, 12]) g.hline(y === 5 ? 9 : 4, W - 4, y, y === 5 ? 0xc8483a : 0x9a948a);
  g.outline(OUT);
  for (let x = 3; x < W - 3; x++) g.set(x, H - 1, 0x000000, 60);
  return g.toCanvas();
}

/**
 * 골목 바닥 버스 정차 칸 (11/15 다시 그림): 연석 쪽(위 변)을 따라 노란 지그재그, 양 끝 노란 막대, 가운데 흰 "BUS" — 버스 몸이 꼭 들어가는 길이.
 * 예전엔 칸이 골목 가운데에 떠 있고 지그재그가 골목 바깥쪽에 있었다
 */
function busBay(): HTMLCanvasElement {
  const W = BUS_BAY.w;
  const H = BUS_BAY.h;
  const g = new Grid(W, H);
  const Y = 0xe8c040;
  const a = 210;
  // 연석 쪽 지그재그 (위 변을 따라 위아래로)
  for (let x = 0; x < W; x++) {
    const p = x % 8;
    const y = 1 + (p < 4 ? p : 8 - p);
    g.set(x, y, Y, a);
  }
  // 양 끝 막대 (칸의 앞뒤)
  for (const x of [0, 1, W - 2, W - 1]) g.rect(x, 0, 1, H - 3, Y, a);
  // 골목 가운데 쪽 경계: 짧은 흰 점선
  for (let x = 4; x < W - 4; x++) if (x % 10 < 5) g.set(x, H - 2, 0xe8e2d0, 120);
  // BUS (3×5 글자, 칸 가운데)
  const F: Record<string, string[]> = {
    B: ["110", "101", "111", "101", "110"],
    U: ["101", "101", "101", "101", "111"],
    S: ["111", "100", "111", "001", "111"],
  };
  const tx = (W >> 1) - 11;
  [..."BUS"].forEach((ch, k) =>
    F[ch].forEach((row, y) => [...row].forEach((v, x) => v === "1" && g.rect(tx + k * 8 + x * 2, 8 + y * 2, 2, 2, 0xf0e8d0, 150))),
  );
  return g.toCanvas();
}

/**
 * 정류장 승강장 (11/15): 자갈 마당 위에 한 단 높인 포장 바닥. 네모 판석 + 골목 쪽 노란 점자 블록 띠 + 아래 변 연석(위 밝은 줄·옆면·그림자).
 * 지붕·시간표·팻말이 이 위에 서서 한 정류장으로 읽힌다
 */
function busPlatform(): HTMLCanvasElement {
  const W = BUS_PLATFORM.w;
  const H = BUS_PLATFORM.h;
  const g = new Grid(W, H);
  const SLAB = 0xb4ae9f;
  for (let y = 1; y < H - 4; y++)
    for (let x = 1; x < W - 1; x++) {
      const joint = x % 14 === 0 || y % 12 === 0;
      const n = ((x * 7 + y * 13) % 11) / 11;
      g.set(x, y, joint ? darken(SLAB, 0.16) : n > 0.82 ? lighten(SLAB, 0.06) : n < 0.12 ? darken(SLAB, 0.05) : SLAB);
    }
  // 가장자리 (자갈과 만나는 테)
  g.hline(0, W - 1, 0, darken(SLAB, 0.3));
  g.vline(0, 0, H - 4, darken(SLAB, 0.3));
  g.vline(W - 1, 0, H - 4, darken(SLAB, 0.3));
  // 노란 점자 블록 띠 (연석에서 한 뼘 안쪽)
  const ty = H - 10;
  g.rect(2, ty, W - 4, 3, 0xd8b03a);
  for (let x = 3; x < W - 3; x += 2) g.set(x, ty + 1, 0xf0d070);
  // 연석: 위 밝은 줄 · 옆면 · 아래 그림자
  g.hline(0, W - 1, H - 4, 0xddd8ca);
  g.rect(0, H - 3, W, 2, 0x8e897d);
  for (let x = 0; x < W; x += 9) g.vline(x, H - 3, H - 2, 0x6e6a60);
  for (let x = 0; x < W; x++) g.set(x, H - 1, 0x000000, 70);
  // 배수구 (오른쪽 끝)
  g.rect(W - 16, H - 7, 8, 2, 0x4a4a48);
  for (let x = W - 15; x < W - 8; x += 2) g.set(x, H - 7, 0x2a2a28);
  return g.toCanvas();
}

/** 위 마당 테두리 연석 (11/15): 자갈 마당 네 변에 낮은 판석 테 — 골목·광장과 마당이 갈리게. 안쪽은 비어 있다 (자갈과 비슷한 톤으로 은은하게) */
function wharfCurb(): HTMLCanvasElement {
  const W = WHARF_CURB.w;
  const H = WHARF_CURB.h;
  const g = new Grid(W, H);
  const C = 0x857f74;
  const HI = 0xa29c90;
  const stone = (along: number) => (along % 10 === 0 ? darken(C, 0.22) : C);
  for (let x = 0; x < W; x++) {
    g.set(x, 0, stone(x));
    g.set(x, 1, HI, 200);
    g.set(x, H - 2, stone(x));
    g.set(x, H - 1, darken(C, 0.3));
  }
  for (let y = 0; y < H; y++) {
    g.set(0, y, stone(y));
    g.set(1, y, HI, 200);
    g.set(W - 1, y, stone(y));
    g.set(W - 2, y, darken(C, 0.08), 200);
  }
  return g.toCanvas();
}

const DECOR_ART: Record<FishDecorKind, () => HTMLCanvasElement> = { crates, barrel, questBoard, placard, busShelter, busSign, timetable };

export function ensureZoneTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(ZTEX.stool)) return;
  for (const k of Object.keys(DECOR_ART) as FishDecorKind[]) tx.addCanvas(ZTEX.decor(k), DECOR_ART[k]());
  tx.addCanvas(ZTEX.stool, stool());
  tx.addCanvas(ZTEX.ripple(0), ripple(0));
  tx.addCanvas(ZTEX.ripple(1), ripple(1));
  tx.addCanvas(ZTEX.hook, hook());
  tx.addCanvas(ZTEX.busBay, busBay());
  tx.addCanvas(ZTEX.busPlatform, busPlatform());
  tx.addCanvas(ZTEX.wharfCurb, wharfCurb());
}
