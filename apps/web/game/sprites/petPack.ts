import type { FxSpec } from "./cosmeticFx";
import { MOUNT_FRAMES, MOUNT_H, MOUNT_W, mountArtDef, mountFrames, mountSheet } from "./mountArt";
import { Grid, type Color } from "./pixel";

// 11/17 동물원 새 펫 묶음 (데리고 다니는 펫 8 · 타는 펫 2). 그림 규칙은 cosmeticFx 펫과 같다: 옆모습은 오른쪽을 본다(왼쪽은 좌우 반전), 발바닥이 맨 아랫줄.
// 데리고 다니는 펫 시트: 0·1 걷기 · 2·3 멈춤(앉기·눈 깜빡) · 4~ 가끔 하는 귀여운 동작 (PetSpec.pose).
// 타는 펫(sprites/mountArt.ts)은 기본 10장 뒤에 10·11 멈춤 · 12·13 동작을 덧붙였다.
// 그림(PET_PACK_ART)은 cosmeticFx FX_ART에, 규칙(PET_PACK_FX)은 COSMETIC_FX에 섞여 들어간다.

const EYE = 0x2a1e18;
const BLUSH = 0xf6a0b0;

function frames(w: number, h: number, n: number, draw: (g: Grid, f: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

/** 감은 눈 (작은 ‿ 두 칸) */
function shut(g: Grid, x: number, y: number, c: Color): void {
  g.set(x - 1, y, c);
  g.set(x, y + 1, c);
}

// ── 밤송이 고슴도치: 갈색 가시 등 · 크림 얼굴 · 등에 단풍잎 하나. 동작 = 동그랗게 말아 데굴데굴 ──
const HOG = { spine: 0x8a6440, spineLo: 0x5e4028, tip: 0xd8b888, face: 0xf8e6c8, faceLo: 0xe8caa0, nose: 0x4a2a2a, foot: 0xd89a80, leaf: 0xe8602a, leafLo: 0xb8401a, line: 0x3e2614 };
function hogBody(g: Grid, f: number, sit: boolean): void {
  const c = HOG;
  const dy = sit ? 1 : 0;
  g.ellipse(5.2, 6 + dy, 4.6, 3, c.spine);
  // 가시 결 (위쪽 톱니 + 끝은 밝게)
  for (const [x, y] of [[1, 4], [3, 2], [5, 2], [7, 2], [2, 3], [4, 2], [6, 2], [8, 3]] as const) g.set(x, y + dy, (x + f) % 2 ? c.tip : c.spine);
  for (const [x, y] of [[2, 5], [4, 4], [6, 4], [3, 7], [5, 6], [7, 6]] as const) g.set(x, y + dy, c.spineLo);
  // 얼굴·주둥이
  g.ellipse(9, 6.6 + dy, 2.3, 2, c.face);
  g.set(11, 6 + dy, c.face);
  g.set(11, 7 + dy, c.faceLo);
  g.set(12, 6 + dy, c.nose);
  g.recolor((x, y) => y >= 8 + dy && x >= 7, c.faceLo);
  g.set(10, 7 + dy, BLUSH);
  // 단풍잎
  g.set(4, 2 + dy, c.leaf);
  g.set(5, 1 + dy, c.leaf);
  g.set(3, 1 + dy, c.leafLo);
}
const hedgehog = frames(13, 11, 6, (g, f) => {
  const c = HOG;
  if (f >= 4) {
    // 동그랗게 말린 가시 공 (4 = 말기, 5 = 반 바퀴 굴러 결이 바뀐다)
    g.ellipse(6, 6.4, 4.4, 4, c.spine);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (f === 5 ? 0.3 : 0);
      g.set(Math.round(6 + Math.cos(a) * 4.6), Math.round(6.4 + Math.sin(a) * 4.2), i % 2 ? c.tip : c.spineLo);
    }
    g.ellipse(f === 5 ? 5 : 7.4, f === 5 ? 7.6 : 7.4, 1.6, 1.2, c.face);
    g.set(f === 5 ? 5 : 8, f === 5 ? 8 : 7, c.nose);
    g.set(f === 5 ? 8 : 4, f === 5 ? 3 : 3, c.leaf);
    g.set(f === 5 ? 9 : 5, f === 5 ? 3 : 2, c.leafLo);
    g.outline(c.line, false, 220);
    return;
  }
  const sit = f >= 2;
  hogBody(g, f, sit);
  if (f === 3) shut(g, 9, 5 + 1, EYE);
  else g.set(9, sit ? 6 : 5, EYE);
  // 짧은 발 (걸을 때 번갈아, 앉으면 앞발만)
  if (sit) {
    g.set(8, 10, c.foot);
    g.set(9, 10, c.foot);
  } else for (const x of f ? [3, 8] : [4, 9]) g.set(x, 9, c.foot);
  g.outline(c.line, false, 220);
});

// ── 아기 오리 삼총사: 노란 솜털 새끼 오리 셋이 줄지어 종종. 동작 = 앞에서부터 차례로 폴짝 ──
const DUCKY = { down: 0xffe066, lo: 0xf0c040, hi: 0xfff6b0, beak: 0xf89a3a, foot: 0xf08a2a, line: 0x8a5a10 };
function duckling(g: Grid, x: number, base: number, o: { hop?: number; sit?: boolean; blink?: boolean; flap?: boolean; step?: number }): void {
  const c = DUCKY;
  const y = base - (o.hop ?? 0) + (o.sit ? 1 : 0);
  g.ellipse(x + 2, y - 2.2, 2.3, 1.7, c.down);
  g.recolor((px, py) => py >= y - 1 && px >= x && px <= x + 4, c.lo);
  g.ellipse(x + 3.4, y - 4.6, 1.6, 1.5, c.down);
  g.set(x + 3, y - 6, c.hi);
  g.set(x + 5, y - 4, c.beak);
  if (o.blink) g.set(x + 4, y - 5, c.lo);
  else g.set(x + 4, y - 5, EYE);
  g.set(x, y - 3, c.lo); // 꽁지
  if (o.flap) {
    g.set(x + 1, y - 4, c.hi);
    g.set(x, y - 5, c.hi);
  } else g.set(x + 1, y - 2, c.lo);
  if (!o.sit) {
    const s = o.step ?? 0;
    g.set(x + 1 + s, y, c.foot);
    g.set(x + 3 - s, y, c.foot);
  }
}
const ducklings = frames(20, 10, 7, (g, f) => {
  // 앞(오른쪽)에서부터 셋. 걸을 때는 번갈아 통통, 멈추면 앉고, 동작은 차례로 폴짝
  const xs = [13, 7, 1];
  xs.forEach((x, i) => {
    if (f <= 1) duckling(g, x, 9, { hop: (i + f) % 2, step: (i + f) % 2 });
    else if (f <= 3) duckling(g, x, 9, { sit: true, blink: f === 3 && i === 1 });
    else duckling(g, x, 9, { hop: f - 4 === i ? 2 : 0, flap: f - 4 === i, step: 0 });
  });
  g.outline(DUCKY.line, false, 210);
});

// ── 솜털 아기 갈매기: 회색 솜털 · 흰 배 · 노란 부리 끝 빨간 점. 동작 = 날갯짓하며 폴짝 (날아 보려고) ──
const GULL = { down: 0xd4d8de, lo: 0xaab0ba, belly: 0xf8f8f6, wing: 0x9aa0ac, tip: 0x4a4e5a, beak: 0xf8d048, dot: 0xe0403a, foot: 0xf0a090, line: 0x3e4250 };
const gull = frames(11, 12, 7, (g, f) => {
  const c = GULL;
  const sit = f === 2 || f === 3;
  const flap = f >= 4;
  const dy = sit ? 1 : 0;
  const lean = f === 1 ? 1 : 0;
  g.ellipse(5, 7.6 + dy, 3.6, 3, c.down);
  g.ellipse(5.8, 8.4 + dy, 2.4, 1.9, c.belly);
  g.ellipse(6.4 + lean * 0.3, 4.2 + dy, 2.4, 2.2, c.down);
  g.set(6, 2 + dy, c.belly); // 솜털 한 가닥
  g.set(5, 1 + dy, c.down);
  // 부리 (끝에 빨간 점)
  g.set(9 + lean, 4 + dy, c.beak);
  g.set(10, 4 + dy, c.beak);
  g.set(10, 5 + dy, c.dot);
  if (f === 3) shut(g, 7 + lean, 3 + dy, EYE);
  else g.set(7 + lean, 4 + dy, EYE);
  g.set(8 + lean, 5 + dy, BLUSH);
  // 날개 (동작이면 위아래로 퍼덕)
  if (flap) {
    const up = f % 2 === 0;
    g.set(3, up ? 4 : 8, c.wing);
    g.set(2, up ? 3 : 9, c.wing);
    g.set(1, up ? 2 : 9, c.tip);
    g.set(4, up ? 5 : 8, c.wing);
  } else {
    g.set(3, 7 + dy, c.wing);
    g.set(2, 8 + dy, c.wing);
    g.set(1, 8 + dy, c.tip);
  }
  // 발 (걸을 때 번갈아)
  if (!sit) {
    const s = f === 1 ? 1 : 0;
    g.set(4 + s, 11, c.foot);
    g.set(7 - s, 11, c.foot);
  }
  g.outline(c.line, false, 200);
});

// ── 몽글 해파리: 분홍빛 반투명 우산 · 점 눈 · 볼터치, 촉수가 살랑. 공중에 둥둥 (물 위에서도). 동작 = 꾹 오므렸다 쭉 펴며 반짝 ──
const JELLY = { bell: 0xf8b8e0, hi: 0xffe8f6, lo: 0xd890c8, arm: 0xf0a8d8, armLo: 0xc888c0, line: 0x8a4a8a };
const jelly = frames(11, 13, 7, (g, f) => {
  const c = JELLY;
  // 우산 크기 (걷기·멈춤은 숨 쉬듯, 동작 4 = 꾹 오므림 · 5·6 = 쭉 폄)
  const [rx, ry, top] = f === 4 ? [4.6, 2.6, 3.4] : f >= 5 ? [3.8, 3.6, 1.4] : f % 2 ? [4.4, 3.1, 2.4] : [4, 3.4, 2];
  g.ellipse(5.5, top + ry, rx, ry, c.bell, 215);
  g.recolor((x, y) => y > top + ry, c.lo);
  g.set(3, Math.round(top + 1), c.hi, 235);
  g.set(4, Math.round(top + 0.5), c.hi, 235);
  const ey = Math.round(top + ry);
  if (f === 3) {
    shut(g, 4, ey - 1, 0x5a2a5a);
    shut(g, 7, ey - 1, 0x5a2a5a);
  } else {
    g.set(4, ey - 1, 0x5a2a5a);
    g.set(7, ey - 1, 0x5a2a5a);
  }
  g.set(3, ey, BLUSH);
  g.set(8, ey, BLUSH);
  // 촉수 넷 (프레임마다 엇갈려 물결)
  const y0 = Math.round(top + ry * 2);
  for (const [i, x] of [[0, 2], [1, 4], [2, 6], [3, 8]] as const) {
    const len = f === 4 ? 3 : f >= 5 ? 5 : 4;
    for (let k = 0; k < len; k++) {
      const wob = Math.round(Math.sin((k + i + f) * 1.3) * 0.7);
      g.set(x + wob, y0 + k, k === len - 1 ? c.armLo : c.arm, 200);
    }
  }
  g.outline(c.line, false, 120);
  // 동작 끝: 반짝
  if (f === 6) {
    g.set(0, 1, 0xffffff, 230);
    g.set(10, 3, 0xffffff, 230);
    g.set(9, 0, 0xfff0a0, 200);
  }
});

// ── 꼬마 눈사람: 눈덩이 둘 · 숯 눈 · 당근 코 · 빨간 목도리 · 나뭇가지 팔. 통통 튀며 따라온다. 동작 = 만세하고 눈송이 반짝 ──
const SNOW = { snow: 0xfbfdff, lo: 0xd8e4f0, coal: 0x2a2a34, carrot: 0xf2882a, scarf: 0xe0404a, scarfLo: 0xa82a34, twig: 0x7a5232, flake: 0xc8ecff, line: 0x5a6a80 };
const snowman = frames(13, 14, 7, (g, f) => {
  const c = SNOW;
  const sit = f === 2 || f === 3;
  const cheer = f >= 4;
  const tilt = f === 1 ? 1 : 0;
  const x0 = 6;
  // 몸 (아래 큰 눈덩이) · 머리
  g.ellipse(x0 + 0.5, 10.4, 4, 3.3, c.snow);
  g.recolor((x, y) => y >= 12, c.lo);
  g.ellipse(x0 + 0.5 + tilt * 0.6, 5.2 + (sit ? 0.5 : 0), 2.9, 2.7, c.snow);
  const hy = sit ? 5 : 4;
  // 눈·코·볼터치
  if (f === 3) {
    shut(g, x0 + 1 + tilt, hy, c.coal);
  } else {
    g.set(x0 + tilt, hy, c.coal);
    g.set(x0 + 2 + tilt, hy, c.coal);
  }
  g.set(x0 + 3 + tilt, hy + 1, c.carrot);
  g.set(x0 + 4 + tilt, hy + 1, c.carrot);
  g.set(x0 - 1 + tilt, hy + 1, BLUSH);
  // 단추
  g.set(x0 + 1, 9, c.coal);
  g.set(x0 + 1, 11, c.coal);
  // 목도리 (끝자락이 뒤로 펄럭)
  g.hline(x0 - 2, x0 + 3, 7 + (sit ? 1 : 0), c.scarf);
  g.set(x0 - 3, 8 + (sit ? 1 : 0), c.scarf);
  g.set(x0 - 4 + (f % 2), 9 + (sit ? 1 : 0), c.scarfLo);
  // 나뭇가지 팔 (만세면 위로)
  if (cheer) {
    for (const [x, y] of [[x0 - 3, 7], [x0 - 4, 6], [x0 - 5, 5], [x0 + 4, 7], [x0 + 5, 6], [x0 + 6, 5]] as const) g.set(x, y - (f === 5 ? 1 : 0), c.twig);
  } else {
    for (const [x, y] of [[x0 - 4, 9], [x0 - 5, 9], [x0 + 4, 9], [x0 + 5, 8]] as const) g.set(x, y + (sit ? 1 : 0), c.twig);
  }
  g.outline(c.line, false, 200);
  if (cheer) {
    // 반짝이는 눈송이
    for (const [x, y] of f === 4 ? [[1, 1], [11, 2]] : f === 5 ? [[0, 3], [12, 0], [3, 0]] : [[2, 2], [10, 1]]) g.set(x, y, c.flake, 235);
  }
});

// ── 반딧불이 무리: 연두빛 꽁무니가 반짝이는 반딧불이 여덟. 공중에 둥둥. 동작 = 모여서 하트 ──
const FLY = { glow: 0xe4ff7a, core: 0xfdffd8, halo: 0xc8ff5a, body: 0x3a3428, wing: 0xf0f4ff };
const SWARM: readonly (readonly (readonly [number, number])[])[] = [
  // 걷기 0·1: 뒤로 길게 흩어져 따라온다
  [[1, 6], [3, 3], [5, 8], [7, 4], [8, 9], [10, 2], [11, 6], [4, 10]],
  [[0, 5], [3, 4], [5, 7], [7, 2], [9, 8], [10, 4], [12, 6], [2, 9]],
  // 멈춤 2·3: 느슨한 동그라미
  [[3, 2], [7, 1], [10, 3], [11, 7], [8, 10], [4, 9], [1, 6], [6, 5]],
  [[4, 1], [8, 2], [11, 4], [10, 8], [7, 9], [3, 8], [1, 4], [6, 6]],
  // 동작 4: 모이는 중 · 5·6: 하트
  [[3, 3], [8, 3], [6, 5], [2, 6], [10, 6], [4, 8], [8, 8], [6, 9]],
  [[3, 2], [9, 2], [6, 4], [1, 5], [11, 5], [3, 8], [9, 8], [6, 10]],
  [[3, 2], [9, 2], [6, 4], [1, 5], [11, 5], [3, 8], [9, 8], [6, 10]],
];
/** 하트 테두리 (동작 마지막에 은은하게 이어진다) */
const HEART: readonly (readonly [number, number])[] = [[2, 2], [4, 2], [5, 3], [7, 3], [8, 2], [10, 2], [11, 3], [11, 4], [10, 6], [10, 7], [8, 9], [7, 10], [5, 10], [4, 9], [2, 7], [2, 6], [1, 4], [1, 3]];
const fireflies = frames(13, 12, 7, (g, f) => {
  if (f >= 5) for (const [x, y] of HEART) g.set(x, y, FLY.halo, f === 6 ? 140 : 80);
  SWARM[f].forEach(([x, y], i) => {
    const bright = f >= 5 || (i + f) % 3 !== 0;
    g.ellipse(x + 0.5, y + 0.5, 1.5, 1.5, FLY.halo, bright ? 90 : 45);
    g.set(x, y, bright ? FLY.core : FLY.glow, bright ? 255 : 210);
    g.set(x - 1, y - 1, FLY.body, 220);
    if ((i + f) % 2) g.set(x, y - 1, FLY.wing, 150);
  });
});

// ── 조약돌 수달: 갈색 털 · 크림 얼굴 · 동그란 귀 · 수염. 앉으면 조약돌을 안는다. 동작 = 벌러덩 누워 배 위에 조약돌 콩콩 ──
const OTTER = { fur: 0x9a6a44, lo: 0x74482a, face: 0xf2dcb8, nose: 0x2a1a14, whisker: 0xf8f0e0, stone: 0x9ab0c0, stoneHi: 0xd8e6ee, line: 0x3a2214 };
const otter = frames(14, 11, 6, (g, f) => {
  const c = OTTER;
  if (f >= 4) {
    // 벌러덩 (배가 위, 머리는 오른쪽) · 조약돌을 배에 콩콩
    g.ellipse(6.5, 8, 5.4, 2.4, c.fur);
    g.ellipse(6.5, 7.2, 3.8, 1.4, c.face);
    g.ellipse(11.4, 7, 2.2, 2, c.fur);
    g.ellipse(11.8, 6.6, 1.5, 1.2, c.face);
    g.set(13, 6, c.nose);
    shut(g, 11, 5, EYE);
    g.set(10, 4, c.lo); // 귀
    g.hline(1, 2, 7, c.lo); // 꼬리
    g.set(0, 6, c.lo);
    // 앞발로 든 조약돌 (5는 배에 닿는다)
    const sy = f === 5 ? 5 : 3;
    g.set(7, sy, c.stone);
    g.set(8, sy, c.stone);
    g.set(7, sy - 1, c.stoneHi);
    g.set(6, sy + 1, c.lo);
    g.set(9, sy + 1, c.lo);
    for (const x of [4, 9]) g.set(x, 6, c.lo); // 뒷발이 하늘로
    g.outline(c.line, false, 220);
    if (f === 5) g.set(8, 2, 0xffffff, 220);
    return;
  }
  const sit = f >= 2;
  if (sit) {
    // 뒷발로 앉아 조약돌을 안고 있다
    g.ellipse(6, 7.4, 3, 3.4, c.fur);
    g.ellipse(6.6, 8, 2, 2.4, c.face);
    g.ellipse(7, 3.2, 2.4, 2.2, c.fur);
    g.ellipse(7.8, 3.8, 1.5, 1.1, c.face);
    g.set(9, 3, c.nose);
    g.set(5, 1, c.lo);
    if (f === 3) shut(g, 7, 2, EYE);
    else g.set(7, 2, EYE);
    g.set(8, 4, BLUSH);
    g.set(10, 4, c.whisker);
    g.set(7, 7, c.stone);
    g.set(8, 7, c.stone);
    g.set(7, 6, c.stoneHi);
    g.set(6, 7, c.lo);
    g.set(9, 7, c.lo);
    g.hline(1, 3, 9, c.lo); // 꼬리
    g.set(0, 8, c.lo);
    g.hline(5, 6, 10, c.lo);
    g.hline(8, 9, 10, c.lo);
  } else {
    // 길쭉한 몸 (걸을 때 등이 출렁)
    const arch = f ? 0.4 : 0;
    g.ellipse(6.4, 6.8 - arch, 4.8, 2.2, c.fur);
    g.ellipse(7, 7.8 - arch, 3, 1, c.face);
    g.ellipse(11.2, 5.2, 2.2, 2, c.fur);
    g.ellipse(12, 5.8, 1.5, 1.1, c.face);
    g.set(13, 5, c.nose);
    g.set(10, 3, c.lo);
    g.set(11, 4, EYE);
    g.set(12, 7, c.whisker);
    // 굵은 꼬리
    g.hline(0, 2, f ? 7 : 6, c.lo);
    g.set(1, f ? 6 : 7, c.fur);
    for (const x of f ? [4, 9] : [3, 10]) g.vline(x, 9, 10, c.lo);
  }
  g.outline(c.line, false, 220);
});

// ── 꼬마 레서판다: 주홍 털 · 흰 눈썹·볼 · 줄무늬 꼬리. 동작 = 뒷발로 벌떡 일어나 두 팔 번쩍 (위협이지만 귀엽다) ──
const PANDA = { fur: 0xd0602a, hi: 0xe88a4a, dark: 0x3a1e14, white: 0xfbf4ea, band: 0x8a3a1a, nose: 0x1e1210, line: 0x3a1408 };
function pandaHead(g: Grid, cx: number, cy: number, f: number, blink: boolean): void {
  const c = PANDA;
  g.ellipse(cx, cy, 2.6, 2.3, c.fur);
  g.set(cx - 2, cy - 2, c.white); // 귀 (속은 하양)
  g.set(cx + 1, cy - 3, c.white);
  g.set(cx - 2, cy - 3, c.fur);
  g.set(cx + 1, cy - 2, c.fur);
  g.ellipse(cx + 1.6, cy + 0.9, 1.4, 1, c.white); // 주둥이·볼
  g.set(cx + 3, cy, c.nose);
  g.set(cx, cy - 1, c.white); // 흰 눈썹
  if (blink) shut(g, cx + 1, cy - 1 + 1, EYE);
  else g.set(cx + 1, cy, EYE);
  g.set(cx - 1, cy + 1, f % 2 ? c.hi : c.white);
}
function pandaTail(g: Grid, pts: readonly (readonly [number, number])[]): void {
  pts.forEach(([x, y], i) => g.set(x, y, i % 2 ? PANDA.band : PANDA.hi));
}
const redPanda = frames(13, 13, 6, (g, f) => {
  const c = PANDA;
  if (f >= 4) {
    // 벌떡 (4 = 반쯤, 5 = 두 팔 번쩍)
    const up = f === 5;
    pandaTail(g, [[2, 12], [3, 11], [3, 10], [2, 9], [1, 10]]);
    g.ellipse(6, up ? 8 : 9, 2.6, up ? 3.6 : 3, c.fur);
    g.recolor((x, y) => y >= (up ? 10 : 11), c.dark);
    g.set(6, up ? 8 : 9, c.hi);
    g.vline(5, 11, 12, c.dark);
    g.vline(7, 11, 12, c.dark);
    pandaHead(g, 6, up ? 3 : 4, f, false);
    // 팔
    if (up) {
      for (const [x, y] of [[3, 5], [2, 4], [9, 5], [10, 4]] as const) g.set(x, y, c.dark);
    } else {
      for (const [x, y] of [[4, 7], [3, 6], [8, 7], [9, 6]] as const) g.set(x, y, c.dark);
    }
    g.outline(c.line, false, 220);
    return;
  }
  const sit = f >= 2;
  if (sit) {
    // 꼬리를 몸에 감고 앉는다
    g.ellipse(5.6, 9.2, 3.2, 2.8, c.fur);
    g.recolor((x, y) => y >= 11 && x >= 4 && x <= 7, c.dark);
    pandaTail(g, [[1, 11], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12], [7, 12]]);
    pandaHead(g, 7, 5, f, f === 3);
    g.vline(8, 10, 11, c.dark);
  } else {
    pandaTail(g, f ? [[0, 6], [1, 6], [2, 7], [3, 7]] : [[0, 8], [1, 7], [2, 7], [3, 7]]);
    g.ellipse(6, 8.4, 3.8, 2.2, c.fur);
    g.recolor((x, y) => y >= 10 && x >= 3 && x <= 8, c.dark);
    g.set(5, 7, c.hi);
    pandaHead(g, 9, 6, f, false);
    for (const x of f ? [4, 7] : [3, 8]) g.vline(x, 10, 12, c.dark);
  }
  g.outline(c.line, false, 220);
});

