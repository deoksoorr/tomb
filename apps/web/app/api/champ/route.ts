import { CHAMP_BOARDS } from "@tomb/protocol";
import { speciesById } from "@/lib/forage/catalog";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { kstWeek } from "@/lib/store/accounts";
import { champBitsFor, getChamp, type ChampWeek, type ChampWinner } from "@/lib/store/champ";
import type { ChampResponse, ChampWinnerView } from "@/lib/types";
import { CHAMP_POINTS, champLookOf, champWeekCached, ensureChampSettled, prevWeek } from "@/lib/weeklyChamp";

/** 명예의 전당에 보여 주는 주 수 */
const HALL_WEEKS = 12;

/**
 * 주간 랭킹 1위 `?me=1`: 지난주 1위(캐릭터 모습 포함) + 명예의 전당(최근 12주) + (me=1이면) 내 1위 값·오라 끔·아직 안 본 1위 알림.
 * 지난주 정리가 아직이면 여기서 한다 (lib/weeklyChamp — 한 번만 지급). 계정 id는 응답에 싣지 않는다
 */
export const GET = handler(async (req) => {
  await rateLimit("rank", req);
  const now = Date.now();
  await ensureChampSettled(now);
  const week = prevWeek(kstWeek(now));
  const me = req.nextUrl.searchParams.get("me") === "1" ? await getVisitorId(req) : null;
  const store = getChamp();
  const [rec, hall] = await Promise.all([champWeekCached(week, now), store.hall(HALL_WEEKS)]);
  const view = (w: ChampWinner): ChampWinnerView => ({
    board: w.board,
    name: w.name,
    value: w.value,
    ...(w.sp ? { sub: speciesById(w.sp)?.name ?? w.sp } : {}),
    ...(me && w.accountId === me ? { me: true as const } : {}),
  });
  const order = (r: ChampWeek | null) => [...(r?.winners ?? [])].sort((a, b) => CHAMP_BOARDS.indexOf(a.board) - CHAMP_BOARDS.indexOf(b.board));
  const last = await Promise.all(order(rec).map(async (w) => ({ ...view(w), avatar: await champLookOf(w.accountId, now) })));
  let mine: ChampResponse["mine"];
  if (me) {
    const [bits, auraOff, seen] = await Promise.all([champBitsFor(me, now), store.auraOff(me), store.seen(me)]);
    const won = order(rec).filter((w) => w.accountId === me).map((w) => w.board);
    mine = { bits, auraOff, unseen: won.length && seen !== week ? { week, boards: won } : null };
  }
  return json<ChampResponse>(
    { week, last, hall: hall.map((r) => ({ week: r.week, winners: order(r).map(view) })), points: CHAMP_POINTS, ...(mine ? { mine } : {}) },
    { headers: me ? { "Cache-Control": "private, no-store" } : { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "s-maxage=30, stale-while-revalidate=300" } },
  );
});
