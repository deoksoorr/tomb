import { handler, json } from "@/lib/http";
import { CampBuySchema, ItemSchema } from "@/lib/housing/schemas";
import { buyCampHome, buyFurniture, getHouseStore } from "@/lib/housing/service";
import { myBrief } from "@/lib/housing/points";
import type { MyHouseResponse } from "@/lib/housing/types";
import { notifyHomes } from "@/lib/housing/homesNotify";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { pickDiscount } from "@/lib/champPerks";
import { perkShopDiscount } from "@/lib/chairPerks";
import { chairPerkSafe } from "@/lib/chairman/settle";
import { champBoardsSafe } from "@/lib/store/champ";
import { wornPerk } from "@/lib/titlesServer";
import { parseWith, readJson } from "@/lib/validate";

/**
 * 가구 사기 `{ itemId, zone? }` → 하우징 가방 +1. 11/26 `{ ch, lot, zone: "camp" }`(itemId 없음)은 캠핑장 집 분양. 11/16 값은 집 갈래 칭호의 가구 할인을 뺀 값 (lib/titles discountedPrice).
 * 11/17 포인트왕(지난주 1위) 20% · 11/24 회장님 독대 노멀 1위·2관왕 30%와 겹치면 큰 할인 하나만 (lib/champPerks pickDiscount)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  // 11/26 캠핑장 집 분양 `{ ch, lot, zone: "camp", name?, intro?, kind?, design? }` (design = 카라반 디자인 — 값과 상관없다) (kind = 창을 연 NPC의 종류 — 터 종류와 다르면 400) (itemId 없이 — 화면 계약. POST /api/housing/me zone camp와 같다)
  const raw = await readJson(req);
  if (raw && typeof raw === "object" && (raw as Record<string, unknown>).itemId === undefined && (raw as Record<string, unknown>).zone === "camp") {
    const body = parseWith(CampBuySchema, raw);
    await rateLimit("shop", req, visitorId);
    const me = await myBrief(visitorId);
    return json<MyHouseResponse>(notifyHomes(await buyCampHome(getHouseStore(), visitorId, body.name ?? "", body.intro, me.name ?? "이름 없는 유령", body.lot, body.ch, body.kind, body.design)), { status: 201 });
  }
  const { itemId, zone } = parseWith(ItemSchema, raw);
  await rateLimit("shop", req, visitorId);
  const [perk, champ, chair] = await Promise.all([wornPerk(visitorId), champBoardsSafe(visitorId), chairPerkSafe(visitorId)]);
  return json<MyHouseResponse>(await buyFurniture(getHouseStore(), visitorId, itemId, pickDiscount(perk.houseDiscount, perkShopDiscount(champ, chair, "furniture")), zone));
});
