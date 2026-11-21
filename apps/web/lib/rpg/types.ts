import type { TodoTick } from "../retain";
import type { CardId, CardKindStyle, CardPick, StatPanel } from "./cards";
import type { Difficulty, DropKind, GameKind, GearSlot, MonsterId, SkillId, Stats, ZoneId } from "./catalog";
import type { DexGain } from "../forage/types";
import type { Derived } from "./formulas";
import type { StarSky } from "./plan";
import type { RunTier } from "./endgame";
import type { StatusId } from "./status";
import type { HotAuto } from "./hotbar";
import type { TNodeId } from "./transcendTree";
import type { MeteorState } from "./meteorDrop";

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
  /** 단축키에 놓은 스킬 (액티브만). 11/15 0~4 = 숫자 키 1~5, 5 = 궁극기 칸(F) — lib/rpg/hotbar */
  hotbar: (SkillId | null)[];
  /** 11/15 자동 스킬 (칸마다·전체 스위치·궁극기 SP 남김). 옛 저장값에는 없다 = 모두 끔 */
  hotAuto?: HotAuto;
  /** 11/19 초월 수련 배분 (lib/rpg/transcendTree — 초월 레벨마다 1포인트). 옛 저장값에는 없다 = 아무것도 안 찍음 */
  tSkills?: Partial<Record<TNodeId, number>>;
  /** 스킬 저장 형식 버전 (3 = 갈래 4개·랭크 비용 1·1·2·2·3). 다르면 normalize가 스킬을 비우고 포인트를 돌려준다 */
  treeVer: number;
  /** 스킬 초기화한 횟수 (비용에는 영향 없음, 기록용) */
  respecs: number;
  /** 능력치 초기화한 횟수 (스킬과 따로 센다, 비용에는 영향 없음). 옛 저장값에 없으면 0 */
  statResets: number;
  /** 스킬 트리가 바뀌어 포인트를 돌려줬다는 안내를 아직 안 봤다 (한 번 보면 지운다) */
  treeNotice?: boolean;
  /** 가진 장비 (장착 중인 것 포함) itemId → 개수 */
  inv: Record<string, number>;
  /** 그중 포인트로 산 개수 (되팔면 50% 환불, 나머지는 드롭이라 11/20부터 25%를 사냥 포인트로) */
  bought: Record<string, number>;
  equip: Record<GearSlot, string | null>;
  potions: Record<string, number>;
  /** 끝낸 판 수 */
  runs: number;
  // ── 11/15 사냥 끝판 (lib/rpg/endgame). 옛 저장값에 없으면 normalize가 0으로 ──
  /** 초월 레벨 0..50 (표시 ★51..★100, 0 = 아직). 레벨 50에서 지옥 사냥 판 EXP·야근 빌딩 층 EXP만 여기로 */
  tLevel: number;
  tExp: number;
  /**
   * 하루 초월 판 기록: 게임 날짜(새벽 5시 기준)·그날 센 초월 판 수·그날 적립된 100% 판 수 ·
   * 11/15 야근 빌딩: 아직 한 판(4층)이 안 된 깬 층 수 · 오늘 연 우두머리 상자 수
   */
  tDay?: string;
  tRuns: number;
  tBank: number;
  tFl: number;
  tChest: number;
  /** 11/15 야근 빌딩 최고 기록: 깬 가장 높은 층(0 = 없음)과 그 판에서 그 층을 깬 시각(판 시작부터 ms — 같은 층이면 빠른 쪽) */
  fBest: number;
  fBestMs: number;
  /** 이번 주(fWk = 그 주 월요일) 최고 층·시각 (주가 바뀌면 0부터) */
  fWk?: string;
  fWkBest: number;
  fWkMs: number;
  /** 11/15 의심 판(부드러운 거절)으로 오른 가장 높은 층 — 체크포인트만 연다 (없으면 0) */
  fSus?: number;
  /** 개척자 번호와 받은 시각 (끝판이 열린 뒤 14일 안에 ★51 또는 야근 빌딩 5층) */
  pioneer?: { n: number; at: number };
  // ── 11/15 세트 장비·강화 (lib/rpg/setGear · lib/rpg/enhance). 옛 저장값에 없으면 normalize가 채운다 ──
  /** 가진 세트 장비 코드 (장착 중 포함, 하나하나 따로 — 최대 SG_INV_MAX) */
  sg?: string[];
  /** 다음 세트 장비 번호 */
  sgN?: number;
  /** 세트 장비 없이 연 우두머리 상자 수 (SG_PITY번이면 다음 상자는 반드시) */
  sgPity?: number;
  /** 강화 재료: 결재 서류·인감 도장·보호 문서 */
  mats?: { doc: number; seal: number; prot: number };
  /** 보호 문서를 받은 주(그 주 월요일)와 그 주에 받은 장 수 */
  protWk?: string;
  protN?: number;
  /** 강화한 상점·주운 장비 한 개씩 ("w_stamp+3@5k.1" — lib/rpg/setGear shopPieceOf). 같은 이름 장비도 따로 강화한다 */
  si?: string[];
  /** 예전 저장값: 상점 장비 강화 (장비 id → 1..5)·연속 실패 수 — normalize가 한 개(si)로 옮기고 지운다 */
  enh?: Record<string, number>;
  enhF?: Record<string, number>;
  /** 4세트를 처음 맞춘 세트 (비트: 야근 1·결재 2·회의 4·출장 8) · 지금까지 가장 높은 강화 */
  sgDone?: number;
  enhMax?: number;
  /** +15 확성기 알림을 이미 한 세트 장비 번호 (장비마다 한 번) */
  sg15?: number[];
  /** 11/19 숨겨진 5세트 효과를 발견한 세트 (비트: 야근 1·결재 2·회의 4·출장 8 — lib/rpg/setGear SG_EGG). 옛 저장값에 없으면 0 */
  sgEgg?: number;
  /** 11/20 유성우 오라 (별자리 잇기 전용 — lib/rpg/meteorDrop): 그날 굴린 판 수 · 천장 진행 · 받은 시각. 옛 저장값에 없으면 0부터 */
  mt?: MeteorState;
  /**
   * 11/20 판 수 누적 (관리자 유저 상세): 사냥터 id·"tower"·"bugs"·"stars" → [끝낸 판, 깬 판(야근 빌딩은 깬 층 합)].
   * 판 끝 저장(캐릭터 JSON)에 같이 싣는다 — 명령 추가 없음. 옛 저장값에는 없다 = 11/20 전 판은 안 셌음
   */
  hz?: Record<string, [number, number]>;
};

