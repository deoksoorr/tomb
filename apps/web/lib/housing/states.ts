import { tierById, type PlotTierId } from "./catalog";
import { roomPlan } from "./rooms";
import type { HouseLayout, Placed } from "./types";

// 3번 집 안 가구의 "남는 상태" (벽난로 불·스탠드·라디오 채널·창문 열림·석등·촛대 꺼짐).
// 집마다 배치 id(창문은 "w0"…) → { a: 값, s: 서명 }으로 저장한다. 서명은 그 가구가 지금 그 자리에 그대로 있는지
// 확인하는 값이라, 가구를 치우거나 옮기면(또는 다른 가구로 바꾸면) 서명이 달라져 상태가 사라진다.
// 화분 자람은 따로 저장한다 (plants.ts).

/** 라디오 채널 수 (0 = 꺼짐) */
export const RADIO_CHANNELS = 4;

/**
 * 상태가 남는 가구 → 값의 최댓값 (0..max).
 * 석등·촛대는 처음부터 켜져 있던 가구라 값 1 = 꺼짐 (저장 안 된 0이 예전처럼 켜진 모습)
 */
export const STATE_MAX: Readonly<Record<string, number>> = { fireplace: 1, floor_lamp: 1, radio: RADIO_CHANNELS, stone_lantern: 1, candles: 1 };
/** 창문 열림 (0/1) */
export const WINDOW_MAX = 1;
/** 창문 상태의 서명 (창문은 터 크기로 정해지고 배치로는 바뀌지 않는다) */
export const WINDOW_SIG = "w";

export type HouseState = { a: number; s: string };
export type HouseStatesResponse = { states: Record<string, number> };

const WINDOW_RE = /^w(\d{1,2})$/;

/** 배치 하나의 서명: 물건·자리·방향이 같아야 같은 가구로 본다 */
export const placedSig = (p: Pick<Placed, "i" | "x" | "y" | "r">): string => `${p.i}:${p.x}:${p.y}:${p.r}`;

/**
 * 배치 저장 때 남길 상태를 고르는 표: 놓인 모든 배치 id → 서명 (상태가 남지 않는 가구는 "").
 * 표에 있는 id는 서명이 같을 때만, 표에 없는 id는 창문 상태(서명 WINDOW_SIG)일 때만 남긴다 (keepState)
 */
export function stateSigs(layout: HouseLayout): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of layout.items) out[p.u] = STATE_MAX[p.i] !== undefined ? placedSig(p) : "";
  return out;
}

export const keepState = (sigs: Record<string, string>, u: string, st: HouseState): boolean =>
  Object.hasOwn(sigs, u) ? sigs[u] !== "" && sigs[u] === st.s : st.s === WINDOW_SIG;

/** u의 지금 서명과 최댓값 (상태가 남지 않는 대상이면 null). 배치가 창문 id와 겹치면 배치가 먼저 */
export function stateTarget(layout: HouseLayout, tier: PlotTierId, u: string): { s: string; max: number } | null {
  const p = layout.items.find((x) => x.u === u);
  if (p) {
    const max = STATE_MAX[p.i];
    return max === undefined ? null : { s: placedSig(p), max };
  }
  const m = WINDOW_RE.exec(u);
  const t = tierById(tier);
  if (!m || !t) return null;
  return Number(m[1]) < roomPlan(t).windows.length ? { s: WINDOW_SIG, max: WINDOW_MAX } : null;
}

/** 저장된 상태 중 지금 배치와 서명이 맞고 값이 범위 안인 것만 (켜짐·채널 > 0) */
export function liveStates(layout: HouseLayout, tier: PlotTierId, raw: Record<string, HouseState>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [u, st] of Object.entries(raw)) {
    const t = stateTarget(layout, tier, u);
    if (t && t.s === st.s && Number.isInteger(st.a) && st.a > 0 && st.a <= t.max) out[u] = st.a;
  }
  return out;
}

export function parseState(raw: unknown): HouseState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return typeof o.a === "number" && Number.isInteger(o.a) && typeof o.s === "string" ? { a: o.a, s: o.s } : null;
}