export const PET_PACK_ART = {
  pkHedgehog: { w: 13, h: 11, frames: 6, build: hedgehog },
  pkDucklings: { w: 20, h: 10, frames: 7, build: ducklings },
  pkGull: { w: 11, h: 12, frames: 7, build: gull },
  pkJelly: { w: 11, h: 13, frames: 7, build: jelly },
  pkSnowman: { w: 13, h: 14, frames: 7, build: snowman },
  pkFireflies: { w: 13, h: 12, frames: 7, build: fireflies },
  pkOtter: { w: 14, h: 11, frames: 6, build: otter },
  pkRedPanda: { w: 13, h: 13, frames: 6, build: redPanda },
  // 타는 펫 (sprites/mountArt.ts — 기본 10장 + 멈춤·동작 4장)
  // 11/26 정수리 솜뭉치·귀 끝이 맨 윗줄에 닿아 잘려 보였다 → 위 1칸 여백 + 테로 닫기 (artPad)
  mountAlpaca: mountArtDef("alpaca", { top: 1 }),
  mountPolar: { w: MOUNT_W, h: MOUNT_H, frames: mountFrames("polar"), build: () => mountSheet("polar") },
  // 12월 루돌프 썰매 (크리스마스 선물상자 전용 — 너비 40, 옆모습 덧그림 한 장 더)
  // 11/26 선물 자루 꼭대기가 맨 윗줄에 닿아 잘려 보였다 → 위 1칸 여백 (옆 물보라는 일부러 끝까지 — 닫지 않는다)
  mountSleigh: mountArtDef("sleigh", { top: 1 }),
} as const;

