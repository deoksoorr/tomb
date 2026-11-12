import { GRAVE_AREAS, HILL, HILL_CLIFF, HILL_STAIRS, HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS, MAP_HEIGHT, MAP_WIDTH, PONDS, RIVER_HALF_W, RIVER_PATH, STEP_STONE_R, STEP_STONES, TELESCOPE, TILE } from "@tomb/protocol";
import { DECKS, deckRails, ELLIPSES, ellipseD, groundKind, PLAZA_FIRE, PLAZA_RECT, PLAZA_TREES, riverDist, type GroundKind, type Rect } from "../world/layout";
import { css, darken, hash2, lighten, makeCanvas, rng, type Color } from "./pixel";

// 바닥 타일을 캔버스에 미리 구워 둔다. CHUNK × CHUNK 정사각 덩어리로 나눠 굽고, 화면 근처 덩어리만 만든다 (WorldMap).
// 가을~초겨울 기준의 차분한 색(마른 풀·낙엽·이끼 낀 묘역 흙·자갈길)으로 그리고, 밤 톤은 월드 틴트가 입힌다.
// 별 보기 언덕(F3)은 서리 내린 높은 대지: 가장자리 밝은 턱 + 두 칸 높이 바위 절벽 + 절벽 아래 그림자 + 꼭대기 돌 마당.
// 물(강·호수)·판자(다리·나루터·잔교)·징검다리도 바닥에 함께 굽는다 (물결 반짝임만 WorldMap이 따로 움직인다).

export const CHUNK = 512;
/** @deprecated 예전 이름 (세로 띠 덩어리). CHUNK와 같다 */
export const CHUNK_H = CHUNK;
/** 가로·세로 덩어리 수 */
export const CHUNK_COLS = Math.ceil(MAP_WIDTH / CHUNK);
export const CHUNK_ROWS = Math.ceil(MAP_HEIGHT / CHUNK);
const VARIANTS = 6;

const C = {
  // 늦가을 풀밭: 누렇게 마른 올리브빛
  grass: 0x5b5a3b,
  grassDark: 0x4e4d32,
  grassLight: 0x6a6745,
  blade: 0x7b744c,
  // 언덕: 서리 내린 높은 풀밭 (아래 풀밭보다 밝고 차가운 초록)
  hill: 0x646d4f,
  hillDark: 0x565f43,
  hillLight: 0x737c5b,
  hillFrost: 0x929c80,
  snow: 0xdfe6ea,
  snowShade: 0xbfcad2,
  dirt: 0x6c5b46,
  dirtDark: 0x5c4c3a,
  dirtLight: 0x7b6952,
  pebble: 0x8d8170,
  stone: 0x7a796f,
  stoneAlt: 0x84837a,
  mortar: 0x4e4d47,
  cobble: 0x5a554c,
  cobbleStone: 0x77716a,
  moss: 0x5d6b4a,
  // 묘역: 이끼 낀 짙은 땅 (풀밭보다 차갑고 어둡게)
  grave: 0x3e4236,
  graveDark: 0x33372d,
  graveLight: 0x4b5040,
  // 묘역 자갈길
  gravel: 0x77736a,
  gravelDark: 0x5e5b54,
  gravelLight: 0x908c82,
  wall: 0x76736a,
  wallFace: 0x625f57,
  wallLine: 0x45433d,
  cliff: 0x6a6358,
  cliffDark: 0x4f4a42,
  cliffLight: 0x857d70,
  water: 0x36535d,
  waterLight: 0x507079,
  waterDark: 0x2a414a,
  rim: 0x7a786e,
  rimDark: 0x57564f,
  plank: 0x8a6a48,
  plankDark: 0x6a5036,
  plankLine: 0x3e2e20,
  /** 낙엽 (주황·빨강·노랑·갈색) */
  leaves: [0xc8642e, 0xa8402a, 0xd8a83a, 0x8a5a2e, 0xb5782f] as readonly Color[],
  leafRate: 0.1,
};

type TileCanvas = HTMLCanvasElement;
let tileCache: Map<string, TileCanvas[]> | null = null;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: Color, w = 1, h = 1) {
  ctx.fillStyle = css(c);
  ctx.fillRect(x, y, w, h);
}

function speckled(seed: number, base: Color, dark: Color, light: Color, blade: Color | null, n = 26): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, base, TILE, TILE);
  for (let i = 0; i < n; i++) px(ctx, Math.floor(r() * TILE), Math.floor(r() * TILE), r() < 0.55 ? dark : light);
  if (blade !== null)
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(r() * 15);
      const y = Math.floor(r() * 14);
      px(ctx, x, y, blade);
      px(ctx, x, y + 1, light);
    }
  return canvas;
}

