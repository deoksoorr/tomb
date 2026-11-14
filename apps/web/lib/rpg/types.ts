import type { Difficulty, DropKind, GameKind, GearSlot, MonsterId, SkillId, Stats, ZoneId } from "./catalog";
import type { DexGain } from "../forage/types";
import type { Derived } from "./formulas";
import type { StarSky } from "./plan";
import type { StatusId } from "./status";

// 사냥터(RPG) 데이터 형태: 저장 원본, API 응답, 게임 ↔ UI 브리지 페이로드.

/** 계정마다 하나. Redis `rpg:{accountId}:char`에 JSON으로 저장한다 */
export type CharacterState = {
  level: number;
  exp: number;
  statPoints: number;
  skillPoints: number;
  /** 직접 올린 기본 능력치 (장비 보너스 제외) */
  stats: Stats;
  /** 스킬 트리 배분 (스킬 → 랭크). 검증 규칙은 skillRules.ts */
  skills: Partial<Record<SkillId, number>>;
  /** 단축키 1~6에 놓은 스킬 (액티브만) */
  hotbar: (SkillId | null)[];
  /** 스킬 저장 형식 버전 (2 = 갈래 3개 트리). 다르면 normalize가 스킬을 비우고 포인트를 돌려준다 */
  treeVer: number;
  /** 스킬 초기화한 횟수 (첫 1회 무료) */
  respecs: number;
  /** 스킬 트리가 바뀌어 포인트를 돌려줬다는 안내를 아직 안 봤다 (한 번 보면 지운다) */
  treeNotice?: boolean;
  /** 가진 장비 (장착 중인 것 포함) itemId → 개수 */
  inv: Record<string, number>;
  /** 그중 포인트로 산 개수 (되팔면 50% 환불, 나머지는 드롭이라 사냥 포인트 한도 안에서 지급) */
  bought: Record<string, number>;
  equip: Record<GearSlot, string | null>;
  potions: Record<string, number>;
  /** 끝낸 판 수 */
  runs: number;
};

export type DailyStats = { points: number; runs: number; exp: number };

/** 되팔기 결과: 받은 포인트(환불+사냥 수입), 한도에 닿았는지, 실제로 판 개수 (한도에 막혀 못 판 것은 가방에 그대로) */
export type SoldInfo = { value: number; capped: boolean; count: number };

export type RpgView = {
  character: CharacterState;
  derived: Derived;
  expToNext: number;
  /** 지갑 포인트 */
  points: number;
  /** 오늘 사냥터·미니게임으로 받은 포인트와 하루 한도 */
  today: { huntPoints: number; cap: number; runs: number; runsPerHour: number };
  /** 다음 스킬 초기화 비용 (지갑 포인트, 0 = 무료) */
  respecCost: number;
  /** 테스트 서버 슈퍼 계정 (운영 서버에서는 늘 없음): 스킬 포인트 넉넉히·레벨 최대 취급·사냥터 모두 열림·초기화 무료 */
  superHunter?: boolean;
};

// ── 판 결과 (클라이언트가 보낸다, 서버가 계획·시간으로 검증한다) ──

export type HuntResult = {
  game: "hunt";
  durationMs: number;
  kills: Partial<Record<MonsterId, number>>;
  wavesCleared: number;
  died: boolean;
  potionsUsed: Record<string, number>;
};
/** wrong: '기능'을 누른 수, decoy: 주석 처리된 가짜 버그를 누른 수, score: 콤보 배수까지 넣은 점수(서버가 상한으로 자른다) */
export type BugsResult = { game: "bugs"; durationMs: number; caught: number; golden: number; wrong: number; decoy: number; maxCombo: number; score: number };
/**
 * groups: 별을 하나도 놓치지 않고(좋아 이상) 끝까지 이은 별 무리 번호, perfectGroups: 그중 완벽으로만 이은 무리.
 * 서버가 계획·시간·판정 수로 검사한 뒤 별자리 도감에 등록한다. 옛 화면은 보내지 않는다 (없으면 도감 등록 없이)
 */
export type StarsResult = {
  game: "stars";
  durationMs: number;
  perfect: number;
  good: number;
  miss: number;
  maxCombo: number;
  score: number;
  groups?: number[];
  perfectGroups?: number[];
};
export type RunResult = HuntResult | BugsResult | StarsResult;

export type RunStartResponse = {
  ticket: string;
  game: GameKind;
  difficulty: Difficulty;
  /** 사냥터 id (40번, 사냥만) */
  zone?: ZoneId;
  seed: number;
  timeLimitSec: number;
  /** 별자리 잇기: 판 시작 시각이 맑은 밤 (전설 별자리가 나올 수 있다, 포인트 보너스). 1판 화면도 읽는다 */
  starry?: boolean;
  /** 별자리 잇기: 판 시작 시각의 하늘 (맑은 밤·계절·새벽)과 서버가 받아들인 계획 판 번호 */
  sky?: StarSky;
  planVer?: number;
  view: RpgView;
};

/** cosmetic = 기간제 코디(캐릭터 꾸미기 하루권). 사냥 캐릭터 가방이 아니라 계정 가방(상점 꾸미기)에 들어간다 */
export type Drop = { kind: DropKind; id: string; qty: number };

