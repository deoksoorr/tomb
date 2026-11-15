import { findBan } from "./ban";
import { getHuntLevelStore } from "./huntLevelRank";
import { towerOfScore } from "./rpg/tower";
import {
  getTowerStore,
  type TowerEntry,
  type TowerStore,
} from "./rpg/towerStore";
import { staffAccountId } from "./staff";
import { NO_NAME } from "./store";
import type { RankRow } from "./types";

// 11/15 야근 빌딩 랭킹: 주간 최고 층(이번 주 월요일 새벽 5시부터) · 전체 최고 층. 층 높은 순, 같으면 그 층을 빨리 깬 순.
// 기록은 판 끝에 기록이 오를 때만 쓴다 (lib/rpg/service finishTower → lib/rpg/towerStore). 운영자는 처음부터 안 쓰고, 정지 계정은 읽을 때 뺀다.
// value = 층, sub = 그 판에서 그 층을 깬 시각 (판 시작부터)

const EXTRA = 10;

/** 12:34 (판 시작부터 그 층을 깬 시각) */
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export type TowerRankRow = RankRow & { accountId: string };

export type TowerRankOptions = {
  now?: number;
  staffId?: string | null;
  isBanned?: (id: string) => Promise<boolean>;
  store?: TowerStore;
};

export async function towerRank(
  me: string | null,
  size: number,
  week: string | undefined,
  opts: TowerRankOptions = {},
): Promise<{
  rows: TowerRankRow[];
  mine: TowerRankRow | null;
  staff: boolean;
}> {
  const now = opts.now ?? Date.now();
  const store = opts.store ?? getTowerStore();
  const staffId =
    opts.staffId === undefined ? await staffAccountId() : opts.staffId;
  const isBanned =
    opts.isBanned ?? (async (id: string) => !!(await findBan(id, null)));
  const isStaffMe = !!me && me === staffId;
  const top = (await store.top(size + EXTRA, week)).filter(
    (e) => e.accountId !== staffId,
  );
  const banned = await Promise.all(top.map((e) => isBanned(e.accountId)));
  const list = top.filter((_, i) => !banned[i]).slice(0, size);
  const myScore =
    me && !isStaffMe && !list.some((e) => e.accountId === me)
      ? await store.scoreOf(me, week)
      : null;
  const mineOut = myScore !== null && !(await isBanned(me!));
  const info = await getHuntLevelStore().info(
    mineOut
      ? [...list.map((e) => e.accountId), me!]
      : list.map((e) => e.accountId),
    now,
  );
  const row = (e: TowerEntry, rank: number): TowerRankRow => {
    const t = towerOfScore(e.score);
    return {
      rank,
      accountId: e.accountId,
      name: info.get(e.accountId)?.name ?? NO_NAME,
      value: t.floor,
      me: e.accountId === me,
      sub: `${mmss(t.ms)}에 올라감`,
    };
  };
  const rows = list.map((e, i) => row(e, i + 1));
  if (!mineOut) return { rows, mine: null, staff: isStaffMe };
  const above = await store.countAbove(myScore!, week);
  return {
    rows,
    mine: row(
      { accountId: me!, score: myScore! },
      Math.max(size + 1, above + 1),
    ),
    staff: false,
  };
}
