import { darken, Grid, hash2, lighten, mix, type Color } from "../../sprites/pixel";
import { has, type CxArt, type CxCoverArtMap, type CxDraw, type CxHeldArtMap, type CxHeldPoseMap, type CxTile } from "./types";

// 11/27 펜션 전용 가구 8 · 바닥 3 · 벽지 3 그림 (운영자 확인한 시안 scratchpad/furnmock/pension/pnArt.mts를 그대로 옮김).
// 규칙은 ./types.ts 머리말: 그림 = (칸 w×16) × (칸 h×16 + up), 옆모습(d1, 왼쪽을 봄)은 가로·세로 칸이 바뀌고 오른쪽(d3)은 장면이 좌우로 뒤집는다.
// 테는 art.ts가 두른다 (edge — 따뜻한 짙은 갈색 α175). 체크무늬 러그만 테 없이 (빈 칸을 α1로 메워 테가 붙을 자리를 없앤다).
//
// 그림 변형 v (lib/housing/campExclusive/pension.ts act와 맞춘다):
//  - 장작 바구니 "low"(장작 꺼낸 뒤) · 스키 거치대 "taken"(앞 빨간 스키 꺼냄) — 서서 쓰기 fx.v
//  - 흔들의자 "b1"·"b2"(뒤로 젖힘) · "w1"·"w2"(앞으로) — 앉은 동안 흔들리는 장면 (seatAnim, 아래 4번 머리말)
//  - 보드게임 탁자 "roll1"·"roll2"(굴러가는 주사위) · "six"(결과)
//  - 노래방 기계 "on"(켜짐 — 미러볼·곡 번호·LED 띠) · "sing"(마이크 꺼냄) · "f1"(시안 "on2") = 반짝임 두 번째 장면 (켜진 동안 toggle.anim)
//  - 장작 난로 "on"(불) · "f1"(시안 "on2") = 불꽃 두 번째 장면 (toggle.anim). 처음부터 켜진 난로라 끄면 "s1"(on 없음)

const lit = (v: string) => has(v, "on") || has(v, "on2");
/** 켜진 가구의 두 번째 장면 (불꽃·미러볼 반짝임) */
const alt = (v: string) => (has(v, "on2") || has(v, "f1") ? 1 : 0);

export const PN_EDGE = 0x2e1e14;
export const PN_EDGE_A = 175;

const box = (g: Grid, x: number, y: number, w: number, h: number, c: Color, edge = darken(c, 0.3)) => {
  g.rect(x, y, w, h, c);
  g.hline(x, x + w - 1, y + h - 1, edge);
};
const foot = (g: Grid, x0: number, x1: number, y: number) => {
  for (let x = x0; x <= x1; x++) if (!g.filled(x, y)) g.set(x, y, 0x1a1006, 70);
};
const line = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
};

// ── 팔레트 (펜션 기본: 원목 벽·마루는 주황빛 밝은 나무 → 가구는 짙은 호두·무쇠·천 색으로 떼어 놓는다) ──
const WALNUT = { hi: 0x9a6a42, mid: 0x7a5032, lo: 0x5a3822, line: 0x3a2214 } as const;
const IRON = { hi: 0x6a6e78, mid: 0x44474f, lo: 0x2c2e34, dark: 0x1a1b1f } as const;
const BRASS = { hi: 0xf6dc80, mid: 0xd8b048, lo: 0x9a7a2a } as const;
const SLATE = { hi: 0x8a929c, mid: 0x6c747e, lo: 0x525860, grout: 0x3e434a } as const;
const BIRCH = { bark: 0xf2eee4, shade: 0xd2ccc0, mark: 0x2e2a26, end: 0xe8cc94, ring: 0xc49a5a } as const;
const WICKER = { hi: 0x8a6a48, mid: 0x6e5236, lo: 0x523a24, line: 0x3a2818 } as const;
const MUSTARD = { hi: 0xf0cc70, mid: 0xe0b048, lo: 0xb08430 } as const;
const FLEECE = { hi: 0xfaf6ee, mid: 0xece4d4, lo: 0xcfc4b0 } as const;
const TARTAN = { base: 0x2e5a40, dark: 0x1e3e2c, cream: 0xeee2c4, red: 0xc0443a } as const;
const SKI_R = { hi: 0xf26a4a, mid: 0xd8402e, lo: 0x9a2a20 } as const;
const SKI_B = { hi: 0x6a9ae0, mid: 0x3a6ac0, lo: 0x2a4a8a } as const;

// ════════════════ 1. 장작 바구니 (1×1) ════════════════
// 마을 시즌 「장작 바구니」(둥근 노란 버들 + 갈색 장작 + 솔방울·손도끼)와 다르게: 네모난 짙은 버들 바구니 + 가죽 손잡이 + 하얀 자작나무 장작

function birchEnd(g: Grid, cx: number, cy: number): void {
  g.ellipse(cx, cy, 2.5, 2.4, BIRCH.bark);
  g.ellipse(cx, cy, 1.6, 1.5, BIRCH.end);
  g.set(Math.floor(cx), Math.floor(cy), BIRCH.ring);
  g.set(Math.floor(cx - 2), Math.floor(cy + 1), BIRCH.mark);
}
function birchLog(g: Grid, x0: number, x1: number, y: number, h = 3): void {
  g.rect(x0, y, x1 - x0 + 1, h, BIRCH.bark);
  g.hline(x0, x1, y + h - 1, BIRCH.shade);
  for (let x = x0 + 1; x < x1; x += 3) g.set(x + ((y + x) % 2), y + (x % 2), BIRCH.mark);
  g.vline(x0, y, y + h - 1, BIRCH.end);
}
function weave(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const band = Math.floor((y - y0) / 2) % 2;
      const k = (Math.floor(x / 2) + band) % 2;
      g.set(x, y, k ? WICKER.mid : WICKER.hi);
      if ((y - y0) % 2 === 1 && k) g.set(x, y, WICKER.lo);
    }
}
function basketFront(g: Grid, W: number, H: number, v: string): void {
  const low = has(v, "low");
  // 장작 끝 (앞에서 보면 동그란 자작나무 단면)
  const ends: [number, number][] = low ? [[5.5, 8.5], [10.5, 8.5]] : [[3.5, 8.5], [8, 8.5], [12.5, 8.5], [5.75, 4.5], [10.25, 4.5]];
  for (const [x, y] of ends) birchEnd(g, x, y);
  // 바구니 (네모, 아래로 살짝 좁아진다)
  weave(g, 2, 10, 13, 19);
  g.hline(1, 14, 10, WICKER.line);
  g.hline(1, 14, 11, WICKER.hi);
  g.vline(1, 10, 12, WICKER.line);
  g.vline(14, 10, 12, WICKER.line);
  g.hline(2, 13, 19, WICKER.line);
  g.set(2, 19, 0);
  g.set(13, 19, 0);
  // 가죽 손잡이 (양옆 고리) + 앞 가죽 띠
  g.rect(0, 11, 2, 3, 0x9a5a32);
  g.rect(14, 11, 2, 3, 0x9a5a32);
  g.set(0, 11, 0);
  g.set(15, 11, 0);
  g.rect(6, 13, 4, 2, 0x9a5a32);
  g.set(7, 13, BRASS.mid);
  // 다리 (짧은 나무 굽)
  g.set(3, 20, WICKER.line);
  g.set(12, 20, WICKER.line);
  foot(g, 2, 13, H - 1);
}
function basketSide(g: Grid, W: number, H: number, v: string): void {
  const low = has(v, "low");
  // 옆: 장작이 길게 누워 보인다 (하얀 껍질에 검은 무늬)
  if (!low) birchLog(g, 2, 12, 2);
  birchLog(g, 3, 14, low ? 6 : 5);
  birchLog(g, 1, 11, 8);
  weave(g, 2, 10, 13, 19);
  g.hline(1, 14, 10, WICKER.line);
  g.hline(1, 14, 11, WICKER.hi);
  g.hline(2, 13, 19, WICKER.line);
  // 옆면 손잡이 고리 (가운데)
  g.rect(6, 8, 4, 1, 0x9a5a32);
  g.vline(6, 8, 12, 0x9a5a32);
  g.vline(9, 8, 12, 0x9a5a32);
  g.set(3, 20, WICKER.line);
  g.set(12, 20, WICKER.line);
  foot(g, 2, 13, H - 1);
}
function basketBack(g: Grid, W: number, H: number, v: string): void {
  const low = has(v, "low");
  const ends: [number, number][] = low ? [[8, 8.5]] : [[5.5, 8.5], [10.5, 8.5], [8, 4.5]];
  for (const [x, y] of ends) birchEnd(g, x, y);
  weave(g, 2, 10, 13, 19);
  g.hline(1, 14, 10, WICKER.line);
  g.hline(1, 14, 11, WICKER.hi);
  g.hline(2, 13, 19, WICKER.line);
  g.rect(0, 11, 2, 3, 0x9a5a32);
  g.rect(14, 11, 2, 3, 0x9a5a32);
  g.set(0, 11, 0);
  g.set(15, 11, 0);
  g.set(3, 20, WICKER.line);
  g.set(12, 20, WICKER.line);
  foot(g, 2, 13, H - 1);
}

