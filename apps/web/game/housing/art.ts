import { DEFAULT_FLOOR, DEFAULT_WALL, defaultExterior, furnitureById, type HouseExteriorMap } from "@/lib/housing/catalog";
import { footprint, SPIN_R0, spinDir } from "@/lib/housing/layout";
import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { facadeGrid } from "./exterior";

// 하우징 물건·바닥·담장 픽셀아트 (캔버스만 쓴다: 게임 텍스처와 UI 아이콘이 같은 그림).
//  - 물건 그림 크기 = (w×16) × (h×16 + up). 아래쪽 h×16이 차지 칸이고, up만큼 위로 솟는다(책장·나무 등).
//  - 돌리면 가로·세로가 바뀌는 물건(turn)은 위에서 내려다본 그림이라 up=0이다 (90° 돌려 그려도 어색하지 않게).

const OUT = 0x1a1612;
const WOOD = 0x7a5236;
const WOOD_D = 0x553722;
const WOOD_L = 0x9c6d45;
const STONE = 0x8c8a82;
const STONE_D = 0x5f5d57;
const LEAF = 0x4f7a4a;
const LEAF_D = 0x34563a;
const LEAF_L = 0x76a466;

/** 솟는 높이 (px) */
const UP: Record<string, number> = {
  bed: 8,
  piano: 14,
  radio: 4,
  fireplace: 18,
  floor_lamp: 18,
  fridge: 16,
  bathtub: 4,
  cat_cushion: 2,
  grand_clock: 20,
  chair: 6,
  bookshelf: 14,
  table: 2,
  monitor_desk: 8,
  server_rack: 16,
  whiteboard: 12,
  postit_wall: 12,
  duck_shelf: 12,
  coffee_machine: 6,
  frame_404: 8,
  pot: 4,
  tree: 18,
  bush: 2,
  stone_lantern: 12,
  candles: 6,
  firefly_jar: 4,
  wind_chime: 14,
  memorial: 6,
  ghost_cat: 2,
};

export const artUp = (id: string) => UP[id] ?? 0;

/** v = 그림 변형 ("on" 불 켜짐·"on2" 불꽃 두 번째 장·"open" 문 열림·"s0"~"s3" 화분 자람). 상점 아이콘은 "" */
type Draw = (g: Grid, W: number, H: number, v: string) => void;

/** 칠한 상자 + 아랫변 그림자 */
const box = (g: Grid, x: number, y: number, w: number, h: number, c: Color, edge = darken(c, 0.35)) => {
  g.rect(x, y, w, h, c);
  g.hline(x, x + w - 1, y + h - 1, edge);
};

// ── 연못 (3×2) ──
// 마을 호수와 같은 청록 물빛(game/sprites/ground.ts)을 조금 맑게: 가장자리 얕은 물 → 가운데 깊은 물,
// 둥근 물가 돌, 연잎·연꽃, 물풀, 잉어 한 마리, 잔물결·반짝임. 밤 그림(n)에는 달이 비친다.
// 변형 이름은 "-"로 잇는다: v = 세로로 돌린 모습(그림을 돌리지 않고 다시 그려 빛이 늘 왼쪽 위에서 온다),
// n = 밤, f1~f3 = 잔물결 장면 (f0은 생략: 상점 아이콘·동작 줄이기와 같은 그림).

/** 연못 잔물결 장면 수 */
export const POND_FRAMES = 4;

const POND_STONES = [0x8f8a7e, 0x7d796f, 0x9b958a, 0x868b7b] as const;
const POND_RIM = 0x4a463d;
const POND_MOSS = 0x5f8048;
/** 얕은 물(모래 비침)·그늘진 가장자리·중간·깊은 물·가장 깊은 물 */
const POND_WATER = {
  day: [0x7aa898, 0x557f80, 0x47727a, 0x355a66, 0x284856],
  night: [0x45667a, 0x2f4a62, 0x2b465e, 0x203650, 0x182a42],
} as const;
const PAD = 0x4f8a48;
const PAD_L = 0x78b464;
const PAD_D = 0x34663a;
const LOTUS = 0xf0a6c2;
const LOTUS_L = 0xffe2ec;
const LOTUS_C = 0xf2d060;

