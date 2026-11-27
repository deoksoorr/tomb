// 11/27 좌대 전용 코디 (캠핑장 윤슬 낚시터 좌대 입장권 — protocol raft.ts RAFT_GEAR). 시안(~/Desktop/목요일작업/좌대시안, scratchpad jwadaemock/art/gear.ts)을 그대로 옮겼다.
//  7일  jw_carphat 붕어 털모자 (머리)        — 니트 붕어가 머리를 덮고 꼬리가 뒤로 튄다
//  30일 jw_vest    좌대 낚시 조끼 (옷)        — 주머니 조끼 + 등 낚싯대 꽂이 (어깨 너머로 초릿대·방울)
//  30일 jw_net     월척 뜰채 (등)             — 등에 멘 큰 뜰채, 그물 속 은빛 월척
//  영구 jw_sedge   물빛 삿갓 (머리)  · jw_bell 금방울 찌 목걸이 (목) · jw_waders 물빛 가슴장화 (옷) · jw_cape 황금 월척 망토 (등) — 넷이 한 벌
// 시트 칸(20×28) 밖·가장자리 1px에 닿으면 저절로 한 단계씩 줄여 다시 그린다 (adapt). 줄임 단계는 꾸미기·자리·몸·방향·동작 묶음마다 그 묶음의 모든 프레임 중
// 가장 큰 값으로 맞춘다 (걷는 동안 크기가 깜빡이지 않게 — 처음 그 몸으로 그릴 때 warm이 그 몸의 모든 프레임을 한 번 그려 정한다).
// 잘림 검사: raftGear.test.ts (16몸 × 4방향 × 28열, 1px 여백). 염색 묶음: gearDye GEAR_DYE_REGIONS (천 4톤 — 금·찌·눈·입술은 그대로).
import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";
import { bodyTier } from "@tomb/protocol";
import { bigBody, FIT_X0, FIT_X1, FIT_Y1, iconOf, objectBody, safe, SAFE_TOP, type SsItem } from "./seasonSetKit";

type V = GearView;
type FB = string;
type T = { hi: Color; c: Color; lo: Color; deep: Color };

/** 잘림 검사용: 칸 밖이라 버려진 칠 (붓이 막은 것 — 그림이 잘렸다는 뜻) */
export const CLIP = { drops: [] as [number, number][], viol: 0, soft: 0 };
/** 칸 가장자리 한 줄 (x 1·18, y 26): 빈 칸에 새로 칠하면 외곽선이 칸 끝(0·19·27)에 닿는다 → 여백 1px 규칙 위반 */
// 두 칸: 몸 외곽선 바깥에 희귀·전설 몸의 금·무지개 테가 한 줄 더 붙고, 잠수할 때 물 줄이 그림 폭보다 한 칸 넓다 → 새 칸은 x 3~16, y 24까지
// 동글이·이불 유령은 손 흔들기·환호 때 몸 전체가 위로 갈수록 옆으로 밀린다 (avatarCore shear: 8줄마다 1px) → 그만큼 더 안쪽
/** 지금 그리는 프레임의 동작 묶음 (서기·걷기·뛰기 / 앉기 / 점프 / 매달리기 / 수영·잠수 / 그네 / 손 흔들기·환호 / 해먹) — 시트를 굽는 쪽이 열마다 정한다 */
export const CTX = { group: "" };
export const colGroup = (col: number): string => (col < 12 ? "stand" : col < 14 ? "sit" : col < 15 ? "jump" : col < 17 ? "hang" : col < 21 ? "water" : col < 23 ? "swing" : col < 27 ? "act" : "lie");
let BIG = false;
// 왕관 외형(king)은 몸통 덧그림 담비털 망토가 그때까지 그린 실루엣보다 옆으로 2칸(옆모습 뒤로 4칸) 더 퍼진다 → 몸통 줄은 그만큼 더 안쪽
let KING = false;
/** 희귀·전설 외형: 실루엣 밖에 금·무지개 테 한 줄 + 물에서 수면선이 그 밖으로 → 한 칸 더 안쪽 */
let TIER = 0;
const shearAt = (y: number) => (BIG && CTX.group === "act" ? Math.round(Math.max(0, 26 - y) / 8) : 0) + (KING && y >= 18 ? 4 : 0) + TIER;
const ring = (x: number, y: number) => x <= FIT_X0 + 1 + shearAt(y) || x >= FIT_X1 - 1 - shearAt(y) || y >= FIT_Y1 - 1;
/** 지금 그리는 꾸미기의 줄임 단계 (0 = 원래 크기). adapt가 칸 밖·가장자리에 닿으면 1씩 올려 다시 그린다 */
let SH = 0;
function fit(g: Grid, edge = true): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => {
      x |= 0;
      y |= 0;
      if (x >= FIT_X0 && x <= FIT_X1 && y <= FIT_Y1 && y >= SAFE_TOP) {
        if (edge && ring(x, y) && !g.filled(x, y)) {
          CLIP.drops.push([x, y]);
          CLIP.viol++;
          return;
        }
        return set(x, y, c, a);
      }
      CLIP.drops.push([x, y]);
      CLIP.viol++;
    },
  });
}
/** 꾸미기·자리·몸·방향·동작 묶음마다 정한 줄임 단계 (프레임마다 크기가 달라 깜빡이지 않게 — 그 묶음의 모든 프레임 중 가장 큰 단계로 맞춘다. raftGearBeginFrame의 warm이 미리 채운다) */
export const STICKY = new Map<string, number>();
/** 꾸미기 한 자리를 그릴 때: 칸 밖·가장자리에 닿으면 처음 상태로 되돌리고 한 단계 줄여 다시 (몸·자세·프레임마다 저절로 맞춘다) */
function adapt<A extends unknown[]>(fn: (...a: A) => void, key = ""): (...a: A) => void {
  return (...a: A) => {
    const body = (a.slice(4).filter((x) => typeof x === "string").pop() as string) ?? "";
    const sk = `${key}|${body}|${a[1]}|${a[4] === "back" || a[4] === "front" ? a[4] : ""}|${CTX.group}`;
    const g = a[0] as Grid;
    const snap = g.px.slice();
    const d0 = CLIP.drops.length;
    BIG = bigBody(a[3] as string);
    KING = a.includes("king");
    TIER = a.some((v) => typeof v === "string" && bodyTier(v) !== null) ? 1 : 0;
    for (let s = STICKY.get(sk) ?? 0; s <= 10; s++) {
      g.px.set(snap);
      CLIP.drops.length = d0;
      const v0 = CLIP.viol;
      SH = s;
      fn(...a);
      if (CLIP.viol === v0) break;
    }
    if (SH > (STICKY.get(sk) ?? 0)) STICKY.set(sk, SH);
    SH = 0;
    BIG = false;
    KING = false;
    TIER = 0;
  };
}
/** 몸 뒤 빈칸에만 (seasonSetKit behind와 같다 — 다만 칸 밖 칠은 CLIP에 남긴다) */
function behindRec(g: Grid, draw: (t: Grid) => void): void {
  const t = new Grid(g.w, g.h);
  draw(fit(t, false));
  for (let y = SAFE_TOP; y <= FIT_Y1; y++)
    for (let x = FIT_X0; x <= FIT_X1; x++) {
      const v = t.get(x, y);
      if (!(v & 255) || g.filled(x, y)) continue;
      if (ring(x, y)) {
        CLIP.drops.push([x, y]);
        CLIP.viol++;
        continue;
      }
      g.set(x, y, v >>> 8, v & 255);
    }
}
const brush = (g: Grid) => fit(safe(g));
/** 작은 장식(루어·패치·버클·턱끈·리본 끝)용 붓: 칸 끝·가장자리 빈 칸이면 그 한 점만 조용히 뺀다 (몸이 칸 끝에 닿는 자세에서도 본체는 그대로) */
function soft(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => {
      x |= 0;
      y |= 0;
      if (x < FIT_X0 || x > FIT_X1 || y > FIT_Y1 || y < SAFE_TOP || (ring(x, y) && !g.filled(x, y))) {
        CLIP.soft++;
        return;
      }
      set(x, y, c, a);
    },
  });
}
const put = (g: Grid, pts: readonly (readonly [number, number])[], c: Color, ox = 0, oy = 0) => {
  for (const [x, y] of pts) g.set(ox + x, oy + y, c);
};
function row(g: Grid, y: number, x0: number, x1: number, col: (x: number, a: number, b: number) => Color | null): void {
  // 천을 몸에 맞게 펴는 줄: 칸 가장자리 빈 칸은 조용히 건너뛴다 (몸이 있는 칸만 덮는다)
  for (let x = Math.max(1, x0); x <= Math.min(18, x1); x++) {
    if (ring(x, y) && !g.filled(x, y)) continue;
    const c = col(x, x0, x1);
    if (c !== null) g.set(x, y, c);
  }
}

