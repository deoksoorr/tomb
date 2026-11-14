import { CHAMP_BOARDS } from "@tomb/protocol";
import { speciesById } from "@/lib/forage/catalog";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { staffAccountId } from "@/lib/staff";
import { kstWeek } from "@/lib/store/accounts";
import type { ChampAvatar, RaceResponse } from "@/lib/types";
import { champBoard, champLookOf, ensureChampSettled, noteLeaders, weekEndMs, type ChampRow } from "@/lib/weeklyChamp";

/** 시상대 자리 수 */
const PODIUM = 3;
/** 시상대(보는 사람과 무관한 부분)를 서버 메모리에 두고 여러 사람이 함께 쓰는 시간 */
const SHARED_MS = 30_000;

type SharedBoard = { rows: ChampRow[]; avatars: ChampAvatar[] };
type Shared = { week: string; boards: SharedBoard[] };
let shared: { at: number; week: string; v: Promise<Shared> } | null = null;

/** 보는 사람과 무관한 부분: 정리 확인 · 랭킹마다 1~3등과 모습 · 1위 바뀜 공지 (SHARED_MS 동안 함께 쓴다) */
async function loadShared(week: string, now: number): Promise<Shared> {
  await ensureChampSettled(now);
  const staffId = await staffAccountId();
  const boards = await Promise.all(CHAMP_BOARDS.map((b) => champBoard(b, week, PODIUM, null, staffId)));
  await noteLeaders(
    week,
    boards.flatMap((b, i) => (b.rows[0] ? [{ board: CHAMP_BOARDS[i], accountId: b.rows[0].accountId, name: b.rows[0].name }] : [])),
    now,
  ).catch((e) => console.warn("[champ] 레이스 1위 공지 실패", e));
  return {
    week,
    boards: await Promise.all(boards.map(async (b) => ({ rows: b.rows, avatars: await Promise.all(b.rows.map((r) => champLookOf(r.accountId, now))) }))),
  };
}

function sharedFor(week: string, now: number): Promise<Shared> {
  if (shared && shared.week === week && now - shared.at < SHARED_MS) return shared.v;
  const v = loadShared(week, now);
  const entry = { at: now, week, v };
  shared = entry;
  // 실패한 결과는 남기지 않는다
  v.catch(() => {
    if (shared === entry) shared = null;
  });
  return v;
}

/**
 * 이번 주 레이스 (랭킹 창 맨 앞 칸, 열려 있는 동안 30초마다): 포인트·사냥 처치·낚시(전체 물고기)마다 1~3등(캐릭터 모습 포함),
 * 마감 시각(다음 월요일 새벽 5시, 한국 시간), 내 순위와 1위와의 차이. 운영자는 순위에 없다 (본인이 보면 staff).
 * 1위가 바뀌었으면 마을 확성기 줄에 알린다 (같은 랭킹은 몇 분에 한 번까지 — lib/weeklyChamp noteLeaders)
 * 시상대는 서버 메모리에 30초 두고 함께 쓴다 (Redis 명령 절약). 내 순위는 시상대에 없을 때만 따로 읽는다
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const now = Date.now();
  const week = kstWeek(now);
  const [s, me, staffId] = await Promise.all([sharedFor(week, now), getVisitorId(req), staffAccountId()]);
  const isStaff = !!me && me === staffId;
  const mineOf = async (i: number): Promise<ChampRow | null> => {
    if (!me || isStaff) return null;
    return s.boards[i].rows.find((r) => r.accountId === me) ?? (await champBoard(CHAMP_BOARDS[i], week, 1, me, staffId)).mine;
  };
  const out: RaceResponse = {
    week,
    endsAt: weekEndMs(week),
    boards: await Promise.all(
      s.boards.map(async (b, i) => {
        const mine = await mineOf(i);
        return {
          board: CHAMP_BOARDS[i],
          top: b.rows.map((r, j) => ({
            rank: r.rank,
            name: r.name,
            value: r.value,
            ...(r.sp ? { sub: speciesById(r.sp)?.name ?? r.sp } : {}),
            me: !!me && r.accountId === me,
            avatar: b.avatars[j],
          })),
          mine: mine ? { rank: mine.rank, value: mine.value, gap: Math.max(0, (b.rows[0]?.value ?? 0) - mine.value) } : null,
        };
      }),
    ),
    ...(isStaff ? { staff: true as const } : {}),
  };
  return json<RaceResponse>(out, { headers: { "Cache-Control": "private, no-store" } });
});
