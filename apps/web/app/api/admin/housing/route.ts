import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getHouseStore, toSummary } from "@/lib/housing/service";
import type { AdminHouse } from "@/lib/housing/types";

/** 관리자: 모든 집(숨김 포함, 최근 분양 순) + 집마다 신고된 방명록 글 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const store = getHouseStore();
  const all = await store.listAll();
  const houses: AdminHouse[] = await Promise.all(
    all.map(async (h) => {
      const reports = await store.guestReports(h.id);
      const entries = reports.size ? await store.guestbook(h.id, true) : [];
      return {
        ...toSummary(h),
        hidden: h.hidden,
        ownerTail: h.owner.slice(0, 6),
        reportedEntries: entries
          .filter((e) => reports.has(e.id))
          .map((e) => ({ id: e.id, name: e.name, text: e.text, at: e.at, reports: reports.get(e.id) ?? 0, hidden: e.hidden })),
      };
    }),
  );
  return json({ houses });
});
