import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { SEA_LOT_COUNT } from "@/lib/housing/catalog";
import { AdminHouseSchema } from "@/lib/housing/schemas";
import { getHouseStore, houseNotFound, isHouseId } from "@/lib/housing/service";
import { readBody } from "@/lib/validate";

/** `{ action: "hide" | "unhide" | "delete" | "move", lot? }`. move는 같은 채널 안에서 번지를 옮긴다(비어 있는 번지만). 숨기면 목록·랭킹·방문에서 빠진다. delete는 배치·가방·방명록까지 지운다(포인트는 돌려주지 않는다) */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const { action, lot } = await readBody(req, AdminHouseSchema);
  const store = getHouseStore();
  const house = isHouseId(id) ? await store.get(id) : null;
  if (!house) throw houseNotFound();
  if (action === "move") {
    // 11/15 같은 채널 안에서 번지 옮기기 (그 번지가 비어 있을 때만)
    if (!lot) throw new HttpError(400, "BAD_LOT", "옮길 번지를 적어 주세요.");
    // 11/26 캠핑장 집은 터마다 종류(카라반·펜션·촌캉스)가 달라 옮기지 않는다
    if (house.zone === "camp") throw new HttpError(400, "BAD_LOT", "캠핑장 집은 터마다 종류가 달라 옮길 수 없어요.");
    // 11/16 포구 오두막은 1~6번 터 안에서만
    if (house.zone === "sea" && lot > SEA_LOT_COUNT) throw new HttpError(400, "BAD_LOT", `오두막 터는 1~${SEA_LOT_COUNT}번이에요.`);
    const r = await store.moveLot(id, lot);
    if (r === "taken") throw new HttpError(409, "LOT_TAKEN", `${lot}번지에는 이미 다른 집이 있어요.`);
    if (r === "no_house") throw houseNotFound();
  } else if (action === "delete") await store.remove(id);
  else await store.setHidden(id, action === "hide");
  return json({ ok: true });
});
