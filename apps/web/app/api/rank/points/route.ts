import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { getAccounts, NO_NAME } from "@/lib/store";
import type { PointRankResponse, PointRankRow } from "@/lib/types";

const RANK_SIZE = 50;

/**
 * 모은 포인트(lifetimePoints) 상위 50명.
 * 기본은 방문자와 무관한 응답이라 CDN에 30초 캐시한다(브라우저는 no-store).
 * `?me=1`이면 쿠키를 읽어 내 줄 표시(me)와 내 순위(mine)를 넣고 캐시하지 않는다
 * (개인화된 응답이 CDN에 올라가 남의 순위가 보이지 않게).
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const personal = req.nextUrl.searchParams.get("me") === "1";
  const me = personal ? await getVisitorId(req) : null;
  const { rows, mine } = await getAccounts().pointRank(RANK_SIZE, me);
  const row = (r: (typeof rows)[number]): PointRankRow => ({
    rank: r.rank,
    name: r.name ?? NO_NAME,
    points: r.points,
    me: r.accountId === me,
  });
  return json<PointRankResponse>(
    { rows: rows.map(row), mine: mine ? row(mine) : null },
    {
      headers: personal
        ? { "Cache-Control": "private, no-store" }
        : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" },
    },
  );
});
