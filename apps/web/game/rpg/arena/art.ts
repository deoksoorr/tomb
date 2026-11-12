import type { MonsterId, ZoneId } from "@/lib/rpg/catalog";
import { css, darken, hash2, lighten, makeCanvas, mix, type Color } from "../../sprites/pixel";
import { monsterIdleCanvas } from "../monsterArt";
import { AH, AW, PROP_META, SIDE, TOP, type ArenaLayout, type Decal, type Region } from "./layout";

// 40번 사냥터 그림 (캔버스 2D, Phaser 없이 — 로비 미리보기도 같은 함수로 그린다).
// 바닥(벽·무늬·납작한 구역 포함)은 한 장, 키 있는 소품은 따로 (깊이 정렬), 움직이는 것(벨트·창밖·문)은 Arena가 따로 띄운다.

type Ctx = CanvasRenderingContext2D;

function R(c: Ctx, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** 픽셀 타원 (가장자리 흐림 없이) */
function E(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = (y + 0.5 - cy) / ry;
    if (t * t > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
  }
}

function speckle(c: Ctx, x: number, y: number, w: number, h: number, col: Color, density: number, salt: number, a = 1): void {
  c.fillStyle = css(col, a);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash2(x + i, y + j, salt) < density) c.fillRect(x + i, y + j, 1, 1);
}

function frame(c: Ctx, x: number, y: number, w: number, h: number, col: Color): void {
  R(c, x, y, w, 1, col);
  R(c, x, y + h - 1, w, 1, col);
  R(c, x, y, 1, h, col);
  R(c, x + w - 1, y, 1, h, col);
}

const OUT = 0x141218;

// ── 사냥터별 바닥·벽 ──

type Theme = {
  floor(c: Ctx, l: ArenaLayout): void;
  wall(c: Ctx, l: ArenaLayout): void;
  side: Color;
};

/** 바닥 타일 (두 색 바둑판 + 잡티 + 줄눈) */
function tiles(c: Ctx, size: number, a: Color, b: Color, grout: Color | null, noise: Color, density: number, salt: number): void {
  for (let y = 0; y < AH; y += size)
    for (let x = 0; x < AW; x += size) {
      R(c, x, y, size, size, ((x + y) / size) % 2 ? a : b);
    }
  speckle(c, 0, 0, AW, AH, noise, density, salt);
  if (grout !== null) {
    for (let y = 0; y < AH; y += size) R(c, 0, y, AW, 1, grout);
    for (let x = 0; x < AW; x += size) R(c, x, 0, 1, AH, grout);
  }
}

function sideWalls(c: Ctx, col: Color): void {
  R(c, 0, TOP, SIDE, AH - TOP, col);
  R(c, AW - SIDE, TOP, SIDE, AH - TOP, col);
  R(c, 0, AH - SIDE, AW, SIDE, col);
  R(c, SIDE - 1, TOP, 1, AH - TOP - SIDE + 1, lighten(col, 0.18));
  R(c, AW - SIDE, TOP, 1, AH - TOP - SIDE + 1, lighten(col, 0.18));
  R(c, SIDE - 1, AH - SIDE, AW - SIDE * 2 + 2, 1, lighten(col, 0.18));
}

/** 벽 아래 그림자 (바닥에 드리운다) */
function wallShade(c: Ctx): void {
  for (let i = 0; i < 6; i++) R(c, SIDE, TOP + i, AW - SIDE * 2, 1, 0x000000, 0.28 - i * 0.045);
  for (let i = 0; i < 4; i++) {
    R(c, SIDE + i, TOP, 1, AH - TOP - SIDE, 0x000000, 0.2 - i * 0.05);
    R(c, AW - SIDE - 1 - i, TOP, 1, AH - TOP - SIDE, 0x000000, 0.2 - i * 0.05);
  }
}

function skyline(c: Ctx, y0: number, h: number, body: Color, win: Color, salt: number): void {
  let x = 0;
  let k = 0;
  while (x < AW) {
    const w = 14 + Math.floor(hash2(k, 1, salt) * 22);
    const bh = Math.floor(h * (0.35 + hash2(k, 2, salt) * 0.6));
    R(c, x, y0 + h - bh, w, bh, body);
    for (let yy = y0 + h - bh + 3; yy < y0 + h - 2; yy += 4)
      for (let xx = x + 2; xx < x + w - 2; xx += 4) if (hash2(xx, yy, salt) < 0.35) R(c, xx, yy, 2, 2, win);
    x += w + 1;
    k++;
  }
}

