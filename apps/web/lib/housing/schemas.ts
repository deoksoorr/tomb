import { z } from "zod";
import { CARAVAN_AWNING_COUNT, CARAVAN_COLOR_COUNT, CARAVAN_MODELS } from "@tomb/protocol";
import { CAMP_LOT_COUNT, COTTAGE_STYLES, furnitureById, HOUSING_CHANNELS, PLOT_TIERS, SORTS, VILLAGE_MAX_LOTS, type HouseZone } from "./catalog";
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

/** 11/16 어느 집인지 (없으면 마을 집 — 예전 화면 호환). 11/26 camp = 캠핑장 집 */
/** 11/26 캠핑장 집 종류 */
const campKind = z.enum(["caravan", "pension", "rural"], "알 수 없는 집 종류예요.");
export const zoneField = z.enum(["village", "sea", "camp"], "알 수 없는 집이에요.").optional();
export const cottageStyle = z.enum(COTTAGE_STYLES.map((c) => c.id) as ["wood", "blue", "keeper"], "알 수 없는 오두막 모양이에요.");
/** 11/26 카라반 디자인 { model, color 0..3, awning 0..3 } (값과 상관없다 — 분양 때 고르고 주인은 무료로 바꾼다) */
const designIndex = (n: number, what: string) => z.number(`${what}을 다시 골라 주세요.`).int(`${what}을 다시 골라 주세요.`).min(0, `${what}을 다시 골라 주세요.`).max(n - 1, `${what}을 다시 골라 주세요.`);
export const caravanDesign = z.object({
  model: z.enum(CARAVAN_MODELS as unknown as ["airstream", "teardrop", "bus"], "알 수 없는 카라반 모델이에요."),
  color: designIndex(CARAVAN_COLOR_COUNT, "몸통 색"),
  awning: designIndex(CARAVAN_AWNING_COUNT, "차양 색"),
});
/** `?zone=sea`·`?zone=camp` (없거나 다른 값이면 마을 집) */
export const zoneOfQuery = (raw: string | null): HouseZone => (raw === "sea" || raw === "camp" ? raw : "village");

export const ProfileSchema = z.object({ name: text(checkHouseName), intro: text(checkIntro), zone: zoneField });
/** 분양: ch 채널에서 lot을 주면 그 번지, 없으면 자동 배정. tier는 처음 살 터 크기 (없으면 작은 터: 예전 화면 호환) */
export const CreateHouseSchema = ProfileSchema.extend({
  ch: housingChannel,
  tier: tierId.optional(),
  lot: z.number("번지가 올바르지 않아요.").int().min(1).max(VILLAGE_MAX_LOTS, "번지가 올바르지 않아요.").nullish(),
  /** 11/16 오두막 겉모습 (zone sea) */
  style: cottageStyle.optional(),
  /** 11/26 캠핑장: 분양 창을 연 NPC의 집 종류 (주면 터 종류와 같아야 한다 — 언젠가 씨 카라반·소슬댁 펜션·순이 할머니 촌캉스) */
  kind: campKind.optional(),
  /** 11/26 카라반 디자인 (zone camp 카라반 — 없으면 그 자리 기본 모습) */
  design: caravanDesign.optional(),
});
export const StyleSchema = z.object({ style: cottageStyle });
/** 11/26 PUT /api/housing/me/style `{ zone: "camp", design }` = 내 카라반 디자인 바꾸기 */
export const CampDesignSchema = z.object({ zone: z.literal("camp", "알 수 없는 집이에요."), design: caravanDesign });

/** 11/26 캠핑장 집 분양 `{ ch, lot, zone: "camp", name?, intro? }` (종류는 터로 정해진다. 이름을 비우면 터 이름) */
export const CampBuySchema = z.object({
  ch: housingChannel,
  zone: z.literal("camp", "알 수 없는 집이에요."),
  lot: z.number("터 번호가 올바르지 않아요.").int("터 번호가 올바르지 않아요.").min(1, "터 번호가 올바르지 않아요.").max(CAMP_LOT_COUNT, "터 번호가 올바르지 않아요."),
  name: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), text(checkHouseName).optional()),
  intro: z.preprocess((v) => (v === undefined || v === null ? "" : v), text(checkIntro)),
  /** 분양 창을 연 NPC의 집 종류 (주면 터 종류와 같아야 한다) */
  kind: campKind.optional(),
  /** 11/26 카라반 디자인 (카라반 터만 — 없으면 그 자리 기본 모습, 펜션·촌캉스는 무시) */
  design: caravanDesign.optional(),
});
/** 11/26 앞마당 다음 단계 `{ ch, zone?: "camp" }` */
export const YardSchema = z.object({ ch: housingChannel, zone: z.literal("camp", "알 수 없는 집이에요.").optional() });
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
    // 11/24 벽 창문 모양 (없으면 저장된 값을 그대로 둔다 — 예전 화면 호환)
    window: z.string().max(40).optional(),
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
