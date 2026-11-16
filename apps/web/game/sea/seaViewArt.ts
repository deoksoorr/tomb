import { Grid, mix, rng, type Color } from "../sprites/pixel";
import { fbm, pick, RAMP } from "./seaArt";
import { hashU } from "./seaLayout";

// 11/16 바다 보기 장면 그림 (순수 계산 — Phaser 없음). 하늘·바다·모래에는 테두리를 두지 않고 시안 단계(RAMP)로 부드럽게 디더해요.
// 물체(돗자리·파라솔·선베드·데크·등대·테트라포드)는 연한 갈색 테를 둘러요 (지도 그림과 같은 방식).
// 크기는 장면 가상 px (SeaView가 화면 크기에 맞춰 정해요). 색은 낮 기준으로 굽고, 시간대는 SeaView가 색을 곱해요 (하늘·바다만 시간대별로 다시 구워요)

/** 연한 갈색 테 (지도 그림 softOutline과 같은 색) */
function soft(g: Grid): void {
  g.outline(0x5c4a42, false, 122);
}

/** 세 색 사이를 t(0..1)로 (가운데 mid) */
function tri(a: Color, b: Color, c: Color, t: number): Color {
  return t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 두 색 사이 디더 (t 0..1, steps 단계) */
function dith(a: Color, b: Color, t: number, x: number, y: number, steps = 6): Color {
  const f = Math.max(0, Math.min(steps, t * steps));
  const i = Math.floor(f);
  const k = i + (f - i > B4[((y & 3) << 2) | (x & 3)] ? 1 : 0);
  return mix(a, b, Math.min(steps, k) / steps);
}

export type SeaPal = { far: Color; mid: Color; near: Color };

/**
 * 바다 몸통 (수평선 → 발 앞). 위(먼바다)는 짙고 가늘게, 아래(가까이)는 밝고 넓게 — 가로로 흐르는 결(fbm)로 밝은 물결 줄과 조금 짙은 줄.
 * gold = 해가 비치는 x (노을 금빛 줄을 구워 넣지는 않아요 — SeaView가 움직이는 줄로)
 */
export function seaBody(w: number, h: number, pal: SeaPal, seed = 1): Grid {
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++) {
    const t = Math.pow(y / Math.max(1, h - 1), 0.75);
    const base = tri(pal.far, pal.mid, pal.near, t);
    const next = tri(pal.far, pal.mid, pal.near, Math.min(1, t + 0.08));
    // 가까울수록 결이 굵어요 (원근)
    const sx = 6 + y * 0.9;
    const sy = 0.5 + y * 0.02;
    for (let x = 0; x < w; x++) {
      let c = dith(base, next, fbm(x / 40 + seed, y * 0.06) * 0.9, x, y, 4);
      const n = fbm(x / sx + seed * 3, y / sy);
      if (n > 0.72) c = mix(c, 0xffffff, 0.12 + (n - 0.72) * 0.6);
      else if (n < 0.24) c = mix(c, pal.far, 0.18);
      g.set(x, y, c);
    }
  }
  // 수평선 바로 아래 한 줄은 조금 밝게 (하늘이 비쳐요)
  for (let x = 0; x < w; x++) g.set(x, 0, mix(g.get(x, 0) >>> 8, 0xffffff, 0.12));
  return g;
}

/** 흐르는 물결 마루 (투명 바탕에 밝은 짧은 줄 — 가로로 흘려요). 128 × 32, 가로로 이어져요 */
export function crestTile(seed: number): Grid {
  const g = new Grid(128, 32);
  const r = rng(seed);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(r() * 128);
    const y = Math.floor(r() * 32);
    const len = 4 + Math.floor(r() * 10);
    for (let k = 0; k < len; k++) g.set((x + k) % 128, y, 0xffffff, k === 0 || k === len - 1 ? 70 : 140);
  }
  return g;
}

