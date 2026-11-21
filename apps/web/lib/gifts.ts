import { itemById } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { BALANCE_CAP } from "./economy";
import { getAccounts, getGifts } from "./store";
import { kstDay } from "./store/accounts";
import { GIFT_KEEP_MS, type GiftRecord } from "./store/gifts";
import { GIFT_MAX_COUNT, GIFT_MAX_ITEMS, GIFT_MAX_TARGETS, giftHasTerm, isGiftTerm, type GiftItem, type GiftTerm } from "./types";

// 11번 관리자 선물: 보내기 검증과 발송 (라우트·다른 기능 공용 — 예: 고정 색상 염색권을 선물함으로 보낼 때 sendGift를 부르면 된다)

/** 선물에 넣을 수 있는 아이템: 상점 카탈로그(@tomb/protocol ITEMS)에 있는 것 (11/20 별자리 잇기 전용 유성우 오라는 빼요 — 망원경에서만) */
export const isGiftItem = (id: string) => !!itemById(id) && !itemById(id)?.stargaze && !itemById(id)?.alley;
export { GIFT_MAX_COUNT, GIFT_MAX_ITEMS, GIFT_MAX_TARGETS, giftHasTerm };
export const GIFT_NOTE_MAX = 200;
export const GIFT_FROM_DEFAULT = "마을 관리인";

const giftItem = z
  .object({
    itemId: z.string().max(60).refine(isGiftItem, "없는 아이템이에요."),
    count: z.number().int().min(1, "개수는 1 이상").max(GIFT_MAX_COUNT, `개수는 ${GIFT_MAX_COUNT}개까지`),
    // 없거나 null = 기본 (가방 이용권). 정해진 값만 받는다
    term: z
      .string()
      .refine(isGiftTerm, "고를 수 없는 기간이에요.")
      .transform((t) => t as GiftTerm)
      .nullish(),
  })
  .refine((v) => !v.term || giftHasTerm(v.itemId), "기간은 캐릭터 꾸미기에만 고를 수 있어요.")
  // 기간 선물은 개수 대신 기간이다 (1개로 맞춘다)
  .transform((v): GiftItem => (v.term ? { itemId: v.itemId, count: 1, term: v.term } : { itemId: v.itemId, count: v.count }));

const giftItems = z
  .array(giftItem)
  .max(GIFT_MAX_ITEMS, `아이템은 ${GIFT_MAX_ITEMS}종류까지`)
  .default([])
  .transform((list) => {
    // 같은 아이템·같은 기간은 합친다 (기간 선물은 한 줄만 — 기간끼리 더하지 않는다)
    const m = new Map<string, GiftItem>();
    for (const it of list) {
      const key = `${it.itemId}|${it.term ?? ""}`;
      const cur = m.get(key);
      m.set(key, cur && !it.term ? { ...cur, count: Math.min(GIFT_MAX_COUNT, cur.count + it.count) } : (cur ?? it));
    }
    return [...m.values()];
  });
const giftNote = z.string().trim().min(1, "쪽지를 적어 주세요.").max(GIFT_NOTE_MAX, `쪽지는 ${GIFT_NOTE_MAX}자까지 적을 수 있어요.`);
const giftFrom = z.string().trim().max(20, "보내는 이는 20자까지").nullish();
const giftPoints = z.number().int("정수로 적어 주세요.").min(0).max(BALANCE_CAP).default(0);
const giftRequestId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).nullish();

const accountId = z.string().regex(/^[A-Za-z0-9_-]{21}$/, "계정 id 형식이 올바르지 않아요.");
const giftTarget = z.object({ id: accountId, name: z.string().max(20).nullish() });
/** 골라 보낸 받는 사람 한 명 (name = 그때의 닉네임, 관리자 기록 표시용) */
export type GiftTarget = { id: string; name: string | null };

/**
 * POST /api/admin/gifts: 대상 + 쪽지 + 포인트·아이템 (포인트·아이템 둘 중 하나는 있어야 한다).
 * 대상은 target("all" 또는 계정 id) 또는 targets(여러 계정, 같은 id는 한 번만). 둘 다 오면 target 계정을 맨 앞에 합친다.
 * 결과: 한 명이면 target = 그 id, 두 명 이상이면 targets에 모두 (target·targetName은 첫 사람)
 */
