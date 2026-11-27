import type { CampHomeKind } from "@tomb/protocol";
import type { HouseSound } from "@/game/housing/houseSfx";
import type { EmoteIcon } from "@/game/sprites/emotes";
import type { FurnitureDef } from "../catalog";

// 11/27 캠핑장 집 종류별 전용 가구·바닥·벽지 (campOnly) — 한 줄 형식과 상호작용 선언.
//
// 집 종류마다 파일 하나 (caravan.ts · pension.ts · rural.ts): 그 종류 NPC(언젠가 씨·소슬댁·순이 할머니)만 팔고,
// 그 종류 집 주인만 사고, 그 종류 집에만 놓는다 (서버 규칙은 catalog campOnlyBlock · layout validateLayout · service buyFurnitureMe · campExclusive/service).
// 그림은 game/housing/campExclusive/<종류>Art.ts. 이 파일의 타입은 순수 데이터라 서버·클라이언트가 같이 쓴다 (게임 타입은 import type만).
//
// 값은 확정 값 그대로 (SPECIAL_FURNITURE_PRICE_MUL을 곱하지 않는다), 꾸밈 점수 = 값 ÷ 20.
// 가구는 모두 네 방향(spin), 바닥에 까는 러그(rug)만 90°씩 돌린다(turn). 바닥·벽지는 1×1 스킨.

/** 놓인 방향: 0 앞(아래를 봄) · 1 왼쪽을 봄 · 2 뒤(위를 봄) · 3 오른쪽을 봄 (layout spinDir과 같은 번호) */
export type CxDir = 0 | 1 | 2 | 3;

/**
 * 앉거나 눕는 자리 하나. x·y = 그 방향으로 놓인 가구 차지 칸(옆을 보면 가로·세로가 바뀐 칸)의 왼쪽 위에서 사람 발(앵커)까지 px.
 * face = 사람이 보는 쪽 (0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽). 같은 배치면 모든 화면에서 같은 자리 id가 나온다 (서버가 한 자리 한 명).
 */
export type CxSeat = {
  x: number;
  y: number;
  face: CxDir;
  /** 눕기 (침대 자리 — 누운 그림). 없으면 앉기 */
  lie?: boolean;
  /** 누운 그림 기울기 (도). 90 = 머리가 위로 오게 왼쪽 옆 침대, -90 = 오른쪽 옆, 180 = 뒤 (interact.ts 침대 참고) */
  tilt?: number;
  /** 가구 그림이 사람 앞에 그려진다 (뒤돌아 앉은 의자: 등받이가 앞) */
  behind?: boolean;
  /** 발이 가구 차지 칸 밖이면 false (책상 앞 의자처럼). 기본 true */
  inside?: boolean;
  /**
   * 눕는 자리(lie)의 덮개: true = 그림 파일 coverArt[가구 id], 문자열 = coverArt[그 키] (방향 d마다 그림 — game/housing/campExclusive/types.ts 「덮개」).
   * 없거나 그림이 없으면 마을 침대 보라 이불
   */
  cover?: true | string;
  /**
   * 앉은·누운 사람 그림의 깊이(y 정렬)를 따로 (x·y와 같은 칸 기준 px — 그 깊이 줄보다 아래 그림이 사람 앞에 온다).
   * 벙커 침대 위층처럼 발이 차지 칸 위(y < 0)에 있는 자리에 쓴다. 이런 자리는 가구 그림 깊이를 끌어올리지 않는다
   */
  depthY?: number;
  /**
   * 11/27 드나드는 길 (벙커 침대 사다리 등 — 없으면 예전처럼 바로 자리로): 자리에 들 때 길 첫 점까지 걸어가 차례로 지난 뒤 자리에 눕고(앉고),
   * 일어날 때는 거꾸로 지나 첫 점에 내려선다. 점 x·y는 자리와 같은 칸 기준 px (lib cxEnterAt — 걷기·사다리 속도)
   */
  enter?: readonly CxEnterStep[];
  /**
   * 11/27 고르는 자리 이름 (벙커 침대 「위칸 눕기」·「아래칸 눕기」): 한 가구에 이름 붙은 자리가 둘 이상 비어 있으면
   * E를 누를 때 가장 가까운 자리 대신 고르는 말풍선을 띄운다 (하나만 비었으면 그 자리로 바로). 안내는 act.pickLabel
   */
  pick?: string;
};

