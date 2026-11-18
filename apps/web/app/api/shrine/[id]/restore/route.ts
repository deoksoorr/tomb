import { handler, HttpError, json, notFound } from "@/lib/http";
import { oneGraveMessage } from "@/lib/passText";
import { activeGraveOf, passAtOf } from "@/lib/store/passing";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import type { UpdateGraveResponse } from "@/lib/types";

/**
 * 성황당에서 다시 모시기: 원래 채널의 맨 뒤(새 격자 자리)로 되돌린다.
 * 반응 수, 숨김, 디자인, 꾸미기를 그대로 가져온다 (꾸미기 만료 시각은 그대로).
 * 1인 1묘비: 지금 묘역에 내 묘비가 있으면 409 ONE_GRAVE.
 * 11/18 성불 기간은 처음 세운 때부터 그대로 센다 (예전에는 되살리면 처음부터 다시 — 이장·되살리기로 성불을 피했다).
 * 이미 성불할 때가 지났으면 되살릴 수 없다 (409 PASS_DUE)
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  // 11/18 보안: 되살리기 연타 막기 (계정 기준)
  await rateLimit("graveEdit", req, visitorId);
  const now = Date.now();
  const store = getStore();
  const accounts = getAccounts();
  // 성황당에 없으면(남의 것·이미 되돌림·만료) 1인 1묘비보다 먼저 404
  const entry = (await store.shrine(visitorId, now)).find((e) => e.record.id === id);
  if (!entry) throw notFound();
  const active = await activeGraveOf(store, accounts, visitorId, now);
  if (active) throw new HttpError(409, "ONE_GRAVE", oneGraveMessage(active.passAt, now));
  if (passAtOf(entry.record, await store.settings(now)) <= now) throw new HttpError(409, "PASS_DUE", "이 묘비는 성불할 때가 지나서 다시 모실 수 없어요.");
  const record = await store.restore(visitorId, id, now);
  if (!record) throw notFound();
  if (record.ownerAccountId) await accounts.addGrave(record.ownerAccountId, id);
  const kept = await activeGraveOf(store, accounts, visitorId, now);
  return json<UpdateGraveResponse>({ grave: toPublicGrave(record, now, kept?.settings) });
});
