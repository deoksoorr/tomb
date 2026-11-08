import { checkName, isAvatarColor } from "@tomb/protocol";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ageDays, parseYmd, todayKst } from "./epitaph";
import { isAllowedImageUrl } from "./blob";
import { HttpError } from "./http";
import { CAUSE_TAGS } from "./types";

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

/** 유저이름 규칙(@tomb/protocol checkName)을 그대로 쓰고, 정규화된 이름을 돌려준다 */
const userName = z.string().transform((s, ctx) => {
  const r = checkName(s);
  if (r.ok) return r.name;
  ctx.addIssue({ code: "custom", message: r.reason });
  return z.NEVER;
});

export const GraveInputSchema = z
  .object({
    name: requiredLine(40, "프로젝트 이름을 적어 주세요.", "프로젝트 이름은 40자까지 적을 수 있어요."),
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

export const JoinRequestSchema = z.object({
  channel: z.union([z.literal("auto"), z.number().int().min(1).max(99)], "채널 번호가 올바르지 않아요."),
  name: userName,
  color: z.string().refine(isAvatarColor, "고를 수 있는 색이 아니에요."),
});

export const AdminActionSchema = z.object({
  action: z.enum(["hide", "unhide", "delete"], "action은 hide, unhide, delete 중 하나여야 해요."),
});

/** @vercel/blob/client upload()가 보내는 토큰 요청. 업로드 완료 콜백은 쓰지 않으므로 그 이벤트는 받지 않는다 */
export const BlobTokenRequestSchema = z.object({
  type: z.literal("blob.generate-client-token", "업로드 요청 형식이 올바르지 않아요."),
  payload: z.looseObject({ pathname: z.string().min(1).max(200) }),
});

const GRAVE_ID_RE =/^[A-Za-z0-9_-]{1,40}$/;
export const isGraveId = (id: string) => GRAVE_ID_RE.test(id);

/** JSON 본문을 읽고 검증한다. 실패하면 400 INVALID_INPUT (첫 번째 문제의 메시지) */
export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_INPUT", "요청 형식이 올바르지 않아요.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HttpError(400, "INVALID_INPUT", r.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
  return r.data;
}