/**
 * 드나드는 길의 한 점 (앞 점에서 이 점까지의 구간 표시). climb = 사다리 (사다리를 보고 — 뒷모습 걸음, 사다리 속도, 가구 그림 앞),
 * behind = 가구 그림 뒤 (먼 쪽 사다리), front = 가구 그림 앞 (사다리 꼭대기 ↔ 자리 — 장면이 붙인다). 아무것도 없으면 평소 깊이(발 y)
 */
export type CxEnterStep = { x: number; y: number; climb?: boolean; behind?: boolean; front?: boolean };

/** 그 구간에서 그릴 깊이 (base = 가구 그림 깊이, floor = 가구 뒤라도 이보다 앞 — 방 안쪽 벽 그림 앞). null = 평소 깊이 */
export function cxEnterDepth(seg: Pick<CxEnterStep, "climb" | "behind" | "front">, y: number, base: number, floor = -Infinity): number | null {
  if (seg.behind) return Math.min(base - 0.5, Math.max(y, floor));
  if (seg.climb || seg.front) return Math.max(y, base + 0.5);
  return null;
}
/** 드나드는 길 속도 (px/초) */
export const CX_ENTER_SPEED = { walk: 60, climb: 36 } as const;

/**
 * 드나드는 길 위 t ms 뒤의 자리 (pts[0]에서 출발, 구간 i = pts[i−1] → pts[i]의 climb·behind).
 * dx·dy = 지금 가는 쪽 (멈췄으면 0), done = 끝까지 갔다
 */
export function cxEnterAt(pts: readonly CxEnterStep[], t: number): { x: number; y: number; dx: number; dy: number; climb: boolean; behind: boolean; front: boolean; done: boolean } {
  let left = Math.max(0, t) / 1000;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const sec = len / (b.climb ? CX_ENTER_SPEED.climb : CX_ENTER_SPEED.walk);
    if (len > 0 && left < sec) {
      const k = left / sec;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len, climb: !!b.climb, behind: !!b.behind, front: !!b.front, done: false };
    }
    left -= sec;
  }
  const z = pts[pts.length - 1] ?? { x: 0, y: 0 };
  return { x: z.x, y: z.y, dx: 0, dy: 0, climb: !!z.climb, behind: !!z.behind, front: !!z.front, done: true };
}

type Pt = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
/** 선분 a→b가 사각형 안쪽(테두리 0.5px 안)을 지나는지 (Liang–Barsky) */
function crosses(a: Pt, b: Pt, r: Box): boolean {
  const q = { x0: r.x0 + 0.5, y0: r.y0 + 0.5, x1: r.x1 - 0.5, y1: r.y1 - 0.5 };
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [pp, qq] of [
    [-dx, a.x - q.x0],
    [dx, q.x1 - a.x],
    [-dy, a.y - q.y0],
    [dy, q.y1 - a.y],
  ] as const) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/**
 * 드나드는 길 첫 점까지 걸어갈 때 가구(r = 차지 칸을 바깥으로 넓힌 사각형)를 가로지르지 않게 사이에 넣을 모서리 점들.
 * 안에서 출발하면 가까운 테두리로 먼저 나간다. 가로지르지 않으면 빈 줄
 */