// ════════════════ 2. 스키 거치대 (1×2, 홀로 서는 A자 나무 틀 — 앞 비탈에 빨간 스키, 뒤 비탈에 파란 스키) ════════════════

function skiStrip(g: Grid, x: number, y0: number, y1: number, c: { hi: Color; mid: Color; lo: Color }): void {
  // 스키 바닥면 한 짝 (3px 폭) + 둥글게 말린 코 + 가운데 흰 줄 하나
  g.rect(x, y0, 3, y1 - y0 + 1, c.mid);
  g.vline(x, y0, y1, c.hi);
  g.vline(x + 2, y0, y1, c.lo);
  g.set(x, y0, 0);
  g.set(x + 2, y0, 0);
  g.set(x + 1, y0, c.hi);
  g.rect(x, Math.round((y0 + y1) / 2) - 1, 3, 3, 0xf6f2ea);
  g.set(x + 1, Math.round((y0 + y1) / 2), c.mid);
  g.hline(x, x + 2, y1, c.lo);
}
function pole(g: Grid, x: number, y0: number, y1: number): void {
  g.vline(x, y0 + 2, y1, 0xb8c0c8);
  g.rect(x, y0, 1, 3, 0x2a2c32);
  g.set(x, y1 - 2, 0x2a2c32);
  g.set(x - 1, y1 - 2, 0x2a2c32);
  g.set(x + 1, y1 - 2, 0x2a2c32);
}
function rackFront(g: Grid, W: number, H: number, v: string): void {
  const taken = has(v, "taken");
  // A자 틀을 앞에서 본 모습: 양쪽 기둥 + 가로대 (호두나무)
  const top = 4;
  g.rect(1, top, 2, H - top - 2, WALNUT.mid);
  g.rect(W - 3, top, 2, H - top - 2, WALNUT.mid);
  g.vline(1, top, H - 3, WALNUT.hi);
  g.hline(1, W - 2, top, WALNUT.hi);
  g.rect(1, top + 1, W - 2, 2, WALNUT.mid);
  for (const y of [18, 34]) {
    g.rect(1, y, W - 2, 2, WALNUT.lo);
    g.hline(1, W - 2, y, WALNUT.mid);
  }
  // 발판 (깊이 두 칸 — 앞·뒤 발이 겹쳐 짧은 두 받침)
  box(g, 1, H - 4, W - 2, 3, WALNUT.lo, WALNUT.line);
  // 뒤 비탈 파란 스키 (빨간 스키 뒤로 코만 위로 보인다)
  skiStrip(g, 4, 1, H - 8, SKI_B);
  skiStrip(g, 9, 1, H - 8, SKI_B);
  if (!taken) {
    // 앞 비탈 빨간 스키 + 폴 (앞으로 기대 서서 바닥면이 보인다)
    skiStrip(g, 4, 5, H - 4, SKI_R);
    skiStrip(g, 9, 5, H - 4, SKI_R);
    pole(g, 7, 10, H - 5);
    pole(g, 8, 12, H - 5);
  } else {
    // 빈 앞 걸이 (나무 쐐기 둘)
    g.rect(4, H - 9, 2, 2, WALNUT.hi);
    g.rect(10, H - 9, 2, 2, WALNUT.hi);
  }
  // 위 걸이 쐐기 (고무 패킹)
  g.hline(3, W - 4, 12, 0x3a2a22);
  foot(g, 1, W - 2, H - 1);
}
function rackSide(g: Grid, W: number, H: number, v: string): void {
  const taken = has(v, "taken");
  // 옆: A자가 그대로 보인다 (왼쪽 비탈 = 앞 · 빨강, 오른쪽 비탈 = 뒤 · 파랑). 스키는 모서리라 가는 줄
  const ax = W / 2;
  const base = H - 3;
  line(g, 3, base, ax - 1, 3, WALNUT.mid);
  line(g, 4, base, ax, 3, WALNUT.lo);
  line(g, W - 4, base, ax, 3, WALNUT.mid);
  line(g, W - 5, base, ax - 1, 3, WALNUT.lo);
  g.rect(ax - 2, 2, 4, 3, WALNUT.hi);
  // 가운데 가로대 + 바닥 받침
  g.hline(9, W - 10, Math.round(base - 12), WALNUT.mid);
  g.hline(9, W - 10, Math.round(base - 11), WALNUT.lo);
  box(g, 1, base - 1, W - 2, 3, WALNUT.lo, WALNUT.line);
  // 파란 스키 (뒤 비탈, 위가 꼭대기 너머로)
  line(g, W - 3, base - 1, ax + 3, 0, SKI_B.mid);
  line(g, W - 4, base - 1, ax + 2, 0, SKI_B.lo);
  g.set(ax + 2, 0, SKI_B.hi);
  if (!taken) {
    line(g, 2, base - 1, ax - 4, 0, SKI_R.mid);
    line(g, 3, base - 1, ax - 3, 0, SKI_R.lo);
    g.set(ax - 4, 0, SKI_R.hi);
    line(g, 5, base - 2, ax - 3, 5, 0xb8c0c8);
    g.set(ax - 3, 5, 0x2a2c32);
    g.set(ax - 3, 6, 0x2a2c32);
  }
  foot(g, 1, W - 2, H - 1);
}
function rackBack(g: Grid, W: number, H: number, v: string): void {
  // 뒤: 파란 스키가 앞에, 빨간 스키 끝이 위로 조금
  const taken = has(v, "taken");
  const top = 4;
  g.rect(1, top, 2, H - top - 2, WALNUT.lo);
  g.rect(W - 3, top, 2, H - top - 2, WALNUT.lo);
  g.rect(1, top, W - 2, 3, WALNUT.lo);
  g.hline(1, W - 2, top, WALNUT.mid);
  for (const y of [18, 34]) g.rect(1, y, W - 2, 2, WALNUT.line);
  box(g, 1, H - 4, W - 2, 3, WALNUT.lo, WALNUT.line);
  if (!taken) {
    skiStrip(g, 4, 1, H - 8, SKI_R);
    skiStrip(g, 9, 1, H - 8, SKI_R);
  }
  skiStrip(g, 4, 5, H - 4, SKI_B);
  skiStrip(g, 9, 5, H - 4, SKI_B);
  g.hline(3, W - 4, 12, 0x3a2a22);
  foot(g, 1, W - 2, H - 1);
}

// ════════════════ 3. 체크무늬 러그 (3×2, 바닥층 · 초록 타탄 — 빨간 체크 벽과 겹치지 않게) ════════════════

function rugDraw(g: Grid, W: number, H: number): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 3; x < W - 3; x++) {
      const i = x - 3;
      const j = y - 1;
      const sx = i % 10;
      const sy = j % 10;
      const vband = sx === 3 || sx === 4;
      const hband = sy === 3 || sy === 4;
      const thinR = sx === 8 || sy === 8;
      let c: Color = TARTAN.base;
      if (vband && hband) c = 0xf6eed8;
      else if (vband || hband) c = mix(TARTAN.cream, TARTAN.base, 0.25);
      else if ((sx >= 6 && sx <= 9) && (sy >= 6 && sy <= 9)) c = TARTAN.dark;
      if (thinR && !(vband || hband)) c = TARTAN.red;
      g.set(x, y, c);
    }
  // 테두리 (짙은 초록 단)
  for (let x = 3; x < W - 3; x++) {
    g.set(x, 1, TARTAN.dark);
    g.set(x, H - 2, TARTAN.dark);
  }
  for (let y = 1; y < H - 1; y++) {
    g.set(3, y, TARTAN.dark);
    g.set(W - 4, y, TARTAN.dark);
  }
  // 술 (짧은 쪽 양끝)
  for (let y = 2; y < H - 2; y += 2) {
    g.hline(0, 2, y, TARTAN.cream);
    g.hline(W - 3, W - 1, y, TARTAN.cream);
    g.set(0, y, lighten(TARTAN.cream, 0.4));
    g.set(W - 1, y, lighten(TARTAN.cream, 0.4));
  }
}

// ════════════════ 4. 흔들의자 (1×1, 네 방향) ════════════════
// 흔들기 장면: 기울기 k = −2..2 ("b1"·"b2" 뒤로 젖힘, "w1"·"w2" 앞으로 숙임, 예전 이름 f1 = b2 · f2 = w2).
// 옆모습은 의자 전체(몸·흔들 받침)를 바닥에 닿은 받침 점(그림 x 8, 바닥 줄 아래 끝 y 25) 둘레로 돌린다 — 굽은 받침이 바닥을 구르면
// 닿는 점이 조금씩 옮겨 가는 것까지 그대로 나온다. 등받이 윗끝(받침 점에서 22.5px 위)이 장면 하나에 1px씩 움직이는 각도 atan(k / 22.5).
// 앞·뒤 모습은 앉는 판부터 위가 1px 오르내린다 (앞을 보면 뒤로 젖힐 때 위로, 뒤를 보면 아래로 — 깊이가 화면 위아래). 받침·다리 끝은 바닥에 그대로.
// 앉은 사람은 lib pension.ts rockSitPose가 같은 장면에 같은 만큼 (옆: 같은 각도로 기울기, 앞·뒤: 1px).

