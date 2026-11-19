import { CAMP_DECKS, CAMP_DECK_H, CAMP_DECK_W, CAMP_FIRE, CAMP_SEATS, SNOWMAN_GAP, campSnowSpotOk } from "@tomb/protocol";
import * as Lay from "./campLayout";
import { campMeltAt } from "./campWinter";
import type { BallSize } from "./snowmanArt";

// 11/17 캠핑장 눈사람 만들기 — 장면 없이 도는 판정 (테스트한다).
// 눈더미 자리 · 굴린 거리 → 크기 · 내려놓을 수 있는 자리 · 쌓을 수 있는지 · 녹는 단계.
// 11/18 들고 다니기와 굴리기를 나눴다: 안고 걸으면 그대로, 굴릴 때(Space·[굴리기]를 누른 채)만 커진다 (heldStep · carryAt).
// 11/18 눈사람·덩이는 밑동에 작은 충돌 상자 (snowmanBlockRect · stackBlockRect) — 녹는 마지막 단계·물웅덩이는 지나간다.

type Pt = { x: number; y: number };

/** 굴린 거리(px)가 이만큼 넘으면 다음 크기 (머리 → 배 → 몸통) */
export const SNOWBALL_GROW_AT: readonly [number, number] = [150, 360];
/** 눈더미·내려놓은 덩이 앞에서 E가 닿는 거리 */
export const SNOW_REACH = 20;
/** 다 녹은 뒤 물웅덩이가 남는 시간 */
export const PUDDLE_MS = 20_000;

/** 굴린 거리 → 크기 */
export function sizeForRoll(dist: number): BallSize {
  return dist >= SNOWBALL_GROW_AT[1] ? 2 : dist >= SNOWBALL_GROW_AT[0] ? 1 : 0;
}

/**
 * 들고 있는 덩이가 한 걸음(moved px) 움직였을 때: 굴리는 중(rolling)이고 눈이 묻는 바닥(grows)이면 굴린 거리를 더하고 크기를 다시 본다.
 * 안고만 걸으면 그대로다. 몸통(2)이 가장 크다
 */
export function heldStep(h: { size: BallSize; dist: number }, moved: number, rolling: boolean, grows: boolean): { size: BallSize; dist: number } {
  if (!rolling || !grows || moved <= 0) return { size: h.size, dist: h.dist };
  const dist = h.dist + moved;
  const size = sizeForRoll(dist);
  return { size: size > h.size ? size : h.size, dist };
}

/** 굴리면 커지는 바닥인지 (눈 덮인 풀밭·바위 마당·광장 바깥 — 흙길·녹은 땅·물·버스 길은 아니다) */
export function snowRollGrows(x: number, y: number): boolean {
  const k = Lay.campGroundKind(x, y);
  return (k === "grass" || k === "rock" || k === "plaza" || k === "deckPad") && !campMeltAt(x, y);
}

/** 데크 위·바로 앞 (텐트 칠 자리라 비워 둔다) */
function onDeck(x: number, y: number, pad = 6): boolean {
  return CAMP_DECKS.some((d) => Math.abs(d.x - x) < CAMP_DECK_W / 2 + pad && y > d.y - CAMP_DECK_H / 2 - pad && y < d.y + CAMP_DECK_H / 2 + pad + 6);
}

/**
 * 눈덩이·눈사람을 내려놓을 수 있는 자리 (서버 campSnowSpotOk보다 좁게): 눈 바닥이고 걸을 수 있고(양옆도) 데크·앉는 자리·상호작용 자리가 아닌 곳.
 * others = 이미 서 있는 눈사람·내려놓은 덩이 (SNOWMAN_GAP만큼 떨어져야 한다)
 */
