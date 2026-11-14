import type { ChampBoard } from "@tomb/protocol";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { kstWeek } from "@/lib/store/accounts";
import { getChamp, type ChampWeek } from "@/lib/store/champ";
import { readBody } from "@/lib/validate";
import { CHAMP_FIRST_WEEK, prevWeek, settleChamps, weekEndMs } from "@/lib/weeklyChamp";

/** 관리자 주간 1위 상태: 그 주 1위 기록(정리 전이면 null)과 랭킹마다 지급한 계정 (null = 아직) */
export type AdminChampResponse = {
  week: string;
  firstWeek: string;
  /** 그 주가 마감됐는지 */
  over: boolean;
  rec: ChampWeek | null;
  paid: Partial<Record<ChampBoard, string | null>>;
  /** 다시 지급에서 이번에 처음 준 랭킹 (POST만) */
  paidNow?: ChampBoard[];
  busy?: true;
};

const WeekSchema = z.string().regex(/^\d{8}$/, "주는 월요일 YYYYMMDD로 적어 주세요.");

async function status(week: string): Promise<AdminChampResponse> {
  const rec = await getChamp().get(week);
  const marks = rec ? await getAccounts().champPaid(rec.winners.map((w) => `${week}:${w.board}`)) : [];
  const paid: AdminChampResponse["paid"] = {};
  rec?.winners.forEach((w, i) => (paid[w.board] = marks[i]));
  return { week, firstWeek: CHAMP_FIRST_WEEK, over: Date.now() >= weekEndMs(week), rec, paid };
}

/** `?week=YYYYMMDD` (없으면 지난주): 1위 기록·지급 상태 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const raw = req.nextUrl.searchParams.get("week");
  const week = raw ? WeekSchema.parse(raw) : prevWeek(kstWeek());
  return json<AdminChampResponse>(await status(week));
});

/**
 * 1위 정리·지급 다시 시도 `{ week? }` (없으면 지난주). 이미 준 랭킹은 다시 주지 않는다 (계정 저장소 grantChamp가 주·랭킹마다 한 번만).
 * 처음 정한 1위는 바뀌지 않는다 (다시 계산하지 않는다)
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { week: raw } = await readBody(req, z.object({ week: WeekSchema.optional() }));
  const week = raw ?? prevWeek(kstWeek());
  if (week < CHAMP_FIRST_WEEK) throw new HttpError(400, "INVALID_INPUT", `주간 1위 보상은 ${CHAMP_FIRST_WEEK} 주부터예요.`);
  if (Date.now() < weekEndMs(week)) throw new HttpError(409, "NOT_YET", "아직 마감 전인 주예요.");
  const r = await settleChamps(week);
  return json<AdminChampResponse>({ ...(await status(week)), paidNow: r.paidNow, ...(r.busy ? { busy: true as const } : {}) });
});

