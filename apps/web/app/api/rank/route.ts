import { speciesById } from "@/lib/forage/catalog";
import { getFishRank, type FishRankEntry } from "@/lib/forage/fishRank";
import { DIFFICULTIES, isZoneId, ZONE_IDS, ZONES, type Difficulty, type ZoneId } from "@/lib/rpg/catalog";
import { handler, HttpError, json } from "@/lib/http";
import { getHouseStore, houseRank } from "@/lib/housing/service";
import { huntLevelRank } from "@/lib/huntLevelRank";
import { towerRank } from "@/lib/towerRank";
import { lookRank } from "@/lib/lookRank";
import { boardWithNameStyles } from "@/lib/nameStyleRank";
import { memoTopFetch, styleMine } from "@/lib/rankMemo";
import { env } from "@/lib/env";
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
 * 랭킹 (49번: 포인트·사냥 중심). `?board=points|huntKills|huntBest|house&period=week|all&zone=<사냥터 id>`
 *  - points: 모은 포인트 (전체 = 쓰더라도 줄지 않는 합계, 주간 = 이번 주 월요일 새벽 5시부터 모은 포인트)
 *  - huntKills: 사냥터 처치 수 합계
 *  - huntBest: 그 사냥터를 쓰러지지 않고 끝까지 깬 가장 짧은 시간 (value = ms). 11/16 zone = 사냥터 id (12곳, 기본 = 쉬움 첫 사냥터).
 *    예전 화면처럼 난이도 id(easy|normal|hard|hell)로 물으면 그 난이도 첫 사냥터 판 (옛 난이도 기록이 합쳐진 판)
 *  - house: 하우징 꾸밈 점수 (F11. 전체 = 모든 집, 주간 = 이번 주에 꾸민 집. name = 집 이름, sub = 번지 · 주인)
 *  - fish: 최대어 `&fish=<물고기 id>|all` (value = 크기 cm×10. all이면 sub = 그 물고기 이름)
 *  - huntLevel: 사냥 캐릭터 레벨 (같으면 경험치. 기간 없음. value = 레벨, sub = 경험치, gear = 장착 무기. 정지 계정 제외)
 *  - tower: 11/15 야근 빌딩 최고 층 (주간·전체. value = 층, sub = 그 층을 깬 시각. 정지 계정 제외)
 *  - look: 외형 꾸미기 점수 (기간 없음. 읽을 때 상위 후보를 지금 착용으로 다시 계산 — 만료된 코디는 0점. items = 지금 착용 파츠 전부(부위 순). 정지 계정 제외)
 *  - stay: 총 접속 시간 (기간 없음. value = 분, 머무르기 기록이 쌓인 만큼 — lib/stayTime)
 * 운영자 계정은 어느 판에도 나오지 않는다 (lib/staffRank). 운영자 본인이 보면 mine = null, staff = true
 * 사람 줄(집 랭킹 빼고)에는 ns = 그 사람이 지금 입은 닉네임 꾸미기 id (lib/nameStyleRank — 화면이 이름 색·이름표로 그린다)
 * 기본은 방문자와 무관한 응답이라 CDN에 30초 캐시하고, `?me=1`이면 내 줄·내 순위를 넣고 캐시하지 않는다
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const params = req.nextUrl.searchParams;
  const board = (params.get("board") ?? "points") as RankBoard;
  if (!RANK_BOARDS.includes(board)) throw new HttpError(400, "INVALID_INPUT", "모르는 랭킹이에요.");
  const period: RankPeriod = board !== "stay" && params.get("period") === "week" ? "week" : "all";
  const zone = huntZoneParam(params.get("zone"));
  if (board === "huntBest" && !zone) throw new HttpError(400, "INVALID_INPUT", "모르는 사냥터예요.");
  const personal = params.get("me") === "1";
  // 11/26 쿠키 확인(세대 캐시)과 운영자 id(캐시)는 서로 기다릴 필요가 없다 — 인스턴스가 새로 뜬 때 Redis 왕복 1번 줄임
  const [me, staffId] = await Promise.all([personal ? getVisitorId(req) : null, staffAccountId()]);
  const week = period === "week" ? kstWeek() : undefined;
  const staff = !!me && me === staffId ? { staff: true as const } : {};
  if (board === "fish") {
    const fish = params.get("fish") ?? "all";
    if (fish !== "all" && speciesById(fish)?.cat !== "fish") throw new HttpError(400, "INVALID_INPUT", "모르는 물고기예요.");
    const fetch = (n: number, who: string | null) => getFishRank().board(fish === "all" ? null : fish, week ?? null, n, who);
    if (memoOn()) {
      const r = await rankWithoutStaff(memoTopFetch(`fish|${fish}|${week ?? ""}|${staffId ?? ""}`, fetch, staffId), RANK_SIZE, me, staffId);
      const mine = await styleMine(r.rows, r.mine);
      return json<RankResponse>({ board, period, fish, rows: r.rows.map(fishRow(me)), mine: mine ? fishRow(me)(mine) : null, ...staff }, { headers: cacheHeaders(personal) });
    }
    const r = await rankWithoutStaff(fetch, RANK_SIZE, me, staffId);
    const row = fishRow(me);
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
  if (board === "tower") {
    const r = await towerRank(me, RANK_SIZE, week, { staffId });
    const strip = (x: (typeof r.rows)[number] & { ns?: string[] }): RankRow => {
      const row: RankRow & { accountId?: string } = { ...x };
      delete row.accountId;
      return row;
    };
    const { rows, mine } = await boardWithNameStyles(r.rows, r.mine);
    return json<RankResponse>({ board, period, rows: rows.map(strip), mine: mine ? strip(mine) : null, ...staff }, { headers: cacheHeaders(personal) });
  }
  if (board === "house") {
    const r = await houseRank(getHouseStore(), period, me, RANK_SIZE, Date.now(), staffId);
    return json<RankResponse>({ board, period, rows: r.rows, mine: r.mine, ...staff }, { headers: cacheHeaders(personal) });
  }
  const accounts = getAccounts();
  const fetch = (n: number, who: string | null) =>
    board === "points"
      ? accounts.pointRank(n, who, week)
      : board === "stay"
        ? accounts.stayRank(n, who)
        : accounts.huntRank(board === "huntKills" ? "kills" : "best", n, who, { zone: zone ?? undefined, week });
  const row = (r: RankEntry & { ns?: string[] }): RankRow => ({ rank: r.rank, name: r.name ?? NO_NAME, value: r.points, me: r.accountId === me, ...(r.ns ? { ns: r.ns } : {}) });
  if (memoOn()) {
    const key = `${board}|${period}|${week ?? ""}|${board === "huntBest" ? zone : ""}|${staffId ?? ""}`;
    const r = await rankWithoutStaff(memoTopFetch(key, fetch, staffId), RANK_SIZE, me, staffId);
    const styled = await styleMine(r.rows, r.mine);
    return json<RankResponse>(
      { board, period, ...(board === "huntBest" && zone ? { zone } : {}), rows: r.rows.map(row), mine: styled ? row(styled) : null, ...staff },
      { headers: cacheHeaders(personal) },
    );
  }
  const { rows, mine } = await rankWithoutStaff(fetch, RANK_SIZE, me, staffId);
  const { rows: styledRows, mine: styledMine } = await boardWithNameStyles(rows, mine);
  return json<RankResponse>(
    { board, period, ...(board === "huntBest" && zone ? { zone } : {}), rows: styledRows.map(row), mine: styledMine ? row(styledMine) : null, ...staff },
    { headers: cacheHeaders(personal) },
  );
});