export function cxDetour(a: Pt, b: Pt, r: Box): Pt[] {
  const out: Pt[] = [];
  let s = a;
  if (a.x > r.x0 && a.x < r.x1 && a.y > r.y0 && a.y < r.y1) {
    const ds = [a.x - r.x0, r.x1 - a.x, a.y - r.y0, r.y1 - a.y];
    const k = ds.indexOf(Math.min(...ds));
    s = k === 0 ? { x: r.x0, y: a.y } : k === 1 ? { x: r.x1, y: a.y } : k === 2 ? { x: a.x, y: r.y0 } : { x: a.x, y: r.y1 };
    out.push(s);
  }
  if (!crosses(s, b, r)) return out;
  const c: Pt[] = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  const len = (pts: Pt[]) => pts.reduce((n, p, i) => n + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  let best: Pt[] | null = null;
  const routes: Pt[][] = [...c.map((k) => [k]), ...c.flatMap((k, i) => [[k, c[(i + 1) % 4]], [k, c[(i + 3) % 4]]])];
  for (const via of routes) {
    const pts = [s, ...via, b];
    if (pts.some((p, i) => i > 0 && crosses(pts[i - 1], p, r))) continue;
    if (!best || len([s, ...via, b]) < len([s, ...best, b])) best = via;
  }
  return [...out, ...(best ?? [])];
}

/**
 * 걸어서 갈 길 (집 안 발 자리 격자 step px — to에 맞춘 격자, 8방향, 모서리 끼어 가기 없음). blocked = 발이 못 서는 자리 (벽·가구 몸 — HouseScene footBlocked).
 * 찾으면 지날 점들(출발 점 빼고 to 포함, 곧게 갈 수 있는 점은 줄인다), 못 찾으면 null. limit = 찾는 범위 (방 테두리)
 */
export function cxWalkRoute(from: Pt, to: Pt, blocked: (x: number, y: number) => boolean, limit: Box, step = 4): Pt[] | null {
  const clear = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let i = 1; i <= n; i++) if (blocked(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
    return true;
  };
  if (blocked(to.x, to.y)) return null;
  if (clear(from, to)) return [to];
  const cx0 = Math.ceil((limit.x0 - to.x) / step);
  const cx1 = Math.floor((limit.x1 - to.x) / step);
  const cy0 = Math.ceil((limit.y0 - to.y) / step);
  const cy1 = Math.floor((limit.y1 - to.y) / step);
  const W = cx1 - cx0 + 1;
  const H = cy1 - cy0 + 1;
  if (W <= 0 || H <= 0 || W * H > 40_000) return null;
  const at = (i: number): Pt => ({ x: to.x + (cx0 + (i % W)) * step, y: to.y + (cy0 + Math.floor(i / W)) * step });
  const free = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) free[i] = blocked(at(i).x, at(i).y) ? 0 : 1;
  // 출발: 가장 가까운 빈 격자 (출발 점에서 곧게 닿는 곳)
  let start = -1;
  let best = Infinity;
  for (let i = 0; i < W * H; i++) {
    if (!free[i]) continue;
    const p = at(i);
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < best && d <= step * 2 && clear(from, p)) {
      best = d;
      start = i;
    }
  }
  const goal = (0 - cy0) * W + (0 - cx0);
  if (start < 0 || goal < 0 || goal >= W * H) return null;
  const prev = new Int32Array(W * H).fill(-2);
  prev[start] = -1;
  const q = [start];
  for (let h = 0; h < q.length && prev[goal] === -2; h++) {
    const i = q[h];
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!free[j] || prev[j] !== -2) continue;
      if (dx && dy && (!free[y * W + nx] || !free[ny * W + x])) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (prev[goal] === -2) return null;
  const cells: Pt[] = [];
  for (let i = goal; i >= 0; i = prev[i]) cells.unshift(at(i));
  // 곧게 갈 수 있는 점은 건너뛴다
  const out: Pt[] = [];
  let cur = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let j = cells.length - 1; j > k; j--)
      if (clear(cur, cells[j])) {
        far = j;
        break;
      }
    out.push(cells[far]);
    cur = cells[far];
    k = far + 1;
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

/**
 * 드나드는 길이 막혔는지: 사다리(climb)가 아닌 점과 그 사이(걸어서·가구 뒤로 지나는 바닥)가 모두 발이 설 수 있어야 한다.
 * own = 그 가구 차지 칸 (안의 점은 가구 위라 보지 않는다 — 아래 끝은 발 상자 높이만큼 더)
 */
export function cxEnterBlocked(path: readonly CxEnterStep[], blocked: (x: number, y: number) => boolean, own: Box): boolean {
  // 발 상자(발 위 5px)가 그 가구 몸에 닿는 줄까지는 그 가구 칸으로 친다 (사다리 밑에서 첫 칸에 오르는 걸음)
  const inOwn = (x: number, y: number) => x >= own.x0 && x <= own.x1 && y >= own.y0 && y < own.y1 + 6;
  const bad = (x: number, y: number) => !inOwn(x, y) && blocked(x, y);
  for (let i = 0; i < path.length; i++) {
    const b = path[i];
    if (b.climb) continue;
    if (bad(b.x, b.y)) return true;
    const a = path[i - 1];
    if (!a || a.climb) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let k = 1; k < n; k++) if (bad(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)) return true;
  }
  return false;
}

/** (x, y)가 드나드는 길 위(선분에서 r px 안)면 그 구간의 끝 점 (다른 사람 그림 깊이 — 사다리 위면 가구 앞·뒤) */
export function cxEnterSeg(pts: readonly CxEnterStep[], x: number, y: number, r = 2.5): CxEnterStep | null {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const k = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0;
    if (Math.hypot(a.x + vx * k - x, a.y + vy * k - y) <= r) return b;
  }
  return null;
}