const THEMES: Record<ZoneId, Theme> = {
  "meeting-room": {
    side: 0x4a4034,
    floor(c) {
      // 사무실 카펫 타일 (결이 엇갈린 32px 타일)
      for (let y = 0; y < AH; y += 32)
        for (let x = 0; x < AW; x += 32) {
          const alt = ((x + y) / 32) % 2;
          R(c, x, y, 32, 32, alt ? 0x4a5468 : 0x465062);
          for (let k = 2; k < 32; k += 4) R(c, x + (alt ? k : 0), y + (alt ? 0 : k), alt ? 1 : 32, alt ? 32 : 1, alt ? 0x46505f : 0x424c5c);
        }
      speckle(c, 0, 0, AW, AH, 0x3c4558, 0.03, 11);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0xd8ccb0);
      speckle(c, 0, 0, AW, TOP, 0xccc0a2, 0.15, 13);
      R(c, 0, TOP - 8, AW, 8, 0x9a8462);
      R(c, 0, TOP - 8, AW, 1, 0xb8a27a);
      R(c, 0, TOP - 1, AW, 1, 0x5a4a34);
      // 화이트보드 (낙서)
      R(c, 168, 3, 112, 17, 0x8a8f98);
      R(c, 169, 4, 110, 15, 0xf4f4f0);
      const lines: [number, Color][] = [[7, 0x3a6ac8], [10, 0xd04a4a], [13, 0x3a8a4a], [16, 0x3a6ac8]];
      for (const [y, col] of lines) for (let x = 174; x < 270; x += 2) if (hash2(x, y, 3) < 0.7) R(c, x, y + (hash2(x, y, 4) < 0.3 ? 1 : 0), 2, 1, col);
      E(c, 254, 10, 9, 5, 0xd04a4a);
      E(c, 254, 10, 7, 3, 0xf4f4f0);
      R(c, 170, 20, 108, 2, 0x6a6e78);
      // 블라인드 창
      for (const x of [30, 340]) {
        R(c, x, 3, 78, 18, 0x6a5a40);
        R(c, x + 2, 5, 74, 14, 0xa8d0e8);
        for (let y = 6; y < 19; y += 2) R(c, x + 2, y, 74, 1, 0xe8ecf0);
      }
      // 벽시계 (월요일 9시)
      E(c, 134, 11, 6, 6, 0x3a3a44);
      E(c, 134, 11, 5, 5, 0xf2f2ee);
      R(c, 134, 6, 1, 5, OUT);
      R(c, 131, 11, 3, 1, OUT);
      R(c, 304, 6, 22, 14, 0x5a4a34);
      R(c, 306, 8, 18, 10, 0xe8c070);
    },
  },
  subway: {
    side: 0x8a9098,
    floor(c) {
      // 열차 바닥: 연회색 미끄럼 방지 바닥 + 칸 이음새 + 바닥 광고 스티커·떨어진 것들
      R(c, 0, 0, AW, AH, 0x9aa0a8);
      speckle(c, 0, 0, AW, AH, 0x8c929a, 0.07, 21);
      speckle(c, 0, 0, AW, AH, 0xaab0b8, 0.03, 22);
      for (const x of [150, 298]) {
        R(c, x - 3, TOP, 6, AH - TOP, 0x7a8088);
        for (let y = TOP; y < AH; y += 4) R(c, x - 3, y, 6, 1, 0x6a7078);
      }
      // 가운데 통로 마모 자국
      R(c, SIDE, 128, AW - SIDE * 2, 44, 0xa2a8b0, 0.6);
      // 바닥 스티커 (임산부 배려석 분홍·안전선 노랑 화살표)
      for (const [x, y, col] of [[60, 230, 0xf08ab0], [388, 92, 0xf08ab0], [224, 210, 0x3a9a8a]] as const) {
        E(c, x, y, 9, 6, col, 0.85);
        E(c, x, y, 5, 3, 0xf2f2ee, 0.9);
      }
      // 떨어진 영수증·종이컵
      for (const [x, y] of [[90, 180], [330, 230], [250, 96], [40, 120]]) {
        R(c, x, y, 5, 3, 0xf2f2ee);
        R(c, x + 1, y + 1, 3, 1, 0xb8bcc4);
      }
      E(c, 182, 248, 2, 2, 0xe8d9b0);
      R(c, 181, 246, 3, 1, 0x6a4a30);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0xd8dce2);
      R(c, 0, 0, AW, 4, 0xb8bec6);
      // 창문 (어두운 터널)
      for (const [x0, x1] of [[SIDE + 6, 90], [136, 312], [360, AW - SIDE - 6]]) {
        for (let x = x0; x < x1 - 30; x += 44) {
          R(c, x, 6, 38, 14, 0x5a626c);
          R(c, x + 2, 8, 34, 10, 0x1a2228);
        }
      }
      R(c, 0, TOP - 4, AW, 4, 0xa8aeb6);
      R(c, 0, TOP - 1, AW, 1, 0x5a626c);
      // 문 자리 (Arena가 문짝을 덮는다)
      for (const x of [112, 336]) {
        R(c, x - 19, 0, 38, TOP, 0x6a727c);
        R(c, x - 17, 2, 34, TOP - 2, 0x2a3238);
      }
    },
  },
  gym: {
    side: 0x2a2e36,
    floor(c) {
      tiles(c, 32, 0x363a42, 0x32363e, 0x2a2e36, 0x464a54, 0.06, 31);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x5a5f6a);
      // 거울 판
      for (let x = SIDE + 4; x < AW - SIDE - 40; x += 46) {
        R(c, x, 3, 42, 22, 0x8a909a);
        R(c, x + 1, 4, 40, 20, 0xa8d4dc);
        for (let i = 0; i < 6; i++) R(c, x + 8 + i, 20 - i * 2, 2, 2, 0xe8f6f8, 0.8);
        for (let i = 0; i < 4; i++) R(c, x + 22 + i, 16 - i * 2, 1, 2, 0xe8f6f8, 0.6);
      }
      // "새해 다짐" 현수막
      R(c, 150, 2, 148, 9, 0xc83c3c);
      for (let x = 158; x < 292; x += 6) if (hash2(x, 1, 7) < 0.8) R(c, x, 4, 4, 5, 0xf2ead3);
      R(c, 0, TOP - 3, AW, 3, 0x2a2e36);
    },
  },
  "legacy-forest": {
    side: 0x1e2430,
    floor(c) {
      tiles(c, 16, 0x2e3444, 0x2b3140, null, 0x262b38, 0.14, 41);
      for (let y = 0; y < AH; y += 32) R(c, 0, y, AW, 1, 0x252a36);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x1a2234);
      // 통유리 창 너머 밤 도시
      R(c, 60, 2, AW - 120, TOP - 6, 0x10182a);
      skyline(c, 4, TOP - 8, 0x1e2a40, 0xffd870, 44);
      for (let x = 60; x < AW - 60; x += 40) R(c, x, 2, 2, TOP - 6, 0x3a4458);
      R(c, 0, TOP - 4, AW, 4, 0x3a4458);
      // 엘리베이터 문 자리
      for (const x of [41, AW - 41]) {
        R(c, x - 17, 0, 34, TOP, 0x4a5262);
        R(c, x - 15, 4, 30, TOP - 4, 0x8a929e);
        R(c, x, 4, 1, TOP - 4, 0x5a6270);
        R(c, x - 4, 1, 8, 2, 0x7ad070);
      }
    },
  },
  library: {
    side: 0x3a2618,
    floor(c) {
      // 마루 (엇갈린 판자)
      for (let y = 0; y < AH; y += 6)
        for (let x = -((y / 6) % 2) * 12; x < AW; x += 24) {
          const t = hash2(x, y, 51);
          R(c, x, y, 24, 6, t < 0.33 ? 0x6a4a34 : t < 0.66 ? 0x644630 : 0x5e422e);
          R(c, x, y, 1, 6, 0x4a3222);
        }
      for (let y = 0; y < AH; y += 6) R(c, 0, y, AW, 1, 0x553a28);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x4a3020);
      for (let x = 0; x < AW; x += 24) R(c, x, 0, 1, TOP, 0x3a2416);
      // 아치 창 (밤, 달)
      for (const x of [60, 150, 298, 388]) {
        R(c, x - 14, 6, 28, TOP - 8, 0x2a1a10);
        E(c, x, 8, 12, 5, 0x1a2244);
        R(c, x - 12, 8, 24, TOP - 11, 0x1a2244);
        R(c, x, 4, 1, TOP - 6, 0x2a1a10);
        R(c, x - 12, 15, 24, 1, 0x2a1a10);
      }
      E(c, 392, 11, 3, 3, 0xf0f0d0);
      for (const [x, y] of [[52, 9], [146, 12], [300, 10], [158, 18]]) R(c, x, y, 1, 1, 0xf0f0d0);
      // 시계 (새벽 3시)
      E(c, 224, 12, 7, 7, 0xc8a050);
      E(c, 224, 12, 6, 6, 0xf2ead3);
      R(c, 224, 7, 1, 5, OUT);
      R(c, 224, 12, 4, 1, OUT);
      R(c, 0, TOP - 3, AW, 3, 0x6a4430);
    },
  },
  "cart-jungle": {
    side: 0x2a4a2a,
    floor(c) {
      tiles(c, 16, 0xd0d4c8, 0xc4c8bc, 0xb0b4a8, 0xa8ac9e, 0.06, 61);
      // 이끼가 번진 자리
      for (let k = 0; k < 18; k++) {
        const x = hash2(k, 1, 62) * AW;
        const y = TOP + hash2(k, 2, 62) * (AH - TOP);
        E(c, x, y, 10 + hash2(k, 3, 62) * 16, 6 + hash2(k, 4, 62) * 8, 0x6a9a50, 0.55);
        speckle(c, Math.round(x - 14), Math.round(y - 8), 28, 16, 0x4a7a3a, 0.2, k);
      }
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x3a4a3a);
      // 진열장 (알록달록한 상자)
      for (let y = 3; y < TOP - 4; y += 9) {
        R(c, 0, y + 7, AW, 2, 0x9aa3ad);
        for (let x = 2; x < AW; x += 6) {
          const t = hash2(x, y, 63);
          R(c, x, y + 1, 5, 6, t < 0.25 ? 0xd04a4a : t < 0.5 ? 0xf0c040 : t < 0.75 ? 0x4a8ac8 : 0xf2ead3);
        }
      }
      // SALE 현수막
      R(c, 176, 2, 96, 12, 0xd03030);
      R(c, 176, 2, 96, 1, 0xf0c040);
      for (let x = 184; x < 266; x += 8) R(c, x, 5, 6, 6, 0xf0f0f0);
      // 늘어진 덩굴
      for (let x = 4; x < AW; x += 13) {
        const len = 6 + Math.floor(hash2(x, 0, 64) * 18);
        for (let y = 0; y < len; y++) R(c, x + Math.round(Math.sin(y / 3) * 1), y, 1, 1, 0x3a8a3a);
        R(c, x - 1, len - 2, 3, 2, 0x5ab04a);
      }
      R(c, 0, TOP - 2, AW, 2, 0x2a3a2a);
    },
  },
  "deadline-swamp": {
    side: 0x1a221e,
    floor(c) {
      tiles(c, 16, 0x34402e, 0x313c2b, null, 0x2a3426, 0.25, 71);
      speckle(c, 0, 0, AW, AH, 0x4a5a3a, 0.05, 72);
      // 풀 포기
      for (let k = 0; k < 70; k++) {
        const x = Math.round(hash2(k, 1, 73) * AW);
        const y = Math.round(TOP + hash2(k, 2, 73) * (AH - TOP));
        R(c, x, y, 1, 3, 0x5a7a40);
        R(c, x + 2, y + 1, 1, 2, 0x4a6a34);
        R(c, x - 2, y + 1, 1, 2, 0x4a6a34);
      }
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x141c18);
      // 나무 줄기 실루엣 + 이끼
      for (let x = 0; x < AW; x += 18) {
        const w = 6 + Math.floor(hash2(x, 1, 74) * 6);
        R(c, x, 0, w, TOP, 0x222c24);
        R(c, x + 1, 0, 1, TOP, 0x2e3a2e);
        for (let y = 0; y < 10 + hash2(x, 2, 74) * 12; y++) R(c, x + w, y, 1, 1, 0x4a6a3a);
      }
      R(c, 0, TOP - 6, AW, 6, 0x1a2420);
      for (let x = 0; x < AW; x += 3) R(c, x, TOP - 6 - Math.floor(hash2(x, 3, 74) * 4), 1, 4, 0x3a5030);
    },
  },
  "homework-desert": {
    side: 0xa8844a,
    floor(c) {
      R(c, 0, 0, AW, AH, 0xd8b878);
      // 모래 물결
      for (let y = TOP; y < AH; y += 7)
        for (let x = 0; x < AW; x++) {
          const yy = y + Math.round(Math.sin((x + y * 3) / 14) * 2);
          if (hash2(x, y, 81) < 0.8) R(c, x, yy, 1, 1, 0xc8a464);
        }
      speckle(c, 0, 0, AW, AH, 0xe8cc90, 0.05, 82);
      speckle(c, 0, 0, AW, AH, 0x9a7a4a, 0.008, 83);
    },
    wall(c) {
      // 하늘 → 지평선
      for (let y = 0; y < TOP; y++) R(c, 0, y, AW, 1, mix(0x8ac8e8, 0xf0dca0, y / TOP));
      E(c, 360, 9, 6, 6, 0xfff4c0);
      E(c, 360, 9, 4, 4, 0xffffff);
      // 먼 메사
      for (const [x, w, h] of [[20, 70, 10], [140, 50, 7], [230, 90, 12], [380, 60, 8]] as const) {
        R(c, x, TOP - 4 - h, w, h + 4, 0xc89a68);
        R(c, x + 3, TOP - 4 - h, w - 6, 2, 0xd8b080);
      }
      R(c, 0, TOP - 4, AW, 4, 0xd0ac70);
    },
  },
  "burnout-abyss": {
    side: 0x1a1218,
    floor(c) {
      for (let y = 0; y < AH; y += 8) {
        R(c, 0, y, AW, 8, (y / 8) % 2 ? 0x3a2a24 : 0x36271f);
        R(c, 0, y, AW, 1, 0x2a1e18);
        for (let x = (y / 8) % 2 ? 0 : 40; x < AW; x += 80) R(c, x, y, 1, 8, 0x2a1e18);
      }
      speckle(c, 0, 0, AW, AH, 0x2a1e18, 0.06, 91);
    },
    wall(c) {
      R(c, 0, 0, AW, TOP, 0x241a24);
      for (let x = 0; x < AW; x += 12) R(c, x, 0, 1, TOP, 0x1e161e);
      // 노래방 화면
      R(c, 180, 3, 88, 20, 0x10101a);
      R(c, 182, 5, 84, 16, 0x2a3a9a);
      R(c, 188, 14, 60, 2, 0xf2f2f2);
      R(c, 188, 17, 40, 2, 0x6ad0ff);
      // 네온 간판
      const neon = (x: number, w: number, col: Color) => {
        frame(c, x, 5, w, 12, col);
        frame(c, x + 1, 6, w - 2, 10, lighten(col, 0.5));
      };
      neon(30, 52, 0xff6ac8);
      neon(98, 34, 0x6ad0ff);
      neon(316, 40, 0xc86aff);
      neon(370, 48, 0xffd04a);
      R(c, 0, TOP - 3, AW, 3, 0x3a2a30);
    },
  },
  "new-year-eve": {
    side: 0x22223a,
    floor(c) {
      tiles(c, 16, 0x4a4a62, 0x44445c, 0x3a3a50, 0x56567a, 0.05, 101);
    },
    wall(c) {
      for (let y = 0; y < TOP; y++) R(c, 0, y, AW, 1, mix(0x0a0c22, 0x2a2450, y / TOP));
      speckle(c, 0, 0, AW, 16, 0xf0f0ff, 0.012, 102);
      skyline(c, 10, TOP - 12, 0x14142a, 0xffd070, 103);
      // 시계탑 (11시 59분)
      R(c, 212, 0, 24, TOP, 0x3a3450);
      R(c, 214, 0, 20, TOP, 0x4a4466);
      E(c, 224, 11, 8, 8, 0xf0e8c8);
      E(c, 224, 11, 6.5, 6.5, 0xfffaf0);
      R(c, 224, 4, 1, 7, OUT);
      R(c, 223, 5, 1, 6, OUT);
      // 줄 전구
      for (let x = 0; x < AW; x++) {
        const y = 22 + Math.round(Math.sin((x / AW) * Math.PI * 4) * 3);
        R(c, x, y, 1, 1, 0x2a2a3a);
        if (x % 9 === 0) R(c, x - 1, y + 1, 2, 2, [0xff6a6a, 0xffd04a, 0x6ad0ff, 0x8aff8a][(x / 9) % 4]);
      }
      R(c, 0, TOP - 2, AW, 2, 0x2a2a40);
    },
  },
};

