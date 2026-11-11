import { handler, HttpError, json, notFound } from "@/lib/http";
import { oneGraveMessage } from "@/lib/passText";
import { activeGraveOf } from "@/lib/store/passing";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import type { UpdateGraveResponse } from "@/lib/types";

/**
 * 성황당에서 다시 모시기: 원래 채널의 맨 뒤(새 격자 자리)로 되돌린다.
 * 반응 수, 숨김, 디자인, 꾸미기를 그대로 가져온다 (꾸미기 만료 시각은 그대로).
 * 1인 1묘비: 지금 묘역에 내 묘비가 있으면 409 ONE_GRAVE. 되돌린 묘비의 성불 기간은 지금부터 다시 센다
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const store = getStore();
  const accounts = getAccounts();
  // 성황당에 없으면(남의 것·이미 되돌림·만료) 1인 1묘비보다 먼저 404
  if (!(await store.shrine(visitorId, now)).some((e) => e.record.id === id)) throw notFound();
  const active = await activeGraveOf(store, accounts, visitorId, now);
  if (active) throw new HttpError(409, "ONE_GRAVE", oneGraveMessage(active.passAt, now));
  const record = await store.restore(visitorId, id, now);
  if (!record) throw notFound();
  if (record.ownerAccountId) await accounts.addGrave(record.ownerAccountId, id);
  const kept = await activeGraveOf(store, accounts, visitorId, now);
  return json<UpdateGraveResponse>({ grave: toPublicGrave(record, now, kept?.settings) });
});