/** 모래 띠 (위는 젖은 모래, 아래로 마른 모래). 조개 몇 개 */
export function sandBand(w: number, h: number, wetRows: number): Grid {
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 24, y / 10);
      const c = y < wetRows ? pick(RAMP.wet, 0.1 + (y / wetRows) * 0.3 + n * 0.25, x, y) : pick(RAMP.sand, 0.15 + n * 0.45 + ((y - wetRows) / h) * 0.2, x, y);
      g.set(x, y, c);
    }
  const r = rng(77);
  for (let i = 0; i < Math.round(w / 40); i++) {
    const x = Math.floor(r() * (w - 4)) + 2;
    const y = wetRows + 4 + Math.floor(r() * Math.max(1, h - wetRows - 8));
    g.set(x, y, RAMP.wall[0]);
    g.set(x + 1, y, RAMP.roofC[0]);
    g.set(x, y + 1, RAMP.sand[4]);
  }
  return g;
}

/** 돗자리 가장자리 (화면 아래 띠 — 줄무늬 천과 술). v: 0 하늘 · 1 노랑 · 2 분홍 */
export function matEdge(w: number, v: number): Grid {
  const h = 18;
  const g = new Grid(w, h);
  const ramp = v === 0 ? RAMP.towel : v === 1 ? RAMP.umbY : RAMP.umbC;
  for (let y = 3; y < h; y++)
    for (let x = 0; x < w; x++) {
      const stripe = Math.floor(x / 14) % 2 === 0;
      g.set(x, y, stripe ? ramp[y < 6 ? 0 : 1] : RAMP.wall[y < 6 ? 0 : 1]);
    }
  for (let x = 1; x < w; x += 3) {
    g.set(x, 2, ramp[2]);
    g.set(x, 1, ramp[2]);
  }
  g.hline(0, w - 1, 3, ramp[2]);
  return g;
}

/** 파라솔 갓 가장자리 (화면 위 띠 — 두 색 쪽, 아래 끝 물결 술) */
export function parasolFringe(w: number, v: number): Grid {
  const h = 22;
  const g = new Grid(w, h);
  const ramp = v === 0 ? RAMP.umbC : RAMP.umbY;
  for (let x = 0; x < w; x++) {
    const seg = Math.floor(x / 28) % 2 === 0;
    const scal = 16 + Math.round(3 * Math.abs(Math.sin(((x % 28) / 28) * Math.PI)));
    for (let y = 0; y < scal; y++) g.set(x, y, seg ? pick(ramp, 0.2 + (y / scal) * 0.5, x, y) : pick(RAMP.wall, 0.15 + (y / scal) * 0.5, x, y));
    if (x % 3 === 0) g.set(x, scal, ramp[2]);
  }
  soft(g);
  return g;
}

/** 선베드 발치 (화면 아래 가운데 — 흰 판자와 수건 끝) */
export function loungerFoot(): Grid {
  const w = 96;
  const h = 26;
  const g = new Grid(w, h);
  for (let y = 4; y < h; y++) {
    const inset = Math.round((h - y) * 0.9);
    for (let x = 6 + inset; x < w - 6 - inset; x++) g.set(x, y, (y - 4) % 5 === 4 ? RAMP.wall[2] : RAMP.wall[0]);
  }
  // 수건 끝 (하늘빛, 술)
  for (let y = 4; y < 12; y++) for (let x = 30; x < 66; x++) g.set(x, y, y < 6 ? RAMP.towel[0] : RAMP.towel[1]);
  for (let x = 31; x < 66; x += 2) g.set(x, 12, RAMP.towel[2]);
  soft(g);
  return g;
}

/** 11/16 뒤에서 본 선베드 (벤치에서 앞줄을 볼 때 — 비스듬히 선 흰 등받이와 걸친 수건, 짧은 다리). 26 × 24, 원점 가운데 아래 */
export function loungerBackArt(): Grid {
  const g = new Grid(26, 24);
  for (let y = 2; y < 18; y++) {
    const inset = Math.round((18 - y) * 0.18);
    for (let x = 3 + inset; x < 23 - inset; x++) g.set(x, y, (y - 2) % 4 === 3 ? RAMP.wall[2] : RAMP.wall[0]);
  }
  // 걸친 수건 (등받이 위)
  for (let y = 2; y < 7; y++) for (let x = 7; x < 19; x++) g.set(x, y, y === 2 ? RAMP.towel[0] : RAMP.towel[1]);
  for (let x = 8; x < 19; x += 2) g.set(x, 7, RAMP.towel[2]);
  // 다리
  g.rect(5, 18, 2, 4, RAMP.wood[4]);
  g.rect(19, 18, 2, 4, RAMP.wood[4]);
  soft(g);
  return g;
}
/** 누운 사람 머리 (등받이 위로 살짝) 8 × 6 */
export function lyingHead(): Grid {
  const g = new Grid(8, 6);
  g.ellipse(4, 3, 3.2, 2.6, 0x3a3440);
  g.set(3, 1, 0x5a5464);
  return g;
}