/** 풀밭 타일 한 칸 (16×16). 상점 입어 보기 무대 바닥에도 쓴다 */
export function grassTile(seed: number): TileCanvas {
  return speckled(seed, C.grass, C.grassDark, C.grassLight, C.blade);
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

/** 주거 구역 골목: 둥근 자갈 */
function cobbleTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.cobble, TILE, TILE);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 3; i++) {
      const x = i * 6 + (j % 2 ? 3 : 0) - 1 + Math.floor(r() * 2);
      const y = j * 4 + 1;
      const c = r() < 0.5 ? C.cobbleStone : lighten(C.cobbleStone, 0.08);
      px(ctx, x, y, c, 4, 2);
      px(ctx, x, y, lighten(c, 0.15), 3, 1);
    }
  return canvas;
}

function cliffTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.cliff, TILE, TILE);
  // 층층이 갈라진 바위 면 + 위쪽 눈 덮인 가장자리
  for (let y = 4; y < TILE; y += 4) px(ctx, 0, y, C.cliffDark, TILE, 1);
  for (let i = 0; i < 6; i++) px(ctx, Math.floor(r() * 15), 4 + Math.floor(r() * 11), C.cliffLight, 2, 1);
  for (let i = 0; i < 3; i++) px(ctx, Math.floor(r() * 16), 5 + Math.floor(r() * 10), C.cliffDark, 1, 3);
  // 위 턱: 서리 낀 풀이 걸친 밝은 가장자리
  px(ctx, 0, 0, lighten(C.hill, 0.18), TILE, 2);
  px(ctx, 0, 2, C.cliffLight, TILE, 1);
  for (let x = 0; x < TILE; x += 3) if (r() < 0.6) px(ctx, x, 3, lighten(C.hill, 0.05), 2, 1);
  return canvas;
}

/** 절벽 아랫단 (두 칸 높이 절벽의 아래 칸): 더 어둡고, 맨 아래는 땅에 박힌 바위 */
function cliffLowTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, darken(C.cliff, 0.12), TILE, TILE);
  for (let y = 3; y < TILE; y += 4) px(ctx, 0, y, darken(C.cliffDark, 0.1), TILE, 1);
  for (let i = 0; i < 5; i++) px(ctx, Math.floor(r() * 15), Math.floor(r() * 12), C.cliffLight, 2, 1);
  for (let i = 0; i < 4; i++) px(ctx, Math.floor(r() * 16), Math.floor(r() * 12), C.cliffDark, 1, 3);
  for (let x = 0; x < TILE; x += 4) px(ctx, x + Math.floor(r() * 2), TILE - 4, darken(C.cliff, 0.3), 3, 2);
  px(ctx, 0, TILE - 2, darken(C.cliff, 0.5), TILE, 2);
  return canvas;
}

/** 동쪽 비탈 (세로 바위 결) */
function cliffSideTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.cliff, TILE, TILE);
  for (let x = 3; x < TILE; x += 4) px(ctx, x, 0, C.cliffDark, 1, TILE);
  for (let i = 0; i < 6; i++) px(ctx, Math.floor(r() * 14), Math.floor(r() * 15), C.cliffLight, 1, 2);
  px(ctx, 0, 0, lighten(C.cliffLight, 0.15), 2, TILE);
  px(ctx, TILE - 3, 0, darken(C.cliff, 0.4), 3, TILE);
  return canvas;
}

function stairsTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.cliffDark, TILE, TILE);
  for (let y = 0; y < TILE; y += 4) {
    px(ctx, 2, y, C.stoneAlt, TILE - 4, 3);
    px(ctx, 2, y, lighten(C.stoneAlt, 0.18), TILE - 4, 1);
    px(ctx, 2, y + 3, darken(C.stoneAlt, 0.35), TILE - 4, 1);
    if (r() < 0.3) px(ctx, 3 + Math.floor(r() * 9), y + 1, C.moss, 2, 1);
  }
  // 양옆 돌 난간
  px(ctx, 0, 0, darken(C.cliff, 0.2), 2, TILE);
  px(ctx, TILE - 2, 0, darken(C.cliff, 0.2), 2, TILE);
  return canvas;
}