// ── 바닥 무늬 ──

function decal(c: Ctx, d: Decal): void {
  const { x, y, w, h } = d;
  switch (d.kind) {
    case "rug":
      R(c, x, y, w, h, 0x2e3a5a);
      frame(c, x + 2, y + 2, w - 4, h - 4, 0xc8a050);
      speckle(c, x, y, w, h, 0x26304c, 0.15, x);
      break;
    case "seat_row":
      R(c, x, y, w, h, 0x9aa3ad);
      R(c, x, y + 2, w, h - 6, 0x3a9a8a);
      for (let i = x + 2; i < x + w - 2; i += 14) R(c, i, y + 3, 1, h - 8, 0x2a7a6a);
      R(c, x, y + h - 4, w, 2, 0x6a727c);
      R(c, x, y + h - 2, w, 2, 0x000000, 0.3);
      break;
    case "seat_row_b":
      R(c, x, y, w, 2, 0x000000, 0.25);
      R(c, x, y + 2, w, h - 2, 0x9aa3ad);
      R(c, x, y + 4, w, h - 12, 0x3a9a8a);
      for (let i = x + 2; i < x + w - 2; i += 14) R(c, i, y + 5, 1, h - 14, 0x2a7a6a);
      R(c, x, y + 4, w, 1, 0x5ab8a8);
      break;
    case "door_mat":
      for (let i = 0; i < w; i += 4) R(c, x + i, y, 2, h, 0xe8c040, 0.85);
      R(c, x, y, w, 2, 0xe8c040);
      break;
    case "aisle_line":
      for (let i = 0; i < w; i += 8) R(c, x + i, y, 5, h, 0xd8d8d0, 0.5);
      break;
    case "mat_area":
      R(c, x, y, w, h, 0x5a3e8a);
      R(c, x + 2, y + 2, w - 4, h - 4, 0x6a4a9a);
      for (let i = y + 6; i < y + h; i += 10) R(c, x + 2, i, w - 4, 1, 0x5a3e8a);
      break;
    case "carpet_path":
      R(c, x, y, w, h, 0x353c50);
      speckle(c, x, y, w, h, 0x2e3446, 0.2, y);
      break;
    case "runner":
      R(c, x, y, w, h, 0x7a2a2a);
      frame(c, x + 2, y, w - 4, h, 0xc8a050);
      for (let i = y + 8; i < y + h; i += 16) R(c, x + w / 2 - 2, i, 4, 4, 0xa84040);
      break;
    case "tile_path":
      R(c, x, y, w, h, 0xe0e4d8, 0.85);
      for (let i = 0; i < w; i += 8) for (let j = 0; j < h; j += 8) R(c, x + i, y + j, 1, 1, 0xb8bcb0);
      break;
    case "dune":
      E(c, x + w / 2, y + h / 2, w / 2, h / 2, 0xe4c88a);
      E(c, x + w / 2 + 4, y + h / 2 + 4, w / 2 - 6, h / 2 - 6, 0xd0ae6e);
      E(c, x + w / 2 - 6, y + h / 2 - 3, w / 2 - 14, h / 2 - 10, 0xecd49a);
      break;
    case "mirage":
      E(c, x + w / 2, y + h / 2, w / 2, h / 2, 0x7ac8e8, 0.45);
      for (let i = 0; i < 4; i++) R(c, x + 10 + i * 12, y + h / 2 - 2 + (i % 2) * 3, 8, 1, 0xe8f8ff, 0.6);
      break;
    case "stage":
      R(c, x, y, w, h, 0x5a3a2a);
      for (let i = 0; i < h; i += 4) R(c, x, y + i, w, 1, 0x4a2e22);
      R(c, x, y + h - 2, w, 2, 0x2a1a14);
      for (let i = x + 4; i < x + w; i += 10) R(c, i, y + h - 4, 2, 2, [0xff6ac8, 0x6ad0ff, 0xffd04a][(i / 10) % 3 | 0]);
      break;
    case "plaza":
      E(c, x + w / 2, y + h / 2, w / 2, h / 2, 0x56567a);
      E(c, x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 5, 0x4e4e6e);
      E(c, x + w / 2, y + h / 2, w / 4, h / 4, 0x5a5a82);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        R(c, x + w / 2 + Math.cos(a) * (w / 2 - 3), y + h / 2 + Math.sin(a) * (h / 2 - 3), 2, 2, 0xc8a050);
      }
      break;
  }
}