export type PetPackArtId = keyof typeof PET_PACK_ART;

/** 타는 펫의 멈춤·동작 프레임 (기본 10장 뒤) */
const M_IDLE = [MOUNT_FRAMES, MOUNT_FRAMES, MOUNT_FRAMES, MOUNT_FRAMES + 1] as const;
const M_ACT = [MOUNT_FRAMES + 2, MOUNT_FRAMES + 3, MOUNT_FRAMES + 2, MOUNT_FRAMES + 3, MOUNT_FRAMES + 2] as const;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다). pose = 멈춤 프레임·가끔 하는 동작 */
export const PET_PACK_FX = {
  pet_hog: { kind: "pet", art: "pkHedgehog", hover: 0, fps: 9, idleFps: 1.6, pose: { idle: [2, 2, 2, 3], act: [4, 5, 4, 5, 4, 5, 4], actMs: 150, every: 7000 } },
  pet_ducks: { kind: "pet", art: "pkDucklings", hover: 0, fps: 8, idleFps: 1.4, far: 1.4, pose: { idle: [2, 2, 3, 2], act: [4, 5, 6, 2, 4, 5, 6], actMs: 170, every: 6000 } },
  pet_gull: { kind: "pet", art: "pkGull", hover: 0, fps: 8, idleFps: 1.6, pose: { idle: [2, 2, 2, 3], act: [4, 5, 4, 5, 4, 5], actMs: 120, every: 6500, lift: [0, 2, 3, 3, 2, 1] } },
  pet_jelly: { kind: "pet", art: "pkJelly", hover: 8, fps: 4, idleFps: 1.8, alpha: 0.95, pose: { idle: [0, 1, 0, 1, 2, 3], act: [4, 4, 5, 6, 5], actMs: 200, every: 6000, lift: [0, 0, 3, 4, 2] } },
  pet_snowy: { kind: "pet", art: "pkSnowman", hover: 0, fps: 6, idleFps: 1.4, squash: true, pose: { idle: [2, 2, 2, 3], act: [4, 5, 6, 5, 4], actMs: 220, every: 7000, lift: [0, 2, 3, 2, 0] } },
  pet_fly: { kind: "pet", art: "pkFireflies", hover: 9, fps: 5, idleFps: 2.5, pose: { idle: [2, 3], act: [4, 5, 6, 5, 6, 5, 6], actMs: 260, every: 8000 } },
  pet_otter: { kind: "pet", art: "pkOtter", hover: 0, fps: 7, idleFps: 1.5, pose: { idle: [2, 2, 2, 3], act: [4, 5, 4, 5, 4, 5, 4], actMs: 220, every: 7500 } },
  pet_panda: { kind: "pet", art: "pkRedPanda", hover: 0, fps: 8, idleFps: 1.5, pose: { idle: [2, 2, 2, 3], act: [4, 5, 5, 5, 4], actMs: 240, every: 7000 } },
  pet_paca: { kind: "pet", art: "mountAlpaca", hover: 0, fps: 6, idleFps: 1.5, mount: "alpaca", far: 1.7, pose: { idle: M_IDLE, act: M_ACT, actMs: 260, every: 8000 } },
  pet_polar: { kind: "pet", art: "mountPolar", hover: 0, fps: 6, idleFps: 1.5, mount: "polar", far: 1.7, pose: { idle: M_IDLE, act: [MOUNT_FRAMES + 2, MOUNT_FRAMES + 3, MOUNT_FRAMES + 3, MOUNT_FRAMES + 3, MOUNT_FRAMES + 2], actMs: 320, every: 8000 } },
  // 12월 루돌프 썰매: 멈추면 (타고 있어도) 루돌프가 앞발로 눈을 긁는다 — 멈춤 그림이 썰매 모양 그대로라 탄 채로도 쓴다 (rideRest)
  xm_sleigh: { kind: "pet", art: "mountSleigh", hover: 0, fps: 7, idleFps: 1.2, mount: "sleigh", far: 2.2, rideRest: true, pose: { idle: M_IDLE, act: [MOUNT_FRAMES + 2, MOUNT_FRAMES + 3, MOUNT_FRAMES + 2, MOUNT_FRAMES + 3, MOUNT_FRAMES + 2, MOUNT_FRAMES + 3], actMs: 210, every: 5000 } },
} satisfies Record<string, FxSpec>;

