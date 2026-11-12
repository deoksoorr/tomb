import { DIFFICULTIES } from "@/lib/rpg/catalog";
import { handler, HttpError, json } from "@/lib/http";
import { getHouseStore, houseRank } from "@/lib/housing/service";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { getAccounts, NO_NAME } from "@/lib/store";
import { kstWeek } from "@/lib/store/accounts";
import type { RankEntry } from "@/lib/store/types";
import { RANK_BOARDS, type RankBoard, type RankPeriod, type RankResponse, type RankRow } from "@/lib/types";

const RANK_SIZE = 50;

/**
 * 랭킹 (49번: 포인트·사냥 중심). `?board=points|huntKills|huntBest|house&period=week|all&zone=easy|normal|hard|hell`
 *  - points: 모은 포인트 (전체 = 쓰더라도 줄지 않는 합계, 주간 = 이번 주 KST 월요일부터 모은 포인트)
 *  - huntKills: 사냥터 처치 수 합계
 *  - huntBest: 그 사냥터를 쓰러지지 않고 끝까지 깬 가장 짧은 시간 (value = ms)
 *  - house: 하우징 꾸밈 점수 (F11. 전체 = 모든 집, 주간 = 이번 주에 꾸민 집. name = 집 이름, sub = 번지 · 주인)
 * 기본은 방문자와 무관한 응답이라 CDN에 30초 캐시하고, `?me=1`이면 내 줄·내 순위를 넣고 캐시하지 않는다
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const params = req.nextUrl.searchParams;
  const board = (params.get("board") ?? "points") as RankBoard;
  if (!RANK_BOARDS.includes(board)) throw new HttpError(400, "INVALID_INPUT", "모르는 랭킹이에요.");
  const period: RankPeriod = params.get("period") === "week" ? "week" : "all";
  const zone = params.get("zone") ?? DIFFICULTIES[0];
  if (board === "huntBest" && !(DIFFICULTIES as readonly string[]).includes(zone))
    throw new HttpError(400, "INVALID_INPUT", "모르는 사냥터예요.");
  const personal = params.get("me") === "1";
  const me = personal ? await getVisitorId(req) : null;
  const week = period === "week" ? kstWeek() : undefined;
  if (board === "house") {
    const r = await houseRank(getHouseStore(), period, me, RANK_SIZE);
    return json<RankResponse>({ board, period, rows: r.rows, mine: r.mine }, { headers: cacheHeaders(personal) });
  }
  const accounts = getAccounts();
  const { rows, mine } =
    board === "points"
      ? await accounts.pointRank(RANK_SIZE, me, week)
      : await accounts.huntRank(board === "huntKills" ? "kills" : "best", RANK_SIZE, me, { zone, week });
  const row = (r: RankEntry): RankRow => ({ rank: r.rank, name: r.name ?? NO_NAME, value: r.points, me: r.accountId === me });
  return json<RankResponse>(
    { board, period, ...(board === "huntBest" ? { zone } : {}), rows: rows.map(row), mine: mine ? row(mine) : null },
    { headers: cacheHeaders(personal) },
  );
});

const cacheHeaders = (personal: boolean): Record<string, string> =>
  personal ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" };
