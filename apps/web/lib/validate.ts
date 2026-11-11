import { checkName, isAvatarBody, isAvatarColor, isGraveStyle, itemById, ROOM_ID_RE, type CosmeticSlot } from "@tomb/protocol";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { CODE_RE, normalizeCode } from "./economy";
import { GRAVE_CHANNELS } from "./store/channels";
import { ageDays, parseYmd, suggestEpitaph, todayKst } from "./epitaph";
import { isAllowedImageUrl } from "./blob";
import { REPORT_REASONS } from "./reports";
import { HttpError } from "./http";
import { CAUSE_TAGS, INQUIRY_CATEGORIES, LIFESPAN_PRESETS, type InquiryCategory, type LifespanId } from "./types";

// 따로 메시지를 달지 않은 오류(타입 불일치 등)도 한국어로 나오게 한다
z.config(z.locales.ko());

/** 글자 수는 코드포인트 기준 (suggestEpitaph와 같은 기준) */
const within = (max: number) => (s: string) => [...s].length <= max;
const oneLine = (s: string) => s.replace(/\s+/g, " ");
const dedupe = <T>(a: T[]) => [...new Set(a)];

const requiredLine = (max: number, empty: string, tooLong: string) =>
  z.string().trim().overwrite(oneLine).min(1, empty).refine(within(max), tooLong);

/** 빈 문자열·null은 "입력 안 함"으로 본다 */
const optional = <T extends z.ZodType<string | string[]>>(schema: T) =>
  schema.nullish().transform((v) => (v && v.length ? v : undefined));

const ymd = z.string().refine((s) => !Number.isNaN(parseYmd(s)), "날짜는 YYYY-MM-DD 형식으로 적어 주세요.");

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const tagList = (item: z.ZodString, max: number, tooMany: string) =>
  z
    .array(item)
    .max(max, tooMany)
    .transform((a) => dedupe(a.filter(Boolean)));

/** 묘비 디자인 (GRAVE_STYLES). 유료 디자인의 디자인권 확인·소모는 라우트가 저장과 함께 한다 */
const graveStyle = z.string().refine((s) => isGraveStyle(s), "알 수 없는 묘비 디자인이에요.").optional();

/** 상주의 한마디 (선택, 한 줄 100자) */
const graveComment = optional(z.string().trim().overwrite(oneLine).refine(within(100), "한마디는 100자까지 적을 수 있어요."));
const avatarColor = z.string().refine(isAvatarColor, "고를 수 있는 색이 아니에요.");
const avatarBody = z.string().refine(isAvatarBody, "고를 수 있는 모양이 아니에요.");

/** 묘비를 세울 채널 (채널마다 묘지가 따로다) */
export const graveChannel = z.number("채널 번호가 올바르지 않아요.").int().min(1, `채널은 1~${GRAVE_CHANNELS} 중 하나예요.`).max(GRAVE_CHANNELS, `채널은 1~${GRAVE_CHANNELS} 중 하나예요.`);

/** 유저이름 규칙(@tomb/protocol checkName)을 그대로 쓰고, 정규화된 이름을 돌려준다 */
const userName = z.string().transform((s, ctx) => {
  const r = checkName(s);
  if (r.ok) return r.name;
  ctx.addIssue({ code: "custom", message: r.reason });
  return z.NEVER;
});

export const GraveInputSchema = z
  .object({
    name: requiredLine(40, "그만둔 것의 이름을 적어 주세요.", "이름은 40자까지 적을 수 있어요."),
    epitaph: requiredLine(30, "묘비명을 적어 주세요.", "묘비명은 30자까지 적을 수 있어요."),
    bornAt: ymd,
    diedAt: ymd,
    lastTask: optional(
      z.string().trim().overwrite(oneLine).refine(within(20), "마지막으로 하던 일은 20자까지 적을 수 있어요."),
    ),
    causes: z
      .array(z.enum(CAUSE_TAGS, "알 수 없는 사인이에요."))
      .min(1, "사인을 하나 이상 골라 주세요.")
      .transform(dedupe),
    causeDetail: optional(z.string().trim().refine(within(200), "사인 상세는 200자까지 적을 수 있어요.")),
    links: optional(
      tagList(z.string().trim().max(500, "링크가 너무 길어요."), 3, "링크는 3개까지 넣을 수 있어요.").refine(
        (a) => a.every(isHttpUrl),
        "링크는 http:// 또는 https:// 주소만 넣을 수 있어요.",
      ),
    ),
    stack: optional(
      tagList(
        z.string().trim().refine(within(20), "기술 스택 태그는 20자까지 적을 수 있어요."),
        5,
        "기술 스택은 5개까지 넣을 수 있어요.",
      ),
    ),
    imageUrl: optional(z.string().trim().refine((s) => !s || isAllowedImageUrl(s), "업로드한 이미지만 쓸 수 있어요.")),
    mourner: userName,
    style: graveStyle,
    comment: graveComment,
    /** 세울 채널. 수정(PATCH)에서는 무시한다 (묘비는 채널을 옮기지 않는다) */
    channel: graveChannel.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.diedAt < v.bornAt)
      ctx.addIssue({ code: "custom", path: ["diedAt"], message: "사망일은 탄생일보다 빠를 수 없어요." });
    if (v.diedAt > todayKst())
      ctx.addIssue({ code: "custom", path: ["diedAt"], message: "미래 날짜는 고를 수 없어요." });
  })
  // 향년은 클라이언트 값을 믿지 않고 서버가 계산한다
  .transform((v) => ({ ...v, ageDays: ageDays(v.bornAt, v.diedAt) }));

