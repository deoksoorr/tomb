import { z } from "zod";
import { furnitureById, PLOT_TIERS, SORTS, VILLAGE_MAX_LOTS } from "./catalog";
import { checkGuestText, checkHouseName, checkIntro, type TextCheck } from "./text";

// 하우징 요청 본문 검증 (zod). 배치의 칸·겹침·개수 검사는 lib/housing/layout.ts validateLayout이 한다.

z.config(z.locales.ko());

const text = (check: (raw: unknown) => TextCheck) =>
  z.unknown().transform((v, ctx) => {
    const r = check(v);
    if (r.ok) return r.text;
    ctx.addIssue({ code: "custom", message: r.reason });
    return z.NEVER;
  });

const tierId = z.enum(PLOT_TIERS.map((t) => t.id) as ["small", "wide", "manor"], "알 수 없는 터 크기예요.");
const itemId = z
  .string()
  .max(40)
  .refine((s) => !!furnitureById(s), "알 수 없는 물건이에요.");

export const ProfileSchema = z.object({ name: text(checkHouseName), intro: text(checkIntro) });
/** 분양: lot을 주면 그 번지, 없으면 자동 배정 */
export const CreateHouseSchema = ProfileSchema.extend({
  lot: z.number("번지가 올바르지 않아요.").int().min(1).max(VILLAGE_MAX_LOTS, "번지가 올바르지 않아요.").nullish(),
});
export const ExteriorSchema = z.object({ exterior: z.record(z.string(), z.string().max(40)) });
export const UpgradeSchema = z.object({ to: tierId });
export const ItemSchema = z.object({ itemId });

const placed = z.object({
  u: z.string().max(8),
  i: z.string().max(40),
  x: z.number().int().min(0).max(63),
  y: z.number().int().min(0).max(63),
  r: z.number().int().min(0).max(3),
});

export const LayoutSchema = z.object({
  tier: tierId,
  layout: z.object({
    items: z.array(placed).max(200, "물건이 너무 많아요."),
    floor: z.string().max(40),
    wall: z.string().max(40),
  }),
});

export const GuestSchema = z.object({ text: text(checkGuestText) });
export const SortSchema = z.enum(SORTS).catch("score");

export const AdminHouseSchema = z.object({ action: z.enum(["hide", "unhide", "delete"], "알 수 없는 작업이에요.") });
export const AdminGuestSchema = z.object({ action: z.enum(["hide", "unhide", "delete"], "알 수 없는 작업이에요.") });

const ENTRY_RE = /^[A-Za-z0-9_-]{1,20}$/;
export const isEntryId = (s: string) => ENTRY_RE.test(s);
