// 3번 화분 물 주기 → 시간이 지나면 자란다. 서버(저장·검증)와 집 씬(그림 단계)이 같은 규칙을 쓴다.
//  - 누구든(집주인·손님) 물을 줄 수 있다. 화분마다 WATER_COOLDOWN_MS에 한 번
//  - 물을 주면 GROW_MS 뒤에 한 단계 자란다 (새싹 → 잎 → 봉오리 → 꽃, 최대 PLANT_MAX_STAGE)
//  - 화분을 치우면(배치에서 빠지면) 기록은 읽을 때 걸러진다

/** n = 자람에 쳐 준 물 준 횟수, at = 마지막으로 물 준 시각(ms) */
export type PlantState = { n: number; at: number };
export type PlantsResponse = { plants: Record<string, PlantState>; now: number };

export const WATER_COOLDOWN_MS = 3 * 3600_000;
export const GROW_MS = 20 * 60_000;
export const PLANT_MAX_STAGE = 3;
export const PLANT_STAGE_NAMES = ["새싹", "잎", "봉오리", "꽃"] as const;

/** 지금 보이는 단계 0..PLANT_MAX_STAGE (방금 준 물은 GROW_MS가 지나야 반영) */
export function plantStage(s: PlantState | undefined, now: number): number {
  if (!s) return 0;
  const grown = now - s.at >= GROW_MS ? s.n : s.n - 1;
  return Math.max(0, Math.min(PLANT_MAX_STAGE, grown));
}

/** 다시 물을 줄 수 있을 때까지 남은 ms (0이면 지금 줄 수 있다) */
export function waterWait(s: PlantState | undefined, now: number): number {
  return s ? Math.max(0, s.at + WATER_COOLDOWN_MS - now) : 0;
}

export function watered(s: PlantState | undefined, now: number): PlantState {
  return { n: Math.min(PLANT_MAX_STAGE + 1, (s?.n ?? 0) + 1), at: now };
}

export function parsePlant(raw: unknown): PlantState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return typeof o.n === "number" && typeof o.at === "number" && Number.isFinite(o.n) && Number.isFinite(o.at) ? { n: o.n, at: o.at } : null;
}