/** 흔들기 장면 → 기울기 k (뒤로 +, 앞으로 −) */
export function rockTilt(v: string): number {
  if (has(v, "b2") || has(v, "f1")) return 2;
  if (has(v, "b1")) return 1;
  if (has(v, "w2") || has(v, "f2")) return -2;
  if (has(v, "w1")) return -1;
  return 0;
}
/** 옆모습 돌림 중심 (받침이 바닥에 닿는 점) · 등받이 윗끝까지 높이 */
const ROCK_PIVOT = { x: 8, y: 25, top: 22.5 } as const;

/** 앞·뒤 모습: 앉는 판부터 위(그림 y ≤ cut)를 dy(±1)만큼 옮기고, 비는 줄은 다리를 늘여 채운다 */
function rockShift(src: Grid, g: Grid, dy: number, cut = 20): void {
  for (let y = 0; y < g.h; y++) {
    const sy = dy < 0 ? (y < cut ? y + 1 : y) : dy > 0 ? (y <= cut + 1 ? y - 1 : y) : y;
    if (sy < 0) continue;
    for (let x = 0; x < g.w; x++) {
      const p = src.px[sy * g.w + x];
      if (p & 255) g.px[y * g.w + x] = p;
    }
  }
}

function rockerFront(g: Grid, W: number, H: number, v: string): void {
  const k = rockTilt(v);
  if (k) {
    // 뒤로 젖히면 앉는 판·등받이가 1px 위로 (깊이가 멀어진다), 앞으로 숙이면 1px 아래로
    const tmp = new Grid(W, H);
    rockerFront(tmp, W, H, "");
    rockShift(tmp, g, k > 0 ? -1 : 1);
    return;
  }
  // 등받이 (살 다섯) + 양털 덮개
  const top = 2;
  g.rect(3, top, 10, 2, WALNUT.mid);
  g.hline(3, 12, top, WALNUT.hi);
  for (const x of [4, 6, 8, 10]) g.vline(x + (x > 7 ? 1 : 0), top + 2, 13, WALNUT.lo);
  g.rect(2, top, 2, 14 - top, WALNUT.mid);
  g.rect(12, top, 2, 14 - top, WALNUT.mid);
  g.vline(2, top, 13, WALNUT.hi);
  // 양털 덮개가 등받이 위에 걸쳐 있다
  g.rect(4, top + 1, 8, 5, FLEECE.mid);
  g.hline(4, 11, top + 1, FLEECE.hi);
  for (const x of [5, 7, 9]) g.set(x, top + 3, FLEECE.lo);
  g.set(4, top + 6, FLEECE.lo);
  g.set(11, top + 6, FLEECE.lo);
  // 팔걸이
  g.rect(1, 11, 2, 2, WALNUT.hi);
  g.rect(13, 11, 2, 2, WALNUT.hi);
  // 앉는 판 + 겨자색 방석
  box(g, 2, 13, 12, 4, WALNUT.mid, WALNUT.line);
  g.rect(3, 13, 10, 3, MUSTARD.mid);
  g.hline(3, 12, 13, MUSTARD.hi);
  g.set(7, 14, MUSTARD.lo);
  g.set(8, 14, MUSTARD.lo);
  // 다리 + 흔들 받침 (앞에서는 두 받침 끝이 짧게)
  g.vline(3, 17, H - 3, WALNUT.lo);
  g.vline(12, 17, H - 3, WALNUT.lo);
  g.rect(2, H - 3, 3, 2, WALNUT.mid);
  g.rect(11, H - 3, 3, 2, WALNUT.mid);
  g.hline(2, 4, H - 3, WALNUT.hi);
  g.hline(11, 13, H - 3, WALNUT.hi);
  foot(g, 2, 13, H - 1);
}
function rockerSideRaw(g: Grid, W: number, H: number): void {
  // 왼쪽을 봄: 앉는 판이 왼쪽, 등받이가 오른쪽으로 비스듬히 젖혀 선다
  // 11/27 등받이를 시안보다 조금 세웠다 (0.22 → 0.15): 뒤로 2px 젖혀도 그림 오른쪽 끝(테 자리) 안에 들어오게
  for (let y = 2; y <= 14; y++) {
    const x = 10 + Math.round((14 - y) * 0.15);
    g.rect(x, y, 2, 1, WALNUT.mid);
    g.set(x, y, WALNUT.hi);
  }
  // 양털 덮개가 등받이 앞뒤로 늘어진다
  g.rect(9, 3, 4, 6, FLEECE.mid);
  g.vline(9, 3, 9, FLEECE.hi);
  g.set(13, 4, FLEECE.mid);
  g.set(13, 5, FLEECE.lo);
  g.set(12, 9, FLEECE.lo);
  // 팔걸이 (앞으로 뻗고 앞 기둥)
  g.hline(3, 11, 10, WALNUT.hi);
  g.hline(3, 11, 11, WALNUT.mid);
  g.vline(3, 12, 14, WALNUT.lo);
  // 앉는 판 + 방석
  box(g, 2, 14, 10, 3, WALNUT.mid, WALNUT.line);
  g.rect(3, 13, 8, 2, MUSTARD.mid);
  g.hline(3, 10, 13, MUSTARD.hi);
  // 다리
  g.vline(3, 17, H - 5, WALNUT.lo);
  g.vline(10, 17, H - 5, WALNUT.lo);
}
function rockerSide(g: Grid, W: number, H: number, v: string): void {
  // 가운데 모습의 몸 (흔들 받침은 아래에서 따로 — 가는 곡선은 돌린 모양을 새로 그려야 끊기지 않는다)
  const tmp = new Grid(W, H);
  rockerSideRaw(tmp, W, H);
  // 받침 점 둘레로 돌린다 (뒤로 젖히면 시계 방향 — 왼쪽을 본 의자의 등받이가 오른쪽으로). 픽셀마다 거꾸로 따라가 가장 가까운 점
  const th = Math.atan(rockTilt(v) / ROCK_PIVOT.top);
  const c = Math.cos(th);
  const sn = Math.sin(th);
  // 흔들 받침: 아래로 볼록한 긴 곡선 (가운데 모습에서 x 1..14) 을 같은 각도로 돌려 잇는다 — 굴러서 바닥에 닿는 점이 옮겨 간다
  const rock: [number, number][] = [];
  for (let x = 1; x <= 14; x++) {
    const u = (x - 7.5) / 7;
    const px = x + 0.5 - ROCK_PIVOT.x;
    const py = H - 3 - u * u * 3.2 + 0.5 - ROCK_PIVOT.y;
    rock.push([Math.min(W - 2, Math.max(1, Math.floor(c * px - sn * py + ROCK_PIVOT.x))), Math.floor(sn * px + c * py + ROCK_PIVOT.y)]);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - ROCK_PIVOT.x;
      const py = y + 0.5 - ROCK_PIVOT.y;
      const sx = Math.floor(c * px + sn * py + ROCK_PIVOT.x);
      const sy = Math.floor(-sn * px + c * py + ROCK_PIVOT.y);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const p = tmp.px[sy * W + sx];
      if (p & 255) g.px[y * W + x] = p;
    }
  for (let i = 1; i < rock.length; i++) {
    const [x0, y0] = rock[i - 1];
    const [x1, y1] = rock[i];
    line(g, x0, y0 + 1, x1, y1 + 1, WALNUT.line);
  }
  for (let i = 1; i < rock.length; i++) {
    const [x0, y0] = rock[i - 1];
    const [x1, y1] = rock[i];
    line(g, x0, y0, x1, y1, WALNUT.mid);
  }
  foot(g, 3, 12, H - 1);
}
function rockerBack(g: Grid, W: number, H: number, v: string): void {
  const k = rockTilt(v);
  if (k) {
    // 뒤에서 보면 뒤로 젖힐 때 등받이가 이쪽으로 (1px 아래), 앞으로 숙이면 저쪽으로 (1px 위)
    const tmp = new Grid(W, H);
    rockerBack(tmp, W, H, "");
    rockShift(tmp, g, k > 0 ? 1 : -1);
    return;
  }
  const top = 2;
  // 뒤: 등받이 뒷면이 앞에, 양털 덮개 끝이 뒤로 늘어진다
  box(g, 2, 13, 12, 3, WALNUT.lo);
  g.rect(3, 12, 10, 2, MUSTARD.lo);
  g.rect(2, top, 2, 16 - top, WALNUT.mid);
  g.rect(12, top, 2, 16 - top, WALNUT.mid);
  g.rect(3, top, 10, 2, WALNUT.mid);
  g.hline(3, 12, top, WALNUT.hi);
  for (const x of [5, 7, 9, 11]) g.vline(x - 1 + (x > 7 ? 1 : 0), top + 2, 15, WALNUT.lo);
  g.rect(4, top + 1, 8, 9, FLEECE.mid);
  g.hline(4, 11, top + 1, FLEECE.hi);
  for (let x = 4; x <= 11; x += 2) g.set(x, top + 10, FLEECE.lo);
  for (const [x, y] of [[6, 4], [9, 3], [5, 7], [8, 6], [10, 8]]) g.set(x, top + y, FLEECE.lo);
  g.vline(4, top + 2, top + 9, FLEECE.lo);
  g.vline(3, 16, H - 3, WALNUT.lo);
  g.vline(12, 16, H - 3, WALNUT.lo);
  g.rect(2, H - 3, 3, 2, WALNUT.mid);
  g.rect(11, H - 3, 3, 2, WALNUT.mid);
  foot(g, 2, 13, H - 1);
}