export type RunReward = {
  score: number;
  exp: number;
  /** 계산된 포인트 (한도 전) */
  pointsRaw: number;
  /** 실제로 들어온 포인트 */
  points: number;
  capped: boolean;
  drops: Drop[];
  levelsGained: number;
  newLevel: number;
  /** 드롭 장비가 가방이 가득 차서 못 들어온 경우 */
  lostDrops: number;
  /** 22번: 별자리 잇기를 맑은 밤에 해서 포인트 보너스를 받았다 */
  nightBonus?: boolean;
  /**
   * 별자리 잇기: 이번 판에 완성한 별자리 (isNew = 도감에 처음 등록, perfect = 완벽으로만 이음,
   * later = 처음 완성했지만 한 판 새 등록 한도(STARS_NEW_PER_RUN)를 넘어 이번엔 등록하지 않음 — 다음 판에)
   */
  constellations?: { id: string; isNew: boolean; perfect: boolean; later?: boolean }[];
  /** 별자리를 도감에 처음 등록해서 받은 도감 보상 (lib/forage/dexReward) */
  dexReward?: DexGain;
};

export type RunFinishResponse = { reward: RunReward; view: RpgView };

// ── 게임 ↔ UI ──

/** UI가 게임에 판을 시작하라고 보낸다 */
export type RpgPlay = {
  game: GameKind;
  difficulty: Difficulty;
  /** 사냥터 id (40번). 없으면 그 난이도의 기본 사냥터 */
  zone?: ZoneId;
  seed: number;
  timeLimitSec: number;
  level: number;
  derived: Derived;
  skills: Partial<Record<SkillId, number>>;
  hotbar: (SkillId | null)[];
  potions: Record<string, number>;
  equip: Record<GearSlot, string | null>;
  /** 32번 곤충 채집: 벌레 잡기를 마을 수풀 그림(나비·반딧불이)으로. night면 반딧불이 */
  theme?: "meadow";
  night?: boolean;
  /** 곤충 채집 들판의 시간대 (한국 시각 낮·노을·밤). 없으면 night로 낮/밤만 */
  tone?: MeadowTone;
  /** 별자리 잇기: 맑은 밤 판 (서버 판 시작 응답의 starry — 전설 별자리가 계획에 들어간다) */
  starry?: boolean;
  /** 별자리 잇기: 판 시작 시각의 하늘 (서버 판 시작 응답 — 계절·새벽 별자리). 있으면 starry 대신 이것으로 계획을 만든다 */
  sky?: StarSky;
  /** 별자리 잇기: 이미 도감에 있는 별자리 id (처음 완성하면 "도감 등록!"을 띄운다. 등록 자체는 서버가 한다) */
  starsKnown?: string[];
};

/** 곤충 채집 들판 시간대: 낮(나비) · 노을(잠자리) · 밤(반딧불이) */
export type MeadowTone = "day" | "dusk" | "night";

/** 게임 → UI 상태 (초당 약 8번) */
export type RpgHud = {
  game: GameKind;
  hp: number;
  maxHp: number;
  sp: number;
  maxSp: number;
  /** 남은 시간 ms */
  leftMs: number;
  score: number;
  /** 사냥터: 웨이브 i/n, 처치 수 */
  wave?: [number, number];
  kills?: number;
  combo?: number;
  /** 함께 사냥: 같은 사냥터·난이도 방에 있는 사람 수 (나 포함, 접속 전이면 없음) */
  peers?: number;
  /** 별자리 잇기: 마지막 판정 */
  judge?: "perfect" | "good" | "miss";
  /** 별자리 잇기: 지금 잇는 무리(이은 수·별 수, 끊겼으면 broken), 이번 판에 완성한 수, 마지막으로 완성한 별자리 이름 */
  stars?: { hit: number; size: number; broken: boolean; done: number; last: string | null };
  /** 단축키 칸별 남은 쿨타임 비율 0..1 */
  cooldowns: number[];
  potionCooldown: number;
  /** 사냥터: 공격 쿨다운 남은 비율 0..1, 쿨다운 중 눌러 둔 공격이 있는지 */
  attack?: number;
  attackBuffered?: boolean;
  potions: Record<string, number>;
  buffs: { id: string; leftMs: number }[];
  /** 사냥터: 몬스터가 건 상태 이상 (lib/rpg/status) — 체력바 옆에 아이콘·남은 시간 */
  statuses?: { id: StatusId; leftMs: number }[];
  /** 보스 HP 비율 (없으면 null) */
  boss: { name: string; ratio: number } | null;
  /** 쓰러졌다가 쿠키로 일어남 등 짧은 알림 */
  message?: string;
};

export type RpgAction =
  | { kind: "attack" }
  /**
   * 사냥터: 누르고 있는 동안 공격 속도대로 계속 공격 (36번). on=false면 뗌.
   * x·y(화면 좌표)가 있으면 그쪽을 바라보고 친다 (캔버스를 누른 채 끌기), 없으면 지금 방향 (공격 버튼)
   */
  | { kind: "hold"; on: boolean; x?: number; y?: number }
  | { kind: "skill"; slot: number }
  | { kind: "potion"; id: string }
  /** 버그 잡기 칸 누르기 */
  | { kind: "slot"; slot: number };
