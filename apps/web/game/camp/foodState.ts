import { bbqActive, bbqBig, bbqItem, DRUNK_STEP_MS, drunkLevel, isBbqEffect, isDrunkState, type BbqEffect, type BbqItemId, type DrunkState, type PeerInfo } from "@tomb/protocol";

// 11/15 캠핑장 바베큐장 효과 상태 (Phaser 없음 — 테스트·UI도 쓴다). 그리기는 foodFx.ts

export type FoodState = { grow?: BbqEffect; spd?: BbqEffect; drunk?: DrunkState };

const STORE_KEY = "tomb.foodfx";
/** 화면 어질어질은 이 단계부터 */
export const DIZZY_LEVEL = 3;
/** 딸꾹 말풍선 간격 (ms, 대략) */
export const HICCUP_MS = 14_000;

function load(): FoodState {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    return {
      ...(isBbqEffect(o.grow) && o.grow.u > now ? { grow: o.grow } : {}),
      ...(isBbqEffect(o.spd) && o.spd.u > now ? { spd: o.spd } : {}),
      ...(isDrunkState(o.drunk) && drunkLevel(o.drunk, now) > 0 ? { drunk: o.drunk } : {}),
    };
  } catch {
    return {};
  }
}

/** 내 효과 (장면 사이에 하나) */
let mine: FoodState | null = null;
export function myFood(): FoodState {
  mine ??= load();
  return mine;
}
/** 내 효과를 바꾸고 기억한다 */
export function setMyFood(f: FoodState): void {
  mine = f;
  saveMine();
  for (const fn of listeners) fn();
}
const listeners = new Set<() => void>();
/** 내 효과가 바뀌면 부른다 (효과 게이지 HUD). 돌려준 함수로 끊는다 */
export function onMyFood(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** 지금 내가 커져 있는 배율 (1 = 그대로). 커진 동안에는 타는 것을 못 탄다 */
export function myBig(now = Date.now()): number {
  return bbqBig(myFood().grow, now);
}
/** 마을에서 "타는" 상호작용 (그네·범퍼카·버스·나루터(조각배·오리배)·시소·트램펄린·회전목마·관람차·열기구) */
export const RIDE_OBJECT_KINDS: ReadonlySet<string> = new Set(["swing", "bumper", "bus", "dock", "seesaw", "trampoline", "carousel", "ferris", "balloon"]);
/** 커진 채로 타려 할 때·타는 동안 먹으려 할 때 안내 */
export const BIG_RIDE_TOAST = "몸이 너무 커서 탈 수 없어요. 효과가 끝나면 다시 와요.";
export const RIDING_EAT_TOAST = "타는 동안엔 먹을 수 없어요. 내린 다음에 와요.";
function saveMine(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(mine ?? {}));
  } catch {
    // 저장소를 못 쓰면 새로고침 뒤엔 효과가 풀려 보일 뿐이다
  }
}

/** 한 접시·한 잔을 효과 상태에 더한다 (같은 갈래만 덮어쓴다) */
export function addFood(s: FoodState, item: BbqItemId, until: number, lv?: number, at?: number): FoodState {
  const kind = bbqItem(item)?.kind;
  if (kind === "drunk" && lv !== undefined && at !== undefined) return { ...s, drunk: { lv, at } };
  // 컨디숑: 내린 단계 (0이면 다 깼다)
  if (kind === "sober" && lv !== undefined && at !== undefined) {
    const rest: FoodState = { ...s };
    delete rest.drunk;
    return lv > 0 ? { ...rest, drunk: { lv, at } } : rest;
  }
  if (kind === "speed") return { ...s, spd: { i: item, u: until } };
  if (kind === "grow") return { ...s, grow: { i: item, u: until } };
  return s;
}

/** 접속자 정보에 실린 효과 */
export function foodOfPeer(p: PeerInfo): FoodState {
  return {
    ...(isBbqEffect(p.bbq) ? { grow: p.bbq } : {}),
    ...(isBbqEffect(p.spd) ? { spd: p.spd } : {}),
    ...(isDrunkState(p.drunk) ? { drunk: p.drunk } : {}),
  };
}

