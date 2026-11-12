import { spotSeatId } from "@tomb/protocol";
import type { Interactable, Rect } from "./layout";

// 광장 놀거리 (50번) — 순수 데이터와 연출 수식. 그림·소리는 PlazaRides.ts, 조각배는 BoatRide.ts.
//  - 소원 분수: 광장 북쪽 입구. 여럿이 같이 쓴다 (1인 자리 아님) → E로 동전 던지기 창 (서버 /api/plaza/wish)
//  - 시소: 양 끝이 각각 1인 자리(SPOT_KINDS.seesaw). 둘 다 앉으면 번갈아 오르내린다
//  - 트램펄린: 1인 자리(SPOT_KINDS.trampoline). 높이 통통
//  - 회전목마: 목마마다 1인 자리(SPOT_KINDS.carousel). 앵커 = 목마의 기준 자리(회전 각 0일 때), 그림은 벽시계(Date.now)로 함께 돈다
// 회전·시소 위상은 모든 사람의 벽시계(Date.now)로 정해서 따로 주고받지 않아도 같은 모습으로 보인다.
// 충돌은 작은 받침만 (분수 수반·목마 기둥·시소 받침) — 앉는 자리 위에는 충돌이 없다 (world.test가 확인).

/** 소원 분수 (수반 아래 가운데). 놀거리 자리는 F1 맵(모닥불 광장 네 귀퉁이)에 맞춘다 */
export const WISH_FOUNTAIN = { x: 720, y: 300 } as const;
/** 시소 (받침 가운데). 앉는 자리는 양 끝 ±SEESAW_HALF */
export const SEESAWS: readonly { x: number; y: number }[] = [{ x: 864, y: 596 }];
export const SEESAW_HALF = 18;
/** 트램펄린 (매트 가운데) */
export const TRAMPOLINES: readonly { x: number; y: number }[] = [{ x: 872, y: 300 }];
/** 회전목마 (받침 가운데) */
export const CAROUSELS: readonly { x: number; y: number }[] = [{ x: 584, y: 592 }];
/** 회전목마 목마 수 · 도는 반지름(가로·세로, 위에서 비스듬히 본 타원) · 한 바퀴 시간 */
export const CAROUSEL_HORSES = 4;
export const CAROUSEL_RX = 24;
export const CAROUSEL_RY = 10;
export const CAROUSEL_PERIOD_MS = 12_000;
/** 시소 한 번 오르내리는 시간 · 끝이 오르내리는 높이 */
export const SEESAW_PERIOD_MS = 2_400;
export const SEESAW_LIFT = 5;
/** 시소 받침 높이 (판 가운데가 땅에서 이만큼 위) */
export const SEESAW_PIVOT = 6;
/** 트램펄린 한 번 튀는 시간 · 최고 높이 · 매트 높이 */
export const TRAMPOLINE_PERIOD_MS = 1_050;
export const TRAMPOLINE_HEIGHT = 26;
export const TRAMPOLINE_MAT = 4;

export type RideKind = "seesaw" | "trampoline" | "carousel";

/** 시소 양 끝 자리 (index 0 = 왼쪽, 1 = 오른쪽) */
export function seesawSeats(s: { x: number; y: number }): { x: number; y: number }[] {
  return [
    { x: s.x - SEESAW_HALF, y: s.y },
    { x: s.x + SEESAW_HALF, y: s.y },
  ];
}

/** 회전목마 목마 i의 각 (rad). 0 = 앞(아래), 반시계 방향으로 고르게 */
export function horseAngle(i: number, now: number): number {
  return (i / CAROUSEL_HORSES) * Math.PI * 2 + ((now % CAROUSEL_PERIOD_MS) / CAROUSEL_PERIOD_MS) * Math.PI * 2;
}

/** 각 → 타원 위 자리 (각 0 = 받침 가운데 바로 아래) */
export function ringPoint(c: { x: number; y: number }, angle: number): { x: number; y: number } {
  return { x: c.x + Math.sin(angle) * CAROUSEL_RX, y: c.y + Math.cos(angle) * CAROUSEL_RY };
}

