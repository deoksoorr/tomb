import { customAlphabet, nanoid } from "nanoid";
import { isFixedDyeId, itemById, PERMANENT_UNTIL, permanentPrice, type CosmeticSlot, type DyePart } from "@tomb/protocol";
import { env } from "../env";
import { sendGift } from "../gifts";
import { HttpError } from "../http";
import { getAccounts } from "../store";
import { kstDay, lookGrant, lookOf, loadMe } from "../store/accounts";
import { getStyleStore, type DyeSession, type FixedDyeDef, type StyleStore } from "../store/style";
import type { Me } from "../types";
import { buildPalette, colorAt, DYE_CENTER, DYE_GRACE_MS, DYE_TIME_MS } from "./palette";
import { catalogDye, DYE_RESET_PRICE, fixedAllows, randomTier, RESHAPE_PRICE } from "./rules";
import type { DyeSessionView, DyeStateResponse, StyleChangeResponse } from "./types";

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

/** 시간(+여유)이 지났는데 끝나지 않은 판 → 처음 조준점(판 가운데) 색으로 정한다. 정했으면 그 결과 */
async function settleExpired(accountId: string, now: number): Promise<{ part: DyePart; color: string } | null> {
  const st = style();
  const { session } = await st.get(accountId);
  if (!session || now <= session.endsAt + DYE_GRACE_MS) return null;
  const color = judgeColor(session, DYE_CENTER.x, DYE_CENTER.y);
  return (await st.finish(accountId, session.seed, color)) ? { part: session.part, color } : null;
}

export async function dyeState(accountId: string, now = Date.now()): Promise<DyeStateResponse> {
  const finalized = await settleExpired(accountId, now);
  const st = style();
  const [{ dye, session }, me] = await Promise.all([st.get(accountId), getAccounts().get(accountId, kstDay(now), now)]);
  const fixedIds = Object.keys(me.inventory).filter((id) => isFixedDyeId(id) && me.inventory[id] > 0);
  const tickets = fixedIds.length ? await st.fixedDefs(fixedIds) : {};
  return { session: session ? view(session, now) : null, tickets, dye, ...(finalized ? { finalized } : {}) };
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

/**
 * 무작위 염색 끝내기: 클라이언트는 판 위 좌표만 보내고, 색은 서버가 그 판(시드)으로 계산한다.
 * 시간(+여유)이 지난 뒤에 온 좌표는 받지 않고 판 가운데 색으로 정한다 (late)
 */
export async function finishDye(accountId: string, seed: string, x: number, y: number, now = Date.now()): Promise<StyleChangeResponse> {
  const st = style();
  const { session } = await st.get(accountId);
  if (!session || session.seed !== seed) {
    const settled = await settleExpired(accountId, now);
    if (settled) return changed(accountId, now, { ...settled, late: true });
    throw new HttpError(409, "NO_SESSION", "진행 중인 염색이 없어요. 이미 끝났을 수도 있어요.");
  }
  const late = now > session.endsAt + DYE_GRACE_MS;
  const color = late ? judgeColor(session, DYE_CENTER.x, DYE_CENTER.y) : judgeColor(session, x, y);
  if (!(await st.finish(accountId, seed, color))) throw new HttpError(409, "NO_SESSION", "이미 끝난 염색이에요.");
  return changed(accountId, now, { color, part: session.part, late });
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

const charged = (r: "ok" | "insufficient" | "same", same: string) => {
  if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  if (r === "same") throw new HttpError(409, "NO_CHANGE", same);
};

export async function resetDye(accountId: string, part: DyePart, now = Date.now()): Promise<StyleChangeResponse> {
  charged(await style().reset(accountId, part, DYE_RESET_PRICE, `shop:염색 되돌리기(${part})`, now), "이미 원래 색이에요.");
  return changed(accountId, now, { part });
}

export async function reshape(accountId: string, body: string, now = Date.now()): Promise<StyleChangeResponse> {
  charged(await style().reshape(accountId, body, RESHAPE_PRICE, `shop:외형 바꾸기(${body})`, now), "지금 그 모습이에요.");
  return changed(accountId, now);
}

/** 30번 영구 꾸미기 사기 → 바뀐 내 정보 (입고 있던 기간제는 그대로 영구가 되므로 착용 증서도 준다) */
export async function buyPermanent(accountId: string, itemId: string, now = Date.now()): Promise<{ me: Me; lookGrant: string }> {
  const item = itemById(itemId);
  const price = permanentPrice(itemId);
  if (!item || item.kind !== "cosmetic" || !item.slot || price === null) throw new HttpError(400, "INVALID_INPUT", "영구로 살 수 없는 꾸미기예요.");
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
