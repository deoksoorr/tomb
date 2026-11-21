import { getAccounts, NO_NAME } from "../store";
import { CHAIR_MODES, chairWeek, type ChairMode } from "./rules";
import { ensureChairSettled } from "./settle";
import { chairDuoOf } from "./rewards";
import { getChairStore, type ChairWinner } from "./store";

// 11/22 회장님 독대 명예의 전당 (GET /api/chairman/hall): 주간 정리 기록(chair:settle:{주}, 색인 chair:weeks)의 모드별 1위를 노멀·헬 함께 최근 주부터.
// 11/23 같은 사람이 노멀·헬 모두 1위인 주(2관왕)는 두 줄 대신 「2관왕」 한 줄.
// 정리 때 운영자·정지 계정은 이미 빠졌다. 이름은 지금 이름 (계정이 없으면 정리 때 이름). 계정 id는 싣지 않는다.

/** 명예의 전당 한 줄: 지난 한 주 그 모드 1위 (ms = 그 판 버틴 시간 — 옛 기록은 없음, streak = 연속 1위 주 수) */
export type ChairHallRow = {
  week: string;
  /** 11/23 duo = 그 주 노멀·헬 모두 1위(2관왕) — 두 줄 대신 이 한 줄 (damage·ms = 노멀, hell = 헬 기록, streak = 연속 2관왕 주 수) */
  mode: ChairMode | "duo";
  name: string;
  damage: number;
  ms?: number;
  streak?: number;
  hell?: { damage: number; ms?: number };
};
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
  const wins = recs.flatMap((rec): { week: string; mode: ChairMode | "duo"; w: ChairWinner; h?: ChairWinner }[] => {
    // 11/23 2관왕 주는 한 줄로 (노멀 기록 + 헬 기록)
    if (rec.ranks && chairDuoOf(rec.ranks)) return [{ week: rec.week, mode: "duo", w: rec.ranks.normal[0], h: rec.ranks.hell[0] }];
    return CHAIR_MODES.flatMap((mode) => {
      const w = rec.ranks?.[mode]?.[0];
      return w ? [{ week: rec.week, mode, w }] : [];
    });
  });
  const ids = [...new Set(wins.map((x) => x.w.accountId))];
  const sums = ids.length ? await getAccounts().summaries(ids) : [];
  const names = new Map(ids.map((id, i) => [id, sums[i]?.name]));
  const v: ChairHallResponse = {
    rows: wins.map(({ week: wk, mode, w, h }) => {
      const streak = h ? Math.min(w.streak ?? 1, h.streak ?? 1) : (w.streak ?? 0);
      return {
        week: wk,
        mode,
        name: names.get(w.accountId) || w.name || NO_NAME,
        damage: w.damage,
        ...(w.ms ? { ms: w.ms } : {}),
        ...(streak > 1 ? { streak } : {}),
        ...(h ? { hell: { damage: h.damage, ...(h.ms ? { ms: h.ms } : {}) } } : {}),
      };
    }),
  };
  g.__tombChairHall = { week, at: now, v };
  return v;
}