/** 회전목마 목마 자리(앵커 = 각 0일 때의 자리, 정수) */
export function carouselSeats(c: { x: number; y: number }): { x: number; y: number }[] {
  return Array.from({ length: CAROUSEL_HORSES }, (_, i) => {
    const p = ringPoint(c, (i / CAROUSEL_HORSES) * Math.PI * 2);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  });
}

/** 목마 오르내림 (px, 위로 +). 목마마다 위상이 다르다 */
export function horseBob(i: number, now: number): number {
  return 1.5 + 1.5 * Math.sin(now / 420 + i * 1.7);
}

/**
 * 시소 기울기 −1..1 (+ = 왼쪽 끝이 올라감). 둘 다 앉으면 번갈아 오르내리고(끝에서 잠깐 머문다),
 * 한쪽만 앉으면 그쪽이 내려앉아 있고, 아무도 없으면 왼쪽이 내려앉아 있다.
 */
export function seesawTilt(left: boolean, right: boolean, now: number): number {
  if (left && right) {
    const s = Math.sin(((now % SEESAW_PERIOD_MS) / SEESAW_PERIOD_MS) * Math.PI * 2);
    // 끝에서 잠깐 머물게 (발로 땅을 차는 느낌)
    return Math.max(-1, Math.min(1, s * 1.35));
  }
  if (right && !left) return 1;
  return -1;
}

/** 시소 끝(side 0 왼쪽 / 1 오른쪽)의 판 높이 (땅에서 위로 px) */
export function seesawEndHeight(side: 0 | 1, tilt: number): number {
  const t = side === 0 ? tilt : -tilt;
  return SEESAW_PIVOT + t * SEESAW_LIFT;
}

/** 트램펄린 위 높이 (px, 위로 +). phaseMs = 탄 뒤 흐른 시간. 착지 순간 매트가 살짝 꺼진다(음수) */
export function trampolineHeight(phaseMs: number): number {
  const u = (((phaseMs % TRAMPOLINE_PERIOD_MS) + TRAMPOLINE_PERIOD_MS) % TRAMPOLINE_PERIOD_MS) / TRAMPOLINE_PERIOD_MS;
  // 0.0~0.12: 매트에 눌림, 그 뒤 포물선
  if (u < 0.12) return -2 * Math.sin((u / 0.12) * Math.PI);
  const v = (u - 0.12) / 0.88;
  return TRAMPOLINE_HEIGHT * 4 * v * (1 - v);
}

