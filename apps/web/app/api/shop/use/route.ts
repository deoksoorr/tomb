import { nanoid } from "nanoid";
import { COSMETIC_DURATION_MS, DECOR_DURATION_MS, GRANT_TTL_SEC, itemById, signGrant } from "@tomb/protocol";
import { env } from "@/lib/env";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { recordLook } from "@/lib/lookRank";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import { lookGrant, lookOf, loadMe } from "@/lib/store/accounts";
import type { UseItemResponse } from "@/lib/types";
import { readBody, ShopUseSchema } from "@/lib/validate";

const noItem = () => new HttpError(409, "NO_ITEM", "가방에 그 아이템이 없어요.");

/**
 * 사용 `{ itemId, graveId? }`. 모든 아이템은 쓰는 순간 가방에서 1개 빠진다.
 *  - 폭죽: 60초짜리 사용권(grant). 게임이 실시간 서버로 보내면 채널 모두에게 터진다 (nonce는 한 번만 쓸 수 있다)
 *    운영자 계정은 가방에서 빼지 않는다 (없어도 모든 폭죽을 쏠 수 있다. 연사는 위 rateLimit("shop")·실시간 서버 간격이 막는다)
 *  - 캐릭터 꾸미기: 24시간 착용 (같은 부위에 입던 것은 벗어 둔 꾸미기로, 남은 시간 그대로) + 착용 증서(lookGrant).
 *    11/22 같은 꾸미기를 기간제로 가졌으면 남은 기간에 24시간을 더하고, 영구로 가졌으면 이용권을 쓰지 않고 영구 그대로 입힌다
 *  - 묘비 꾸미기: 내 계정으로 세운 묘비에만, 7일 유지 (묘비당 최대 3개, 넘으면 가장 오래된 것 교체)
 *  - 묘비 디자인권: 여기서는 쓰지 않는다 (묘비 세우기·수정의 style로 쓴다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, graveId } = await readBody(req, ShopUseSchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const item = itemById(itemId)!;
  const now = Date.now();

  if (item.kind === "firework") {
    if (!(await isStaff(visitorId)) && !(await accounts.consume(visitorId, itemId))) throw noItem();
    const grant = await signGrant(env.joinSecret(), {
      kind: "firework",
      visitorId,
      item: itemId,
      nonce: nanoid(12),
      exp: Math.floor(now / 1000) + GRANT_TTL_SEC,
    });
    return json<UseItemResponse>({ me: await loadMe(accounts, visitorId, now), grant });
  }

  if (item.kind === "cosmetic") {
    if (!(await accounts.equip(visitorId, itemId, item.slot!, now + (item.durationMs ?? COSMETIC_DURATION_MS), now)))
      throw noItem();
    const me = await loadMe(accounts, visitorId, now);
    await recordLook(visitorId, me, { now }); // 꾸미기 랭킹 점수
    return json<UseItemResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now, me) });
  }

  if (item.kind === "dye") throw new HttpError(400, "INVALID_INPUT", "염색권은 가방이나 상점의 염색에서 부위를 골라 써요.");
  // 11/15 수집 의뢰 보상(이모티콘 묶음·외형)은 가지고 있으면 열린다 — 쓰는 물건이 아니다
  if (item.kind === "unlock") throw new HttpError(400, "INVALID_INPUT", "가지고 있으면 바로 열리는 보상이에요. 따로 쓸 필요가 없어요.");
  // 11/15 긴급 의뢰 상자는 가방에서 [열기] (/api/forage/urgent/open)
  if (item.kind === "box") throw new HttpError(400, "INVALID_INPUT", "상자는 가방에서 열어요.");

  if (item.kind === "graveStyle")
    throw new HttpError(400, "INVALID_INPUT", "묘비 디자인권은 묘비를 세우거나 고칠 때 디자인으로 골라 써요.");

  if (!graveId) throw new HttpError(400, "INVALID_INPUT", "꾸밀 묘비를 골라 주세요.");
  const store = getStore();
  const grave = await store.get(graveId);
  if (!grave) throw notFound();
  if (grave.ownerAccountId !== visitorId)
    throw new HttpError(403, "NOT_OWNER", "내 계정으로 세운 묘비에만 꾸밀 수 있어요.");
  const until = now + (item.durationMs ?? DECOR_DURATION_MS);
  const placed = await accounts.placeDecor(visitorId, graveId, grave.channel, itemId, until, now);
  if (placed === null) throw notFound();
  if (placed === "no_item") throw noItem();
  return json<UseItemResponse>({
    me: await loadMe(accounts, visitorId, now),
    grave: toPublicGrave({ ...grave, decor: placed }, now),
  });
});
