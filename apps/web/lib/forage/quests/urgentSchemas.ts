import { z } from "zod";
import { SPECIES } from "../catalog";
import { URGENT_KINDS } from "./urgent";

// 11/15: 긴급 의뢰 API 입력 검증 (zod)

const id = z.string().regex(/^(\d{8}-\d|t[0-9a-z]{1,12})$/, "그런 긴급 의뢰는 없어요.");
const speciesId = z.enum(SPECIES.map((s) => s.id) as [string, ...string[]], "모르는 물건이에요.");

/** 납품 `{ id, items: { 종 id: 개수 } }` */
export const UrgentDeliverSchema = z.object({
  id,
  items: z.partialRecord(speciesId, z.number().int().min(1).max(99)).refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 60, "낼 것을 골라 주세요."),
});
export const UrgentClaimSchema = z.object({ id });
/** 테스트 서버 운영자 시험: 시작(종류 고르기) · 막대 더하기(목표의 %) · 지금 끝내기 · 지우기 */
export const UrgentTestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), kind: z.enum(URGENT_KINDS).optional() }),
  z.object({ action: z.literal("add"), pct: z.number().int().min(1).max(200) }),
  z.object({ action: z.literal("end") }),
  z.object({ action: z.literal("clear") }),
]);