/** 납작한 지형 구역 (바닥에 굽는다) */
function regionBase(c: Ctx, r: Region): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  switch (r.kind) {
    case "conveyor":
      R(c, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 0x1a1c22);
      R(c, r.x - 3, r.y - 3, r.w + 6, 2, 0x9aa3ad);
      R(c, r.x - 3, r.y + r.h + 1, r.w + 6, 2, 0x6a727c);
      break;
    case "mud":
      E(c, cx, cy + 1, r.w / 2 + 3, r.h / 2 + 3, 0x2a2a1a);
      E(c, cx, cy, r.w / 2, r.h / 2, 0x4a4228);
      E(c, cx, cy + 2, r.w / 2 - 4, r.h / 2 - 4, 0x3a3420);
      E(c, cx - r.w / 6, cy - r.h / 6, r.w / 6, r.h / 10, 0x5a5236);
      // 서류 조각이 떠 있다
      for (let k = 0; k < 3; k++) {
        const px = cx + (hash2(k, r.id ?? 0, 75) - 0.5) * r.w * 0.6;
        const py = cy + (hash2(k, 9, 75) - 0.5) * r.h * 0.5;
        R(c, px, py, 5, 4, 0xd8d0b8);
        R(c, px + 1, py + 1, 3, 1, 0xc83c3c);
      }
      break;
    case "puddle":
      E(c, cx, cy, r.w / 2, r.h / 2, 0x6aa040, 0.55);
      E(c, cx + 2, cy + 1, r.w / 2 - 4, r.h / 2 - 3, 0xc8a040, 0.45);
      R(c, cx - r.w / 4, cy - r.h / 4, r.w / 5, 1, 0xffffff, 0.6);
      R(c, cx + r.w / 6, cy, r.w / 8, 1, 0xffffff, 0.4);
      break;
    case "pad":
      R(c, r.x, r.y, r.w, r.h, 0x3a4252);
      frame(c, r.x, r.y, r.w, r.h, 0xffd04a);
      for (let i = 2; i < r.w - 2; i += 4) R(c, r.x + i, r.y + r.h - 3, 2, 1, 0xffd04a);
      break;
    case "door":
    case "vine":
    case "stage":
      break;
  }
}

// ── 소품 ──

type PropPaint = (c: Ctx, w: number, h: number, v: number) => void;

function wood(c: Ctx, x: number, y: number, w: number, h: number, base: Color): void {
  R(c, x, y, w, h, base);
  for (let j = 1; j < h; j += 3) R(c, x, y + j, w, 1, darken(base, 0.08));
  R(c, x, y, w, 1, lighten(base, 0.2));
}