/** 취기 단계별 내 이동 흔들림 폭 (라디안) */
export function swayFor(level: number): number {
  return level >= 4 ? 0.42 : level >= 3 ? 0.32 : level >= 2 ? 0.22 : 0;
}

/** 다 끝났는지 (모든 갈래가 꺼졌다) */
export function foodIdle(s: FoodState, now: number): boolean {
  return !bbqActive(s.grow, now) && !bbqActive(s.spd, now) && drunkLevel(s.drunk, now) === 0;
}

export type FoodApplied = { big: string; drunk: number; trail: number | null };
/** 효과를 입히는 아바타 그림 (AvatarView) */
export type FoodView = { setBig(scale: number, tint: number | null): void; setDrunk(level: number): void; setTrail(tint: number | null): void };

/** 걸을 때 잔상이 따라오는 빨라지기 메뉴 색 (없으면 null) */
export function trailTint(f: FoodState, t: number): number | null {
  const spd = bbqActive(f.spd, t) ? bbqItem(f.spd.i) : undefined;
  return spd?.trail ? spd.tint : null;
}

/** 아바타 그림에 효과를 맞춘다 (바뀐 것만). cache = 지난번 넣은 값 */
export function applyFoodView(view: FoodView, f: FoodState, t: number, cache: FoodApplied | null): FoodApplied {
  const grow = bbqActive(f.grow, t) ? bbqItem(f.grow.i) : undefined;
  const big = grow ? `${grow.scale}:${grow.tint}` : "1";
  const drunk = drunkLevel(f.drunk, t);
  const trail = trailTint(f, t);
  if (cache?.big !== big) view.setBig(grow ? grow.scale : 1, grow ? grow.tint : null);
  if (cache?.drunk !== drunk) view.setDrunk(drunk);
  if (cache === null ? trail !== null : cache.trail !== trail) view.setTrail(trail);
  return { big, drunk, trail };
}


// ── 효과 게이지 (HUD components/camp/FoodGauge) ──
/** 취기 단계 이름 (1~5) */
export const DRUNK_NAMES = ["", "알딸딸", "얼큰", "휘청휘청", "어질어질", "고주망태"] as const;

export type GaugeRow =
  | { kind: "grow" | "speed"; item: BbqItemId; name: string; text: string; left: number; frac: number; trail: boolean }
  | { kind: "drunk"; level: number; name: string; /** 한 단계 깨기까지 남은 ms */ next: number; frac: number };

/** 지금 걸려 있는 효과를 게이지 줄로 (없으면 빈 배열). frac = 남은 비율 0..1 */
export function foodGauge(f: FoodState, now: number): GaugeRow[] {
  const rows: GaugeRow[] = [];
  for (const kind of ["grow", "speed"] as const) {
    const e = kind === "grow" ? f.grow : f.spd;
    const m = bbqActive(e, now) ? bbqItem(e.i) : undefined;
    if (!e || !m || m.ms <= 0) continue;
    const left = e.u - now;
    const text = kind === "grow" ? `${m.scale >= 2 && Number.isInteger(m.scale) ? `${m.scale}배` : `+${Math.round((m.scale - 1) * 100)}%`} 커짐` : `걸음 +${Math.round((m.speed - 1) * 100)}%`;
    rows.push({ kind, item: m.id, name: m.name, text, left, frac: Math.max(0, Math.min(1, left / m.ms)), trail: !!m.trail });
  }
  const lv = drunkLevel(f.drunk, now);
  if (f.drunk && lv > 0) {
    const into = Math.max(0, now - f.drunk.at) % DRUNK_STEP_MS;
    const next = DRUNK_STEP_MS - into;
    rows.push({ kind: "drunk", level: lv, name: DRUNK_NAMES[lv] ?? "", next, frac: next / DRUNK_STEP_MS });
  }
  return rows;
}

/** "2:05" (남은 ms) */
export function gaugeClock(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