export type ParsedGraveInput = z.output<typeof GraveInputSchema>;

/** 간단 입력의 "얼마나 살았나요" → 날짜 (KST 오늘이 사망일, 향년 = 고른 날수) */
export function quickLifespan(lived: LifespanId, today = todayKst()): { bornAt: string; diedAt: string; ageDays: number } {
  const days = LIFESPAN_PRESETS.find((p) => p.id === lived)!.days;
  const bornAt = new Date(parseYmd(today) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { bornAt, diedAt: today, ageDays: days };
}

const LIFESPAN_IDS = LIFESPAN_PRESETS.map((p) => p.id) as [LifespanId, ...LifespanId[]];

/**
 * 간단 묘비 세우기 (QuickGraveInput) → 전체 입력과 같은 모양으로 바꾼다.
 * 묘비명이 비면 `향년 {N}일, 조용히 별세`, 사인을 안 고르면 기타.
 */
export const QuickGraveInputSchema = z
  .object({
    name: requiredLine(40, "그만둔 것의 이름을 적어 주세요.", "이름은 40자까지 적을 수 있어요."),
    lived: z.enum(LIFESPAN_IDS, "얼마나 살았는지 골라 주세요."),
    cause: z.enum(CAUSE_TAGS, "알 수 없는 사인이에요.").optional(),
    epitaph: optional(z.string().trim().overwrite(oneLine).refine(within(30), "묘비명은 30자까지 적을 수 있어요.")),
    mourner: userName,
    style: graveStyle,
    comment: graveComment,
    channel: graveChannel,
  })
  .transform(({ name, lived, cause, epitaph, mourner, style, comment, channel }): ParsedGraveInput => {
    const life = quickLifespan(lived);
    const none = { lastTask: undefined, causeDetail: undefined, links: undefined, stack: undefined, imageUrl: undefined };
    const epitaphOrDefault = epitaph ?? suggestEpitaph(life.ageDays);
    return { ...none, name, mourner, style, comment, channel, ...life, causes: [cause ?? "other"], epitaph: epitaphOrDefault };
  });

/** POST /api/graves: `lived`가 있으면 간단 입력, 아니면 전체 입력 */
export const createGraveSchema = (raw: unknown) =>
  raw && typeof raw === "object" && "lived" in raw ? QuickGraveInputSchema : GraveInputSchema;

export const JoinRequestSchema = z.object({
  channel: z.union([z.literal("auto"), z.number().int().min(1).max(99)], "채널 번호가 올바르지 않아요."),
  name: userName,
  color: avatarColor,
  /** 없으면 계정에 저장된 몸 모양 */
  body: avatarBody.optional(),
});

/** 신고 사유는 선택. 본문이 없거나 사유가 없으면 "other" */
export const ReportRequestSchema = z.object({
  reason: z.enum(REPORT_REASONS, "알 수 없는 신고 사유예요.").default("other"),
});

export const ADMIN_ACTIONS = ["hide", "unhide", "delete", "resetReports"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
const adminAction = z.enum(ADMIN_ACTIONS, "action은 hide, unhide, delete, resetReports 중 하나여야 해요.");

export const AdminActionSchema = z.object({ action: adminAction });

export const AdminBulkSchema = z.object({
  ids: z
    .array(z.string().refine((id) => isGraveId(id), "묘비 id 형식이 올바르지 않아요."))
    .min(1, "묘비를 하나 이상 골라 주세요.")
    .max(100, "한 번에 100개까지 처리할 수 있어요.")
    .transform(dedupe),
  action: adminAction,
});

/** 출석 때 입장 화면의 이름·색·몸 모양을 함께 보낸다 (계정에 값이 없을 때만 저장) */
export const AttendSchema = z.object({ name: userName.optional(), color: avatarColor.optional(), body: avatarBody.optional() });

/** 클라이언트 오류 보고. 너무 긴 값은 자른다 (거절하지 않는다) */
const clip = (max: number) => z.string().transform((s) => s.slice(0, max));
export const ErrorReportSchema = z.object({
  message: clip(500).refine((s) => s.trim().length > 0, "메시지가 비었어요."),
  stack: clip(4000).optional(),
  url: clip(500),
  kind: z.enum(["error", "unhandledrejection", "react", "api"], "알 수 없는 오류 종류예요."),
  ua: clip(300).optional(),
});

export const RoomJoinSchema = z.object({ room: z.string().max(60).regex(ROOM_ID_RE, "들어갈 수 없는 방이에요.") });

export const ActivitySeenSchema = z.object({ at: z.number().int().min(0) });
export const NameChangeSchema = z.object({ name: userName });

/** POST /api/session — fresh면 기존 쿠키를 버리고 새 계정으로 시작 */
export const SessionSchema = z.object({ fresh: z.boolean().optional() });

export const CodeLoginSchema = z.object({
  code: z
    .string()
    .max(40)
    .transform(normalizeCode)
    .refine((c) => CODE_RE.test(c), "코드는 XXXX-XXXX-XXXX 모양이에요."),
});

const shopItem = z.string().refine((id) => !!itemById(id), "없는 아이템이에요.");
export const ShopBuySchema = z.object({ itemId: shopItem });
export const ShopUseSchema = z.object({
  itemId: shopItem,
  graveId: z.string().refine((id) => isGraveId(id), "묘비 id 형식이 올바르지 않아요.").optional(),
});

/** 캐릭터 꾸미기 부위 (빠진 부위가 있으면 타입 오류가 난다) */
const COSMETIC_SLOTS: Record<CosmeticSlot, true> = { head: true, hand: true, aura: true, neck: true, back: true, pet: true, feet: true };
const cosmeticItem = z.string().refine((id) => itemById(id)?.kind === "cosmetic", "캐릭터 꾸미기 아이템이 아니에요.");
/** POST /api/me/wear: 벗어 둔 꾸미기 다시 입기 */
export const WearSchema = z.object({ itemId: cosmeticItem });
/** POST /api/me/unequip: 그 부위 벗기 */
export const UnequipSchema = z.object({
  slot: z.string().refine((s): s is CosmeticSlot => Object.hasOwn(COSMETIC_SLOTS, s), "알 수 없는 부위예요."),
});

/** 관리자 포인트 조정: 개인 코드 또는 계정 id 중 하나 + 정수 증감 */
export const AdminPointsSchema = z
  .object({
    code: z.string().max(40).transform(normalizeCode).optional(),
    accountId: z.string().regex(/^[A-Za-z0-9_-]{21}$/, "계정 id 형식이 올바르지 않아요.").optional(),
    delta: z.number().int("정수로 적어 주세요.").min(-9999).max(9999).refine((d) => d !== 0, "0이 아닌 값을 적어 주세요."),
  })
  .refine((v) => !!v.code !== !!v.accountId, "개인 코드와 계정 id 중 하나만 적어 주세요.")
  .refine((v) => !v.code || CODE_RE.test(v.code), "코드는 XXXX-XXXX-XXXX 모양이에요.");

// ── 공지사항 (관리자) ──
const noticeTitle = z.string().trim().overwrite(oneLine).min(1, "제목을 적어 주세요.").refine(within(60), "제목은 60자까지 적을 수 있어요.");
const noticeBody = z.string().trim().min(1, "본문을 적어 주세요.").refine(within(2000), "본문은 2000자까지 적을 수 있어요.");
export const NoticeInputSchema = z.object({ title: noticeTitle, body: noticeBody, pinned: z.boolean().optional() });
/** 수정: 바꿀 것만 (고정 토글만 보내도 된다) */
export const NoticePatchSchema = z
  .object({ title: noticeTitle.optional(), body: noticeBody.optional(), pinned: z.boolean().optional() })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.pinned !== undefined, "바꿀 내용을 보내 주세요.");

// ── 문의 ──
const INQUIRY_IDS = INQUIRY_CATEGORIES.map((c) => c.id) as [InquiryCategory, ...InquiryCategory[]];
export const InquirySchema = z.object({
  category: z.enum(INQUIRY_IDS, "문의 종류를 골라 주세요."),
  message: z
    .string()
    .trim()
    .refine((s) => [...s].length >= 10, "문의 내용을 10자 이상 적어 주세요.")
    .refine(within(1000), "문의 내용은 1000자까지 적을 수 있어요."),
  contact: optional(z.string().trim().overwrite(oneLine).refine(within(100), "연락처는 100자까지 적을 수 있어요.")),
  /** 문의를 보낸 채널 (계약에는 없지만 UI가 보내면 운영자가 상황을 보기 쉽다) */
  channel: graveChannel.optional(),
});

export const AdminLoginSchema = z.object({ key: z.string().min(1, "관리자 키를 입력해 주세요.").max(500) });

/** @vercel/blob/client uploadPresigned()가 보내는 presigned URL 요청. 업로드 완료 콜백은 쓰지 않으므로 그 이벤트는 받지 않는다 */
export const BlobUploadRequestSchema = z.object({
  type: z.literal("blob.generate-presigned-url", "업로드 요청 형식이 올바르지 않아요."),
  payload: z.looseObject({ pathname: z.string().min(1).max(200) }),
});

const GRAVE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const isGraveId = (id: string) => GRAVE_ID_RE.test(id);

/** JSON 본문. 빈 본문은 `{}`로 본다. 형식이 깨졌으면 400 INVALID_INPUT */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    const text = await req.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "INVALID_INPUT", "요청 형식이 올바르지 않아요.");
  }
}

/** 검증 실패면 400 INVALID_INPUT (첫 번째 문제의 메시지) */
export function parseWith<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "INVALID_INPUT", r.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  return r.data;
}

export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  return parseWith(schema, await readJson(req));
}