export type DailyStats = { points: number; runs: number; exp: number };

/** 되팔기 결과: 받은 포인트(환불+사냥 수입), 한도에 닿았는지, 실제로 판 개수 (한도에 막혀 못 판 것은 가방에 그대로) */
export type SoldInfo = { value: number; capped: boolean; count: number };

/** 11/15 끝판 화면 정보 (레벨 50 — 슈퍼 계정 포함 — 일 때만) */
export type EndgameView = {
  /** 다음 초월 레벨까지 (최대면 0) */
  tExpToNext: number;
  /** 오늘 초월 판: 센 판 수 · 100% 판 수(20 + 적립) · 적립 · 다음 판의 구간 · 야근 빌딩에서 다음 판까지 깬 층(0..3) */
  day: { runs: number; full: number; bank: number; tier: RunTier; floors: number };
  /** 야근 빌딩: 최고 층 · 이번 주 최고(층·ms) · 고를 수 있는 시작 층 · 오늘 연 우두머리 상자 / 하루 상자 */
  tower: { best: number; week: { floor: number; ms: number } | null; checkpoints: number[]; chests: number; chestsMax: number };
  /** 개척자: 모집 마감 시각(없으면 아직 끝판이 안 열림) · 받은 번호 */
  pioneer: { until: number | null; n?: number; at?: number };
};