// ═════════════ 1. 붕어 털모자 (7일) ═════════════
// 물고기 모자: 붕어 입이 머리를 덥석 문 모양 — 챙 자리가 두툼한 산호색 입술, 정수리 양옆에 툭 튀어나온 눈, 뒤로 부채 꼬리
export const CARP: T = { hi: 0xf2cc68, c: 0xd49c3a, lo: 0xa8742a, deep: 0x7a521e };
const EYE_W = 0xfffcf4;
const EYE_B = 0x1a1620;
const LIP = 0xf08070;
const LIP_HI = 0xffb0a0;
const LIP_LO = 0xc0504a;

function carpHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = brush(g0);
  const { cx } = m;
  const rx = Math.round(m.rx) - (SH >= 3 ? 1 : 0) - (SH >= 5 ? 1 : 0) - (SH >= 7 ? 1 : 0) - (SH >= 9 ? 1 : 0);
  const side = v === "side";
  // 몸통 (니트): 정수리 → 넓게. 비늘 = 엇갈린 그늘 점, 왼쪽 빛 · 오른쪽 그늘
  const rows: [number, number][] = [
    [top - 2, Math.max(2, Math.round(rx * 0.6))],
    [top - 1, Math.round(rx * 0.9)],
    [top, rx],
    [top + 1, rx],
  ];
  for (const [y, h] of rows)
    for (let x = cx - h; x < cx + h; x++) {
      const edgeL = x === cx - h;
      const scale = y >= top - 1 && y <= top && (x + (y % 2) * 2 + 40) % 4 === 0;
      g.set(x, y, edgeL ? CARP.hi : x === cx + h - 1 ? CARP.deep : x === cx + h - 2 ? CARP.lo : scale ? CARP.lo : y === top - 2 ? CARP.hi : CARP.c);
    }
  // 입술 (챙 자리 두툼한 산호색 한 줄 + 위 빛)
  for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 2, x === cx - rx ? LIP_HI : x >= cx + rx - 1 ? LIP_LO : LIP);
  if (v === "down") {
    // 입꼬리 (양끝 한 칸 위로)
    g.set(cx - rx, top + 1, LIP);
    g.set(cx + rx - 1, top + 1, LIP_LO);
    // 앞에서 크게 보이는 왕눈 둘 (흰자 4×4 둥근 네모 + 짙은 테 + 눈동자 — 둘이 살짝 다른 쪽을 본다, 정수리 위로 한 칸 솟는다)
    const EYE_RIM = 0x3a2410;
    const eye = (x0: number, pupil: readonly [number, number][]) => {
      const y0 = Math.max(SAFE_TOP, top - 3);
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++) {
          const corner = (dx === 0 || dx === 3) && (dy === 0 || dy === 3);
          g.set(x0 + dx, y0 + dy, corner ? EYE_RIM : EYE_W);
        }
      for (const [px, py] of pupil) g.set(x0 + px, y0 + py, EYE_B);
      g.set(x0 + 1, y0, 0xffffff);
    };
    eye(cx - rx, [[2, 1], [2, 2], [1, 2]]);
    eye(cx + rx - 4, [[1, 1], [1, 2], [2, 2]]);
    // 뒤에 숨은 꼬리 끝 (정수리 뒤로 살짝)
    if (top - 3 >= SAFE_TOP) put(g, [[-1, -3], [0, -3]], CARP.lo, cx, top);
    if (SH === 0 && top - 4 >= SAFE_TOP) put(g, [[-2, -4], [1, -4]], CARP.deep, cx, top);
  } else if (side) {
    // 앞(오른쪽) = 입: 입술이 앞으로 한 칸 두툼하게
    if (SH < 4) {
      g.set(cx + rx, top + 1, LIP);
      g.set(cx + rx, top + 2, LIP_LO);
    }
    g.set(cx + rx - 1, top + 1, LIP_HI);
    // 눈 (앞 위로 솟은 2×2)
    g.set(cx + rx - 3, top - 2, EYE_W);
    g.set(cx + rx - 2, top - 2, EYE_W);
    g.set(cx + rx - 3, top - 1, EYE_W);
    g.set(cx + rx - 2, top - 1, EYE_B);
    if (top - 3 >= SAFE_TOP) g.set(cx + rx - 3, top - 3, CARP.c);
    // 등지느러미 (정수리 가운데 작은 톱니 둘)
    if (top - 3 >= SAFE_TOP) {
      put(g, [[-2, -3], [0, -3]], CARP.lo, cx, top);
      put(g, [[-1, -3]], CARP.deep, cx, top);
    }
    // 꼬리: 뒤통수에서 뒤로 뻗은 갈래 부채 (위 갈래가 더 길게 휙 — 지느러미 살은 짙게)
    // 줄임 단계마다 꼬리 끝 열을 하나씩 접는다 (넓은 머리 · 칸 끝 가까운 자세)
    const bx = cx - rx;
    const tl = Math.max(0, 3 - SH);
    const tail = (pts: [number, number][], c: Color) => put(g, pts.filter(([dx]) => -dx <= tl), c, bx, top);
    tail([[-1, -1], [-1, 0], [-1, 1]], CARP.lo);
    tail([[-2, -2], [-2, -1], [-2, 1], [-2, 2]], CARP.c);
    tail([[-3, -3], [-3, -2], [-3, 2], [-3, 3]], CARP.hi);
    tail([[-2, 0]], CARP.deep);
    if (SH === 0 && top - 4 >= SAFE_TOP) g.set(bx - 3, top - 4, CARP.c);
    // 옆으로 뻗을 칸이 없으면(넓은 머리) 꼬리를 뒤통수 위로 세운다 — 붕어 실루엣은 그대로
    if (tl < 2) {
      const up = (dx: number, dy: number, c: Color) => top + dy >= SAFE_TOP && g.set(bx + dx, top + dy, c);
      up(1, -2, CARP.lo);
      up(1, -3, CARP.c);
      up(0, -3, CARP.c);
      up(0, -4, CARP.hi);
      up(2, -4, CARP.hi);
      up(1, -4, CARP.deep);
    }
  } else {
    // 뒤: 뒤통수 가운데 등선 + 위로 활짝 편 부채 꼬리
    for (let y = top - 1; y <= top + 1; y++) g.set(cx - 1, y, CARP.lo);
    if (top - 3 >= SAFE_TOP) put(g, [[-1, -3], [0, -3]], CARP.lo, cx, top);
    if (top - 4 >= SAFE_TOP) put(g, [[-2, -4], [-1, -4], [0, -4], [1, -4]], CARP.c, cx, top);
    if (SH <= 1 && top - 5 >= SAFE_TOP) put(g, [[-3, -5], [-2, -5], [1, -5], [2, -5]], CARP.hi, cx, top);
    if (SH === 0) put(g, [[-4, -6], [3, -6]], CARP.c, cx, top);
    put(g, (SH <= 1 ? [[-1, -4], [0, -5], [-1, -5]] : [[-1, -4]]).filter(([, dy]) => top + dy >= SAFE_TOP) as [number, number][], CARP.deep, cx, top);
  }
}