function pondArt(g: Grid, W: number, H: number, v: string): void {
  const tok = v.split("-");
  const night = tok.includes("n");
  const f = Number(tok.find((t) => /^f\d$/.test(t))?.slice(1) ?? 0) % POND_FRAMES;
  const vert = H > W;
  const water = night ? POND_WATER.night : POND_WATER.day;
  const cx = W / 2;
  const cy = H / 2;
  const rx = W / 2 - 1.8;
  const ry = H / 2 - 1.8;
  // 긴 축 좌표(a)·짧은 축 좌표(b) (-1..1) → 픽셀. 세로 그림은 두 축을 맞바꿔 같은 짜임으로 그린다
  const at = (a: number, b: number) => (vert ? { x: Math.round(cx + b * rx - 0.5), y: Math.round(cy + a * ry - 0.5) } : { x: Math.round(cx + a * rx - 0.5), y: Math.round(cy + b * ry - 0.5) });
  // 긴 축 방향 한 칸 (잉어 몸 방향)
  const step = (da: number, db: number) => (vert ? { x: db, y: da } : { x: da, y: db });
  // 물가 굴곡: 타원 반지름을 각도마다 조금씩 줄인다 (긴 축 기준 각도라 세로 그림도 같은 모양)
  const wob = (t: number) => 1 - 0.045 * (1 + Math.sin(3 * t + 0.6)) - 0.03 * (1 + Math.sin(5 * t + 2.2));
  const shape = (x: number, y: number) => {
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    const t = vert ? Math.atan2(nx, ny) : Math.atan2(ny, nx);
    const d = Math.hypot(nx, ny) / wob(t);
    // 물가까지 남은 픽셀 거리 (중심에서 이 점을 지나 물가까지)
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    return { d, e: d > 0 ? dist * (1 / d - 1) : 99, nx, ny };
  };
  // 픽셀 종류: 0 빈칸, 1 물가 흙, 2 물, 3 물 위 물건(연잎·꽃)
  const kind = new Uint8Array(W * H);
  const RIM = 2.4;

  // 1) 물: 깊이에 따라 색을 나누고 경계는 살짝 흩뿌려 부드럽게
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const { d, e, nx, ny } = shape(x, y);
      if (d > 1) continue;
      if (e < RIM) {
        g.set(x, y, POND_RIM);
        kind[y * W + x] = 1;
        continue;
      }
      const j = (hash2(x, y, 61) - 0.5) * 0.1;
      const dd = d + j;
      let c: Color;
      if (e < RIM + 1.6) c = ny < -0.15 || nx < -0.75 ? water[1] : water[0]; // 위쪽은 돌 그늘, 아래쪽은 모래가 비친다
      else if (dd > 0.66) c = water[2];
      else if (dd > 0.4) c = water[3];
      else c = water[4];
      // 하늘이 비친 결 (왼쪽 위에서 오른쪽 아래로 비스듬히)
      const band = nx * 0.45 + ny;
      if (!night && band > -0.62 && band < -0.42 && e >= RIM + 1.6) c = lighten(c, 0.1);
      g.set(x, y, c);
      kind[y * W + x] = 2;
    }
  const isWater = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && kind[y * W + x] === 2;
  const waterAt = (x: number, y: number) => ((g.get(x, y) >>> 8) & 0xffffff) as Color;
  const tint = (x: number, y: number, c: Color, t: number) => {
    if (isWater(x, y)) g.set(x, y, mixColor(waterAt(x, y), c, t));
  };

  // 2) 물속: 물풀 몇 가닥 + 잉어 한 마리 (물빛에 묻혀 흐릿하게)
  const weed = night ? 0x2c5040 : 0x3d6e48;
  for (const [a, b, n] of [[-0.62, -0.22, 4], [0.66, 0.3, 3], [0.1, 0.62, 3]] as const) {
    const o = at(a, b);
    for (let i = 0; i < n; i++) tint(o.x + (i % 2), o.y - i, weed, 0.6);
    tint(o.x + 2, o.y - 1, weed, 0.45);
  }
  {
    // 잉어: 긴 축으로 헤엄치는 주황 몸 + 흰 무늬, 꼬리는 장면마다 살랑
    const o = at(0.0, -0.1);
    const koi = night ? 0xb06a4a : 0xf08a3c;
    const white = night ? 0xc0bab0 : 0xf8f2e6;
    const body: [number, number, Color][] = [
      [2, 0, koi],
      [1, 0, white],
      [1, 1, koi],
      [0, 0, koi],
      [0, 1, white],
      [-1, 0, koi],
      [-1, 1, koi],
      [-2, 0, koi],
    ];
    for (const [da, db, c] of body) {
      const p = step(da, db);
      tint(o.x + p.x, o.y + p.y, c, 0.8);
    }
    const wag = [0, 1, 0, -1][f];
    const t1 = step(-3, wag);
    const t2 = step(-3, wag + 1);
    tint(o.x + t1.x, o.y + t1.y, koi, 0.6);
    tint(o.x + t2.x, o.y + t2.y, koi, 0.6);
  }

  // 3) 밤: 물에 비친 달 + 물결에 부서지는 달빛
  if (night) {
    const m = at(0.22, -0.4);
    for (let y = m.y - 3; y <= m.y + 3; y++)
      for (let x = m.x - 4; x <= m.x + 4; x++) {
        const q = ((x - m.x) / 3.1) ** 2 + ((y - m.y) / 2.3) ** 2;
        if (q <= 1) g.set(x, y, q < 0.3 && x <= m.x && y <= m.y ? 0xfffbe6 : 0xece6c4);
        else if (q <= 1.9) tint(x, y, 0x9eb2c8, 0.45);
      }
    for (let k = 0; k < 2; k++) {
      const y = m.y + 4 + k;
      for (let x = m.x - 3 + ((f + k) % 2); x <= m.x + 3; x += 3) {
        tint(x, y, 0xe8e2c0, 0.6 - k * 0.2);
        tint(x + 1, y, 0xe8e2c0, 0.4 - k * 0.15);
      }
    }
  }

  // 4) 잔물결: 물방울이 떨어진 자리에서 둥글게 번진다 (장면마다 한 칸씩)
  const ripple = (a: number, b: number, phase: number) => {
    const o = at(a, b);
    const ph = (f + phase) % POND_FRAMES;
    const r = [0, 1.4, 2.3, 3.1][ph];
    const k = [0.6, 0.5, 0.36, 0.22][ph];
    const light = night ? 0xa8b8d0 : 0xd6eeea;
    for (let y = o.y - r - 1; y <= o.y + r + 1; y++)
      for (let x = o.x - 2 * r - 1; x <= o.x + 2 * r + 1; x++) {
        // 납작한 고리 (위쪽 호는 밝게, 아래쪽 호는 옅게)
        const q = Math.hypot((x - o.x) / 1.8, y - o.y);
        if (r > 0 && Math.abs(q - r) < 0.5) tint(x, y, light, y > o.y ? k * 0.55 : k);
      }
    if (ph === 0) tint(o.x, o.y, light, 0.75); // 막 떨어진 물방울

  };
  ripple(0.3, 0.36, 0);
  ripple(-0.2, -0.34, 2);

  // 5) 연잎 (물에 그림자를 드리운다) + 연꽃·봉오리
  const pad = (a: number, b: number, r: number, notch: number) => {
    const o = at(a, b);
    const ry2 = r * 0.8;
    const cells: [number, number, Color][] = [];
    for (let y = Math.floor(o.y - ry2 - 1); y <= o.y + ry2 + 1; y++)
      for (let x = Math.floor(o.x - r - 1); x <= o.x + r + 1; x++) {
        const dx = (x + 0.5 - (o.x + 0.5)) / r;
        const dy = (y + 0.5 - (o.y + 0.5)) / ry2;
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        let da = Math.atan2(dy, dx) - notch;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.42 && q > 0.06) continue; // 갈라진 틈
        const lit = dx + dy;
        cells.push([x, y, q > 0.55 && lit < -0.35 ? PAD_L : q > 0.5 && lit > 0.55 ? PAD_D : PAD]);
      }
    for (const [x, y] of cells) tint(x + 1, y + 1, 0x10202a, 0.35);
    for (const [x, y, c] of cells) {
      if (kind[y * W + x] === 0 || kind[y * W + x] === 1) continue;
      g.set(x, y, c);
      kind[y * W + x] = 3;
    }
    // 잎맥 한 줄
    g.set(Math.round(o.x - Math.cos(notch) * r * 0.45), Math.round(o.y - Math.sin(notch) * ry2 * 0.45), PAD_D);
    return o;
  };
  const big = pad(-0.44, 0.22, 4.6, vert ? -0.6 : 0.5);
  pad(-0.1, 0.56, 2.7, vert ? 2.4 : 3.6);
  const third = pad(0.56, -0.18, 3.4, vert ? 1.9 : 2.6);
  // 활짝 핀 연꽃
  {
    const x = big.x - 1;
    const y = big.y - 1;
    const px: [number, number, Color][] = [
      [0, -2, LOTUS_L],
      [-1, -1, LOTUS_L],
      [0, -1, LOTUS],
      [1, -1, LOTUS_L],
      [-2, 0, LOTUS],
      [-1, 0, LOTUS],
      [0, 0, LOTUS_C],
      [1, 0, LOTUS],
      [2, 0, LOTUS],
      [-1, 1, darken(LOTUS, 0.15)],
      [0, 1, LOTUS],
      [1, 1, darken(LOTUS, 0.15)],
    ];
    for (const [dx, dy, c] of px) g.set(x + dx, y + dy, c);
  }
  // 봉오리
  g.set(third.x, third.y - 1, LOTUS);
  g.set(third.x, third.y - 2, LOTUS_L);
  g.set(third.x + 1, third.y - 1, darken(LOTUS, 0.15));

  // 6) 반짝임: 장면마다 다른 자리가 반짝 (낮은 하얗게, 밤은 푸르게)
  const spark = night ? 0xc8d6f0 : 0xf2fbf8;
  const spots: [number, number][] = [[-0.2, -0.38], [0.15, 0.1], [0.62, 0.22], [-0.55, -0.05], [0.4, -0.55], [-0.3, 0.5]];
  spots.forEach(([a, b], i) => {
    if ((i + f) % 3 !== 0) return;
    const o = at(a, b);
    if (!isWater(o.x, o.y)) return;
    g.set(o.x, o.y, spark);
    tint(o.x + 1, o.y, spark, 0.45);
  });

  // 7) 물가 돌: 둥근 돌을 둘레에 둘러 쌓는다 (위쪽 돌부터 그려 아래 돌이 앞에 오게)
  const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.round(perim / 5.2);
  const stones: { x: number; y: number; sx: number; sy: number; c: Color; moss: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const t = ((k + (hash2(k, 7, 71) - 0.5) * 0.3) / n) * Math.PI * 2;
    const w = wob(t);
    const la = Math.cos(t) * w;
    const sb = Math.sin(t) * w;
    const ex = cx + (vert ? sb : la) * rx;
    const ey = cy + (vert ? la : sb) * ry;
    const len = Math.hypot(cx - ex, cy - ey) || 1;
    const size = 2.1 + hash2(k, 3, 73) * 0.9;
    stones.push({
      x: ex + ((cx - ex) / len) * 1.1,
      y: ey + ((cy - ey) / len) * 1.1,
      sx: size,
      sy: size * 0.78,
      c: POND_STONES[Math.floor(hash2(k, 5, 75) * POND_STONES.length)],
      moss: hash2(k, 9, 77) < 0.3,
    });
  }
  stones.sort((a, b) => a.y - b.y);
  for (const s of stones)
    for (let y = Math.floor(s.y - s.sy - 1); y <= Math.ceil(s.y + s.sy + 1); y++)
      for (let x = Math.floor(s.x - s.sx - 1); x <= Math.ceil(s.x + s.sx + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - s.x) / s.sx;
        const dy = (y + 0.5 - s.y) / s.sy;
        const q = dx * dx + dy * dy;
        if (q > 1) continue;
        const lit = -(dx * 0.6 + dy * 0.8);
        let c = lit > 0.5 ? lighten(s.c, 0.2) : lit < -0.4 ? darken(s.c, 0.28) : s.c;
        if (q > 0.72 && lit < -0.1) c = darken(s.c, 0.4); // 돌 사이 틈
        if (s.moss && dy < -0.2 && hash2(x, y, 79) < 0.55) c = POND_MOSS;
        if (lit > 0.75 && q < 0.4) c = lighten(s.c, 0.38);
        g.set(x, y, c);
        kind[y * W + x] = 1;
      }

  // 8) 물가 풀: 한쪽 끝에 부들 몇 줄기, 반대쪽 돌 틈에 풀 한 포기
  {
    const o = at(0.78, -0.48);
    const blades: [number, number, Color, boolean][] = [
      [-2, 5, 0x6f8c46, false],
      [0, 6, 0x5a7a3c, true],
      [1, 5, 0x7c9a4e, false],
      [3, 6, 0x5a7a3c, true],
    ];
    for (const [dx, h, c, tail] of blades) {
      const x = o.x + dx;
      const base = o.y + 1;
      for (let i = 0; i < h; i++) g.set(x + (i > h - 3 && dx < 0 ? -1 : 0), Math.max(0, base - i), c);
      if (tail) {
        g.set(x, Math.max(0, base - h), 0x7a5232);
        g.set(x, Math.max(0, base - h + 1), 0x6a4428);
      }
    }
    const t = at(-0.74, 0.62);
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [0, -2], [2, -2]] as const) g.set(t.x + dx, t.y + dy, dy === -2 ? LEAF_L : LEAF);
  }
}

