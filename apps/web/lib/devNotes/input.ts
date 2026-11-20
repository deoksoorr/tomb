import { z } from "zod";
import { isDevNoteImageUrl } from "@/lib/blob";
import type { NoticeBlock, NoticeDoc } from "@/lib/types";
import { charCount, DEV_NOTE_LIMITS as L, oneLineText, tidyText } from "./limits";

// 개발자 노트 편집기 입력 검증 (관리자 API 전용). 글은 글자 그대로 저장하고 사이트도 글자 그대로 그린다 (HTML·마크다운 해석 없음).

const within = (max: number) => (s: string) => charCount(s) <= max;
const line = (max: number, name: string) => z.string().overwrite(oneLineText).refine(within(max), `${name}은 ${max}자까지 적을 수 있어요.`);
const text = (max: number, name: string) => z.string().overwrite(tidyText).refine(within(max), `${name}은 ${max}자까지 적을 수 있어요.`);
const image = z.string().trim().refine(isDevNoteImageUrl, "이미지는 관리자 화면에서 올린 것만 쓸 수 있어요.");

const block = z.discriminatedUnion(
  "t",
  [
    z.object({ t: z.literal("h"), text: line(L.heading, "소제목").refine((s) => s.length > 0, "빈 소제목이 있어요.") }),
    z.object({ t: z.literal("p"), text: text(L.text, "글 블록").refine((s) => s.length > 0, "빈 글 블록이 있어요.") }),
    z.object({ t: z.literal("img"), src: image }),
  ],
  "블록 형식이 올바르지 않아요.",
);

export const DevNoteInputSchema = z
  .object({
    title: line(L.title, "제목").refine((s) => s.length > 0, "제목을 적어 주세요."),
    summary: line(L.summary, "한 줄 요약").optional(),
    hero: image.nullish(),
    intro: text(L.intro, "첫 문단").refine((s) => s.length > 0, "첫 문단을 적어 주세요."),
    callout: text(L.callout, "「먼저 알려 드릴 것」").optional(),
    blocks: z.array(block).max(L.blocks, `블록은 ${L.blocks}개까지 넣을 수 있어요.`),
    outro: text(L.outro, "맺음말").optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => v.blocks.filter((b) => b.t === "img").length <= L.images, `이미지는 ${L.images}장까지 넣을 수 있어요.`)
  .refine((v) => devNoteChars(v) <= L.total, `글이 너무 길어요. 모두 합쳐 ${L.total}자까지 적을 수 있어요.`);

export type DevNoteInput = z.output<typeof DevNoteInputSchema>;

/** 첫 문단·먼저 알려 드릴 것·소제목·글·맺음말 글자 수 합계 */
export function devNoteChars(v: { intro: string; callout?: string; blocks: readonly NoticeBlock[]; outro?: string }): number {
  let n = charCount(v.intro) + charCount(v.callout ?? "") + charCount(v.outro ?? "");
  for (const b of v.blocks) if (b.t !== "img") n += charCount(b.text);
  return n;
}

/** 저장할 본문. 편집기로 쓴 글은 꼭지가 없어도 늘 본문을 둔다 (rich 글로 그려지고, 같은 id의 정적 글보다 앞선다) */
export function toNoticeDoc(v: DevNoteInput, backup?: NoticeDoc["backup"]): NoticeDoc {
  return { blocks: v.blocks, outro: v.outro ?? "", ...(v.callout ? { callout: v.callout } : {}), ...(backup ? { backup } : {}) };
}

/** 글 하나가 쓰는 이미지 주소 전부 (대표 이미지 포함) */
export function devNoteImages(hero: string | null | undefined, doc: NoticeDoc | null | undefined): string[] {
  const out = hero ? [hero] : [];
  for (const b of doc?.blocks ?? []) if (b.t === "img") out.push(b.src);
  return out;
}