export function snowPlaceOk(x: number, y: number, others: Iterable<Pt> = []): boolean {
  if (!campSnowSpotOk(x, y)) return false;
  const k = Lay.campGroundKind(x, y);
  if (k !== "grass" && k !== "plaza" && k !== "rock" && k !== "path") return false;
  // 11/18 녹은 땅(모닥불 둘레)에도 세울 수 있게 (사용자) — 모닥불 자리 자체는 campSnowSpotOk가 막는다
  if (!Lay.campStandable(x, y) || !Lay.campStandable(x - 6, y) || !Lay.campStandable(x + 6, y)) return false;
  if (onDeck(x, y)) return false;
  if (CAMP_SEATS.some((s) => Math.abs(s.x - x) < 12 && Math.abs(s.y - y) < 12)) return false;
  if (Lay.CAMP_INTERACTABLES.some((o) => o.kind !== "deck" && Math.hypot(o.x - x, o.y - y) < o.r)) return false;
  for (const o of others) if (Math.hypot(o.x - x, (o.y - y) * 1.4) < SNOWMAN_GAP) return false;
  return true;
}

// ── 눈더미 자리 ──

/** 눈더미를 둘 대략의 자리 (구역마다 하나 — 정류장 앞 풀밭·데크 바깥 눈밭·타프 옆·계곡 건너 산책로·캠핑카 골목 끝) */
// 11/18 사용자 「여기저기」: 가장자리 위주 7곳 → 캠핑장 전체에 고르게 13곳 (가까운 빈 눈밭으로 맞춰지고 서로 120px 넘게 떨어진다)
const PILE_ANCHORS: readonly Pt[] = [
  { x: 330, y: 560 },
  { x: 880, y: 590 },
  { x: 360, y: 210 },
  { x: 880, y: 200 },
  { x: 1180, y: 470 },
  { x: CAMP_FIRE.x + 300, y: CAMP_FIRE.y + 30 },
  { x: 700, y: 610 },
  { x: 140, y: 380 },
  { x: 560, y: 150 },
  { x: 1080, y: 300 },
  { x: 190, y: 700 },
  { x: 1100, y: 700 },
  { x: 470, y: 440 },
];

let piles: Pt[] | null = null;
/** 눈더미 자리 (앵커 근처 가장 가까운 빈 눈밭 — 나무·데크·앉는 자리·상호작용·길과 떨어진 곳). 한 번만 계산 */
export function campSnowPiles(): readonly Pt[] {
  if (piles) return piles;
  const out: Pt[] = [];
  for (const a of PILE_ANCHORS) {
    let best: Pt | null = null;
    let bd = Infinity;
    const R = 80;
    for (let y = a.y - R; y <= a.y + R; y += 4)
      for (let x = a.x - R; x <= a.x + R; x += 4) {
        const d = (x - a.x) ** 2 + (y - a.y) ** 2;
        if (d >= bd || d > R * R) continue;
        if (Lay.campGroundKind(x, y) !== "grass" || Lay.pathEdgeDist(x, y, 8) < 8) continue;
        if (!snowPlaceOk(x, y) || !Lay.campStandable(x - 16, y) || !Lay.campStandable(x + 16, y) || !Lay.campStandable(x, y - 8)) continue;
        if (Lay.CAMP_TREES.some((t) => Math.abs(t.x - x) < 24 && y > t.y - 20 && y < t.y + 24)) continue;
        if (Lay.CAMP_DECOR.some((t) => Math.abs(t.x - x) < 18 && Math.abs(t.y - y) < 10)) continue;
        if (onDeck(x, y, 16)) continue;
        if (Lay.CAMP_INTERACTABLES.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 16)) continue;
        if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 120)) continue;
        bd = d;
        best = { x, y };
      }
    if (best) out.push(best);
  }
  piles = out;
  return out;
}

// ── 쌓기 ──

/** 내려놓은 덩이 (아래부터 크기) */
export type LocalStack = { sizes: BallSize[] };

/** 그 덩이 위에 이 크기를 올릴 수 있는지: ok · full(이미 세 단) · bigger(위가 더 작거나 같다) */
export function stackCheck(st: LocalStack, size: BallSize): "ok" | "full" | "bigger" | "skip" {
  if (st.sizes.length >= 3) return "full";
  const top = st.sizes[st.sizes.length - 1];
  if (size >= top) return "bigger";
  // 11/19 한 단씩만 (몸통 위에 머리를 바로 올리면 배를 못 끼워 영영 못 끝내고 내 몫 한 칸을 막았다)
  return size === top - 1 ? "ok" : "skip";
}