// ── 시소 움직임 (F5 묶음 · 사용자 요청: 메트로놈 말고 불규칙한 박자·세기, 그래도 모두에게 같은 모습) ──
// 둘이 타면 "블록"(SEESAW_BLOCK_MS) 단위로 반 번 오르내림(구간)들을 시드 난수로 만든다: 시드 = 시소 자리 + 블록 번호,
// 시각 = 서버 시계 → 같은 시각이면 누구 화면에서나 같은 기울기. 블록은 늘 왼쪽이 땅에 닿은 채 시작·끝나서 이어진다.
//  - 구간 = 땅에 닿은 쪽이 무릎을 굽혀 버티다(hold, push) → 박차고 반대쪽으로 넘어가 쿵(착지). 넘어가는 빠르기·버티는 시간이 매번 다르다
//  - 가끔 약하게 차서 덜 올라갔다 같은 쪽으로 다시 내려앉는다(stutter)
//  - 착지 순간 위로 올라간 사람은 자리에서 살짝 튀어 오른다(pop) — 빨리 넘어갈수록 크게
export const SEESAW_BLOCK_MS = 8_000;
type SeesawSeg = { t0: number; hold: number; travel: number; from: 0 | 1; to: 0 | 1; amp: number; pop: number; strength: number };
export type SeesawMotion = {
  /** −1(왼쪽 땅) … +1(오른쪽 땅). seesawEndHeight에 넣는다 */
  tilt: number;
  /** 무릎을 굽혀 땅을 차고 있는 쪽 (없으면 null) */
  push: 0 | 1 | null;
  /** 자리에서 튀어 오른 높이 (px, 쪽마다) */
  pop: [number, number];
  /** 가장 최근 착지: 고유 번호·시각·쪽·세기(0..1) — 쿵 소리·먼지 */
  landId: number;
  landAt: number;
  landSide: 0 | 1;
  landStrength: number;
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const blockCache = new Map<string, SeesawSeg[]>();

/** 한 블록의 구간들 (시드 고정). 시작·끝 모두 왼쪽(0)이 땅 */
export function seesawBlock(seed: number, block: number): SeesawSeg[] {
  const key = `${seed}:${block}`;
  const hit = blockCache.get(key);
  if (hit) return hit;
  const r = mulberry(Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(block | 0, 0x85ebca6b) ^ 0x5eed);
  const crossings = r() < 0.65 ? 4 : 6;
  const stutterAt = r() < 0.55 ? Math.floor(r() * crossings) : -1;
  const raw: { hold: number; travel: number; full: boolean; amp: number }[] = [];
  for (let i = 0; i < crossings; i++) {
    if (i === stutterAt) raw.push({ hold: 0.12 + r() * 0.2, travel: 0.38 + r() * 0.2, full: false, amp: 0.3 + r() * 0.3 });
    raw.push({ hold: 0.15 + r() * 0.5, travel: 0.55 + r() * 0.5, full: true, amp: 1 });
  }
  const total = raw.reduce((a, g) => a + g.hold + g.travel, 0);
  const k = SEESAW_BLOCK_MS / total;
  const minTravel = 0.55 * k;
  const segs: SeesawSeg[] = [];
  let t = 0;
  let down: 0 | 1 = 0;
  for (const g of raw) {
    const hold = g.hold * k;
    const travel = g.travel * k;
    const to: 0 | 1 = g.full ? (down === 0 ? 1 : 0) : down;
    const speed = minTravel / travel; // 0.5..1
    segs.push({ t0: t, hold, travel, from: down, to, amp: g.amp, pop: g.full ? 0.6 + 1.6 * speed * speed : 0, strength: g.full ? 0.55 + 0.45 * speed : 0.3 });
    t += hold + travel;
    down = to;
  }
  if (blockCache.size > 64) blockCache.clear();
  blockCache.set(key, segs);
  return segs;
}

const downTilt = (side: 0 | 1) => (side === 0 ? -1 : 1);
/** 넘어가는 동안의 진행 (0..1): 박차는 순간과 쿵 닿는 순간에도 속도가 남아 있다 */
const travelEase = (v: number) => 0.6 * v + 0.4 * (0.5 - 0.5 * Math.cos(Math.PI * v));
const POP_MS = 240;

/**
 * 시소 움직임. seed = 시소 자리(seesawSeed), t = 서버 시계(ms).
 * 둘 다 탔을 때만 오르내리고, 한 명이면 그쪽이 땅에 앉아 살짝 들썩(idle), 아무도 없으면 왼쪽이 내려앉아 있다
 */
export function seesawMotion(seed: number, left: boolean, right: boolean, t: number): SeesawMotion {
  const out: SeesawMotion = { tilt: -1, push: null, pop: [0, 0], landId: 0, landAt: 0, landSide: 0, landStrength: 0 };
  if (!(left && right)) {
    if (!left && !right) return out;
    const side: 0 | 1 = left ? 0 : 1;
    // 혼자: 발로 땅을 톡톡 — 끝이 아주 살짝 들렸다 내려앉는다
    const w = Math.max(0, Math.sin(t / 420 + seed * 0.37)) ** 3;
    out.tilt = downTilt(side) * (1 - 0.14 * w);
    out.push = w > 0.2 ? side : null;
    return out;
  }
  const block = Math.floor(t / SEESAW_BLOCK_MS);
  const bt = t - block * SEESAW_BLOCK_MS;
  const segs = seesawBlock(seed, block);
  let i = segs.length - 1;
  while (i > 0 && segs[i].t0 > bt) i--;
  const g = segs[i];
  const u = bt - g.t0;
  // 바로 앞 착지 (이 구간의 시작 = 앞 구간의 끝). 블록 첫 구간이면 앞 블록의 마지막 구간
  const prev = i > 0 ? segs[i - 1] : seesawBlock(seed, block - 1)[seesawBlock(seed, block - 1).length - 1];
  const prevIndex = i > 0 ? i - 1 : -1;
  if (u < g.hold) {
    out.tilt = downTilt(g.from);
    out.push = g.from;
    out.landId = block * 16 + prevIndex;
    out.landAt = t - u;
    out.landSide = g.from;
    out.landStrength = prev.strength;
    // 방금 위로 올라간 쪽(앞 구간에서 박찬 쪽)이 살짝 튄다
    if (prev.pop > 0 && u < POP_MS) out.pop[prev.from] = prev.pop * Math.sin((u / POP_MS) * Math.PI);
    return out;
  }
  const v = Math.min(1, (u - g.hold) / g.travel);
  const a = downTilt(g.from);
  if (g.to !== g.from) {
    out.tilt = a + (downTilt(g.to) - a) * travelEase(v);
  } else {
    // 약하게 차서 덜 올라갔다 같은 쪽으로 다시
    out.tilt = a - a * 2 * g.amp * Math.sin(Math.PI * v);
  }
  out.landId = block * 16 + prevIndex;
  out.landAt = g.t0 + block * SEESAW_BLOCK_MS;
  out.landSide = g.from;
  out.landStrength = prev.strength;
  return out;
}

/** 시소 시드 (자리 좌표 — 옮겨 놓으면 박자도 달라진다) */
export function seesawSeed(s: { x: number; y: number }): number {
  return (Math.imul(s.x | 0, 73856093) ^ Math.imul(s.y | 0, 19349663)) >>> 0;
}

// ── 트램펄린에서 내리기 (F14) ──
/** 뛰어내리는 자리: 매트 가운데(앵커보다 4px 위)에서 이 타원 위 (옆 땅) */
export const TRAMP_OFF_RX = 27;
export const TRAMP_OFF_RY = 12;

/**
 * 뛰어내릴 수 있는 순간: 매트를 밟고 다시 튀어 오르는 때 (한 번 튀는 주기의 처음 쪽).
 * 트램펄린 높이는 서버 시계로 정해져서, 이 순간에 뛰면 다른 사람 화면에서도 매트 높이에서 이어진다
 */
export function trampolineLaunch(t: number): boolean {
  const u = (((t % TRAMPOLINE_PERIOD_MS) + TRAMPOLINE_PERIOD_MS) % TRAMPOLINE_PERIOD_MS) / TRAMPOLINE_PERIOD_MS;
  return u >= 0.03 && u < 0.12;
}

/** 뛰어내릴 자리 후보: 누른 방향(ax, ay — 없으면 아래)부터 가까운 각도 순으로 8곳 */
export function trampolineLandings(t: { x: number; y: number }, ax: number, ay: number): { x: number; y: number }[] {
  const base = Math.hypot(ax, ay) > 0.1 ? Math.atan2(ay, ax) : Math.PI / 2;
  const out: { x: number; y: number }[] = [];
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const a = base + (k * Math.PI) / 4;
    out.push({ x: Math.round(t.x + Math.cos(a) * TRAMP_OFF_RX), y: Math.round(t.y - 4 + Math.sin(a) * TRAMP_OFF_RY) });
  }
  return out;
}