const PROPS: Record<string, PropPaint> = {
  plant(c, w, h) {
    R(c, 4, h - 9, 8, 8, 0xb06a3a);
    R(c, 3, h - 10, 10, 2, 0xc87a4a);
    R(c, 5, h - 2, 6, 1, 0x7a4a2a);
    E(c, 8, 9, 6, 6, 0x2e6a2e);
    E(c, 5, 7, 3, 4, 0x3e8a3a);
    E(c, 11, 8, 3, 4, 0x3e8a3a);
    E(c, 8, 4, 2, 3, 0x5aaa4a);
    R(c, 7, 13, 2, 3, 0x2e5a2a);
  },
  palm(c, w, h) {
    R(c, 13, 14, 4, h - 18, 0x8a6a3a);
    for (let y = 16; y < h - 6; y += 3) R(c, 13, y, 4, 1, 0x6a4a2a);
    R(c, 9, h - 7, 12, 6, 0xb06a3a);
    R(c, 8, h - 8, 14, 2, 0xc87a4a);
    for (const [dx, dy] of [[-12, 4], [12, 4], [-9, -2], [9, -2], [0, -5], [-14, 9], [14, 9]] as const) {
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        R(c, 15 + dx * t, 14 + dy * t - Math.sin(t * Math.PI) * 4, 2, 2, i % 3 ? 0x3a8a3a : 0x2e6a2e);
      }
    }
    E(c, 15, 14, 3, 2, 0x5a4a2a);
  },
  cooler(c, w, h) {
    R(c, 2, 10, 10, h - 10, 0xe8e8ee);
    R(c, 2, 10, 2, h - 10, 0xffffff);
    R(c, 3, 1, 8, 10, 0x8ac8f0, 0.85);
    R(c, 4, 2, 2, 8, 0xc8e8ff);
    R(c, 5, 15, 4, 2, 0x4a8ac8);
    R(c, 9, 15, 2, 2, 0xd04a4a);
    R(c, 2, h - 2, 10, 2, 0x9aa3ad);
  },
  conf_table(c, w) {
    R(c, 6, 24, 3, 14, 0x3a2a1a);
    R(c, w - 9, 24, 3, 14, 0x3a2a1a);
    wood(c, 2, 4, w - 4, 22, 0x8a5a3a);
    R(c, 2, 26, w - 4, 3, 0x5a3a24);
    R(c, 2, 4, w - 4, 1, 0xb08060);
    // 서류·노트북·커피
    R(c, 14, 10, 12, 8, 0xf2f2ee);
    R(c, 15, 12, 9, 1, 0x9aa3ad);
    R(c, 40, 8, 16, 10, 0x2a2e36);
    R(c, 41, 9, 14, 7, 0x6ad0c8);
    R(c, w - 24, 12, 5, 5, 0xe8d9b0);
    R(c, w - 23, 12, 3, 2, 0x6a4a30);
    R(c, w - 40, 9, 10, 7, 0xf2f2ee);
    R(c, w - 39, 11, 7, 1, 0xd04a4a);
  },
  chair(c, w, h, v) {
    R(c, 2, 2, 8, 9, 0x2a2e36);
    R(c, 3, 3, 6, 7, 0x3a4a6a);
    R(c, 5, 11, 2, 2, 0x1a1c22);
    R(c, 2, 12, 8, 1, 0x1a1c22);
    if (v) R(c, 3, 3, 6, 1, 0x4a5a7a);
  },
  coffee_cart(c, w, h) {
    R(c, 1, 10, 22, 14, 0x6a4a30);
    R(c, 1, 10, 22, 2, 0x8a6a4a);
    R(c, 3, 2, 10, 9, 0x2a2a30);
    R(c, 5, 4, 6, 3, 0xd04a4a);
    R(c, 15, 6, 4, 5, 0xf2ead3);
    R(c, 19, 7, 3, 4, 0xf2ead3);
    E(c, 4, h - 2, 2, 2, OUT);
    E(c, 20, h - 2, 2, 2, OUT);
  },
  pole(c, w, h) {
    R(c, 2, 0, 2, h - 2, 0xc8d0d8);
    R(c, 2, 0, 1, h - 2, 0xffffff);
    R(c, 1, h - 3, 4, 3, 0x6a727c);
    R(c, 1, 0, 4, 2, 0x6a727c);
  },
  dumbbell_rack(c, w, h) {
    R(c, 2, 0, 18, h, 0x2a2e36);
    R(c, 3, 1, 16, h - 2, 0x3a3f4a);
    for (let y = 4; y < h - 4; y += 8) {
      R(c, 3, y + 5, 16, 1, 0x1a1c22);
      R(c, 4, y, 4, 5, 0x5a5f6a);
      R(c, 14, y, 4, 5, 0x5a5f6a);
      R(c, 8, y + 2, 6, 1, 0x9aa3ad);
      if ((y / 8) % 2) {
        R(c, 4, y, 4, 5, 0xd04a4a);
        R(c, 14, y, 4, 5, 0xd04a4a);
      }
    }
  },
  weight_bench(c, w, h, v) {
    R(c, 4, 8, w - 8, 6, 0x2a2a30);
    R(c, 4, 8, w - 8, 2, 0x3a3a44);
    R(c, 6, 14, 2, 7, 0x6a727c);
    R(c, w - 8, 14, 2, 7, 0x6a727c);
    // 바벨
    R(c, 0, 2, w, 2, 0xc8d0d8);
    R(c, 1, 0, 4, 6, v ? 0x3a6ac8 : 0xd04a4a);
    R(c, w - 5, 0, 4, 6, v ? 0x3a6ac8 : 0xd04a4a);
  },
  treadmill_head(c, w, h) {
    R(c, 5, 6, 3, h - 6, 0x9aa3ad);
    R(c, 1, 0, 12, 8, 0x2a2e36);
    R(c, 2, 1, 10, 4, 0x2a6a5a);
    R(c, 3, 2, 3, 1, 0x7af0c0);
    R(c, 8, 2, 3, 1, 0xf0d050);
  },
  cubicle(c, w, h, v) {
    // 칸막이 (뒤)
    R(c, 2, 0, w - 4, 16, 0x5a6478);
    R(c, 2, 0, w - 4, 2, 0x7a849a);
    for (let x = 6; x < w - 6; x += 4) R(c, x, 4, 1, 10, 0x525c70);
    R(c, w / 2 - 1, 0, 2, 16, 0x3a4252);
    // 포스트잇
    R(c, 8, 5, 4, 4, [0xf0e060, 0xf08ab0, 0x8ad0f0][v % 3]);
    R(c, w - 14, 7, 4, 4, 0xf0e060);
    // 책상
    wood(c, 0, 16, w, 12, 0x8a7458);
    R(c, 0, 28, w, 3, 0x5a4a38);
    // 모니터 둘 (켜져 있다)
    for (const mx of [10, w - 26]) {
      R(c, mx, 10, 16, 11, 0x1a1c22);
      R(c, mx + 1, 11, 14, 8, 0x3a7ab8);
      R(c, mx + 2, 12, 8, 1, 0xa8d8ff);
      R(c, mx + 2, 14, 10, 1, 0x6aa8e0);
      R(c, mx + 7, 21, 2, 3, 0x2a2e36);
    }
    R(c, 30, 20, 8, 4, 0xf2f2ee);
    R(c, 6, 31, 2, h - 31, 0x3a3226);
    R(c, w - 8, 31, 2, h - 31, 0x3a3226);
    // 의자 등받이
    R(c, 16, 32, 10, 8, 0x2a2e36);
    R(c, w - 26, 32, 10, 8, 0x2a2e36);
  },
  copier(c, w, h) {
    R(c, 1, 8, 24, h - 8, 0xd8dce2);
    R(c, 1, 8, 24, 2, 0xf0f2f4);
    R(c, 3, 2, 20, 7, 0xb8bec6);
    R(c, 5, 0, 16, 3, 0xf2f2ee);
    R(c, 4, 13, 8, 4, 0x2a2e36);
    R(c, 5, 14, 3, 1, 0x7af0a0);
    R(c, 14, 20, 9, 2, 0x9aa3ad);
    R(c, 14, 24, 9, 2, 0x9aa3ad);
  },
  bookshelf(c, w, h, v) {
    R(c, 0, 0, w, h, 0x4a2e1a);
    R(c, 0, 0, w, 2, 0x6a4430);
    for (let y = 3; y < h - 6; y += 10) {
      R(c, 2, y, w - 4, 9, 0x2a1a10);
      for (let x = 3; x < w - 3; ) {
        const bw = 2 + Math.floor(hash2(x, y, v) * 3);
        const bh = 6 + Math.floor(hash2(x, y + 1, v) * 3);
        const t = hash2(x, y + 2, v);
        R(c, x, y + 9 - bh, bw, bh, t < 0.2 ? 0x8a2a2a : t < 0.4 ? 0x2a4a8a : t < 0.6 ? 0x2a6a3a : t < 0.8 ? 0xc8a050 : 0x5a3a6a);
        R(c, x, y + 10 - bh, bw, 1, 0xf2ead3, 0.3);
        x += bw + (hash2(x, y + 3, v) < 0.1 ? 3 : 0);
      }
      R(c, 1, y + 9, w - 2, 1, 0x6a4430);
    }
    R(c, 0, h - 6, w, 6, 0x3a2414);
  },
  read_table(c, w) {
    R(c, 4, 18, 3, 11, 0x3a2414);
    R(c, w - 7, 18, 3, 11, 0x3a2414);
    wood(c, 1, 4, w - 2, 16, 0x7a5236);
    R(c, 1, 20, w - 2, 2, 0x4a3020);
    // 스탠드 둘 + 펼친 책
    for (const lx of [10, w - 14]) {
      R(c, lx + 1, 0, 2, 7, 0x2a6a3a);
      R(c, lx - 1, 0, 6, 3, 0x3a8a4a);
    }
    R(c, 20, 8, 9, 6, 0xf2ead3);
    R(c, 29, 8, 9, 6, 0xe8e0c8);
    R(c, 29, 8, 1, 6, 0x9a8a6a);
    R(c, 22, 10, 5, 1, 0x6a6a7a);
    R(c, 31, 11, 5, 1, 0x6a6a7a);
  },
  book_cart(c, w, h) {
    R(c, 1, 4, 20, 14, 0x6a4430);
    for (let x = 2; x < 20; x += 3) R(c, x, 1 + (x % 2), 2, 6, [0x8a2a2a, 0x2a4a8a, 0xc8a050][x % 3]);
    R(c, 1, 10, 20, 1, 0x4a2e1a);
    E(c, 4, h - 2, 2, 2, OUT);
    E(c, 18, h - 2, 2, 2, OUT);
  },
  gondola(c, w, h, v) {
    R(c, 0, 4, w, h - 6, 0xe8e8e8);
    R(c, 0, 4, w, 2, 0xffffff);
    for (let y = 7; y < h - 6; y += 8) {
      R(c, 1, y + 6, w - 2, 1, 0x9aa3ad);
      for (let x = 2; x < w - 3; x += 5) {
        const t = hash2(x, y, v);
        R(c, x, y, 4, 6, t < 0.2 ? 0xd04a4a : t < 0.4 ? 0xf0c040 : t < 0.6 ? 0x4a8ac8 : t < 0.8 ? 0x5ab04a : 0xf08ab0);
        R(c, x, y, 4, 1, 0xffffff, 0.35);
      }
    }
    R(c, 0, h - 3, w, 3, 0x6a727c);
    // 덩굴이 감았다
    for (let x = 0; x < w; x++) {
      const y = 6 + Math.round(Math.sin(x / 6 + v) * 3 + (x / w) * 10);
      R(c, x, y, 1, 1, 0x2e7a2e);
      if (x % 9 === 0) R(c, x - 1, y - 2, 3, 2, 0x5ab04a);
    }
    // 가격표
    R(c, 6, 0, 10, 5, 0xf0d050);
    R(c, 8, 2, 6, 1, 0xd03030);
  },
  cart(c, w, h, v) {
    for (let y = 2; y < 11; y++) R(c, 3 + Math.floor((y - 2) / 3), y, 14 - Math.floor((y - 2) / 3), 1, y % 2 ? 0xb0b8c0 : 0x8a929e);
    R(c, 0, 0, 3, 3, 0xd03030);
    R(c, 3, 12, 14, 1, 0x6a727c);
    E(c, 5, h - 2, 1.6, 1.6, OUT);
    E(c, 15, h - 2, 1.6, 1.6, OUT);
    R(c, 6, 3, 4, 4, v ? 0xf0c040 : 0x4a8ac8);
  },
  dead_tree(c, w, h) {
    R(c, 13, 12, 5, h - 12, 0x3a2e24);
    R(c, 13, 12, 1, h - 12, 0x4a3e30);
    for (const [x0, y0, dx, dy] of [[15, 16, -10, -10], [16, 20, 10, -12], [15, 10, -4, -10], [16, 26, -9, -4]] as const) {
      for (let i = 0; i < 10; i++) R(c, x0 + (dx * i) / 9, y0 + (dy * i) / 9, 2, 2, 0x3a2e24);
    }
    // 늘어진 이끼
    for (const x of [7, 22, 12]) for (let y = 6; y < 14 + (x % 5); y++) R(c, x, y, 1, 1, 0x5a7a40);
    E(c, 15, h - 2, 8, 2, 0x2a2a1a);
  },
  paper_stack(c, w, h) {
    for (let i = 0; i < 6; i++) {
      R(c, 2 + (i % 2), h - 4 - i * 2.5, 14, 3, i % 2 ? 0xe8e0c8 : 0xd8d0b8);
      R(c, 2 + (i % 2), h - 4 - i * 2.5, 14, 1, 0xf8f4e8);
    }
    // 반려 도장
    E(c, 11, 6, 3, 3, 0xc83c3c);
    E(c, 11, 6, 2, 2, 0xe8e0c8);
    R(c, 3, h - 2, 14, 2, 0x2a2a1a, 0.5);
  },
  reeds(c, w, h) {
    for (let k = 0; k < 7; k++) {
      const x = 2 + k * 2;
      const top = 2 + (k % 3) * 3;
      R(c, x, top, 1, h - top, k % 2 ? 0x5a7a40 : 0x4a6a34);
      if (k % 2 === 0) R(c, x, top - 1, 1, 4, 0x6a4a2a);
    }
  },
  cactus(c, w, h) {
    R(c, 7, 4, 5, h - 6, 0x3a8a3a);
    E(c, 9.5, 4, 2.5, 2.5, 0x3a8a3a);
    R(c, 2, 10, 2, 7, 0x3a8a3a);
    R(c, 2, 16, 5, 2, 0x3a8a3a);
    R(c, 14, 7, 2, 8, 0x3a8a3a);
    R(c, 11, 14, 5, 2, 0x3a8a3a);
    R(c, 8, 4, 1, h - 7, 0x5ab04a);
    for (const [x, y] of [[6, 8], [12, 12], [6, 18], [12, 22], [1, 12], [16, 9]]) R(c, x, y, 1, 1, 0xf0e8b0);
    E(c, 9.5, h - 2, 6, 2, 0xb08850);
  },
  desert_rock(c) {
    E(c, 13, 11, 12, 7, 0x9a7a5a);
    E(c, 11, 9, 9, 5, 0xb08a68);
    E(c, 9, 7, 4, 2, 0xc8a080);
    R(c, 4, 15, 18, 2, 0x6a4a34);
  },
  buried_desk(c) {
    R(c, 2, 4, 30, 8, 0x8a7458);
    R(c, 2, 4, 30, 1, 0xa8906c);
    R(c, 5, 6, 10, 4, 0xf2ead3);
    R(c, 6, 7, 7, 1, 0xd04a4a);
    R(c, 20, 6, 6, 3, 0x3a6ac8);
    E(c, 17, 14, 17, 5, 0xd8b878);
    E(c, 17, 13, 14, 3, 0xe4c88a);
  },
  pub_table(c, w, h, v) {
    R(c, 4, 16, 3, 12, 0x2a1e18);
    R(c, w - 7, 16, 3, 12, 0x2a1e18);
    R(c, 1, 4, w - 2, 14, 0x9a9aa0);
    R(c, 2, 5, w - 4, 12, 0xb8b8c0);
    E(c, w / 2, 11, 8, 4, 0x2a2a30);
    E(c, w / 2, 10, 6, 2.5, 0xc84a2a);
    // 초록 병·잔
    for (const bx of [6, w - 10, 14]) {
      R(c, bx, 0, 3, 8, 0x3a9a4a);
      R(c, bx + 1, 0, 1, 2, 0xd8d8d8);
      R(c, bx, 3, 3, 2, 0xf2ead3);
    }
    R(c, w - 18, 4, 3, 4, 0xe8f0f0);
    R(c, 22 + (v % 3), 13, 3, 3, 0xe8f0f0);
    R(c, 1, 18, w - 2, 2, 0x5a5a62);
  },
  stool(c) {
    E(c, 5, 4, 4, 2.5, 0xc83c3c);
    E(c, 5, 3.5, 3, 1.5, 0xe05a5a);
    R(c, 4, 6, 2, 4, 0x6a727c);
  },
  crates(c, w, h) {
    for (let k = 0; k < 3; k++) {
      const y = h - 11 - k * 11;
      R(c, 1, y, 24, 11, k % 2 ? 0x2a7a3a : 0x3a8a4a);
      frame(c, 1, y, 24, 11, 0x1a4a22);
      for (let x = 4; x < 24; x += 5) {
        R(c, x, y + 2, 3, 3, 0x6ab07a);
        R(c, x + 1, y + 1, 1, 2, 0xd8d8d8);
      }
    }
  },
  stall(c, w, h, v) {
    // 차양 (빨강·흰 줄무늬)
    for (let x = 0; x < w; x++) R(c, x, 4, 1, 10, Math.floor(x / 6) % 2 ? 0xf2f2ee : v > 200 ? 0x3a6ac8 : 0xd03a3a);
    for (let x = 0; x < w; x += 6) E(c, x + 3, 14, 3, 2, Math.floor(x / 6) % 2 ? 0xf2f2ee : v > 200 ? 0x3a6ac8 : 0xd03a3a);
    R(c, 2, 0, 2, h, 0x6a4a30);
    R(c, w - 4, 0, 2, h, 0x6a4a30);
    // 판매대
    R(c, 1, h - 18, w - 2, 16, 0x8a5a3a);
    R(c, 1, h - 18, w - 2, 3, 0xb07a4a);
    // 어묵·떡볶이
    E(c, 16, h - 18, 9, 3, 0xd84a2a);
    E(c, 16, h - 19, 7, 1.5, 0xf06a3a);
    for (let x = 32; x < w - 6; x += 5) {
      R(c, x, h - 26, 1, 8, 0xc8a070);
      R(c, x - 1, h - 26, 3, 4, 0xe8c890);
    }
    // 등
    E(c, 10, 18, 3, 3, 0xffb050);
    E(c, w - 10, 18, 3, 3, 0xffb050);
    R(c, 1, h - 2, w - 2, 2, 0x000000, 0.35);
  },
  lantern_post(c, w, h) {
    R(c, 4, 6, 2, h - 6, 0x2a2a3a);
    R(c, 3, h - 3, 4, 3, 0x2a2a3a);
    R(c, 1, 0, 8, 8, 0x2a2a3a);
    R(c, 2, 1, 6, 6, 0xffd080);
    R(c, 3, 2, 2, 3, 0xfff4d0);
  },
  light_tree(c, w, h) {
    R(c, 12, h - 14, 4, 13, 0x4a3a2a);
    E(c, 14, 16, 12, 14, 0x1e4a32);
    E(c, 12, 13, 8, 9, 0x2a5a3e);
    for (let k = 0; k < 18; k++) {
      const x = 4 + hash2(k, 1, 105) * 20;
      const y = 4 + hash2(k, 2, 105) * 24;
      R(c, x, y, 1, 1, [0xfff0a0, 0xff8a8a, 0x8ad0ff][k % 3]);
    }
    E(c, 14, h - 2, 9, 2, 0x000000, 0.35);
  },
  park_bench(c, w) {
    R(c, 1, 2, w - 2, 3, 0x8a5a3a);
    R(c, 1, 6, w - 2, 3, 0x8a5a3a);
    R(c, 1, 2, w - 2, 1, 0xa87a4a);
    R(c, 3, 9, 2, 5, 0x2a2a3a);
    R(c, w - 5, 9, 2, 5, 0x2a2a3a);
  },
};