const DRAW: Record<string, Draw> = {
  desk: (g, W) => {
    box(g, 1, 2, W - 2, 12, WOOD);
    g.rect(1, 2, W - 2, 2, WOOD_L);
    g.rect(5, 5, 8, 6, 0xe8e0c8); // 기획서
    g.hline(6, 11, 7, 0x9a9488);
    g.hline(6, 10, 9, 0x9a9488);
    g.rect(20, 5, 3, 4, 0xc05a4a); // 머그
  },
  chair: (g, _W, H) => {
    g.rect(3, 0, 10, 8, WOOD); // 등받이
    g.rect(4, 1, 8, 2, WOOD_L);
    box(g, 2, 8, 12, 6, WOOD_L);
    g.vline(3, 14, H - 1, WOOD_D);
    g.vline(12, 14, H - 1, WOOD_D);
  },
  sofa: (g, W) => {
    box(g, 1, 1, W - 2, 14, 0x4e5f84);
    g.rect(1, 1, W - 2, 4, 0x3e4d6c); // 등받이
    g.rect(1, 1, 3, 14, 0x3e4d6c);
    g.rect(W - 4, 1, 3, 14, 0x3e4d6c);
    g.vline(W / 2, 5, 13, 0x3a4866);
    g.rect(6, 6, 6, 4, 0xc8a050); // 쿠션
  },
  bed: (g, W, H) => {
    // 머리판 (위로 8px 솟음)
    box(g, 0, 0, W, 12, WOOD_D);
    g.rect(2, 2, W - 4, 7, WOOD);
    g.hline(2, W - 3, 2, WOOD_L);
    g.rect(0, 0, 3, 14, WOOD_D);
    g.rect(W - 3, 0, 3, 14, WOOD_D);
    // 매트리스 + 흰 시트
    g.rect(1, 10, W - 2, H - 12, 0xe8e2d4);
    g.vline(1, 10, H - 3, 0xc8c0b0);
    g.vline(W - 2, 10, H - 3, 0xc8c0b0);
    // 베개 둘
    g.rect(4, 11, 11, 6, 0xf8f4ea);
    g.rect(W - 15, 11, 11, 6, 0xf8f4ea);
    g.hline(4, 14, 16, 0xd8d0c0);
    g.hline(W - 15, W - 5, 16, 0xd8d0c0);
    // 누빈 이불 (보라) + 접힌 깃
    g.rect(1, 20, W - 2, H - 22, 0x6a4a7a);
    g.hline(1, W - 2, 20, 0x8a6a9a);
    g.hline(1, W - 2, 21, 0xf0ead8);
    for (let y = 24; y < H - 3; y += 5) for (let x = 3; x < W - 2; x += 6) g.set(x + ((y / 5) % 2) * 3, y, 0x553a63);
    // 발판
    box(g, 0, H - 3, W, 3, WOOD_D);
  },
  bookshelf: (g, W, H) => {
    box(g, 1, 0, W - 2, H, WOOD_D);
    const colors = [0xa04a3a, 0x3a6a8a, 0xc8a050, 0x4f7a4a, 0x7a4a8a, 0xd8d0c0];
    for (let row = 0; row < 3; row++) {
      const y = 2 + row * 9;
      g.rect(3, y, W - 6, 7, 0x2a1c14);
      for (let x = 3, i = row; x < W - 4; x += 3, i++) g.rect(x, y + (i % 3 === 0 ? 2 : 1), 2, 6 - (i % 3 === 0 ? 1 : 0), colors[i % colors.length]);
    }
  },
  table: (g, W, H) => {
    g.ellipse(W / 2, 7, 7, 5, WOOD_L);
    g.hline(3, 12, 10, WOOD);
    g.rect(7, 11, 2, H - 12, WOOD_D);
    g.rect(6, 4, 4, 3, 0xe8e0c8); // 찻잔
  },
  rug: (g, W, H) => {
    g.rect(1, 1, W - 2, H - 2, 0x6a2e3a);
    g.rect(3, 3, W - 6, H - 6, 0x8a3e4a);
    g.rect(6, 6, W - 12, H - 12, 0xc8a050);
    g.rect(8, 8, W - 16, H - 16, 0x8a3e4a);
    for (let x = 2; x < W - 2; x += 3) {
      g.set(x, 0, 0xd8c890);
      g.set(x, H - 1, 0xd8c890);
    }
  },
  monitor_desk: (g, W, H) => {
    box(g, 1, H - 12, W - 2, 10, WOOD_D);
    for (const x of [4, 17]) {
      g.rect(x, 1, 11, 9, 0x22262e);
      g.rect(x + 1, 2, 9, 6, x === 4 ? 0x3a6ab0 : 0x2a8a5a);
      g.hline(x + 2, x + 6, 4, 0xbfe0ff);
      g.hline(x + 2, x + 8, 6, 0x9fd0b0);
      g.rect(x + 4, 10, 3, 2, 0x22262e);
    }
    g.rect(10, H - 9, 12, 3, 0x30343c); // 키보드
  },
  server_rack: (g, W, H) => {
    box(g, 2, 0, W - 4, H, 0x2a2e36);
    for (let y = 2; y < H - 3; y += 4) {
      g.rect(4, y, W - 8, 3, 0x3c424c);
      g.set(5, y + 1, (y / 4) % 2 ? 0x7fe0a0 : 0xe0c050);
      g.set(7, y + 1, 0x7fe0a0);
    }
  },
  whiteboard: (g, W, H) => {
    g.vline(3, 10, H - 1, STONE_D);
    g.vline(W - 4, 10, H - 1, STONE_D);
    g.rect(1, 1, W - 2, 16, 0xb0b4b8);
    g.rect(2, 2, W - 4, 14, 0xf0f2f0);
    g.hline(5, 10, 5, 0x3a6ab0);
    g.hline(5, 10, 8, 0x3a6ab0);
    g.hline(11, 18, 7, 0xc04a3a);
    g.hline(19, 25, 5, 0x3a6ab0);
    g.hline(19, 25, 9, 0x3a6ab0);
    g.hline(6, 22, 12, 0x404040);
  },
  postit_wall: (g, W, H) => {
    box(g, 1, 1, W - 2, H - 4, 0x6a5440);
    const c = [0xf0e070, 0xf0a0b0, 0x90d0f0, 0xa0e090];
    for (let i = 0; i < 12; i++) {
      const x = 3 + (i % 6) * 5;
      const y = 3 + Math.floor(i / 6) * 7 + (i % 2);
      g.rect(x, y, 4, 4, c[i % 4]);
      g.set(x + 1, y + 1, darken(c[i % 4], 0.4));
    }
  },
  duck_shelf: (g, W, H) => {
    box(g, 1, 0, W - 2, H, WOOD);
    for (const y of [9, 18]) {
      g.hline(1, W - 2, y, WOOD_D);
      for (const x of [3, 9]) {
        g.rect(x, y - 4, 4, 3, 0xf0d040);
        g.set(x + 3, y - 5, 0xf0d040);
        g.set(x + 4, y - 4, 0xe08030);
        g.set(x + 3, y - 4, 0x202020);
      }
    }
  },
  coffee_machine: (g, W, H) => {
    box(g, 3, 1, W - 6, H - 2, 0x30343a);
    g.rect(5, 3, W - 10, 4, 0x50565e);
    g.set(6, 4, 0xe05040);
    g.rect(6, H - 9, 4, 4, 0xe8e0c8);
    g.rect(6, H - 8, 4, 1, 0x5a3a26);
  },
  frame_404: (g, W, H) => {
    g.vline(4, 12, H - 1, WOOD_D);
    g.vline(11, 12, H - 1, WOOD_D);
    g.rect(1, 1, W - 2, 14, WOOD_L);
    g.rect(2, 2, W - 4, 12, 0x1e2230);
    // 4 0 4
    const t = (x: number) => {
      g.vline(x, 5, 7, 0xe0c060);
      g.hline(x, x + 2, 8, 0xe0c060);
      g.vline(x + 2, 5, 10, 0xe0c060);
    };
    t(3);
    g.rect(7, 5, 2, 6, 0xe0c060, 255);
    g.set(7, 6, 0x1e2230);
    g.set(7, 9, 0x1e2230);
    t(10);
  },
  pot: (g, W, H, v) => {
    g.rect(4, H - 8, 8, 7, 0xa85a3a);
    g.hline(3, 12, H - 8, 0xc8704a);
    g.hline(5, 10, H - 7, 0x3a2a1e); // 흙
    const stage = v.startsWith("s") ? Number(v.slice(1)) : 1;
    if (stage <= 0) {
      // 새싹 두 잎
      g.vline(8, H - 11, H - 8, LEAF);
      g.set(7, H - 12, LEAF_L);
      g.set(9, H - 12, LEAF_L);
      g.set(6, H - 12, LEAF);
      g.set(10, H - 12, LEAF);
      return;
    }
    if (stage === 1) {
      g.ellipse(W / 2, 6, 5, 5, LEAF);
      g.set(6, 4, LEAF_L);
      g.set(9, 6, LEAF_L);
      return;
    }
    g.ellipse(W / 2, 6, 6, 5.5, LEAF_D);
    g.ellipse(W / 2 - 1, 5, 4.5, 4, LEAF);
    g.set(5, 3, LEAF_L);
    g.set(10, 6, LEAF_L);
    if (stage === 2) {
      // 봉오리
      g.rect(7, 1, 2, 2, 0xd07090);
      g.set(11, 4, 0xd07090);
    } else {
      // 활짝 핀 꽃
      for (const [x, y, c] of [[5, 2, 0xf0a0c0], [10, 3, 0xf0e080], [7, 7, 0xf6f2e8], [11, 8, 0xf0a0c0]] as const) {
        g.set(x, y, c);
        g.set(x + 1, y, c);
        g.set(x, y + 1, c);
        g.set(x + 1, y + 1, lighten(c, 0.3));
      }
    }
  },
  tree: (g, W, H) => {
    g.ellipse(W / 2, H - 4, 10, 3, 0x000000, 70);
    g.rect(W / 2 - 3, H - 18, 6, 15, 0x5a3e2a);
    g.ellipse(W / 2, 16, 14, 14, LEAF_D);
    g.ellipse(W / 2 - 4, 12, 9, 8, LEAF);
    g.ellipse(W / 2 + 6, 18, 7, 6, LEAF);
    for (let i = 0; i < 14; i++) g.set(6 + ((i * 7) % 20), 6 + ((i * 5) % 20), LEAF_L);
  },
  pond: (g, W, H, v) => pondArt(g, W, H, v),
  flowerbed: (g, W, H) => {
    g.rect(1, 2, W - 2, H - 4, 0x3a2c22);
    const c = [0xf0a0c0, 0xf0e080, 0xb0a0f0, 0xf0f0f0];
    for (let i = 0; i < 18; i++) {
      const x = 2 + ((i * 7) % (W - 4));
      const y = 3 + ((i * 3) % (H - 7));
      g.set(x, y + 1, LEAF);
      g.set(x, y, c[i % 4]);
    }
  },
  stone_path: (g) => {
    g.ellipse(6, 6, 4.5, 3.5, STONE);
    g.ellipse(11, 11, 4, 3, STONE);
    g.set(5, 5, lighten(STONE, 0.3));
    g.set(10, 10, lighten(STONE, 0.3));
    g.outline(STONE_D, false, 200);
  },
  bush: (g, W, H) => {
    g.ellipse(W / 2, H - 7, 7, 6, LEAF_D);
    g.ellipse(W / 2 - 2, H - 9, 4, 3.5, LEAF);
    g.set(5, H - 10, LEAF_L);
    g.set(10, H - 8, LEAF_L);
  },
  mushrooms: (g) => {
    for (const [x, y, r] of [[5, 9, 3], [11, 7, 2.5], [9, 12, 2]] as const) {
      g.vline(x, y, y + 3, 0xe8e0c8);
      g.ellipse(x, y, r, r * 0.7, 0x5ac0a0);
      g.set(x - 1, y - 1, 0xc8fff0);
    }
  },
  stone_lantern: (g, _W, H) => {
    g.rect(4, H - 4, 8, 3, STONE_D);
    g.rect(6, H - 12, 4, 8, STONE);
    g.rect(3, H - 18, 10, 6, STONE);
    g.rect(5, H - 17, 6, 4, 0xffd080);
    g.rect(2, H - 21, 12, 3, STONE_D);
    g.rect(6, H - 24, 4, 3, STONE);
  },
  candles: (g, _W, H) => {
    g.rect(4, H - 3, 8, 2, 0x8a7040);
    g.vline(8, H - 9, H - 3, 0x8a7040);
    g.hline(4, 12, H - 9, 0x8a7040);
    for (const x of [4, 8, 12]) {
      g.rect(x - 1, H - 14, 2, 5, 0xf0e8d8);
      g.set(x, H - 16, 0xffd070);
      g.set(x, H - 15, 0xffa040);
    }
  },
  firefly_jar: (g, _W, H) => {
    g.rect(4, H - 13, 8, 11, 0x6a8a9a, 140);
    g.rect(5, H - 15, 6, 2, 0x8a6a40);
    g.hline(4, 11, H - 2, 0x4a6a7a);
    for (const [x, y] of [[6, 6], [9, 9], [7, 11]]) g.set(x, H - 16 + y, 0xe8ff9a);
  },
  wind_chime: (g, _W, H) => {
    g.vline(3, 0, H - 2, WOOD_D);
    g.hline(3, 11, 1, WOOD_D);
    g.vline(9, 2, 4, 0x909090);
    g.rect(7, 5, 5, 5, 0x6ab0a0);
    g.vline(9, 10, 13, 0xd0d0d0);
    g.rect(8, 14, 3, 4, 0xf0e8d0);
    g.rect(2, H - 2, 3, 2, STONE_D);
  },
  memorial: (g, _W, H) => {
    g.rect(2, H - 4, 12, 3, STONE_D);
    g.rect(4, H - 18, 8, 14, 0x9a988e);
    g.rect(5, H - 20, 6, 2, 0x9a988e);
    g.hline(6, 9, H - 14, 0x5a5850);
    g.hline(6, 9, H - 11, 0x5a5850);
    g.set(3, H - 5, 0xf0a0c0);
    g.set(12, H - 5, 0xf0e080);
  },
  // ── 3번 생활 가구 ──
  piano: (g, W, H) => {
    // 업라이트 피아노: 몸통·뚜껑·악보·건반·다리
    box(g, 1, 0, W - 2, H - 4, 0x2e2220);
    g.rect(2, 1, W - 4, 2, 0x4a3632); // 뚜껑 윤
    g.rect(3, 4, W - 6, 9, 0x3a2a26);
    g.rect(11, 5, 10, 7, 0xf2ead8); // 악보
    for (const y of [7, 9]) g.hline(12, 19, y, 0x9a9488);
    g.set(14, 8, 0x2a2420);
    g.set(17, 6, 0x2a2420);
    // 건반 (앞으로 튀어나온 판)
    g.rect(0, H - 13, W, 6, 0x4a3632);
    g.rect(1, H - 12, W - 2, 4, 0xf6f2e8);
    for (let x = 2; x < W - 2; x += 3) g.vline(x, H - 12, H - 9, 0xc8c0b0);
    for (const x of [3, 6, 12, 15, 18, 24, 27]) g.rect(x, H - 12, 2, 2, 0x1a1412);
    g.rect(2, H - 7, W - 4, 3, 0x2e2220);
    g.rect(3, H - 4, 2, 3, 0x1a1412);
    g.rect(W - 5, H - 4, 2, 3, 0x1a1412);
    g.rect(14, H - 4, 4, 2, 0xc8a050); // 페달
  },
  radio: (g, _W, H, v) => {
    const on = v === "on";
    g.vline(12, 0, 6, 0x9a9a9a); // 안테나
    g.set(12, 0, 0xd0d0d0);
    box(g, 2, 5, 12, H - 6, 0x8a5a36);
    g.rect(3, 6, 10, 1, 0xa87448);
    g.ellipse(6.5, H - 7, 3, 3, 0x3a2a1e); // 스피커
    for (const [x, y] of [[5, H - 8], [7, H - 7], [6, H - 6], [8, H - 8]]) g.set(x, y, 0x6a5040);
    g.rect(10, H - 10, 3, 5, on ? 0x9ff0a0 : 0x5a6a50); // 다이얼 창
    g.set(11, H - 8, on ? 0xffffff : 0x8a9a80);
    g.rect(10, H - 4, 3, 2, 0xc8a050);
  },
  fireplace: (g, W, H, v) => {
    // 돌 벽난로: 위 선반 + 벽돌 몸통 + 아궁이 (불: on/on2 두 장)
    box(g, 0, 0, W, 4, WOOD);
    g.hline(0, W - 1, 0, WOOD_L);
    box(g, 2, 4, W - 4, H - 5, 0x8a4a3a);
    for (let y = 5; y < H - 2; y += 3) for (let x = 2 + ((y / 3) % 2) * 3; x < W - 2; x += 6) g.hline(x, x + 4, y, 0x9c5a46);
    g.rect(1, H - 3, W - 2, 3, STONE_D);
    // 아궁이
    g.rect(8, 11, W - 16, H - 14, 0x1a1210);
    g.ellipse(W / 2, 11, (W - 16) / 2, 3, 0x1a1210);
    g.rect(10, H - 5, W - 20, 2, 0x4a3022); // 장작
    g.set(12, H - 6, 0x6a4430);
    g.set(W - 13, H - 6, 0x6a4430);
    if (v === "on" || v === "on2") {
      const b = v === "on2";
      g.ellipse(W / 2, H - 9, 6, 6, 0xd8501a);
      g.ellipse(W / 2 + (b ? 1 : -1), H - 10, 4, 5, 0xf08a2a);
      g.ellipse(W / 2 + (b ? -1 : 1), H - 9, 2.4, 3.4, 0xffd060);
      g.set(W / 2 + (b ? 3 : -3), H - 16, 0xf08a2a);
      g.set(W / 2 + (b ? -2 : 2), H - 17, 0xffd060);
      g.hline(10, W - 11, H - 5, 0xff7a30);
    }
    // 선반 위 소품 (촛대·액자)
    g.rect(4, 1, 2, 2, 0xf0e8d8);
    g.set(4, 0, 0xffd070);
    g.rect(W - 9, 0, 5, 3, 0xc8a050);
  },
  floor_lamp: (g, W, H, v) => {
    const on = v === "on";
    g.rect(4, H - 3, 8, 2, 0x3a3a40);
    g.vline(8, 10, H - 3, 0x5a5a62);
    // 갓 (사다리꼴)
    for (let y = 1; y <= 9; y++) g.hline(5 - Math.floor(y / 3), 10 + Math.floor(y / 3), y, on ? 0xfff0b0 : 0xe8dcc0);
    g.hline(3, 12, 9, on ? 0xffd870 : 0xc8b898);
    if (on) {
      g.hline(5, 10, 1, 0xffffff);
      g.rect(7, 10, 2, 1, 0xfff6d0);
    }
    void W;
  },
  fridge: (g, W, H, v) => {
    const body = 0xd8ece4;
    box(g, 1, 0, W - 2, H, body);
    g.vline(1, 0, H - 1, 0xb8ccc4);
    g.hline(2, W - 3, 11, 0x98aca4); // 위 문(냉동) 경계
    g.rect(2, H - 2, 2, 2, 0x5a5a5a);
    g.rect(W - 4, H - 2, 2, 2, 0x5a5a5a);
    if (v === "open") {
      // 아래 문이 열려 안이 보인다: 불빛·칸·음식
      g.rect(2, 12, W - 4, H - 14, 0xfff8e0);
      g.hline(2, W - 3, 19, 0xc8d8d0);
      g.hline(2, W - 3, 25, 0xc8d8d0);
      g.rect(4, 15, 3, 4, 0xf4f4f4);
      g.rect(4, 15, 3, 1, 0x6ab0e8);
      g.ellipse(10, 17.5, 2, 1.6, 0xe04848);
      g.rect(5, 21, 6, 3, 0xf8e0b0);
      g.rect(5, 21, 6, 1, 0xfff4f4);
      g.rect(W - 2, 12, 2, H - 14, body); // 열린 문짝 옆선
      g.set(W - 1, 14, 0x8a9a92);
    } else {
      g.vline(W - 4, 4, 8, 0x8a9a92); // 손잡이
      g.vline(W - 4, 14, 22, 0x8a9a92);
      g.rect(4, 15, 4, 3, 0xf0d040); // 자석 메모
      g.rect(5, 20, 3, 3, 0xf0a0b0);
    }
  },
  bathtub: (g, W, H) => {
    // 발 달린 하얀 욕조 + 거품 물 + 수도꼭지
    g.ellipse(W / 2, H - 9, W / 2 - 1, 8, 0xf2f2ee);
    g.rect(2, H - 12, W - 4, 6, 0xf2f2ee);
    g.ellipse(W / 2, H - 12, W / 2 - 3, 4, 0x7ab0d0);
    for (const x of [7, 12, 18, 23]) g.ellipse(x, H - 13, 2, 1.4, 0xeef4fa);
    g.hline(3, W - 4, H - 8, 0xd8d8d0);
    g.rect(4, H - 3, 2, 3, 0xc8a050);
    g.rect(W - 6, H - 3, 2, 3, 0xc8a050);
    g.rect(W - 5, 0, 2, H - 14, 0xb8b8c0); // 수도꼭지
    g.rect(W - 8, 0, 4, 2, 0xb8b8c0);
  },
  cat_cushion: (g, _W, H) => {
    g.ellipse(8, H - 5, 7, 4.5, 0xc04a4a);
    g.ellipse(8, H - 6, 6, 3, 0xd86060);
    // 둥글게 말린 주황 고양이
    g.ellipse(8, H - 8, 5, 3.5, 0xe8a050);
    g.ellipse(5, H - 10, 2.5, 2.2, 0xe8a050);
    g.set(3, H - 13, 0xe8a050);
    g.set(6, H - 13, 0xe8a050);
    g.hline(4, 5, H - 10, 0x5a3a20); // 감은 눈
    g.set(9, H - 9, 0xc8803a);
    g.set(11, H - 8, 0xc8803a);
    g.hline(10, 13, H - 6, 0xe8a050); // 꼬리
  },
  grand_clock: (g, W, H) => {
    box(g, 2, 2, W - 4, H - 3, WOOD_D);
    g.rect(3, 0, W - 6, 3, WOOD);
    g.set(8, 0, WOOD_L);
    g.ellipse(8, 8, 4.5, 4.5, 0xc8a050);
    g.ellipse(8, 8, 3.5, 3.5, 0xf2ead8);
    g.vline(8, 6, 8, 0x2a2420);
    g.hline(8, 10, 8, 0x2a2420);
    g.rect(5, 15, 6, H - 21, 0x2a1c14); // 추 창
    g.vline(8, 15, H - 10, 0xc8a050);
    g.ellipse(8, H - 9, 1.6, 1.6, 0xe0c060);
    g.rect(3, H - 3, W - 6, 2, WOOD);
  },
  ghost_cat: (g, _W, H) => {
    g.ellipse(8, H - 5, 7, 4, 0x8a3e4a);
    g.ellipse(8, H - 8, 5, 4, 0xd8e0f0, 200);
    g.set(5, H - 12, 0xd8e0f0, 200);
    g.set(10, H - 12, 0xd8e0f0, 200);
    g.hline(6, 7, H - 8, 0x4a5060);
    g.hline(9, 10, H - 8, 0x4a5060);
    g.hline(12, 14, H - 6, 0xd8e0f0);
  },
};

