import { findBan } from "./ban";
import { lookScore, wornParts, type LookScoreInput } from "./lookScore";
import { autoFill, FILL_BATCH, FILL_DONE } from "./rankFill";
import { staffAccountId } from "./staff";
import { getAccounts, NO_NAME } from "./store";
import { getLookRankStore, type LookRankStore, type LookState } from "./store/lookRank";
import type { RankRow } from "./types";

// 외형 꾸미기 랭킹 (서버). 점수 = 지금 착용 중이고 만료 전인 코디 파츠의 가격대 점수 합 (lib/lookScore.ts).
//  - 기록: 착용·벗기·입기(이용권)·영구 구매·펫 분양·염색·외형 바꾸기·재접속(/api/me/look) 때 recordLook
//  - 읽기: 정렬 집합의 상위 후보를 지금 착용으로 다시 계산해 바로잡는다 → 기간제가 끝난 코디는 읽는 순간 0점
//    (기록된 점수는 만료로 줄어들 뿐이라 "남은 후보의 기록 점수 ≤ 바로잡은 N위 점수"가 될 때까지만 더 읽는다)
//  - 운영자(lib/staffRank 규칙: 목록에 없고, 본인이 보면 mine = null · staff)·정지 계정은 목록에서 뺀다
//  - 채우기: 랭킹이 생기기 전부터 입고 있던 계정은 처음 읽을 때 계정 착용 목록을 한 번 훑어 채운다 (lib/rankFill, 관리자 「운영 점검」에서 다시 채우기)

/** 순위 판 한 줄 (지금 착용한 파츠 전부 — 아이콘용 items, lookScore.wornParts) */
export type LookRankRow = RankRow & { accountId: string };
type Cand = { accountId: string; name: string; score: number; items: string[]; order: number };

/** 한 번에 더 읽는 후보 수 (만료·정지로 빠질 몫) */
const EXTRA = 20;
/** 바로잡으며 더 읽는 최대 횟수 */
const MAX_ROUNDS = 4;
/** 바로잡은 판을 이 인스턴스에서 잠깐 재사용 (내 줄은 늘 새로 계산한다) */
const BOARD_CACHE_MS = 30_000;

export type LookRankOptions = {
  now?: number;
  /** 운영자 계정 (주지 않으면 지정된 운영자를 읽는다) */
  staffId?: string | null;
  /** 정지 계정인지 (주지 않으면 정지 색인을 본다) */
  isBanned?: (accountId: string) => Promise<boolean>;
  store?: LookRankStore;
  /** 판 캐시를 쓰지 않는다 (테스트) */
  fresh?: boolean;
};

const defaultBanned = async (id: string) => !!(await findBan(id, null));
const rankStore = (o: LookRankOptions) => o.store ?? getLookRankStore(getAccounts());

/**
 * 외형이 바뀐 뒤 부른다: 지금 점수를 정렬 집합에 적는다 (운영자는 빼 둔다). 랭킹 기록이 실패해도
 * 입기·사기 같은 본래 동작은 성공해야 하므로 오류는 삼킨다
 */
export async function recordLook(accountId: string, look: LookScoreInput & { staff?: boolean }, opts: LookRankOptions = {}): Promise<void> {
  try {
    const now = opts.now ?? Date.now();
    const staff = look.staff ?? accountId === (opts.staffId === undefined ? await staffAccountId() : opts.staffId);
    await rankStore(opts).put(accountId, staff ? 0 : lookScore(look, now));
  } catch (e) {
    console.warn("[lookRank] 기록 실패", e);
  }
}

/**
 * 기존 계정 채우기 한 묶음: 착용 기록이 있는 계정을 커서부터 count개 훑어 지금 착용으로 점수를 적는다 (운영자는 뺀다,
 * 정지 계정은 기록은 두고 읽을 때 뺀다). next "0" = 끝 → 채움 표시를 "done"으로. 관리자 다시 채우기는 "0"부터 끝까지 부른다
 */
export async function fillLookRank(cursor: string, count: number, opts: LookRankOptions = {}): Promise<{ next: string; filled: number }> {
  const now = opts.now ?? Date.now();
  const store = rankStore(opts);
  const staffId = opts.staffId === undefined ? await staffAccountId() : opts.staffId;
  const { next, ids } = await store.scanWorn(cursor, count);
  const states = await store.states(ids.filter((id) => id !== staffId), now);
  const rows = ids.map((accountId) => {
    const st = states.get(accountId);
    return { accountId, score: accountId === staffId || !st ? 0 : lookScore(st, now) };
  });
  await store.putMany(rows);
  if (next === "0") await store.fill.set(FILL_DONE);
  return { next, filled: rows.filter((r) => r.score > 0).length };
}

const g = globalThis as typeof globalThis & { __tombLookBoard?: { at: number; size: number; staff: string | null; rows: Cand[] } };