/** 묘역 자갈길 */
function gravelTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.gravel, TILE, TILE);
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(r() * 15);
    const y = Math.floor(r() * 15);
    const c = r() < 0.45 ? C.gravelDark : C.gravelLight;
    px(ctx, x, y, c, r() < 0.3 ? 2 : 1, 1);
  }
  for (let i = 0; i < 3; i++) px(ctx, Math.floor(r() * 15), Math.floor(r() * 15), C.moss);
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
    // 담 위에 내려앉은 눈
    if (kind === "wallTop") for (let x = 0; x < TILE; x++) if (r() < 0.55) px(ctx, x, 0, C.snow, 1, 1 + Math.floor(r() * 2));
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
  m.set("cobble", v(cobbleTile, 8));
  m.set("grave", v((s) => speckled(s, C.grave, C.graveDark, C.graveLight, C.moss, 30), 9));
  m.set("hill", v((s) => speckled(s, C.hill, C.hillDark, C.hillLight, C.hillFrost, 22), 10));
  m.set("cliff", v(cliffTile, 11));
  m.set("cliffLow", v(cliffLowTile, 13));
  m.set("cliffSide", v(cliffSideTile, 14));
  m.set("gravel", v(gravelTile, 15));
  m.set("stairs", v(stairsTile, 12));
  return m;
}

const CLIFF_TY0 = (HILL.y + HILL.h) / TILE;
const CLIFF_TX = (HILL.x + HILL.w) / TILE;
const isSoft = (k: GroundKind) => k === "grass" || k === "hill" || k === "grave";
const isWall = (k: GroundKind) => k === "wallTop" || k === "wallFace" || k === "wallSide";
const edgeColor = (k: GroundKind): Color => (k === "hill" ? C.hill : k === "grave" ? C.grave : C.grass);