// ── 4방향 가구 (catalog spin): 옆모습(왼쪽을 봄)·뒷모습. 오른쪽을 보는 모습은 옆모습을 좌우로 뒤집는다 ──
// 빛은 늘 위에서 (윗면 밝게 · 밑변 어둡게) 내려와 좌우로 뒤집어도 어색하지 않게 그린다.
// 옆모습 크기 = 앞모습의 가로·세로 칸을 바꾼 것 (2×1 가구는 16 × 32+솟는 높이).

type SpinArt = { side: Draw; back: Draw };

const SPIN_ART: Record<string, SpinArt> = {
  chair: {
    // 왼쪽을 봄: 앉는 판이 왼쪽, 등받이가 오른쪽에 선다
    side: (g, _W, H) => {
      g.rect(10, 0, 3, 14, WOOD);
      g.vline(10, 1, 12, WOOD_L);
      box(g, 2, 8, 11, 6, WOOD_L);
      g.hline(2, 12, 8, lighten(WOOD_L, 0.15));
      g.vline(3, 14, H - 1, WOOD_D);
      g.vline(11, 14, H - 1, WOOD_D);
    },
    // 뒤: 앉는 판이 뒤로 보이고 등받이 뒷면이 앞에 선다
    back: (g, _W, H) => {
      box(g, 2, 3, 12, 5, WOOD_L);
      g.rect(3, 4, 10, 12, WOOD);
      g.rect(3, 4, 10, 1, WOOD_L);
      g.vline(5, 6, 14, WOOD_D);
      g.vline(10, 6, 14, WOOD_D);
      g.hline(3, 12, 15, WOOD_D);
      g.vline(3, 16, H - 1, WOOD_D);
      g.vline(12, 16, H - 1, WOOD_D);
    },
  },
  bed: {
    // 머리가 오른쪽: 오른쪽에 높은 머리판, 왼쪽에 낮은 발판, 베개 둘이 세로로
    side: (g, W, H) => {
      g.rect(0, 6, 3, H - 8, WOOD_D);
      g.rect(1, 7, 1, H - 10, WOOD);
      g.rect(3, 9, W - 7, H - 12, 0xe8e2d4);
      g.hline(3, W - 5, 9, 0xf4f0e6);
      for (const y of [11, 23]) {
        g.rect(W - 13, y, 8, 10, 0xf8f4ea);
        g.vline(W - 13, y, y + 9, 0xd8d0c0);
      }
      g.rect(3, 9, W - 18, H - 12, 0x6a4a7a);
      g.vline(W - 15, 9, H - 4, 0x8a6a9a);
      g.vline(W - 16, 9, H - 4, 0xf0ead8);
      for (let x = 5; x < W - 17; x += 5) for (let y = 12; y < H - 4; y += 6) g.set(x + ((x / 5) % 2) * 2, y, 0x553a63);
      g.rect(W - 4, 0, 4, H - 1, WOOD_D);
      g.vline(W - 3, 2, H - 4, WOOD);
      g.hline(W - 4, W - 1, 0, WOOD_L);
      box(g, 0, H - 3, W, 3, WOOD_D);
    },
    // 머리가 아래: 위쪽은 낮은 발판, 아래쪽 머리판이 베개 앞을 가린다
    back: (g, W, H) => {
      box(g, 0, 2, W, 5, WOOD_D);
      g.hline(0, W - 1, 2, WOOD);
      g.rect(1, 7, W - 2, H - 15, 0xe8e2d4);
      g.vline(1, 7, H - 9, 0xc8c0b0);
      g.vline(W - 2, 7, H - 9, 0xc8c0b0);
      g.rect(1, 7, W - 2, H - 25, 0x6a4a7a);
      for (let y = 9; y < H - 19; y += 5) for (let x = 3; x < W - 2; x += 6) g.set(x + ((y / 5) % 2) * 3, y, 0x553a63);
      g.hline(1, W - 2, H - 18, 0x8a6a9a);
      g.hline(1, W - 2, H - 17, 0xf0ead8);
      g.rect(4, H - 16, 11, 6, 0xf8f4ea);
      g.rect(W - 15, H - 16, 11, 6, 0xf8f4ea);
      g.hline(4, 14, H - 16, 0xffffff);
      g.hline(W - 15, W - 5, H - 16, 0xffffff);
      box(g, 0, H - 10, W, 10, WOOD_D);
      g.rect(2, H - 8, W - 4, 5, WOOD);
      g.hline(2, W - 3, H - 8, WOOD_L);
      g.rect(0, H - 12, 3, 12, WOOD_D);
      g.rect(W - 3, H - 12, 3, 12, WOOD_D);
    },
  },
  piano: {
    // 건반이 왼쪽: 몸통은 오른쪽에 높이 서고, 건반 판이 왼쪽으로 튀어나온다
    side: (g, W, H) => {
      box(g, 6, 0, W - 7, H - 4, 0x2e2220);
      g.rect(7, 1, W - 9, 2, 0x4a3632);
      g.vline(7, 3, H - 6, 0x3a2a26);
      g.rect(1, 15, 6, H - 24, 0x4a3632);
      g.rect(2, 16, 3, H - 26, 0xf6f2e8);
      for (let y = 18; y < H - 10; y += 3) g.hline(2, 4, y, 0xc8c0b0);
      for (let y = 17; y < H - 10; y += 4) g.rect(4, y, 1, 2, 0x1a1412);
      g.rect(2, H - 9, 4, 5, 0x2e2220);
      g.rect(8, H - 4, 2, 3, 0x1a1412);
      g.rect(8, 13, 2, 3, 0x1a1412);
      g.rect(3, H - 6, 2, 2, 0xc8a050);
    },
    // 뒤: 판자를 댄 뒷판만 보인다
    back: (g, W, H) => {
      box(g, 1, 0, W - 2, H - 4, 0x2e2220);
      g.rect(2, 1, W - 4, 2, 0x4a3632);
      g.rect(3, 4, W - 6, H - 10, 0x3a2a26);
      for (let x = 7; x < W - 4; x += 6) g.vline(x, 4, H - 7, 0x2a1c18);
      g.hline(3, W - 4, Math.floor(H / 2), 0x4a3632);
      g.rect(3, H - 4, 2, 3, 0x1a1412);
      g.rect(W - 5, H - 4, 2, 3, 0x1a1412);
    },
  },
  monitor_desk: {
    // 화면이 왼쪽을 봄: 길쭉한 책상 윗면(밝게) + 앞면, 오른쪽 끝에 모니터 옆면 둘이 서고 왼쪽에 자판
    side: (g, W, H) => {
      g.rect(1, 10, W - 2, H - 16, WOOD);
      g.hline(1, W - 2, 10, WOOD_L);
      box(g, 1, H - 6, W - 2, 5, WOOD_D);
      for (const y of [4, 20]) {
        g.rect(10, y, 3, 10, 0x22262e);
        g.vline(10, y + 1, y + 8, 0x3a6ab0);
        g.rect(11, y + 10, 2, 2, 0x22262e);
      }
      g.rect(3, 14, 4, 14, 0x30343c);
      for (let y = 15; y < 27; y += 2) g.hline(4, 5, y, 0x50565e);
    },
    // 뒤: 모니터 뒷면 둘과 받침
    back: (g, W, H) => {
      box(g, 1, H - 12, W - 2, 10, WOOD_D);
      g.hline(1, W - 2, H - 12, lighten(WOOD_D, 0.2));
      for (const x of [4, 17]) {
        g.rect(x, 1, 11, 9, 0x2a2e36);
        g.rect(x + 2, 3, 7, 5, 0x343842);
        g.rect(x + 4, 10, 3, 4, 0x22262e);
      }
      g.vline(16, 8, H - 12, 0x1a1c20); // 전선
    },
  },
  radio: {
    side: (g, _W, H, v) => {
      g.vline(9, 0, 6, 0x9a9a9a);
      g.set(9, 0, 0xd0d0d0);
      box(g, 5, 5, 7, H - 6, 0x8a5a36);
      g.rect(6, 6, 5, 1, 0xa87448);
      g.rect(4, H - 9, 1, 3, v.split("-").includes("on") ? 0x9ff0a0 : 0x5a6a50); // 다이얼이 옆으로 살짝
      g.rect(5, H - 4, 2, 2, 0xc8a050);
    },
    back: (g, _W, H) => {
      g.vline(12, 0, 6, 0x9a9a9a);
      g.set(12, 0, 0xd0d0d0);
      box(g, 2, 5, 12, H - 6, 0x7a4e2e);
      g.rect(3, 6, 10, 1, 0x9a6a40);
      for (let y = H - 11; y < H - 3; y += 2) g.hline(4, 11, y, 0x5a3a22);
    },
  },
  coffee_machine: {
    side: (g, _W, H) => {
      box(g, 6, 1, 7, H - 2, 0x30343a);
      g.rect(7, 3, 5, 4, 0x50565e);
      g.rect(3, H - 11, 3, 2, 0x30343a); // 꼭지
      g.rect(3, H - 8, 4, 4, 0xe8e0c8);
      g.rect(3, H - 7, 4, 1, 0x5a3a26);
    },
    back: (g, W, H) => {
      box(g, 3, 1, W - 6, H - 2, 0x2a2e34);
      g.rect(5, 3, W - 10, 4, 0x3a4048);
      g.vline(W / 2, 8, H - 3, 0x1a1c20); // 전선
    },
  },
  fridge: {
    side: (g, _W, H) => {
      const body = 0xd8ece4;
      box(g, 4, 0, 9, H, body);
      g.hline(4, 12, 0, 0xeef8f4);
      g.vline(4, 0, H - 1, 0xb8ccc4); // 문 옆선
      g.rect(3, 4, 1, 5, 0x8a9a92); // 손잡이
      g.rect(3, 14, 1, 9, 0x8a9a92);
      g.rect(5, H - 2, 2, 2, 0x5a5a5a);
      g.rect(10, H - 2, 2, 2, 0x5a5a5a);
    },
    back: (g, W, H) => {
      box(g, 1, 0, W - 2, H, 0xc4d8d0);
      g.hline(1, W - 2, 0, 0xe0f0ea);
      // 뒷면 방열판 격자
      for (let y = 4; y < H - 4; y += 3) g.hline(4, W - 5, y, 0x6a7470);
      for (const x of [4, W - 5]) g.vline(x, 4, H - 5, 0x6a7470);
      g.rect(2, H - 2, 2, 2, 0x5a5a5a);
      g.rect(W - 4, H - 2, 2, 2, 0x5a5a5a);
    },
  },
  server_rack: {
    side: (g, _W, H) => {
      box(g, 4, 0, 9, H, 0x2a2e36);
      g.hline(4, 12, 0, 0x3c424c);
      for (let y = 2; y < H - 3; y += 4) g.set(4, y + 1, (y / 4) % 2 ? 0x7fe0a0 : 0xe0c050);
      g.rect(3, H - 10, 1, 5, 0x3c424c); // 꺼내는 칸
    },
    back: (g, W, H) => {
      box(g, 2, 0, W - 4, H, 0x24282e);
      g.hline(2, W - 3, 0, 0x343a42);
      for (let y = 4; y < H - 4; y += 3) g.hline(4, W - 5, y, 0x1a1c20);
    },
  },
  grand_clock: {
    side: (g, _W, H) => {
      box(g, 5, 2, 7, H - 3, WOOD_D);
      g.rect(5, 0, 7, 3, WOOD);
      g.set(8, 0, WOOD_L);
      g.vline(4, 4, 12, 0xc8a050); // 시계판 테두리
      g.vline(4, 15, H - 8, 0x3a281c);
      g.rect(5, H - 3, 7, 2, WOOD);
    },
    back: (g, W, H) => {
      box(g, 2, 2, W - 4, H - 3, WOOD_D);
      g.rect(3, 0, W - 6, 3, WOOD);
      g.set(8, 0, WOOD_L);
      g.rect(4, 5, W - 8, H - 10, darken(WOOD_D, 0.15));
      g.hline(4, W - 5, Math.floor(H / 2), WOOD);
      g.rect(3, H - 3, W - 6, 2, WOOD);
    },
  },
  cat_cushion: {
    // 고양이가 위쪽(뒤)을 보고 몸을 만다 (등이 보인다)
    side: (g, _W, H) => {
      g.ellipse(8, H - 5, 7, 4.5, 0xc04a4a);
      g.ellipse(8, H - 6, 6, 3, 0xd86060);
      g.ellipse(8, H - 7, 4, 3.5, 0xe8a050);
      g.ellipse(8, H - 11, 2.5, 2.2, 0xe8a050);
      g.set(6, H - 13, 0xe8a050);
      g.set(10, H - 13, 0xe8a050);
      g.set(7, H - 7, 0xc8803a);
      g.set(9, H - 8, 0xc8803a);
      g.hline(3, 6, H - 4, 0xe8a050); // 꼬리
    },
    // 머리가 오른쪽 (앞모습의 거울) + 등 줄무늬
    back: (g, _W, H) => {
      g.ellipse(8, H - 5, 7, 4.5, 0xc04a4a);
      g.ellipse(8, H - 6, 6, 3, 0xd86060);
      g.ellipse(8, H - 8, 5, 3.5, 0xe8a050);
      g.ellipse(11, H - 10, 2.5, 2.2, 0xe8a050);
      g.set(13, H - 13, 0xe8a050);
      g.set(10, H - 13, 0xe8a050);
      g.hline(11, 12, H - 10, 0x5a3a20);
      g.set(7, H - 9, 0xc8803a);
      g.set(5, H - 8, 0xc8803a);
      g.hline(3, 6, H - 6, 0xe8a050);
    },
  },
};