// ═════════════ 2. 좌대 낚시 조끼 (30일) ═════════════
export const VEST: T = { hi: 0xe4d29e, c: 0xc6ae74, lo: 0x9c8450, deep: 0x6e5c34 };
const LURE_A = 0xf0603a;
const LURE_B = 0xb8e43c;
const ZIP = 0xd8dce4;
const PATCH = 0x2e4a7a;
const PATCH_FISH = 0xf4f6fa;
const ROD = 0x2c2c36;
const ROD_HI = 0x5a5a6a;
const ROD_TIP = 0xf04030;
const BELL = 0xf6d24a;
const REEL = 0xc8ccd4;
const REEL_LO = 0x8a8e98;

type W = { v: V; m: GearM; fb: FB; body: string; sit: number };
function torsoTB(w: W): { top: number; bot: number } {
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = w.body === "suit" ? w.m.neck : (tall ? 13 : 18) + sitDrop;
  const bot = Math.min(26, w.sit === 1 ? 26 : 24 + (w.sit === 2 ? 1 : 0));
  return { top, bot };
}
function span(w: W, y: number): [number, number] {
  const { cx } = w.m;
  if (w.body === "suit") {
    const half = w.v === "side" ? 4 : 5;
    return [cx - half, cx + half];
  }
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = (tall ? 13 : 18) + sitDrop;
  const spread = w.sit === 1 ? (tall ? 0.55 : 0.75) : tall ? 0.3 : 0.5;
  const hw = (tall ? 2.5 : 3) + (y - top) * spread;
  return [Math.floor(cx - hw), Math.ceil(cx + hw)];
}
function inBall(w: W, x: number, y: number): boolean {
  const ry = w.sit ? 5.5 : 6;
  return ((x + 0.5 - w.m.cx) / 6.5) ** 2 + ((y + 0.5 - w.m.hy) / ry) ** 2 <= 1;
}
const bigTop = (w: W) => Math.round(w.m.hy) + (w.fb === "round" ? 2 : 4);
const neckY = (m: GearM, fb: FB) => (fb === "round" ? Math.round(m.hy) + 2 : fb === "sheet" ? Math.round(m.hy) + 4 : m.neck);

/** 등 낚싯대 꽂이: 몸 뒤 (layer back) — 왼쪽 어깨 너머로 초릿대가 솟고 끝에 방울 */
function vestRod(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const n = neckY(m, fb);
  const big = bigBody(fb);
  const tall = fb === "tall";
  if (v === "down") {
    // 앞모습: 머리 왼쪽 뒤로 대가 솟는다 (머리가 덮는 곳은 가려진다)
    // 줄임 단계: 대를 몸 쪽으로 한 칸씩 (넓은 몸·칸 끝)
    const x = cx - (big ? 8 : tall ? 6 : 7) + Math.min(SH, big ? 7 : 3);
    // 왕관 외형은 몸통 망토가 옆으로 퍼지므로 대 아래쪽(몸 뒤에 가려지는 부분)은 17줄까지만
    const y0 = KING ? Math.min(17, n + 2) : Math.min(24, n + 2);
    const y1 = Math.max(SAFE_TOP + 1, m.top - 3);
    for (let y = y1; y <= y0; y++) g.set(x + (y < y1 + 3 ? -1 : 0), y, (y + 40) % 4 === 0 ? ROD_HI : ROD);
    g.set(x - 1, y1 - 1, ROD_TIP);
    g.set(x - 2, y1, BELL);
  } else if (v === "side") {
    // 옆(오른쪽을 본다): 등 뒤에서 뒤로 비스듬히
    const bx = cx - (big ? 7 : tall ? 4 : 5) + SH;
    const y0 = KING ? Math.min(17, n + 3) : Math.min(n + 3, 24);
    const len = y0 - 3 - Math.max(SAFE_TOP + 1, m.top - 3 + 3);
    const lean = 3 + SH * 2;
    for (let k = 0; k <= len; k++) g.set(bx - Math.floor(k / lean), y0 - k, (k + 40) % 4 === 0 ? ROD_HI : ROD);
    const tx = bx - Math.floor(len / lean);
    const ty = y0 - len;
    g.set(tx - 1, ty - 1, ROD_TIP);
    g.set(tx - 2, ty, BELL);
    // 릴 (등 아래)
    g.set(bx + 1, y0 - 1, REEL);
    g.set(bx + 1, y0, REEL_LO);
  }
}
function vestBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, sit: number, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  if (layer === "back") {
    vestRod(g, v, m, fb);
    return;
  }
  if (objectBody(body)) return;
  const w: W = { v, m, fb, body, sit };
  const big = bigBody(fb);
  if (big) {
    const top = bigTop(w);
    for (let y = top; y < 27; y++) {
      let l = 99;
      let r = -1;
      for (let x = 1; x <= 18; x++) if (g.filled(x, y) && (fb === "sheet" || inBall(w, x, y))) { l = Math.min(l, x); r = Math.max(r, x); }
      if (r < 0) continue;
      for (let x = l; x <= r; x++) {
        if (!g.filled(x, y)) continue;
        const open = v === "down" && (x === cx - 1 || x === cx);
        if (open) continue;
        const pocket = (y - top) % 3 === 1 && x > l + 1 && x < r - 1 && v !== "up";
        g.set(x, y, x === l ? VEST.hi : x >= r - 1 ? (x === r ? VEST.deep : VEST.lo) : pocket ? VEST.deep : VEST.c);
      }
    }
    if (v === "down") {
      // 앉은 자세처럼 몸이 칸 바닥에 가까우면 아래쪽 장식은 뺀다 (24줄까지만)
      if (top + 1 <= 24) g.set(cx - 3, top + 1, LURE_A);
      if (top <= 24) soft(g0).set(cx + 2, top, LURE_B);
      if (top + 3 <= 24) soft(g0).set(cx + 3, top + 3, PATCH);
    }
    if (v === "up") {
      vestBackPanel(soft(g0), cx, top + 1, 5);
      const yb = Math.min(top + 4, 24);
      const tipY = Math.max(SAFE_TOP + 1, m.top - 4);
      const len = yb - tipY;
      const reach = Math.max(3, 11 - SH * 2);
      for (let k = 0; k <= len; k++) g.set(cx + 3 - Math.floor((k * reach) / Math.max(1, len)), yb - k, (k + 40) % 4 === 0 ? ROD_HI : ROD);
      g.set(cx + 3 - reach, tipY - 1, ROD_TIP);
      g.set(cx + 4 - reach, tipY - 1, BELL);
    }
    return;
  }
  const { top, bot } = torsoTB(w);
  const n = neckY(m, fb);
  const y0 = Math.min(top, n + 1);
  for (let y = y0; y <= bot; y++) {
    const [l, r0] = span(w, Math.max(y, top));
    const r = r0 - 1;
    row(g, y, l, r, (x, a, b) => {
      // 앞섶은 열려 몸이 보인다
      if (v === "down" && (x === cx - 1 || x === cx) && y > y0) return null;
      if (y === bot) return x >= b - 1 ? VEST.deep : VEST.lo;
      return x === a ? VEST.hi : x === b ? VEST.deep : x === b - 1 ? VEST.lo : VEST.c;
    });
  }
  if (v === "down") {
    // 주머니 덮개 넷 (짙은 줄) + 은색 지퍼 고리 + 가슴 루어 둘 + 오른 가슴 좌대 패치
    const [l, r0] = span(w, bot);
    for (const y of [y0 + 2, bot - 1]) {
      if (y >= bot) continue;
      soft(g0).set(l + 1, y, VEST.deep);
      soft(g0).set(l + 2, y, VEST.deep);
      soft(g0).set(cx - 2, y, VEST.deep);
      soft(g0).set(cx + 1, y, VEST.deep);
      soft(g0).set(r0 - 3, y, VEST.deep);
      soft(g0).set(r0 - 2, y, VEST.deep);
      if (y + 1 < bot) { soft(g0).set(l + 1, y + 1, VEST.hi); soft(g0).set(cx + 1, y + 1, VEST.hi); }
    }
    soft(g0).set(cx - 2, y0 + 3, ZIP);
    soft(g0).set(cx - 3, y0, LURE_A);
    soft(g0).set(cx - 3, y0 + 1, 0xfff0c0);
    soft(g0).set(cx + 2, y0 + 1, PATCH);
    soft(g0).set(cx + 3, y0 + 1, PATCH);
    soft(g0).set(cx + 2, y0 + 2, PATCH);
    soft(g0).set(cx + 3, y0 + 2, PATCH_FISH);
    soft(g0).set(cx + 1, y0, LURE_B);
  } else if (v === "side") {
    const [l, r0] = span(w, bot);
    for (const y of [y0 + 2, bot - 1]) if (y < bot) for (let x = l + 1; x <= r0 - 2; x += 2) soft(g0).set(x, y, VEST.deep);
    soft(g0).set(r0 - 1, y0 + 1, LURE_A);
    // 등 꽂이 (몸 뒤 판 위로 대 밑동)
    soft(g0).set(l, y0 + 2, ROD);
    soft(g0).set(l, y0 + 3, ROD);
  } else {
    vestBackPanel(soft(g0), cx, y0 + 1, 3);
    // 뒷판에서 비스듬히 대가 꽂혀 왼쪽 어깨 위로 (뒷모습은 머리가 가리지 않아 길게)
    const yb = bot - 1;
    const tipY = Math.max(SAFE_TOP + 1, m.top - 3);
    const len = yb - tipY;
    const reach = Math.max(3, 9 - SH * 2);
    for (let k = 0; k <= len; k++) g.set(cx + 2 - Math.floor((k * reach) / Math.max(1, len)), yb - k, (k + 40) % 4 === 0 ? ROD_HI : ROD);
    g.set(cx + 2, yb, REEL);
    g.set(cx + 3, yb, REEL_LO);
    g.set(cx + 2 - reach, tipY - 1, ROD_TIP);
    g.set(cx + 1 - reach, tipY, BELL);
  }
}
/** 뒷판 「좌대」 패치 (남색 바탕 + 흰 물고기) */
function vestBackPanel(g: Grid, cx: number, y: number, w: number): void {
  const x0 = cx - Math.floor(w / 2);
  for (let x = x0; x < x0 + w; x++) {
    g.set(x, y, PATCH);
    g.set(x, y + 1, PATCH);
  }
  g.set(cx - 1, y, PATCH_FISH);
  g.set(cx, y + 1, PATCH_FISH);
  if (w >= 5) g.set(cx + 1, y, PATCH_FISH);
}
function vestNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  // 큰 몸·물건 몸은 깃 없음. 사람 몸은 목 줄(기본 목도리) 양옆을 조끼 어깨로 덮고, 뒤에서 대가 머리 뒤에 가려지지 않게 한 번 더 (뒷모습)
  const g = brush(g0);
  if (bigBody(fb) || objectBody(body)) return;
  const { cx } = m;
  const n = neckY(m, fb);
  const half = fb === "tall" ? 3 : 4;
  if (v === "down") {
    g.set(cx - half, n, VEST.hi);
    g.set(cx - half + 1, n, VEST.c);
    g.set(cx + half - 2, n, VEST.lo);
    g.set(cx + half - 1, n, VEST.deep);
  } else if (v === "up") {
    for (let x = cx - half; x < cx + half; x++) g.set(x, n, x >= cx + half - 1 ? VEST.deep : x === cx - half ? VEST.hi : VEST.c);
  }
}

