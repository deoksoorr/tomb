import { z } from "zod";
import { FISHING_SPOTS } from "@tomb/protocol";
import { DEX_TIERS, GATHER_NODES, LIFE_CATS, NPCS, SPECIES, type DexTier } from "./catalog";

// 낚시·채집·판매·도감 API 입력 검증 (zod)

const ticket = z.string().min(10).max(1000);
const spotId = z.enum(FISHING_SPOTS.map((s) => s.id) as [string, ...string[]], "여기서는 낚시를 할 수 없어요.");
const nodeId = z.enum(GATHER_NODES.map((n) => n.id) as [string, ...string[]], "여기서는 캘 게 없어요.");
const speciesId = z.enum(SPECIES.map((s) => s.id) as [string, ...string[]], "모르는 물건이에요.");

export const CastSchema = z.object({ spot: spotId });
export const ReelSchema = z.object({ ticket, ok: z.boolean() });
export const GatherStartSchema = z.object({ node: nodeId });
const count = z.number().int().min(0).max(10_000);
/** 곤충 수풀 미니게임 결과 (옛 사냥터 "벌레 잡기"와 같은 모양) */
const bugsResult = z.object({
  game: z.literal("bugs"),
  durationMs: z.number().int().min(0).max(10 * 60_000),
  caught: count,
  golden: count,
  wrong: count,
  decoy: count,
  maxCombo: count,
  score: z.number().int().min(0).max(1_000_000),
});
export const GatherFinishSchema = z.object({ ticket, result: bugsResult.optional() });
export const SellSchema = z.object({
  npc: z.enum(NPCS.map((n) => n.id) as ["fishmonger", "collector"]),
  items: z.partialRecord(speciesId, z.number().int().min(1).max(999)).refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 80, "팔 것을 골라 주세요."),
});
export const DexClaimSchema = z.object({
  cat: z.enum(LIFE_CATS),
  tier: z.union(DEX_TIERS.map((t) => z.literal(t)) as unknown as [z.ZodLiteral<DexTier>, z.ZodLiteral<DexTier>, ...z.ZodLiteral<DexTier>[]]),
});