/** 4방향 가구 그림의 방향 (변형 이름의 d1~d3. 없으면 0 = 앞) */
const dirOfVariant = (v: string): number => {
  const t = v.split("-").find((x) => /^d[0-3]$/.test(x));
  return t ? Number(t[1]) : 0;
};

/** 돌린 모습을 그림째 돌리지 않고 따로 그리는 물건 (연못: 빛 방향·물가 돌이 돌려도 자연스럽게). 나머지 turn 물건은 그림을 90°씩 돌린다 */
export const drawsTurned = (id: string) => id === "pond";
/** 은은하게 움직이는 물건의 장면 수 (연못 잔물결·반짝임). 1이면 멈춘 그림 */
export const animFrames = (id: string) => (id === "pond" ? POND_FRAMES : 1);
/** 발밑 그림자를 깔지 않는 물건 (연못: 바닥에 낮게 깔린 물이라 돌 테두리만으로 충분) */
export const noFootShadow = (id: string) => id === "pond";
/** 밤에 다른 그림을 쓰는 물건 (연못: 달이 비친다) */
export const hasNightArt = (id: string) => id === "pond";

/**
 * 그림 변형 이름 잇기: 기본 변형(불 켜짐 등) + 세로(v)·밤(n)·장면(f1…). 빈 조각은 뺀다.
 * 연못처럼 따로 그리는 물건만 v·n·f를 쓰고, 나머지는 기본 변형 그대로다.
 */
