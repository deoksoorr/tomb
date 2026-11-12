import { customAlphabet, nanoid } from "nanoid";
import { bodyLabel, bodyUnlockPrice, isFixedDyeId, isStaffBody, itemById, PERMANENT_UNTIL, permanentPrice, type CosmeticSlot, type DyePart } from "@tomb/protocol";
import { env } from "../env";
import { sendGift } from "../gifts";
import { HttpError } from "../http";
import { isStaff } from "../staff";
import { getAccounts } from "../store";
import { kstDay, lookGrant, lookOf, loadMe } from "../store/accounts";
import { getStyleStore, type DyeSession, type FixedDyeDef, type StyleStore } from "../store/style";
import type { Me } from "../types";
import { buildPalette, colorAt, DYE_GRACE_MS, DYE_TIME_MS } from "./palette";
import { BASE_RESHAPE_PRICE, catalogDye, DYE_DECIDE_MS, DYE_RESET_PRICE, fixedAllows, randomTier } from "./rules";
import type { DyeSessionView, DyeStateResponse, DyeTimeoutResponse, StyleChangeResponse } from "./types";

// 46·25·30번 서버 로직 (라우트가 부른다). 포인트·가방이 바뀌는 일은 모두 저장소(lib/store/style.ts)에서 원자적으로.

const style = (): StyleStore => getStyleStore(getAccounts());
const view = (s: DyeSession, now: number): DyeSessionView => ({ ...s, serverNow: now });

/** 바뀐 내 정보 + 착용 증서 (염색·몸 모양 포함) */
async function changed(accountId: string, now: number, extra: Partial<StyleChangeResponse> = {}): Promise<StyleChangeResponse> {
  const me = await loadMe(getAccounts(), accountId, now);
  return { me, lookGrant: await lookGrant(env.joinSecret(), accountId, lookOf(me), now, me), ...extra };
}

/** 판의 좌표 → 서버가 판정한 색 */
export function judgeColor(s: Pick<DyeSession, "seed" | "tier">, x: number, y: number): string {
  return colorAt(buildPalette(s.seed, s.tier), x, y);
}

/** 판이 끝났는지: 후보가 없으면 시간(+여유), 후보가 있으면 고르는 시간(+여유)이 지났다 */
const expired = (s: DyeSession, now: number) => now > (s.candidate ? s.candidate.decideBy : s.endsAt) + DYE_GRACE_MS;

/**
 * 끝나지 않은 채 시간이 지난 판(창을 닫고 떠났거나 고르지 않음) → 색을 바꾸지 않고 끝낸다 (염색권은 쓴 것으로).
 * 끝냈으면 그 부위
 */
async function settleExpired(accountId: string, now: number): Promise<{ part: DyePart } | null> {
  const st = style();
  const { session } = await st.get(accountId);
  if (!session || !expired(session, now)) return null;
  return (await st.cancel(accountId, session.seed)) ? { part: session.part } : null;
}

export async function dyeState(accountId: string, now = Date.now()): Promise<DyeStateResponse> {
  const ended = await settleExpired(accountId, now);
  const st = style();
  const [{ dye, session }, me] = await Promise.all([st.get(accountId), getAccounts().get(accountId, kstDay(now), now)]);
  const fixedIds = Object.keys(me.inventory).filter((id) => isFixedDyeId(id) && me.inventory[id] > 0);
  const tickets = fixedIds.length ? await st.fixedDefs(fixedIds) : {};
  return { session: session ? view(session, now) : null, tickets, dye, ...(ended ? { ended } : {}) };
}

/** 무작위 염색 시작 (진행 중인 판이 있으면 그 판을 이어서 — 염색권을 더 쓰지 않는다) */
export async function startDye(accountId: string, itemId: string, part: DyePart, now = Date.now()) {
  const tier = randomTier(itemId);
  if (!tier) throw new HttpError(400, "INVALID_INPUT", "무작위 염색권이 아니에요.");
  await settleExpired(accountId, now);
  const session: DyeSession = { seed: nanoid(12), tier, part, itemId, startedAt: now, endsAt: now + DYE_TIME_MS };
  const r = await style().begin(accountId, itemId, session);
  if (!r) throw new HttpError(409, "NO_ITEM", "가방에 그 염색권이 없어요.");
  return { me: await loadMe(getAccounts(), accountId, now), session: view(r.session, now), resumed: r.resumed };
}

async function current(accountId: string, seed: string): Promise<DyeSession> {
  const { session } = await style().get(accountId);
  if (!session || session.seed !== seed) throw new HttpError(409, "NO_SESSION", "진행 중인 염색이 없어요. 이미 끝났을 수도 있어요.");
  return session;
}

/** 색을 바꾸지 않고 판을 끝낸 결과 (kept) */
async function keep(accountId: string, s: DyeSession, now: number, late = false): Promise<StyleChangeResponse> {
  await style().cancel(accountId, s.seed);
  return changed(accountId, now, { part: s.part, kept: true, ...(late ? { late } : {}) });
}