/** 11/19 이 덩이에 아직 올릴 수 있는 단이 남았나 (세 단 전이고 맨 위가 머리가 아니다) */
export function stackOpen(st: LocalStack): boolean {
  return st.sizes.length > 0 && st.sizes.length < 3 && st.sizes[st.sizes.length - 1] > 0;
}

/** 세 단(몸통·배·머리)이 다 쌓였나 */
export function stackDone(st: LocalStack): boolean {
  return st.sizes.length === 3 && st.sizes[0] === 2 && st.sizes[1] === 1 && st.sizes[2] === 0;
}

// ── 11/18 못 지나가게 (밑동 충돌 상자) ──

export type Rect = { x: number; y: number; w: number; h: number };

/** 다 세운 눈사람 밑동 (발 위치 x,y — 몸통 아래쪽만. 위에서 오면 몸통 뒤에, 아래에서 오면 앞에 선다) */
export function snowmanBlockRect(x: number, y: number): Rect {
  return { x: x - 6, y: y - 5, w: 12, h: 5 };
}

/** 내려놓은 덩이 밑동 (바로 앞에 서서 올리고 다시 들 수 있게 작게) */
export function stackBlockRect(x: number, y: number): Rect {
  return { x: x - 4, y: y - 4, w: 8, h: 4 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 이 녹는 단계부터는 막지 않는다 (마지막 단계 — 거의 다 녹았다) */
export const MELT_PASS_STAGE = 3;

// ── 녹기 ──

/** 녹은 정도(protocol snowmanMelt 0..1) → 그림 단계 0~3 */
export function meltStage(melt: number): number {
  if (melt <= 0) return 0;
  return melt < 0.4 ? 1 : melt < 0.8 ? 2 : 3;
}

/** 굴리는 동안 눈덩이 자리: 발 앞 (방향 dir — 0 아래·1 왼쪽·2 오른쪽·3 위, 반지름 r) */
export function ballFront(x: number, y: number, dir: number, r: number): Pt {
  switch (dir) {
    case 1:
      return { x: x - r - 7, y: y + 1 };
    case 2:
      return { x: x + r + 7, y: y + 1 };
    case 3:
      return { x, y: y - Math.max(5, r * 0.9) - 3 };
    default:
      return { x, y: y + r * 1.8 + 3 };
  }
}

/**
 * 품에 안은 덩이 자리 (덩이 가운데, 화면 px). handUp = 발바닥에서 손까지 높이 (sprites/avatar handAnchor), r·ry = 덩이 반지름, scale = 바베큐로 커진 배율.
 *  - 앞(아래를 볼 때): 몸 앞으로 내밀어 낮게 안는다 (덩이 아래가 발끝보다 조금 앞 — 머리가 큰 아바타라 높이 들면 얼굴을 다 가린다)
 *  - 옆: 몸 앞쪽 손 높이 · 위(뒷모습): 몸 뒤에 (depth -) 손 높이 — 양옆 장갑만 삐져나온다
 */
export function carryAt(x: number, y: number, dir: number, r: number, ry: number, handUp: number, scale = 1): { x: number; y: number; depth: number } {
  const lift = (scale - 1) * handUp * 0.6;
  switch (dir) {
    case 1:
    case 2: {
      const up = Math.max(ry + 1.5, handUp - 3) * scale;
      return { x: x + (dir === 1 ? -1 : 1) * (r * 0.5 + 4) * scale, y: y - up, depth: y + 0.4 };
    }
    case 3:
      return { x, y: y - Math.max(ry + 1.5, handUp + 1) * scale, depth: y - 0.4 };
    default:
      return { x, y: y + 3 - ry - lift, depth: y + 0.4 };
  }
}