// ── 회전목마 그리는 순서 (F15) ──
/** 가운데 기둥의 depth = 받침 가운데 y. 앞쪽(아래)으로 도는 목마·사람(y > 가운데)은 기둥 앞, 뒤쪽은 뒤 */
export function carouselPoleDepth(c: { x: number; y: number }): number {
  return c.y;
}

// ── 상호작용 대상 (layout.interactables()가 더한다) ──
export function rideInteractables(): Interactable[] {
  const out: Interactable[] = [
    {
      id: "wish:fountain",
      kind: "wish",
      x: WISH_FOUNTAIN.x,
      y: WISH_FOUNTAIN.y + 12,
      r: 20,
      ax: WISH_FOUNTAIN.x,
      ay: WISH_FOUNTAIN.y + 12,
      label: "소원 분수에 동전 던지기",
    },
  ];
  for (const s of SEESAWS)
    seesawSeats(s).forEach((p, i) =>
      out.push({ id: `seesaw:${s.x}:${s.y}:${i}`, kind: "seesaw", x: p.x + (i ? 4 : -4), y: p.y + 3, r: 12, ax: p.x, ay: p.y, label: "시소 타기" }),
    );
  for (const t of TRAMPOLINES) out.push({ id: `trampoline:${t.x}:${t.y}`, kind: "trampoline", x: t.x, y: t.y + 6, r: 16, ax: t.x, ay: t.y, label: "트램펄린 뛰기" });
  for (const c of CAROUSELS)
    out.push({ id: `carousel:${c.x}:${c.y}`, kind: "carousel", x: c.x, y: c.y + CAROUSEL_RY + 12, r: 22, ax: c.x, ay: c.y + CAROUSEL_RY + 12, label: "회전목마 타기" });
  return out;
}

