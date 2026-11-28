import { whereOf } from "@/lib/ban";
import { endAutoFishOnLeave } from "@/lib/forage/service";
import { findVisibleHouse, getHouseStore } from "@/lib/housing/service";
import { houseTargetText, ownerOfflineMessage, visitVerdict } from "@/lib/housing/visitGate";
import { handler, HttpError, json } from "@/lib/http";
import { isMoveVia } from "@/lib/moveLog";
import { logMoves } from "@/lib/opsLog";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";

/**
 * 11/27 집에 들어가기 전 확인 `{ via? }` (lib/housing/visitGate). 남의 집은 주인이 접속 중일 때만 (그 집 채널·맵에 서 있으면 문으로는 그대로).
 * 들어감·못 들어감을 그 계정 접속 기록에 남긴다 (via = 누른 버튼, 화면 말 그대로 — 판단에는 쓰지 않는다).
 * 막히면 403 OWNER_OFFLINE. 실시간 서버에 닿지 못하면 { ok, unknown } — 화면이 지금 채널·맵의 집만 들어간다
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("houseVisit", req, visitorId);
  const body = (await req.json().catch(() => null)) as { via?: unknown } | null;
  const via = isMoveVia(body?.via) ? body.via : undefined;
  const house = await findVisibleHouse(getHouseStore(), id);
  const mine = house.owner === visitorId;
  const staff = mine ? false : await isStaff(visitorId);
  const where = mine || staff ? {} : await whereOf([visitorId, house.owner], true).catch(() => null);
  const verdict = visitVerdict({
    mine,
    staff,
    reached: where !== null,
    owner: where?.[house.owner],
    me: where?.[visitorId],
    house: { ch: house.ch, map: house.zone ?? "village" },
  });
  const now = Date.now();
  const tgt = houseTargetText(house);
  logMoves([{ a: visitorId, k: "mv", at: now, m: verdict.ok ? "houseIn" : "houseNo", ...(via ? { via } : {}), tgt, ...(mine ? { mine: true as const } : {}), ...(verdict.ok ? {} : { no: verdict.why }), src: "s" }]);
  if (!verdict.ok) throw new HttpError(403, "OWNER_OFFLINE", ownerOfflineMessage(house.ownerName));
  // 11/27 집에 들어가면 자동 낚시는 지금 끝난다 (켠 자리를 떠났다 — lib/forage/autoSpot). 실패해도 들어가기는 그대로
  await endAutoFishOnLeave(visitorId, now, "fishHouse").catch((e) => console.error("[forage] 자동 낚시 끄기 실패", e));
  return json(verdict, { headers: { "Cache-Control": "private, no-store" } });
});