export type RpgView = {
  character: CharacterState;
  derived: Derived;
  expToNext: number;
  /** 지갑 포인트 */
  points: number;
  /** 오늘 사냥터로 받은 포인트와 하루 한도 (곤충·별자리는 미니게임 한도로 따로) */
  /** runsPerHour = 이번 한 시간에 남은 판 수, runsHourMax = 한 시간에 할 수 있는 판 수 (매크로 막기) */
  today: { huntPoints: number; cap: number; runs: number; runsPerHour: number; runsHourMax?: number };
  /** 다음 스킬 초기화 비용 (지갑 포인트, 레벨에 따라 32~120) */
  respecCost: number;
  /** 다음 능력치 초기화 비용 (지갑 포인트). 공식은 스킬 초기화와 같고 횟수만 따로 */
  statResetCost: number;
  /** 테스트 서버 슈퍼 계정 (운영 서버에서는 늘 없음): 스킬 포인트 넉넉히·레벨 최대 취급·사냥터 모두 열림 (초기화는 비용을 내되 횟수는 안 센다) */
  superHunter?: boolean;
  /** 11/15 끝판 (레벨 50일 때만) */
  endgame?: EndgameView;
};

// ── 판 결과 (클라이언트가 보낸다, 서버가 계획·시간으로 검증한다) ──

export type HuntResult = {
  game: "hunt";
  durationMs: number;
  kills: Partial<Record<MonsterId, number>>;
  wavesCleared: number;
  died: boolean;
  potionsUsed: Record<string, number>;
  /** 11/15 야근 빌딩: 이번 판에 깬 층 수 · 마지막 층을 깬 시각(판 시작부터 ms) · Esc로 그만두고 나왔는지 */
  floors?: number;
  floorMs?: number;
  quit?: boolean;
  /** 11/15 야근 빌딩 능력 카드: 고른 순서대로 (서버가 시드로 제안을 다시 굴려 확인한다 — lib/rpg/cards) */
  cards?: CardPick[];
  /** 11/18 판 기록 (관리자 확인 근거 — 판정에는 쓰지 않는다) */
  log?: RunLog;
};
/** 11/18 판 기록: ft = 층마다 깬 시각(판 시작부터 ms), dmg = 넣은 피해 합, sk = 스킬마다 쓴 횟수 */
export type RunLog = { ft?: number[]; dmg?: number; sk?: Record<string, number> };
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
  /** 판 제한 시간 (야근 빌딩은 층마다 따로 — 이 값은 한 판 최대 길이) */
  timeLimitSec: number;
  /** 11/15 야근 빌딩 시작 층 (없으면 보통 판) */
  tower?: number;
  /** 11/15 초월 판 구간 (레벨 50 지옥 판만). practice면 초월 EXP·드롭 없음 */
  tier?: RunTier;
  /** 별자리 잇기: 판 시작 시각이 맑은 밤 (전설 별자리가 나올 수 있다, 포인트 보너스). 1판 화면도 읽는다 */
  starry?: boolean;
  /** 별자리 잇기: 판 시작 시각의 하늘 (맑은 밤·계절·새벽)과 서버가 받아들인 계획 판 번호 */
  sky?: StarSky;
  planVer?: number;
  /** 테스트 서버 운영자 시험 드롭 (lib/rpg/testDrops): 이 판 끝에 화면이 떨구고 서버가 굴림 대신 준다 */
  testDrops?: Drop[];
  /** 11/15 테스트 서버 슈퍼 계정: 우두머리마다 드롭이 늘 나온다 (서버가 계정으로 정한다 — 화면은 같은 값으로 미리 굴린다) */
  superDrops?: boolean;
  view: RpgView;
};

