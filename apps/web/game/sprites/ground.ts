import { MAP_COLS, TILE } from "@tomb/protocol";
import { groundKind, POND, WATER, type GroundKind, type WaterBody } from "../world/layout";
import { css, darken, hash2, lighten, makeCanvas, rng, type Color } from "./pixel";

// 바닥 타일을 캔버스에 미리 구워 둔다. 월드는 세로로 긴 맵이라 CHUNK_H 단위 덩어리 텍스처로 나눠 굽고,
// 화면 근처 덩어리만 만든다 (GroundChunks). 낮 기준의 차분한 색으로 그리고, 밤 톤은 월드 틴트가 입힌다.

export const CHUNK_H = 512;
const VARIANTS = 6;

type GroundPal = typeof TEMPLE;

const TEMPLE = {
  grass: 0x4b5c3d,
  grassDark: 0x415234,
  grassLight: 0x586a47,
  blade: 0x67794f,
  dirt: 0x6c5b46,
  dirtDark: 0x5c4c3a,
  dirtLight: 0x7b6952,
  pebble: 0x8d8170,
  stone: 0x7a796f,
  stoneAlt: 0x84837a,
  mortar: 0x4e4d47,
  moss: 0x5d6b4a,
  wall: 0x76736a,
  wallFace: 0x625f57,
  wallLine: 0x45433d,
  water: 0x34515b,
  waterLight: 0x4e6f78,
  waterDark: 0x283f47,
  rim: 0x7a786e,
  rimDark: 0x57564f,
  lily: 0x55703f,
  /** 풀밭 장식 꽃잎/낙엽 색 */
  decal: [0xe9e2cf, 0xc9b8de, 0xe4cf86] as readonly Color[],
  /** 풀밭에 흩어진 장식 비율 */
  decalRate: 0.06,
};

const C: GroundPal = TEMPLE;

type TileCanvas = HTMLCanvasElement;
let tileCache: Map<string, TileCanvas[]> | null = null;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: Color, w = 1, h = 1) {
  ctx.fillStyle = css(c);
  ctx.fillRect(x, y, w, h);
}

function grassTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.grass, TILE, TILE);
  for (let i = 0; i < 26; i++) px(ctx, Math.floor(r() * TILE), Math.floor(r() * TILE), r() < 0.55 ? C.grassDark : C.grassLight);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * 15);
    const y = Math.floor(r() * 14);
    px(ctx, x, y, C.blade);
    px(ctx, x, y + 1, C.grassLight);
  }
  return canvas;
}

function dirtTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.dirt, TILE, TILE);
  for (let i = 0; i < 22; i++) px(ctx, Math.floor(r() * TILE), Math.floor(r() * TILE), r() < 0.5 ? C.dirtDark : C.dirtLight);
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(r() * 15);
    const y = Math.floor(r() * 15);
    px(ctx, x, y, C.pebble);
    px(ctx, x, y + 1, C.dirtDark);
  }
  return canvas;
}

function stoneTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.mortar, TILE, TILE);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const off = j % 2 ? 4 : 0;
      const x = (i * 8 + off) % 16;
      const base = r() < 0.5 ? C.stone : C.stoneAlt;
      px(ctx, x, j * 8, base, 7, 7);
      if (x + 7 > 16) px(ctx, 0, j * 8, base, x + 7 - 16, 7);
      px(ctx, x, j * 8, lighten(base, 0.12), 7, 1);
      px(ctx, x, j * 8 + 6, darken(base, 0.12), 7, 1);
    }
  }
  for (let i = 0; i < 4; i++) px(ctx, Math.floor(r() * TILE), Math.floor(r() * TILE), r() < 0.6 ? C.moss : darken(C.stone, 0.2));
  return canvas;
}

