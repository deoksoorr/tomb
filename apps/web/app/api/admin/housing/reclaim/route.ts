import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { sweepReclaim, type ReclaimReport } from "@/lib/housing/reclaim";
import { getHouseStore } from "@/lib/housing/service";

/** 관리자 「지금 정리하기」: 주인이 7일 넘게 들어오지 않은 집을 바로 비운다 (잠금을 기다리지 않는다. 몇 번 눌러도 같은 집을 두 번 비우지 않는다) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  return json<ReclaimReport>(await sweepReclaim(getHouseStore(), Date.now(), { force: true }));
});