/** 덩어리 하나를 그린다. (cx, cy) = 덩어리 칸 (0,0 = 맵 왼쪽 위) */
export function drawGroundChunk(cx: number, cy = 0): HTMLCanvasElement {
  if (!tileCache) tileCache = buildTiles();
  const tiles = tileCache;
  const { canvas, ctx } = makeCanvas(CHUNK, CHUNK);
  const n = CHUNK / TILE;
  const tx0 = (cx * CHUNK) / TILE;
  const ty0 = (cy * CHUNK) / TILE;

  for (let j = 0; j < n; j++) {
    const ty = ty0 + j;
    for (let i = 0; i < n; i++) {
      const tx = tx0 + i;
      const k = groundKind(tx, ty);
      // 절벽은 두 칸 높이 (아랫단은 더 어둡게), 동쪽 비탈은 세로 결
      const key = k === "cliff" ? (tx === CLIFF_TX && ty < CLIFF_TY0 ? "cliffSide" : ty > CLIFF_TY0 ? "cliffLow" : "cliff") : k;
      const list = tiles.get(key)!;
      ctx.drawImage(list[Math.floor(hash2(tx, ty, 11) * list.length)], i * TILE, j * TILE);
    }
  }

  // 경계 장식: 흙길·포석 가장자리로 풀이 삐져나오고, 담장·절벽 아래엔 그림자. 풀밭엔 낙엽·돌멩이·풀숲, 언덕엔 눈
  for (let j = 0; j < n; j++) {
    const ty = ty0 + j;
    for (let i = 0; i < n; i++) {
      const tx = tx0 + i;
      const k = groundKind(tx, ty);
      const x0 = i * TILE;
      const y0 = j * TILE;
      if (!isSoft(k) && !isWall(k) && k !== "cliff" && k !== "stairs") {
        const edges: [number, number, GroundKind][] = [
          [0, -1, groundKind(tx, ty - 1)],
          [0, 1, groundKind(tx, ty + 1)],
          [-1, 0, groundKind(tx - 1, ty)],
          [1, 0, groundKind(tx + 1, ty)],
        ];
        for (const [dx, dy, nk] of edges) {
          if (!isSoft(nk)) continue;
          const c0 = edgeColor(nk);
          for (let s = 0; s < TILE; s += 2) {
            const h = hash2(tx * 16 + s, ty * 16 + dx * 3 + dy * 7, 5);
            const len = h < 0.35 ? 0 : h < 0.75 ? 1 : 2;
            if (!len) continue;
            const c = h > 0.9 ? C.blade : c0;
            if (dy === -1) px(ctx, x0 + s, y0, c, 2, len);
            else if (dy === 1) px(ctx, x0 + s, y0 + TILE - len, c, 2, len);
            else if (dx === -1) px(ctx, x0, y0 + s, c, len, 2);
            else px(ctx, x0 + TILE - len, y0 + s, c, len, 2);
          }
        }
      }
      if (!isWall(k)) {
        const up = groundKind(tx, ty - 1);
        if (up === "cliff" || up === "stairs") {
          // 절벽이 드리운 그림자 (높이감): 짙게 시작해 아래로 옅어진다
          for (let s = 0; s < 10; s++) {
            ctx.fillStyle = `rgba(0,0,0,${(0.42 * (1 - s / 10)).toFixed(3)})`;
            ctx.fillRect(x0, y0 + s, TILE, 1);
          }
        } else if (isWall(up) && ty - 1 <= 1) {
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(x0, y0, TILE, 3);
          ctx.fillStyle = "rgba(0,0,0,0.14)";
          ctx.fillRect(x0, y0 + 3, TILE, 2);
        }
        if (groundKind(tx - 1, ty) === "wallSide") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(x0, y0, 3, TILE);
        } else if (groundKind(tx - 1, ty) === "cliff" && k !== "cliff") {
          for (let s = 0; s < 8; s++) {
            ctx.fillStyle = `rgba(0,0,0,${(0.36 * (1 - s / 8)).toFixed(3)})`;
            ctx.fillRect(x0 + s, y0, 1, TILE);
          }
        }
        if (groundKind(tx + 1, ty) === "wallSide") {
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fillRect(x0 + TILE - 2, y0, 2, TILE);
        }
      }
      const h = hash2(tx, ty, 23);
      const ox = x0 + 2 + Math.floor(hash2(tx, ty, 29) * 11);
      const oy = y0 + 2 + Math.floor(hash2(tx, ty, 31) * 11);
      if (k === "grass" || k === "grave") {
        if (h < C.leafRate) {
          // 낙엽 두세 장
          const leaf = C.leaves[Math.floor(hash2(tx, ty, 37) * C.leaves.length)];
          px(ctx, ox, oy, leaf, 2, 1);
          px(ctx, ox + 1, oy + 1, darken(leaf, 0.25));
          if (h < C.leafRate * 0.6) px(ctx, ox + 4, oy - 2, C.leaves[Math.floor(hash2(tx, ty, 41) * C.leaves.length)], 2, 1);
        } else if (h < C.leafRate + 0.04) {
          px(ctx, ox, oy, C.pebble, 2, 1);
          px(ctx, ox, oy + 1, darken(C.pebble, 0.3), 2, 1);
        } else if (h < C.leafRate + 0.13) {
          px(ctx, ox, oy, k === "grave" ? C.graveDark : C.grassDark, 3, 2);
          px(ctx, ox + 1, oy - 1, C.blade);
        }
      }
    }
  }

  const area: Rect = { x: cx * CHUNK, y: cy * CHUNK, w: CHUNK, h: CHUNK };
  shadeSoftGround(ctx, area, tx0, ty0);
  drawPlaza(ctx, area);
  drawLots(ctx, area);
  drawGraveyards(ctx, area);
  drawHill(ctx, area);
  drawWater(ctx, area);
  drawDecks(ctx, area);
  return canvas;
}