function wallTile(kind: "wallTop" | "wallFace" | "wallSide", seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  if (kind === "wallFace") {
    px(ctx, 0, 0, C.wallFace, TILE, TILE);
    for (let row = 0; row < 3; row++) {
      const y = row * 5 + 1;
      px(ctx, 0, y + 4, C.wallLine, TILE, 1);
      const off = row % 2 ? 3 : 8;
      px(ctx, off, y, C.wallLine, 1, 4);
      px(ctx, (off + 8) % 16, y, C.wallLine, 1, 4);
      px(ctx, 0, y, lighten(C.wallFace, 0.08), TILE, 1);
    }
    px(ctx, 0, 14, darken(C.wallFace, 0.35), TILE, 2);
  } else {
    px(ctx, 0, 0, C.wall, TILE, TILE);
    px(ctx, 0, 0, lighten(C.wall, 0.12), TILE, 1);
    px(ctx, 0, 7, C.wallLine, TILE, 1);
    px(ctx, 0, 15, C.wallLine, TILE, 1);
    const o = Math.floor(r() * 6) + 3;
    px(ctx, o, 0, C.wallLine, 1, 7);
    px(ctx, (o + 7) % 16, 8, C.wallLine, 1, 7);
    for (let i = 0; i < 5; i++) px(ctx, Math.floor(r() * 16), Math.floor(r() * 16), r() < 0.5 ? C.moss : darken(C.wall, 0.15));
  }
  return canvas;
}

function buildTiles(): Map<string, TileCanvas[]> {
  const m = new Map<string, TileCanvas[]>();
  const v = (f: (s: number) => TileCanvas, salt: number) => Array.from({ length: VARIANTS }, (_, i) => f(salt * 100 + i + 1));
  m.set("grass", v(grassTile, 1));
  m.set("dirt", v(dirtTile, 2));
  m.set("gate", v(dirtTile, 3));
  m.set("stone", v(stoneTile, 4));
  m.set("wallTop", v((s) => wallTile("wallTop", s), 5));
  m.set("wallFace", v((s) => wallTile("wallFace", s), 6));
  m.set("wallSide", v((s) => wallTile("wallSide", s), 7));
  return m;
}

const isGrass = (k: GroundKind) => k === "grass";
const isWall = (k: GroundKind) => k === "wallTop" || k === "wallFace" || k === "wallSide";

/** 덩어리 하나를 그린다. index 0 = 맵 최상단 */
export function drawGroundChunk(index: number, width = MAP_COLS * TILE): HTMLCanvasElement {
  if (!tileCache) tileCache = buildTiles();
  const tiles = tileCache;
  const { canvas, ctx } = makeCanvas(width, CHUNK_H);
  const cols = Math.ceil(width / TILE);
  const rows = CHUNK_H / TILE;
  const ty0 = (index * CHUNK_H) / TILE;

  for (let j = 0; j < rows; j++) {
    const ty = ty0 + j;
    for (let tx = 0; tx < cols; tx++) {
      const k = groundKind(tx, ty);
      const list = tiles.get(k)!;
      ctx.drawImage(list[Math.floor(hash2(tx, ty, 11) * list.length)], tx * TILE, j * TILE);
    }
  }

  // 경계 장식: 흙길·포석 가장자리로 풀이 삐져나오고, 담장 아래엔 그림자
  for (let j = 0; j < rows; j++) {
    const ty = ty0 + j;
    for (let tx = 0; tx < cols; tx++) {
      const k = groundKind(tx, ty);
      const x0 = tx * TILE;
      const y0 = j * TILE;
      if (!isGrass(k) && !isWall(k)) {
        const edges: [number, number, boolean][] = [
          [0, -1, isGrass(groundKind(tx, ty - 1))],
          [0, 1, isGrass(groundKind(tx, ty + 1))],
          [-1, 0, isGrass(groundKind(tx - 1, ty))],
          [1, 0, isGrass(groundKind(tx + 1, ty))],
        ];
        for (const [dx, dy, grass] of edges) {
          if (!grass) continue;
          for (let i = 0; i < TILE; i += 2) {
            const h = hash2(tx * 16 + i, ty * 16 + dx * 3 + dy * 7, 5);
            const len = h < 0.35 ? 0 : h < 0.75 ? 1 : 2;
            if (!len) continue;
            const c = h > 0.9 ? C.blade : C.grass;
            if (dy === -1) px(ctx, x0 + i, y0, c, 2, len);
            else if (dy === 1) px(ctx, x0 + i, y0 + TILE - len, c, 2, len);
            else if (dx === -1) px(ctx, x0, y0 + i, c, len, 2);
            else px(ctx, x0 + TILE - len, y0 + i, c, len, 2);
          }
        }
      }
      // 담장 그림자
      if (!isWall(k)) {
        if (isWall(groundKind(tx, ty - 1)) && ty - 1 <= 1) {
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(x0, y0, TILE, 3);
          ctx.fillStyle = "rgba(0,0,0,0.14)";
          ctx.fillRect(x0, y0 + 3, TILE, 2);
        }
        if (groundKind(tx - 1, ty) === "wallSide") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(x0, y0, 3, TILE);
        }
        if (groundKind(tx + 1, ty) === "wallSide") {
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fillRect(x0 + TILE - 2, y0, 2, TILE);
        }
      }
      // 풀밭 장식: 들꽃, 돌멩이, 짙은 풀숲
      if (isGrass(k)) {
        const h = hash2(tx, ty, 23);
        const ox = x0 + 2 + Math.floor(hash2(tx, ty, 29) * 11);
        const oy = y0 + 2 + Math.floor(hash2(tx, ty, 31) * 11);
        if (h < C.decalRate) {
          const petal = C.decal[Math.floor(hash2(tx, ty, 37) * C.decal.length)];
          px(ctx, ox, oy, petal);
          px(ctx, ox + 1, oy + 1, C.blade);
          px(ctx, ox + 2, oy - 1, petal);
        } else if (h < C.decalRate + 0.04) {
          px(ctx, ox, oy, C.pebble, 2, 1);
          px(ctx, ox, oy + 1, darken(C.pebble, 0.3), 2, 1);
        } else if (h < C.decalRate + 0.14) {
          px(ctx, ox, oy, C.grassDark, 3, 2);
          px(ctx, ox + 1, oy - 1, C.blade);
        }
      }
    }
  }

  drawPond(ctx, index * CHUNK_H);
  return canvas;
}

