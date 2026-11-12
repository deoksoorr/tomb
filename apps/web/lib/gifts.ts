import { itemById } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { BALANCE_CAP } from "./economy";
import { getAccounts, getGifts } from "./store";
import { kstDay } from "./store/accounts";
import { GIFT_KEEP_MS, type GiftRecord } from "./store/gifts";

// 11번 관리자 선물: 보내기 검증과 발송 (라우트·다른 기능 공용 — 예: 고정 색상 염색권을 선물함으로 보낼 때 sendGift를 부르면 된다)

/** 선물에 넣을 수 있는 아이템: 상점 카탈로그(@tomb/protocol ITEMS)에 있는 것 */
export const isGiftItem = (id: string) => !!itemById(id);
/** 한 선물에 넣는 아이템 종류 수·개수 상한 */
export const GIFT_MAX_ITEMS = 10;
export const GIFT_MAX_COUNT = 99;
export const GIFT_NOTE_MAX = 200;
export const GIFT_FROM_DEFAULT = "마을 관리인";

const giftItem = z.object({
  itemId: z.string().max(60).refine(isGiftItem, "없는 아이템이에요."),
  count: z.number().int().min(1, "개수는 1 이상").max(GIFT_MAX_COUNT, `개수는 ${GIFT_MAX_COUNT}개까지`),
});

/** POST /api/admin/gifts: 대상(all 또는 계정 id) + 쪽지 + 포인트·아이템 (둘 중 하나는 있어야 한다) */
export const GiftSendSchema = z
  .object({
    target: z.union([z.literal("all"), z.string().regex(/^[A-Za-z0-9_-]{21}$/, "계정 id 형식이 올바르지 않아요.")]),
    targetName: z.string().max(20).nullish(),
    from: z.string().trim().max(20, "보내는 이는 20자까지").nullish(),
    note: z.string().trim().min(1, "쪽지를 적어 주세요.").max(GIFT_NOTE_MAX, `쪽지는 ${GIFT_NOTE_MAX}자까지 적을 수 있어요.`),
    points: z.number().int("정수로 적어 주세요.").min(0).max(BALANCE_CAP).default(0),
    items: z
      .array(giftItem)
      .max(GIFT_MAX_ITEMS, `아이템은 ${GIFT_MAX_ITEMS}종류까지`)
      .default([])
      .transform((list) => {
        // 같은 아이템은 합친다
        const m = new Map<string, number>();
        for (const { itemId, count } of list) m.set(itemId, Math.min(GIFT_MAX_COUNT, (m.get(itemId) ?? 0) + count));
        return [...m].map(([itemId, count]) => ({ itemId, count }));
      }),
  })
  .refine((v) => v.points > 0 || v.items.length > 0, "포인트나 아이템 중 하나는 넣어 주세요.");
export type GiftSendInput = z.output<typeof GiftSendSchema>;

/** 선물 보내기 (발송 기록에도 남는다). 받지 않으면 GIFT_KEEP_DAYS일 뒤 사라진다 */
export async function sendGift(input: GiftSendInput, now = Date.now()): Promise<GiftRecord> {
  const gift: GiftRecord = {
    id: nanoid(12),
    from: input.from || GIFT_FROM_DEFAULT,
    note: input.note,
    points: input.points,
    items: input.items,
    createdAt: now,
    expiresAt: now + GIFT_KEEP_MS,
    target: input.target,
    targetName: input.target === "all" ? null : (input.targetName ?? null),
  };
  await getGifts().send(gift);
  return gift;
}

/** 계정이 처음 들어온 시각 (없으면 지금으로 남긴다 → 새 계정은 이미 보낸 전체 선물을 받지 못한다) */
export async function giftAccountCreatedAt(visitorId: string, now: number): Promise<number> {
  const accounts = getAccounts();
  const a = await accounts.get(visitorId, kstDay(now), now);
  if (a.createdAt > 0) return a.createdAt;
  await accounts.enter(visitorId, {}, now);
  return (await accounts.get(visitorId, kstDay(now), now)).createdAt;
}
