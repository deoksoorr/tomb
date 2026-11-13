import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { staffAccountId } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { EconomyDay, EconomyResponse } from "@/lib/types";

const MAX_DAYS = 90;

/**
 * 경제 통계 (최근 days일, 기본 14, 최대 90, 최근 날짜 먼저).
 * earned: 적립 항목별 + `admin`(관리자 지급) + `refund`(되팔기·환불), spent: 사용 분류별(shop/rpg/housing/name/admin/other).
 * totals: 포인트를 모은 적 있는 계정 수와 지갑 잔액 합계.
 * 운영자 계정은 빠진다: 날짜별 통계는 기록할 때(ECON_STAFF_EXCLUDED_FROM부터), totals는 여기서 뺀다
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 14) || 14));
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => kstDay(now - i * 86_400_000));
  const accounts = getAccounts();
  const [rows, totals] = await Promise.all([accounts.economy(dates), staffAccountId().then((staff) => accounts.walletTotals(staff))]);
  const out: EconomyDay[] = rows.map(({ date, fields }) => {
    const earned: Record<string, number> = {};
    const spent: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k.startsWith("earn:")) earned[k.slice(5)] = v;
      else if (k.startsWith("spend:")) spent[k.slice(6)] = v;
      else if (k === "refund") earned.refund = v;
    }
    return { date, earned, spent };
  });
  return json<EconomyResponse>({ days: out, totals });
});