/** 물 몸체 안쪽 정도: <=1 이면 안. grow만큼 넓혀 본다 (테두리용) */
function waterD(b: WaterBody, x: number, y: number, grow: number): { d: number; dy: number } {
  if (b.kind === "rect") {
    const inside = x >= b.x - grow && x < b.x + b.w + grow && y >= b.y - grow && y < b.y + b.h + grow;
    return { d: inside ? 0 : 2, dy: ((y - b.y) / b.h) * 2 - 1 };
  }
  const dx = (x - b.x) / (b.rx + grow);
  const dy = (y - b.y) / (b.ry + grow);
  return { d: dx * dx + dy * dy, dy };
}

function drawPond(ctx: CanvasRenderingContext2D, chunkY: number) {
  for (const body of WATER) {
    const x0 = body.kind === "rect" ? body.x - 3 : body.x - body.rx - 3;
    const x1 = body.kind === "rect" ? body.x + body.w + 3 : body.x + body.rx + 3;
    const y0 = body.kind === "rect" ? body.y - 3 : body.y - body.ry - 3;
    const y1 = body.kind === "rect" ? body.y + body.h + 3 : body.y + body.ry + 3;
    if (y1 < chunkY || y0 > chunkY + CHUNK_H) continue;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        // 다른 몸체의 물 위에 테두리를 그리지 않도록 전체를 본다
        let water: { d: number; dy: number } | null = null;
        let rim = false;
        for (const b of WATER) {
          const w = waterD(b, x + 0.5, y + 0.5, 0);
          if (w.d <= 1) {
            water = w;
            break;
          }
          if (waterD(b, x + 0.5, y + 0.5, 2).d <= 1) rim = true;
        }
        let c: Color | null = null;
        if (water) {
          c = water.dy < -0.55 ? C.waterLight : water.dy > 0.5 ? C.waterDark : C.water;
          if (hash2(x, y, 41) < 0.04) c = C.waterLight;
        } else if (rim && x < MAP_COLS * TILE - 32) {
          c = hash2(x, y, 43) < 0.5 ? C.rim : C.rimDark;
        }
        if (c !== null) px(ctx, x, y - chunkY, c);
      }
    }
  }
  const { x: cx, y: cy } = POND;
  // 연잎
  const lily = (lx: number, ly: number) => {
    px(ctx, lx, ly - chunkY, C.lily, 3, 2);
    px(ctx, lx + 1, ly - chunkY, darken(C.lily, 0.3));
  };
  lily(cx - 14, cy + 2);
  lily(cx + 9, cy - 4);
  px(ctx, cx + 10, cy - 5 - chunkY, 0xe9d7e0);
}