// ═════════════ 3. 황금 월척 망토 (영구) ═════════════
// 물빛 망토 + 비늘 결 + 등판 금 월척 문장 + 지느러미처럼 선 깃(앞에서도 머리 양옆으로 보인다) + 꼬리지느러미처럼 갈라져 퍼지는 밑단
export const CAPE: T = { hi: 0x3e94aa, c: 0x246a82, lo: 0x194e64, deep: 0x0f3548 };
const GOLD = 0xf6c83c;
const GOLD_HI = 0xfff2a8;
const GOLD_LO = 0xb88418;
const PEARL = 0xf8f6f0;
const HEADED = new Set(["hood", "cat", "bun", "tall"]);

/** 금 월척 문장 (7×4, 왼쪽을 보는 잉어 + 갈래 꼬리) */
const CARP_EMBLEM = [".GgG..T", "GeGGGT.", "GGGGGT.", ".GGG..T"] as const;
function emblem(g: Grid, x0: number, y0: number): void {
  CARP_EMBLEM.forEach((s, dy) => {
    for (let dx = 0; dx < s.length; dx++) {
      const ch = s[dx];
      if (ch === ".") continue;
      g.set(x0 + dx, y0 + dy, ch === "g" ? GOLD_HI : ch === "e" ? 0x5a3a10 : ch === "T" ? GOLD_LO : GOLD);
    }
  });
}
/** 망토 몸판 한 칸: 빛 왼쪽 · 그늘 오른쪽 · 비늘 결(엇갈린 반달 그늘) */
function capeCell(x: number, y: number, x0: number, x1: number): Color {
  if (x === x0) return CAPE.hi;
  if (x === x1) return CAPE.deep;
  if (x === x1 - 1) return CAPE.lo;
  const sx = (x + (Math.floor(y / 2) % 2) * 2 + 40) % 4;
  if (y % 2 === 1 && sx === 0) return CAPE.lo;
  if (y % 2 === 0 && sx === 1) return CAPE.hi;
  return CAPE.c;
}
function capeBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  const { cx, shY, shL, shR } = m;
  // 밑단은 25줄까지 (26줄에 새로 칠하면 외곽선이 칸 끝에 닿는다). 줄임 단계마다 퍼짐·끝 퍼짐을 줄인다
  const bottom = 24;
  void sit;
  const K = [0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0][Math.min(SH, 6)];
  const inset = Math.max(0, SH - 5);
  if (v === "up" && layer === "front") {
    for (let y = shY - 1; y <= bottom; y++) {
      const spread = Math.round((y - shY) * Math.max(0, 0.5 - 0.08 * SH)) + (SH < 2 && y >= bottom - 1 ? 1 : 0) + (SH < 1 && y === bottom ? 1 : 0);
      const x0 = shL - spread + inset;
      const x1 = shR + spread - inset;
      const mid = (x0 + x1 + 1) / 2;
      for (let x = x0; x <= x1; x++) {
        // 꼬리지느러미 밑단: 가운데가 V로 파인다 (두 줄)
        const notch = (y === bottom && Math.abs(x + 0.5 - mid) < 2.5) || (y === bottom - 1 && Math.abs(x + 0.5 - mid) < 1);
        if (notch) continue;
        const hemRow = y === bottom || (y === bottom - 1 && Math.abs(x + 0.5 - mid) < 2.5);
        const ray = y >= bottom - 2 && (x + 40) % 2 === 0;
        g.set(x, y, hemRow ? (x >= x1 - 1 ? GOLD_LO : GOLD) : y === shY - 1 ? (x >= x1 - 1 ? GOLD_LO : GOLD) : ray ? CAPE.lo : capeCell(x, y, x0, x1));
      }
    }
    emblem(soft(g0), cx - 4, Math.min(shY + 1, bottom - 6));
    void hem;
  } else if (v === "side" && layer === "back") {
    for (let y = shY; y <= bottom; y++) {
      const t = (y - shY) / Math.max(1, bottom - shY);
      const back = Math.max(0, Math.round(2 + t * (4 - Math.min(SH, 3))) - inset);
      const x0 = cx - back - 2;
      for (let x = x0; x <= cx; x++) g.set(x, y, y === bottom ? GOLD : x === x0 ? CAPE.lo : capeCell(x, y, x0 - 1, cx + 2));
    }
    // 꼬리지느러미 끝: 뒤로 갈라져 위·아래로 뻗는다 (금 끝)
    const ex = cx - 8 + SH;
    put(g, [[0, -1], [0, -2], [-1, -3], [-1, -2]], CAPE.c, ex, bottom);
    put(g, [[-1, 0], [-2, 0], [-2, -4]], GOLD, ex, bottom);
    put(g, [[-1, -1]], CAPE.hi, ex, bottom);
    // 안감 (금빛 비단)
    if (shY + 1 <= bottom - 2) g.vline(cx - 1, shY + 1, bottom - 2, GOLD_LO);
  } else if (v === "down" && layer === "back") {
    for (let y = shY; y <= bottom; y++) {
      const spread = (SH >= 5 ? 0 : 1) + Math.round((y - shY) * K) + (y >= bottom - 1 ? Math.max(0, 2 - SH) : 0);
      const x0 = shL - spread + inset;
      const x1 = shR + spread - inset;
      for (let x = x0; x <= x1; x++) g.set(x, y, y === bottom || ((x === x0 || x === x1) && y >= bottom - 1) ? GOLD : x === x0 ? CAPE.hi : x < cx ? CAPE.lo : CAPE.c);
    }
  } else if (v === "down" && layer === "front") {
    // 어깨 금 걸쇠 + 진주
    g.set(shL + 1, shY - 1, GOLD);
    g.set(shR - 1, shY - 1, GOLD);
    g.set(shL + 1, shY, PEARL);
    g.set(shR - 1, shY, PEARL);
  }
  void body;
  void fb;
}
/** 지느러미 깃 (머리 옆 빈칸에 — 머리 명암 칠이 끝난 뒤 behind로). dir = -1 왼쪽 · 1 오른쪽 */
function finCollar(t: Grid, x: number, y: number, dir: number): void {
  // 아래(목)에서 위·바깥으로 펼친 지느러미 살 셋, 끝은 금
  const pts: [number, number, Color][] = [
    [0, 0, CAPE.lo],
    [0, -1, CAPE.c],
    [1, -1, CAPE.hi],
    [1, -2, CAPE.c],
    [0, -2, CAPE.lo],
    [1, -3, CAPE.c],
    [2, -3, GOLD],
    [1, -4, GOLD],
    [2, -2, CAPE.lo],
    [3, -2, GOLD_LO],
  ];
  for (const [dx, dy, c] of pts) if (dx <= 3 - SH) t.set(x + dir * dx, y + dy, c);
}
/** 머리를 다 그린 뒤: 앞·옆 = 머리 옆 지느러미 깃, 뒤 = 망토 몸판을 한 번 더 + 뒷덜미 금테 깃 */
function capeOver(g0: Grid, v: V, m: GearM, fb: FB, _top: number, body: string): void {
  if (!HEADED.has(fb)) return;
  const { neck, shL, shR, cx } = m;
  const rx = Math.round(m.rx);
  if (v === "down") {
    behindRec(g0, (t) => {
      finCollar(t, cx - rx - 1, neck - 1, -1);
      finCollar(t, cx + rx, neck - 1, 1);
    });
    return;
  }
  if (v === "side") {
    behindRec(g0, (t) => finCollar(t, cx - rx - 1, neck - 1, -1));
    return;
  }
  capeBack(g0, v, m, fb, "front", 0, 0, body);
  const g = brush(g0);
  const c0 = Math.floor((shL + shR + 1) / 2);
  const shHalf = Math.max(3, Math.floor((shR - shL + 1) / 2));
  for (const k of [0, 1, 2] as const) {
    const y = neck - 2 + k;
    const h = (k === 0 ? shHalf - 1 : shHalf) - Math.min(SH, 2);
    const l = c0 - h;
    const r = c0 + h - 1;
    for (let x = l; x <= r; x++) g.set(x, y, k === 0 ? (x >= r - 1 ? GOLD_LO : GOLD) : k === 1 ? (x <= l ? CAPE.hi : x >= r - 1 ? CAPE.lo : CAPE.c) : x >= r - 1 ? CAPE.deep : CAPE.lo);
  }
  // 뒷모습 지느러미 깃 (어깨 양끝 위로)
  finCollar(soft(g0), l0(shL, shHalf, c0) - 1, neck - 1, -1);
  finCollar(soft(g0), c0 + shHalf, neck - 1, 1);
}
const l0 = (_shL: number, h: number, c0: number) => c0 - h;