/** 소품 하나의 그림 (Arena가 kind·v·flip마다 텍스처로 한 번 등록) */
export function propCanvas(kind: string, v = 0, flip = false): HTMLCanvasElement {
  const meta = PROP_META[kind];
  const { canvas, ctx } = makeCanvas(meta.w, meta.h);
  PROPS[kind]?.(ctx, meta.w, meta.h, v);
  if (!flip) return canvas;
  const f = makeCanvas(meta.w, meta.h);
  f.ctx.translate(meta.w, 0);
  f.ctx.scale(-1, 1);
  f.ctx.drawImage(canvas, 0, 0);
  return f.canvas;
}

/** 바닥 한 장: 바닥 무늬 → 무늬·지형 → 벽 → 그림자 */
export function floorCanvas(l: ArenaLayout): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(AW, AH);
  const th = THEMES[l.zone];
  th.floor(ctx, l);
  for (const d of l.decals) decal(ctx, d);
  for (const r of l.regions) regionBase(ctx, r);
  wallShade(ctx);
  sideWalls(ctx, th.side);
  th.wall(ctx, l);
  return canvas;
}

// ── 움직이는 것들의 작은 그림 ──

export function beltCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(16, 18);
  R(ctx, 0, 0, 16, 18, 0x22252c);
  for (let x = 0; x < 16; x += 8) {
    R(ctx, x, 0, 2, 18, 0x3a3f4a);
    // 화살표 (오른쪽)
    R(ctx, x + 3, 8, 3, 2, 0x4a505c);
  }
  R(ctx, 0, 0, 16, 1, 0x4a505c);
  R(ctx, 0, 17, 16, 1, 0x14161a);
  return canvas;
}