/** 부드러운 값 노이즈 0..1 (격자 scale px, 결정적) */
function vnoise(x: number, y: number, scale: number, salt: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, salt);
  const b = hash2(x0 + 1, y0, salt);
  const c = hash2(x0, y0 + 1, salt);
  const d = hash2(x0 + 1, y0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * 풀밭·묘역·언덕 바닥에 큰 얼룩을 입힌다 (넓은 풀밭이 한 가지 색으로 밋밋하지 않게):
 *  - 풀밭: 누런 마른 풀 / 짙은 풀 얼룩 (4px 블록 단위 명암)
 *  - 언덕: 서리 내린 높은 대지 (눈 얼룩 없음 — F3), 가장자리로 갈수록 살짝 어둡게
 */
function shadeSoftGround(ctx: CanvasRenderingContext2D, area: Rect, tx0: number, ty0: number): void {
  const img = ctx.getImageData(0, 0, area.w, area.h);
  const d = img.data;
  const n = CHUNK / TILE;
  const kinds: GroundKind[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) kinds.push(groundKind(tx0 + i, ty0 + j));
  for (let by = 0; by < area.h; by += 4)
    for (let bx = 0; bx < area.w; bx += 4) {
      const k = kinds[Math.floor(by / TILE) * n + Math.floor(bx / TILE)];
      if (k !== "grass" && k !== "grave" && k !== "hill") continue;
      const wx = area.x + bx;
      const wy = area.y + by;
      if (k === "hill") {
        // 높은 대지: 달빛을 받아 아래 땅보다 밝고 차갑게, 가장자리(절벽 쪽)로 갈수록 살짝 어두워져 둥근 언덕처럼 보인다
        const edge = Math.min(HILL.y + HILL.h - wy, HILL.x + HILL.w - wx, wx - HILL.x + 40, wy - HILL.y + 40);
        const v = vnoise(wx, wy, 40, 61) - 0.5;
        const m = 1.05 + v * 0.12 - (edge < 28 ? (28 - edge) * 0.004 : 0);
        for (let yy = 0; yy < 4; yy++)
          for (let xx = 0; xx < 4; xx++) {
            const i = ((by + yy) * area.w + bx + xx) * 4;
            d[i] = Math.min(255, d[i] * m);
            d[i + 1] = Math.min(255, d[i + 1] * m + 2);
            d[i + 2] = Math.min(255, d[i + 2] * m + 5);
          }
        continue;
      }
      // 풀밭 명암: 큰 얼룩(마른 풀은 밝고 누렇게, 짙은 곳은 어둡게)
      const v = vnoise(wx, wy, 72, 53) - 0.5;
      const w2 = vnoise(wx, wy, 20, 59) - 0.5;
      const m = 1 + v * 0.16 + w2 * 0.05;
      const warm = v > 0.12 ? (v - 0.12) * 30 : 0;
      for (let yy = 0; yy < 4; yy++)
        for (let xx = 0; xx < 4; xx++) {
          const i = ((by + yy) * area.w + bx + xx) * 4;
          d[i] = Math.min(255, d[i] * m + warm);
          d[i + 1] = Math.min(255, d[i + 1] * m + warm * 0.6);
          d[i + 2] = Math.min(255, d[i + 2] * m);
        }
    }
  ctx.putImageData(img, 0, 0);
}

/** 광장: 가장자리 돌 테두리 + 우물 둘레 둥근 무늬 포석 + 나무 둘레 흙 화단 */
function drawPlaza(ctx: CanvasRenderingContext2D, area: Rect): void {
  const P = PLAZA_RECT;
  if (!overlaps({ x: P.x - 4, y: P.y - 4, w: P.w + 8, h: P.h + 8 }, area)) return;
  const ox = area.x;
  const oy = area.y;
  // 테두리 (모서리 한 칸은 둥글게 비어 있다)
  const edge = 0x5f5d55;
  const lip = 0x9a978c;
  px(ctx, P.x + TILE - ox, P.y - oy, edge, P.w - 2 * TILE, 3);
  px(ctx, P.x + TILE - ox, P.y - oy, lip, P.w - 2 * TILE, 1);
  px(ctx, P.x + TILE - ox, P.y + P.h - 3 - oy, edge, P.w - 2 * TILE, 3);
  px(ctx, P.x - ox, P.y + TILE - oy, edge, 3, P.h - 2 * TILE);
  px(ctx, P.x + P.w - 3 - ox, P.y + TILE - oy, edge, 3, P.h - 2 * TILE);
  // 큰 모닥불 둘레 둥근 무늬 (밝은 원판 + 두 겹 고리 + 방사형 줄눈) — 통나무 의자가 이 원 안에 둘러 있다
  const cx = PLAZA_FIRE.x;
  const cy = PLAZA_FIRE.y + 4;
  const R = 92;
  for (let y = -R - 2; y <= R + 2; y++)
    for (let x = -R - 2; x <= R + 2; x++) {
      const r = Math.hypot(x, y * 1.25);
      if (r > R + 1.5) continue;
      const wx = cx + x;
      const wy = cy + y;
      if (wx < ox || wy < oy || wx >= ox + area.w || wy >= oy + area.h) continue;
      let c: Color | null = null;
      if (r > R - 1.5) c = 0x4e4d47;
      else if (r > R - 4.5) c = (Math.floor(Math.atan2(y, x) * 12) & 1) ? 0x9c988a : 0x8a877b;
      else if (r > R - 6) c = 0x4e4d47;
      else if (r < 42 && r > 39) c = 0x6e6a5e;
      else if (r < 39) c = hash2(wx, wy, 81) < 0.5 ? 0x7f7a6e : 0x767166; // 그을린 화덕 둘레
      else {
        const a = Math.atan2(y, x);
        if (Math.abs(((a / (Math.PI * 2)) * 16) % 1) < 0.08) c = 0x5c5a52;
      }
      if (c !== null) px(ctx, wx - ox, wy - oy, c);
    }
  // 광장 안 나무 둘레 화단 (흙 + 낙엽)
  for (const t of PLAZA_TREES) {
    for (let y = -7; y <= 4; y++)
      for (let x = -12; x <= 12; x++) {
        if ((x * x) / 144 + (y * y) / 49 > 1) continue;
        const wx = t.x + x;
        const wy = t.y + y;
        if (wx < ox || wy < oy || wx >= ox + area.w || wy >= oy + area.h) continue;
        const edgeRing = (x * x) / 144 + (y * y) / 49 > 0.72;
        px(ctx, wx - ox, wy - oy, edgeRing ? 0x6a675e : hash2(wx, wy, 83) < 0.18 ? C.leaves[Math.floor(hash2(wx, wy, 85) * 5)] : C.dirtDark);
      }
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 주거 구역 필지: 잔디를 깎아 둔 마당 + 모서리 말뚝 */
function drawLots(ctx: CanvasRenderingContext2D, area: Rect): void {
  for (const l of HOUSE_LOTS) {
    const r = { x: l.x + 2, y: l.y + 30, w: HOUSE_LOT_W - 4, h: HOUSE_LOT_H - 30 };
    if (!overlaps(r, area)) continue;
    ctx.fillStyle = "rgba(150,140,90,0.10)";
    ctx.fillRect(r.x - area.x, r.y - area.y, r.w, r.h);
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w - 2, r.y],
      [r.x, r.y + r.h - 3],
      [r.x + r.w - 2, r.y + r.h - 3],
    ])
      px(ctx, x - area.x, y - area.y, 0x6a5036, 2, 3);
  }
}