// ════════════════ 5. 보드게임 탁자 (2×2, 낮은 좌식 탁자 — 둘레 빈 칸에 바닥에 앉는다) ════════════════

function die(g: Grid, x: number, y: number, n: number): void {
  g.rect(x, y, 4, 4, 0xfbfaf4);
  g.hline(x, x + 3, y + 3, 0xc8c4b8);
  // 4px 주사위에는 점을 줄여 찍는다 (1 = 빨간 점)
  const pts = n === 1 ? [[1, 1]] : n <= 3 ? [[0, 0], [2, 2]] : [[0, 0], [2, 0], [0, 2], [2, 2]];
  for (const [i, j] of pts) g.set(x + i, y + j, n === 1 ? 0xd03a30 : 0x2a2622);
  if (n === 3 || n === 5) g.set(x + 1, y + 1, 0x2a2622);
}
/** 놀이판 (12×10) — 네 귀 색칸 + 둘레 길 + 말. rot 0~3 = 보는 방향마다 색 귀가 돈다 */
function board(g: Grid, x: number, y: number, w: number, h: number, rot: number): void {
  g.rect(x, y, w, h, 0xf2e8cc);
  const cols = [0xd8503a, 0x3a7ac8, 0xe8b838, 0x4a9a5a];
  const corners: [number, number][] = [[0, 0], [w - 4, 0], [w - 4, h - 4], [0, h - 4]];
  for (let k = 0; k < 4; k++) {
    const [cx, cy] = corners[k];
    g.rect(x + cx, y + cy, 4, 4, cols[(k + rot) % 4]);
  }
  // 가운데 길 (점선)
  for (let i = 4; i < w - 4; i += 2) {
    g.set(x + i, y + 1, 0xb8a888);
    g.set(x + i, y + h - 2, 0xb8a888);
  }
  for (let j = 4; j < h - 4; j += 2) {
    g.set(x + 1, y + j, 0xb8a888);
    g.set(x + w - 2, y + j, 0xb8a888);
  }
  g.rect(x + w / 2 - 1, y + h / 2 - 1, 2, 2, 0x8a6a48);
  // 말 셋
  g.set(x + 5, y + 1, cols[(1 + rot) % 4]);
  g.set(x + w - 2, y + 5, cols[(2 + rot) % 4]);
  g.set(x + 2, y + h - 2, cols[(0 + rot) % 4]);
  g.hline(x, x + w - 1, y + h, 0xc0b090);
}
function gameTable(g: Grid, W: number, H: number, v: string, sd: number): void {
  // 칸을 꽉 채운 낮은 좌식 탁자 (방석은 탁자 둘레 빈 칸에 — 밥상처럼 그쪽 칸이 비어야 앉는다)
  const T0 = H - 32;
  const tx0 = 2;
  const tx1 = W - 3;
  const ty0 = T0 + 2;
  const ty1 = H - 8;
  g.rect(tx0, ty0, tx1 - tx0 + 1, ty1 - ty0 + 1, WALNUT.mid);
  g.hline(tx0, tx1, ty0, WALNUT.hi);
  g.vline(tx0, ty0, ty1, WALNUT.hi);
  // 앞 테 + 짧은 다리
  g.rect(tx0, ty1 + 1, tx1 - tx0 + 1, 3, WALNUT.lo);
  g.hline(tx0, tx1, ty1 + 3, WALNUT.line);
  g.rect(tx0 + 1, ty1 + 4, 2, 2, WALNUT.line);
  g.rect(tx1 - 2, ty1 + 4, 2, 2, WALNUT.line);
  // 놀이판은 가운데 (먼 쪽·앞쪽에 앉은 사람 몸에 가리지 않는 줄 — 칸 위 끝 +5 ~ +16)
  board(g, W / 2 - 8, ty0 + 3, 16, 11, sd);
  // 주사위는 판 왼쪽 옆, 카드 더미는 판 오른쪽 옆 (옆에 앉은 사람과 반대쪽 끝은 안 가린다)
  const side = sd % 2 === 0;
  const dx = side ? tx0 + 1 : tx1 - 4;
  const cx = side ? tx1 - 4 : tx0 + 1;
  g.rect(cx, ty0 + 5, 3, 4, 0xf4f0e6);
  g.rect(cx, ty0 + 4, 3, 4, 0xe86a5a);
  g.hline(cx, cx + 2, ty0 + 4, 0xf09080);
  g.rect(cx, ty0 + 10, 3, 3, 0xf4f0e6);
  if (has(v, "roll1")) {
    g.rect(dx, ty0 + 2, 3, 3, 0xfbfaf4);
    g.set(dx + 1, ty0 + 3, 0x2a2622);
    g.set(dx + 1, ty0 + 6, 0x1a1006, 90);
    g.rect(dx, ty0 + 9, 3, 3, 0xfbfaf4);
    g.set(dx + 1, ty0 + 10, 0xd03a30);
    g.set(dx + 3, ty0 + 1, 0xffffff, 150);
  } else if (has(v, "roll2")) {
    g.rect(dx + 1, ty0 + 4, 3, 3, 0xfbfaf4);
    g.set(dx + 2, ty0 + 5, 0x2a2622);
    g.rect(dx, ty0 + 10, 3, 3, 0xfbfaf4);
    g.set(dx + 1, ty0 + 11, 0x2a2622);
    g.set(dx - 1, ty0 + 8, 0xffffff, 150);
  } else {
    die(g, dx, ty0 + 4, has(v, "six") ? 6 : 5);
    die(g, dx, ty0 + 9, has(v, "six") ? 6 : 3);
  }
  foot(g, tx0, tx1, H - 1);
}

// ════════════════ 6. 노래방 기계 (1×1, 미러볼 + 마이크 거치대 — 마을 「회식 노래방 기계」(보라 오락기)와 다르게 호두나무 스피커 장) ════════════════