/** 컨베이어 방향 화살표 (방향이 바뀌기 전에 깜빡인다) */
export function arrowCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(9, 9);
  for (let i = 0; i < 5; i++) R(ctx, i, 4 - i, 2, 1 + i * 2, 0xf0d050);
  R(ctx, 0, 3, 3, 3, 0xf0d050);
  return canvas;
}

/** 지하철 창밖 터널 불빛 (가로로 흐른다) */
export function tunnelCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(96, 10);
  R(ctx, 0, 0, 96, 10, 0x1a2228);
  R(ctx, 10, 4, 20, 2, 0xfff0b0, 0.9);
  R(ctx, 12, 3, 16, 1, 0xfff0b0, 0.4);
  R(ctx, 58, 5, 10, 1, 0x8ad0ff, 0.7);
  R(ctx, 0, 8, 96, 1, 0x2a343a);
  for (let x = 0; x < 96; x += 24) R(ctx, x, 0, 2, 10, 0x0e1418);
  return canvas;
}

export function doorLeafCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(17, 28);
  R(ctx, 0, 0, 17, 28, 0xb8c0c8);
  R(ctx, 0, 0, 1, 28, 0xe0e6ec);
  R(ctx, 3, 3, 11, 12, 0x2a343c);
  R(ctx, 4, 4, 3, 10, 0x4a5a64);
  R(ctx, 0, 20, 17, 2, 0xf0c040);
  R(ctx, 16, 0, 1, 28, 0x6a727c);
  return canvas;
}