/** 놀거리의 1인 자리 id 목록 (회전목마는 목마마다) — 상호작용 하나에 자리가 여럿일 수 있다 */
export function rideSpotIds(o: Pick<Interactable, "kind" | "ax" | "ay" | "id">): string[] {
  if (o.kind === "seesaw") return [spotSeatId("seesaw", o.ax, o.ay)];
  if (o.kind === "trampoline") return [spotSeatId("trampoline", o.ax, o.ay)];
  if (o.kind === "carousel") {
    const c = CAROUSELS.find((k) => o.id === `carousel:${k.x}:${k.y}`);
    return c ? carouselSeats(c).map((p) => spotSeatId("carousel", p.x, p.y)) : [];
  }
  return [];
}

/** 놀거리 충돌 (점프로도 못 넘는 받침만) */
export function rideColliders(): Rect[] {
  const out: Rect[] = [{ x: WISH_FOUNTAIN.x - 22, y: WISH_FOUNTAIN.y - 12, w: 44, h: 12 }];
  for (const s of SEESAWS) out.push({ x: s.x - 3, y: s.y - 3, w: 6, h: 3 });
  for (const c of CAROUSELS) out.push({ x: c.x - 3, y: c.y - 3, w: 6, h: 3 });
  return out;
}

/** 소품을 흩뿌릴 때 피할 자리 (가운데, 반지름) */
export const RIDE_KEEPOUT: readonly { x: number; y: number; r: number }[] = [
  { ...WISH_FOUNTAIN, r: 30 },
  ...SEESAWS.map((s) => ({ ...s, r: 30 })),
  ...TRAMPOLINES.map((t) => ({ ...t, r: 22 })),
  ...CAROUSELS.map((c) => ({ ...c, r: 40 })),
];

// ── 놀거리 소리가 들리는 범위 ──
// 탄 사람에게는 그대로, 타지 않은 사람에게는 바로 옆(1칸까지 그대로, 2.5칸 밖이면 0)에서만 작게.
// 예전에는 260~360px(16~22칸)까지 퍼져 광장 가운데 모닥불에 앉아 있어도 들렸다.

/** 구경꾼에게 놀거리 효과음이 그대로 들리는 거리 (px, 1칸) */
export const RIDE_HEAR_NEAR = 16;
/** 구경꾼에게 놀거리 효과음이 완전히 사라지는 거리 (px, 2.5칸) */
export const RIDE_HEAR_FAR = 40;
/** 구경꾼에게 들리는 크기 (탄 사람 대비) */
export const RIDE_BYSTANDER_GAIN = 0.5;
/** 회전목마 오르골 크기 (탄 사람에게만) */
export const CAROUSEL_ORGAN_LEVEL = 0.8;

/** 타지 않은 사람에게 놀거리 효과음이 들리는 크기 0..RIDE_BYSTANDER_GAIN (d: 소리 난 곳까지 거리 px) */
export function bystanderGain(d: number): number {
  if (!Number.isFinite(d) || d >= RIDE_HEAR_FAR) return 0;
  const k = d <= RIDE_HEAR_NEAR ? 1 : 1 - (d - RIDE_HEAR_NEAR) / (RIDE_HEAR_FAR - RIDE_HEAR_NEAR);
  return RIDE_BYSTANDER_GAIN * k;
}

/** 회전목마 오르골 크기: 내가 목마에 타고 있을 때만 들린다 (옆에 서 있거나 모닥불에 앉아 있으면 0) */
export function carouselOrganLevel(riding: boolean): number {
  return riding ? CAROUSEL_ORGAN_LEVEL : 0;
}
