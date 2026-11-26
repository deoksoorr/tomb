import { CAMP_FIRE, CAMP_HOME_SEATS, CAMP_SEATS, SNOWMAN_GAP, campSnowSpotOk } from "@tomb/protocol";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";
import { BUNGEO_SPOTS, bungeoTalks, bungeoVendorAt } from "@/lib/bungeo/cart";
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
 * 안고만 걸으면 그대로다. 몸통(2)이 가장 크다.
 * max = 11/26 이보다 크게는 안 커진다 (몸통만 놓인 내 덩이가 있으면 배까지 — 굴린 거리도 그 바로 아래에서 멈춘다)
 */
export function heldStep(h: { size: BallSize; dist: number }, moved: number, rolling: boolean, grows: boolean, max: BallSize = 2): { size: BallSize; dist: number } {
  if (!rolling || !grows || moved <= 0) return { size: h.size, dist: h.dist };
  let dist = h.dist + moved;
  let size = sizeForRoll(dist);
  if (size > max && max < 2) {
    size = max;
    dist = Math.max(h.dist, (max === 0 ? SNOWBALL_GROW_AT[0] : SNOWBALL_GROW_AT[1]) - 1);
  }
  return { size: size > h.size ? size : h.size, dist };
}

/** 굴리면 커지는 바닥인지 (눈 덮인 풀밭·바위 마당·광장 바깥 — 흙길·녹은 땅·물·버스 길은 아니다) */
export function snowRollGrows(x: number, y: number): boolean {
  const k = Lay.campGroundKind(x, y);
  return (k === "grass" || k === "rock" || k === "plaza" || k === "pad" || k === "foot") && !campMeltAt(x, y);
}

/**
 * 눈덩이·눈사람을 내려놓을 수 있는 자리 (서버 campSnowSpotOk보다 좁게): 눈 바닥이고 걸을 수 있고(양옆도) 집터·앉는 자리·상호작용 자리가 아닌 곳.
 * others = 이미 서 있는 눈사람·내려놓은 덩이 (SNOWMAN_GAP만큼 떨어져야 한다)
 */
export function snowPlaceOk(x: number, y: number, others: Iterable<Pt> = []): boolean {
  if (!campSnowSpotOk(x, y)) return false;
  const k = Lay.campGroundKind(x, y);
  if (k !== "grass" && k !== "plaza" && k !== "rock" && k !== "path" && k !== "foot") return false;
  // 11/18 녹은 땅(모닥불 둘레)에도 세울 수 있게 (사용자) — 모닥불 자리 자체는 campSnowSpotOk가 막는다
  if (!Lay.campStandable(x, y) || !Lay.campStandable(x - 6, y) || !Lay.campStandable(x + 6, y)) return false;
  if (CAMP_SEATS.some((s) => Math.abs(s.x - x) < 12 && Math.abs(s.y - y) < 12)) return false;
  if (Lay.CAMP_INTERACTABLES.some((o) => Math.hypot(o.x - x, o.y - y) < o.r)) return false;
  for (const o of others) if (Math.hypot(o.x - x, (o.y - y) * 1.4) < SNOWMAN_GAP) return false;
  return true;
}

// ── 눈더미 자리 ──

/** 눈더미를 둘 대략의 자리 (구역마다 하나 — 캠핑장 전체에 고르게, 가까운 빈 눈밭으로 맞춰지고 서로 120px 넘게 떨어진다) */
// 11/26 폭포 계곡 개편: 정류장 앞 · 펜션 정원 · 족욕탕 아래 · 카라반 골목 · 계곡 건너 · 저수지 둑 · 캠프파이어 존 둘레
const PILE_ANCHORS: readonly Pt[] = [
  { x: 330, y: 620 },
  { x: 250, y: 440 },
  { x: 372, y: 300 },
  { x: 470, y: 480 },
  { x: 560, y: 620 },
  { x: 760, y: 470 },
  { x: 860, y: 640 },
  { x: 920, y: 380 },
  { x: 900, y: 140 },
  { x: 1250, y: 560 },
  { x: CAMP_FIRE.x - 120, y: CAMP_FIRE.y + 30 },
  { x: 760, y: 760 },
  { x: 120, y: 720 },
];

/** 눈더미와 채집 지점 사이 (눈더미 E 닿는 거리 SNOW_REACH + 6에 지점 닿는 거리 14를 더한 것보다 멀게) */
export const PILE_NODE_GAP = 48;
/** 눈더미와 집 앞마당 자리·일어서는 자리 사이 (E 대상끼리 40px 넘게 — 캠핑장_배치규칙.md) */
export const PILE_SEAT_GAP = 44;

let piles: Pt[] | null = null;
/** 눈더미 자리 (앵커 근처 가장 가까운 빈 눈밭 — 나무·집터·앉는 자리·상호작용·길과 떨어진 곳). 한 번만 계산 */
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
        if (Lay.inSite(x, y, 12) || Lay.inHome(x, y, 12, 12)) continue;
        if (Lay.CAMP_INTERACTABLES.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 16)) continue;
        // 11/26 채집 지점 바로 옆이면 E가 눈 뭉치기로 가서 「E 광석 캐기」가 안 됐다 (계곡 둑 qo720_470)
        if (CAMP_GATHER_NODES.some((n) => Math.hypot(n.x - x, n.y - y) < PILE_NODE_GAP)) continue;
        // 11/26 집 앞마당 자리·일어서는 자리 바로 옆이면 E가 눈 뭉치기로 가서 앉지 못했다 (카라반 3·6번 앞마당 — 자리가 자리 끝까지 나온다)
        if (CAMP_HOME_SEATS.some((q) => Math.hypot(q.x - x, q.y - y) < PILE_SEAT_GAP || Math.hypot(q.x + (q.standDx ?? 0) - x, q.y + (q.standDy ?? 9) - y) < PILE_SEAT_GAP)) continue;
        // 11/26 밤에만 서는 상점 자리(수레 몸통·장수·말 걸기)는 비운다
        if (BUNGEO_SPOTS.some((s) => s.map === "camp" && [{ x: s.x, y: s.y - 20 }, bungeoVendorAt(s), ...bungeoTalks(s)].some((p) => Math.hypot(p.x - x, p.y - y) < PILE_SEAT_GAP + 8))) continue;
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

// ── 11/26 다 세운 내 눈사람 길게 눌러 허물기 ──

export type BreakHold = { id: string; at: number } | null;

/**
 * 한 프레임: target = 바로 앞 내 눈사람 id (없으면 null), held = X·[허물기]를 누르고 있다.
 * 떼거나 멀어지거나 다른 눈사람으로 옮기면 처음부터. 다 차면 fire = 그 id, 그 뒤엔 손을 뗄 때까지(spent) 다시 세지 않는다. k = 0..1 막대
 */
export function breakHoldStep(
  hold: BreakHold,
  spent: boolean,
  target: string | null,
  held: boolean,
  now: number,
  ms: number,
): { hold: BreakHold; spent: boolean; k: number; fire: string | null } {
  if (!held) spent = false;
  if (!target || !held || spent) return { hold: null, spent, k: 0, fire: null };
  const h = hold?.id === target ? hold : { id: target, at: now };
  const k = Math.min(1, (now - h.at) / ms);
  if (k < 1) return { hold: h, spent, k, fire: null };
  return { hold: null, spent: true, k: 1, fire: target };
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