/** 묘역 땅: 철책 안쪽 가장자리 그늘 + 묘비 자리마다 살짝 솟은 흙 봉분 (철책·문은 소품) */
function drawGraveyards(ctx: CanvasRenderingContext2D, area: Rect): void {
  for (const a of GRAVE_AREAS) {
    const g = a.rect;
    if (!overlaps({ x: g.x - 4, y: g.y - 4, w: g.w + 8, h: g.h + 8 }, area)) continue;
    for (let s = 0; s < 6; s++) {
      ctx.fillStyle = `rgba(0,0,0,${(0.16 * (1 - s / 6)).toFixed(3)})`;
      ctx.fillRect(g.x + s - area.x, g.y + s - area.y, g.w - 2 * s, 1);
      ctx.fillRect(g.x + s - area.x, g.y + s - area.y, 1, g.h - 2 * s);
      ctx.fillRect(g.x + g.w - 1 - s - area.x, g.y + s - area.y, 1, g.h - 2 * s);
    }
    // 봉분 (묘비 받침 뒤, 위쪽으로 길쭉한 흙더미)
    for (let r = 0; r < a.rows; r++)
      for (let c = 0; c < a.cols; c++) {
        const x = a.x0 + c * a.dx + (c >= a.block ? a.aisle : 0);
        const y = a.y0 + r * a.dy;
        for (let yy = -16; yy <= 12; yy++)
          for (let xx = -9; xx <= 9; xx++) {
            const e = (xx * xx) / 81 + ((yy + 2) * (yy + 2)) / 196;
            if (e > 1) continue;
            const wx = x + xx;
            const wy = y + yy;
            if (wx < area.x || wy < area.y || wx >= area.x + area.w || wy >= area.y + area.h) continue;
            const shade = e > 0.7 ? 0x2f332a : yy < -6 ? 0x4a4e3c : 0x40443a;
            px(ctx, wx - area.x, wy - area.y, hash2(wx, wy, 87) < 0.08 ? C.moss : shade);
          }
      }
  }
}

