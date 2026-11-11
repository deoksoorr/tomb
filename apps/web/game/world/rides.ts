import { spotSeatId } from "@tomb/protocol";
import type { Interactable, Rect } from "./layout";

// 광장 놀거리 (50번) — 순수 데이터와 연출 수식. 그림·소리는 PlazaRides.ts, 조각배는 BoatRide.ts.
//  - 소원 분수: 광장 북쪽 입구. 여럿이 같이 쓴다 (1인 자리 아님) → E로 동전 던지기 창 (서버 /api/plaza/wish)
//  - 시소: 양 끝이 각각 1인 자리(SPOT_KINDS.seesaw). 둘 다 앉으면 번갈아 오르내린다
//  - 트램펄린: 1인 자리(SPOT_KINDS.trampoline). 높이 통통
//  - 회전목마: 목마마다 1인 자리(SPOT_KINDS.carousel). 앵커 = 목마의 기준 자리(회전 각 0일 때), 그림은 벽시계(Date.now)로 함께 돈다
// 회전·시소 위상은 모든 사람의 벽시계(Date.now)로 정해서 따로 주고받지 않아도 같은 모습으로 보인다.
// 충돌은 작은 받침만 (분수 수반·목마 기둥·시소 받침) — 앉는 자리 위에는 충돌이 없다 (world.test가 확인).

/** 소원 분수 (수반 아래 가운데) */
export const WISH_FOUNTAIN = { x: 1024, y: 304 } as const;
/** 시소 (받침 가운데). 앉는 자리는 양 끝 ±SEESAW_HALF */
export const SEESAWS: readonly { x: number; y: number }[] = [{ x: 966, y: 648 }];
export const SEESAW_HALF = 18;
/** 트램펄린 (매트 가운데) */
export const TRAMPOLINES: readonly { x: number; y: number }[] = [{ x: 1084, y: 640 }];
/** 회전목마 (받침 가운데) */
export const CAROUSELS: readonly { x: number; y: number }[] = [{ x: 856, y: 668 }];
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