// ═════════════ 4. 월척 뜰채 (영구 대안) ═════════════
export const NETC: T = { hi: 0xe0b070, c: 0xb47c42, lo: 0x8a5a2e, deep: 0x5e3a1c };
const MESH = 0xeef2f4;
const MESH_LO = 0xb8c4cc;
const NET_GRIP = 0x2a2a30;
const SILVER = 0xd8e2ea;
const SILVER_HI = 0xffffff;
const SILVER_LO = 0x8a98a8;

/** 뜰채 (자루가 몸 반대편 허리 → 머리 왼쪽 위 둥근 테) */
function netGear(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const big = bigBody(fb);
  const n = neckY(m, fb);
  // 줄임 단계: 테를 몸 쪽으로 한 칸씩 (동글이·이불처럼 넓은 몸, 옆모습)
  const hx = (v === "side" ? cx - (big ? 8 : 6) : cx - (big ? 6 : 5)) + SH;
  const hy = Math.max(SAFE_TOP + 5, m.top - 1) + (SH >= 4 ? 1 : 0);
  const gx = v === "side" ? cx - 2 : cx + (big ? 5 : 4);
  const gy = KING ? Math.min(17, n + 4) : Math.min(24, n + 4);
  const steps = Math.max(Math.abs(gx - hx), Math.abs(gy - (hy + 3)));
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(hx + 1 + ((gx - hx - 1) * k) / steps);
    const y = Math.round(hy + 3 + ((gy - hy - 3) * k) / steps);
    g.set(x, y, k > steps - 3 ? NET_GRIP : k % 4 === 0 ? NETC.hi : NETC.c);
    if (k > 1 && k < steps - 2) g.set(x + 1, y, NETC.lo);
  }
  // 둥근 테 + 안쪽 그물 (체크) + 금 월척 꼬리가 테 위로 삐죽
  const ring: [number, number][] = [[-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -2], [2, -2], [-3, -1], [2, -1], [-3, 0], [2, 0], [-2, 1], [1, 1], [-1, 2], [0, 2]];
  for (const [dx, dy] of ring) g.set(hx + dx, hy + dy, dy < 0 && dx < 0 ? NETC.hi : dx > 0 ? NETC.lo : NETC.c);
  for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 1; dx++) if (!(dy === 1 && (dx === -2 || dx === 1))) g.set(hx + dx, hy + dy, (dx + dy + 40) % 2 ? MESH : MESH_LO);
  put(g, [[-1, -1], [0, -1], [-1, 0], [0, 0], [1, -1]], SILVER, hx, hy);
  g.set(hx - 1, hy - 1, SILVER_HI);
  g.set(hx + 1, hy, 0x5a3a10);
  put(g, [[-2, -4], [-1, -4], [-3, -5], [0, -5]], SILVER, hx, hy);
  g.set(hx - 1, hy - 5, SILVER_LO);
  if (v !== "side") put(g, [[-1, 3], [0, 3]], MESH_LO, hx, hy);
}
function netBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = brush(g0);
  if (v === "up") return;
  if (layer === "front" && v === "down" && !bigBody(fb) && !objectBody(body)) {
    const { shL, shY } = m;
    for (let k = 0; k < 5 && shY + k <= 24; k++) g.set(shL + 1 + k, shY + k, k % 2 ? NETC.lo : NETC.deep);
  }
}
function netBehind(g0: Grid, v: V, m: GearM, fb: FB): void {
  // 뒷모습은 뜰채가 머리·등 위로 (보는 쪽에 있다), 앞·옆은 머리·몸 뒤 빈칸에만
  if (v === "up") return netGear(brush(g0), v, m, fb);
  behindRec(g0, (t) => netGear(t, v, m, fb));
}


