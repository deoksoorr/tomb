import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import { activeGraveOf } from "@/lib/store/passing";
import type { MyGraveStatusResponse } from "@/lib/types";

/**
 * 1인 1묘비: 내 계정이 지금 묘역에 가진 묘비와 성불 시각 (묘비 쓰기 창이 열릴 때 확인한다).
 * 기간이 지난 묘비는 이 자리에서 성불시키고, 여러 개면 가장 최근 것만 남긴다
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const store = getStore();
  const now = Date.now();
  const active = await activeGraveOf(store, getAccounts(), visitorId, now);
  const settings = active?.settings ?? (await store.settings(now));
  return json<MyGraveStatusResponse>(
    { active: active ? toPublicGrave(active.grave, now, settings) : null, passDays: settings.passDays },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
