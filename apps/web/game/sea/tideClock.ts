import { TIDE_PERIOD_MIN, tideLevel, tideMinute, tidePhase, type TidePhase } from "@tomb/protocol";

// 11/16 바닷가 물때 시계 (화면 쪽). 물 높이는 protocol tideLevel(한국 시각만으로 계산) 그대로이고,
// 시험용으로만 시각을 밀 수 있어요: 주소 ?tide=분(한 바퀴 안의 분, 0 = 만조) 또는 ?debug=1일 때 window.__tombTide.set(분).
// 밀어도 서버에는 아무것도 가지 않아요 (물때는 화면마다 계산해요).

let offsetMs = 0;
const subs = new Set<() => void>();

/** 시험용으로 민 만큼 더한 지금 시각 (epoch ms) */
export function tideNow(now = Date.now()): number {
  return now + offsetMs;
}

/** 물때를 한 바퀴 안의 그 분으로 맞춰요 (0 = 만조, 90 = 간조 한가운데). null이면 원래 시각 */
export function setTideMinute(minute: number | null, now = Date.now()): void {
  if (minute === null || !Number.isFinite(minute)) offsetMs = 0;
  else {
    const want = ((minute % TIDE_PERIOD_MIN) + TIDE_PERIOD_MIN) % TIDE_PERIOD_MIN;
    offsetMs = (want - tideMinute(now)) * 60_000;
  }
  subs.forEach((f) => f());
}

export function onTideShift(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}

/** 주소 ?tide=분 (시험용) */
export function applyTideQuery(search: string): void {
  const raw = new URLSearchParams(search).get("tide");
  if (raw !== null && /^\d{1,3}(\.\d+)?$/.test(raw)) setTideMinute(Number(raw));
}

/** 물 높이 0..1과 오르내림 (조금 뒤 높이와 비교) */
export function tideNowLevel(now = Date.now()): { level: number; trend: -1 | 1 } {
  const t = tideNow(now);
  const level = tideLevel(t);
  return { level, trend: tideLevel(t + 60_000) >= level ? 1 : -1 };
}

/** HUD 물때 글 (짧게). 만조 · 물 빠지는 중 · 간조 · 물 들어오는 중 */
export function tideText(now = Date.now()): { phase: TidePhase; text: string } {
  const p = tidePhase(tideNow(now));
  switch (p.phase) {
    case "high":
      return { phase: p.phase, text: "만조" };
    case "ebb":
      return { phase: p.phase, text: `물 빠지는 중 · 갯벌 열림까지 ${p.minutesLeft}분` };
    case "low":
      return { phase: p.phase, text: `간조 · 갯벌 닫힘까지 ${p.minutesLeft}분` };
    case "flood":
      return { phase: p.phase, text: "물 들어오는 중" };
  }
}

/** 곧 물이 빠져요 안내를 띄울 때: 갯벌이 열리기 5분 전 (한 바퀴의 55~60분) */
export const TIDE_WARN_MIN = 5;
export function tideWarnNow(now = Date.now()): boolean {
  const p = tidePhase(tideNow(now));
  return p.phase === "ebb" && p.minutesLeft <= TIDE_WARN_MIN;
}