/** 11/16 등대 꼭대기 난간 (화면 아래 띠 — 쇠 난간 기둥과 가로대, 바닥 철판) */
export function galleryRail(w: number): Grid {
  const h = 30;
  const g = new Grid(w, h);
  for (let y = 22; y < h; y++) for (let x = 0; x < w; x++) g.set(x, y, pick(RAMP.rock, 0.45 + (y - 22) * 0.06, x, y));
  for (const y of [6, 14]) for (let x = 0; x < w; x++) g.set(x, y, x % 2 ? RAMP.wall[1] : RAMP.wall[2]);
  for (let x = 4; x < w; x += 22) for (let y = 4; y < 23; y++) g.set(x, y, RAMP.wall[0]);
  soft(g);
  return g;
}
/** 11/16 고래 물줄기 (흰 물방울이 위로 퍼져요) 24 × 20 */
export function whaleSpout(): Grid {
  const g = new Grid(24, 20);
  const r = rng(17);
  for (let i = 0; i < 46; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.4;
    const d = r() * 16;
    g.set(Math.round(12 + Math.cos(a) * d * 0.7), Math.round(18 + Math.sin(a) * d), 0xffffff, 150 + Math.floor(r() * 105));
  }
  g.ellipse(12, 18, 5, 1.3, 0x3a4a6a, 200);
  return g;
}

/** 선착장 끝 데크 (화면 아래 띠 — 가로 판자, 끝 테, 못) */
export function deckBand(w: number): Grid {
  const h = 26;
  const g = new Grid(w, h);
  for (let y = 4; y < h; y++)
    for (let x = 0; x < w; x++) {
      const board = Math.floor((y - 4) / 5);
      const seam = (y - 4) % 5 === 4;
      const n = fbm(x / 30 + board * 7, y / 3);
      g.set(x, y, seam ? RAMP.wood[4] : pick(RAMP.wood, 0.1 + n * 0.5 + board * 0.05, x, y));
    }
  // 앞 끝 테 (데크 끝 각목)
  for (let x = 0; x < w; x++) {
    g.set(x, 4, RAMP.wood[0]);
    g.set(x, 5, RAMP.wood[1]);
  }
  for (let x = 10; x < w; x += 46) {
    g.set(x, 7, RAMP.trunk[2]);
    g.set(x, 12, RAMP.trunk[2]);
  }
  soft(g);
  return g;
}

/** 등대 기둥 (화면 오른쪽에 크게 — 흰 몸통에 분홍 띠, 왼쪽 위 빛). 위는 화면 밖으로 잘려요 */
export const LANTERN_H = 22;
export function lighthouseColumn(h: number): Grid {
  const w = 46;
  const g = new Grid(w, h);
  // 꼭대기 등불 방: 둥근 지붕(분홍) · 유리 등불(밝은 노랑) · 난간
  for (let y = 0; y < 8; y++) {
    const half = Math.round(4 + y * 1.6);
    for (let x = 23 - half; x < 23 + half; x++) g.set(x, y, pick(RAMP.roofC, 0.2 + (x - (23 - half)) / (half * 2) * 0.6, x, y));
  }
  for (let y = 8; y < 17; y++) for (let x = 12; x < 34; x++) g.set(x, y, x === 17 || x === 28 ? RAMP.wall[2] : x < 20 ? 0xfff8dc : 0xffe9a8);
  g.rect(6, 17, 34, 2, RAMP.rock[3]);
  for (let x = 7; x < 39; x += 3) g.set(x, 16, RAMP.rock[2]);
  g.rect(6, 19, 34, 3, RAMP.wall[2]);
  for (let y = LANTERN_H; y < h; y++)
    for (let x = 2; x < w - 2; x++) {
      const lx = (x - 2) / (w - 5);
      const band = Math.floor((y + 6) / 26) % 2 === 1;
      const ramp = band ? RAMP.roofC : RAMP.wall;
      g.set(x, y, pick(ramp, 0.1 + lx * 0.75, x, y));
    }
  // 작은 창 둘 · 문 위 테
  for (const wy of [Math.round(h * 0.3), Math.round(h * 0.62)]) {
    g.rect(18, wy, 8, 10, RAMP.glass[2]);
    g.rect(18, wy, 3, 10, RAMP.glass[0]);
  }
  soft(g);
  return g;
}

