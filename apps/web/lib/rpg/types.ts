import type { Difficulty, GameKind, GearSlot, MonsterId, SkillId, Stats } from "./catalog";
import type { Derived } from "./formulas";

// 사냥터(RPG) 데이터 형태: 저장 원본, API 응답, 게임 ↔ UI 브리지 페이로드.

/** 계정마다 하나. Redis `rpg:{accountId}:char`에 JSON으로 저장한다 */
export type CharacterState = {
  level: number;
  exp: number;
  statPoints: number;
  skillPoints: number;
  /** 직접 올린 기본 능력치 (장비 보너스 제외) */
  stats: Stats;
  skills: Partial<Record<SkillId, number>>;
  /** 단축키 1~6에 놓은 스킬 */
  hotbar: (SkillId | null)[];
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

export type RpgView = {
  character: CharacterState;
  derived: Derived;
  expToNext: number;
  /** 지갑 포인트 */
  points: number;
  /** 오늘 사냥터·미니게임으로 받은 포인트와 하루 한도 */
  today: { huntPoints: number; cap: number; runs: number; runsPerHour: number };
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
export type BugsResult = { game: "bugs"; durationMs: number; caught: number; golden: number; wrong: number; maxCombo: number };
export type DeadlineResult = { game: "deadline"; durationMs: number; survivedMs: number; coffees: number; hits: number };
export type RunResult = HuntResult | BugsResult | DeadlineResult;

export type RunStartResponse = {
  ticket: string;
  game: GameKind;
  difficulty: Difficulty;
  seed: number;
  timeLimitSec: number;
  view: RpgView;
};

export type Drop = { kind: "gear" | "potion"; id: string; qty: number };

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
};

export type RunFinishResponse = { reward: RunReward; view: RpgView };

// ── 게임 ↔ UI ──

/** UI가 게임에 판을 시작하라고 보낸다 */
export type RpgPlay = {
  game: GameKind;
  difficulty: Difficulty;
  seed: number;
  timeLimitSec: number;
  level: number;
  derived: Derived;
  skills: Partial<Record<SkillId, number>>;
  hotbar: (SkillId | null)[];
  potions: Record<string, number>;
  equip: Record<GearSlot, string | null>;
};

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
  /** 단축키 칸별 남은 쿨타임 비율 0..1 */
  cooldowns: number[];
  potionCooldown: number;
  potions: Record<string, number>;
  buffs: { id: string; leftMs: number }[];
  /** 보스 HP 비율 (없으면 null) */
  boss: { name: string; ratio: number } | null;
  /** 쓰러졌다가 쿠키로 일어남 등 짧은 알림 */
  message?: string;
};

export type RpgAction =
  | { kind: "attack" }
  | { kind: "skill"; slot: number }
  | { kind: "potion"; id: string }
  /** 버그 잡기 칸 누르기 */
  | { kind: "slot"; slot: number };