/** 11/16 사냥터 고르기: 사냥터 id 그대로, 난이도 id(예전 화면)는 그 난이도 첫 사냥터, 없으면 쉬움 첫 사냥터. 모르는 값이면 null */
function huntZoneParam(raw: string | null): ZoneId | null {
  if (raw === null) return ZONE_IDS[0];
  if (isZoneId(raw)) return raw;
  return (DIFFICULTIES as readonly string[]).includes(raw) ? ZONES[raw as Difficulty].id : null;
}

/**
 * 운영(Redis)에서는 상위 줄을 인스턴스마다 30초 기억하고 내 줄만 새로 읽는다 (lib/rankMemo — 요청마다 150개 남짓 → 5개 남짓).
 * 메모리 저장소(로컬·테스트)는 한 프로세스라 아낄 명령이 없고, 바뀐 기록이 바로 보여야 시험이 맞으므로 예전처럼 매번 읽는다
 */
const memoOn = () => !!env.redis();

const fishRow =
  (me: string | null) =>
  (e: FishRankEntry & { ns?: string[] }): RankRow => ({
    rank: e.rank,
    name: e.name ?? NO_NAME,
    value: e.size,
    me: e.accountId === me,
    ...(e.sp ? { sub: speciesById(e.sp)?.name ?? e.sp } : {}),
    ...(e.ns ? { ns: e.ns } : {}),
  });

const cacheHeaders = (personal: boolean): Record<string, string> =>
  personal ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" };