/** 등대 불빛 (밤 — 가산, 가운데 밝고 끝으로 옅어지는 쐐기). 160 × 40, 원점 왼쪽 가운데 */
export function beamWedge(): Grid {
  const w = 160;
  const h = 40;
  const g = new Grid(w, h);
  for (let x = 0; x < w; x++) {
    const half = 2 + (x / w) * (h / 2 - 2);
    for (let y = 0; y < h; y++) {
      const d = Math.abs(y + 0.5 - h / 2) / half;
      if (d > 1) continue;
      const a = Math.round(150 * (1 - d) * (1 - x / w) ** 0.6);
      if (a > 4) g.set(x, y, 0xfff4cc, a);
    }
  }
  return g;
}

/** 부드러운 구름 (테 없음 — 아래가 살짝 그늘). v 0..2 */
export function softCloud(v: number): Grid {
  const w = [56, 72, 40][v % 3];
  const h = Math.round(w * 0.36);
  const g = new Grid(w, h);
  const r = rng(300 + v);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) blobs.push([w * (0.18 + 0.64 * r()), h * (0.45 + 0.2 * r()), h * (0.28 + 0.2 * r())]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let inside = false;
      for (const [bx, by, br] of blobs) if (Math.hypot((x - bx) / 1.6, y - by) < br) inside = true;
      if (!inside || y > h - 2) continue;
      const shade = y > h * 0.62;
      g.set(x, y, shade ? 0xe6ecf4 : 0xffffff, shade ? 200 : 235);
    }
  return g;
}

/** 갈매기 (흰 몸, 회색 날개 끝) 2장 — 날개 위·아래. 9 × 5 한 장 */
export function gullSheet(): Grid {
  const g = new Grid(18, 5);
  const body = 0xffffff;
  const tip = 0x7a8090;
  // 날개 위
  for (const [x, y] of [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 1],
    [7, 0],
    [8, 1],
  ])
    g.set(x, y, x === 0 || x === 8 ? tip : body);
  g.set(4, 3, body);
  // 날개 아래
  for (const [x, y] of [
    [0, 3],
    [1, 3],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [7, 3],
    [8, 3],
  ])
    g.set(9 + x, y, x === 0 || x === 8 ? tip : body);
  g.set(13, 3, body);
  return g;
}

/** 멀리 지나가는 배 (작은 흰 돛단배) 16 × 9 */
export function farBoat(): Grid {
  const g = new Grid(16, 9);
  for (let y = 0; y < 6; y++) for (let x = 7 - Math.round(y * 0.7); x <= 7; x++) g.set(x, y, RAMP.wall[y > 3 ? 1 : 0]);
  g.vline(8, 0, 6, RAMP.wood[4]);
  for (let x = 2; x < 14; x++) g.set(x, 7, RAMP.hull[1]);
  for (let x = 3; x < 13; x++) g.set(x, 8, RAMP.hull[2]);
  return g;
}

/** 흰 점 (채우기·물보라·달빛 점) 2 × 2 */
export function whitePx(): Grid {
  const g = new Grid(2, 2);
  g.rect(0, 0, 2, 2, 0xffffff);
  return g;
}

/** 물가 물보라 알갱이 (테트라포드에 부서지는 물) 14 × 12 */
export function splashPuff(): Grid {
  const g = new Grid(14, 12);
  const r = rng(91);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI;
    const d = r() * 6;
    g.set(Math.round(7 + Math.cos(a) * d), Math.round(10 - Math.sin(a) * d * 1.4), 0xffffff, 170 + Math.floor(r() * 85));
  }
  g.ellipse(7, 10, 4, 1.4, 0xf2fbff, 200);
  return g;
}

