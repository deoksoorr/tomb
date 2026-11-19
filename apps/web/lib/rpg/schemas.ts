import { z } from "zod";
import { T_NODE_IDS } from "./transcendTree";
import { CARD_IDS, MAX_PICKS } from "./cards";
import { STAT_MAX } from "./formulas";
import { DIFFICULTIES, GAME_KINDS, GEAR_SLOTS, HOTBAR_SIZE, MONSTER_IDS, POTION_MAX_STACK, SKILLS, STAT_KEYS, ZONE_IDS, type SkillId } from "./catalog";

// 사냥터 API 입력 검증 (zod). 메시지는 lib/validate.ts가 켜 둔 한국어 로케일을 따른다.

const count = z.number().int().min(0).max(10_000);
/** 11/15 사냥 처치 수 (몬스터 하나당): 야근 빌딩 긴 등반은 한 종류가 만 마리를 넘을 수 있다 — 형식에서 거절하면 판이 통째로 날아가므로 넉넉히 (상한은 서버 검증이 본다) */
const killCount = z.number().int().min(0).max(100_000);
const skillId = z.enum(SKILLS.map((s) => s.id) as [SkillId, ...SkillId[]]);
const itemId = z.string().regex(/^[a-z]_[a-z_]{1,30}$/, "아이템 id 형식이 맞지 않아요.");

export const RunStartSchema = z.object({
  game: z.enum(GAME_KINDS),
  difficulty: z.enum(DIFFICULTIES),
  /** 40번 테마 사냥터 (사냥만, 없으면 그 난이도의 기본 사냥터) */
  zone: z.enum(ZONE_IDS).optional(),
  /** 별자리 잇기: 화면이 쓰는 계획 판 번호 (없으면 1판 화면) */
  planVer: z.number().int().min(1).max(99).optional(),
  /** 11/15 야근 빌딩 시작 층 (지옥 사냥만, 1·11·21 …). 연 체크포인트인지는 서버가 본다 */
  tower: z.number().int().min(1).max(10_000).optional(),
});

// 11/15 야근 빌딩 한 판은 티켓 수명(lib/rpg/tower TOWER_TICKET_SEC, 12시간)까지 받는다 — 실제 시간은 서버가 잰 경과로 자른다 (형식에서 거절하면 판이 통째로 날아간다)
const duration = z.number().int().min(0).max(12 * 3_600_000);
const starGroupList = z.array(z.number().int().min(0).max(200)).max(60).optional();

export const RunResultSchema = z.discriminatedUnion("game", [
  z.object({
    game: z.literal("hunt"),
    durationMs: duration,
    kills: z.partialRecord(z.enum(MONSTER_IDS as [string, ...string[]]), killCount),
    wavesCleared: z.number().int().min(0).max(20),
    died: z.boolean(),
    potionsUsed: z.record(itemId, count).default({}),
    // 11/15 야근 빌딩: 깬 층 수 · 마지막 층을 깬 시각 · 그만두고 나옴
    floors: z.number().int().min(0).max(1_000).optional(),
    floorMs: duration.optional(),
    quit: z.boolean().optional(),
    // 11/15 능력 카드 고른 기록 (lib/rpg/cards replayPicks가 내용을 본다).
    // f = 판 레벨이 오른 층 (레벨 업만 — 제안 등급 확률이 층으로 정해진다). 빠뜨리면 zod가 지워서 서버가 1층 확률로 다시 굴려
    // 11층 위에서 고른 카드를 "제안에 없던 카드"로 거절했다 (11/15 운영 422)
    cards: z
      .array(z.object({ k: z.enum(["l", "s", "b"]), i: z.number().int().min(0).max(100_000), r: z.number().int().min(0).max(1_000), c: z.enum(CARD_IDS), f: z.number().int().min(0).max(100_000).optional() }))
      .max(MAX_PICKS)
      .optional(),
    // 11/18 판 기록 (관리자 「확인 필요」의 근거 — 판정에는 쓰지 않는다. 옛 화면은 보내지 않는다):
    // ft = 층마다 깬 시각(판 시작부터 ms), dmg = 넣은 피해 합, sk = 스킬마다 쓴 횟수
    log: z
      .object({
        ft: z.array(duration).max(400).optional(),
        dmg: z.number().min(0).max(1e15).optional(),
        sk: z.record(z.string().max(32), z.number().int().min(0).max(100_000)).optional(),
      })
      .optional()
      .transform((v) => (v?.sk && Object.keys(v.sk).length > 40 ? { ...v, sk: undefined } : v)),
  }),
  z.object({ game: z.literal("bugs"), durationMs: duration, caught: count, golden: count, wrong: count, decoy: count, maxCombo: count, score: z.number().int().min(0).max(1_000_000) }),
  z.object({
    game: z.literal("stars"),
    durationMs: duration,
    perfect: count,
    good: count,
    miss: count,
    maxCombo: count,
    score: z.number().int().min(0).max(1_000_000),
    // 완성한 별 무리 번호 (없으면 옛 화면 — 도감 등록 없이). 한 판 무리 수는 30개를 넘지 않는다
    groups: starGroupList,
    perfectGroups: starGroupList,
  }),
]);