export function itemVariant(id: string, base: string, opts: { r?: number; night?: boolean; frame?: number } = {}): string {
  const parts = [base];
  if (drawsTurned(id) && (opts.r ?? 0) % 2 === 1) parts.push("v");
  // 4방향 가구: 앞(0)이 아니면 방향 d1~d3 (오른쪽을 보는 d3은 옆모습 d1을 뒤집어 쓴다)
  const sd = furnitureById(id)?.spin ? spinDir(opts.r ?? 0) : 0;
  if (sd) parts.push(`d${sd === 3 ? 1 : sd}`);
  if (hasNightArt(id) && opts.night) parts.push("n");
  const n = animFrames(id);
  if (n > 1 && opts.frame && opts.frame % n) parts.push(`f${opts.frame % n}`);
  return parts.filter(Boolean).join("-");
}

/** 물건 그림 (차지 칸 + 위로 솟는 부분). 없는 id면 null. variant = 불 켜짐·문 열림·화분 단계 (Draw 참고) */
export function furnitureGrid(id: string, variant = ""): Grid | null {
  const def = furnitureById(id);
  const draw = DRAW[id];
  if (!def || !draw) return null;
  // 세로로 돌린 모습을 따로 그리는 물건 (drawsTurned)은 변형에 "v"가 붙으면 가로·세로를 바꿔 그린다
  // 4방향 가구는 "d1"(옆)·"d2"(뒤)가 붙으면 그 모습을 그린다 (옆모습은 가로·세로 칸이 바뀐다)
  const sd = def.spin ? dirOfVariant(variant) : 0;
  const vert = (def.turn && drawsTurned(id) && variant.split("-").includes("v")) || sd % 2 === 1;
  const W = (vert ? def.h : def.w) * 16;
  const H = (vert ? def.w : def.h) * 16 + artUp(id);
  const g = new Grid(W, H);
  const spin = sd ? SPIN_ART[id] : undefined;
  (spin ? (sd === 2 ? spin.back : spin.side) : draw)(g, W, H, variant);
  if (id !== "rug" && id !== "flowerbed" && id !== "stone_path") g.outline(OUT, false, 170);
  return g;
}

// ── 바닥 (16×16 타일, 칸마다 살짝 다르게: 4가지 변형) ── 3번: 집 안 바닥으로 다시 그림 (id는 마당 시절 그대로)

type Tile = (g: Grid, v: number) => void;

/** 집 밖 마당·분양 마을 풀밭 (예전 기본 바닥) */
function yard(g: Grid, v: number): void {
  g.rect(0, 0, 16, 16, 0x2e3d2c);
  for (let i = 0; i < 10; i++) g.set(Math.floor(hash2(i, v, 3) * 16), Math.floor(hash2(v, i, 7) * 16), i % 3 ? 0x3a4c36 : 0x26331f);
}

const speck = (g: Grid, v: number, n: number, salt: number, colors: Color[]) => {
  for (let i = 0; i < n; i++) g.set(Math.floor(hash2(i, v, salt) * 16), Math.floor(hash2(v, i, salt + 2) * 16), colors[i % colors.length]);
};

const FLOOR: Record<string, Tile> = {
  // 낡은 장판: 누런 바탕에 옅은 네모 무늬, 이음선
  [DEFAULT_FLOOR]: (g, v) => {
    g.rect(0, 0, 16, 16, 0xc4a468);
    g.hline(0, 15, 0, 0xb08e56);
    g.vline(0, 0, 15, 0xb08e56);
    for (let y = 4; y < 16; y += 8) for (let x = 4; x < 16; x += 8) g.rect(x, y, 2, 2, 0xcfb07a);
    speck(g, v, 5, 3, [0xb89a60, 0xd0b47e]);
  },
  // 초록 카펫: 촘촘한 털 결
  floor_moss: (g, v) => {
    g.rect(0, 0, 16, 16, 0x4a6e48);
    speck(g, v, 26, 5, [0x567c52, 0x3e6040, 0x5e8658]);
  },
  // 나무 마루: 가로 널 4줄, 줄마다 이음매가 엇갈린다
  floor_wood: (g, v) => {
    const tones = [0x8a5e3a, 0x7e5434, 0x925f39, 0x83583a];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      g.rect(0, y, 16, 4, tones[(row + v) % 4]);
      g.hline(0, 15, y + 3, 0x5a3a22);
      const seam = (row * 7 + v * 5) % 16;
      g.vline(seam, y, y + 2, 0x5a3a22);
      g.hline((seam + 3) % 16, (seam + 6) % 16, y + 1, lighten(tones[(row + v) % 4], 0.12));
    }
  },
  // 대리석: 밝은 회색 판석 + 물결 결 + 줄눈
  floor_stone: (g, v) => {
    g.rect(0, 0, 16, 16, 0xb6b3aa);
    g.hline(0, 15, 15, 0x8a877e);
    g.vline(15, 0, 15, 0x8a877e);
    for (let i = 0; i < 9; i++) g.set(2 + i + (v % 2), 3 + Math.round(Math.sin(i / 2 + v) * 2) + i / 2, 0x9c998f);
    g.hline(1, 3, 1, 0xd0cdc4);
  },
  // 체크 타일: 크림·갈색 8칸 바둑판
  floor_tile: (g) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.rect(x * 8, y * 8, 8, 8, (x + y) % 2 ? 0x8a6a4a : 0xe8dcc0);
    g.hline(0, 15, 0, 0xc8bca0);
    g.vline(0, 0, 15, 0xc8bca0);
    g.set(2, 2, 0xf6eedc);
  },
  // 분홍 카펫: 꽃잎 수
  floor_petal: (g, v) => {
    g.rect(0, 0, 16, 16, 0xb86e86);
    speck(g, v, 14, 11, [0xc47c94, 0xa86278]);
    const cx = 4 + (v % 2) * 8;
    const cy = 4 + Math.floor(v / 2) * 8;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) g.set(cx + dx, cy + dy, 0xf0b0c4);
    g.set(cx, cy, 0xffe080);
  },
};