function mirrorBall(g: Grid, cx: number, cy: number, on: boolean, f: number): void {
  g.vline(cx, 0, cy - 3, 0x8a8e96);
  g.ellipse(cx + 0.5, cy + 0.5, 2.6, 2.6, on ? 0xd8e0ec : 0x9aa2ae);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if ((i + j + f) % 2 === 0 && i * i + j * j <= 4) g.set(cx + i, cy + j, on ? 0xffffff : 0xb8c0ca);
  if (on) {
    const sp = f % 2 ? [[cx - 4, cy - 1], [cx + 4, cy + 2]] : [[cx + 4, cy - 2], [cx - 3, cy + 3]];
    for (const [x, y] of sp) g.set(x, y, 0xffe8fa);
  }
}
function karaFront(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v) || has(v, "sing");
  const f = on ? alt(v) : 0;
  const mic = !has(v, "sing");
  // 호두나무 스피커 장 (스피커 둘)
  box(g, 1, 12, W - 2, H - 13, WALNUT.mid, WALNUT.line);
  g.hline(1, W - 2, 12, WALNUT.hi);
  for (const cy of [17.5, 24.5]) {
    g.ellipse(7.5, cy, 3.4, 3.1, 0x1e1e24);
    g.ellipse(7.5, cy, 2.2, 2, on && f && cy < 20 ? 0x3a3a44 : 0x2e2e36);
    g.set(7, Math.floor(cy), 0x5a5a66);
  }
  // 위 기계 (반주기: 곡 번호 LED + 단추)
  g.rect(2, 7, W - 4, 5, 0x1a1c22);
  g.hline(2, W - 3, 7, 0x3a3e48);
  const led = on ? 0xff5a4a : 0x4a2a2a;
  // 곡 번호 "18"
  g.vline(4, 8, 10, led);
  g.rect(6, 8, 3, 3, led);
  g.set(7, 9, 0x1a1c22);
  for (let i = 0; i < 3; i++) g.vline(10 + i, 11 - (on ? [2, 3, 1][(i + f) % 3] : 1), 10, on ? [0x5ae08a, 0xf0d040, 0x5ac8f0][i] : 0x2a3030);
  // 미러볼 (왼쪽 위 기둥)
  mirrorBall(g, 4, 3, on, f);
  // 마이크 거치대 (오른쪽) + 빨간 마이크
  g.rect(W - 4, 4, 2, 3, 0x2a2c32);
  if (mic) {
    g.vline(W - 3, 1, 6, 0xc83a3a);
    g.vline(W - 4, 3, 6, 0xa02a2a);
    g.rect(W - 4, 1, 2, 2, 0xc8ccd4);
    g.set(W - 4, 1, 0xf0f2f6);
  }
  if (on) for (let y = 13; y < H - 2; y++) {
    g.set(1, y, (y + f) % 4 < 2 ? 0xff7ad0 : 0x7ad8ff);
    g.set(W - 2, y, (y + f + 2) % 4 < 2 ? 0xff7ad0 : 0x7ad8ff);
  }
  // 장 아래 굽
  g.set(2, H - 1, WALNUT.line);
  g.set(W - 3, H - 1, WALNUT.line);
  foot(g, 2, W - 3, H - 1);
}
function karaSide(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v) || has(v, "sing");
  const f = on ? alt(v) : 0;
  const mic = !has(v, "sing");
  // 왼쪽을 봄: 앞판(스피커 면)이 왼쪽 끝 얇은 띠, 옆판은 나무
  box(g, 2, 12, W - 4, H - 13, WALNUT.lo, WALNUT.line);
  g.hline(2, W - 3, 12, WALNUT.mid);
  g.rect(1, 12, 2, H - 13, 0x1e1e24);
  g.vline(1, 14, H - 3, WALNUT.mid);
  // 켜지면 앞 모서리 LED 띠가 분홍·하늘로 번갈아 빛난다 (옆에서도 켜진 게 보이게)
  if (on) for (let y = 13; y < H - 2; y++) g.set(2, y, (y + f) % 4 < 2 ? 0xff7ad0 : 0x7ad8ff);
  g.rect(5, 17, W - 9, 6, WALNUT.mid);
  g.hline(5, W - 5, 17, WALNUT.hi);
  // 위 기계 (앞으로 비스듬한 판)
  g.rect(2, 8, W - 5, 4, 0x1a1c22);
  g.hline(2, 3, 8, on ? 0xff5a4a : 0x4a2a2a);
  mirrorBall(g, 8, 3, on, f);
  // 마이크 거치대 (옆에서 보이는 쪽)
  g.rect(W - 4, 5, 2, 3, 0x2a2c32);
  if (mic) {
    g.vline(W - 3, 2, 7, 0xc83a3a);
    g.rect(W - 4, 1, 2, 2, 0xc8ccd4);
  }
  foot(g, 2, W - 3, H - 1);
}
function karaBack(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v) || has(v, "sing");
  const f = on ? alt(v) : 0;
  const mic = !has(v, "sing");
  box(g, 1, 12, W - 2, H - 13, WALNUT.lo, WALNUT.line);
  g.hline(1, W - 2, 12, WALNUT.mid);
  // 뒤판: 바람 구멍 + 전선
  for (let y = 15; y < 21; y += 2) g.hline(4, W - 5, y, WALNUT.line);
  g.vline(W - 5, 22, H - 2, 0x1a1a1a);
  g.set(W - 4, H - 2, 0x1a1a1a);
  g.rect(2, 8, W - 4, 4, 0x24262c);
  if (on) {
    g.set(W - 4, 10, 0x5ae08a);
    for (let y = 13; y < H - 2; y++) {
      g.set(1, y, (y + f) % 4 < 2 ? 0xff7ad0 : 0x7ad8ff);
      g.set(W - 2, y, (y + f + 2) % 4 < 2 ? 0xff7ad0 : 0x7ad8ff);
    }
  }
  mirrorBall(g, W - 5, 3, on, f);
  g.rect(2, 4, 2, 3, 0x2a2c32);
  if (mic) {
    g.vline(2, 1, 6, 0xa02a2a);
    g.rect(2, 1, 2, 2, 0xc8ccd4);
  }
  foot(g, 2, W - 3, H - 1);
}

// ════════════════ 7. 원목 6인 식탁 (4×2 — 먼 쪽 의자 셋 + 가까운 쪽 긴 벤치, 자리 21px 간격) ════════════════

function spindleChairBack(g: Grid, x: number, y: number, h: number, dark = false): void {
  // 의자 등받이 (앞에서 본 살 등받이, 폭 10)
  const c = dark ? WALNUT.lo : WALNUT.mid;
  g.rect(x, y, 10, 2, c);
  g.hline(x, x + 9, y, dark ? WALNUT.mid : WALNUT.hi);
  g.vline(x, y, y + h, c);
  g.vline(x + 9, y, y + h, c);
  for (const i of [3, 6]) g.vline(x + i, y + 2, y + h, dark ? WALNUT.line : WALNUT.lo);
}
function place(g: Grid, x: number, y: number): void {
  // 접시 하나 (흰 접시 + 연한 테)
  g.rect(x, y, 4, 3, 0xe8e6de);
  g.set(x, y, WALNUT.mid);
  g.set(x + 3, y, WALNUT.mid);
  g.set(x, y + 2, WALNUT.mid);
  g.set(x + 3, y + 2, WALNUT.mid);
  g.set(x + 1, y + 1, (x + y) % 3 === 0 ? 0xe8904a : (x + y) % 3 === 1 ? 0x7ab85a : 0xd8b860);
  g.set(x + 2, y + 1, 0xf6f4ee);
}
function tableTop(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  g.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, WALNUT.mid);
  g.hline(x0, x1, y0, WALNUT.hi);
  // 널 이음 (긴 쪽으로 두 줄)
  const long = x1 - x0 > y1 - y0;
  if (long) for (const y of [y0 + Math.round((y1 - y0) / 3), y0 + Math.round(((y1 - y0) * 2) / 3)]) g.hline(x0 + 1, x1 - 1, y, WALNUT.lo);
  else for (const x of [x0 + Math.round((x1 - x0) / 3), x0 + Math.round(((x1 - x0) * 2) / 3)]) g.vline(x, y0 + 1, y1 - 1, WALNUT.lo);
}
/** 6인 식탁 자리 줄 (긴 쪽 64px에 21px 간격 셋) */
export const PN_DINE_SEATS = [11, 32, 53];
function diningFront(g: Grid, W: number, H: number): void {
  const T0 = H - 32;
  for (const cx of PN_DINE_SEATS) spindleChairBack(g, cx - 5, 1, T0 + 7);
  tableTop(g, 2, T0 + 5, W - 3, T0 + 18);
  g.rect(2, T0 + 19, W - 4, 3, WALNUT.lo);
  g.hline(2, W - 3, T0 + 21, WALNUT.line);
  g.rect(3, T0 + 22, 2, 5, WALNUT.lo);
  g.rect(W - 5, T0 + 22, 2, 5, WALNUT.lo);
  g.rect(6, T0 + 10, W - 12, 4, 0xece4d2);
  g.hline(6, W - 7, T0 + 13, 0xd2c8b2);
  g.rect(W / 2 - 5, T0 + 10, 10, 4, 0xc89a5a);
  g.rect(W / 2 - 3, T0 + 10, 6, 2, 0xe8b870);
  g.set(W / 2 - 2, T0 + 10, 0xf4d090);
  for (const x of [20, W - 22]) {
    g.rect(x, T0 + 8, 2, 3, 0xf4eee0);
    g.set(x, T0 + 7, 0xffd070);
  }
  for (const cx of PN_DINE_SEATS) {
    place(g, cx - 2, T0 + 6);
    place(g, cx - 2, T0 + 15);
  }
  box(g, 3, T0 + 24, W - 6, 3, WALNUT.hi, WALNUT.lo);
  g.rect(3, T0 + 27, W - 6, 2, WALNUT.lo);
  for (const x of [5, W / 2 - 1, W - 7]) g.rect(x, T0 + 29, 2, 2, WALNUT.line);
  foot(g, 3, W - 4, H - 1);
}
function diningSide(g: Grid, W: number, H: number): void {
  // 왼쪽을 봄 (32 × 64+UP): 벤치 = 왼쪽(앞), 의자 셋 = 오른쪽 (등받이가 옆으로 솟는다)
  const T0 = H - 64;
  for (const cy of PN_DINE_SEATS) {
    const y = T0 + cy;
    g.rect(W - 4, y - 10, 2, 14, WALNUT.mid);
    g.vline(W - 4, y - 10, y + 3, WALNUT.hi);
    box(g, W - 9, y - 2, 6, 3, WALNUT.mid, WALNUT.lo);
    g.vline(W - 8, y + 1, y + 5, WALNUT.lo);
  }
  tableTop(g, 8, T0 + 2, W - 10, H - 6);
  g.rect(8, H - 5, W - 17, 2, WALNUT.lo);
  g.rect(9, H - 3, 2, 2, WALNUT.line);
  g.rect(W - 12, H - 3, 2, 2, WALNUT.line);
  g.rect(13, T0 + 6, 4, H - T0 - 13, 0xece4d2);
  g.vline(16, T0 + 6, H - 8, 0xd2c8b2);
  g.rect(13, T0 + 27, 4, 10, 0xc89a5a);
  g.rect(13, T0 + 29, 2, 6, 0xe8b870);
  for (const y of [T0 + 20, H - 26]) {
    g.rect(14, y, 2, 3, 0xf4eee0);
    g.set(14, y - 1, 0xffd070);
  }
  for (const cy of PN_DINE_SEATS) {
    place(g, 9, T0 + cy - 2);
    place(g, W - 15, T0 + cy - 2);
  }
  box(g, 1, T0 + 2, 5, H - T0 - 4, WALNUT.hi, WALNUT.lo);
  g.vline(5, T0 + 2, H - 3, WALNUT.lo);
  g.rect(2, H - 2, 2, 1, WALNUT.line);
  foot(g, 1, W - 2, H - 1);
}
function diningBack(g: Grid, W: number, H: number): void {
  const T0 = H - 32;
  box(g, 3, T0 + 1, W - 6, 3, WALNUT.hi, WALNUT.lo);
  tableTop(g, 2, T0 + 5, W - 3, T0 + 18);
  g.rect(2, T0 + 19, W - 4, 3, WALNUT.lo);
  g.hline(2, W - 3, T0 + 21, WALNUT.line);
  g.rect(3, T0 + 22, 2, 5, WALNUT.lo);
  g.rect(W - 5, T0 + 22, 2, 5, WALNUT.lo);
  g.rect(6, T0 + 10, W - 12, 4, 0xece4d2);
  g.rect(W / 2 - 5, T0 + 10, 10, 4, 0xc89a5a);
  g.rect(W / 2 - 3, T0 + 11, 6, 2, 0xe8b870);
  for (const x of [20, W - 22]) {
    g.rect(x, T0 + 8, 2, 3, 0xf4eee0);
    g.set(x, T0 + 7, 0xffd070);
  }
  for (const cx of PN_DINE_SEATS) {
    place(g, cx - 2, T0 + 6);
    place(g, cx - 2, T0 + 15);
  }
  for (const cx of PN_DINE_SEATS) {
    spindleChairBack(g, cx - 5, T0 + 16, 12, true);
    g.rect(cx - 5, T0 + 28, 2, 3, WALNUT.line);
    g.rect(cx + 3, T0 + 28, 2, 3, WALNUT.line);
  }
  foot(g, 3, W - 4, H - 1);
}

