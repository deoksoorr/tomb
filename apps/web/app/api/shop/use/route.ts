import { nanoid } from "nanoid";
import { COSMETIC_DURATION_MS, DECOR_DURATION_MS, GRANT_TTL_SEC, itemById, signGrant } from "@tomb/protocol";
import { env } from "@/lib/env";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getStore, toPublicGrave } from "@/lib/store";
import { lookGrant, lookOf, loadMe } from "@/lib/store/accounts";
import type { UseItemResponse } from "@/lib/types";
import { readBody, ShopUseSchema } from "@/lib/validate";

const noItem = () => new HttpError(409, "NO_ITEM", "가방에 그 아이템이 없어요.");

/**
 * 사용 `{ itemId, graveId? }`. 모든 아이템은 쓰는 순간 가방에서 1개 빠진다.
 *  - 폭죽: 60초짜리 사용권(grant). 게임이 실시간 서버로 보내면 채널 모두에게 터진다 (nonce는 한 번만 쓸 수 있다)
 *  - 캐릭터 꾸미기: 24시간 착용 (같은 부위는 교체) + 착용 증서(lookGrant)
 *  - 묘비 꾸미기: 내 계정으로 세운 묘비에만, 7일 유지 (묘비당 최대 3개, 넘으면 가장 오래된 것 교체)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, graveId } = await readBody(req, ShopUseSchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const item = itemById(itemId)!;
  const now = Date.now();

  if (item.kind === "firework") {
    if (!(await accounts.consume(visitorId, itemId))) throw noItem();
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
    if (!(await accounts.equip(visitorId, itemId, item.slot!, now + (item.durationMs ?? COSMETIC_DURATION_MS))))
      throw noItem();
    const me = await loadMe(accounts, visitorId, now);
    return json<UseItemResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now) });
  }

  if (!graveId) throw new HttpError(400, "INVALID_INPUT", "꾸밀 묘비를 골라 주세요.");
  const store = getStore();
  const grave = await store.get(graveId);
  if (!grave) throw notFound();
  if (grave.ownerAccountId !== visitorId)
    throw new HttpError(403, "NOT_OWNER", "내 계정으로 세운 묘비에만 꾸밀 수 있어요.");
  const placed = await accounts.placeDecor(visitorId, graveId, itemId, now + (item.durationMs ?? DECOR_DURATION_MS), now);
  if (placed === null) throw notFound();
  if (placed === "no_item") throw noItem();
  return json<UseItemResponse>({
    me: await loadMe(accounts, visitorId, now),
    grave: toPublicGrave({ ...grave, decor: placed }, now),
  });
});