// ═════════════ 5. 영구 세트: 물빛 삿갓 (머리) ═════════════
export const SAK: T = { hi: 0x52a8bc, c: 0x2e7c94, lo: 0x1e5e74, deep: 0x123e50 };
function sakkatHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = brush(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  const side = v === "side";
  const brim = top + 1;
  // 넓고 납작한 원뿔: 꼭지(top-4) → 챙(머리보다 양옆 2칸 넓게). [y, 왼쪽 반폭, 오른쪽 반폭]
  // 줄임 단계: 챙을 한 칸씩 좁힌다 (동글이·이불은 기울기까지 생각하면 머리 폭까지)
  const B = Math.max(rx - 5, rx + 2 - SH);
  const rowsDef: [number, number][] = [
    [top - 4, 1],
    [top - 3, 2],
    [top - 2, Math.round(B * 0.45)],
    [top - 1, Math.round(B * 0.7)],
    [top, Math.round(B * 0.88)],
    [brim, B],
  ];
  const shift = side ? 1 : 0; // 옆모습은 꼭지가 살짝 앞(오른쪽)으로
  // 줄임 단계: 원뿔 꼭대기 줄부터 하나씩 낮춘다 (키다리처럼 머리 꼭대기가 칸 위에 가까운 몸)
  for (const [y, h] of rowsDef.filter(([yy], i) => i >= Math.max(0, Math.min(3, SH - 4)) && yy >= SAFE_TOP)) {
    const x0 = cx - h + (y < brim ? shift : 0);
    const x1 = cx + h - 1 + (y < brim ? shift : 0);
    for (let x = x0; x <= x1; x++) {
      // 대살 결 (꼭지에서 퍼지는 세로 줄) · 왼쪽 빛 · 오른쪽 그늘
      const rib = (x - cx + 40) % 2 === 0 && y > top - 3 && y < brim;
      let c = x === x0 ? SAK.hi : x >= x1 - 1 ? (x === x1 ? SAK.deep : SAK.lo) : rib ? SAK.lo : y <= top - 2 ? SAK.hi : SAK.c;
      if (y === brim) c = x === x0 || x === x1 ? GOLD_LO : GOLD; // 금테
      g.set(x, y, c);
    }
  }
  // 챙 양끝이 살짝 처진다 (앞·뒤) / 옆은 앞뒤로
  g.set(cx - B, brim + 1, SAK.lo);
  g.set(cx + B - 1, brim + 1, SAK.deep);
  // 꼭지 금 매듭
  if (top - 5 >= SAFE_TOP && SH < 4) {
    g.set(cx + shift - 1, top - 5, GOLD);
    g.set(cx + shift, top - 5, GOLD_HI);
  }
  // 금 잉어 장식: 챙 끝에 줄로 매달린 작은 금 잉어 (앞 = 왼쪽 끝, 옆 = 뒤쪽, 뒤 = 오른쪽 끝)
  // 금 잉어 장식은 칸이 좁으면(얼굴 위로 오게 되면) 뺀다
  const hx = v === "up" ? cx + B - 1 : cx - B;
  if (SH < 2 && brim + 4 <= 24) {
    g.set(hx, brim + 2, 0x6a4a30);
    g.set(hx, brim + 3, GOLD);
    g.set(hx, brim + 4, GOLD_LO);
    g.set(hx + (v === "up" ? -1 : 1), brim + 4, GOLD);
  }
  if (v === "down") {
    // 턱끈 (크림 끈 두 가닥 — 얼굴 옆으로)
    soft(g0).set(cx - rx + 1, brim + 1, 0xf2e6c8);
    soft(g0).set(cx + rx - 2, brim + 1, 0xf2e6c8);
  }
}

// ═════════════ 6. 영구 세트: 금방울 찌 목걸이 (목) ═════════════
export const FLOAT: T = { hi: 0xff8a7a, c: 0xe04a3c, lo: 0xb03028, deep: 0x7a1e1a };
const CORD = 0x3a2a22;
function floatNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const n = neckY(m, fb);
  const half = (bigBody(fb) ? 6 : fb === "tall" ? 3 : 4) + (objectBody(body) ? 1 : 0) - Math.min(SH, 2);
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  if (v === "up") {
    for (let x = x0; x <= x1; x++) g.set(x, n, x % 2 ? CORD : 0x5a4434);
    return;
  }
  // 끈 (짙은 갈색) + 양쪽에 큰 찌 둘 (2칸 폭 · 5줄: 빨강 머리 둘 · 흰 띠 · 빨강 · 끝 — 1배에서도 찌로 보이게) + 가운데 금방울
  for (let x = x0; x <= x1; x++) g.set(x, n, (x + 40) % 2 ? CORD : 0x5a4434);
  const fl = v === "side" ? [x1 - 4] : [cx - 5 + Math.min(SH, 2), cx + 3 - Math.min(SH, 2)];
  for (const fx of fl) {
    // 줄임 단계: 찌 끝을 한 줄씩 짧게 (앉은 자세처럼 목이 칸 바닥에 가까울 때)
    const col: Color[] = [FLOAT.hi, FLOAT.c, 0xfaf6ee, FLOAT.c, FLOAT.deep].slice(0, Math.max(1, Math.min(5 - SH, 24 - n + 1)));
    col.forEach((c, k) => {
      g.set(fx, n + k, k === 0 ? FLOAT.hi : c);
      g.set(fx + 1, n + k, k === 2 ? 0xd8d2c6 : k === col.length - 1 ? FLOAT.deep : FLOAT.lo);
    });
  }
  const bx = v === "side" ? x1 - 1 - Math.min(SH, 2) : cx - 1;
  g.set(bx, n + 1, GOLD_HI);
  g.set(bx + 1, n + 1, GOLD);
  g.set(bx, n + 2, GOLD);
  g.set(bx + 1, n + 2, GOLD_LO);
  if (SH === 0) {
    g.set(bx, n + 3, GOLD_LO);
    g.set(bx + 1, n + 3, 0x8a5a10);
  }
}