/** 서서 E 한 번 연출 (seasonUse SeasonFx와 같다): 잠깐 바뀌는 그림 변형 v(ms 동안) · 머리 위 이모티콘 · 소리 · 한마디 · 제자리 폴짝 */
export type CxFx = {
  /** 앉은 채 E 안내 (seatFx만 — 「E · 주사위 굴리기 · X 일어나기」). 없으면 「써 보기」 */
  label?: string;
  v?: string;
  ms?: number;
  emote?: EmoteIcon;
  sfx?: HouseSound;
  lines?: readonly string[];
  jump?: boolean;
};

/**
 * 켜기·끄기 (방 상태로 저장 — lib/housing/states STATE_MAX). 값 a = 0..steps−1, E마다 다음 값(마지막 다음은 0).
 * 값 0 = 처음 놓았을 때 모습. startOn이면 값 0이 켜진 모습(등잔처럼), 아니면 값 0이 꺼진 모습.
 * 그림 변형: 켜져 있으면 "on", 값이 0이 아니면 "s{a}" (예: TV 채널 2 → "s2-on", 처음부터 켜진 등잔을 끄면 "s1").
 * 밤 빛 번짐(FurnitureDef.light)은 켜져 있을 때만.
 */
export type CxToggle = {
  /** 값 개수 (켜기·끄기 = 2, 채널을 돌리면 3 이상). 기본 2 */
  steps?: number;
  /** 값 0이 켜진 모습 */
  startOn?: boolean;
  /** E 안내: [켜져 있을 때, 꺼져 있을 때] (예: ["랜턴 끄기", "랜턴 켜기"]) */
  label: readonly [whenOn: string, whenOff: string];
  /** 켜고 끌 때 소리 (기본 click) */
  sfx?: HouseSound;
  /** 값마다 E 안내 (labels[a] = 지금 값 a일 때 E가 할 일 — 있으면 label보다 먼저) */
  labels?: readonly string[];
  /** 켜져 있는 동안 그림 장면을 차례로 (변형 끝에 붙는 조각 — 예 ["", "f1", "", "f2"] · 불꽃·미러볼·선풍기 고개). 움직임 줄이기면 멈춘다 */
  anim?: { frames: readonly string[]; ms: number };
  /**
   * 켜져 있을 때 E = 켜 둔 채로 쓰기 (act.fx 연출 + act.hold — 노래방 「노래하기」), 끄기는 X(터치 [앉기]).
   * label = 켜져 있을 때 E 안내, offLabel = X 안내 (예 { label: "노래하기", offLabel: "끄기" })
   */
  useWhileOn?: { label: string; offLabel: string };
};

/**
 * 가구 하나의 상호작용 (game/housing/interact.ts가 읽는다 — 아래 중 하나만 주는 것을 권한다).
 *  - seats: 방향마다 앉기·눕기 자리 (w·h = 그 방향 차지 칸 px)
 *  - around: 가구 둘레 빈 칸마다 한 자리 (촌캉스 밥상 규칙 — 보드게임 탁자·식탁). farIn = 먼 쪽(위) 자리를 칸 안으로 당기는 px (낮은 상)
 *  - toggle: 켜기·끄기 (+ fx를 같이 주면 켤 때 그 연출도)
 *  - fx: 서서 E 연출 (가구 앞 빈 칸에 서서 바라본다 — seasonStandSpot)
 *  - rug: 바닥 러그 빈 칸에 앉기 (니트 러그 규칙)
 *  - seatAnim: 누가 앉아 있는 동안 그림 장면을 차례로 (흔들의자 ["", "f1", "", "f2"]) + 앉은 사람 흔들기 sway [dx, dy] (장면마다)
 *  - seatFx: 앉아 있을 때 E = 이 연출 (보드게임 주사위). 일어나기는 X·점프·움직이기
 *  - near: 가까이(r px) 다가가면 한 번 머리 위 이모티콘·한마디 (난로에 손 녹이기 — 내 화면만)
 *  - hold: E로 쓸 때(fx · 켤 때 toggle) 캐릭터 손에 작은 그림 (그림 파일 heldArt[item] — game/housing/campExclusive/types.ts 「손에 들기」).
 *    ms(기본 4000) 동안 또는 움직일 때까지, 같은 방 사람에게도 보인다
 * 아무것도 없으면 E 대상이 아니다 (상점 use 문구만 보인다).
 */