/**
 * 무작위 염색 끝내기 ([이 색으로 염색]): 클라이언트는 판 위 좌표만 보내고, 색은 서버가 그 판(시드)으로 계산한다.
 * 시간(+여유)이 지난 뒤에 온 좌표는 받지 않고 색을 그대로 둔다 (late·kept). 시간이 끝나 후보가 생긴 판은 chooseDye로만
 */
export async function finishDye(accountId: string, seed: string, x: number, y: number, now = Date.now()): Promise<StyleChangeResponse> {
  const session = await current(accountId, seed);
  if (session.candidate) throw new HttpError(409, "DYE_DECIDING", "시간이 끝났어요. 새 색으로 바꿀지 지금 색을 유지할지 골라 주세요.");
  if (now > session.endsAt + DYE_GRACE_MS) return keep(accountId, session, now, true);
  const color = judgeColor(session, x, y);
  if (!(await style().finish(accountId, seed, color))) throw new HttpError(409, "NO_SESSION", "이미 끝난 염색이에요.");
  return changed(accountId, now, { color, part: session.part });
}

/**
 * 시간이 끝난 순간 조준점 좌표 → 서버가 그 색을 후보로 판에 적는다 (색은 아직 그대로).
 * 여유 시간까지 지나서 오면 후보 없이 끝낸다 (candidate: null, 색 그대로). 같은 판에 두 번 오면 처음 후보를 그대로 돌려준다
 */
export async function timeoutDye(accountId: string, seed: string, x: number, y: number, now = Date.now()): Promise<DyeTimeoutResponse> {
  const session = await current(accountId, seed);
  if (session.candidate) return { part: session.part, candidate: session.candidate, serverNow: now };
  if (now < session.endsAt - DYE_GRACE_MS) throw new HttpError(409, "TOO_EARLY", "아직 시간이 남았어요.");
  if (now > session.endsAt + DYE_GRACE_MS) {
    await style().cancel(accountId, seed);
    return { part: session.part, candidate: null, serverNow: now };
  }
  const candidate = { color: judgeColor(session, x, y), decideBy: now + DYE_DECIDE_MS };
  if (await style().propose(accountId, seed, candidate)) return { part: session.part, candidate, serverNow: now };
  // 동시에 온 요청이 먼저 적었다 → 그 후보
  const again = await current(accountId, seed);
  if (!again.candidate) throw new HttpError(409, "NO_SESSION", "이미 끝난 염색이에요.");
  return { part: again.part, candidate: again.candidate, serverNow: now };
}

/** 후보 고르기: apply = 새 색으로 바꾸기, 아니면 지금 색 유지. 고르는 시간(+여유)이 지났으면 유지 (late·kept) */
export async function chooseDye(accountId: string, seed: string, apply: boolean, now = Date.now()): Promise<StyleChangeResponse> {
  const session = await current(accountId, seed);
  if (!session.candidate) throw new HttpError(409, "NO_CANDIDATE", "아직 고를 색이 없어요.");
  if (!apply) return keep(accountId, session, now);
  if (now > session.candidate.decideBy + DYE_GRACE_MS) return keep(accountId, session, now, true);
  const { color } = session.candidate;
  if (!(await style().finish(accountId, seed, color))) throw new HttpError(409, "NO_SESSION", "이미 끝난 염색이에요.");
  return changed(accountId, now, { color, part: session.part });
}

/** 염색 포기 (창 닫기): 색은 그대로, 염색권은 돌려주지 않는다. 판이 없으면 아무 일도 없다 */
export async function cancelDye(accountId: string, seed: string): Promise<{ cancelled: boolean }> {
  return { cancelled: await style().cancel(accountId, seed) };
}

/** 고정 색 염색권 정의 (카탈로그 또는 관리자 발급분) */
export async function fixedTicket(itemId: string): Promise<{ name: string; color: string; parts?: DyePart[] } | null> {
  const c = catalogDye(itemId);
  if (c?.dye.mode === "fixed") return { name: c.name, color: c.dye.color, parts: c.dye.parts };
  if (!isFixedDyeId(itemId)) return null;
  return (await style().fixedDefs([itemId]))[itemId] ?? null;
}

export async function applyFixedDye(accountId: string, itemId: string, part: DyePart, now = Date.now()): Promise<StyleChangeResponse> {
  const def = await fixedTicket(itemId);
  if (!def) throw new HttpError(404, "NOT_FOUND", "없는 염색권이에요.");
  if (!fixedAllows(def.parts, part)) throw new HttpError(400, "INVALID_INPUT", "이 염색권은 그 부위에 쓸 수 없어요.");
  // 색은 저장된 정의에서만 온다 (요청에 색이 없다)
  if (!(await style().applyFixed(accountId, itemId, part, def.color))) throw new HttpError(409, "NO_ITEM", "가방에 그 염색권이 없어요.");
  return changed(accountId, now, { color: def.color, part });
}

const charged = (r: "ok" | "insufficient" | "same" | "unlocked", same: string) => {
  if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  if (r === "same") throw new HttpError(409, "NO_CHANGE", same);
};