/** 운영자·정지 계정을 뺀, 지금 착용으로 바로잡은 상위 size명 (점수 높은 순) */
async function correctedBoard(store: LookRankStore, size: number, now: number, staffId: string | null, isBanned: (id: string) => Promise<boolean>): Promise<Cand[]> {
  const rows: Cand[] = [];
  const batch = size + EXTRA;
  let offset = 0;
  // 바로잡은 기록은 다 읽은 뒤에 한꺼번에 쓴다 (읽는 도중에 쓰면 정렬 집합의 자리가 바뀌어 다음 묶음을 건너뛴다)
  const fixes: [string, number][] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const top = await store.top(offset, batch);
    if (!top.length) break;
    offset += top.length;
    const ids = top.map((t) => t.accountId).filter((id) => id !== staffId);
    const [states, banned] = await Promise.all([store.states(ids, now), Promise.all(ids.map(isBanned))]);
    const bannedSet = new Set(ids.filter((_, i) => banned[i]));
    top.forEach((t, i) => {
      if (t.accountId === staffId) return void fixes.push([t.accountId, 0]);
      const st = states.get(t.accountId);
      const score = st ? lookScore(st, now) : 0;
      // 만료·누락으로 달라진 기록은 그 자리에서 바로잡는다 (정지 계정은 기록은 두고 목록에서만 뺀다 — 해제되면 돌아온다)
      if (score !== t.score) fixes.push([t.accountId, score]);
      if (!st || score <= 0 || bannedSet.has(t.accountId)) return;
      rows.push({ accountId: t.accountId, name: st.name ?? NO_NAME, score, items: wornParts(st, now), order: offset + i });
    });
    rows.sort(byScore);
    if (top.length < batch) break;
    // 아직 안 읽은 후보의 기록 점수는 이번 마지막 후보 이하 → 바로잡은 size위가 그 이상이면 더 볼 필요 없다
    if (rows.length >= size && rows[size - 1].score >= top[top.length - 1].score) break;
  }
  await Promise.all(fixes.map(([id, score]) => store.put(id, score)));
  return rows.slice(0, size);
}

const byScore = (a: Cand, b: Cand) => b.score - a.score || a.order - b.order;

const toRow = (c: Cand, rank: number, me: string | null): LookRankRow => ({
  rank,
  accountId: c.accountId,
  name: c.name,
  value: c.score,
  me: c.accountId === me,
  ...(c.items.length ? { items: c.items } : {}),
});

/**
 * 꾸미기 랭킹 상위 size명 + 내 줄. 내 줄은 늘 지금 착용으로 새로 계산해 판에 끼워 넣는다
 * (판은 이 인스턴스에서 BOARD_CACHE_MS 동안 재사용). 0점이면 내 줄은 없다
 */
export async function lookRank(me: string | null, size: number, opts: LookRankOptions = {}): Promise<{ rows: LookRankRow[]; mine: LookRankRow | null; staff: boolean }> {
  const now = opts.now ?? Date.now();
  const store = rankStore(opts);
  const staffId = opts.staffId === undefined ? await staffAccountId() : opts.staffId;
  const isBanned = opts.isBanned ?? defaultBanned;
  const cached = g.__tombLookBoard;
  let board: Cand[];
  if (!opts.fresh && !opts.store && cached && now - cached.at < BOARD_CACHE_MS && cached.size === size && cached.staff === staffId) board = cached.rows;
  else {
    // 기존 계정을 아직 안 채웠으면 한 번 훑는다 (끝나면 다시 안 돈다)
    await autoFill(store.fill, (c) => fillLookRank(c, FILL_BATCH, { store, staffId, now }), "lookRank");
    board = await correctedBoard(store, size, now, staffId, isBanned);
    if (!opts.store) g.__tombLookBoard = { at: now, size, staff: staffId, rows: board };
  }

  const isStaffMe = !!me && me === staffId;
  if (!me || isStaffMe) return { rows: board.map((c, i) => toRow(c, i + 1, me)), mine: null, staff: isStaffMe };

  // 내 줄: 지금 착용으로 다시 계산해 기록도 맞추고, 판 안이면 자리를 바꿔 끼운다
  const st: LookState | undefined = (await store.states([me], now)).get(me);
  const myScore = st ? lookScore(st, now) : 0;
  const banned = myScore > 0 && (await isBanned(me));
  await store.put(me, myScore).catch(() => undefined);
  let list = board.filter((c) => c.accountId !== me);
  const myCand: Cand | null = st && myScore > 0 && !banned ? { accountId: me, name: st.name ?? NO_NAME, score: myScore, items: wornParts(st, now), order: -1 } : null;
  if (myCand) {
    const at = list.findIndex((c) => c.score < myScore);
    list = at < 0 ? [...list, myCand] : [...list.slice(0, at), myCand, ...list.slice(at)];
  }
  const inBoard = list.slice(0, size);
  const rows = inBoard.map((c, i) => toRow(c, i + 1, me));
  if (!myCand || rows.some((r) => r.me)) return { rows, mine: null, staff: false };
  // 판 밖: 기록 점수가 나보다 높은 사람 수로 어림 (판 크기보다 위로는 올리지 않는다)
  const above = await store.countAbove(myScore);
  return { rows, mine: toRow(myCand, Math.max(size + 1, above + 1), me), staff: false };
}