// ═════════════ 7. 영구 세트: 물빛 가슴장화 (옷) ═════════════
// 1배에서도 「장화 바지」로 보이게: 목 밑까지 올라오는 가슴판 + 어깨로 가는 짙은 멜빵 + 금 버클, 발엔 밝은 노란 고무장화(윗단·밑창)
export const WAD: T = { hi: 0x5a9c8a, c: 0x3a7a6a, lo: 0x285a4e, deep: 0x183c34 };
const BOOT = 0xf6c62a;
const BOOT_HI = 0xffe68a;
const BOOT_LO = 0xc8901a;
function wadersBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, sit };
  const big = bigBody(fb);
  const n = neckY(m, fb);
  if (big) {
    const top = bigTop(w) - 1;
    for (let y = top; y < 27; y++) {
      let l = 99;
      let r = -1;
      for (let x = 1; x <= 18; x++) if (g.filled(x, y) && (fb === "sheet" || inBall(w, x, y))) { l = Math.min(l, x); r = Math.max(r, x); }
      if (r < 0) continue;
      for (let x = l; x <= r; x++) if (g.filled(x, y)) g.set(x, y, x === l ? WAD.hi : x >= r - 1 ? (x === r ? WAD.deep : WAD.lo) : y === top ? WAD.hi : WAD.c);
    }
    if (v !== "side") {
      // 가슴판 위로 솟은 네모 + 멜빵 + 금 버클
      for (let x = cx - 2; x <= cx + 1; x++) for (let y = top - 2; y < top; y++) g.set(x, y, x === cx - 2 ? WAD.hi : x === cx + 1 ? WAD.lo : WAD.c);
      for (const [x0, d] of [[cx - 3, -1], [cx + 2, 1]] as const) for (let k = 0; k < 3; k++) soft(g0).set(x0 + d * k, top - 2 - k, WAD.deep);
      if (v === "down") { g.set(cx - 2, top - 2, GOLD); g.set(cx + 1, top - 2, GOLD); }
    }
    return;
  }
  const { top, bot } = torsoTB(w);
  // 가슴판: 목 줄 바로 아래부터 (좁게 두 줄) → 허리부터 몸 폭
  for (let y = n; y <= bot; y++) {
    const [l0, r0] = span(w, Math.max(y, top));
    const bib = y < top + 1 && v !== "up";
    const l = bib ? cx - 2 : l0;
    const r = bib ? cx + 1 : r0 - 1;
    row(g, y, l, r, (x, a, b) => (y === bot ? (x >= b - 1 ? WAD.deep : WAD.lo) : x === a ? WAD.hi : x === b ? WAD.deep : x === b - 1 ? WAD.lo : WAD.c));
  }
  if (v === "down") {
    // 멜빵 (가슴판 위 모서리 → 어깨 너머, 짙게) + 금 버클 + 가슴 주머니
    for (const [x0, d] of [[cx - 3, -1], [cx + 2, 1]] as const) for (let k = 0; k < 3; k++) soft(g0).set(x0 + d * Math.min(k, 1), n - k + 1, WAD.deep);
    g.set(cx - 2, n, GOLD);
    g.set(cx + 1, n, GOLD);
    g.set(cx - 1, n + 2, WAD.deep);
    g.set(cx, n + 2, WAD.deep);
  } else if (v === "up") {
    for (let k = 0; k < 4; k++) {
      g.set(cx - 3 + k, n + k, WAD.deep);
      g.set(cx + 2 - k, n + k, WAD.deep);
    }
  } else {
    for (let k = 0; k < 3; k++) g.set(cx + 1, n - 1 + k, WAD.deep);
    g.set(cx + 1, n, GOLD);
  }
}
/** 앞을 가리는 몸(상자·머그잔·튜브): 몸통 그림을 덮지 않고 목 줄에 가슴판 윗단 + 멜빵 + 금 버클만 (잡화점 앞치마와 같은 규칙 — 머그잔은 발도 안 보여 장화가 없다) */
function wadersNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  if (!objectBody(body)) return;
  const g = brush(g0);
  const { cx } = m;
  const n = neckY(m, fb);
  if (v === "down") {
    row(g, n, cx - 2, cx + 1, (x, a, b) => (x === a ? WAD.hi : x === b ? WAD.deep : WAD.c));
    g.set(cx - 2, n, GOLD);
    g.set(cx + 1, n, GOLD);
    for (const [x0, d] of [[cx - 3, -1], [cx + 2, 1]] as const) for (let k = 0; k < 2; k++) soft(g0).set(x0 + d * k, n - k, WAD.deep);
  } else if (v === "up") {
    for (let k = 0; k < 2; k++) {
      g.set(cx - 2 + k, n + k, WAD.deep);
      g.set(cx + 1 - k, n + k, WAD.deep);
    }
  } else {
    g.set(cx + 1, n, GOLD);
    g.set(cx + 1, n + 1, WAD.deep);
  }
}
/** 노란 고무장화: 몸·발을 다 그린 뒤(머리 차례) 그 프레임의 발 픽셀을 찾아 그 위로 장화 목을 세운다 (걷기·뛰기·매달리기 발 위치를 그대로 따라가고,
 *  앉기·수영처럼 발이 안 그려진 자세엔 장화도 없다). 맨 아래 발 줄은 그대로 두어 짙은 밑창이 된다 — 칸 밖으로는 한 칸도 안 나간다 */
const FEET = new Set([0x2a2520, 0x221e1a]);
function wadersBoots(g0: Grid): void {
  const g = brush(g0);
  const cols = new Map<number, number>();
  for (let y = 20; y <= FIT_Y1; y++)
    for (let x = FIT_X0; x <= FIT_X1; x++) {
      const v = g0.get(x, y);
      if (v & 255 && FEET.has(v >>> 8)) cols.set(x, Math.max(cols.get(x) ?? 0, y));
    }
  const xs = [...cols.keys()].sort((p, q) => p - q);
  xs.forEach((x, i) => {
    const yb = cols.get(x)!;
    const left = !cols.has(x - 1);
    const right = !cols.has(x + 1);
    for (let y = yb - 3; y < yb; y++) {
      if (y < SAFE_TOP) continue;
      g.set(x, y, y === yb - 3 ? BOOT_HI : left ? BOOT_HI : right ? BOOT_LO : BOOT);
    }
    void i;
  });
}

// ── 등록 ──
const JW_RAW: Readonly<Record<string, SsItem>> = {
  jw_carphat: { covers: true, head: (g, v, m, fb, top) => carpHead(g, v, m, fb, top) },
  jw_vest: { back: vestBack, neck: vestNeck },
  jw_cape: { headWorn: false, back: capeBack, head: capeOver },
  jw_net: { headWorn: false, back: netBack, head: (g, v, m, fb) => netBehind(g, v, m, fb) },
  jw_sedge: { covers: true, head: (g, v, m, fb, top) => sakkatHead(g, v, m, fb, top) },
  jw_bell: { neck: floatNeck },
  jw_waders: { headWorn: false, back: wadersBack, neck: wadersNeck, head: (g) => wadersBoots(g) },
};
/** 모든 자리 그리기를 adapt로 감싼다 (칸 밖·가장자리에 닿으면 저절로 한 단계씩 줄여 다시) */
export const JW_ITEMS: Readonly<Record<string, SsItem>> = Object.fromEntries(
  Object.entries(JW_RAW).map(([id, it]) => [
    id,
    {
      ...it,
      ...(it.head ? { head: adapt(it.head, `${id}.head`) } : {}),
      ...(it.neck ? { neck: adapt(it.neck, `${id}.neck`) } : {}),
      ...(it.back ? { back: adapt(it.back, `${id}.back`) } : {}),
    },
  ]),
);
/** 염색 묶음 (gearDye GEAR_DYE_REGIONS 모양): 천 4톤 */
export const JW_DYE: Readonly<Record<string, { colors: readonly Color[]; main: Color }>> = {
  jw_carphat: { colors: [CARP.hi, CARP.c, CARP.lo, CARP.deep], main: CARP.c },
  jw_vest: { colors: [VEST.hi, VEST.c, VEST.lo, VEST.deep], main: VEST.c },
  jw_cape: { colors: [CAPE.hi, CAPE.c, CAPE.lo, CAPE.deep], main: CAPE.c },
  jw_net: { colors: [NETC.hi, NETC.c, NETC.lo, NETC.deep], main: NETC.c },
  jw_sedge: { colors: [SAK.hi, SAK.c, SAK.lo, SAK.deep], main: SAK.c },
  jw_bell: { colors: [FLOAT.hi, FLOAT.c, FLOAT.lo, FLOAT.deep], main: FLOAT.c },
  jw_waders: { colors: [WAD.hi, WAD.c, WAD.lo, WAD.deep], main: WAD.c },
};

