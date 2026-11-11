import { HILL, HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS, LAKE, MAP_HEIGHT, MAP_WIDTH, RIVER_HALF_W, STEP_STONE_R, STEP_STONES, TILE } from "@tomb/protocol";
import { BRIDGE_DECKS, DECKS, GRAVEYARD_RECT, groundKind, PLAZA_RECT, PLAZA_TREES, PLAZA_WELL, riverDist, type GroundKind, type Rect } from "../world/layout";
import { css, darken, hash2, lighten, makeCanvas, rng, type Color } from "./pixel";

// 바닥 타일을 캔버스에 미리 구워 둔다. 맵이 가로·세로로 넓어서 CHUNK × CHUNK 정사각 덩어리로 나눠 굽고,
// 화면 근처 덩어리만 만든다 (WorldMap). 가을~초겨울 기준의 차분한 색으로 그리고(마른 풀·낙엽·언덕의 눈), 밤 톤은 월드 틴트가 입힌다.
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
  // 언덕: 서리 내린 잿빛 풀 + 눈
  hill: 0x5f6458,
  hillDark: 0x52574c,
  hillLight: 0x6e7366,
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
  // 묘역: 이끼 낀 짙은 땅
  grave: 0x46493a,
  graveDark: 0x3c3f32,
  graveLight: 0x525642,
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
  px(ctx, 0, 0, C.snow, TILE, 2);
  px(ctx, 0, 2, C.snowShade, TILE, 1);
  for (let x = 0; x < TILE; x += 3) if (r() < 0.6) px(ctx, x, 3, C.snowShade, 2, 1);
  px(ctx, 0, TILE - 2, darken(C.cliff, 0.35), TILE, 2);
  return canvas;
}

function stairsTile(seed: number): TileCanvas {
  const { canvas, ctx } = makeCanvas(TILE, TILE);
  const r = rng(seed);
  px(ctx, 0, 0, C.cliffDark, TILE, TILE);
  for (let y = 0; y < TILE; y += 4) {
    px(ctx, 1, y, C.stoneAlt, TILE - 2, 3);
    px(ctx, 1, y, lighten(C.stoneAlt, 0.15), TILE - 2, 1);
    if (r() < 0.5) px(ctx, 2 + Math.floor(r() * 10), y + 1, C.snow, 3, 1);
  }
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
  m.set("hill", v((s) => speckled(s, C.hill, C.hillDark, C.hillLight, C.snowShade, 24), 10));
  m.set("cliff", v(cliffTile, 11));
  m.set("stairs", v(stairsTile, 12));
  return m;
}

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
      const list = tiles.get(k)!;
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
        if ((isWall(up) && ty - 1 <= 1) || up === "cliff") {
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.fillRect(x0, y0, TILE, 3);
          ctx.fillStyle = "rgba(0,0,0,0.14)";
          ctx.fillRect(x0, y0 + 3, TILE, 2);
        }
        if (groundKind(tx - 1, ty) === "wallSide" || groundKind(tx - 1, ty) === "cliff") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(x0, y0, 3, TILE);
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
  drawGraveyardBorder(ctx, area);
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
 *  - 언덕: 노이즈가 높은 곳에 눈이 쌓인다 (가장자리는 그늘진 눈), 언덕 위쪽일수록 많이
 */