export const GiftSendSchema = z
  .object({
    target: z.union([z.literal("all"), accountId]).nullish(),
    targetName: z.string().max(20).nullish(),
    // 중복을 빼기 전이라 넉넉히 받고, 뺀 뒤 GIFT_MAX_TARGETS명이 넘으면 거절한다
    targets: z.array(giftTarget).max(GIFT_MAX_TARGETS * 2, `한 번에 ${GIFT_MAX_TARGETS}명까지 보낼 수 있어요.`).nullish(),
    from: giftFrom,
    /** 11/16 화면이 보낼 때마다 붙이는 요청 번호 (같은 번호는 한 번만 보낸다 — 두 번 눌러 두 번 나가지 않게) */
    requestId: giftRequestId,
    note: giftNote,
    points: giftPoints,
    items: giftItems,
  })
  .refine((v) => v.points > 0 || v.items.length > 0, "포인트나 아이템 중 하나는 넣어 주세요.")
  .refine((v) => !(v.target === "all" && v.targets?.length), "전체에 보낼 때는 계정을 따로 고르지 않아요.")
  .transform((v, ctx) => {
    const { targets: picked, ...rest } = v;
    if (v.target === "all") return { ...rest, target: "all", targetName: null };
    const seen = new Map<string, GiftTarget>();
    const list = [...(v.target ? [{ id: v.target, name: v.targetName }] : []), ...(picked ?? [])];
    for (const t of list) if (!seen.has(t.id)) seen.set(t.id, { id: t.id, name: t.name ?? null });
    const targets = [...seen.values()];
    if (!targets.length) {
      ctx.addIssue({ code: "custom", message: "받는 사람을 골라 주세요." });
      return z.NEVER;
    }
    if (targets.length > GIFT_MAX_TARGETS) {
      ctx.addIssue({ code: "custom", message: `한 번에 ${GIFT_MAX_TARGETS}명까지 보낼 수 있어요.` });
      return z.NEVER;
    }
    const [first] = targets;
    return { ...rest, target: first.id, targetName: first.name, ...(targets.length > 1 ? { targets } : {}) };
  });
/**
 * 11/17 POST /api/admin/gifts/online: 지금 접속 중인 사람 모두에게 (받는 사람은 서버가 실시간 서버에 다시 묻는다).
 * expect = 확인 화면에 보여 준 사람 수 (기록용 — 그 사이 들고 난 사람이 있으면 실제 수는 조금 다를 수 있다)
 */
export const GiftOnlineSchema = z
  .object({
    from: giftFrom,
    requestId: giftRequestId,
    note: giftNote,
    points: giftPoints,
    items: giftItems,
    expect: z.number().int().min(0).max(1_000_000).nullish(),
  })
  .refine((v) => v.points > 0 || v.items.length > 0, "포인트나 아이템 중 하나는 넣어 주세요.");

/** 보내기 입력 (검증 뒤). targets는 두 명 이상일 때만 (한 명·전체는 target 하나로) */
export type GiftSendInput = {
  requestId?: string | null;
  target: "all" | string;
  targetName?: string | null;
  targets?: GiftTarget[] | null;
  from?: string | null;
  note: string;
  points: number;
  items: GiftItem[];
};

/** 선물 보내기 (발송 기록에도 남는다). 받지 않으면 GIFT_KEEP_DAYS일 뒤 사라진다 */
export async function sendGift(input: GiftSendInput, now = Date.now()): Promise<GiftRecord> {
  // 여러 계정: 받는 계정 id 전부를 남기고 (저장소가 계정마다 선물함에 넣는다, 발송 기록은 한 줄) 기록 표시는 첫 사람 이름으로
  const many = input.target !== "all" && input.targets && input.targets.length > 1 ? input.targets : null;
  const gift: GiftRecord = {
    id: nanoid(12),
    from: input.from || GIFT_FROM_DEFAULT,
    note: input.note,
    points: input.points,
    items: input.items,
    createdAt: now,
    expiresAt: now + GIFT_KEEP_MS,
    target: many ? many[0].id : input.target,
    targetName: many ? many[0].name : input.target === "all" ? null : (input.targetName ?? null),
    ...(many ? { targets: many.map((t) => t.id), targetNames: many.map((t) => t.name ?? null) } : {}),
  };
  await getGifts().send(gift);
  return gift;
}

/** 계정이 처음 들어온 시각 (없으면 지금으로 남긴다 → 새 계정은 이미 보낸 전체 선물을 받지 못한다) */
export async function giftAccountCreatedAt(visitorId: string, now: number): Promise<number> {
  const accounts = getAccounts();
  // 가입 시각 한 필드만 (HMGET 1개). 계정 전체(get = 명령 9개)를 읽지 않는다
  const [a] = await accounts.summaries([visitorId]);
  if (a && a.createdAt > 0) return a.createdAt;
  await accounts.enter(visitorId, {}, now);
  return (await accounts.get(visitorId, kstDay(now), now)).createdAt;
}
