import { readItem, writeItem } from "@/lib/storage";

// 귀신의집 내 최고 기록 (이 기기에만 저장, 포인트 보상 없음). 빠져나온 판만 기록한다: 더 빠른 시간, 같으면 덜 놀란 쪽.

export const HAUNT_BEST_KEY = "tomb.haunt.best";
export type HauntBest = { ms: number; scares: number; at: number };

export function parseBest(raw: string | null): HauntBest | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const ms = o.ms;
    const scares = o.scares;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
    return { ms, scares: typeof scares === "number" && scares >= 0 ? Math.floor(scares) : 0, at: typeof o.at === "number" ? o.at : 0 };
  } catch {
    return null;
  }
}

/** 이번 판이 기록을 깼는지 */
export function isBetter(prev: HauntBest | null, run: { ms: number; scares: number }): boolean {
  if (!(run.ms > 0)) return false;
  if (!prev) return true;
  return run.ms < prev.ms || (run.ms === prev.ms && run.scares < prev.scares);
}

export function readBest(): HauntBest | null {
  return parseBest(readItem(HAUNT_BEST_KEY));
}

export function saveBest(b: HauntBest): void {
  writeItem(HAUNT_BEST_KEY, JSON.stringify(b));
}
