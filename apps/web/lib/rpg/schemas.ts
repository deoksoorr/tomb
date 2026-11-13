import { z } from "zod";
import { DIFFICULTIES, GAME_KINDS, GEAR_SLOTS, HOTBAR_SIZE, MONSTER_IDS, POTION_MAX_STACK, SKILLS, STAT_KEYS, ZONE_IDS, type SkillId } from "./catalog";

// 사냥터 API 입력 검증 (zod). 메시지는 lib/validate.ts가 켜 둔 한국어 로케일을 따른다.

const count = z.number().int().min(0).max(10_000);
const skillId = z.enum(SKILLS.map((s) => s.id) as [SkillId, ...SkillId[]]);
const itemId = z.string().regex(/^[a-z]_[a-z_]{1,30}$/, "아이템 id 형식이 맞지 않아요.");

export const RunStartSchema = z.object({
  game: z.enum(GAME_KINDS),
  difficulty: z.enum(DIFFICULTIES),
  /** 40번 테마 사냥터 (사냥만, 없으면 그 난이도의 기본 사냥터) */
  zone: z.enum(ZONE_IDS).optional(),
});

const duration = z.number().int().min(0).max(30 * 60_000);

export const RunResultSchema = z.discriminatedUnion("game", [
  z.object({
    game: z.literal("hunt"),
    durationMs: duration,
    kills: z.partialRecord(z.enum(MONSTER_IDS as [string, ...string[]]), count),
    wavesCleared: z.number().int().min(0).max(20),
    died: z.boolean(),
    potionsUsed: z.record(itemId, count).default({}),
  }),
  z.object({ game: z.literal("bugs"), durationMs: duration, caught: count, golden: count, wrong: count, decoy: count, maxCombo: count, score: z.number().int().min(0).max(1_000_000) }),
  z.object({ game: z.literal("stars"), durationMs: duration, perfect: count, good: count, miss: count, maxCombo: count, score: z.number().int().min(0).max(1_000_000) }),
]);

export const RunFinishSchema = z.object({
  ticket: z.string().min(10).max(2000),
  result: RunResultSchema,
});

export const CharacterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("alloc"), stats: z.partialRecord(z.enum(STAT_KEYS), z.number().int().min(0).max(99)) }),
  z.object({ type: z.literal("learn"), skill: skillId }),
  z.object({ type: z.literal("hotbar"), slots: z.array(skillId.nullable()).length(HOTBAR_SIZE) }),
  z.object({ type: z.literal("equip"), slot: z.enum(GEAR_SLOTS), itemId: itemId.nullable() }),
  // 스킬 초기화: cost = 화면에 보인 비용 (서버 비용과 다르면 거절, 돈을 받지 않는다)
  z.object({ type: z.literal("respec"), cost: z.number().int().min(0).max(10_000) }),
  // 스킬 트리 바뀜 안내를 봤다
  z.object({ type: z.literal("ackTree") }),
]);

export const ShopActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("buy"), itemId, qty: z.number().int().min(1).max(20).default(1) }),
  // count: 한 번에 여러 개 되팔기 (없으면 1개, 예전 요청 그대로)
  z.object({ type: z.literal("sell"), itemId, count: z.number().int().min(1).max(POTION_MAX_STACK).default(1) }),
]);