export async function resetDye(accountId: string, part: DyePart, now = Date.now()): Promise<StyleChangeResponse> {
  charged(await style().reset(accountId, part, DYE_RESET_PRICE, `shop:염색 되돌리기(${part})`, now), "이미 원래 색이에요.");
  return changed(accountId, now, { part });
}

/**
 * 25번 외형 바꾸기. 소장한 외형(처음 6종 · 해금한 프리미엄)끼리는 무료, 해금 전 프리미엄 외형은 등급별 선택권 값(영구 해금 + 바꾸기),
 * 운영자 전용 몸(저승사자)은 운영자만 (값 없음). unlocked = 이번에 새로 해금했다
 */
export async function reshape(accountId: string, body: string, now = Date.now()): Promise<StyleChangeResponse> {
  if (isStaffBody(body)) {
    if (!(await isStaff(accountId))) throw new HttpError(403, "FORBIDDEN", "운영자만 쓸 수 있는 외형이에요.");
    charged(await style().reshape(accountId, body, now), "지금 그 모습이에요.");
    return changed(accountId, now);
  }
  const unlockPrice = bodyUnlockPrice(body);
  const unlock = unlockPrice === null ? undefined : { price: unlockPrice, reason: `shop:외형 선택권(${bodyLabel(body)})` };
  // 기본 외형(처음 6종)으로 바꿀 때는 싸게 값을 받는다 (프리미엄 소장 외형은 무료)
  let paid = 0;
  if (unlockPrice === null) {
    const cur = await getAccounts().get(accountId, kstDay(now), now);
    if (cur.body === body) throw new HttpError(409, "NO_CHANGE", "지금 그 모습이에요.");
    if ((await getAccounts().spend(accountId, BASE_RESHAPE_PRICE, `shop:외형 바꾸기(${bodyLabel(body)})`, now)) === null)
      throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
    paid = BASE_RESHAPE_PRICE;
  }
  const r = await style().reshape(accountId, body, now, unlock);
  if (paid && r !== "ok") await getAccounts().refund(accountId, paid, "refund:외형 바꾸기", now);
  charged(r, "지금 그 모습이에요.");
  return changed(accountId, now, r === "unlocked" ? { unlocked: true } : {});
}

/** 30번 영구 꾸미기 사기 → 바뀐 내 정보 (입고 있던 기간제는 그대로 영구가 되므로 착용 증서도 준다) */
export async function buyPermanent(accountId: string, itemId: string, now = Date.now()): Promise<{ me: Me; lookGrant: string }> {
  const item = itemById(itemId);
  const price = permanentPrice(itemId);
  if (!item || item.kind !== "cosmetic" || !item.slot || price === null) throw new HttpError(400, "INVALID_INPUT", "영구로 살 수 없는 꾸미기예요.");
  if (item.staff && !(await isStaff(accountId))) throw new HttpError(403, "FORBIDDEN", "운영자만 받을 수 있는 꾸미기예요.");
  const r = await style().buyPermanent(accountId, itemId, item.slot as CosmeticSlot, price, PERMANENT_UNTIL, `shop:영구 ${itemId}`, now);
  if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 영구로 가지고 있어요.");
  if (r === "ticket") throw new HttpError(409, "HAS_TICKET", "가방에 같은 꾸미기 이용권이 있어요. 먼저 입은 뒤에 영구로 바꿀 수 있어요.");
  if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  const res = await changed(accountId, now);
  return { me: res.me, lookGrant: res.lookGrant };
}

// ── 관리자: 고정 색 염색권 발급 ──

const fixedIdChars = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);

/**
 * 고정 색 염색권을 새로 만들어(dyefix_*) 11번 선물함으로 보낸다 (받으면 가방에 들어간다).
 * target = "all"(선물함 규칙: 보낸 시각 전에 들어온 모든 계정) 또는 계정 id
 */
export async function issueFixedDye(
  input: { name: string; color: string; parts?: DyePart[]; count: number; target: "all" | string; note?: string },
  now = Date.now(),
): Promise<{ def: FixedDyeDef; giftId: string }> {
  const st = style();
  let targetName: string | null = null;
  if (input.target !== "all") {
    const a = await getAccounts().get(input.target, kstDay(now), now);
    if (!a.name && a.points === 0 && a.lifetimePoints === 0 && !a.hasCode && !a.createdAt) throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요.");
    targetName = a.name;
  }
  const def: FixedDyeDef = {
    id: `dyefix_${fixedIdChars()}`,
    name: input.name,
    color: input.color,
    ...(input.parts?.length ? { parts: [...new Set(input.parts)] } : {}),
    createdAt: now,
  };
  await st.putFixed(def);
  const gift = await sendGift(
    {
      target: input.target,
      targetName,
      from: null,
      note: input.note?.trim() || `${def.name}이(가) 도착했어요. 가방에서 부위를 골라 쓰면 바로 그 색으로 염색돼요.`,
      points: 0,
      items: [{ itemId: def.id, count: input.count }],
    },
    now,
  );
  await st.logIssue({ at: now, defId: def.id, name: def.name, color: def.color, count: input.count, target: input.target, giftId: gift.id });
  return { def, giftId: gift.id };
}
