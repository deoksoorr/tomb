import { getAccounts, NO_NAME } from "../store";
import { CHAIR_MODES, chairWeek, type ChairMode } from "./rules";
import { ensureChairSettled } from "./settle";
import { getChairStore } from "./store";

// 11/22 회장님 독대 명예의 전당 (GET /api/chairman/hall): 주간 정리 기록(chair:settle:{주}, 색인 chair:weeks)의 모드별 1위를 노멀·헬 함께 최근 주부터.
// 정리 때 운영자·정지 계정은 이미 빠졌다. 이름은 지금 이름 (계정이 없으면 정리 때 이름). 계정 id는 싣지 않는다.

/** 명예의 전당 한 줄: 지난 한 주 그 모드 1위 (ms = 그 판 버틴 시간 — 옛 기록은 없음, streak = 연속 1위 주 수) */
export type ChairHallRow = { week: string; mode: ChairMode; name: string; damage: number; ms?: number; streak?: number };
/** 노멀·헬 함께, 최근 주부터 (한 주 안에서는 노멀 먼저) */
export type ChairHallResponse = { rows: ChairHallRow[] };

/** 싣는 주 수 (모드 둘 → 많아야 104줄) */
export const CHAIR_HALL_WEEKS = 52;
const HALL_CACHE_MS = 60_000;
/** 인스턴스 기억 (lib/chairman/service resetChairRankCache가 같이 지운다) */
const g = globalThis as typeof globalThis & { __tombChairHall?: { week: string; at: number; v: ChairHallResponse } };

/** 1분 기억, 이번 주가 바뀌면(새 정리) 바로 다시 읽는다 */
export async function chairHall(now = Date.now()): Promise<ChairHallResponse> {
  await ensureChairSettled(now);
  const week = chairWeek(now);
  const hit = g.__tombChairHall;
  if (hit && hit.week === week && now - hit.at < HALL_CACHE_MS) return hit.v;
  const recs = await getChairStore().hall(CHAIR_HALL_WEEKS);
  const wins = recs.flatMap((rec) =>
    CHAIR_MODES.flatMap((mode) => {
      const w = rec.ranks?.[mode]?.[0];
      return w ? [{ week: rec.week, mode, w }] : [];
    }),
  );
  const ids = [...new Set(wins.map((x) => x.w.accountId))];
  const sums = ids.length ? await getAccounts().summaries(ids) : [];
  const names = new Map(ids.map((id, i) => [id, sums[i]?.name]));
  const v: ChairHallResponse = {
    rows: wins.map(({ week: wk, mode, w }) => ({
      week: wk,
      mode,
      name: names.get(w.accountId) || w.name || NO_NAME,
      damage: w.damage,
      ...(w.ms ? { ms: w.ms } : {}),
      ...(w.streak ? { streak: w.streak } : {}),
    })),
  };
  g.__tombChairHall = { week, at: now, v };
  return v;
}