/** 별 보기 언덕 (F3): 절벽 위 밝은 턱, 꼭대기 돌 마당(망원경 자리) */
function drawHill(ctx: CanvasRenderingContext2D, area: Rect): void {
  const H = { x: HILL.x, y: HILL.y, w: HILL.w, h: HILL.h };
  if (!overlaps({ x: H.x, y: H.y, w: H.w + TILE, h: H.h + HILL_CLIFF }, area)) return;
  const bottom = H.y + H.h;
  const right = H.x + H.w;
  // 가장자리 턱 (남쪽·동쪽) — 계단 자리만 비운다
  for (let x = H.x; x < right; x++) {
    if (x >= HILL_STAIRS.x && x < HILL_STAIRS.x + HILL_STAIRS.w) continue;
    if (x < area.x || x >= area.x + area.w) continue;
    for (const [dy, c] of [[-3, 0x8e9888], [-2, 0xa6b0a0], [-1, 0x7a8474]] as const) {
      const y = bottom + dy;
      if (y >= area.y && y < area.y + area.h) px(ctx, x - area.x, y - area.y, c);
    }
  }
  for (let y = H.y; y < bottom; y++) {
    if (y < area.y || y >= area.y + area.h) continue;
    for (const [dx, c] of [[-3, 0x8e9888], [-2, 0xa6b0a0], [-1, 0x7a8474]] as const) {
      const x = right + dx;
      if (x >= area.x && x < area.x + area.w) px(ctx, x - area.x, y - area.y, c);
    }
  }
  // 꼭대기 돌 마당: 둥글게 깐 납작 돌 + 테두리
  const cx = TELESCOPE.x;
  const cy = TELESCOPE.y - 2;
  const R = 30;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const r = Math.hypot(x, y * 1.4);
      if (r > R) continue;
      const wx = cx + x;
      const wy = cy + y;
      if (wx < area.x || wy < area.y || wx >= area.x + area.w || wy >= area.y + area.h) continue;
      let c: Color;
      if (r > R - 2) c = 0x5c5e56;
      else if (r > R - 4) c = 0x9a9c92;
      else {
        const cell = (Math.floor((wx + (Math.floor(wy / 5) % 2) * 3) / 6) * 7 + Math.floor(wy / 5) * 13) % 5;
        c = (wx % 6 === 0 || wy % 5 === 0) ? 0x5e5f58 : cell < 2 ? 0x8a8c84 : cell < 4 ? 0x7e8078 : 0x939589;
      }
      px(ctx, wx - area.x, wy - area.y, c);
    }
}

/** 물(강·호수·연못) 픽셀. 이미지 데이터로 한 번에 쓴다 (물이 걸치는 덩어리만) */
const RIVER_Y0 = Math.min(...RIVER_PATH.map((p) => p.y)) - RIVER_HALF_W - 4;
const RIVER_Y1 = Math.max(...RIVER_PATH.map((p) => p.y)) + RIVER_HALF_W + 4;
function drawWater(ctx: CanvasRenderingContext2D, area: Rect): void {
  const boxes: Rect[] = [{ x: 0, y: RIVER_Y0, w: MAP_WIDTH, h: RIVER_Y1 - RIVER_Y0 }, ...ELLIPSES.map((e) => ({ x: e.x - e.rx - 6, y: e.y - e.ry - 6, w: e.rx * 2 + 12, h: e.ry * 2 + 12 }))];
  const hit = boxes.filter((b) => overlaps(b, area));
  if (!hit.length) return;
  const y0 = Math.max(area.y, Math.min(...hit.map((b) => b.y)));
  const y1 = Math.min(area.y + area.h, Math.max(...hit.map((b) => b.y + b.h)));
  if (y1 <= y0) return;
  const w = area.w;
  const h = y1 - y0;
  const img = ctx.getImageData(0, y0 - area.y, w, h);
  const d = img.data;
  const put = (i: number, c: Color) => {
    d[i] = (c >> 16) & 255;
    d[i + 1] = (c >> 8) & 255;
    d[i + 2] = c & 255;
    d[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    const wy = y0 + y + 0.5;
    for (let x = 0; x < w; x++) {
      const wx = area.x + x + 0.5;
      const rd = riverDist(wx, wy);
      // 가장 가까운(정규화 거리가 가장 작은) 타원 물
      let ld = Infinity;
      let ldy = 0;
      for (const e of ELLIPSES) {
        const v = ellipseD(e, wx, wy);
        if (v < ld) {
          ld = v;
          ldy = (wy - e.y) / e.ry;
        }
      }
      const i = (y * w + x) * 4;
      if (rd <= RIVER_HALF_W || ld <= 1) {
        let c: Color;
        if (ld <= 1) {
          // 가장자리 얕은 물 → 가운데 깊은 물, 경계는 디더링으로 부드럽게
          const j = (hash2(Math.floor(wx), Math.floor(wy), 49) - 0.5) * 0.18;
          c = ldy < -0.7 && ld > 0.55 ? C.waterLight : ld + j < 0.35 ? C.waterDark : ld + j > 0.86 ? lighten(C.water, 0.06) : C.water;
        } else {
          const t = rd / RIVER_HALF_W;
          c = t > 0.82 ? C.waterLight : t < 0.38 ? C.waterDark : C.water;
          // 물살 무늬 (짧은 가로 줄)
          if (hash2(Math.floor(wx / 6), Math.floor(wy), 47) < 0.05) c = lighten(C.water, 0.18);
        }
        if (hash2(Math.floor(wx), Math.floor(wy), 41) < 0.025) c = C.waterLight;
        put(i, c);
      } else if (rd <= RIVER_HALF_W + 2.5 || (ld <= 1.07 && ld > 1)) {
        // 둑 테두리 (젖은 돌·모래)
        put(i, hash2(Math.floor(wx), Math.floor(wy), 43) < 0.5 ? C.rim : C.rimDark);
      }
    }
  }
  ctx.putImageData(img, 0, y0 - area.y);
  // 연못 수련잎 (작은 연못만, 결정적 자리)
  for (const p of PONDS)
    for (let k = 0; k < 7; k++) {
      const a = hash2(k, p.x, 91) * Math.PI * 2;
      const rr = 0.45 + hash2(k, p.y, 93) * 0.4;
      const lx = Math.round(p.x + Math.cos(a) * p.rx * rr);
      const ly = Math.round(p.y + Math.sin(a) * p.ry * rr);
      if (!overlaps({ x: lx - 4, y: ly - 3, w: 8, h: 6 }, area)) continue;
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -3; xx <= 3; xx++) {
          if ((xx * xx) / 9 + (yy * yy) / 4 > 1 || (xx > 0 && yy === 0)) continue;
          px(ctx, lx + xx - area.x, ly + yy - area.y, yy < 0 ? 0x5f7a4a : 0x4a6238);
        }
      if (k % 3 === 0) px(ctx, lx - 1 - area.x, ly - 1 - area.y, 0xe8d8e0, 2, 1);
    }
  // 징검다리 돌
  for (const s of STEP_STONES) {
    if (!overlaps({ x: s.x - 8, y: s.y - 8, w: 16, h: 16 }, area)) continue;
    const r = STEP_STONE_R - 1;
    for (let yy = -r; yy <= r; yy++)
      for (let xx = -r; xx <= r; xx++) {
        const e = (xx * xx) / (r * r) + (yy * yy) / (r * 0.8 * (r * 0.8));
        if (e > 1) continue;
        px(ctx, s.x + xx - area.x, s.y + yy - area.y, yy < -1 ? lighten(C.stone, 0.15) : yy > 2 ? darken(C.stone, 0.25) : C.stone);
      }
    px(ctx, s.x - 2 - area.x, s.y - 3 - area.y, C.snow, 3, 1);
  }
}