/** cosmetic = 기간제 코디(캐릭터 꾸미기 하루권). 사냥 캐릭터 가방이 아니라 계정 가방(상점 꾸미기)에 들어간다 */
export type Drop = {
  kind: DropKind;
  id: string;
  qty: number;
  /** 11/15 야근 빌딩 상자 꾸미기: 이용권 일수 (없으면 예전 하루권) */
  days?: number;
};

export type RunReward = {
  score: number;
  exp: number;
  /** 11/16 exp 가운데 사냥 갈래 칭호로 더 받은 몫 (없으면 빠진다) */
  titleExp?: number;
  /** 11/17 사냥왕(지난주 1위) 혜택으로 더 받은 몫 — 초월 판·야근 빌딩이면 초월 EXP 몫 (없으면 빠진다, lib/champPerks) */
  champExp?: number;
  /** 계산된 포인트 (한도 전) */
  pointsRaw: number;
  /** 실제로 들어온 포인트 */
  points: number;
  capped: boolean;
  /** 11/19 사냥터 포인트를 받지 않은 이유: star = ★58(초월 8)부터 일반 사냥터 전부, level = 적정 레벨(사냥터가 열리는 레벨 +10)을 넘었다 */
  overLevel?: "star" | "level";
  /** 11/19 야근 빌딩: 적정 층보다 낮아 포인트를 받지 않은 층 수와 포인트를 주는 첫 층 */
  lowFloors?: { floors: number; from: number };
  drops: Drop[];
  levelsGained: number;
  newLevel: number;
  /** 드롭 장비가 가방이 가득 차서 못 들어온 경우 */
  lostDrops: number;
  /** 22번: 별자리 잇기를 맑은 밤에 해서 포인트 보너스를 받았다 */
  nightBonus?: boolean;
  /** 11/20 이번 판에 「유성우 오라」가 떨어져 영구로 받았다 (lib/rpg/meteorDrop) */
  meteor?: true;
  /**
   * 별자리 잇기: 이번 판에 완성한 별자리 (isNew = 도감에 처음 등록, perfect = 완벽으로만 이음,
   * later = 처음 완성했지만 한 판 새 등록 한도(STARS_NEW_PER_RUN)를 넘어 이번엔 등록하지 않음 — 다음 판에)
   */
  constellations?: { id: string; isNew: boolean; perfect: boolean; later?: boolean }[];
  /** 별자리·11/16 몬스터를 도감에 처음 등록해서 받은 도감 보상 (lib/forage/dexReward) */
  dexReward?: DexGain;
  /** 11/16 이번 판에 몬스터 도감에 처음 등록된 몬스터 id (사냥·야근 빌딩, 받아들인 판만) */
  newMobs?: string[];
  /** 11/15 초월 판: 받은 초월 EXP·그 판의 구간·오른 초월 레벨·지금 초월 레벨 */
  transcend?: { exp: number; tier: RunTier; levelsGained: number; tLevel: number };
  /**
   * 11/15 야근 빌딩: 시작 층·깬 층 수·이번 최고 층 · 새 최고 기록·이번 주 기록 · 초월 판으로 센 판 수 ·
   * 상자를 연 우두머리 층·오늘 한도로 비어 있던 상자 수 · 서버 최초·꼭대기 층 주인으로 받은 칭호 id
   */
  tower?: {
    start: number;
    floors: number;
    best: number;
    newBest: boolean;
    newWeek: boolean;
    runs: number;
    chests: number[];
    emptyChests: number;
    titles: string[];
    /**
     * 확인이 필요한 판. 11/18부터는 판·포인트만 받고, 최고 층·랭킹·서버 최초·상자·초월 EXP·체크포인트는
     * 관리자가 확인(「확인 필요」에서 인정)하면 들어간다
     */
    suspect?: boolean;
    /** 11/18 서버 전체 최고 층을 새로 깼다: 꼭대기 층 주인·전체 랭킹 기록은 관리자 확인 뒤에 (나머지는 다 받았다) */
    topPending?: boolean;
  };
  /** 11/15 이번 판으로 개척자 번호를 받았다 */
  pioneer?: number;
  /** 11/18 서버 최초 칭호(한 명뿐)는 관리자 확인 뒤에 들어간다: 이번 판으로 확인을 기다리게 된 칭호 id */
  firstPending?: string[];
};