export function floorGrid(id: string, variant: number): Grid {
  const g = new Grid(16, 16);
  (FLOOR[id] ?? FLOOR[DEFAULT_FLOOR])(g, variant % 4);
  return g;
}

/** 집 밖 마당·분양 마을 풀밭 타일 */
export function yardGrid(variant: number): Grid {
  const g = new Grid(16, 16);
  yard(g, variant % 4);
  return g;
}

// ── 벽 (안쪽 벽면 16×WALL_H): 위 천장 테(4) + 몰딩(2) + 벽지 + 걸레받이(5) ── 3번 집 안 개편

export const WALL_H = 40;
/** 벽지 무늬가 그려지는 줄 범위 */
const PAPER_Y0 = 6;
const PAPER_Y1 = WALL_H - 6;

const PAPER: Record<string, Tile> = {
  // 나무 판자 벽 (기본)
  [DEFAULT_WALL]: (g, v) => {
    for (let x = 0; x < 16; x += 4) {
      const c = (x / 4 + v) % 2 ? 0x9a7048 : 0x8e6640;
      g.rect(x, PAPER_Y0, 4, PAPER_Y1 - PAPER_Y0 + 1, c);
      g.vline(x + 3, PAPER_Y0, PAPER_Y1, 0x6a4a2e);
    }
    g.set(5 + v * 2, 16 + v * 3, 0x6a4a2e);
    g.set(6 + v * 2, 16 + v * 3, 0x7a5636);
  },
  // 돌벽
  wall_stone: (g, v) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0x5f5d57);
    for (let row = 0; PAPER_Y0 + row * 6 < PAPER_Y1; row++) {
      const y = PAPER_Y0 + row * 6;
      for (let x = row % 2 ? -4 : 0; x < 16; x += 8) {
        g.rect(x + 1, y + 1, 6, Math.min(5, PAPER_Y1 - y), (row + v + x) % 3 ? 0x8c8a82 : 0x9a978e);
        g.hline(x + 1, x + 6, y + 1, 0xaaa79c);
      }
    }
  },
  // 풀잎 벽지
  wall_hedge: (g, v) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0xb4c894);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1; y += 8)
      for (let x = ((y / 8) | 0) % 2 ? 2 : 10; x < 16; x += 16) {
        g.set(x, y, 0x6a8a4a);
        g.set(x + 1, y - 1, 0x7a9a5a);
        g.set(x - 1, y + 1, 0x7a9a5a);
        g.set(x + 1, y + 1, 0x8aaa6a);
      }
    if (v % 2) g.set(13, PAPER_Y0 + 12, 0x6a8a4a);
  },
  // 꽃무늬 벽지
  wall_paper: (g) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0xf0e2c4);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1 - 1; y += 7) {
      const x = ((y - PAPER_Y0) / 7) % 2 ? 11 : 3;
      g.rect(x, y, 2, 2, 0xd06a7a);
      g.set(x, y, 0xe890a0);
      g.set(x - 1, y + 2, 0x8aa070);
      g.set(x + 2, y + 2, 0x8aa070);
    }
  },
  // 남색 장식 벽지 + 아래 나무 판 (징두리)
  wall_iron: (g) => {
    g.rect(0, PAPER_Y0, 16, PAPER_Y1 - PAPER_Y0 + 1, 0x2a3452);
    for (let y = PAPER_Y0 + 3; y < PAPER_Y1 - 12; y += 8) {
      const x = ((y - PAPER_Y0) / 8) % 2 ? 12 : 4;
      g.set(x, y - 1, 0xc8a050);
      g.set(x - 1, y, 0xc8a050);
      g.set(x + 1, y, 0xc8a050);
      g.set(x, y + 1, 0xc8a050);
      g.set(x, y, 0x8a7040);
    }
    g.rect(0, PAPER_Y1 - 10, 16, 11, 0x4a2e1e);
    g.hline(0, 15, PAPER_Y1 - 10, 0x8a6040);
    g.rect(2, PAPER_Y1 - 8, 12, 7, 0x553522);
  },
};

export function wallGrid(id: string, variant: number): Grid {
  const g = new Grid(16, WALL_H);
  // 천장 테 (어두운 들보) + 몰딩
  g.rect(0, 0, 16, 4, 0x2a2018);
  g.hline(0, 15, 0, 0x4a3828);
  g.hline(0, 15, 4, 0xe8dcc8);
  g.hline(0, 15, 5, 0xb8a890);
  (PAPER[id] ?? PAPER[DEFAULT_WALL])(g, variant % 4);
  // 걸레받이
  g.rect(0, WALL_H - 5, 16, 5, 0x5a3a22);
  g.hline(0, 15, WALL_H - 5, 0x8a6040);
  g.hline(0, 15, WALL_H - 1, 0x3a2416);
  return g;
}

/** 옆벽·칸막이 벽 윗면 색 (벽 종류에 맞춘 어두운 테) */
export function wallCapColor(id: string): Color {
  return id === "wall_stone" ? 0x4a4842 : id === "wall_iron" ? 0x1e2438 : 0x3a2a1e;
}

/** 칸막이 벽 끝면(앞에서 보이는 면) 색 = 벽지 바탕 */
export function wallFaceColor(id: string): Color {
  const g = wallGrid(id, 0);
  const v = g.get(1, Math.floor(WALL_H / 2));
  return (v >>> 8) & 0xffffff;
}

// ── 창문 (안쪽 벽, 32×24): 낮 하늘·밤하늘 × 닫힘·열림 ──

export const WINDOW_W = 32;
export const WINDOW_H = 24;

export function windowGrid(night: boolean, open: boolean): Grid {
  const g = new Grid(WINDOW_W, WINDOW_H);
  const W = WINDOW_W;
  const H = WINDOW_H;
  // 틀
  g.rect(0, 0, W, H - 2, 0x6a4a30);
  // 하늘
  for (let y = 2; y < H - 4; y++) {
    const t = (y - 2) / (H - 6);
    const c = night ? mixColor(0x141c34, 0x26304c, t) : mixColor(0x8cc4ec, 0xd4ecfa, t);
    g.hline(2, W - 3, y, c);
  }
  if (night) {
    for (const [x, y] of [[6, 5], [12, 9], [21, 4], [26, 11], [9, 14], [18, 15]]) g.set(x, y, 0xf0f0ff);
    g.ellipse(24, 7, 2.6, 2.6, 0xf2ecc8);
    g.ellipse(25, 6, 2, 2, 0x1c2440);
  } else {
    g.ellipse(9, 8, 4, 2, 0xffffff);
    g.ellipse(12, 7, 3, 2, 0xffffff);
    g.ellipse(22, 13, 3.5, 1.6, 0xf4faff);
    // 먼 나무 실루엣
    for (let x = 2; x < W - 2; x++) g.vline(x, H - 6 - Math.round(1.5 + Math.sin(x / 2.3) * 1.5), H - 5, 0x5a8a5a);
  }
  if (open) {
    // 창짝이 양옆으로 열렸다: 가장자리에 좁은 유리 창짝 + 바람에 날리는 커튼
    g.rect(2, 2, 3, H - 6, 0x8a6a48);
    g.rect(W - 5, 2, 3, H - 6, 0x8a6a48);
    for (let y = 2; y < H - 4; y++) {
      g.set(5 + (y % 4 === 0 ? 1 : 0), y, 0xd86a6a);
      g.set(W - 6 - (y % 4 === 2 ? 1 : 0), y, 0xd86a6a);
    }
  } else {
    // 닫힌 창: 가운데 창살 + 유리 반사 + 양옆 커튼
    g.vline(W / 2, 2, H - 5, 0x6a4a30);
    g.hline(2, W - 3, Math.floor((H - 4) / 2), 0x6a4a30);
    for (let i = 0; i < 4; i++) g.set(6 + i, 12 - i, night ? 0x4a5878 : 0xffffff);
    for (let y = 2; y < H - 4; y++) {
      g.hline(2, 5 + (y > H - 9 ? 1 : 0), y, 0xc85a5a);
      g.hline(W - 6 - (y > H - 9 ? 1 : 0), W - 3, y, 0xc85a5a);
    }
    g.vline(4, 2, H - 5, 0xa84a4a);
    g.vline(W - 5, 2, H - 5, 0xa84a4a);
  }
  // 창턱
  g.rect(0, H - 4, W, 2, 0x8a6a48);
  g.rect(-1, H - 2, W + 2, 2, 0x5a3a22);
  g.hline(0, W - 1, H - 4, 0xa88a68);
  g.outline(OUT, false, 200);
  return g;
}