/** 판자 (다리·나루터·잔교). 세로로 긴 판자는 가로 널, 가로로 긴 판자는 세로 널 + 양옆 난간 */
function drawDecks(ctx: CanvasRenderingContext2D, area: Rect): void {
  for (const dk of DECKS) {
    if (!overlaps(dk, area)) continue;
    const x = dk.x - area.x;
    const y = dk.y - area.y;
    const vertical = dk.h >= dk.w;
    px(ctx, x, y, C.plank, dk.w, dk.h);
    if (vertical) {
      for (let yy = 0; yy < dk.h; yy += 4) {
        px(ctx, x, y + yy, C.plankLine, dk.w, 1);
        px(ctx, x, y + yy + 1, lighten(C.plank, 0.1), dk.w, 1);
      }
    } else {
      for (let xx = 0; xx < dk.w; xx += 4) {
        px(ctx, x + xx, y, C.plankLine, 1, dk.h);
        px(ctx, x + xx + 1, y, lighten(C.plank, 0.1), 1, dk.h);
      }
    }
    // 난간 (F13: layout.deckRails와 같은 자리 — 다리 옆·나루터·잔교 끝에서 물에 빠지지 않는다) + 기둥
    for (const r of deckRails(dk)) {
      px(ctx, r.x - area.x, r.y - area.y, C.plankDark, r.w, r.h);
      const along = r.h >= r.w;
      for (let k = 0; k < (along ? r.h : r.w); k += 10) px(ctx, r.x - area.x + (along ? -1 : k), r.y - area.y + (along ? k : -1), C.plankLine, along ? 4 : 3, along ? 3 : 4);
    }
    // 물에 비친 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    if (vertical) ctx.fillRect(x + dk.w, y + 2, 2, dk.h - 2);
    else ctx.fillRect(x + 2, y + dk.h, dk.w - 2, 2);
    // 서리
    for (let k = 0; k < Math.max(dk.w, dk.h); k += 5) if (hash2(dk.x + k, dk.y, 53) < 0.4) px(ctx, x + (vertical ? 3 + (k % (dk.w - 6)) : k), y + (vertical ? k : 2), C.snowShade, 2, 1);
  }
}
