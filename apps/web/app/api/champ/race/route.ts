import { CHAMP_BOARDS } from "@tomb/protocol";
import { speciesById } from "@/lib/forage/catalog";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { staffAccountId } from "@/lib/staff";
import { kstWeek } from "@/lib/store/accounts";
import type { RaceResponse, RaceRow } from "@/lib/types";
import { champBoard, champLookOf, ensureChampSettled, noteLeaders, weekEndMs, type ChampRow } from "@/lib/weeklyChamp";

/** 시상대 자리 수 */
const PODIUM = 3;

/**
 * 이번 주 레이스 (랭킹 창 맨 앞 칸, 열려 있는 동안 30초마다): 포인트·사냥 처치·낚시(전체 물고기)마다 1~3등(캐릭터 모습 포함),
 * 마감 시각(다음 월요일 0시 KST), 내 순위와 1위와의 차이. 운영자는 순위에 없다 (본인이 보면 staff).
 * 1위가 바뀌었으면 마을 확성기 줄에 알린다 (같은 랭킹은 몇 분에 한 번까지 — lib/weeklyChamp noteLeaders)
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const now = Date.now();
  await ensureChampSettled(now);
  const week = kstWeek(now);
  const me = await getVisitorId(req);
  const staffId = await staffAccountId();
  const boards = await Promise.all(CHAMP_BOARDS.map((b) => champBoard(b, week, PODIUM, me, staffId)));
  await noteLeaders(
    week,
    boards.flatMap((b, i) => (b.rows[0] ? [{ board: CHAMP_BOARDS[i], accountId: b.rows[0].accountId, name: b.rows[0].name }] : [])),
    now,
  ).catch((e) => console.warn("[champ] 레이스 1위 공지 실패", e));
  const row = async (r: ChampRow): Promise<RaceRow> => ({
    rank: r.rank,
    name: r.name,
    value: r.value,
    ...(r.sp ? { sub: speciesById(r.sp)?.name ?? r.sp } : {}),
    me: !!me && r.accountId === me,
    avatar: await champLookOf(r.accountId, now),
  });
  const out: RaceResponse = {
    week,
    endsAt: weekEndMs(week),
    boards: await Promise.all(
      boards.map(async (b, i) => ({
        board: CHAMP_BOARDS[i],
        top: await Promise.all(b.rows.map(row)),
        mine: b.mine ? { rank: b.mine.rank, value: b.mine.value, gap: Math.max(0, (b.rows[0]?.value ?? 0) - b.mine.value) } : null,
      })),
    ),
    ...(boards.some((b) => b.staff) ? { staff: true as const } : {}),
  };
  return json<RaceResponse>(out, { headers: { "Cache-Control": "private, no-store" } });
});
