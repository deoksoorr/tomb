import { z } from "zod";
import { BOAT_FISHING_SPOTS, FISHING_SPOTS } from "@tomb/protocol";
import { DEX_CATS, GATHER_NODES, NPCS, SPECIES, type DexCat } from "./catalog";

// 낚시·채집·판매·도감 API 입력 검증 (zod)

const ticket = z.string().min(10).max(1000);
// 정해진 낚시 자리 + 배 위 가상 자리 (boat:river·boat:lake)
const spotId = z.enum([...FISHING_SPOTS.map((s) => s.id), ...Object.keys(BOAT_FISHING_SPOTS)] as [string, ...string[]], "여기서는 낚시를 할 수 없어요.");
const nodeId = z.enum(GATHER_NODES.map((n) => n.id) as [string, ...string[]], "여기서는 캘 게 없어요.");
const speciesId = z.enum(SPECIES.map((s) => s.id) as [string, ...string[]], "모르는 물건이에요.");

export const CastSchema = z.object({ spot: spotId });
export const ReelSchema = z.object({ ticket, ok: z.boolean() });
/** 자동 낚시: 켜기(자리·채널) / 정산 / 끄기 */
export const AutoFishSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), spot: spotId, ch: z.number().int().min(0).max(999).nullish() }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("stop") }),
]);
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
/** [도감 보상 받기]: 그 칸에 쌓인 받을 보상 */
export const DexPaySchema = z.object({ cat: z.enum(DEX_CATS as [DexCat, ...DexCat[]]) });