/** 새 펫 아이콘 16×16 (데리고 다니는 펫 — 타는 펫은 cosmeticFx가 옆모습을 줄여 담는다). 해당 없으면 null */
export function petPackIconGrid(id: string): Grid | null {
  const spec = (PET_PACK_FX as Record<string, (typeof PET_PACK_FX)[keyof typeof PET_PACK_FX]>)[id];
  if (!spec || "mount" in spec) return null;
  const a = PET_PACK_ART[spec.art];
  const src = a.build();
  // 대표 프레임: 멈춤(앉은 모습)이 가장 또렷하다. 오리 삼총사는 16칸에 다 안 들어가 앞 두 마리만
  const frame = 2;
  const g = new Grid(16, 16);
  const w = Math.min(16, a.w);
  const ox = Math.floor((16 - w) / 2) - (a.w > 16 ? a.w - 16 : 0);
  const oy = 15 - a.h + (spec.hover ? -Math.min(2, 15 - a.h) : 0);
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = src.px[j * src.w + frame * a.w + i];
      const tx = ox + i;
      const ty = oy + j + 1;
      if ((v & 255) === 0 || tx < 0 || ty < 0 || tx >= 16 || ty >= 16) continue;
      g.px[ty * 16 + tx] = v;
    }
  return g;
}
