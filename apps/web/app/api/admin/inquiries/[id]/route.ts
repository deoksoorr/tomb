import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getInquiries, INQUIRY_MEMO_MAX, type InquiryRow } from "@/lib/store/inquiries";
import { readBody } from "@/lib/validate";

const PatchSchema = z
  .object({
    status: z.enum(["new", "done"]).optional(),
    memo: z
      .string()
      .trim()
      .refine((s) => [...s].length <= INQUIRY_MEMO_MAX, `메모는 ${INQUIRY_MEMO_MAX}자까지 적을 수 있어요.`)
      .optional(),
  })
  .refine((v) => v.status !== undefined || v.memo !== undefined, "바꿀 내용을 보내 주세요.");

/** 처리 여부·관리자 메모 바꾸기 `{ status?, memo? }` (빈 메모는 지운다) */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const patch = await readBody(req, PatchSchema);
  const row = await getInquiries().update(id, patch);
  if (!row) throw new HttpError(404, "NOT_FOUND", "그 문의를 찾을 수 없어요.");
  return json<{ inquiry: InquiryRow }>({ inquiry: row });
});
