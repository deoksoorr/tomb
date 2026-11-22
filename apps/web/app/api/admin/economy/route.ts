import { requireAdmin } from "@/lib/admin";
import { ECON_STAFF_EXCLUDED_FROM } from "@/lib/economy";
import { handler, json } from "@/lib/http";
import { staffAccountId } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { EconomyDay, EconomyResponse } from "@/lib/types";

const MAX_DAYS = 90;

/**
 * 경제 통계 (최근 days일, 기본 14, 최대 90, 최근 날짜 먼저).
 * earned: 적립 항목별 + `admin`(관리자 지급) + `refund`(되팔기·환불), spent: 사용 분류별(shop/rpg/housing/name/admin/other).
 * totals (`?totals=1`일 때만): 포인트를 모은 적 있는 계정 수와 지갑 잔액 합계. 계정마다 HGET이라 Redis 명령이 계정 수만큼 든다 →
 * 경제 탭·대시보드는 부르지 않고, 잔액은 회원 목록 훑기를 다시 쓰는 /api/admin/economy/balances에서 본다.
 * 운영자 계정은 빠진다: 날짜별 통계는 기록할 때(ECON_STAFF_EXCLUDED_FROM부터), totals는 여기서 뺀다.
 * 관리자 지급(earn:admin)·관리자 선물(earn:gift)·관리자 회수(spend:admin)는 필드가 따로라 화면이 유저 경제와 나눠 보여 준다.
 * 11/16 그 전 날짜는 운영자 활동이 섞여 있어 아예 보내지 않는다 (운영자 활동은 하나도 안 보이게)
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 14) || 14));
  const now = Date.now();
  const dates = Array.from({ length: days }, (_, i) => kstDay(now - i * 86_400_000)).filter((d) => d >= ECON_STAFF_EXCLUDED_FROM);
  const accounts = getAccounts();
  const withTotals = req.nextUrl.searchParams.get("totals") === "1";
  const [rows, totals] = await Promise.all([accounts.economy(dates), withTotals ? staffAccountId().then((staff) => accounts.walletTotals(staff)) : undefined]);
  const out: EconomyDay[] = rows.map(({ date, fields }) => {
    const earned: Record<string, number> = {};
    const spent: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k.startsWith("earn:")) earned[k.slice(5)] = v;
      else if (k.startsWith("spend:")) spent[k.slice(6)] = v;
      else if (k === "refund") earned.refund = v;
      // 11/22 꾸미기 되팔기 (환불과 따로 센다)
      else if (k === "resell") earned.resell = v;
    }
    return { date, earned, spent };
  });
  return json<EconomyResponse>({ days: out, ...(totals ? { totals } : {}) });
});