export type CxAct = {
  seats?: (d: CxDir, w: number, h: number) => readonly CxSeat[];
  /** mode "sideCenter" = 변마다 가운데 한 자리 (그 변 칸이 모두 비어야 — 보드게임 4자리) */
  around?: { farIn?: number; mode?: "sideCenter" };
  toggle?: CxToggle;
  fx?: CxFx;
  rug?: true;
  hold?: { item: string; ms?: number };
  /** 11/27 고르는 자리(seats pick)가 둘 이상 비었을 때 E 안내 (예 「눕기 (위칸·아래칸)」) */
  pickLabel?: string;
  seatAnim?: CxSeatAnim;
  seatFx?: CxFx;
  near?: { r: number; emote?: EmoteIcon; lines?: readonly string[] };
};

/**
 * 누가 앉아 있는 동안 장면 (CxAct.seatAnim). 장면 번호는 장면 시계(모든 화면이 같은 식)로 정해 가구 그림과 앉은 사람이 같은 장면을 쓴다.
 *  - ms: 장면 하나 길이, 또는 장면마다 길이 (길이 = frames — 끝에서 느리고 가운데서 빠른 흔들의자처럼)
 *  - sway: 장면마다 앉은 사람 [dx, dy] (모든 방향 같은 값)
 *  - sitPose: 놓인 방향 d · 장면 i마다 앉은 사람 [dx, dy, 기울기°] — 있으면 sway 대신. 기울기는 발 원점(자리) 기준 시계 방향 (옆을 본 흔들의자가 젖혀질 때)
 * 움직임 줄이기면 첫 장면 그대로, 앉은 사람도 움직이지 않는다.
 */
export type CxSeatAnim = {
  frames: readonly string[];
  ms: number | readonly number[];
  sway?: readonly (readonly [number, number])[];
  sitPose?: (d: CxDir, i: number) => readonly [dx: number, dy: number, angle?: number];
};

/** 장면 시계: 시각 t(ms)에 몇 번째 장면인지 (ms가 장면마다 다르면 그 길이대로) */
export function cxAnimIndex(ms: number | readonly number[], n: number, t: number): number {
  if (n <= 0) return 0;
  if (typeof ms === "number") return Math.floor(t / Math.max(50, ms)) % n;
  const lens = Array.from({ length: n }, (_, i) => Math.max(16, ms[i] ?? ms[ms.length - 1] ?? 100));
  let r = t % lens.reduce((a, x) => a + x, 0);
  for (let i = 0; i < n; i++) {
    if (r < lens[i]) return i;
    r -= lens[i];
  }
  return n - 1;
}

/** 종류 파일의 한 줄 */
export type CxRow = {
  /** cx_cv_* · cx_pn_* · cx_rr_* */
  id: string;
  name: string;
  /** 상점 설명 한 문장 (해요체) */
  desc: string;
  /** 확정 값 (P) — 점수는 값 ÷ 20 */
  price: number;
  /** 앞모습 칸 (바닥·벽지는 1×1) */
  w: number;
  h: number;
  /** 집에서 E로 할 수 있는 일 (상점 안내 — 앉기·눕기·켜기·끄기·열기…) */
  use?: string;
  /** 바닥·벽지 스킨 */
  skin?: "floor" | "wall";
  /** 바닥층 러그 (걸어 지나가고 위에 가구를 올린다, 90°씩 돌린다) */
  rug?: true;
  /** 칸 전체 발밑 그늘을 깔지 않는다 (기둥만 바닥에 닿는 물건 — 그림 안에 발 그늘을 그린다) */
  noShadow?: true;
  /** 밤 빛 (toggle이 있으면 켜졌을 때만). dx·dy = 빛 자리 (차지 칸 아래 가운데에서 px, dy는 위로 음수 — 오른쪽을 보면 dx 좌우 뒤집음) */
  light?: FurnitureDef["light"];
  act?: CxAct;
};

/** 종류 파일 한 줄 → 카탈로그 한 줄 (값 그대로, 점수 = 값 ÷ 20, 가구는 네 방향·러그는 돌리기) */
export function cxDefs(kind: CampHomeKind, rows: readonly CxRow[]): FurnitureDef[] {
  return rows.map((r): FurnitureDef => ({
    id: r.id,
    name: r.name,
    desc: r.desc,
    category: r.skin ? "skin" : "camp",
    price: r.price,
    score: r.price / 20,
    w: r.skin ? 1 : r.w,
    h: r.skin ? 1 : r.h,
    ...(r.use ? { use: r.use } : {}),
    ...(r.skin ? { skin: r.skin } : r.rug ? { floor: true, turn: true } : { spin: true }),
    ...(r.light ? { light: r.light } : {}),
    campOnly: kind,
  }));
}