// ════════════════ 8. 무쇠 장작 난로 (2×2 — 넓은 유리 불창 + 연통 + 판석 받침 · 아래 장작 칸) ════════════════
// 벽난로(벽돌 아궁이)·시즌 무쇠 난로(1×1, 빨간 주전자)와 다르게: 낮고 넓은 몸통, 큰 유리창, 바닥에 깐 판석 받침, 다리 사이 자작나무 장작

function flame(g: Grid, x0: number, x1: number, yb: number, h: number, f: number): void {
  const w = x1 - x0 + 1;
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);
    const hh = Math.round(h * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.75 + 0.25 * Math.sin(i * 1.7 + f * 2.1)));
    for (let j = 0; j < hh; j++) {
      const k = j / Math.max(1, hh);
      g.set(x0 + i, yb - j, k < 0.35 ? 0xffe070 : k < 0.7 ? 0xf8902a : 0xd8501a);
    }
  }
}
function slab(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  // 판석 받침 (회색 돌 판 — 마루·통나무 벽과 겹치지 않는 차가운 돌)
  g.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, SLATE.mid);
  for (let y = y0; y <= y1; y += 6) g.hline(x0, x1, y, SLATE.grout);
  for (let y = y0; y <= y1; y += 6) for (let x = x0 + (((y - y0) / 6) % 2 ? 5 : 0); x <= x1; x += 10) g.vline(x, y, Math.min(y + 5, y1), SLATE.grout);
  for (let y = y0 + 1; y <= y1; y += 6) g.hline(x0, x1, y, SLATE.hi);
  g.rect(x0, y1 + 1, x1 - x0 + 1, 2, SLATE.lo);
}
function stoveFront(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v);
  const f = on ? alt(v) : 0;
  const T0 = H - 32;
  slab(g, 1, T0 + 12, W - 2, H - 4);
  // 연통 (몸통 위 가운데 → 그림 맨 위까지) + 조절판 손잡이
  g.rect(13, 1, 6, T0 + 2, IRON.mid);
  g.vline(13, 1, T0 + 2, IRON.hi);
  g.vline(18, 1, T0 + 2, IRON.lo);
  g.rect(12, 6, 8, 2, IRON.lo);
  g.hline(12, 19, 6, IRON.hi);
  g.rect(19, 12, 3, 1, BRASS.mid);
  // 몸통 (무쇠) + 윗판 놋쇠 난간
  const bx0 = 4;
  const bx1 = W - 5;
  const by0 = T0;
  const by1 = T0 + 20;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, IRON.mid);
  g.rect(bx0 - 1, by0, bx1 - bx0 + 3, 3, IRON.lo);
  g.hline(bx0 - 1, bx1 + 1, by0, IRON.hi);
  g.hline(bx0, bx1, by0 - 1, BRASS.mid);
  g.set(bx0, by0 - 2, BRASS.lo);
  g.set(bx1, by0 - 2, BRASS.lo);
  g.vline(bx0, by0 + 3, by1, IRON.hi);
  g.vline(bx1, by0 + 3, by1, IRON.lo);
  // 큰 유리 불창 (아치 + 놋쇠 테)
  const gx0 = bx0 + 3;
  const gx1 = bx1 - 3;
  const gy0 = by0 + 5;
  const gy1 = by1 - 4;
  g.rect(gx0 - 1, gy0 - 1, gx1 - gx0 + 3, gy1 - gy0 + 3, IRON.dark);
  for (let y = gy0; y <= gy1; y++)
    for (let x = gx0; x <= gx1; x++) {
      if (y === gy0 && (x === gx0 || x === gx1)) continue;
      g.set(x, y, on ? mix(0x5a2414, 0x2a1410, (y - gy0) / (gy1 - gy0)) : 0x22242a);
    }
  // 장작 + 불
  g.rect(gx0 + 2, gy1 - 1, gx1 - gx0 - 3, 2, on ? 0x6a3018 : 0x4a3a30);
  g.hline(gx0 + 2, gx1 - 2, gy1 - 1, on ? 0xff7a30 : 0x5a4a40);
  if (on) flame(g, gx0 + 2, gx1 - 2, gy1 - 2, gy1 - gy0 - 2, f);
  else {
    g.set(gx0 + 2, gy0 + 1, 0x3a3e48);
    g.set(gx0 + 3, gy0 + 2, 0x3a3e48);
    g.set(gx0 + 2, gy0 + 3, 0x3a3e48);
  }
  // 문 손잡이 (놋쇠) + 아래 바람 조절 단추
  g.rect(gx1 + 1, gy0 + 4, 1, 4, BRASS.mid);
  g.set(gx1 + 1, gy0 + 4, BRASS.hi);
  g.rect(bx0 + 2, by1 - 2, bx1 - bx0 - 3, 2, IRON.lo);
  g.set(W / 2 - 1, by1 - 1, on ? 0xff7a30 : BRASS.lo);
  // 다리 넷 (앞 둘 굽은 다리) + 다리 사이 자작나무 장작 둘
  g.rect(bx0, by1 + 1, 2, 4, IRON.lo);
  g.rect(bx1 - 1, by1 + 1, 2, 4, IRON.lo);
  g.set(bx0 - 1, by1 + 4, IRON.lo);
  g.set(bx1 + 1, by1 + 4, IRON.lo);
  birchEnd(g, 12.5, by1 + 3);
  birchEnd(g, 17.5, by1 + 3);
  birchEnd(g, 15, by1 + 0.5);
  foot(g, 1, W - 2, H - 1);
}
function stoveSide(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v);
  const f = on ? alt(v) : 0;
  const T0 = H - 32;
  slab(g, 1, T0 + 12, W - 2, H - 4);
  // 왼쪽을 봄: 연통은 몸통 뒤쪽(오른쪽)에서 솟아 꺾여 뒤(오른쪽 벽 쪽)로 들어간다
  g.rect(17, 7, 6, T0 - 5, IRON.mid);
  g.vline(17, 7, T0 + 1, IRON.hi);
  g.vline(22, 7, T0 + 1, IRON.lo);
  g.rect(17, 1, W - 18, 6, IRON.mid);
  g.hline(17, W - 2, 1, IRON.hi);
  g.hline(17, W - 2, 6, IRON.lo);
  g.rect(17, 1, 6, 6, IRON.mid);
  g.set(17, 1, 0);
  g.hline(18, 21, 2, IRON.hi);
  g.rect(16, 12, 8, 2, IRON.lo);
  g.hline(16, 23, 12, IRON.hi);
  g.rect(W - 4, 0, 2, 8, IRON.lo);
  const bx0 = 7;
  const bx1 = W - 6;
  const by0 = T0;
  const by1 = T0 + 20;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, IRON.mid);
  g.rect(bx0 - 1, by0, bx1 - bx0 + 3, 3, IRON.lo);
  g.hline(bx0 - 1, bx1 + 1, by0, IRON.hi);
  g.hline(bx0, bx1, by0 - 1, BRASS.mid);
  // 앞(왼쪽) 면: 유리창 옆 모서리 + 손잡이가 튀어나온다
  g.rect(bx0 - 2, by0 + 5, 2, by1 - by0 - 8, IRON.dark);
  g.vline(bx0 - 2, by0 + 6, by1 - 4, on ? 0xf8902a : 0x3a3e48);
  g.rect(bx0 - 4, by0 + 9, 2, 1, BRASS.mid);
  // 옆판: 전나무 무늬 돋을새김
  const cx = (bx0 + bx1) / 2;
  for (let j = 0; j < 9; j++) g.hline(Math.round(cx - j / 2), Math.round(cx + j / 2), by0 + 6 + j, j % 3 === 2 ? IRON.hi : IRON.lo);
  g.vline(Math.round(cx), by0 + 15, by0 + 17, IRON.lo);
  // 옆 바람구멍 (불이 비친다)
  for (let x = bx0 + 3; x < bx1 - 2; x += 3) g.set(x, by1 - 2, on ? (f ? 0xffb040 : 0xff7a30) : IRON.lo);
  g.rect(bx0, by1 + 1, 2, 4, IRON.lo);
  g.rect(bx1 - 1, by1 + 1, 2, 4, IRON.lo);
  birchLog(g, bx0 + 3, bx1 - 3, by1 + 1, 3);
  foot(g, 1, W - 2, H - 1);
}
function stoveBack(g: Grid, W: number, H: number, v: string): void {
  const on = lit(v);
  const T0 = H - 32;
  slab(g, 1, T0 + 12, W - 2, H - 4);
  const bx0 = 4;
  const bx1 = W - 5;
  const by0 = T0 + 1;
  const by1 = T0 + 20;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, IRON.lo);
  g.rect(bx0 - 1, by0, bx1 - bx0 + 3, 3, IRON.mid);
  g.hline(bx0 - 1, bx1 + 1, by0, IRON.hi);
  g.hline(bx0, bx1, by0 - 1, BRASS.mid);
  // 뒤판: 열 가림판 (가로 줄) — 불창은 안 보인다
  for (let y = by0 + 5; y < by1 - 2; y += 3) g.hline(bx0 + 2, bx1 - 2, y, IRON.dark);
  if (on) {
    g.set(bx0 + 1, by1 - 2, 0xff7a30);
    g.set(bx1 - 1, by1 - 2, 0xff7a30);
  }
  // 연통: 몸통 뒤쪽(= 가까운 쪽)에서 솟는다
  g.rect(13, 1, 6, by0 + 6, IRON.mid);
  g.vline(13, 1, by0 + 6, IRON.hi);
  g.vline(18, 1, by0 + 6, IRON.lo);
  g.rect(12, by0 + 3, 8, 2, IRON.lo);
  g.hline(12, 19, by0 + 3, IRON.hi);
  g.rect(12, 6, 8, 2, IRON.lo);
  g.hline(12, 19, 6, IRON.hi);
  g.rect(bx0, by1 + 1, 2, 4, IRON.dark);
  g.rect(bx1 - 1, by1 + 1, 2, 4, IRON.dark);
  birchLog(g, bx0 + 4, bx1 - 4, by1 + 1, 3);
  foot(g, 1, W - 2, H - 1);
}


