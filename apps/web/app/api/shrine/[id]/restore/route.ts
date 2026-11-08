import { handler, json, notFound } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import type { UpdateGraveResponse } from "@/lib/types";

/**
 * 성황당에서 다시 모시기: 원래 채널의 맨 뒤(새 격자 자리)로 되돌린다.
 * 헌화·살려주세요 수, 숨김, 디자인, 꾸미기를 그대로 가져온다 (꾸미기 만료 시각은 그대로)
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const record = await getStore().restore(visitorId, id, now);
  if (!record) throw notFound();
  if (record.ownerAccountId) await getAccounts().addGrave(record.ownerAccountId, id);
  return json<UpdateGraveResponse>({ grave: toPublicGrave(record, now) });
});
