// 비트맵 글씨 한 줄을 정해진 폭(px)에 맞춘다 (11/16 부동산: 닉네임 12자 · 집 이름 20자가 이웃 필지 문패와 겹쳤다).
// 폭은 글자 진행 폭의 합으로 잰다 (GlyphAtlas.measure). Phaser를 쓰지 않는 순수 함수라 테스트에서 아무 폭 함수나 넣는다.

/** 글자 줄 폭 재기 (px) */
export type Measure = (text: string) => number;

const ELLIPSIS = "…";

/** 집 문 상호작용 안내(「○○ 들어가기」)에 넣는 집 이름 최대 글자 (집 이름은 20자까지 — 안내 한 줄이 집 폭을 크게 넘지 않게) */
export const DOOR_NAME_MAX = 12;

/** 글자 단위로 자르기 (서로게이트 쌍·이모지를 반으로 쪼개지 않는다) */
const chars = (s: string) => [...s];

/** max 글자를 넘으면 앞쪽만 남기고 "…" (게임 상호작용 안내처럼 폭을 재지 않는 곳) */
export function clampChars(text: string, max: number): string {
  const c = chars(text);
  return c.length <= max ? text : c.slice(0, Math.max(1, max - 1)).join("") + ELLIPSIS;
}

/**
 * head + body + tail이 max(px) 안에 들어가게 body만 뒤에서부터 줄이고 "…"를 붙인다.
 * head·tail(번지·점수처럼 꼭 보여야 하는 부분)은 그대로 둔다. body가 minBody 글자보다 짧아져야 하면 null
 */
export function fitParts(head: string, body: string, tail: string, max: number, measure: Measure, minBody = 1): string | null {
  const full = head + body + tail;
  if (measure(full) <= max) return full;
  const c = chars(body);
  for (let n = c.length - 1; n >= minBody; n--) {
    const s = head + c.slice(0, n).join("") + ELLIPSIS + tail;
    if (measure(s) <= max) return s;
  }
  return null;
}

/**
 * 후보를 앞에서부터 하나씩 맞춰 보고 처음 들어가는 것을 쓴다 (예: 주인 · 호칭 · 점수 → 호칭을 빼고 주인 · 점수).
 * 어느 것도 안 들어가면 마지막 후보의 body를 한 글자 + "…"로 (아주 좁은 화면 — 그래도 번지·점수는 남는다)
 */
export function fitFirst(candidates: readonly FitPart[], max: number, measure: Measure): string {
  for (const c of candidates) {
    const s = fitParts(c.head ?? "", c.body, c.tail ?? "", max, measure, c.minBody ?? 1);
    if (s !== null) return s;
  }
  const last = candidates[candidates.length - 1];
  return (last.head ?? "") + clampChars(last.body, 2) + (last.tail ?? "");
}

export type FitPart = { head?: string; body: string; tail?: string; minBody?: number };