// ════════════════ 바닥 3 · 벽지 3 (16×16 · 16×40 — 위 6줄·아래 6줄은 art.ts 천장 테·걸레받이) ════════════════

const FLOORS: Record<string, { tile: CxTile }> = {
  // 통나무 원목 마루: 기본 펜션 마루(주황빛 원목 8px 널)와 다르게 → 넓은 흰빛 소나무 널(하얗게 바랜 북유럽 마루) + 나무못
  cx_pn_floor_log: {
    tile: (g, v) => {
      const tones = [0xe4dac6, 0xebe2d0, 0xded2bc, 0xe8dec9];
      // 세로로 깐 넓은 널 두 장 (8px) — 기본 마루(가로 널, 주황빛)와 방향·색 모두 다르게
      for (let col = 0; col < 2; col++) {
        const x0 = col * 8;
        const c = tones[(col * 2 + v) % 4];
        g.rect(x0, 0, 8, 16, c);
        g.vline(x0, 0, 15, lighten(c, 0.3));
        g.vline(x0 + 7, 0, 15, 0xa89880);
        // 나뭇결 (세로로 흐르는 옅은 물결)
        for (let y = 0; y < 16; y++) {
          const k = Math.round(3.5 + Math.sin((y + v * 5 + col * 7) / 3) * 1.5);
          if (hash2(col, y, v + 3) > 0.3) g.set(x0 + k, y, darken(c, 0.07));
        }
        // 옹이 (작은 갈색 타원) — 가끔
        if ((col * 3 + v) % 4 === 1) {
          const y = (v * 5 + col * 7) % 12 + 2;
          g.set(x0 + 3, y, 0xa08a6a);
          g.set(x0 + 4, y, 0xb09a78);
          g.set(x0 + 3, y + 1, 0xc0aa88);
        }
        // 널 끝 이음 (어긋나게)
        if ((col + v) % 2 === 0) g.hline(x0 + 1, x0 + 6, (col * 9 + v * 5) % 16, 0xa89880);
      }
    },
  },
  // 헤링본 마루: 밤색 짧은 널을 V자로 (기본 마루보다 짙고 붉은 밤나무)
  cx_pn_floor_herring: {
    tile: (g, v) => {
      const tones = [0xbe8456, 0xb27a4c, 0xc89060, 0xb8804f];
      // 8px 너비 두 줄: 왼줄은 ↗ 널, 오른줄은 ↘ 널 (널 두께 4 · 길이 8) → 만나는 곳이 V자
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const col = x >> 3;
          const lx = x & 7;
          const u = col === 0 ? y + lx : y - lx + 8;
          const plank = Math.floor(u / 4);
          const c = tones[(plank * 3 + col + v) % 4];
          let px = c;
          const m = ((u % 4) + 4) % 4;
          if (m === 0) px = 0x7a4a2a;
          else if (m === 1) px = lighten(c, 0.12);
          if (lx === 0 && col === 1) px = 0x7a4a2a;
          g.set(x, y, px);
        }
    },
  },
  // 테라코타 타일: 따뜻한 흙빛 네모 타일 + 크림 줄눈 (타일마다 굽기 얼룩)
  cx_pn_floor_terra: {
    tile: (g, v) => {
      // 칸마다 큰 네모 흙 타일 하나 (15px) + 크림 줄눈 — 굽기 얼룩과 모서리 닳음
      const tones = [0xc0704a, 0xc87a52, 0xb86844, 0xc4744c];
      const c = tones[v % 4];
      g.rect(0, 0, 16, 16, 0xdccab0);
      for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) g.set(x, y, mix(c, 0x8a3a1e, hash2(x + v * 31, y, 3) * 0.14 + (x + y) / 300));
      g.hline(1, 15, 1, lighten(c, 0.14));
      g.vline(1, 1, 15, lighten(c, 0.07));
      g.hline(2, 15, 15, darken(c, 0.12));
      g.vline(15, 2, 15, darken(c, 0.08));
      g.set(1, 1, 0xdccab0);
      g.set(15, 15, darken(c, 0.2));
      if (v % 2 === 0) {
        g.set(5 + v, 9, darken(c, 0.15));
        g.set(6 + v, 9, darken(c, 0.1));
      }
    },
  },
};

const PY0 = 6;
const PY1 = 34;
const WALLS: Record<string, { cap: Color; tile: CxTile }> = {
  // 통나무 벽: 기본 펜션 벽(주황빛 둥근 통나무)과 다르게 → 짙은 초콜릿빛 통나무 + 흰 회반죽 줄눈 (손수 지은 산장 느낌)
  cx_pn_wall_plaster: {
    cap: 0x2a1a10,
    tile: (g, v) => {
      // 굵은 통나무 (7px, 둥근 명암) + 흰 회반죽 줄눈 (2px) — 기본 통나무 벽보다 짙고 줄눈이 하얗다
      const rows: Color[] = [0x9a6c46, 0x86603e, 0x765232, 0x68482c, 0x5a3c24, 0x4a3020, 0x3a2618];
      for (let row = 0; PY0 + row * 9 <= PY1; row++) {
        const y = PY0 + row * 9;
        const shade = ((row + v) % 3) * 0.04;
        for (let j = 0; j < 7 && y + j <= PY1; j++) for (let x = 0; x < 16; x++) g.set(x, y + j, darken(rows[j], shade));
        for (let j = 7; j < 9 && y + j <= PY1; j++) for (let x = 0; x < 16; x++) g.set(x, y + j, j === 7 ? 0xece4d4 : 0xcfc5b2);
        // 결 · 옹이 · 통나무 이음 (가끔 세로 금)
        for (let x = 0; x < 16; x++) if (hash2(x, row, v + 11) > 0.72) g.set(x, y + 2, 0xa87a50);
        if ((row + v) % 3 === 1) {
          const kx = ((row * 5 + v * 3) % 11) + 2;
          g.set(kx, y + 3, 0x3a2416);
          g.set(kx + 1, y + 3, 0x4a3020);
          g.set(kx, y + 4, 0x4a3020);
        }
        if ((row * 2 + v) % 4 === 0) g.vline((row * 7 + v * 5) % 16, y + 1, y + 5, 0x3a2618);
      }
    },
  },
  // 눈꽃 무늬 벽지: 흐린 청회색 바탕 + 흰 눈꽃 + 아래 뜨개 띠 (북유럽 니트 무늬)
  cx_pn_wall_snow: {
    cap: 0x2a3644,
    tile: (g) => {
      g.rect(0, PY0, 16, PY1 - PY0 + 1, 0x5e7890);
      const flake = (cx: number, cy: number) => {
        g.set(cx, cy, 0xf4f8fc);
        for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) g.set(cx + dx, cy + dy, 0xe0eaf2);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.set(cx + dx, cy + dy, 0xc8d8e6);
      };
      flake(4, PY0 + 5);
      flake(12, PY0 + 12);
      g.set(12, PY0 + 3, 0xa8bccc);
      g.set(3, PY0 + 14, 0xa8bccc);
      // 뜨개 띠 (흰·빨강 지그재그) — 벽 아래 1/3
      const by = PY1 - 10;
      g.rect(0, by, 16, 9, 0xeef2f4);
      g.hline(0, 15, by, 0x3e5268);
      g.hline(0, 15, by + 8, 0x3e5268);
      for (let x = 0; x < 16; x++) {
        const k = Math.abs((x % 6) - 3);
        g.set(x, by + 2 + k, 0xb8403a);
        g.set(x, by + 6 - k, 0x3e5268);
      }
      g.rect(0, by + 9, 16, PY1 - by - 8, 0x4a6278);
    },
  },
  // 빨간 체크 패브릭 벽: 빨강·크림 버팔로 체크 천 + 위 나무 띠 + 판 사이 세로 나무 쫄대
  cx_pn_wall_check: {
    cap: 0x3a1a14,
    tile: (g, v) => {
      for (let y = PY0; y <= PY1; y++)
        for (let x = 0; x < 16; x++) {
          const a = Math.floor(x / 4) % 2;
          const b = Math.floor((y - PY0) / 4) % 2;
          g.set(x, y, a && b ? 0x7a1c1c : a || b ? 0xb8302a : 0xf0e2c8);
          if (a !== b && (x + y) % 3 === 0) g.set(x, y, 0xa82a26);
        }
      // 위 나무 띠 (몰딩 아래) + 아래 징두리 나무 판
      g.rect(0, PY0, 16, 3, WALNUT.mid);
      g.hline(0, 15, PY0, WALNUT.hi);
      g.hline(0, 15, PY0 + 2, WALNUT.line);
      g.rect(0, PY1 - 7, 16, 8, WALNUT.mid);
      g.hline(0, 15, PY1 - 7, WALNUT.hi);
      g.hline(0, 15, PY1 - 6, WALNUT.lo);
      g.vline(7, PY1 - 5, PY1, WALNUT.lo);
      // 판 사이 쫄대 (두 칸마다)
      if (v % 2 === 0) {
        g.rect(0, PY0 + 3, 2, PY1 - PY0 - 10, WALNUT.lo);
        g.vline(0, PY0 + 3, PY1 - 8, WALNUT.mid);
      }
    },
  },
};