/** 해 (테 없음, 둘레 빛) · 달 (초승달, 옅은 빛) */
export function sunDisc(r = 8): Grid {
  const s = r * 2 + 8;
  const g = new Grid(s, s);
  const c = s / 2;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d <= r) g.set(x, y, d < r * 0.7 ? 0xfffbe8 : 0xffeec2);
      else if (d <= r + 3.5) g.set(x, y, 0xffe6b0, Math.round(110 * (1 - (d - r) / 3.5)));
    }
  return g;
}
export function moonDisc(): Grid {
  const g = new Grid(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const cut = Math.hypot(x - 10.5, y - 5.5);
      if (d <= 6 && cut > 5) g.set(x, y, d < 4 ? 0xfaf4dc : 0xece4c4);
      else if (d <= 7.5 && cut > 5) g.set(x, y, 0xf4ecd0, 60);
    }
  return g;
}
/** 별 바탕 (투명에 작은 점) 128 × 64 */
export function starTile(): Grid {
  const g = new Grid(128, 64);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hashU(i, 1, 501) * 128);
    const y = Math.floor(hashU(i, 2, 501) * 64);
    g.set(x, y, 0xffffff, 120 + Math.floor(hashU(i, 3, 501) * 135));
  }
  return g;
}

// ── 11/16 r15 해먹에 누워 보는 바다 (사용자: 선베드 장면 말고 해먹 장면) ──
/** 해먹 천 테두리: 아래는 넓게 처진 천(빨강·크림 줄무늬 — 바닷가 해먹 색), 양옆은 위로 올라가며 좁아져요. 가운데 위는 비어 바다·하늘이 보여요 */
export function hammockFrame(w: number, h: number): Grid {
  const g = new Grid(w, h);
  const A = 0xc85a46;
  const B = 0xe8d6b0;
  for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w - 0.5; // -0.5 ~ 0.5
    // 아래 천 윗선: 가운데가 가장 낮고(처짐), 양옆으로 갈수록 높이 올라가요
    const top = Math.round(h * (0.8 - Math.pow(Math.abs(u) * 2, 2.4) * 0.72));
    for (let y = Math.max(0, top); y < h; y++) {
      const band = Math.floor((x + (y - top) * 0.35) / 14) % 2 === 0;
      const depth = (y - top) / Math.max(1, h - top);
      let c = band ? A : B;
      // 천 접힘: 윗선 바로 아래는 밝게, 아래로 갈수록 그늘
      if (y - top < 2) c = band ? 0xe07a64 : 0xf8ecd4;
      else c = mix(c, 0x3a2620, Math.min(0.35, depth * 0.4));
      g.set(x, y, c);
    }
    // 윗선 테 (부드러운 갈색)
    if (top >= 0 && top < h) g.set(x, top, 0x7a5a48);
  }
  return g;
}
/** 위 양쪽 구석의 야자 잎 (해먹을 건 두 야자수 — 아래로 늘어진 잎 몇 장). right = 오른쪽 구석용 (뒤집어 그려요) */
export function palmFronds(w: number, h: number): Grid {
  const g = new Grid(w, h);
  const leaf = [0x4f8a5e, 0x63a06c, 0x7cb878];
  const r = rng(808);
  for (let k = 0; k < 6; k++) {
    // 왼쪽 위 구석에서 오른쪽 아래로 휘어 늘어지는 잎
    const len = w * (0.45 + r() * 0.5);
    const droop = h * (0.25 + r() * 0.5);
    const y0 = r() * h * 0.2;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const x = Math.round(i);
      const y = Math.round(y0 + droop * t * t);
      const c = leaf[(k + (i >> 3)) % 3];
      for (let d = 0; d < 3; d++) g.set(x, y + d, c);
      // 잎맥 사이 갈래 (아래로 짧게)
      if (i % 4 === 0) for (let j = 1; j < 5 + (1 - t) * 6; j++) g.set(x + (j >> 1), y + 2 + j, leaf[(k + j) % 3]);
    }
  }
  return g;
}
