import { speciesById } from "@/lib/forage/catalog";
import { getFishRank, type FishRankEntry } from "@/lib/forage/fishRank";
import { DIFFICULTIES } from "@/lib/rpg/catalog";
import { handler, HttpError, json } from "@/lib/http";
import { getHouseStore, houseRank } from "@/lib/housing/service";
import { huntLevelRank } from "@/lib/huntLevelRank";
import { lookRank } from "@/lib/lookRank";
import { boardWithNameStyles } from "@/lib/nameStyleRank";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { staffAccountId } from "@/lib/staff";
import { rankWithoutStaff } from "@/lib/staffRank";
import { getAccounts, NO_NAME } from "@/lib/store";
import { kstWeek } from "@/lib/store/accounts";
import type { RankEntry } from "@/lib/store/types";
import { RANK_BOARDS, type RankBoard, type RankPeriod, type RankResponse, type RankRow } from "@/lib/types";

const RANK_SIZE = 50;

/**
 * 랭킹 (49번: 포인트·사냥 중심). `?board=points|huntKills|huntBest|house&period=week|all&zone=easy|normal|hard|hell`
 *  - points: 모은 포인트 (전체 = 쓰더라도 줄지 않는 합계, 주간 = 이번 주 월요일 새벽 5시부터 모은 포인트)
 *  - huntKills: 사냥터 처치 수 합계
 *  - huntBest: 그 사냥터를 쓰러지지 않고 끝까지 깬 가장 짧은 시간 (value = ms)
 *  - house: 하우징 꾸밈 점수 (F11. 전체 = 모든 집, 주간 = 이번 주에 꾸민 집. name = 집 이름, sub = 번지 · 주인)
 *  - fish: 최대어 `&fish=<물고기 id>|all` (value = 크기 cm×10. all이면 sub = 그 물고기 이름)
 *  - huntLevel: 사냥 캐릭터 레벨 (같으면 경험치. 기간 없음. value = 레벨, sub = 경험치, gear = 장착 무기. 정지 계정 제외)
 *  - look: 외형 꾸미기 점수 (기간 없음. 읽을 때 상위 후보를 지금 착용으로 다시 계산 — 만료된 코디는 0점. items = 지금 착용 파츠 전부(부위 순). 정지 계정 제외)
 * 운영자 계정은 어느 판에도 나오지 않는다 (lib/staffRank). 운영자 본인이 보면 mine = null, staff = true
 * 사람 줄(집 랭킹 빼고)에는 ns = 그 사람이 지금 입은 닉네임 꾸미기 id (lib/nameStyleRank — 화면이 이름 색·이름표로 그린다)
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
  const staffId = await staffAccountId();
  const staff = !!me && me === staffId ? { staff: true as const } : {};
  if (board === "fish") {
    const fish = params.get("fish") ?? "all";
    if (fish !== "all" && speciesById(fish)?.cat !== "fish") throw new HttpError(400, "INVALID_INPUT", "모르는 물고기예요.");
    const r = await rankWithoutStaff((n, who) => getFishRank().board(fish === "all" ? null : fish, week ?? null, n, who), RANK_SIZE, me, staffId);
    const row = (e: FishRankEntry & { ns?: string[] }): RankRow => ({
      rank: e.rank,
      name: e.name ?? NO_NAME,
      value: e.size,
      me: e.accountId === me,
      ...(e.sp ? { sub: speciesById(e.sp)?.name ?? e.sp } : {}),
      ...(e.ns ? { ns: e.ns } : {}),
    });
    const { rows, mine } = await boardWithNameStyles(r.rows, r.mine);
    return json<RankResponse>({ board, period, fish, rows: rows.map(row), mine: mine ? row(mine) : null, ...staff }, { headers: cacheHeaders(personal) });
  }
  if (board === "look" || board === "huntLevel") {
    const r = board === "look" ? await lookRank(me, RANK_SIZE, { staffId }) : await huntLevelRank(me, RANK_SIZE, { staffId });
    // 계정 id는 응답에 싣지 않는다
    const strip = (x: (typeof r.rows)[number] & { ns?: string[] }): RankRow => {
      const row: RankRow & { accountId?: string } = { ...x };
      delete row.accountId;
      return row;
    };
    const { rows, mine } = await boardWithNameStyles(r.rows, r.mine);
    return json<RankResponse>({ board, period: "all", rows: rows.map(strip), mine: mine ? strip(mine) : null, ...staff }, { headers: cacheHeaders(personal) });
  }
  if (board === "house") {
    const r = await houseRank(getHouseStore(), period, me, RANK_SIZE, Date.now(), staffId);
    return json<RankResponse>({ board, period, rows: r.rows, mine: r.mine, ...staff }, { headers: cacheHeaders(personal) });
  }
  const accounts = getAccounts();
  const { rows, mine } = await rankWithoutStaff(
    (n, who) =>
      board === "points"
        ? accounts.pointRank(n, who, week)
        : accounts.huntRank(board === "huntKills" ? "kills" : "best", n, who, { zone, week }),
    RANK_SIZE,
    me,
    staffId,
  );
  const row = (r: RankEntry & { ns?: string[] }): RankRow => ({ rank: r.rank, name: r.name ?? NO_NAME, value: r.points, me: r.accountId === me, ...(r.ns ? { ns: r.ns } : {}) });
  const { rows: styledRows, mine: styledMine } = await boardWithNameStyles(rows, mine);
  return json<RankResponse>(
    { board, period, ...(board === "huntBest" ? { zone } : {}), rows: styledRows.map(row), mine: styledMine ? row(styledMine) : null, ...staff },
    { headers: cacheHeaders(personal) },
  );
});

const cacheHeaders = (personal: boolean): Record<string, string> =>
  personal ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" };