export const RunFinishSchema = z.object({
  ticket: z.string().min(10).max(2000),
  result: RunResultSchema,
});

export const CharacterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("alloc"), stats: z.partialRecord(z.enum(STAT_KEYS), z.number().int().min(0).max(STAT_MAX)) }),
  z.object({ type: z.literal("learn"), skill: skillId }),
  // 11/15 auto: 자동 스킬 설정 (예전 화면은 안 보낸다 → 그대로). slots 없이 auto만 보내면 칸은 그대로 (사냥 중 자동 바꾸기)
  z.object({
    type: z.literal("hotbar"),
    slots: z.array(skillId.nullable()).length(HOTBAR_SIZE).optional(),
    auto: z.object({ ids: z.array(skillId).max(HOTBAR_SIZE), on: z.boolean(), keepUlt: z.boolean() }).optional(),
  }),
  z.object({ type: z.literal("equip"), slot: z.enum(GEAR_SLOTS), itemId: itemId.nullable() }),
  // 스킬 초기화: cost = 화면에 보인 비용 (서버 비용과 다르면 거절, 돈을 받지 않는다)
  z.object({ type: z.literal("respec"), cost: z.number().int().min(0).max(10_000) }),
  // 스킬 트리 바뀜 안내를 봤다
  z.object({ type: z.literal("ackTree") }),
  // 11/19 초월 수련: 한 칸 1랭크 올리기 · 모두 되돌리기(무료)
  z.object({ type: z.literal("tlearn"), node: z.enum(T_NODE_IDS) }),
  z.object({ type: z.literal("treset") }),
  // 능력치 초기화: cost = 화면에 보인 비용 (스킬 초기화와 같은 방식. 예전 화면은 cost 없이 보냈다 → 0으로 읽는다)
  z.object({ type: z.literal("resetStats"), cost: z.number().int().min(0).max(10_000).default(0) }),
]);

export const ShopActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("buy"), itemId, qty: z.number().int().min(1).max(20).default(1) }),
  // count: 한 번에 여러 개 되팔기 (없으면 1개, 예전 요청 그대로)
  z.object({ type: z.literal("sell"), itemId, count: z.number().int().min(1).max(POTION_MAX_STACK).default(1), piece: z.number().int().min(1).max(1e9).optional() }),
]);

// 11/15 세트 장비·강화 (lib/rpg/gearService). 세트 장비는 가방 번호(uid)로만 가리킨다 — 코드·능력치는 서버 것만 쓴다
const sgUidIn = z.number().int().min(1).max(1e9);
export const GearActionSchema = z.discriminatedUnion("type", [
  // 강화: sg(세트 장비 번호) 또는 shop(상점 장비 id) 하나. cost = 화면에 보인 포인트 (서버 비용과 다르면 거절, 돈을 받지 않는다)
  z.object({ type: z.literal("enhance"), sg: sgUidIn.optional(), shop: itemId.optional(), piece: sgUidIn.optional(), protect: z.boolean().default(false), cost: z.number().int().min(0).max(100_000) }),
  // 옵션 다시 굴리기: lock = 그대로 둘 옵션 하나 (전설 옵션은 "L")
  z.object({ type: z.literal("reroll"), uid: sgUidIn, lock: z.enum(["a", "c", "d", "s", "b", "h", "r", "p", "m", "k", "L"]).nullable().default(null), cost: z.number().int().min(0).max(100_000) }),
  z.object({ type: z.literal("exchange"), uids: z.array(sgUidIn).min(3).max(5), set: z.number().int().min(0).max(3), piece: z.number().int().min(0).max(4) }),
  z.object({ type: z.literal("disassemble"), uids: z.array(sgUidIn).min(1).max(60) }),
  // 11/19 강화 승계: 재료(세트 장비 번호 fromSg 또는 강화한 상점 장비 번호 fromPiece) → 받는 장비(sg·piece·shop 하나). cost = 화면에 보인 포인트
  z.object({
    type: z.literal("inherit"),
    fromSg: sgUidIn.optional(),
    fromPiece: sgUidIn.optional(),
    sg: sgUidIn.optional(),
    piece: sgUidIn.optional(),
    shop: itemId.optional(),
    cost: z.number().int().min(0).max(100_000),
  }),
  z.object({ type: z.literal("equip"), slot: z.enum(GEAR_SLOTS), uid: sgUidIn.nullable() }),
  // 11/19 숨겨진 5세트 효과 발견 (판에서 처음 켜졌을 때 화면이 알린다 — 서버는 지금 낀 장비로 확인한다). set = SG_SETS 순번
  z.object({ type: z.literal("egg"), set: z.number().int().min(0).max(3) }),
]);
