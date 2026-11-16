import { z } from "zod";
import { COTTAGE_STYLES, furnitureById, HOUSING_CHANNELS, PLOT_TIERS, SORTS, VILLAGE_MAX_LOTS } from "./catalog";
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

/** 지금 있는 채널 (채널마다 주거 구역이 따로다. 분양·외관·배치·넓히기는 이 채널의 필지만 다룬다) */
export const housingChannel = z
  .number("채널 번호가 올바르지 않아요.")
  .int("채널 번호가 올바르지 않아요.")
  .min(1, `채널은 1~${HOUSING_CHANNELS} 중 하나예요.`)
  .max(HOUSING_CHANNELS, `채널은 1~${HOUSING_CHANNELS} 중 하나예요.`);

/** 마을 조회 `?ch=` (없으면 1채널: 채널이 생기기 전 화면 호환) */
export const VillageQuerySchema = z.coerce.number("채널 번호가 올바르지 않아요.").pipe(housingChannel);

/** 11/16 어느 집인지 (없으면 마을 집 — 예전 화면 호환) */
export const zoneField = z.enum(["village", "sea"], "알 수 없는 집이에요.").optional();
export const cottageStyle = z.enum(COTTAGE_STYLES.map((c) => c.id) as ["wood", "blue", "keeper"], "알 수 없는 오두막 모양이에요.");
/** `?zone=sea` (없거나 다른 값이면 마을 집) */
export const zoneOfQuery = (raw: string | null): "village" | "sea" => (raw === "sea" ? "sea" : "village");

export const ProfileSchema = z.object({ name: text(checkHouseName), intro: text(checkIntro), zone: zoneField });
/** 분양: ch 채널에서 lot을 주면 그 번지, 없으면 자동 배정. tier는 처음 살 터 크기 (없으면 작은 터: 예전 화면 호환) */
export const CreateHouseSchema = ProfileSchema.extend({
  ch: housingChannel,
  tier: tierId.optional(),
  lot: z.number("번지가 올바르지 않아요.").int().min(1).max(VILLAGE_MAX_LOTS, "번지가 올바르지 않아요.").nullish(),
  /** 11/16 오두막 겉모습 (zone sea) */
  style: cottageStyle.optional(),
});
export const StyleSchema = z.object({ style: cottageStyle });
export const ExteriorSchema = z.object({ ch: housingChannel, exterior: z.record(z.string(), z.string().max(40)) });
export const UpgradeSchema = z.object({ ch: housingChannel, to: tierId, zone: zoneField });
export const ItemSchema = z.object({ itemId, zone: zoneField });

const placed = z.object({
  u: z.string().max(8),
  i: z.string().max(40),
  x: z.number().int().min(0).max(63),
  y: z.number().int().min(0).max(63),
  // 0~3 돌리기·뒤집기, 4~7 4방향 가구의 방향 (layout.ts SPIN_R0)
  r: z.number().int().min(0).max(7),
});

export const LayoutSchema = z.object({
  ch: housingChannel,
  zone: zoneField,
  tier: tierId,
  layout: z.object({
    items: z.array(placed).max(200, "물건이 너무 많아요."),
    floor: z.string().max(40),
    wall: z.string().max(40),
  }),
});

export const GuestSchema = z.object({ text: text(checkGuestText) });
export const SortSchema = z.enum(SORTS).catch("score");

// 11/15 move: 같은 채널 안에서 번지 옮기기 (lot 필요)
export const AdminHouseSchema = z.object({
  action: z.enum(["hide", "unhide", "delete", "move"], "알 수 없는 작업이에요."),
  lot: z.number("번지가 올바르지 않아요.").int().min(1).max(VILLAGE_MAX_LOTS, "번지가 올바르지 않아요.").optional(),
});
export const AdminGuestSchema = z.object({ action: z.enum(["hide", "unhide", "delete"], "알 수 없는 작업이에요.") });

const ENTRY_RE = /^[A-Za-z0-9_-]{1,20}$/;
export const isEntryId = (s: string) => ENTRY_RE.test(s);
