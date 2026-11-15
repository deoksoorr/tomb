import { CAMP_DECK_COUNT, CAMP_DECKS, CAMP_FIRE, CAMP_LOOKOUT } from "@tomb/protocol";

// 11/15 캠핑장 전망대 망원경 — 순수 계산 (Phaser 없음, vitest가 본다).
// 망원 뷰: 카메라를 광장으로 옮겨 확대하고(CameraRig.cinematic) 화면 고정 렌즈 테두리를 덮는다.
// 텐트는 다음 차수에 생긴다 — LookoutTent 목록을 받을 자리만 열어 두고, 지금은 빈 배열(빈 데크).

/** 망원 뷰 확대 배율 (평소 3배보다 넓게 — 광장과 둘레 데크가 한눈에) */
export const SCOPE_ZOOM = 2.4;
/** 처음 겨누는 곳: 큰 모닥불 조금 아래 (광장과 위·아래 데크가 함께 보인다) */
export const SCOPE_HOME = { x: CAMP_FIRE.x, y: CAMP_FIRE.y + 8 } as const;
/** 겨눌 수 있는 범위: 처음 자리 둘레 타원 (데크 고리 바깥 조금까지) */
export const SCOPE_RANGE = { rx: 290, ry: 200 } as const;
/** 방향키로 훑는 속도 (월드 px/초) */
export const SCOPE_PAN_SPEED = 170;
/** 망원경 받침 (전망대 데크 가운데, 두 벤치 사이 난간 앞) */
export const SCOPE_STAND = { x: CAMP_LOOKOUT.x + CAMP_LOOKOUT.w / 2 - 2, y: CAMP_LOOKOUT.y + 26 } as const;

/** 텐트 하나 (다음 차수: 서버가 알려 주는 데크별 텐트). style = 텐트 종류 id, lit = 안에 불, people = 둘레에 있는 사람 수 */
export type LookoutTent = { deck: number; style?: string; lit?: boolean; people?: number };
export type LookoutTentView = { deck: number; x: number; y: number; style: string | null; lit: boolean; people: number };

type Pt = { x: number; y: number };

/** 겨눈 곳을 범위 타원 안으로 */
export function clampAim(p: Pt): Pt {
  const dx = (p.x - SCOPE_HOME.x) / SCOPE_RANGE.rx;
  const dy = (p.y - SCOPE_HOME.y) / SCOPE_RANGE.ry;
  const d = Math.hypot(dx, dy);
  if (d <= 1) return { x: p.x, y: p.y };
  return { x: SCOPE_HOME.x + (dx / d) * SCOPE_RANGE.rx, y: SCOPE_HOME.y + (dy / d) * SCOPE_RANGE.ry };
}

/** 방향 입력(-1..1)으로 dt(ms) 동안 겨눈 곳을 옮긴다 */
export function stepAim(aim: Pt, ax: number, ay: number, dt: number): Pt {
  const k = (SCOPE_PAN_SPEED * Math.min(dt, 100)) / 1000;
  return clampAim({ x: aim.x + ax * k, y: aim.y + ay * k });
}

/** 손에 든 망원경의 작은 흔들림 (화면 px). 움직임 줄이기면 0 */
export function swayAt(ms: number, reduced: boolean): Pt {
  if (reduced) return { x: 0, y: 0 };
  const t = ms / 1000;
  return { x: Math.sin(t * 0.9) * 1.6 + Math.sin(t * 2.3 + 1) * 0.6, y: Math.cos(t * 0.7) * 1.2 + Math.sin(t * 1.9) * 0.5 };
}

/** 텐트 불빛 깜빡임 0.55..1 (텐트마다 다르게) */
export function flicker(ms: number, seed: number): number {
  const t = ms / 1000;
  const v = 0.5 + 0.5 * Math.sin(t * 7.1 + seed * 1.7) * Math.sin(t * 3.3 + seed);
  return 0.55 + 0.45 * (0.65 + 0.35 * v);
}

/** 받은 텐트 목록 → 그릴 것 (없는 데크 번호는 버리고, 같은 데크는 마지막 것, 사람은 0~3) */
export function tentViews(list: readonly LookoutTent[]): LookoutTentView[] {
  const byDeck = new Map<number, LookoutTentView>();
  for (const t of list) {
    if (!Number.isInteger(t.deck) || t.deck < 1 || t.deck > CAMP_DECK_COUNT) continue;
    const d = CAMP_DECKS[t.deck - 1];
    byDeck.set(t.deck, { deck: t.deck, x: d.x, y: d.y, style: typeof t.style === "string" && t.style ? t.style : null, lit: t.lit === true, people: Math.max(0, Math.min(3, Math.floor(t.people ?? 0))) });
  }
  return [...byDeck.values()].sort((a, b) => a.deck - b.deck);
}

/** 렌즈 가운데에 가장 가까운 데크 (가운데에서 너무 멀면 null) */
export function aimedDeck(aim: Pt, maxDist = 60): number | null {
  let best: number | null = null;
  let bd = maxDist;
  for (const d of CAMP_DECKS) {
    const dist = Math.hypot(d.x - aim.x, d.y - aim.y);
    if (dist < bd) {
      bd = dist;
      best = d.n;
    }
  }
  return best;
}

/** 렌즈 아래 한 줄 안내 */
export function scopeCaption(deck: number | null, tents: readonly LookoutTentView[]): string {
  if (deck === null) return "방향키로 둘러봐요. E를 누르면 내려놓아요.";
  const t = tents.find((v) => v.deck === deck);
  if (!t) return `${deck}번 데크는 비어 있어요.`;
  if (t.lit) return `${deck}번 데크 텐트에 불이 켜져 있어요.`;
  return `${deck}번 데크에 텐트가 있어요.`;
}
