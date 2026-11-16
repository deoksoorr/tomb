import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { reclaimLastSeen } from "@/lib/housing/catalog";
import { RECLAIM_MS, refundOf } from "@/lib/housing/reclaim";
import { getHouseStore, toSummary } from "@/lib/housing/service";
import type { AdminHouse } from "@/lib/housing/types";
import { staffAccountId } from "@/lib/staff";
import { getAccounts } from "@/lib/store";

/** 관리자: 모든 집(숨김 포함, 최근 분양 순) + 집마다 신고된 방명록 글 + 주인의 마지막 접속 (오래 비운 집 정리 대상 확인용) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const store = getHouseStore();
  const all = await store.listAll();
  const [seen, staff] = await Promise.all([getAccounts().summaries(all.map((h) => h.owner)), staffAccountId()]);
  const houses: AdminHouse[] = await Promise.all(
    all.map(async (h, i) => {
      const reports = await store.guestReports(h.id);
      const entries = reports.size ? await store.guestbook(h.id, true) : [];
      return {
        ...toSummary(h),
        hidden: h.hidden,
        ownerTail: h.owner.slice(0, 6),
        lastSeenAt: seen[i]?.lastSeenAt ?? 0,
        staff: h.owner === staff,
        reclaimAt: h.owner === staff || !reclaimLastSeen(seen[i]?.lastSeenAt ?? 0) ? 0 : reclaimLastSeen(seen[i]?.lastSeenAt ?? 0) + RECLAIM_MS,
        refund: refundOf(h),
        refundEstimated: h.paid === undefined,
        reportedEntries: entries
          .filter((e) => reports.has(e.id))
          .map((e) => ({ id: e.id, name: e.name, text: e.text, at: e.at, reports: reports.get(e.id) ?? 0, hidden: e.hidden })),
      };
    }),
  );
  return json({ houses });
});
