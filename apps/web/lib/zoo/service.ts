import { PERMANENT_UNTIL, petDef, zooShopPrice } from "@tomb/protocol";
import { env } from "../env";
import { HttpError } from "../http";
import { recordLook } from "../lookRank";
import { getAccounts } from "../store";
import { lookGrant, lookOf, loadMe } from "../store/accounts";
import { getStyleStore } from "../store/style";
import type { WearResponse } from "../types";

// 동물원 사육사 펫 분양 (서버). 펫은 영구로만 판다 — 포인트 차감과 영구 등록은 저장소 한 번(Redis Lua / 메모리 await 없는 구간)으로 원자적이다
// (lib/store/style.ts buyPermanent: 이미 영구면 owned, 가방에 같은 이용권이 있으면 ticket, 모자라면 insufficient).
// 사면 바로 데리고 다닌다 (펫 부위는 하나라 데리고 다니던 펫은 벗어 둔 꾸미기 = "집"으로 간다). 데리고 다닐 펫 바꾸기·집에 두기는
// 다른 꾸미기와 같은 /api/me/wear · /api/me/unequip. 사육사 앞에서만 여는 창은 UI 몫 (서버는 위치를 모른다 — 어디서 불러도 같은 값이라 이득이 없다).

/** 펫 분양: 영구로 사고 바로 데리고 다닌다. 결과 = 바뀐 내 정보 + 착용 증서 (실시간 서버로 같은 채널에 퍼진다) */
export async function buyPet(accountId: string, petId: string, now = Date.now()): Promise<WearResponse> {
  const def = petDef(petId);
  if (!def) throw new HttpError(400, "INVALID_INPUT", "동물원에 없는 펫이에요.");
  // 11/20 퇴근 강아지·사무실 고양이·듬직한 큰 개는 분양사 보리만 판다 (protocol BORI_ONLY_PETS — 값 정보는 그대로)
  if (zooShopPrice(petId) === null) throw new HttpError(400, "NOT_SOLD", "강아지·고양이는 동물원 정문 옆 분양사 보리가 분양해요.");
  return adoptPet(accountId, petId, def.price, { tag: "동물원", where: "사육사 창" }, now);
}

/**
 * 11/19 영구 분양 한 번 (동물원 사육사·분양사 보리가 같이 쓴다 — 값은 부르는 쪽이 정한다).
 * tag = 포인트 기록 이름, where = 「이미 가족」 안내에 넣을 창 이름
 */
export async function adoptPet(accountId: string, petId: string, price: number, from: { tag: string; where: string }, now = Date.now()): Promise<WearResponse> {
  const accounts = getAccounts();
  const r = await getStyleStore(accounts).buyPermanent(accountId, petId, "pet", price, PERMANENT_UNTIL, `shop:${from.tag} ${petId}`, now);
  if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", `이미 가족이 된 펫이에요. 가방이나 ${from.where}에서 데리고 다닐 수 있어요.`);
  if (r === "ticket") throw new HttpError(409, "HAS_TICKET", "가방에 같은 펫 이용권이 있어요. 가방에서 먼저 데리고 나온 다음 영구 분양을 받아 주세요.");
  if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  // 집(벗어 둔 꾸미기)에 들어간 새 펫을 바로 데리고 나온다. 입고 있던 기간제가 영구로 바뀐 경우엔 이미 데리고 있다 (false여도 괜찮다)
  await accounts.wear(accountId, petId, "pet", now);
  const me = await loadMe(accounts, accountId, now);
  await recordLook(accountId, me, { now }); // 꾸미기 랭킹 점수
  return { me, lookGrant: await lookGrant(env.joinSecret(), accountId, lookOf(me), now, me) };
}
