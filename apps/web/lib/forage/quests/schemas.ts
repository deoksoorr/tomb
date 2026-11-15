import { z } from "zod";
import { SPECIES } from "../catalog";
import { QUEST_REWARDS } from "./catalog";

// 11/15: 수집 의뢰 API 입력 검증 (zod)

const key = z.string().regex(/^(d[0-9]|w)$/, "그런 의뢰는 없어요.");
const speciesId = z.enum(SPECIES.map((s) => s.id) as [string, ...string[]], "모르는 물건이에요.");

/** 납품 `{ key, items: { id: 개수 } }` — 무엇을 낼지는 화면에서 고른다 (기본은 값이 싼 것부터) */
export const QuestDeliverSchema = z.object({
  key,
  items: z.partialRecord(speciesId, z.number().int().min(1).max(99)).refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 30, "낼 것을 골라 주세요."),
});
export const QuestRerollSchema = z.object({ key });
export const QuestExchangeSchema = z.object({ id: z.enum(QUEST_REWARDS.map((r) => r.id) as [string, ...string[]], "그런 물건은 없어요.") });
