import { alleyBody, bodyLabel, itemById, PERMANENT_UNTIL, type CosmeticSlot } from "@tomb/protocol";
import { changed } from "../dye/service";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { getAccounts } from "../store";
import { loadMe } from "../store/accounts";
import { getStyleStore } from "../store/style";
import type { Me } from "../types";
import { BUNGEO_CLOSED_MSG, BUNGEO_GOODS, bungeoGoods, bungeoOpen, bungeoUpcoming, type BungeoKind, type BungeoSlot } from "./cart";

// 11/22 골목 붕어빵 수레 (서버). 일정·목록은 lib/bungeo/cart (순수).
// 사기: ① 열려 있는지 (밤 10시~새벽 2시, 사흘에 한 번 — 아니면 409 BUNGEO_CLOSED, 포인트 그대로) ② 판매 목록에 있는지
//  ③ 이미 가졌는지 ④ 차감 + 소장 — 꾸미기 = 영구 꾸미기 저장소 한 번 (style buyPermanent: 이미 영구 → owned · 부족 → insufficient, 원자적)
//     외형 = 외형 선택권과 같은 reshape(unlock) 한 번 (값을 내고 소장 기록에 더하며 그 모습으로 바뀐다, 원자적)
// 값은 고정 (칭호·포인트왕 할인 없음). 운영자 계정도 다른 상점처럼 그대로 값을 낸다 (유령선 장터와 같다).
// 서버는 수레 자리를 몰라요 (창을 어디서 열어도 같은 값이라 이득이 없다 — 유령선 장터와 같다).
// 일반 계정 응답에는 다음 출현 일정을 절대 싣지 않는다 (bungeoSchedule — 운영자만, 아니면 403)

export type BungeoRow = { kind: BungeoKind; id: string; name: string; group: string; price: number; owned: boolean };
export type BungeoStatus = {
  open: boolean;
  /** 닫혀 있으면 빈 목록 (무엇을 파는지도 열린 밤에만) */
  items: BungeoRow[];
  points: number;
};
export type BungeoBuyResult = BungeoStatus & { me: Me; lookGrant: string; got: string };
export type BungeoSchedule = { now: number; open: boolean; next: BungeoSlot[] };

/** 이미 가진 꾸미기(영구) · 외형 */
async function owned(accountId: string, me: Me): Promise<Set<string>> {
  const out = new Set<string>();
  for (const e of [...me.equipped, ...me.stash]) if (e.until >= PERMANENT_UNTIL) out.add(e.itemId);
  const st = await getStyleStore(getAccounts()).get(accountId);
  for (const b of st.bodies) out.add(b);
  if (me.body && alleyBody(me.body)) out.add(me.body);
  return out;
}

const nameOf = (kind: BungeoKind, id: string) => (kind === "body" ? bodyLabel(id) : (itemById(id)?.name ?? id));

export async function bungeoStatus(accountId: string, now = Date.now()): Promise<BungeoStatus> {
  const me = await loadMe(getAccounts(), accountId, now);
  if (!bungeoOpen(now)) return { open: false, items: [], points: me.points };
  const have = await owned(accountId, me);
  return {
    open: true,
    items: BUNGEO_GOODS.map((g) => ({ kind: g.kind, id: g.id, name: nameOf(g.kind, g.id), group: g.group, price: g.price, owned: have.has(g.id) })),
    points: me.points,
  };
}

/** 수레에서 사기 (id = 꾸미기 id 또는 외형 id) */
export async function buyBungeo(accountId: string, id: string, now = Date.now()): Promise<BungeoBuyResult> {
  if (!bungeoOpen(now)) throw new HttpError(409, "BUNGEO_CLOSED", BUNGEO_CLOSED_MSG);
  const g = bungeoGoods(id);
  if (!g) throw new HttpError(400, "INVALID_INPUT", "수레에서 팔지 않는 물건이에요.");
  const store = getStyleStore(getAccounts());
  let res: { me: Me; lookGrant: string };
  if (g.kind === "body") {
    if (!alleyBody(g.id)) throw new HttpError(400, "INVALID_INPUT", "수레에서 팔지 않는 물건이에요.");
    if ((await store.get(accountId)).bodies.includes(g.id)) throw new HttpError(409, "ALREADY_OWNED", "이미 소장한 외형이에요.");
    const r = await store.reshape(accountId, g.id, now, { price: g.price, reason: `shop:붕어빵 수레 ${g.id}` });
    if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
    if (r === "same") throw new HttpError(409, "ALREADY_OWNED", "이미 소장한 외형이에요.");
    res = await changed(accountId, now);
  } else {
    const item = itemById(g.id);
    if (!item?.alley || !item.slot) throw new HttpError(400, "INVALID_INPUT", "수레에서 팔지 않는 물건이에요.");
    const r = await store.buyPermanent(accountId, g.id, item.slot as CosmeticSlot, g.price, PERMANENT_UNTIL, `shop:붕어빵 수레 ${g.id}`, now);
    if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 영구로 가지고 있어요.");
    if (r === "ticket") throw new HttpError(409, "HAS_TICKET", "가방에 같은 꾸미기 이용권이 있어요. 먼저 입은 뒤에 사요.");
    if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
    res = await changed(accountId, now);
  }
  const status = await bungeoStatus(accountId, now);
  return { ...status, me: res.me, lookGrant: res.lookGrant, got: nameOf(g.kind, g.id) };
}

/** 운영자 전용: 다음 출현 일정 (일반 계정은 403 — 일정은 운영자 화면에만) */
export async function bungeoSchedule(accountId: string, now = Date.now()): Promise<BungeoSchedule> {
  if (!(await isStaff(accountId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 볼 수 있어요.");
  return { now, open: bungeoOpen(now), next: bungeoUpcoming(now, 5) };
}