// ════════════════ 3. 체크무늬 러그 — 테 없이 ════════════════
// art.ts가 모든 전용 가구에 테를 두르므로, 러그는 빈 칸(술 사이·위아래 줄)을 거의 투명한 점(α1)으로 메워 테가 붙을 자리를 없앤다
const rugNoEdge: CxDraw = (g, W, H) => {
  rugDraw(g, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g.filled(x, y)) g.set(x, y, 0x000000, 1);
};

// ════════════════ 손에 드는 것 (act.hold.item — ./types.ts 「손에 들기」: 앞을 본 모습, 그림 한가운데 = 손 자리) ════════════════
// 캐릭터(20×28)의 손은 몸 오른쪽 아래(발에서 6px 위). 왼쪽을 보면 장면이 좌우로 뒤집고, 뒤를 보면 몸 뒤에 그린다.

/** 가운데 정렬 틀: 손 자리(cx, cy)가 그림 한가운데 오게 빈 칸을 덧댄다 */
function centered(src: Grid, hx: number, hy: number): Grid {
  const w = 2 * Math.ceil(Math.max(hx, src.w - hx));
  const h = 2 * Math.ceil(Math.max(hy, src.h - hy));
  const g = new Grid(w, h);
  const ox = Math.round(w / 2 - hx);
  const oy = Math.round(h / 2 - hy);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const p = src.px[y * src.w + x];
    if (p & 255) g.px[(y + oy) * w + x + ox] = p;
  }
  return g;
}
/** 자작나무 장작 한 토막 (손에 쥔 가운데가 손 자리보다 2px 위 — 안아 든 모습) */
function heldLog(): Grid {
  const g = new Grid(12, 5);
  birchLog(g, 1, 10, 1, 3);
  g.outline(PN_EDGE, false, PN_EDGE_A);
  return centered(g, 6, 4.5);
}
/** 빨간 마이크 (머리가 입 옆에 오게 손 자리보다 6px 위) */
function heldMic(): Grid {
  const g = new Grid(5, 8);
  g.rect(1, 1, 3, 3, 0xc8ccd4);
  g.set(1, 1, 0xf0f2f6);
  g.vline(2, 4, 6, 0xc83a3a);
  g.set(2, 7, 0x1a1a1a);
  g.outline(PN_EDGE, false, PN_EDGE_A);
  return centered(g, 2.5, 4 + 6);
}
/**
 * 등에 비스듬히 멘 빨간 스키 한 쌍 (시안 그대로 — 36×30, 왼쪽 아래 꼬리에서 어깨 너머 오른쪽 위로, 말린 코가 위).
 * 방향마다 그림(dir 0 앞 · 1 왼쪽 · 2 뒤 · 3 오른쪽): 앞·뒤는 기울기 0.8, 옆은 0.62. 왼쪽을 보면 옆 그림을 뒤집는다.
 * 자리는 heldPose (앞·옆은 몸 뒤, 뒤를 보면 등에 멘 스키가 몸 앞)
 */
function skiGrid(side: boolean): Grid {
  const g = new Grid(36, 30);
  const n = 30;
  const k = side ? 0.62 : 0.8;
  const sx = side ? 1.0 : 0.95;
  for (let i = 0; i <= n; i++) {
    const x = 2 + Math.round(i * sx);
    const y = 27 - Math.round(i * k);
    for (const [o, c] of [[0, SKI_R.hi], [1, SKI_R.mid], [3, SKI_R.mid], [4, SKI_R.lo]] as [number, Color][]) g.set(x + o, y, c);
    if (i === 14) for (const o of [0, 1, 3, 4]) g.set(x + o, y, 0xf6f2ea);
  }
  const tx = 2 + Math.round(n * sx);
  const ty = 27 - Math.round(n * k);
  g.set(tx + 1, ty - 1, SKI_R.lo);
  g.set(tx + 4, ty - 1, SKI_R.lo);
  g.outline(PN_EDGE, false, PN_EDGE_A);
  return g;
}
function heldSki(dir?: number): Grid {
  const g = skiGrid(dir === 1 || dir === 3);
  return dir === 1 ? g.mirrored() : g;
}
/**
 * 스키 자리: 그림 가운데를 시안 자리(캐릭터 그림 왼쪽 위 + (−6, 2) → 발 기준 (+2, −10), 왼쪽을 보면 (−2, −10))에 오게
 * 손 자리(앞 +5.5 · 왼쪽 −4.5 · 뒤 −5.5 · 오른쪽 +4.5, 발에서 6px 위)에서 옮긴다
 */
export const heldPose: CxHeldPoseMap = {
  ski: (dir) => (dir === 2 ? { behind: false, dx: 7.5, dy: -4 } : dir === 1 ? { behind: true, dx: 2.5, dy: -4 } : dir === 3 ? { behind: true, dx: -2.5, dy: -4 } : { behind: true, dx: -3.5, dy: -4 }),
};

export const heldArt: CxHeldArtMap = { log: heldLog, mic: heldMic, ski: heldSki };
/** 펜션 전용 가구에는 눕는 자리가 없다 */
export const coverArt: CxCoverArtMap = {};

// ════════════════ 묶음 ════════════════

export const PENSION_ART: CxArt = {
  draw: {
    cx_pn_firewood: basketFront,
    cx_pn_ski_rack: rackFront,
    cx_pn_check_rug: rugNoEdge,
    cx_pn_rocking: rockerFront,
    cx_pn_boardgame: (g, W, H, v) => gameTable(g, W, H, v, 0),
    cx_pn_karaoke: karaFront,
    cx_pn_long_table: diningFront,
    cx_pn_stove: stoveFront,
  },
  spin: {
    cx_pn_firewood: { side: basketSide, back: basketBack },
    cx_pn_ski_rack: { side: rackSide, back: rackBack },
    cx_pn_rocking: { side: rockerSide, back: rockerBack },
    cx_pn_boardgame: { side: (g, W, H, v) => gameTable(g, W, H, v, 1), back: (g, W, H, v) => gameTable(g, W, H, v, 2) },
    cx_pn_karaoke: { side: karaSide, back: karaBack },
    cx_pn_long_table: { side: diningSide, back: diningBack },
    cx_pn_stove: { side: stoveSide, back: stoveBack },
  },
  up: { cx_pn_firewood: 6, cx_pn_ski_rack: 18, cx_pn_rocking: 10, cx_pn_boardgame: 2, cx_pn_karaoke: 14, cx_pn_long_table: 6, cx_pn_stove: 22 },
  floors: Object.fromEntries(Object.entries(FLOORS).map(([id, f]) => [id, f.tile])),
  papers: Object.fromEntries(Object.entries(WALLS).map(([id, w]) => [id, w.tile])),
  wallCap: Object.fromEntries(Object.entries(WALLS).map(([id, w]) => [id, w.cap])),
  edge: { color: PN_EDGE, a: PN_EDGE_A },
};