function mixColor(a: Color, b: Color, t: number): Color {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 벽등 (12×10): 밤에 켜진다 */
export function sconceGrid(on: boolean): Grid {
  const g = new Grid(12, 10);
  g.rect(5, 6, 2, 4, 0x5a4a3a);
  for (let y = 0; y < 6; y++) g.hline(3 - (y >> 1), 8 + (y >> 1), y, on ? 0xfff0b0 : 0xd8ccb0);
  if (on) g.hline(3, 8, 0, 0xffffff);
  g.outline(OUT, false, 200);
  return g;
}

// ── UI 아이콘 (dataURL, 캐시) ──

const icons = new Map<string, { url: string; w: number; h: number }>();

/** 상점·가방 아이콘. 스킨은 타일 2×2(바닥)·담장 2칸으로 보여 준다 */
export function furnitureIcon(id: string, scale: number): { url: string; w: number; h: number } {
  const key = `${id}@${scale}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const def = furnitureById(id);
  let src: Grid | null;
  if (def?.skin === "floor" || id === DEFAULT_FLOOR) {
    src = new Grid(32, 32);
    for (let i = 0; i < 4; i++) src.draw(floorGrid(id, i), (i % 2) * 16, Math.floor(i / 2) * 16);
  } else if (def?.skin === "wall" || id === DEFAULT_WALL) {
    src = new Grid(32, WALL_H);
    src.draw(wallGrid(id, 0), 0, 0);
    src.draw(wallGrid(id, 1), 16, 0);
  } else if (def?.ext) src = facadeGrid({ ...defaultExterior(), [def.ext]: id }, "small");
  else src = furnitureGrid(id);
  const g = src ?? new Grid(16, 16);
  const c = document.createElement("canvas");
  c.width = g.w * scale;
  c.height = g.h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  icons.set(key, out);
  return out;
}

/** 시계 방향 90° 돌린 복사본 (Phaser setAngle(90)과 같은 방향) */
function rotateCW(src: Grid): Grid {
  const g = new Grid(src.h, src.w);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) g.px[x * src.h + (src.h - 1 - y)] = src.px[y * src.w + x];
  return g;
}

/**
 * 집 안에 r 방향으로 놓였을 때 보이는 그림 (HouseScene.placeView와 같은 규칙):
 * 따로 그리는 물건(연못)은 세로 그림 + r≥2면 좌우 뒤집기, 다른 turn 물건은 90°씩 돌리기, 나머지는 r 홀수면 좌우 뒤집기.
 */
export function shownItemGrid(id: string, r: number, variant = ""): Grid | null {
  const def = furnitureById(id);
  const g = furnitureGrid(id, variant);
  if (!def || !g) return g;
  // 4방향 가구: 예전 값(0~3)은 앞모습(홀수면 뒤집기), 4~7은 방향 그림 (오른쪽을 보면 옆모습을 뒤집는다)
  if (def.spin) return r >= SPIN_R0 ? (spinDir(r) === 3 ? g.mirrored() : g) : r % 2 ? g.mirrored() : g;
  const q = ((r % 4) + 4) % 4;
  if (def.turn && drawsTurned(id)) return q >= 2 ? g.mirrored() : g;
  if (def.turn) {
    let out = g;
    for (let i = 0; i < q; i++) out = rotateCW(out);
    return out;
  }
  return q % 2 ? g.mirrored() : g;
}

/** 상점 미리보기 보기 방식: 방향(r)·밤·잔물결 장면 */
export type PreviewOpts = { r?: number; night?: boolean; frame?: number; stage?: boolean };

/** 밤 미리보기에서 빛나는 자리 */
type PreviewLight = { x: number; y: number; r: number; color: Color; k: number };

/** 밤 방 안: 푸르스름하게 어둡히고, 빛나는 물건 둘레만 따뜻하게 남긴다 (게임의 밤 조명을 흉내) */
function nightShade(g: Grid, lights: PreviewLight[]): void {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.px[y * g.w + x];
      if ((v & 255) === 0) continue;
      const c = (v >>> 8) & 0xffffff;
      let glow = 0;
      let lc: Color = 0xffe0a0;
      for (const l of lights) {
        const t = Math.max(0, 1 - Math.hypot(x - l.x, y - l.y) / l.r) ** 1.4 * l.k;
        if (t > glow) {
          glow = t;
          lc = l.color;
        }
      }
      const r = (c >> 16) & 255;
      const gg = (c >> 8) & 255;
      const b = c & 255;
      const dim = ((Math.round(r * 0.28) << 16) | (Math.round(gg * 0.34) << 8) | Math.round(b * 0.58 + 14)) as Color;
      let out = mixColor(c, dim, 0.92 * (1 - glow));
      if (glow > 0) out = mixColor(out, lc, glow * 0.2);
      g.px[y * g.w + x] = Grid.rgba(out, v & 255);
    }
}

/**
 * 3번 상점 "놓아 본 모습": 기본 벽·바닥 위에 그 물건을 놓고 그림자까지 그린 미리보기 (dataURL, 캐시).
 * 스킨이면 그 벽지·바닥을 입힌 작은 방 귀퉁이를 보여 준다.
 * opts: 돌린 방향(r)·밤(집 안 밤 조명)·잔물결 장면. 돌리는 물건은 어느 방향이든 같은 크기의 방에 담아 그림이 들썩이지 않게 한다.
 */
export function furniturePreview(id: string, scale: number, opts: PreviewOpts = {}): { url: string; w: number; h: number } {
  const def = furnitureById(id);
  const r = def?.skin || def?.ext ? 0 : (((opts.r ?? 0) % 4) + 4) % 4;
  const night = !!opts.night;
  const frame = animFrames(id) > 1 ? (opts.frame ?? 0) % animFrames(id) : 0;
  const stage = !!opts.stage;
  const key = `preview:${id}@${scale}:${r}${night ? "n" : ""}${frame}${stage ? "s" : ""}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const flat = def && !def.skin;
  // 보기 방향 r(0~3) → 배치 r (4방향 가구는 방향 값 4~7)
  const pr = def?.spin ? SPIN_R0 + r : r;
  const fp = flat ? footprint(def, pr) : { w: 2, h: 1 };
  const fw = fp.w;
  const fh = fp.h;
  const floorId = def?.skin === "floor" ? id : DEFAULT_FLOOR;
  const wallId = def?.skin === "wall" ? id : DEFAULT_WALL;
  let W: number;
  let floorH: number;
  let wallShow: number;
  let left: number;
  if (stage) {
    // 큰 미리보기: 둘레를 반 칸씩만 두른 좁은 방 (물건이 크게 보이게). 돌리는 물건은 긴 쪽에 맞춰 돌려도 방 크기가 그대로
    const span = flat && (def.turn || def.spin) ? Math.max(def.w, def.h) : 0;
    W = (span || fw) * 16 + 16;
    floorH = (span || fh) * 16 + 8;
    wallShow = def?.skin === "wall" ? WALL_H - 4 : Math.max(12, artUp(id) + 4);
    left = Math.round((W - fw * 16) / 2);
  } else {
    const cols = Math.max(3, fw + 2);
    W = cols * 16;
    floorH = (fh + 1) * 16;
    // 벽지 스킨은 벽을 거의 다 보여 준다 (아래 판·무늬가 같이 보이게)
    wallShow = def?.skin === "wall" ? WALL_H - 4 : 18;
    left = Math.floor((cols - fw) / 2) * 16;
  }
  const H = wallShow + floorH;
  const g = new Grid(W, H);
  // 바닥 타일·벽 판자는 물건 왼쪽 끝에 칸을 맞춘다 (집 안처럼 물건이 칸 위에 놓이게)
  const off = (left % 16) - 16;
  for (let x = 0; off + x * 16 < W; x++) {
    const x0 = off + x * 16;
    const wall = wallGrid(wallId, x);
    // 벽 아래쪽(벽지 + 걸레받이)만 보인다
    for (let y = 0; y < wallShow; y++)
      for (let i = 0; i < 16; i++) if (x0 + i >= 0 && x0 + i < W) g.px[y * W + x0 + i] = wall.px[(WALL_H - wallShow + y) * 16 + i];
    for (let y = 0; y * 16 < floorH; y++) g.draw(floorGrid(floorId, x * 5 + y * 3), x0, wallShow + y * 16);
  }
  // 벽 밑 그늘
  for (let x = 0; x < W; x++) g.set(x, wallShow, darken(((g.get(x, wallShow) >>> 8) & 0xffffff) as Color, 0.35));
  const lights: PreviewLight[] = [];
  if (def && !def.skin && !def.ext) {
    // 밤에는 켜고 끄는 빛(벽난로·스탠드)을 켠 모습으로 보여 준다
    const lit = night && (id === "fireplace" || id === "floor_lamp");
    const art = shownItemGrid(id, pr, itemVariant(id, lit ? "on" : "", { r: pr, night, frame }));
    if (art) {
      const bottom = wallShow + Math.round((floorH - fh * 16) / 2) + fh * 16;
      if (!def.floor && !noFootShadow(id)) {
        // 바닥 그림자
        for (let x = left + 2; x < left + fw * 16 - 1; x++)
          for (let y = bottom - 4; y < bottom; y++) {
            const c = (g.get(x, y) >>> 8) & 0xffffff;
            g.set(x, y, darken(c as Color, 0.3));
          }
      }
      g.draw(art, left, bottom - art.h);
      const mx = left + (fw * 16) / 2;
      if (def.light) lights.push({ x: mx, y: bottom - Math.min(14, artUp(id) + 6), r: def.light.r * 1.9, color: def.light.color, k: 0.95 });
      if (lit) lights.push({ x: mx, y: bottom - (id === "fireplace" ? 8 : 26), r: id === "fireplace" ? 64 : 52, color: id === "fireplace" ? 0xff9a50 : 0xffe0a0, k: 1 });
      // 연못: 물에 비친 달이 은은하게 밝다
      if (hasNightArt(id)) lights.push({ x: mx, y: bottom - (fh * 16) / 2, r: Math.max(fw, fh) * 11, color: 0xc8d8f0, k: 0.4 });
    }
  }
  if (night) {
    // 방 천장 조명 (게임에서도 밤이면 방마다 켜진다)
    lights.push({ x: W / 2, y: wallShow, r: Math.max(W, H) * 0.75, color: 0xffe8c0, k: 0.32 });
    nightShade(g, lights);
  }
  const c = document.createElement("canvas");
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  icons.set(key, out);
  return out;
}

// ── 집 외관 (필지 한 칸 그림) → exterior.ts ──

export { FACADE_H, FACADE_W, facadeGrid, facadeInfo, type FacadeInfo } from "./exterior";

/** 외관 미리보기 dataURL (UI). 같은 외관·크기·낮밤은 캐시 */
export function facadePreview(ext: HouseExteriorMap, tier: string, scale: number, night = false): { url: string; w: number; h: number } {
  const key = `facade:${tier}:${Object.values(ext).join(",")}@${scale}${night ? ":night" : ""}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const g = facadeGrid(ext, tier, { night });
  const c = document.createElement("canvas");
  c.width = g.w * scale;
  c.height = g.h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  icons.set(key, out);
  return out;
}