export function elevatorLeafCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(15, 26);
  R(ctx, 0, 0, 15, 26, 0x9aa2ae);
  for (let y = 2; y < 26; y += 3) R(ctx, 1, y, 13, 1, 0xa8b0bc);
  R(ctx, 0, 0, 1, 26, 0xc8d0da);
  R(ctx, 14, 0, 1, 26, 0x5a6270);
  return canvas;
}

/** 덩굴밭 한 장 (구역 크기에 맞춰 만든다) */
export function vineCanvas(w: number, h: number, salt: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  E(ctx, w / 2, h / 2, w / 2, h / 2, 0x2e6a2e, 0.85);
  E(ctx, w / 2, h / 2, w / 2 - 4, h / 2 - 3, 0x3a8a3a, 0.9);
  for (let k = 0; k < (w * h) / 40; k++) {
    const a = hash2(k, 1, salt) * Math.PI * 2;
    const rr = Math.sqrt(hash2(k, 2, salt));
    const x = w / 2 + Math.cos(a) * rr * (w / 2 - 3);
    const y = h / 2 + Math.sin(a) * rr * (h / 2 - 3);
    const t = hash2(k, 3, salt);
    R(ctx, x, y, 2, 2, t < 0.5 ? 0x5ab04a : t < 0.85 ? 0x2e6a2e : 0xf080b0);
    if (t > 0.95) R(ctx, x - 2, y - 1, 5, 4, 0xf0d050);
  }
  return canvas;
}

export const PARTICLE_COLORS: Record<ZoneId, Color[]> = {
  "meeting-room": [0xfff0c0],
  subway: [0xe8f0ff],
  gym: [0xfff8e8, 0xa8e0ff],
  "legacy-forest": [0xa8c8ff],
  library: [0xffe0a0],
  "cart-jungle": [0x5ab04a, 0x3a8a3a, 0xf080b0],
  "deadline-swamp": [0xd0ff70, 0xa0e060],
  "homework-desert": [0xf0dca0, 0xe0c080],
  "burnout-abyss": [0xff6ac8, 0x6ad0ff, 0xffd04a],
  "new-year-eve": [0xff6a6a, 0xffd04a, 0x6ad0ff, 0x8aff8a, 0xffffff],
};

/** 로비 카드 미리보기: 지도 + 소품 + 우두머리와 몬스터 몇 마리 (반 크기) */
export function arenaPreview(l: ArenaLayout, monsters: MonsterId[], scale = 0.5): HTMLCanvasElement {
  const full = makeCanvas(AW, AH);
  const c = full.ctx;
  c.drawImage(floorCanvas(l), 0, 0);
  for (const r of l.regions) {
    if (r.kind === "vine") c.drawImage(vineCanvas(r.w, r.h, (r.id ?? 0) + 7), r.x, r.y);
    if (r.kind === "conveyor") {
      const belt = beltCanvas();
      for (let x = r.x; x < r.x + r.w; x += 16) c.drawImage(belt, 0, 0, Math.min(16, r.x + r.w - x), 18, x, r.y, Math.min(16, r.x + r.w - x), r.h);
    }
  }
  const items: { y: number; draw: () => void }[] = l.props.map((p) => ({
    y: p.y,
    draw: () => {
      const m = PROP_META[p.kind];
      c.drawImage(propCanvas(p.kind, p.v ?? 0, !!p.flip), Math.round(p.x - m.w / 2), Math.round(p.y - m.h));
    },
  }));
  const spots = [
    { x: l.start.x + 30, y: l.start.y + 6 },
    { x: l.start.x - 70, y: l.start.y + 24 },
    { x: l.start.x + 96, y: l.start.y - 20 },
    { x: l.start.x - 120, y: l.start.y - 30 },
  ];
  monsters.slice(0, spots.length).forEach((id, i) => {
    const cv = monsterIdleCanvas(id);
    const s = spots[i];
    items.push({ y: s.y, draw: () => c.drawImage(cv, Math.round(s.x - cv.width / 2), Math.round(s.y - cv.height + 3)) });
  });
  items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
  // 조명·분위기
  const tone = AMBIENT[l.zone];
  if (tone.alpha > 0) {
    c.globalCompositeOperation = "multiply";
    c.fillStyle = css(tone.color, tone.alpha);
    c.fillRect(0, 0, AW, AH);
    c.globalCompositeOperation = "lighter";
    for (const li of l.lights) {
      const g = c.createRadialGradient(li.x, li.y, 0, li.x, li.y, li.r);
      g.addColorStop(0, css(li.color, 0.35));
      g.addColorStop(1, css(li.color, 0));
      c.fillStyle = g;
      c.fillRect(li.x - li.r, li.y - li.r, li.r * 2, li.r * 2);
    }
    c.globalCompositeOperation = "source-over";
  }
  const out = makeCanvas(Math.round(AW * scale), Math.round(AH * scale));
  out.ctx.imageSmoothingEnabled = scale < 1;
  out.ctx.drawImage(full.canvas, 0, 0, out.canvas.width, out.canvas.height);
  return out.canvas;
}

/** 사냥터 분위기: 곱하기로 덮는 색 (alpha 0이면 밝은 곳) */
export const AMBIENT: Record<ZoneId, { color: Color; alpha: number }> = {
  "meeting-room": { color: 0xfff4e0, alpha: 0 },
  subway: { color: 0xe8f0ff, alpha: 0 },
  gym: { color: 0xf0f0ff, alpha: 0 },
  "legacy-forest": { color: 0x6a7ab0, alpha: 0.7 },
  library: { color: 0xa08060, alpha: 0.6 },
  "cart-jungle": { color: 0xd0f0c0, alpha: 0.3 },
  "deadline-swamp": { color: 0x7a9a80, alpha: 0.65 },
  "homework-desert": { color: 0xfff0d0, alpha: 0.15 },
  "burnout-abyss": { color: 0x8a6ab0, alpha: 0.7 },
  "new-year-eve": { color: 0x6a6ab0, alpha: 0.65 },
};