export type RunFinishResponse = { reward: RunReward; view: RpgView; todo?: TodoTick };

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
  /** 11/19 초월 수련 (판 시작 때 캐릭터 것 그대로) */
  tSkills?: Partial<Record<TNodeId, number>>;
  hotbar: (SkillId | null)[];
  /** 11/15 자동 스킬 설정 (판 시작 때 캐릭터 것 그대로) */
  hotAuto?: HotAuto;
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
  /** 테스트 서버 운영자 시험 드롭 (판 시작 응답 그대로). 있으면 화면은 드롭 예측 대신 이것을 판 끝에 떨군다 */
  testDrops?: Drop[];
  /** 11/15 야근 빌딩: 시작 층 · 오늘 남은 우두머리 상자 (몬스터 배율·저주는 층마다 — lib/rpg/tower) */
  tower?: {
    start: number;
    chestsLeft: number;
    /** 11/15 세트 장비 천장: 판 시작 때 세트 장비 없이 연 상자 수 (서버 towerChestDrops와 같은 값에서 센다) */
    pity?: number;
    /** 11/15 테스트 서버 슈퍼 계정만: 무적·공격력 ×20 (높은 층 구경용). 서버는 이 값을 받지도 믿지도 않는다 — 운영 서버에서는 화면이 켜지 못한다 */
    boost?: boolean;
    /** 11/16 야근 빌딩 갈래 칭호: 층마다 더하는 제한 시간 (초, lib/titles towerSec). 층 제한 시간은 화면만 재고 서버는 최소 시간만 본다 */
    bonusSec?: number;
  };
  /** 11/15 연습 판 (초월 구간을 다 써서 드롭이 없다) — 바닥 드롭 연출을 하지 않는다 */
  noDrops?: boolean;
  /**
   * 11/18 드롭 시드 받기 (사냥·야근 빌딩): 첫 우두머리가 나올 수 있는 시각 뒤에 한 번 부른다 (lib/rpg/reveal).
   * 판 시작 응답에는 드롭 시드가 없다. 못 받으면 null — 바닥 드롭 연출만 빠진다 (보상은 결과 화면에 그대로)
   */
  reveal?: () => Promise<number | null>;
  /** 11/15 테스트 서버 슈퍼 계정 시험 드롭 (판 시작 응답의 superDrops 그대로 — 운영 서버에서는 늘 없다): 우두머리 장비·상자 세트 장비·꾸미기가 늘 나온다 */
  superDrops?: boolean;
  /** 11/19 이미 발견한 숨겨진 5세트 효과 (캐릭터 sgEgg) — 처음 켜질 때만 「발견!」을 띄운다 */
  sgEgg?: number;
  /** 11/20 회장님 독대 (game/chairman): 회장실 판 — 웨이브·드롭 없이 쓰러지지 않는 회장님과 싸운다 */
  chairman?: {
    mode: "normal" | "hell";
    practice: boolean;
    /** 지옥 봉인 순서 (서버 판 시작 응답 sealPool) */
    sealPool: string[];
    /** 내 최고 기록 (피해 계기판) */
    best: number;
    /** 처음 보는 기술 기억 키 (계정마다) */
    acct: string;
    /** 11/22 오늘 시작 전 나가기로 판을 돌려받을 수 있다 (유료 판 · 브리핑 멈춤 창 안내) */
    refundLeft?: 0 | 1;
    /** 11/22 돌려받기 마감 (이 화면 시계 ms — 판 시작 응답 받은 때 + 서버 창보다 조금 짧게) */
    refundUntil?: number;
    /** 쓰러짐(또는 20분)·회색 연출이 끝났다 → 서버에 판 끝을 알리고 결과 창 (game/chairman launch) */
    ended: (r: { damage: number; durationMs: number; timeUp: boolean; potionsUsed: Record<string, number>; god?: boolean }) => void;
  };
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
  /** 11/15 야근 빌딩: 지금 층 */
  floor?: number;
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
  /** 11/17 사냥터 낙법: 남은 쿨타임 비율 0..1과 ms (lib/rpg/dodge) */
  dodge?: { left: number; ms: number };
  potions: Record<string, number>;
  buffs: { id: string; leftMs: number }[];
  /** 사냥터: 몬스터가 건 상태 이상 (lib/rpg/status) — 체력바 옆에 아이콘·남은 시간 */
  statuses?: { id: StatusId; leftMs: number }[];
  /** 보스 HP 비율 (없으면 null) */
  boss: { name: string; ratio: number } | null;
  /** 쓰러졌다가 쿠키로 일어남 등 짧은 알림 */
  message?: string;
  /** 11/15 칸별 SP 비용 (모자람 표시) · 자동 스킬 상태 (칸에 있는 스킬 중 자동으로 정한 것, 전체 스위치) */
  skillSp?: number[];
  auto?: { slots: boolean[]; on: boolean; keepUlt: boolean };
  /** 11/15 야근 빌딩 능력 카드: 판 레벨·이번 레벨 경험치, 가진 카드(겹친 수), 남은 다시 뽑기, 멈추면 집중 중, 내 무기 갈래 */
  run?: { lv: number; xp: number; need: number; cards: { id: CardId; n: number }[]; rerolls: number; focus: boolean; kind: CardKindStyle };
  /** 11/15 판 안 능력치 판 (기본 + 카드가 더한 만큼, 카드 효과 칩) — lib/rpg/cards statPanel */
  stats?: StatPanel;
  /** 11/20 회장님 독대: 남은 시간 대신 단계 이름 · 봉인된 칸(반려 도장) · 3초 뒤 봉인될 칸(빨간 깜빡임) */
  /** 11/20 회장님 독대: ms = 버틴 시간(판 시간), crunch = 크런치(10분부터), practice = 연습 판 (청록 테두리) */
  /** heal = 회복 감소 알림 (11/20 「회장님 앞에서는 회복이 70% 줄어요」) */
  chair?: { title: string; practice: boolean; phase: string; sealed: number[]; warn: number[]; ms: number; crunch: boolean; heal?: string };
};

export type RpgAction =
  | { kind: "attack" }
  /**
   * 사냥터: 누르고 있는 동안 공격 속도대로 계속 공격 (36번). on=false면 뗌.
   * x·y(화면 좌표)가 있으면 그쪽을 바라보고 친다 (캔버스를 누른 채 끌기), 없으면 지금 방향 (공격 버튼)
   */
  | { kind: "hold"; on: boolean; x?: number; y?: number }
  | { kind: "skill"; slot: number }
  /** 11/15 칸 자동 켜기·끄기 (칸 우클릭·길게 누르기). "all" = 전체 스위치 (X) */
  /** every: 11/22 폰 [자동] — 켤 때 자동이 되는 칸을 전부 켠다 (끌 때는 전체 스위치만) */
  | { kind: "auto"; slot: number | "all"; every?: boolean }
  | { kind: "potion"; id: string }
  /** 11/17 사냥터 낙법 (Z·K, 폰 [구르기] 버튼) */
  | { kind: "dodge" }
  /** 11/20 회장님 독대 달리기 (폰 [달리기] 켜고 끄기) */
  | { kind: "run"; on: boolean }
  /** 버그 잡기 칸 누르기 */
  | { kind: "slot"; slot: number };