/** 좌대 코디 id인지 (이 파일이 그리는 것) */
export const isRaftGearArt = (id: string): boolean => id in JW_RAW;

// ── 프레임마다: 동작 묶음 + 처음 그 몸으로 그릴 때 줄임 단계 미리 정하기 ──
/** 그 몸·꾸미기 하나로 모든 방향·열을 한 번 그리는 함수 (avatar.ts가 avatarFrameGrid로 넣는다 — 이 파일이 avatarCore를 부르지 않게) */
let warmDraw: ((body: string, id: string) => void) | null = null;
export function setRaftGearWarm(fn: ((body: string, id: string) => void) | null): void {
  warmDraw = fn;
}
const warmed = new Set<string>();
let warming = false;
/**
 * avatarCore drawFrame이 프레임을 그리기 전에 부른다 (seasonSetGear ssBeginFrame). group = 그 프레임의 동작 묶음 (colGroup과 같은 이름).
 * 좌대 코디를 입은 몸을 처음 그리면 그 몸 × 앞·옆·뒤 × 28열을 그 꾸미기 하나로 먼저 그려 STICKY를 채운다 (시안 lib.mts prewarm과 같다)
 */
export function raftGearBeginFrame(body: string, group: string, ids: readonly string[]): void {
  CTX.group = group;
  if (warming || !warmDraw) return;
  for (const id of ids) {
    if (!(id in JW_RAW)) continue;
    const k = `${id}|${body}`;
    if (warmed.has(k)) continue;
    warmed.add(k);
    warming = true;
    try {
      warmDraw(body, id);
    } finally {
      warming = false;
      CTX.group = group;
    }
  }
}

// ── 아이콘 16×16 (가방·상점·매표소 목록) ──
const I_OUT = 0x1e1c1a;
const ICON_PAL = { G: GOLD, Y: GOLD_HI, L: GOLD_LO } as const;
export const ICONS6: Readonly<Record<string, () => Grid>> = {
  jw_carphat: () =>
    iconOf(
      [
        "....t.....t...",
        "...tT.....Tt..",
        ".wwww....wwww.",
        "wwbbw.hh.wbbww",
        "wwbbwhcchwbbww",
        ".wwwwcclcwwww.",
        ".hcccclccclcd.",
        "hcclccccclccdd",
        "hcccclcccclcdd",
        "pPpppppppppppq",
        ".pppppppppppq.",
      ],
      { h: CARP.hi, c: CARP.c, l: CARP.lo, d: CARP.deep, t: CARP.c, T: CARP.lo, w: EYE_W, b: EYE_B, p: LIP, P: LIP_HI, q: LIP_LO },
    ),
  jw_vest: () =>
    iconOf(
      [
        "...hc....cd...",
        "..hcc....ccd..",
        ".hcac....cpdd.",
        ".hcrc....cpPd.",
        "hcccc....ccccd",
        "hdddc.z..cdddd",
        "hhchc....chcld",
        "hcccc....cccld",
        "hdddc....cdddd",
        "hhchc....chcld",
        "hcccl....ccclld",
        "llllll..llllll",
      ],
      { h: VEST.hi, c: VEST.c, l: VEST.lo, d: VEST.deep, a: LURE_A, r: LURE_B, p: PATCH, P: PATCH_FISH, z: ZIP },
    ),
  jw_net: () =>
    iconOf(
      [
        "...hhhh.......",
        "..hmMmMc......",
        ".hMmssMmc.....",
        ".hmsSsmMc.....",
        ".hMssemMc.....",
        "..cMmMml......",
        "...ccll.......",
        "......cl......",
        ".......cl.....",
        "........cl....",
        ".........kk...",
        "..........kk..",
      ],
      { h: NETC.hi, c: NETC.c, l: NETC.lo, m: MESH, M: MESH_LO, s: SILVER, S: SILVER_HI, e: 0x5a3a10, k: NET_GRIP },
    ),
  jw_sedge: () =>
    iconOf(
      [
        "......YG......",
        "......hc......",
        ".....hhcl.....",
        "....hclcld....",
        "...hclclcld...",
        "..hcclclclld..",
        ".hcclclclcldd.",
        "LGGGGGGGGGGGGL",
        "l............d",
        "G.............",
        "L.............",
      ],
      { h: SAK.hi, c: SAK.c, l: SAK.lo, d: SAK.deep, ...ICON_PAL },
    ),
  jw_bell: () =>
    iconOf(
      [
        "kKkKkKkKkKkKkK",
        ".k..........k.",
        "..k........k..",
        "..hc..YG..hc..",
        "..cl..GL..cl..",
        "..ww..LG..ww..",
        "..cl..LL..cl..",
        "..dd......dd..",
      ],
      { h: FLOAT.hi, c: FLOAT.c, l: FLOAT.lo, d: FLOAT.deep, w: 0xfaf6ee, k: CORD, K: 0x5a4434, ...ICON_PAL },
    ),
  jw_waders: () =>
    iconOf(
      [
        "..d........d..",
        "...d......d...",
        "....dhccld....",
        "....GccccG....",
        "....hcddcd....",
        "..hhcccccclld.",
        "..hcccccccldd.",
        "..hccclhcccld.",
        "..hccl..hccld.",
        "..YBBb..YBBb..",
        "..YBBb..YBBb..",
        ".YBBBb..YBBBb.",
        ".bbbbb..bbbbb.",
      ],
      { h: WAD.hi, c: WAD.c, l: WAD.lo, d: WAD.deep, B: BOOT, Y: BOOT_HI, b: BOOT_LO, G: GOLD },
    ),
  jw_cape: () =>
    iconOf(
      [
        "..GGGGGGGGGL..",
        ".phcccccccclp.",
        "..hclcclccld..",
        ".hcc.GgGcclld.",
        ".hccGeGGGTld..",
        "hclcGGGGGTcldd",
        "hcccc.GGGclldd",
        "hclcccccccclld",
        "hcclcccclcclld",
        "GGGGGG..GGGGLL",
        "GG.........GLL",
      ],
      { h: CAPE.hi, c: CAPE.c, l: CAPE.lo, d: CAPE.deep, p: PEARL, g: GOLD_HI, e: 0x5a3a10, T: GOLD_LO, ...ICON_PAL },
      undefined,
      I_OUT,
    ),
};

/** seasonSetGear가 합친다 */
export const GEAR6: Readonly<Record<string, SsItem>> = JW_ITEMS;
