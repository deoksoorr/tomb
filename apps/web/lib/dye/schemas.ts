import { AVATAR_BODIES, DYE_PARTS, isFixedDyeId, itemById, normalizeDyeColor, permanentPrice } from "@tomb/protocol";
import { z } from "zod";
import { DYE_BOARD_H, DYE_BOARD_W } from "./palette";

// 46·25·30번 요청 검증. 사용자가 색 값을 직접 보내는 경로는 없다 (무작위 = 판 좌표, 고정 = 아이템 id).

const part = z.enum(DYE_PARTS);
const randomTicket = z.string().refine((id) => itemById(id)?.dye?.mode === "random", "무작위 염색권이 아니에요.");
const fixedTicket = z.string().refine((id) => itemById(id)?.dye?.mode === "fixed" || isFixedDyeId(id), "고정 색 염색권이 아니에요.");

export const DyeStartSchema = z.object({ itemId: randomTicket, part });
/** 판 위 좌표 (칸 단위 실수). 판 밖이면 거절 */
export const DyeFinishSchema = z.object({
  seed: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
  x: z.number().finite().min(0).lt(DYE_BOARD_W),
  y: z.number().finite().min(0).lt(DYE_BOARD_H),
});
export const DyeFixedSchema = z.object({ itemId: fixedTicket, part });
export const DyeResetSchema = z.object({ part });
export const ReshapeSchema = z.object({ body: z.enum(AVATAR_BODIES.map((b) => b.id) as [string, ...string[]]) });
/** POST /api/shop/permanent { itemId } — 영구로 살 수 있는 꾸미기만 */
export const PermanentBuySchema = z.object({ itemId: z.string().refine((id) => permanentPrice(id) !== null, "영구로 살 수 없는 꾸미기예요.") });

/** 관리자 고정 색 염색권 발급. target = "all"(포인트를 가진 적 있는 모든 계정) 또는 계정 id */
export const AdminDyeIssueSchema = z.object({
  name: z.string().trim().min(1, "이름을 적어 주세요.").max(24, "이름은 24자까지예요."),
  color: z.string().transform((c, ctx) => {
    const v = normalizeDyeColor(c);
    if (!v) {
      ctx.addIssue({ code: "custom", message: "색은 #RRGGBB 모양이에요." });
      return z.NEVER;
    }
    return v;
  }),
  parts: z.array(part).max(3).optional(),
  count: z.number().int().min(1).max(10),
  target: z.union([z.literal("all"), z.string().regex(/^[A-Za-z0-9_-]{21}$/, "계정 id 형식이 올바르지 않아요.")]),
  /** 선물함 쪽지 (없으면 기본 문구) */
  note: z.string().trim().max(200).optional(),
});
