import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getStore, sweepShrine, toPublicGrave } from "@/lib/store";
import type { ShrineListResponse } from "@/lib/types";

/** 내 성황당: 내 계정이 이장한 묘비 (만료 전만, 최근에 이장한 것 먼저) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const store = getStore();
  const now = Date.now();
  await sweepShrine(store, now);
  const entries = (await store.shrine(visitorId, now)).map((e) => ({
    grave: toPublicGrave(e.record, now),
    removedAt: e.removedAt,
    expiresAt: e.expiresAt,
  }));
  return json<ShrineListResponse>({ entries });
});