function shadeSoftGround(ctx: CanvasRenderingContext2D, area: Rect, tx0: number, ty0: number): void {
  const img = ctx.getImageData(0, 0, area.w, area.h);
  const d = img.data;
  const n = CHUNK / TILE;
  const kinds: GroundKind[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) kinds.push(groundKind(tx0 + i, ty0 + j));
  const snow = [(C.snow >> 16) & 255, (C.snow >> 8) & 255, C.snow & 255];
  const shade = [(C.snowShade >> 16) & 255, (C.snowShade >> 8) & 255, C.snowShade & 255];
  for (let by = 0; by < area.h; by += 4)
    for (let bx = 0; bx < area.w; bx += 4) {
      const k = kinds[Math.floor(by / TILE) * n + Math.floor(bx / TILE)];
      if (k !== "grass" && k !== "grave" && k !== "hill") continue;
      const wx = area.x + bx;
      const wy = area.y + by;
      if (k === "hill") {
        const t = 1 - (wy - HILL.y) / HILL.h; // 위쪽일수록 1
        const v = vnoise(wx, wy, 36, 61) * 0.7 + vnoise(wx, wy, 11, 67) * 0.3 + 0.1 * t - 0.04;
        for (let yy = 0; yy < 4; yy++)
          for (let xx = 0; xx < 4; xx++) {
            const e = v + (hash2(wx + xx, wy + yy, 71) - 0.5) * 0.06;
            if (e < 0.6) continue;
            const c = e < 0.64 ? shade : snow;
            const i = ((by + yy) * area.w + bx + xx) * 4;
            d[i] = c[0];
            d[i + 1] = c[1];
            d[i + 2] = c[2];
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
  // 우물 둘레 둥근 무늬 (밝은 원판 + 두 겹 고리 + 방사형 줄눈)
  const cx = PLAZA_WELL.x;
  const cy = PLAZA_WELL.y - 4;
  const R = 64;
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
      else if (r < 30 && r > 27) c = 0x6e6a5e;
      else if (r < 27) c = hash2(wx, wy, 81) < 0.5 ? 0x8f8b7e : 0x868276;
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

/** 묘역 둘레 낮은 돌 테두리 (북문·동문은 비운다) */
function drawGraveyardBorder(ctx: CanvasRenderingContext2D, area: Rect): void {
  const g = GRAVEYARD_RECT;
  if (!overlaps({ x: g.x - 4, y: g.y - 4, w: g.w + 8, h: g.h + 8 }, area)) return;
  const kerb = (x: number, y: number, w: number, h: number) => {
    px(ctx, x - area.x, y - area.y, 0x7d7a70, w, h);
    px(ctx, x - area.x, y - area.y, 0x9a978c, w, 1);
    px(ctx, x - area.x, y + h - area.y, 0x3a3934, w, 1);
  };
  const gapN = [g.x + 186, g.x + 230];
  const gapE = [g.y + 116, g.y + 152];
  kerb(g.x, g.y, gapN[0] - g.x, 3);
  kerb(gapN[1], g.y, g.x + g.w - gapN[1], 3);
  kerb(g.x, g.y + g.h - 3, g.w, 3);
  for (let y = g.y; y < g.y + g.h; y += 1) {
    px(ctx, g.x - area.x, y - area.y, 0x7d7a70, 3, 1);
    if (y < gapE[0] || y > gapE[1]) px(ctx, g.x + g.w - 3 - area.x, y - area.y, 0x7d7a70, 3, 1);
  }
}

/** 물(강·호수) 픽셀. 이미지 데이터로 한 번에 쓴다 */
function drawWater(ctx: CanvasRenderingContext2D, area: Rect): void {
  const y0 = Math.max(area.y, 820);
  const y1 = Math.min(area.y + area.h, LAKE.y + LAKE.ry + 6);
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
      const ldx = (wx - LAKE.x) / LAKE.rx;
      const ldy = (wy - LAKE.y) / LAKE.ry;
      const ld = ldx * ldx + ldy * ldy;
      const i = (y * w + x) * 4;
      if (rd <= RIVER_HALF_W || ld <= 1) {
        let c: Color;
        if (ld <= 1) {
          // 가장자리 얕은 물 → 가운데 깊은 물, 경계는 디더링으로 부드럽게
          const j = (hash2(Math.floor(wx), Math.floor(wy), 49) - 0.5) * 0.18;
          c = ldy < -0.7 && ld > 0.55 ? C.waterLight : ld + j < 0.35 ? C.waterDark : ld + j > 0.86 ? lighten(C.water, 0.06) : C.water;
        }
        else {
          const t = rd / RIVER_HALF_W;
          c = t > 0.82 ? C.waterLight : t < 0.38 ? C.waterDark : C.water;
          // 물살 무늬 (짧은 가로 줄)
          if (hash2(Math.floor(wx / 6), Math.floor(wy), 47) < 0.05) c = lighten(C.water, 0.18);
        }
        if (hash2(Math.floor(wx), Math.floor(wy), 41) < 0.025) c = C.waterLight;
        put(i, c);
      } else if (rd <= RIVER_HALF_W + 2.5 || (ld <= 1.06 && ld > 1)) {
        // 둑 테두리 (젖은 돌·모래)
        put(i, hash2(Math.floor(wx), Math.floor(wy), 43) < 0.5 ? C.rim : C.rimDark);
      }
    }
  }
  ctx.putImageData(img, 0, y0 - area.y);
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
      // 난간 (다리만)
      if (BRIDGE_DECKS.includes(dk)) {
        px(ctx, x, y, C.plankDark, 2, dk.h);
        px(ctx, x + dk.w - 2, y, C.plankDark, 2, dk.h);
        for (let yy = 2; yy < dk.h; yy += 12) {
          px(ctx, x - 1, y + yy, C.plankLine, 3, 3);
          px(ctx, x + dk.w - 2, y + yy, C.plankLine, 3, 3);
        }
      }
    } else {
      for (let xx = 0; xx < dk.w; xx += 4) {
        px(ctx, x + xx, y, C.plankLine, 1, dk.h);
        px(ctx, x + xx + 1, y, lighten(C.plank, 0.1), 1, dk.h);
      }
    }
    // 물에 비친 그림자
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    if (vertical) ctx.fillRect(x + dk.w, y + 2, 2, dk.h - 2);
    else ctx.fillRect(x + 2, y + dk.h, dk.w - 2, 2);
    // 서리
    for (let k = 0; k < Math.max(dk.w, dk.h); k += 5) if (hash2(dk.x + k, dk.y, 53) < 0.4) px(ctx, x + (vertical ? 3 + (k % (dk.w - 6)) : k), y + (vertical ? k : 2), C.snowShade, 2, 1);
  }
}
