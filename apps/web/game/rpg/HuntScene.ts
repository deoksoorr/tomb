import * as Phaser from "phaser";
import { MONSTERS, potionById, POTION_COOLDOWN_MS, SKILL_FX, skillById, skillMods, zoneFor, type BranchId, type MonsterId, type SkillId, type SkillMods, type ZoneDef } from "@/lib/rpg/catalog";
import { attackArea, damage, hitChance, huntSpRegen, inAttackArea, monsterStats, workPowerOf, type AttackArea, type Derived, type MonsterStats } from "@/lib/rpg/formulas";
import { bossPhaseIndex, bossPhaseList, monsterPatterns, type PatternId } from "@/lib/rpg/patterns";
import { attackCooldownMs, CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf, type WeaponStyle, type WeaponStyleId } from "@/lib/rpg/weapons";
import { gearById } from "@/lib/rpg/catalog";
import { ELITE, huntPlan, STREAM_GAP_MS, WAVE_FORMATION_LABEL, WAVE_MAX_GAP_SEC, type HuntWave } from "@/lib/rpg/plan";
import { POTION_CURES, rollStatus, STATUS_IDS, StatusBook, STATUSES, type StatusId } from "@/lib/rpg/status";
import { floorSeed, isBossFloor, isChestFloor, NO_CURSE, splitChestPotions, TOWER_BOSS_HEAL, TOWER_POWER, towerChestDrops, towerCurseFx, towerFloorSec, towerPlan, towerScale, towerBlock, towerZone, type CurseFx } from "@/lib/rpg/tower";
import type { HuntResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { potionSaleValue } from "@/lib/rpg/character";
import { isMagicBranch, packCdCut, skillSpCost, SYNERGY, synergyGuard, synergyMul, wkCdFloor } from "@/lib/rpg/skillTree";
import { soulFocus } from "@/lib/rpg/skillRules";
import { NO_TMODS, tMods, type TMods } from "@/lib/rpg/transcendTree";
import { DIR, STATE, type DirId, type HuntAct } from "@tomb/protocol";
import { FONT_KEY, FONT_PX } from "../text/GlyphAtlas";
import { isTouchUi } from "../input/keyHint";
import { AvatarView } from "../entities/AvatarView";
import type { CfxDepth } from "../entities/CosmeticFxView";
import { RoomPresence } from "../net/RoomPresence";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { iconCanvas } from "./icons";
import { RpgScene } from "./base";
import { CombatFx, COMBO_RESET_MS, FXT } from "./combatFx";
import { DEPTH_GROUND, PALETTES, SkillFx, SKT } from "./skillFx";
// 스킬마다 고유 연출 (skillMoves) · 큰 도트 피해 숫자와 연타 합계 (damageNumbers)
import { SKILL_LOOK, SkillMoves, skillPower } from "./skillMoves";
import { art } from "./skillArt";
import { DamageNumbers, type Box, type DmgGroup } from "./damageNumbers";
import { DEPTH } from "../config";
import { cancelCast, seedPatternTimers, tryStartPattern, updateCast, type Cast, type PatternHost } from "./monsterPatterns";
import type { RpgSound } from "./sfx";
import type { SoundEv, SoundOpt } from "./skillSound";
import { TelegraphLayer } from "./telegraph";
import { avFrame, ensureRpgTextures, makePlayer, RTEX } from "./sprites";
// 40번 테마 사냥터: 지도·기믹·길찾기 (arena/), 몬스터 동작별 프레임 (monsterArt)
import { Arena, type ArenaHooks } from "./arena/Arena";
import { monsterFrame, monsterOrigin, playMonsterDeath } from "./monsterArt";
// 바닥 드롭 연출: 판이 끝나는 순간 서버와 같은 식으로 굴린 드롭을 몬스터 자리에 떨군다 (보상은 서버가)
import { huntBossDrop, huntDropsFor, MIN_RUN_MS, type DropTicket } from "@/lib/rpg/rewards";
import { dropRevealMs } from "@/lib/rpg/reveal";
import { LootLayer } from "./loot";
import { autoBlock, cleanAuto, SKILL_SLOTS, startAuto, ULT_SLOT, type HotAuto } from "@/lib/rpg/hotbar";
import { AUTO_GAP_MS, autoSpOk, ultReserve, wantsCast, type AutoCtx } from "@/lib/rpg/autoSkill";
import { bridge } from "../bridge";
// 11/15 야근 빌딩 능력 카드 (판 안에서 쌓는 힘)
import { CardRun, type CardHost } from "./cards/CardRun";
import { isBossDealFloor, mainBranchOf, statPanel } from "@/lib/rpg/cards";
// 11/15 야근 빌딩: 엘리베이터 연출 · 테마 실행부 (지하 서버실 몬스터 행동·과열·움직이는 배경)
import { ElevatorCut } from "../tower/elevator";
import { MonsterIntro } from "../tower/introCard";
import { BossChest } from "../tower/bossChest";
// 11/15 세트 장비 싸움 효과·손에 든 무기 (강화 빛)
import { SetGearRun } from "./setGearRun";
import { SetEggRun } from "./setEggRun";
import { SetEggFx } from "./setEggFx";
import { HeldWeapon } from "./heldWeapon";
import { huntLook } from "../sprites/setGearWear";
import { SelfLight } from "./selfLight";
// 11/17 낙법(회피 구르기): 쿨타임·무적 규칙은 lib/rpg/dodge, 연출은 dodgeFx
import { DODGE_DIST, dodgeCooldown, NO_DODGE, rollDir, rolling, rollT, rollTravel, startDodge, type Dodge } from "@/lib/rpg/dodge";
import { DodgeFx, dodgeSound, rollPose } from "./dodgeFx";
// 11/17 쓰러짐 → 카드 발동 → 일어남 연출 · 발동 표시(카드 그림) · 받은 피해 숫자를 HUD 체력과 맞추기
import { DownCut, REVIVE_INVULN_MS, type DownKind } from "./reviveCut";
import { showProc } from "./procToast";
import { cardProc, cookieProc, sgProc } from "@/lib/rpg/procs";
import { hpLost, hpShown } from "./hurtTally";
import { CARD_SND } from "./cards/cardFx";
import { stealHeal } from "@/lib/rpg/lifesteal";
import { enhOfId, SG_EGG_FX, SG_SETS } from "@/lib/rpg/setGear";
import { eggProc } from "@/lib/rpg/procs";
import { nextPity } from "@/lib/rpg/setGearRoll";
import { towerSound } from "../tower/towerSound";
import { TOWER_THEME_RUNTIMES } from "../tower/themes";
import type { ThemeHost, TowerThemeRuntime } from "../tower/themes/runtime";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
// 11/20 회장님 독대: 회장실 바닥·쓰러지지 않는 회장님·밈 기술 (game/chairman)
import { ChairArena, type ArenaLike } from "../chairman/arena";
import { EXT_B as CHAIR_EXT_B, EXT_T as CHAIR_EXT_T } from "../chairman/art";
import { ChairmanFight, type ChairHost } from "../chairman/fight";
import { CHAIR_GUARD_KEEP, CHAIR_HEAL_CAP_PER_SEC, CHAIR_HEAL_MUL, CHAIR_RUN, chairQuit, liveSkills, WH as CHAIR_H, WW as CHAIR_W } from "../chairman/rules";
import { chairBossStats } from "@/lib/chairman/rules";

// 사냥터: 위에서 내려다보는 실시간 전투. 웨이브는 서버가 준 시드의 계획(huntPlan)대로 나온다.
//  - 웨이브 i는 앞 웨이브를 다 잡았고 i×8초가 지났을 때, 또는 앞 웨이브 뒤 35초가 지나면 나온다
//  - 끝: 시간 끝 / 모든 웨이브 클리어 / 쓰러짐(부활 쿠키가 있으면 한 번 일어난다)
//  - 11/15 야근 빌딩(play.tower): 층마다 방 하나 — 깨면 엘리베이터(어두워짐 + 층 표시)로 다음 층, 체력·SP·버프는 그대로.
//    층 배율·저주(물약 절반·금지, 받는 회복 절반, 몬스터 이동·공격 속도, 제한 시간, 정예 섞임)·층 계획은 lib/rpg/tower. 쓰러지면 끝 (부활 쿠키 없음)
//  - 공격: 바라보는 쪽 부채꼴(무기마다 다를 수 있음) 안의 몬스터를 모두 때린다.
//    누를 때마다 한 번(쿨다운 중이면 버퍼에 한 번), 누르고 있으면(키·마우스·손가락) 공격 속도대로 계속.

// 11/20 회장님 독대는 넓은 판(960×540) — 판을 시작할 때 정한다 (씬은 하나)
let W = 448;
let H = 288;

/** 11/21 회장님 독대 폰: 화면 위·아래를 HUD가 가리는 높이 (CSS px — 게임 크기 = CSS 크기). 넓고 높은 화면은 [0, 0] */
//  11/21 폰 HUD 시안 B: 위는 판 없이 글자 두 줄뿐 → 위 몫을 줄였다 (아래는 스킬 칸·공격 단추 높이). 0이 아니면 = 폰 HUD(slim)
export function chairCamPad(w: number, h: number): [number, number] {
  if (w <= 560) return [Math.round(Math.min(h * 0.12, 96)), Math.round(h * 0.26)];
  if (h <= 520) return [64, Math.round(h * 0.1)];
  return [0, 0];
}
/** 11/21 폰 HUD 머리 위 체력·SP 막대 높이 (화면 px — 테두리 포함) */
const CHAIR_BAR_H = 12;
/** 내 이름표 원래 깊이 (AvatarView: labels + 1) */
const LABEL_DEPTH_ME = DEPTH.labels + 1;
const WALL = 10;
const PLAYER_R = 5;
const HURT_IFRAME_MS = 450;
/** 11/15 몬스터가 이보다 많으면 밀어내기를 격자로 (칸 크기 px — 가장 큰 일반 몬스터 두 마리 거리보다 크게) */
const SEP_GRID_FROM = 24;
const SEP_CELL = 32;
const SEP_NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
/** 같은 방 다른 사람 아바타 투명도 */
const GHOST_ALPHA = 0.42;
/** 11/13 자리 비움(탭을 숨겼거나 판을 멈춘 사람)은 더 연하게 */
const AWAY_ALPHA = 0.24;
const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
/** 사냥 화면의 운영자 오라·안개 투명도 배율 (몸 뒤로 보내고 이만큼만) */
const STAFF_SOFT_ALPHA = 0.45;

type Mon = {
  id: MonsterId;
  st: MonsterStats;
  x: number;
  y: number;
  hp: number;
  wave: number;
  alive: boolean;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  nextAtk: number;
  nextThink: number;
  dx: number;
  dy: number;
  /** dash: 준비 끝 시각 / 돌진 끝 시각 */
  windUntil: number;
  dashUntil: number;
  vulnUntil: number;
  /** 11/19 마지막으로 맞은 게 넋 스킬·부른 넋인가 (퇴근길 등불 카드) */
  soulHit?: boolean;
  vuln: number;
  slowUntil: number;
  hidden: boolean;
  /** 넉백 속도 (px/s, 매 프레임 줄어든다) */
  kbx: number;
  kby: number;
  /** 피격 경직: 이 시각까지 움직이지도 때리지도 못한다 */
  stunUntil: number;
  // ── 2번 공격 패턴 (monsterPatterns.ts) ──
  /** 쓰는 중인 패턴 (경고 → 판정) */
  cast: Cast | null;
  patReady: Partial<Record<PatternId, number>>;
  nextCastAt: number;
  /** 지금 쓸 수 있는 패턴 이름 (우두머리는 단계마다 바뀐다) */
  pats: PatternId[];
  /** 마지막 웨이브 우두머리 */
  boss: boolean;
  /** 우두머리 단계 (0 = 처음) */
  phase: number;
  /** 40번: 우두머리가 부른 졸개 (웨이브 마릿수에 들지 않는다) */
  minion?: boolean;
  /** 11/20 회장님 독대: 회장님 자리 (그림·AI 없이 자리만 — game/chairman이 움직인다) · 머리 위 체력 막대 숨김 */
  chair?: boolean;
  noBar?: boolean;
  /** 11/12 정예 (plan ELITE: 크고 질기고 EXP 많이) */
  elite?: boolean;
};

/** 내 투사체 (40번 쏘기·던지기) */
type PShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  left: number;
  pierce: number;
  mult: number;
  hit: Set<Mon>;
  sprite: Phaser.GameObjects.Sprite;
  spin: boolean;
  /** 스킬 투사체의 타격 옵션 (없으면 기본 공격) */
  opts?: HitOpts;
  /** 따라가는 넋불: 이 적을 쫓는다 */
  home?: Mon | null;
  /** 날아가는 동안 꼬리 연출 (고드름·넋불) */
  trail?: "icicle" | "wisp";
};

/** 무기 방식마다 휘두를 때 소리 */
const SWING_SFX: Record<WeaponStyleId, RpgSound> = { swing: "swish", smash: "thud", thrust: "stab", combo: "clack", shot: "twang", magic: "ink", card: "flick" };
/** 타격 옵션: 넉백 배율, 추가 경직, 묵직한 타격(내려찍기) */
type HitOpts = {
  /** 11/19 퇴근길 등불의 넋불 (이 타격으로 쓰러져도 넋불이 또 튀지 않는다) */
  noBurst?: boolean;
  kb?: number;
  stun?: number;
  heavy?: boolean;
  /** 기본 공격 (불씨 옮기기 패시브가 터질 수 있다) */
  basic?: boolean;
  /** 스킬 피해 (갈래): 큰 숫자·갈래 색 충격·찌그러짐 */
  skill?: BranchId;
  /** 광역 스킬 (재의 심장 패시브) */
  aoe?: boolean;
  /** 맞은 적 둔화 ms */
  slowMs?: number;
  /** 연출 무게 0~4 (skillMoves.SKILL_LOOK): 히트스톱·찌그러짐 */
  weight?: number;
  /** 연타 묶음 (끝나면 "N HIT 합계") */
  group?: DmgGroup | null;
  /** 11/19 천 번째 삽질로 한 번 더 맞은 타격 (또 겹치지 않게) */
  again?: boolean;
  /** 11/19 어느 스킬의 타격인가 (연계 보너스 — lib/rpg/skillTree SYNERGY) */
  sid?: SkillId;
};

/** 바닥에 남는 스킬 (화톳불·서리밭·눈보라): 일정 간격으로 둘레를 친다. follow면 나를 따라온다 */
type Field = {
  kind: "brazier" | "field";
  branch: BranchId;
  x: number;
  y: number;
  r: number;
  until: number;
  next: number;
  every: number;
  mult: number;
  vuln: number;
  follow: boolean;
  gfx: Phaser.GameObjects.Graphics;
  prop?: Phaser.GameObjects.Image;
  /** 바닥 무늬 (서리 금 등) */
  deco?: Phaser.GameObjects.Image;
  /** 연타 묶음 (조용해지면 합계를 띄우고 새로 연다) */
  group: DmgGroup | null;
  skill?: SkillId;
};

/** 누가 어떤 패턴으로 쳤나 (상태 이상 굴림용) */
type HitSrc = { id: MonsterId; pat?: PatternId };
type Shot = { x: number; y: number; vx: number; vy: number; dmg: number; until: number; sprite: Phaser.GameObjects.Image; src?: HitSrc };
type Obstacle = { x: number; y: number; r: number };

export class HuntScene extends RpgScene {
  private plan: HuntWave[] = [];
  private mons: Mon[] = [];
  private shots: Shot[] = [];
  private obstacles: Obstacle[] = [];
  /** 40번 사냥터 지도 (장애물·지형 기믹·길찾기) */
  private arena!: ArenaLike;
  // ── 11/20 회장님 독대 (play.chairman) ──
  private chair: ChairmanFight | null = null;
  private chairBoss: Mon | null = null;
  /** 지옥 봉인된 스킬 (칸·패시브 모두) */
  private sealed = new Set<string>();
  /** 결과까지 나왔다 (이제 나가기만 남음) */
  private chairDone = false;
  private chairHudN = 0;
  /** 11/21 회장님 독대 폰 HUD(시안 B): 체력·SP를 내 이름 아래에 그린다 */
  /** 11/21 폰 HUD 시안 B (체력·SP는 이름 아래) — 회장님 독대, 11/22 사냥터·야근 빌딩 폰도 (RunHud와 같은 기준: 폭 ≤560 또는 높이 ≤520) */
  private chairSlim = false;
  private chairBars: Phaser.GameObjects.Graphics | null = null;
  private zone!: ZoneDef;
  private nextWave = 0;
  private lastWaveAt = 0;
  private waveAlive: number[] = [];
  private kills: Partial<Record<MonsterId, number>> = {};
  private killCount = 0;
  private potionsUsed: Record<string, number> = {};
  /** 11/18 판 기록 (서버 관리자 확인 근거 — 판정에는 쓰지 않는다): 층마다 깬 시각 · 넣은 피해 합 · 스킬마다 쓴 횟수 */
  private logFt: number[] = [];
  private logDmg = 0;
  private logSk: Record<string, number> = {};
  private potionReadyAt = 0;
  private skillReady: Partial<Record<SkillId, number>> = {};
  private buffs = new Map<string, { until: number; v: number }>();
  private died = false;
  private cookieUsed = false;
  /** 11/17 쓰러졌다 일어나는 연출 중 (게임 시간이 흐르지 않는다 — 몬스터·판 시간·층 제한 시간이 멈추고 입력도 받지 않는다) */
  private down: DownCut | null = null;
  /** 11/15 번아웃 저주 (번아웃이 아니면 모두 그대로) */
  private curse: CurseFx = NO_CURSE;
  private victoryAt = 0;
  /** 11/15 야근 빌딩: 지금 층 · 층이 시작된 시각 · 깬 층 수 · 마지막 층을 깬 시각 · 엘리베이터 중 · 오늘 남은 상자 · 그만두고 나옴 */
  private floor = 0;
  private floorAt = 0;
  private floorsCleared = 0;
  private floorMs = 0;
  private lift = false;
  /** 11/15 엘리베이터 연출 (야근 빌딩만) · 층 테마 실행부 (없으면 null) */
  private liftCut: ElevatorCut | null = null;
  /** 11/15 그 판에서 처음 나온 몬스터 알림 카드 · 이미 본 몬스터 */
  private intro: MonsterIntro | null = null;
  private seenMons = new Set<MonsterId>();
  private theme: TowerThemeRuntime | null = null;
  /** 11/17 이 판의 맵 컨셉 (겉모습만 — 사냥터·빌딩 그림) */
  private concept: MapConcept = "default";
  private chestsLeft = 0;
  /** 11/15 세트 장비: 싸움 효과 · 상자 천장(세트 장비 없이 연 상자 수 — 서버와 같은 값에서 센다) · 손에 든 무기 */
  private sg = new SetGearRun({});
  private sgPity = 0;
  /** 11/19 숨겨진 5세트 효과 (판 하나) · 그 그림 · 칼퇴 본능 이동 배율 */
  private egg = new SetEggRun({});
  private eggFx: SetEggFx | null = null;
  private eggMove = 1;
  /**
   * 11/18 드롭 시드 (서버 비밀값 — 판 시작 응답에 없다). 첫 우두머리가 나올 수 있는 시각(dropRevealMs) 뒤에 한 번 받는다.
   * 없으면 바닥 드롭·상자 안 연출만 빠진다 (보상은 결과 화면에 그대로)
   */
  private dropSeed: number | null = null;
  private revealAt = Infinity;
  private revealAsked = false;
  private held: HeldWeapon | null = null;
  private selfLight: SelfLight | null = null;
  /** 11/15 우두머리 상자 (그 층에서만) */
  private bossChest: BossChest | null = null;
  private quit = false;
  /** 11/15 능력 카드 (야근 빌딩만) · 카드를 얹기 전 능력치·공격 범위 */
  private cards: CardRun<Mon> | null = null;
  private dvBase!: Derived;
  private areaBase: AttackArea = attackArea({});
  private arenaHooks!: ArenaHooks;
  private message: string | undefined;
  private messageUntil = 0;

  // 플레이어
  private px = W / 2;
  private py = H / 2;
  private hpV = 1;
  /**
   * 11/20 회장님 독대: 회복이 줄고(curse.healMul — 11/21 50%) 초당 최대 HP의 일정 비율(CHAIR_HEAL_CAP_PER_SEC — 11/21 3%)까지만 찬다 (흡혈·재생·스킬 회복 — 물약은 healFree로 그대로).
   * HP를 올리는 곳이 많아(흡혈·재생·스킬·옵션) 한 곳(setter)에서 막는다. 쓰러진 뒤(0 이하)에서 오르는 것(연차)은 막지 않는다
   */
  private chairHealOn = false;
  private chairHealTok = 0;
  private healFree = false;
  private get hp(): number {
    return this.hpV;
  }
  private set hp(v: number) {
    if (this.chairHealOn && !this.healFree && v > this.hpV && this.hpV > 0) {
      const add = Math.min(v - this.hpV, Math.max(0, this.chairHealTok));
      this.chairHealTok -= add;
      v = this.hpV + add;
    }
    this.hpV = v;
  }
  private sp = 1;
  private dirRow: number = DIR_ROW.down;
  private face = { x: 0, y: 1 };
  private atkReadyAt = 0;
  private hurtUntil = 0;
  private rootUntil = 0;
  /** 몬스터가 건 상태 이상 (lib/rpg/status) */
  private status = new StatusBook();
  private statusFxAt = 0;
  private statusFxI = 0;
  /** 맞아서 빨갛게 번쩍이는 동안은 상태 색을 덮어쓰지 않는다 */
  private hurtFlashUntil = 0;
  private tintNow = -1;
  private statusIcons = new Map<StatusId, Phaser.GameObjects.Image>();
  private regenAt = 0;
  private player!: Phaser.GameObjects.Sprite;
  /** 월드와 같은 아바타 (이름표·몸 모양·말풍선). 아틀라스가 없으면 null → 단순 스프라이트 */
  private me: AvatarView | null = null;
  /** 함께 사냥: 같은 사냥터·난이도 방 사람들 (전투는 각자, 위치·모습·말풍선만) */
  private presence: RoomPresence | null = null;
  private peers = 0;
  private movingNow = false;
  /** 11/20 회장님 독대만: 달리기 (PC Shift 누르고 있기 · 폰 [달리기] 켜고 끄기) */
  private runTouch = false;
  private runningNow = false;
  private dustAt = 0;
  private pShadow!: Phaser.GameObjects.Image;
  private helper: { sprite: Phaser.GameObjects.Sprite; until: number; nextAtk: number; group?: DmgGroup | null } | null = null;
  /** 스킬 트리 패시브를 더한 능력치 (판마다 create()에서) */
  private dv!: Derived;
  private mods: SkillMods = skillMods({});
  /** 11/19 핵심 스킬의 연계 배율 (판 시작 때 계산) */
  private syn: Partial<Record<SkillId, number>> = {};
  /** 11/19 연계 생존: 대표 빌드를 몰아 찍으면 받는 피해 − (판 시작 때 계산) */
  private synGuard = 0;
  /** 11/19 초월 수련 보정 (물공·마공 따로) */
  private tm: TMods = NO_TMODS;
  /** 11/19 일꾼의 뚝심: 기본 공격 순번 (N번째마다 반드시 치명타) */
  private basicN = 0;
  /** 11/19 자동 막기: 적마다 마지막으로 막은 시각 */
  private parryAt = new WeakMap<object, number>();
  /** 11/19 업무 인수인계 카드: 남은 강화 기본 공격 수 */
  private handoverLeft = 0;
  /** 11/19 삽날 회오리: 켜 있으면 다음 베기 시각·SP를 마지막으로 뺀 시각 */
  private whirl: { lv: number; nextAt: number; at: number; until: number; spin: number } | null = null;
  /** 11/19 봉분 뛰어넘기: 공중 (출발·도착·시작 시각·길이) */
  private leap: { x0: number; y0: number; x1: number; y1: number; at: number; dur: number; lv: number } | null = null;
  /** 스킬 연출 (skillFx.ts) */
  private skfx!: SkillFx;
  /** 스킬별 고유 연출 */
  private mv!: SkillMoves;
  /** 피해 숫자 (큰 도트 + 연타 합계) */
  private dmg!: DamageNumbers;
  private fields: Field[] = [];
  /** 짧은 슬로 (큰 광역기): 이 실시간(performance.now)까지 게임 시간이 느리게 흐른다 */
  private slowMoUntil = 0;
  /** 바람 넋 잔상 다음 시각 */
  private ghostAt = 0;
  /** 망자의 초롱 (포탑 소환) */
  private turret: { sprite: Phaser.GameObjects.Image; until: number; nextAtk: number; atkPct: number; everyMs: number; range: number; group: DmgGroup | null } | null = null;
  /** 서리 방패 보호막 남은 양 (buffs.fr_ward가 끝나면 사라진다) */
  private shield = 0;
  /** 11/12 줄지어 돌격(stream) 웨이브에서 아직 안 나온 몬스터 수 (다 나오기 전엔 웨이브가 끝난 게 아니다) */
  private pendingSpawns = 0;
  /** 11/12 같은 방 다른 사람: 반투명 + "사냥 중" 표시를 붙인 아바타 */
  /** 이름표를 바꿔 단 원격 아바타 → 그때의 자리 비움 여부 */
  private ghosted = new WeakMap<RemoteAvatar, boolean>();
  private walkT = 0;
  /** 쿨다운 중에 새로 누른 공격 (끝나는 순간 한 번 나간다). 누르고 있는 동안은 여기에 넣지 않는다 */
  private atkBuffered = false;
  /** 마우스·손가락·공격 버튼을 누르고 있는 중 (36번 자동 공격) */
  private holdOn = false;
  /** 누르고 있는 화면 좌표 (없으면 지금 방향으로) */
  private holdAim: { x: number; y: number } | null = null;
  /** 11/15 공격 방향 고정: 휘두르는 동안(이 시각까지) 걷는 방향이 바라보는 쪽을 덮어쓰지 않는다 → 물러나며 쳐도 겨냥한 적을 친다 */
  private faceLockUntil = 0;
  /** 11/17 낙법: 마지막 구르기(시작·다시 구를 수 있는 때), 구르는 쪽, 지금까지 굴러 간 비율, 이번 구르기에 "회피"를 띄웠는지 */
  private dodge: Dodge = NO_DODGE;
  private rollVec = { x: 0, y: 1 };
  private rollDone = 1;
  private rollSaid = false;
  private dodgeFx!: DodgeFx;
  /** 11/15 자동 스킬: 설정(칸·전체 스위치·궁극기 SP 남김) · 마지막 자동 시전 · 마지막으로 싸운(치거나 맞은) 시각 */
  private auto: HotAuto = cleanAuto(null, []);
  private autoAt = 0;
  private fightAt = -1e9;
  private area: AttackArea = attackArea({});
  private atkCdMs = 1;
  /** 게이지가 다 찬 순간 반짝임 */
  private gaugeFlashUntil = 0;
  private wasReady = true;
  /** 히트스톱 남은 ms (타격감: 아주 잠깐 멈춘다) */
  private hitstop = 0;
  private packAt = { x: 0, y: 0 };
  private gauge!: Phaser.GameObjects.Graphics;
  // ── 16번 타격감 · 40번 무기 특색 · 2번 몬스터 패턴 ──
  private fx!: CombatFx;
  private tele!: TelegraphLayer;
  private patHost!: PatternHost<Mon>;
  private wstyle: WeaponStyle = weaponStyleOf(undefined);
  /** 연속 공격 단계 (1..FINISHER_EVERY, 마지막이 마무리) */
  private chain = 0;
  private lastAtkAt = -1e9;
  private combo = 0;
  private comboAt = 0;
  private maxCombo = 0;
  private pshots: PShot[] = [];
  /** 게임 시간으로 미루는 일 (휘두르는 동작 뒤 판정 등 — 멈춤·히트스톱 동안은 멈춘다) */
  private laters: { at: number; fn: () => void }[] = [];
  // ── 바닥 드롭 (loot.ts) ──
  private loot!: LootLayer;
  /** 끝난 판의 결과: 드롭을 줍는 동안 더 바뀌지 않게 잡아 둔다 (있으면 판은 끝났고 드롭만 줍는 중) */
  private endSnap: HuntResult | null = null;
  /** 시간 끝·쓰러짐: 몬스터·입력을 멈춘 채 드롭만 날아온다 */
  private over = false;
  /** 이 시각(게임 ms) 전에는 끝내지 않는다 (승리 뒤 1.2초) · 이 시각이 지나면 남은 드롭을 모두 끌어와 끝낸다 */
  private endAt = 0;
  private lootDeadline = 0;
  /** 마지막으로 잡은 몬스터 자리 (드롭이 여기서 튀어 오른다) */
  private lastKill: { x: number; y: number } | null = null;
  /** 우두머리 몫(또는 운영자 시험 드롭)을 우두머리를 잡는 순간 이미 떨궜나 → 판 끝에는 나머지만 */
  private bossDropped = false;

  constructor() {
    super("rpg-hunt");
  }

  create(): void {
    this.setupCommon();
    const play = this.play;
    W = play.chairman ? CHAIR_W : 448;
    H = play.chairman ? CHAIR_H : 288;
    // 11/15 층마다 테마는 판 시드로 정해진다 (lib/rpg/tower towerBlock)
    const zone = play.tower ? towerZone(play.seed, play.tower.start, play.tower.start) : zoneFor(play.difficulty, play.zone);
    this.zone = zone;
    ensureRpgTextures(this);
    // 11/15 사냥 중에는 낀 세트 장비를 입는다 (같은 자리 마을 꾸미기보다 먼저 — game/sprites/setGearWear huntLook)
    const look = huntLook(this.data0.look, play.equip);
    makePlayer(this, this.data0.color, look, this.data0.body);
    this.plan = play.chairman ? [] : play.tower ? towerPlan(play.seed, play.tower.start, play.tower.start) : huntPlan(play.seed, play.difficulty, zone.id);
    this.mons = [];
    this.shots = [];
    this.nextWave = 0;
    this.lastWaveAt = 0;
    this.waveAlive = this.plan.map(() => 0);
    this.kills = {};
    this.killCount = 0;
    this.potionsUsed = {};
    this.logFt = [];
    this.logDmg = 0;
    this.logSk = {};
    this.potionReadyAt = 0;
    this.skillReady = {};
    this.buffs.clear();
    this.died = false;
    this.cookieUsed = false;
    this.down?.destroy();
    this.down = null;
    // 11/20 회장님 독대: 받는 회복 30% (물약은 아래 drink에서 따로 — 그대로)
    this.curse = play.tower ? towerCurseFx(play.tower.start) : play.chairman ? { ...NO_CURSE, healMul: CHAIR_HEAL_MUL } : NO_CURSE;
    this.chairHealOn = false;
    this.floor = play.tower?.start ?? 0;
    this.floorAt = this.floorsCleared = this.floorMs = 0;
    this.lift = this.quit = false;
    this.chestsLeft = play.tower?.chestsLeft ?? 0;
    this.bossChest = null;
    this.victoryAt = 0;
    this.helper = null;
    this.turret = null;
    this.shield = 0;
    this.pendingSpawns = 0;
    this.ghosted = new WeakMap();
    // 스킬 트리 패시브 (공격력·치명타·방어·최대 HP …)는 판 시작 때 한 번 더해 둔다
    this.mods = skillMods(play.skills);
    // 11/19 연계 보너스: 핵심 스킬마다 받침 랭크만큼 (판 시작 때 한 번)
    this.syn = {};
    for (const id of Object.keys(SYNERGY) as SkillId[]) this.syn[id] = synergyMul(id, play.skills);
    // 야근 빌딩에서만 (일반 사냥터·지옥 사냥은 난이도 그대로 — 사용자 결정 11/19. 나중에 레이스 던전이 생기면 거기에도)
    this.synGuard = play.tower ? synergyGuard(play.skills) : 0;
    this.tm = tMods(play.tSkills);
    this.basicN = 0;
    this.handoverLeft = 0;
    this.whirl = null;
    this.leap = null;
    this.sg = new SetGearRun(play.equip);
    this.egg = new SetEggRun(play.equip, play.sgEgg ?? 0);
    this.eggMove = 1;
    this.sgPity = play.tower?.pity ?? 0;
    // 드롭 시드를 따로 받지 않는 판(시험·옛 흐름)은 서버도 판 시드로 굴린다 (lib/rpg/rewards dropTicketOf — 티켓에 드롭 시드가 없을 때)
    this.dropSeed = play.reveal ? null : play.seed;
    this.revealAsked = false;
    // 서버 시간은 게임 시간보다 늘 길다 (멈춘 시간) → 게임 시간으로 이만큼 지난 뒤면 서버도 알려 준다 (여유 1.5초)
    this.revealAt = play.reveal && !play.testDrops?.length && !play.noDrops ? dropRevealMs(play.seed, play.difficulty, play.zone, play.tower?.start) + 1500 : Infinity;
    this.dv = withPassives(play.derived, this.mods, this.tm);
    this.dvBase = this.dv;
    this.fields = [];
    this.slowMoUntil = 0;
    this.ghostAt = 0;
    this.hp = this.dv.maxHp;
    this.sp = this.dv.maxSp;
    this.px = W / 2;
    this.py = H / 2;
    // 판 시간(elapsed) 기준 시각들: 씬 인스턴스는 판마다 재사용되고 elapsed는 0부터 다시 센다.
    // 안 지우면 지난 판 막바지의 등불 기도(rootUntil)가 다음 판의 이동·공격을 그 시각까지 막는다.
    this.rootUntil = 0;
    this.hurtUntil = 0;
    this.status.clear();
    this.statusFxAt = 0;
    this.hurtFlashUntil = 0;
    this.tintNow = -1;
    // 씬을 다시 시작하면 그림은 지워진다 → 장부만 비운다
    this.statusIcons.clear();
    this.regenAt = 0;
    this.messageUntil = 0;
    this.gaugeFlashUntil = 0;
    this.face = { x: 0, y: 1 };
    this.dirRow = DIR_ROW.down;

    // 40번: 사냥터마다 다른 지도 (바닥·벽·소품 충돌·조명·입자·지형 기믹) — game/rpg/arena
    // 11/17 맵 컨셉(겨울·크리스마스)은 판을 시작할 때 한 번 읽는다 (판 도중 바뀌면 다음 판부터)
    this.concept = currentMapConcept();
    this.obstacles = [];
    this.arena = play.chairman
      ? new ChairArena(this, () => this.chair?.covers ?? [])
      : new Arena(this, zone.id, play.tower ? floorSeed(play.seed, this.floor) : play.seed, (this.arenaHooks = {
      hurtPlayer: (dmg) => this.hurtPlayer(dmg),
      healPlayer: (n0) => {
        if (this.died || this.hp >= this.dv.maxHp) return;
        const n = Math.max(1, Math.round(n0 * this.curse.healMul));
        this.hp = Math.min(this.dv.maxHp, this.hp + n);
        this.dmg.heal(this.px, this.py - 20, n);
      },
      hurtMonster: (m, dmg) => this.hurtMonster(m as Mon, dmg, false),
      spawnMinion: (id, x, y, wave) => {
        this.spawn(id, x, y, wave);
        this.mons[this.mons.length - 1].minion = true;
      },
      moveMon: (m, dx, dy) => this.moveMon(m as Mon, dx, dy),
      teleport: (x, y) => {
        this.px = x;
        this.py = y;
      },
      flash: (msg, ms) => this.flash(msg, ms),
      sfx: (name, gain) => this.sfx.play(name, gain),
      shake: (ms, k) => this.fx.shake(ms, k),
      maxHp: () => this.dv.maxHp,
      reduced: this.data0.reduced,
    }), play.tower ? { floor: this.floor, runSeed: play.seed, start: play.tower.start } : undefined, this.concept);
    this.px = this.arena.start.x;
    this.py = this.arena.start.y;

    this.pShadow = this.add.image(this.px, this.py, RTEX.shadow).setDepth(-500);
    const atlas = this.data0.atlas;
    // 착용 오라·전용 오라: 바닥 층은 바닥 효과 바로 아래, 빛 층은 몸 바로 앞 (전투 효과·몬스터 앞쪽·피해 숫자보다 아래).
    // 운영자 오라·안개는 몸 뒤로 보내고 45%만 (사냥 장비 — 세트·상점 갑옷·머리 — 를 가리지 않게. 내 것·다른 사람 것 모두, 마을·집은 그대로)
    this.data.set("cfxDepth", { ground: DEPTH_GROUND - 5, lightOnBody: true, staffSoft: STAFF_SOFT_ALPHA } satisfies CfxDepth);
    if (atlas) {
      this.me = new AvatarView(this, atlas, this.px, this.py, this.data0.color, this.data0.name, true, look, this.data0.body);
      this.player = this.me.sprite;
      const room = `hunt:${play.tower ? "tower" : zone.slug}:${play.difficulty}`;
      this.peers = 0;
      // 11/20 회장님 독대는 혼자 (같은 방 사람 없음)
      this.presence = play.chairman ? null : new RoomPresence(this, {
        atlas,
        room,
        me: this.me,
        // 11/15 다른 사람의 사냥 장비(서버 서명)도 입혀 보이고, 꾸미기를 바꿔도 내 사냥 장비는 그대로
        huntGear: { me: (l) => huntLook(l, play.equip) },
        getPose: () => ({ x: Math.round(this.px), y: Math.round(this.py), state: this.movingNow ? STATE.walk : STATE.idle, dir: this.dirRow as DirId }),
        onStatus: (st) => (this.peers = st.mode === "online" ? st.count : 0),
        // 11/13 같은 사냥터 사람의 공격·스킬 동작 (보여 주기만)
        onHunt: (r, h) => this.remoteHunt(r, h),
      });
      // 11/17 사냥 중 채널 채팅([사냥터] 줄): 내 말은 내 머리 위에, 같은 사냥터 방에 보이는 사람 말은 그 사람 머리 위에 (방 번호가 채널 번호와 달라 이름으로 찾는다)
      const offChat = bridge.on("chat:line", ({ name, text, mine, m, w }) => {
        if (w || m !== "hunt") return;
        if (mine) this.me?.chat(text, this.time.now);
        else for (const r of this.presence?.remotes.values() ?? []) if (r.name === name) r.view.chat(text, performance.now());
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, offChat);
    } else {
      this.me = null;
      this.player = this.add.sprite(this.px, this.py, RTEX.player, avFrame(0, 0)).setOrigin(0.5, 19 / 20);
    }
    // 11/15 손에 든 무기 (강화 +10·+13·+15 빛)
    const wid = play.equip.weapon;
    const wdef = wid ? gearById(wid) : undefined;
    this.held = wdef ? new HeldWeapon(this, wdef.art, enhOfId(wid), RTEX.glow, this.data0.reduced) : null;
    // 11/15 야근 빌딩 분위기 층이 내 캐릭터까지 어둡게 하지 않게 (캐릭터 둘레만 덜 칠한다)
    this.selfLight = play.tower ? new SelfLight(this) : null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.held?.destroy();
      this.held = null;
      this.selfLight?.destroy();
      this.selfLight = null;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.presence?.destroy();
      this.presence = null;
      this.me?.destroy();
      this.me = null;
    });
    this.gauge = this.add.graphics();
    this.atkBuffered = false;
    this.holdOn = false;
    this.holdAim = null;
    this.faceLockUntil = 0;
    this.dodge = NO_DODGE;
    this.rollDone = 1;
    this.rollSaid = false;
    // 11/21 모든 판(사냥터·야근 빌딩·회장님 독대): 자동 되는 칸 전부 자동 + 전체 켬으로 시작. 판 중에 바꾸면 그 판 동안 그대로 (층이 바뀌어도)
    this.auto = startAuto(play.hotbar, cleanAuto(play.hotAuto, play.hotbar));
    this.autoAt = 0;
    this.fightAt = -1e9;
    this.area = attackArea(play.equip);
    this.atkReadyAt = 0;
    this.atkCdMs = 1;
    this.wasReady = true;
    this.hitstop = 0;
    // 16·40·2번: 타격 효과, 무기 방식, 몬스터 경고
    this.fx = new CombatFx(this, this.data0.reduced);
    this.skfx = new SkillFx(this, this.data0.reduced);
    this.mv = new SkillMoves(this, this.skfx);
    this.dmg = new DamageNumbers(this, this.data0.reduced, this.skfx.mobile);
    this.tele = new TelegraphLayer(this);
    this.dodgeFx = new DodgeFx(this, this.data0.reduced);
    this.eggFx = new SetEggFx(this, this.data0.reduced);
    this.patHost = this.makePatternHost();
    this.wstyle = weaponStyleOf(play.equip.weapon ? gearById(play.equip.weapon) : undefined);
    this.chain = 0;
    this.lastAtkAt = -1e9;
    this.combo = this.maxCombo = this.comboAt = 0;
    this.pshots = [];
    this.laters = [];
    this.endSnap = null;
    this.over = false;
    this.endAt = 0;
    this.lootDeadline = 0;
    this.lastKill = null;
    this.bossDropped = false;
    this.loot = new LootLayer(
      this,
      {
        now: () => this.now,
        target: () => ({ x: this.px, y: this.py - 8 }),
        place: (x, y) => {
          const p = this.arena.place(x, y, 4);
          return { x: Phaser.Math.Clamp(p.x, WALL + 8, W - WALL - 8), y: Phaser.Math.Clamp(p.y, WALL + 16, H - WALL - 4) };
        },
        synth: (key, layers) => this.sfx.synth(key, layers),
        shake: (ms, k) => this.fx.shake(ms, k),
        float: (x, y, text, color) => this.floatText(x, y, text, color, 10),
      },
      this.skfx,
      this.data0.reduced,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.loot.destroy();
      this.fx.destroy();
      this.skfx.clear();
      this.tele.destroy();
      this.eggFx?.destroy();
      this.eggFx = null;
    });

    // 11/15 능력 카드 (야근 빌딩): 체크포인트에서 시작하면 첫 층 전에 카드부터 고른다
    this.areaBase = this.area;
    // 11/19 주력 갈래 카드는 제안에 더 자주 (서버가 같은 규칙으로 다시 굴린다 — lib/rpg/cards cardOffer)
    this.cards = play.tower ? new CardRun<Mon>(this.cardHost(), play.seed, play.tower.start, mainBranchOf(play.skills, (id) => skillById(id)?.branch), play.tower.lv0 ?? 0) : null;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cards?.destroy();
      this.cards = null;
      this.down?.destroy();
      this.down = null;
    });

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.applyZoom();
    cam.startFollow(this.player, true, 0.15, 0.15);
    if (!play.chairman)
      this.flash(
      play.tower
        ? `야근 빌딩 ${this.floor}층 · ${zone.name}`
        : `${zone.name} · ${zone.desc}${play.testDrops?.length ? " · 시험 드롭 예약됨" : ""}`,
      2600,
    );
    // 11/15 야근 빌딩: 층 테마 실행부 + 엘리베이터로 들어간다 (로비 → 문 닫힘 → 층 표시가 오르고 → 띵 → 문이 열리며 첫 층)
    this.theme = this.makeTheme();
    this.liftCut?.destroy();
    this.liftCut = null;
    this.intro?.destroy();
    // 11/22 폰 세로(위 HUD 시안 B): 새 몬스터 카드는 위 글자 두세 줄 밑으로
    this.intro = play.tower ? new MonsterIntro(this, RTEX.monster, () => (this.chairSlim && this.cameras.main.height > 520 ? 78 : 30)) : null;
    this.seenMons = new Set();
    if (play.tower?.boost) this.flash("테스트용 무적·공격력 ×20 (슈퍼 계정)", 3000);
    if (play.tower) {
      this.liftCut = new ElevatorCut(this, this.data0.reduced, (ev) => this.sfx.synth(`tw-${ev}`, towerSound(ev)));
      this.lift = true;
      this.rootUntil = Number.MAX_SAFE_INTEGER;
      // 문이 다 열릴 때까지 웨이브는 멈춰 있다 (lift) — 남은 시간 표시는 열리는 때쯤부터
      this.floorAt = this.lastWaveAt = this.now + 2600;
      const f = this.floor;
      this.liftCut.start(this.now, "enter", 0, f, isBossFloor(f), () => undefined, () => this.liftOpened(f));
    }
    // 11/20 회장님 독대
    this.chair?.destroy();
    this.chair = null;
    this.chairBoss = null;
    this.sealed = new Set();
    this.chairDone = false;
    if (play.chairman) this.startChair();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.chair?.destroy();
      this.chair = null;
      this.theme?.destroy();
      this.theme = null;
      this.liftCut?.destroy();
      this.liftCut = null;
      this.intro?.destroy();
      this.intro = null;
    });
  }

  /** 11/15 층 테마 실행부 (야근 빌딩 전용 테마 층만 — 지하 서버실 …) */
  private makeTheme(): TowerThemeRuntime | null {
    this.theme?.destroy();
    const make = this.play.tower ? TOWER_THEME_RUNTIMES[this.zone.id] : undefined;
    return make ? make(this.themeHost(), this.zone.id, floorSeed(this.play.seed, this.floor)) : null;
  }

  /** 테마 실행부가 쓰는 씬 기능 */
  private themeHost(): ThemeHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 게터 안에서 씬을 가리킨다
    const sc = this;
    return {
      scene: this,
      get tele() {
        return sc.tele;
      },
      reduced: this.data0.reduced,
      concept: this.concept,
      now: () => sc.now,
      floor: () => sc.floor,
      visit: () => (sc.play.tower ? towerBlock(sc.play.seed, sc.play.tower.start, sc.floor).visit : 0),
      calm: () => sc.lift || sc.died || !!sc.endSnap,
      player: () => ({ x: sc.px, y: sc.py }),
      mons: () => sc.mons,
      strike: (m, mult) => {
        if (!sc.died) sc.hurtPlayer(damage(m.st.atk, mult, sc.dv.def, Math.random(), false), { id: m.id });
      },
      hurtPct: (pct) => sc.hurtPlayer(Math.max(1, Math.round(sc.dv.maxHp * pct))),
      shoot: (m, a, sp, mult, tex) => sc.shoot(m as Mon, a, sp, Math.max(1, Math.round(m.st.atk * mult)), tex),
      spawn: (id, x, y, wave, minion) => {
        if (sc.endSnap || sc.lift) return null;
        sc.spawn(id, x, y, wave);
        const n = sc.mons[sc.mons.length - 1];
        if (minion) n.minion = true;
        return n;
      },
      kill: (m) => sc.killMonster(m as Mon),
      movePlayer: (dx, dy) => {
        const p = { x: Phaser.Math.Clamp(sc.px + dx, WALL + PLAYER_R, W - WALL - PLAYER_R), y: Phaser.Math.Clamp(sc.py + dy, WALL + PLAYER_R + 8, H - WALL - 2) };
        sc.arena.collide(p, PLAYER_R);
        sc.px = p.x;
        sc.py = p.y;
      },
      moveMon: (m, dx, dy) => sc.moveMon(m as Mon, dx, dy),
      confuse: (ms) => {
        if (sc.status.apply({ id: "confuse", durMs: ms, power: 1 }, sc.now) === "new") sc.ringFx(STATUSES.confuse.color, 18);
      },
      place: (x, y, r) => sc.arena.place(x, y, r),
      layout: () => (sc.arena as Arena).layout,
      flash: (msg, ms) => sc.flash(msg, ms),
      float: (x, y, text, color) => sc.floatText(x, y, text, color, 10),
      sfx: (name, gain) => sc.sfx.play(name, gain),
      synth: (key, layers) => sc.sfx.synth(key, layers),
      shake: (ms, k) => sc.fx.shake(ms, k),
      takeBuff: () => {
        let best: [string, { until: number; v: number }] | null = null;
        for (const e of sc.buffs) if (e[0] !== "invuln" && e[1].until > sc.now && (!best || e[1].until > best[1].until)) best = e;
        if (!best) return null;
        sc.buffs.delete(best[0]);
        return { id: best[0], left: best[1].until - sc.now, v: best[1].v };
      },
      giveBuff: (b) => {
        if (b.left > 0) sc.buffs.set(b.id, { until: sc.now + b.left, v: b.v });
      },
    };
  }

  // ── 카메라 ──

  private applyZoom(): void {
    const cam = this.cameras.main;
    // 11/20 회장님 독대도 사냥·야근 빌딩과 같은 배율로 나를 따라간다 (사용자 「캐릭터가 너무 작아져 긴장감이 없다」 — 예전엔 PC에서 판 전체를 한 화면에)
    const z = Phaser.Math.Clamp(Math.floor(Math.min(cam.width, cam.height) / 220), 2, 4);
    cam.setZoom(z);
    this.skfx?.resetZoom(z);
    const vw = cam.width / z;
    const vh = cam.height / z;
    // 11/21 폰 회장님 독대: 위 체력 판·아래 스킬 칸(반려 시계)이 판 위아래를 가려 내 캐릭터가 스킬 칸 뒤로 숨었다
    //  → 가려지는 만큼 판 위아래로 더 굴러가게 하고, 나를 그 사이 띠 가운데에 둔다 (PC는 0 — 그대로)
    const [pt, pb] = this.play.chairman ? chairCamPad(cam.width, cam.height) : [0, 0];
    // 방 그림은 위·아래로 EXT_T·EXT_B까지 이어 그렸다 — 그보다 더 굴러가면 검은 빈칸이 보인다
    const t = Math.min(pt / z, CHAIR_EXT_T);
    const b = Math.min(pb / z, CHAIR_EXT_B);
    const y0 = -t;
    const h0 = H + t + b;
    cam.setBounds(vw > W ? (W - vw) / 2 : 0, vh > h0 ? y0 + (h0 - vh) / 2 : y0, Math.max(W, vw), Math.max(h0, vh));
    cam.setFollowOffset(0, (t - b) / 2);
    this.chairSlim = this.play.chairman ? pt > 0 || pb > 0 : this.play.game === "hunt" && (cam.width <= 560 || cam.height <= 520);
    // 11/21 폰 HUD B(회장님·빌딩·사냥터): 피해 숫자가 캐릭터·이름을 덮었다 → 작게·비켜서·빨리, 합계는 내 이름 칸을 피해서 (PC 그대로)
    this.dmg?.setCompact(this.chairSlim, () => ({ x: this.px, y: this.py }), () => this.meNameBox(), pt);
  }

  protected onResize(): void {
    this.applyZoom();
  }

  // ── 입력 ──

  // 공격 입력은 두 갈래다 (7번 2연타 원인 정리):
  //  - 누름(키 down·탭·버튼): attack(true) — 쿨다운 중이면 버퍼에 한 번
  //  - 누르고 있음(키·마우스·손가락): step()에서 쿨다운이 끝날 때마다 attack(false) — 버퍼에 넣지 않는다
  // 예전에는 키를 누르고 있는 동안 매 프레임 attack()을 불러 쿨다운 중 버퍼가 켜졌고,
  // 그래서 Space를 한 번 톡 눌러도 쿨다운이 끝나는 순간 한 번 더 나갔다.

  protected onKey(code: string): void {
    // 판이 끝나 드롭만 줍는 중: 걷기만 (결과가 잡혀 있으니 포션·스킬은 막는다). 11/17 부활 연출 중에는 공격·스킬·낙법도 안 받는다
    if (this.endSnap || this.down || this.cards?.picking) return;
    if (code === "Space" || code === "KeyJ") this.attack(true);
    // 11/17 낙법: Z(왼손 — WASD·Space와 같이) · K(오른손 — 방향키·J와 같이). Space는 공격이라 비어 있는 키로
    else if (code === "KeyZ" || code === "KeyK") this.roll();
    // 11/15 숫자 1~5 = 스킬 칸 (Shift+숫자 = 그 칸 자동 켜기·끄기), F = 궁극기 칸, X = 자동 전체 스위치
    else if (/^Digit[1-5]$/.test(code)) {
      const slot = Number(code.slice(5)) - 1;
      // 11/21 회장님 독대는 Shift가 달리기 → 달리며 숫자를 눌러도 스킬을 쓴다 (예전엔 자동이 꺼져 「자동이 풀린다」)
      if (!this.chair && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"))) this.toggleAuto(slot);
      else this.useSkill(slot);
    } else if (code === "KeyF") this.useSkill(ULT_SLOT);
    else if (code === "KeyX") this.toggleAuto("all");
    else if (code === "KeyQ") this.usePotion("p_coffee");
    else if (code === "KeyE") this.usePotion("p_energy");
    else if (code === "KeyR") this.usePotion("p_lunchbox");
  }

  protected onAction(a: RpgAction): void {
    if (this.endSnap || this.down || this.cards?.picking) return;
    if (a.kind === "attack") this.attack(true);
    else if (a.kind === "hold") {
      this.holdOn = a.on;
      this.holdAim = a.on && a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : null;
    } else if (a.kind === "skill") this.useSkill(a.slot);
    else if (a.kind === "auto") this.toggleAuto(a.slot, a.every);
    else if (a.kind === "potion") this.usePotion(a.id);
    else if (a.kind === "dodge") this.roll();
    else if (a.kind === "run") this.runTouch = a.on;
  }

  /** 11/15 칸 자동 켜기·끄기 (slot) / 전체 스위치 ("all" — 칸마다 정한 것은 그대로). 바뀌면 화면(HuntLobby)이 캐릭터에 저장한다 */
  private toggleAuto(slot: number | "all", every = false): void {
    const a = this.auto;
    if (slot === "all" && every) {
      // 11/22 폰 [자동]: 켜면 자동이 되는 스킬 칸 전부(궁극기·이동 스킬·반려된 칸 빼고), 끄면 전부 끈다
      if (a.on) a.on = false;
      else {
        a.ids = startAuto(this.play.hotbar, a).ids.filter((id) => !this.sealed.has(id));
        a.on = a.ids.length > 0;
      }
      this.flash(a.on ? "자동 스킬 전부 켬" : a.ids.length ? "자동 스킬 전부 끔" : "자동으로 쓸 스킬이 없어요", 900);
    } else if (slot === "all") {
      if (!a.ids.length) {
        // 터치는 [자동]을 누른 다음 칸을 눌러 정한다 (HUNT_TOUCH)
        this.flash(isTouchUi() ? "자동 칸이 없어요. 스킬 칸을 길게 눌러 정해요" : "자동 칸이 없어요. 칸을 우클릭하거나 Shift+숫자로 정해요", 1600);
        return;
      }
      a.on = !a.on;
      this.flash(a.on ? "스킬 자동 켬" : "스킬 자동 끔", 900);
    } else {
      const id = this.play.hotbar[slot];
      if (!id) return;
      const why = autoBlock(id);
      if (why || slot >= SKILL_SLOTS) {
        this.flash(why ?? "궁극기는 직접 써요", 1100);
        this.sfx.play("miss", 0.4);
        return;
      }
      const name = skillById(id)?.name ?? "";
      if (a.ids.includes(id)) {
        a.ids = a.ids.filter((x) => x !== id);
        if (!a.ids.length) a.on = false;
        this.flash(`${name} 자동 끔`, 900);
      } else {
        // 칸을 자동으로 정하면 전체 스위치도 켠다 (꺼 둔 채면 정해도 안 도니까)
        a.ids = [...a.ids, id];
        a.on = true;
        this.flash(`${name} 자동 켬`, 900);
      }
    }
    bridge.emit("rpg:auto", { ids: [...a.ids], on: a.on, keepUlt: a.keepUlt });
  }

  /** 11/15 자동 스킬: 자동 칸을 앞에서부터 보고, 쓸 만한 때인 첫 스킬 하나를 쓴다 (손으로 쓰는 useSkill 그대로 — 쿨·침묵·빙결·SP) */
  private autoCast(now: number): void {
    const a = this.auto;
    if (!a.ids.length || this.status.has("silence", now) || this.status.has("freeze", now)) return;
    const reserve = ultReserve(this.play.hotbar[ULT_SLOT], this.play.skills, (id, lv) => this.spCost(id, lv));
    let ctx: AutoCtx | null = null;
    for (let slot = 0; slot < SKILL_SLOTS; slot++) {
      const id = this.play.hotbar[slot];
      if (!id || !a.ids.includes(id)) continue;
      const lv = this.play.skills[id] ?? 0;
      const def = skillById(id);
      if (!def || lv < 1 || (this.skillReady[id] ?? 0) > now) continue;
      if (!autoSpOk(this.sp, this.spCost(id, lv), reserve, a.keepUlt)) continue;
      ctx ??= this.autoCtx(now);
      if (!wantsCast(id, lv, ctx)) continue;
      if (this.useSkill(slot, true)) {
        this.autoAt = now;
        return;
      }
    }
    // 쓸 게 없으면 0.1초 뒤에 다시 본다 (매 프레임 둘러보지 않게)
    this.autoAt = Math.max(this.autoAt, now - AUTO_GAP_MS + 100);
  }

  private autoCtx(now: number): AutoCtx {
    const buffs = new Set([...this.buffs].filter(([, b]) => b.until > now).map(([id]) => id));
    // 서리 방패가 깨졌으면 (버프 시간이 남아도) 꺼진 것으로
    if (this.shield <= 0) buffs.delete("fr_ward");
    return {
      px: this.px,
      py: this.py,
      hp: this.hp,
      maxHp: this.dv.maxHp,
      now,
      lastFightAt: this.fightAt,
      foes: this.mons.filter((m) => m.alive && !m.hidden).map((m) => ({ x: m.x, y: m.y, r: MONSTERS[m.id].size / 2, boss: !!m.boss || MONSTERS[m.id].behavior === "boss" })),
      buffs,
      teleOnMe: this.tele.covers(this.px, this.py, PLAYER_R),
    };
  }

  /** 탭: 그쪽을 바라보고 공격 */
  protected onTap(x: number, y: number): void {
    if (this.endSnap || this.down || this.cards?.picking) return;
    const dx = x - this.px;
    const dy = y - this.py;
    if (Math.hypot(dx, dy) > 2) this.setFace(dx, dy);
    this.attack(true);
  }

  protected setPaused(p: boolean): void {
    super.setPaused(p);
    // 11/15 카드를 고르는 중이면 멈춤 메뉴를 닫아도 계속 멈춰 있다
    if (!p && this.cards?.picking) this.cardHold(true);
    this.holdOn = false;
    this.holdAim = null;
    // 11/13 판을 멈추면 같은 방 사람에게 "자리 비움" (내 아바타가 멈춰 있으니까)
    this.presence?.setAway(this.paused);
  }

  // ── 플레이어 행동 ──

  private get now(): number {
    return this.elapsed;
  }

  /** 11/19 손 빠른 동기 카드: 부른 넋 공격 간격 배율 */
  private soulEvery(): number {
    return this.cards?.stats.soulEvery ?? 1;
  }

  /** 11/19 백귀야행 카드가 켜진 동안 부른 넋 피해 배율 */
  private paradeMul(): number {
    return this.buff("soulParade") ? 1 + PARADE_DMG : 1;
  }

  private buff(id: string): number {
    const b = this.buffs.get(id);
    return b && b.until > this.now ? b.v : 0;
  }

  /** 공격력 (세트 장비 저체력 배율 포함). 11/19 장작 더 넣기·화롯가 온기는 마공 피해에만 — strike가 곱한다 */
  /** 11/21 근력 위력 (일꾼 스킬 피해 배율 — STR) */
  private get workPow(): number {
    return workPowerOf(this.dv.stats.str);
  }

  private atk(): number {
    return this.dv.atk * this.sg.atkMul(this.hp, this.dv.maxHp);
  }

  private setFace(dx: number, dy: number): void {
    const m = Math.hypot(dx, dy) || 1;
    this.face = { x: dx / m, y: dy / m };
    this.dirRow = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR_ROW.left : DIR_ROW.right) : dy < 0 ? DIR_ROW.up : DIR_ROW.down;
  }

  private nearest(range: number): Mon | null {
    let best: Mon | null = null;
    let bd = Infinity;
    for (const m of this.mons) {
      if (!m.alive || m.hidden) continue;
      const d = Math.hypot(m.x - this.px, m.y - this.py) - MONSTERS[m.id].size / 2;
      if (d < range && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** 지금 방향의 공격 범위 안에 있는 몬스터들 */
  private inArea(area: AttackArea = this.area): Mon[] {
    return this.mons.filter((m) => m.alive && !m.hidden && inAttackArea(area, this.face, m.x - this.px, m.y - this.py, MONSTERS[m.id].size / 2));
  }

  /**
   * press: 새로 누름 (쿨다운 중이면 버퍼에 한 번). false면 누르고 있는 동안의 자동 공격.
   * 40번: 무기 방식(wstyle)마다 다르게 친다 — 근접은 부채꼴(연타는 여러 번), 쏘기·던지기는 투사체, 마법은 목표 지점 폭발.
   * 간격 안에 이어 치면 1→2→3, 세 번째는 마무리(FINISHER_EVERY).
   */
  private attack(press: boolean): void {
    if (this.died || this.status.has("freeze", this.now)) return;
    // 11/17 구르는 중에 누른 공격은 버퍼에 (일어나는 순간 나간다)
    if (this.now < this.atkReadyAt || this.now < this.rootUntil || rolling(this.dodge, this.now)) {
      if (press) this.atkBuffered = true;
      return;
    }
    this.atkBuffered = false;
    const st = this.wstyle;
    // 11/15 끝없는 회의실 시계 보는 사람 곁: 공격 간격이 길어진다
    this.atkCdMs = attackCooldownMs(this.dv.aspd * (1 + this.buff("so_swift_aspd") + this.buff("wk_tireless")) * this.sg.aspdMul(this.now) * (this.cards?.focusMul(this.movingNow) ?? 1), st) * (this.theme?.atkCdMul?.() ?? 1);
    this.atkReadyAt = this.now + this.atkCdMs;
    this.wasReady = false;
    this.chain = this.now - this.lastAtkAt <= this.atkCdMs + CHAIN_GRACE_MS ? (this.chain % FINISHER_EVERY) + 1 : 1;
    this.lastAtkAt = this.now;
    const fin = this.chain === FINISHER_EVERY;
    const target = this.aim();
    // 11/15 휘두르는 동안은 걷는 방향이 바라보는 쪽을 덮어쓰지 않는다 (판정이 동작 뒤에 나므로 — 물러나며 쳐도 겨냥한 적을 친다)
    const hits = fin ? (st.finisher.hits ?? st.hits) : st.hits;
    this.faceLockUntil = this.now + (st.projectile ? 120 : st.windupMs + Math.max(0, hits - 1) * st.hitGapMs + 60);
    this.fightAt = this.now;
    this.swing(1);
    // 11/13 같은 사냥터 사람에게 공격 동작 (혼자면 안 보낸다)
    this.presence?.hunt({ k: "atk", a: Math.round((Math.atan2(this.face.y, this.face.x) * 180) / Math.PI), w: st.id, ...(fin ? { f: true as const } : {}) });
    if (st.projectile) this.fire(fin);
    else if (st.blast) this.castInk(fin, target);
    else this.melee(fin);
    // 11/15 능력 카드: 방향·갈래·참조 추가 (근접·마법 — 원거리는 fire가 카드로 쏜다)
    this.cards?.afterAttack(fin, target);
  }

  /**
   * 겨냥: 근접은 앞에 아무도 없으면 범위 안 가장 가까운 쪽으로 돌아선다.
   * 원거리·마법은 사거리 안 (바라보는 쪽 각도 안을 먼저) 가장 가까운 적 쪽으로 돈다. 그 적을 돌려준다
   */
  private aim(): Mon | null {
    const st = this.wstyle;
    const a = this.area;
    if (!st.projectile && !st.blast) {
      if (this.inArea().length) return null;
      const t = this.nearest(a.range);
      if (t) this.setFace(t.x - this.px, t.y - this.py);
      return t;
    }
    const cone = this.inArea().sort((p, q) => Math.hypot(p.x - this.px, p.y - this.py) - Math.hypot(q.x - this.px, q.y - this.py))[0];
    const t = cone ?? this.nearest(a.range);
    if (t) this.setFace(t.x - this.px, t.y - this.py);
    return t ?? null;
  }

  /** 근접: (휘두르는 동작 뒤) 부채꼴 안을 모두. 연타는 여러 번, 내려찍기 마무리는 사방 충격파 */
  private melee(fin: boolean): void {
    const st = this.wstyle;
    const area0 = fin && (st.finisher.range || st.finisher.arcDeg) ? { range: st.finisher.range ?? this.area.range, arcDeg: st.finisher.arcDeg ?? this.area.arcDeg } : this.area;
    // 11/19 쉬지 않는 손: 닿는 거리 +
    const area = this.buff("wk_tireless") ? { ...area0, range: area0.range * SKILL_FX.wk_tireless(1).rangeMul } : area0;
    const n = fin ? (st.finisher.hits ?? st.hits) : st.hits;
    const mult = st.mult * (fin ? st.finisher.mult : 1);
    const opts: HitOpts = { kb: st.kb, stun: st.stunMs, heavy: st.id === "smash", basic: true };
    for (let h = 0; h < n; h++) {
      this.later(st.windupMs + h * st.hitGapMs, () => {
        if (this.died) return;
        if (h > 0) {
          this.fx.motion(st.id, this.px + this.face.x * 4, this.py - 6 + this.face.y * 3, Math.atan2(this.face.y, this.face.x), area.range, fin);
          this.sfx.play(SWING_SFX[st.id], 0.35);
        }
        if (st.id === "smash") {
          const fx = this.px + this.face.x * area.range * 0.6;
          const fy = this.py + this.face.y * area.range * 0.6;
          if (fin && st.finisher.shockwave) {
            const r = st.finisher.shockwave;
            this.fx.shockwave(this.px, this.py, r);
            this.fx.shake(120, 0.004);
            let k = 0;
            for (const m of [...this.mons]) if (m.alive && !m.hidden && Math.hypot(m.x - this.px, m.y - this.py) < r + MONSTERS[m.id].size / 2) this.strike(m, mult, false, k++, opts);
            return;
          }
          this.fx.crack(fx, fy);
        }
        const front = this.inArea(area);
        front.forEach((m, i) => this.strike(m, mult, false, i, opts));
        // 11/19 사방 삽질 (일꾼 1단 패시브): 옆·뒤로도 같이 휘두른다 (앞에서 맞은 적은 빼고)
        if (this.mods.sidePct > 0) this.allRound(area, mult, opts, new Set(front));
      });
    }
  }

  /** 11/19 사방 삽질: 바라보는 쪽에서 ±90°(옆)·180°(뒤) 부채꼴을 약하게 친다. 흙빛 삽날 잔상 */
  private allRound(area: AttackArea, mult: number, opts: HitOpts, skip: Set<Mon>): void {
    const a0 = Math.atan2(this.face.y, this.face.x);
    const sub = { range: area.range * 0.85, arcDeg: Math.min(100, area.arcDeg) };
    let k = skip.size;
    for (const [da, mul] of [
      [Math.PI / 2, this.mods.sidePct],
      [-Math.PI / 2, this.mods.sidePct],
      [Math.PI, this.mods.backPct],
    ] as const) {
      const a = a0 + da;
      const f = { x: Math.cos(a), y: Math.sin(a) };
      if (!this.data0.reduced) this.fx.motion(this.wstyle.id, this.px + f.x * 4, this.py - 6 + f.y * 3, a, sub.range, false)?.setAlpha(0.45).setTint(0xc89a62);
      for (const m of this.mons) {
        if (!m.alive || m.hidden || skip.has(m) || !inAttackArea(sub, f, m.x - this.px, m.y - this.py, MONSTERS[m.id].size / 2)) continue;
        skip.add(m);
        this.strike(m, mult * mul, false, k++, opts);
      }
    }
  }

  /** 쏘기·던지기: 투사체 (마무리는 세 갈래) */
  private fire(fin: boolean): void {
    // 11/15 능력 카드가 있는 판(야근 빌딩)은 카드 쪽이 모두 쏜다 (관통·튕김·벽 튕김·돌려 쓰는 투사체)
    if (this.cards) return this.cards.fire(fin, this.wstyle.mult * (fin ? this.wstyle.finisher.mult : 1));
    const st = this.wstyle;
    const pj = st.projectile!;
    const n = fin ? (st.finisher.spread ?? 1) : 1;
    const base = Math.atan2(this.face.y, this.face.x);
    const mult = st.mult * (fin ? st.finisher.mult : 1);
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * 0.24;
      const x = this.px + Math.cos(ang) * 6;
      const y = this.py - 7 + Math.sin(ang) * 4;
      const card = st.id === "card";
      const sprite = this.add.sprite(x, y, card ? FXT.card : FXT.band, 0).setRotation(ang).setDepth(1e5);
      this.pshots.push({ x, y, vx: Math.cos(ang) * pj.speed, vy: Math.sin(ang) * pj.speed, left: this.area.range, pierce: pj.pierce, mult, hit: new Set(), sprite, spin: card });
    }
  }

  /** 범위 마법: 잉크 방울이 목표 지점으로 날아가 터진다 (둘레를 모두) */
  private castInk(fin: boolean, target: Mon | null): void {
    const st = this.wstyle;
    const r = ((fin ? st.finisher.blast : undefined) ?? st.blast ?? 20) * (this.cards?.blastMul ?? 1);
    const reach = Math.min(this.area.range, target ? Math.hypot(target.x - this.px, target.y - this.py) : this.area.range * 0.55);
    const pt = this.patHost.clampPoint(this.px + this.face.x * reach, this.py + this.face.y * reach);
    const mult = st.mult * (fin ? st.finisher.mult : 1);
    this.fx.castMark(pt.x, pt.y, r, st.windupMs);
    const bolt = this.add.image(this.px, this.py - 8, FXT.inkBolt).setDepth(1e5);
    this.tweens.add({ targets: bolt, x: pt.x, y: pt.y - 4, duration: st.windupMs, ease: "Quad.easeIn", onComplete: () => bolt.destroy() });
    this.later(st.windupMs, () => {
      this.fx.ink(pt.x, pt.y, r);
      if (fin) this.fx.shake(80, 0.003);
      let k = 0;
      for (const m of [...this.mons]) if (m.alive && !m.hidden && Math.hypot(m.x - pt.x, m.y - pt.y) < r + MONSTERS[m.id].size / 2) this.strike(m, mult, false, k++, { kb: st.kb, stun: st.stunMs, basic: true });
    });
  }

  /** 무기 동작 궤적 + 소리 (공격 한 번에 한 번 — 검수 스크립트가 이걸 센다). scale≠1: 스킬(결재판 치기) */
  private swing(scale: number): void {
    const st = this.wstyle;
    const ang = Math.atan2(this.face.y, this.face.x);
    const hx = this.px + this.face.x * 4;
    const hy = this.py - 6 + this.face.y * 3;
    if (scale !== 1) {
      this.fx.motion("smash", hx, hy, ang, 26 * scale, true, 150);
      this.sfx.play("thud", 0.5);
      return;
    }
    const fin = this.chain === FINISHER_EVERY;
    const reach = (fin ? st.finisher.range : undefined) ?? this.area.range;
    this.fx.motion(st.id, hx, hy, ang, reach, fin, (fin ? st.finisher.arcDeg : undefined) ?? this.area.arcDeg);
    this.sfx.play(SWING_SFX[st.id], fin ? 0.55 : 0.4);
    if (fin) this.passiveSnd("em_hearth", 600);
    if (st.id === "thrust") {
      // 찌르기: 앞으로 살짝 내딛는다
      const p = { x: Phaser.Math.Clamp(this.px + this.face.x * 3, WALL + PLAYER_R, W - WALL - PLAYER_R), y: Phaser.Math.Clamp(this.py + this.face.y * 3, WALL + PLAYER_R + 8, H - WALL - 2) };
      for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
      this.arena.collide(p, PLAYER_R);
      this.px = p.x;
      this.py = p.y;
    }
  }

  /** 게임 시간 ms 뒤에 (멈춤·히트스톱 동안은 기다린다) */
  private later(ms: number, fn: () => void): void {
    if (ms <= 0) fn();
    else this.laters.push({ at: this.now + ms, fn });
  }

  /** 내 투사체: 날아가며 처음(또는 관통 수만큼) 닿는 적을 친다 */
  private updatePShots(dt: number): void {
    for (const s of this.pshots) {
      // 따라가는 넋불: 목표를 향해 방향을 조금씩 튼다 (목표가 쓰러지면 가장 가까운 적)
      if (s.home !== undefined) {
        if (!s.home?.alive) s.home = this.nearestTo(s.x, s.y, 140, s.hit);
        const t = s.home;
        if (t) {
          const sp = Math.hypot(s.vx, s.vy);
          const want = Math.atan2(t.y - MONSTERS[t.id].size * 0.45 - s.y, t.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          const turn = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
          const a = cur + Phaser.Math.Clamp(turn, -8 * dt, 8 * dt);
          s.vx = Math.cos(a) * sp;
          s.vy = Math.sin(a) * sp;
          s.sprite.setRotation(a);
        }
      }
      if (s.trail === "wisp") this.mv.wispTrail(s.x, s.y, s.vx, s.vy);
      else if (s.trail === "icicle") this.mv.icicleTrail(s.x, s.y, s.vx, s.vy);
      const step = Math.hypot(s.vx, s.vy) * dt;
      // 11/15 서류 폭풍: 내 탄도 바람에 휩쓸린다 (옥상 돌풍은 테마 실행부가)
      const tw = this.theme?.shotWind?.();
      s.x += (s.vx + this.arena.shotWind(this.now) + (tw?.x ?? 0)) * dt;
      s.y += (s.vy + (tw?.y ?? 0)) * dt;
      s.left -= step;
      s.sprite.setPosition(s.x, s.y);
      if (s.spin) s.sprite.setFrame(Math.floor(this.now / 60) % 2);
      let k = 0;
      for (const m of this.mons) {
        if (!m.alive || m.hidden || s.hit.has(m) || s.left <= 0) continue;
        const size = MONSTERS[m.id].size;
        if (Math.hypot(m.x - s.x, m.y - size * 0.45 - s.y) > size / 2 + 3) continue;
        s.hit.add(m);
        if (s.trail === "wisp") {
          this.mv.wispHit(s.x, s.y);
          this.passiveSnd("so_wisp", 45);
        } else if (s.trail === "icicle") {
          this.mv.icicleHit(s.x, s.y);
          this.passiveSnd("fr_icicle", 45);
        }
        this.strike(m, s.mult, !!s.opts, k++, s.opts ?? { kb: this.wstyle.kb, basic: true });
        if (s.hit.size > s.pierce) s.left = 0;
      }
      for (const o of this.obstacles) if (Math.hypot(o.x - s.x, o.y - 6 - s.y) < o.r) s.left = 0;
      if (s.x < WALL || s.x > W - WALL || s.y < WALL || s.y > H - WALL) s.left = 0;
      if (s.left <= 0) {
        const sp = s.sprite;
        this.tweens.add({ targets: sp, alpha: 0, scale: 0.4, duration: 90, onComplete: () => sp.destroy() });
      }
    }
    this.pshots = this.pshots.filter((s) => s.left > 0);
  }

  /** 명중·치명타 판정 후 피해. nth: 한 번에 여러 마리를 때릴 때 순번 (소리는 첫 마리만, 숫자는 조금씩 엇갈리게) */
  private strike(m: Mon, mult: number, sureHit = false, nth = 0, opts: HitOpts = {}): void {
    const d = this.dv;
    // 11/19 마공(모닥불·서리·넋)·물공(기본 공격·일꾼 스킬). 일꾼 스킬은 기본 공격처럼 명중 판정을 받는다
    const magic = isMagicBranch(opts.skill);
    if (opts.skill === "worker") sureHit = false;
    if (!sureHit && Math.random() > hitChance(d.hit, m.st.flee)) {
      this.fx.miss(m.x, m.y - MONSTERS[m.id].size - 2);
      if (nth === 0) this.sfx.play("miss", 0.45);
      return;
    }
    // 11/19 치명타 확률: 마공은 튀는 불티, 물공은 급소 찌르기(초월). 일꾼의 뚝심: 기본 공격 N번째는 반드시
    // 11/19 일꾼 패시브는 모든 대상에 (첫 대상만 규칙은 실제 게임에서 일꾼 무리 정리를 너무 느리게 만들어 뺐다 — 1~10층 재현)
    const primary = true;
    const sure = !!opts.basic && primary && this.mods.sureCritEvery > 0 && ++this.basicN % this.mods.sureCritEvery === 0;
    const crit = sure || Math.random() * 100 < Math.min(60, d.crit + (magic ? this.mods.crit : this.tm.physCrit));
    if (sure) {
      this.passiveSnd("wk_grit", 200);
      this.mv.gritFlash(m.x, m.y - MONSTERS[m.id].size * 0.6);
    }
    // 약화(넋 사슬·얼음 무덤·서리밭) + 살얼음 패시브(느려지거나 묶인 적)
    const held = m.slowUntil > this.now || m.stunUntil > this.now;
    // 11/19 v2 살얼음은 마공에만 (갈래 패시브는 자기 피해 종류에만)
    const vuln = (m.vulnUntil > this.now ? m.vuln : 0) + (held && magic ? this.mods.vsSlowed : 0);
    // 11/15 능력 카드: 참조 추가만큼 한 번 피해 ↓ · 치명타 피해 ↑ · 원샷 결재
    // 11/15 스킬은 가진 카드 등급만큼 더 세다 (야근 빌딩)
    // 11/19 마공 카드(기획서 다듬기): 마공 스킬·부른 넋 피해 +
    let cm = this.cards ? (opts.basic ? this.cards.hitMul : opts.skill ? this.cards.skillMul * this.cards.branchMul(opts.skill) * (magic ? this.cards.magicMul : 1) : 1) : 1;
    // 11/19 업무 인수인계: 스킬을 쓴 뒤 기본 공격 세 번 (회오리 베기도 기본 공격)
    if (opts.basic && this.handoverLeft > 0 && this.cards) {
      cm *= 1 + this.cards.handover;
      if (nth === 0) this.handoverLeft--;
    }
    // 11/19 마공: 화롯가 온기·장작 더 넣기·깊어진 주문 / 물공: 굳은살·뚝심(기본 공격)·무뎌지지 않는 날 / 모두: 큰 놈 사냥(우두머리)
    // 11/21 근력 위력: 일꾼 한 방 스킬만 STR 몫을 받는다 — 기본 공격·회오리 베기(기본 공격으로 벤다)는 STR이 이미 ATK로 들어가서 뺀다
    const side = magic
      ? (1 + this.mods.atkPct) * (1 + this.buff("em_stoke")) * (1 + this.tm.magicPct)
      : (1 + (opts.basic && primary ? this.mods.basicPct : 0) + this.tm.physPct) * (opts.skill === "worker" && opts.sid !== "wk_whirl" ? this.workPow : 1);
    const isBoss = m.boss || MONSTERS[m.id].behavior === "boss";
    // 11/19 v2 모닥불 광역기는 우두머리에게 덜 아프다 (넓게 태우는 불)
    // 11/19 화톳불은 한자리에서 오래 타는 불이라 우두머리에게도 그대로 (화톳불 진지 = 모닥불의 보스 딜 빌드)
    const bossK = isBoss ? (1 + this.tm.bossPct) * (opts.aoe && opts.skill === "ember" && opts.sid !== "em_brazier" ? EMBER_AOE_BOSS : 1) : 1;
    // 11/19 연계 보너스 (핵심 스킬 ← 받침 랭크)
    const syn = opts.sid ? (this.syn[opts.sid] ?? 1) : 1;
    let dmg = damage(this.atk(), mult * cm * side * bossK * syn * (opts.aoe ? 1 + this.mods.aoePct : 1), m.st.def, Math.random(), crit, vuln);
    // 11/19 깊게 파기: 물공 치명타 피해 +
    if (crit && !magic && primary && this.mods.physCritDmg > 0) dmg = Math.round((dmg * (1.5 + this.mods.physCritDmg)) / 1.5);
    if (crit && this.cards) dmg = Math.round(dmg * this.cards.critMul);
    // 11/15 퇴사 각·성과급
    if (this.cards) dmg = Math.round(dmg * this.cards.dmgMul(m));
    if (this.cards?.oneshot(m, !!opts.aoe)) dmg = Math.max(dmg, Math.ceil(m.hp));
    // 11/19 퇴근길 등불: 넋으로 쓰러뜨렸나 (넋불 자체로 쓰러진 것은 아니다)
    m.soulHit = opts.skill === "soul" && !opts.noBurst;
    this.hurtMonster(m, dmg, crit, nth, opts);
    // 11/19 넋 수당 카드: 넋 스킬·부른 넋 피해의 일부를 HP로 (한 번 최대 HP의 1%)
    const ss = opts.skill === "soul" ? (this.cards?.stats.soulSteal ?? 0) : 0;
    if (ss > 0 && !this.died && this.hp < this.dv.maxHp) {
      const heal = Math.min(this.dv.maxHp * (this.cards?.stats.soulStealCap ?? 0.01), dmg * ss) * this.curse.healMul;
      this.hp = Math.min(this.dv.maxHp, this.hp + heal);
    }
    // 11/19 천 번째 삽질 (초월): 기본 공격이 가끔 한 번 더 맞는다
    if (opts.basic && !opts.again && this.tm.dbl > 0 && Math.random() < this.tm.dbl) this.later(70, () => m.alive && this.strike(m, mult, true, nth + 1, { ...opts, again: true }));
    // 11/19 「때린 적」 카드(불·얼음·독·번개·토스·사내 정치)는 기본 공격에도 스킬에도 붙는다 (광역 스킬·회오리는 맞은 적마다 1/3 — CardRun AOE_PROC)
    if (this.cards && opts.basic) this.cards.onBasicHit(m, !!opts.aoe);
    else if (this.cards && opts.skill) this.cards.onSkillHit(m, !!opts.aoe);
    // 넋 거두기 패시브: 준 피해의 일부를 HP로 (한 번에 최대 HP의 3%까지 — lib/rpg/lifesteal, 11/19 v70 규칙으로 되돌림)
    // 11/19 v2 넋 거두기를 마공에만 했더니 평타 딜러가 회복할 길이 없어 못 깼다 → 다시 모든 공격(기본 공격·일꾼 스킬 포함)에 (사용자)
    const stolen = this.mods.steal > 0 && !this.died && this.hp < d.maxHp ? stealHeal({ dmg, steal: this.mods.steal, maxHp: d.maxHp, missing: d.maxHp - this.hp }) : 0;
    if (stolen > 0) {
      this.hp = Math.min(d.maxHp, this.hp + stolen * this.curse.healMul);
      this.mv.drainWisp({ x: m.x, y: m.y - MONSTERS[m.id].size / 2 }, { x: this.px, y: this.py });
      this.passiveSnd("so_drain", 260);
    }
    // 살얼음 패시브: 묶이거나 느려진 적이 맞으면 금이 쩍 간다
    if (held && this.mods.vsSlowed > 0) {
      this.mv.brittleCrack(m.x, m.y - MONSTERS[m.id].size / 2);
      this.passiveSnd("fr_brittle", 140);
    }
    if (opts.slowMs && m.alive) {
      // 11/19 v2 우두머리 둔화는 1/3 (묶기 hold와 같다)
      m.slowUntil = Math.max(m.slowUntil, this.now + (isBoss ? opts.slowMs / 3 : opts.slowMs));
      m.sprite.setTint(0x9fdcff);
    }
    // 불씨 옮기기 패시브: 기본 공격이 맞으면 가끔 작은 폭발
    if (opts.basic && this.mods.ignite > 0 && Math.random() < this.mods.ignite) {
      const fx = SKILL_FX.em_ignite(1);
      const x = m.x;
      const y = m.y;
      this.later(60, () => {
        this.mv.ignitePop(x, y, fx.radius);
        this.passiveSnd("em_ignite", 60);
        this.aoeAt(x, y, fx.radius, fx.mult * this.dv.skillPower, { skill: "ember", kb: 0.6, weight: 1 });
      });
    }
  }

  /**
   * 16번 타격감: 흰 번쩍임 + 충격 별 + 튀는 숫자(치명타는 크게) + 넉백·경직 + 히트스톱(아주 잠깐 멈춤) + 콤보.
   * 패턴을 쓰는 중인 몬스터(물기 제외)는 밀리지 않는다 (경고가 보인 자리에서 그대로 친다)
   */
  private hurtMonster(m: Mon, dmg: number, crit: boolean, nth = 0, opts: HitOpts = {}): void {
    if (!m.alive) return;
    this.fightAt = this.now;
    // 11/15 야근 빌딩 테마: 받는 피해 배율 (랜섬 자물쇠 사슬에 묶이면 거의 안 다친다)
    if (this.theme?.damageMul) dmg = Math.max(1, Math.round(dmg * this.theme.damageMul(m)));
    // 11/15 테스트 서버 슈퍼 계정 구경: 공격력 ×20
    if (this.play.tower?.boost) dmg *= 20;
    // 11/15 세트 장비: 치명타 피해·우두머리 피해·결재 완료·출장 4세트
    if (this.sg.active) dmg = Math.max(1, Math.round(dmg * this.sg.hitMul(this.now, { crit, boss: !!m.boss || MONSTERS[m.id].behavior === "boss", hpRatio: m.hp / m.st.maxHp, basic: !!opts.basic, magic: isMagicBranch(opts.skill), who: m })));
    // 11/19 숨겨진 5세트 「마일리지 적립」: 가득 차면 기본 공격 한 번 +30%
    if (this.egg.any) dmg = Math.max(1, Math.round(dmg * this.egg.hitMul(this.now, !!opts.basic)));
    // 11/21 화면 합계는 실제로 깎은 체력만 (넘친 피해까지 더해 「한 방 수천만」처럼 보이던 것)
    const dealt = Math.max(0, Math.min(dmg, m.hp));
    this.logDmg += dealt;
    m.hp -= dmg;
    // 11/20 회장님 독대: 넣은 피해가 그 판 기록 (회장님은 쓰러지지 않는다)
    if (m.chair) this.chair?.dealt(dmg);
    const def = MONSTERS[m.id];
    const sk = opts.skill ? PALETTES[opts.skill] : null;
    const w = opts.weight ?? (opts.heavy ? 2 : 0);
    // 큰 도트 숫자: 맞을 때마다 같은 자리 근처에 흩어져 겹쳐 쌓인다 (연타 묶음이면 합계에 더한다)
    this.dmg.hit(m.x, m.y - def.size - 2, dmg, crit, opts.skill ?? "basic", opts.group, m.chair ? dmg : dealt);
    this.fx.impact(m.x + (Math.random() - 0.5) * 4, m.y - def.size * 0.5, crit, opts.heavy || !!sk, sk ? sk.light : 0xffffff);
    if (sk || crit) this.skfx.hitSpark(m.x, m.y - def.size * 0.5, opts.skill ?? "ember", crit, w >= 2);
    // 맞으면 몸이 찌그러졌다 돌아온다 (경직 손맛: 무거운 스킬·치명타일수록 크게)
    if (m.alive && (sk || crit || nth === 0)) {
      const k = sk ? 0.14 + w * 0.05 + (crit ? 0.08 : 0) : crit ? 0.16 : 0.07;
      this.tweens.killTweensOf(m.sprite);
      m.sprite.setScale(1 + k, 1 - k * 0.85);
      this.tweens.add({ targets: m.sprite, scaleX: 1, scaleY: 1, duration: 140 + w * 30, ease: "Back.easeOut" });
    }
    if (nth === 0 || crit) this.sfx.play(crit ? "crit" : "hit", crit ? 0.7 : 0.55);
    // 패시브 발동 소리: 튀는 불티(치명타) · 잿빛 심장(광역 명중)
    if (crit) this.passiveSnd("em_spark", 120);
    if (opts.aoe && nth === 0) this.passiveSnd("em_ashheart", 400);
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(crit ? 100 : 60 + w * 15, () => m.alive && m.sprite.clearTint());
    if (m.cast?.fragile) cancelCast(this.patHost, m);
    const armored = !!m.cast;
    // 넉백: 가벼울수록 멀리 (몸집 기준 무게), 우두머리는 거의 안 밀린다. 경직 동안은 움직이지도 때리지도 못한다
    const k = Math.hypot(m.x - this.px, m.y - this.py) || 1;
    const boss = def.behavior === "boss" || m.boss;
    if (!armored) {
      const weight = boss ? 0.08 : Math.min(1.4, 13 / def.size);
      const power = (crit ? 230 : 150) * weight * (opts.kb ?? 1);
      m.kbx = ((m.x - this.px) / k) * power;
      m.kby = ((m.y - this.py) / k) * power;
      m.stunUntil = this.now + (boss ? 60 : (crit ? 280 : 170) + (opts.stun ?? 0));
    }
    // 11/15: 맞을 때마다 게임 전체를 멈추던 히트스톱(45~85ms)은 뺐다 — 1초에 여러 번 치면 화면 전체가 계속 끊겨 보였다.
    // 타격감은 맞은 몬스터만의 흰 번쩍임·밀려남·경직(stunUntil)과 치명타 흔들림으로 낸다
    if (crit) this.fx.shake(80, 0.003);
    else if (opts.heavy && nth === 0) this.fx.shake(60, 0.002);
    // 11/19 숨겨진 5세트 「도장 쾅」: 치명타에 가끔 빨간 「승인」 도장 + 그 적 0.3초 멈춤 (우두머리는 1/3)
    if (crit && this.egg.any && this.egg.stamp(this.now)) {
      this.eggFx?.stamp(m.x, m.y - def.size * 0.6);
      m.stunUntil = Math.max(m.stunUntil, this.now + (boss ? SG_EGG_FX.stampFreezeMs / 3 : SG_EGG_FX.stampFreezeMs));
    }
    this.combo++;
    this.comboAt = this.now;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (m.hp <= 0) this.killMonster(m);
    else if (m.boss) this.checkBossPhase(m);
  }

  /** 우두머리 단계: HP 문턱을 넘으면 포효하고 새 패턴이 붙는다 */
  private checkBossPhase(m: Mon): void {
    const def = MONSTERS[m.id];
    const idx = bossPhaseIndex(def, m.hp / m.st.maxHp);
    if (idx <= m.phase) return;
    m.phase = idx;
    const ph = bossPhaseList(def)[idx - 1];
    cancelCast(this.patHost, m);
    const before = new Set(m.pats);
    m.pats = monsterPatterns(def, { boss: true, hpRatio: m.hp / m.st.maxHp, difficulty: this.play.difficulty });
    for (const id of m.pats) if (!before.has(id)) m.patReady[id] = this.now + 900;
    m.nextCastAt = this.now + 900;
    m.stunUntil = this.now + 500;
    this.flash(`${def.name} ${ph.label}`, 1800);
    this.sfx.play("roar", 0.8);
    this.fx.bossPhase(m.x, m.y, def.size);
  }

  private killMonster(m: Mon): void {
    // 11/15 무한 재부팅: 처음 쓰러지면 3초 재부팅 (처치로 세지 않는다)
    if (this.theme?.saveFromDeath?.(m)) return;
    m.alive = false;
    this.lastKill = { x: m.x, y: m.y };
    // 우두머리를 잡는 순간 그 자리에 우두머리 몫을 떨군다 (싸움은 계속 — 다가가면 빨려 오고 3초 뒤 날아온다)
    if (m.id === this.zone.boss && !this.bossDropped && !this.endSnap && !this.play.tower) this.dropBossLoot(m.x, m.y);
    this.kills[m.id] = (this.kills[m.id] ?? 0) + 1;
    this.killCount++;
    this.cards?.onKill(m);
    // 11/19 퇴근길 등불 카드: 넋으로 쓰러뜨리면 넋불이 튀어 근처 적 둘을 친다
    const sb = m.soulHit ? (this.cards?.stats.soulBurst ?? 0) : 0;
    if (sb > 0) {
      const near = this.mons
        .filter((o) => o.alive && !o.hidden && o !== m && Math.hypot(o.x - m.x, o.y - m.y) < SOUL_BURST_R)
        .sort((p, q) => Math.hypot(p.x - m.x, p.y - m.y) - Math.hypot(q.x - m.x, q.y - m.y))
        .slice(0, 2);
      const [x, y] = [m.x, m.y - MONSTERS[m.id].size / 2];
      near.forEach((o, k) => {
        this.fx2Bolt(x, y, o, true);
        this.later(80, () => o.alive && this.strike(o, sb * this.dv.skillPower, true, k, { skill: "soul", noBurst: true, kb: 0.6, weight: 1 }));
      });
    }
    // 11/15 전설 옵션 「야근 수당」: 잡을 때마다 체력 1%
    const kh = this.sg.killHeal(this.dv.maxHp);
    if (kh && !this.died && this.hp < this.dv.maxHp) this.hp = Math.min(this.dv.maxHp, this.hp + Math.max(1, Math.round(kh * this.curse.healMul)));
    if (!m.minion && !MONSTERS[m.id].minion) this.waveAlive[m.wave]--;
    this.killFx(m);
    m.bar.destroy();
    m.barBg.destroy();
    m.shadow.destroy();
    playMonsterDeath(this, m.sprite);
    const split = MONSTERS[m.id].split;
    if (split) for (let i = 0; i < split.n; i++) this.spawn(split.id, m.x + (i - (split.n - 1) / 2) * 16, m.y, m.wave);
    this.theme?.killed?.(m);
    // 11/15 야근 빌딩 우두머리: 쓰러진 자리에 상자 (층을 다 깨면 열린다). 11/24 상자 없는 층(TOWER_CHEST_FROM 아래)은 알림 없이 넘긴다 — 하루 상자 한도가 없어서 「오늘 상자는 다 받았어요」는 틀린 말이었다
    if (this.play.tower && m.boss && m.id === this.zone.boss && isBossFloor(this.floor) && !this.bossChest && this.chestsLeft > 0 && isChestFloor(this.floor)) {
      this.bossChest = new BossChest(this, m.x, m.y, this.now, RTEX.glow, this.data0.reduced);
    }
  }

  /** 16번 처치 효과: 파편·고리·동전·경험치 구슬 + 처치 소리 + 짧은 히트스톱 */
  private killFx(m: Mon): void {
    const def = MONSTERS[m.id];
    cancelCast(this.patHost, m);
    this.sfx.play("kill", m.boss ? 0.8 : 0.55);
    // 히트스톱은 우두머리 처치에만 (보통 처치마다 멈추면 끊겨 보인다 — 11/15)
    if (m.boss) this.hitstop = Math.max(this.hitstop, 140);
    m.sprite.setTintFill(0xffffff);
    const big = m.boss || def.behavior === "boss";
    this.fx.killBurst(m.x, m.y, def.color, def.accent, def.size, () => ({ x: this.px, y: this.py }), big ? 8 : m.st.exp >= 15 ? 2 : 1, big ? 6 : 2);
    this.floatText(m.x, m.y - 6, `+${m.st.exp} EXP`, "#9ad07a", 10);
    if (big) this.fx.shake(220, 0.006);
  }

  /** 2번 몬스터 패턴이 쓰는 씬 기능 (monsterPatterns.ts) */
  private makePatternHost(): PatternHost<Mon> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 게터 안에서 씬을 가리킨다
    const sc = this;
    const SFX: Record<string, RpgSound> = { warn: "warn", slam: "slam", shoot: "flick", dash: "swish" };
    return {
      get now() {
        return sc.now;
      },
      get difficulty() {
        return sc.play.difficulty;
      },
      get tele() {
        return sc.tele;
      },
      player: () => ({ x: sc.px, y: sc.py, r: PLAYER_R }),
      size: (m) => MONSTERS[m.id].size,
      // 11/15 야근 빌딩 '연달아 회의' 저주: 몬스터 공격 속도 +20% (쿨타임 ÷1.2)
      haste: (m) => (m.phase > 0 ? (bossPhaseList(MONSTERS[m.id])[m.phase - 1]?.haste ?? 1) : 1) / sc.curse.monAtk,
      boss: (m) => m.boss,
      bite: (m, mult) => sc.monsterAttackRoll(m, mult),
      strikePlayer: (m, mult) => sc.hurtPlayer(damage(m.st.atk, mult, sc.dv.def, Math.random(), false), { id: m.id, pat: m.cast?.id }),
      shoot: (m, angle, speed, mult) => sc.shoot(m, angle, speed, Math.max(1, Math.round(m.st.atk * mult)), m.boss ? RTEX.fire : RTEX.orb),
      moveMon: (m, dx, dy) => sc.moveMon(m, dx, dy),
      explode: (m) => {
        sc.ringFxAt(m.x, m.y, 0xe84040, 30);
        sc.fx.shockwave(m.x, m.y, 30, 0xff6a4a);
        sc.fx.shake(140, 0.006);
        sc.sfx.play("slam", 0.6);
        sc.killMonster(m);
      },
      setHidden: (m, hidden) => {
        m.hidden = hidden;
        sc.tweens.add({ targets: m.sprite, alpha: hidden ? 0.08 : 1, duration: 180 });
      },
      place: (m, x, y) => {
        const c = sc.patHost.clampPoint(x, y);
        m.x = c.x;
        m.y = c.y;
      },
      windupLook: (m, ms, heavy) => {
        m.sprite.setTint(heavy ? 0xff7a5a : 0xffb070);
        sc.tweens.add({
          targets: m.sprite,
          scaleX: heavy ? 1.18 : 1.1,
          scaleY: heavy ? 0.88 : 0.94,
          duration: Math.max(60, ms / 2),
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (!m.alive) return;
            m.sprite.setScale(1);
            if (m.slowUntil < sc.now) m.sprite.clearTint();
          },
        });
      },
      clampPoint: (x, y) => ({ x: Phaser.Math.Clamp(x, WALL + 8, W - WALL - 8), y: Phaser.Math.Clamp(y, WALL + 12, H - WALL - 4) }),
      sfx: (name, gain) => sc.sfx.play(SFX[name] ?? "warn", gain ?? 0.5),
      fx: (kind, x, y, r, angle = 0) => {
        if (kind === "slam" || kind === "rain") {
          sc.fx.crack(x, y, r / 16);
          sc.ringFxAt(x, y + 6, 0xff8a5a, r);
          sc.fx.shake(80, 0.003);
        } else if (kind === "nova") {
          sc.fx.shockwave(x, y, r, 0xff6a4a);
          sc.fx.shake(140, 0.005);
        } else {
          for (let i = 0; i < 14; i++) {
            const a = angle + (Math.random() - 0.5) * 1.2;
            const d = r * (0.4 + Math.random() * 0.6);
            const f = sc.add.image(x, y - 6, RTEX.fire).setDepth(1e5).setScale(0.7);
            sc.tweens.add({ targets: f, x: x + Math.cos(a) * d, y: y - 6 + Math.sin(a) * d, alpha: 0, scale: 1.3, duration: 260 + Math.random() * 160, onComplete: () => f.destroy() });
          }
          sc.fx.shake(120, 0.004);
        }
      },
    };
  }

  /** 11/21 실제 SP 비용 (일꾼 스킬은 INT로 늘어난 SP 칸만큼 비싸고, 등짐 단련 · STR만큼 덜) */
  private spCost(id: SkillId, lv: number): number {
    return skillSpCost(id, lv, this.skillsLive, this.dv.stats);
  }

  /** 스킬 쿨타임 (동지의 맹세 패시브만큼 짧게) */
  private cdOf(id: SkillId): number {
    const def = skillById(id);
    const lv = this.play.skills[id] ?? 1;
    // 11/19 짧아진 숨(초월)은 마공 스킬만
    // 11/19 v2 동지의 맹세 쿨감·짧아진 숨은 마공 스킬만
    const magic = !!def && isMagicBranch(def.branch);
    // 11/19 회의 줄이기(마공 카드): 마공 쿨타임 −
    const parade = def?.branch === "soul" && this.buff("soulParade") ? 1 - PARADE_CD : 1;
    // 11/21 등짐 단련: 일꾼 스킬 쿨타임 − (STR 비례, 마공엔 안 붙는다)
    const pack = def?.branch === "worker" ? 1 - packCdCut(this.skillsLive, this.dv.stats.str) : 1;
    return def ? Math.round(def.cooldownMs(lv) * parade * (magic ? (1 - this.mods.cdCut) * (1 - this.tm.cdCut) * (this.cards?.magicCdMul ?? 1) : (this.cards?.wkCdMul ?? 1) * pack)) : 1;
  }

  /** 칸의 스킬 쓰기. quiet: 자동 시전 (못 쓸 때 알림·소리 없이). 썼으면 true */
  private useSkill(slot: number, quiet = false): boolean {
    const id = this.play.hotbar[slot];
    if (!id) return false;
    // 11/20 회장님 독대 지옥: 반려된(봉인된) 스킬은 못 쓴다
    if (this.sealed.has(id)) {
      if (!quiet) {
        this.flash("반려된 스킬이에요", 900);
        this.sfx.play("miss", 0.4);
      }
      return false;
    }
    const lv = this.play.skills[id] ?? 0;
    const def = skillById(id);
    if (!def || def.kind !== "active" || lv < 1) return false;
    if ((this.skillReady[id] ?? 0) > this.now) return false;
    // 11/17 구르는 중에는 스킬을 쓰지 않는다 (몸 옮기기 스킬과 겹치지 않게 — 자동 스킬은 구른 뒤에 다시 본다)
    if (this.died || this.status.has("freeze", this.now) || rolling(this.dodge, this.now)) return false;
    if (this.status.has("silence", this.now)) {
      if (quiet) return false;
      this.flash("침묵 상태라 스킬을 못 써요", 900);
      this.sfx.play("miss", 0.4);
      return false;
    }
    // 11/19 삽날 회오리: 켜 있으면 다시 눌러 끈다 (SP 없이 — 쿨은 끌 때, 돈 만큼만)
    if (id === "wk_whirl" && this.whirl) {
      this.stopWhirl();
      return true;
    }
    // 공중(봉분 뛰어넘기)에서는 다른 스킬을 쓰지 않는다
    if (this.leap) return false;
    // 11/21 일꾼 스킬은 등짐 단련만큼 덜 든다 (STR 비례)
    const cost = this.spCost(id, lv);
    if (this.sp < cost) {
      if (quiet) return false;
      this.flash("SP가 모자라요", 900);
      this.sfx.play("miss", 0.4);
      return false;
    }
    this.sp -= cost;
    // 11/19 경비 환급(마공 카드): 마공 스킬에 쓴 SP 일부를 돌려받는다
    if (this.cards && this.cards.refund > 0 && isMagicBranch(def.branch)) this.sp = Math.min(this.dv.maxSp, this.sp + cost * this.cards.refund);
    // 11/15 세트 장비: 재사용 시간 옵션·회의 4세트
    // 11/21 일꾼 스킬은 쿨 감소를 다 쌓아도 25%까지 (WK_CD_CUT_MAX)
    this.skillReady[id] = this.now + wkCdFloor(id, this.play.skills[id] ?? 1, Math.round(this.cdOf(id) * this.sg.cdMul()));
    this.passiveSnd("fr_solstice", 2000);
    this.castSkill(id, lv);
    // 11/19 숨겨진 5세트 「회의가 길어진다」
    if (this.egg.any && this.egg.talk(this.now)) this.eggTalk();
    if (this.cards?.handover) this.handoverLeft = 3;
    // 11/19 메아리 주문 (초월): 마공 스킬이 가끔 한 번 더 (절반 세기 — 몸 옮기기·강화·부르기·궁극기는 빼고)
    const look = SKILL_LOOK[id].kind;
    if (this.tm.echo > 0 && isMagicBranch(def.branch) && def.tier < 5 && !["dash", "buff", "summon"].includes(look) && Math.random() < this.tm.echo) {
      this.later(280, () => {
        if (this.died) return;
        const save = this.dv;
        this.dv = { ...save, skillPower: save.skillPower * this.tm.echoMult };
        this.floatText(this.px, this.py - 26, "메아리", "#d6b0ff", 9);
        this.castSkill(id, lv);
        this.dv = save;
      });
    }
    // 11/15 부채꼴 판정(80~90ms 뒤)까지 걷는 방향이 바라보는 쪽을 덮어쓰지 않게
    this.faceLockUntil = Math.max(this.faceLockUntil, this.now + 160);
    // 11/13 같은 사냥터 사람에게 스킬 동작 (이름은 받는 쪽 카탈로그에서)
    this.presence?.hunt({ k: "skill", a: Math.round((Math.atan2(this.face.y, this.face.x) * 180) / Math.PI), s: id });
    return true;
  }

  /** 시전 컷인: 몸 둘레 오라 번쩍 + 아주 짧은 정지(히트스톱). 소리는 스킬마다 castSkill에서 따로 낸다 (skillSound.ts) */
  private cutIn(b: BranchId, big: boolean): void {
    this.skfx.cutIn(this.px, this.py, b, big);
    // 11/15: 스킬마다 멈추던 정지는 뺐다 (자동 스킬과 겹치면 계속 끊겼다). 궁극기만 아래 castUltimate에서 멈춘다
  }

  /** 배운 스킬의 단·랭크 강도 (소리 크기·무게) */
  private skPow(id: SkillId): number {
    const def = skillById(id);
    return def ? skillPower(def.tier, this.play.skills[id] ?? 1, def.maxLevel) : 1;
  }

  /** 배운 패시브·발동 스킬의 소리 (안 배웠으면 조용히). gapMs 안에 또 나면 건너뛴다 */
  private passiveSnd(id: SkillId, gapMs: number, ev: SoundEv = "hit"): void {
    if ((this.play.skills[id] ?? 0) > 0) this.sfx.skill(id, ev, this.skPow(id), {}, gapMs);
  }

  /** 스킬 한 번의 연타 묶음 (끝나면 "N HIT 합계"를 크게 띄운다) */
  private hitGroup(id: SkillId, x: number, y: number, idleMs = 480, minHits = 2): DmgGroup {
    return this.dmg.group(x, y, skillById(id)?.branch ?? "basic", idleMs, minHits);
  }

  /** 스킬 타격 옵션 (갈래·무게·묶음) */
  private sk(id: SkillId, group: DmgGroup | null, more: HitOpts = {}): HitOpts {
    return { skill: skillById(id)?.branch, weight: SKILL_LOOK[id].weight, group, sid: id, ...more };
  }

  /** 큰 광역기의 짧은 슬로 (움직임 줄이기면 안 한다) */
  private slowMo(ms: number): void {
    if (this.data0.reduced) return;
    this.slowMoUntil = Math.max(this.slowMoUntil, performance.now() + ms);
  }

  /** 점 (x,y) 둘레 r 안의 적을 모두 친다 (스킬은 늘 맞는다). 맞힌 수 */
  private aoeAt(x: number, y: number, r: number, mult: number, opts: HitOpts, each?: (m: Mon) => void): number {
    let k = 0;
    for (const m of [...this.mons]) {
      if (!m.alive || m.hidden || Math.hypot(m.x - x, m.y - y) >= r + MONSTERS[m.id].size / 2) continue;
      this.strike(m, mult, true, k++, opts);
      if (m.alive) each?.(m);
    }
    return k;
  }

  /** 바라보는 쪽 부채꼴 안의 적을 모두 친다. 맞힌 수 */
  private coneAt(range: number, arcDeg: number, mult: number, opts: HitOpts): number {
    const hit = this.inArea({ range, arcDeg });
    hit.forEach((m, i) => this.strike(m, mult, true, i, opts));
    return hit.length;
  }

  /** 묶기 (우두머리는 1/3) */
  private hold(m: Mon, ms: number, tint = 0xbfeaff): void {
    const boss = m.boss || MONSTERS[m.id].behavior === "boss";
    m.stunUntil = Math.max(m.stunUntil, this.now + (boss ? ms / 3 : ms));
    m.kbx = m.kby = 0;
    m.slowUntil = Math.max(m.slowUntil, this.now + (boss ? ms / 3 : ms));
    m.sprite.setTint(tint);
  }

  private weaken(m: Mon, vuln: number, ms: number): void {
    if (vuln <= 0) return;
    m.vuln = Math.max(m.vulnUntil > this.now ? m.vuln : 0, vuln);
    m.vulnUntil = Math.max(m.vulnUntil, this.now + ms);
  }

  /** 가장 가까운 적 자리 (없으면 바라보는 쪽 dist) */
  private targetPoint(reach: number, dist = 50): { x: number; y: number } {
    const t = this.nearest(reach);
    if (t) this.setFace(t.x - this.px, t.y - this.py);
    return this.patHost.clampPoint(t ? t.x : this.px + this.face.x * dist, t ? t.y : this.py + this.face.y * dist);
  }

  /** 짧은 넋불이 (x,y)에서 적에게 날아간다 (길동무·초롱) */
  private fx2Bolt(x: number, y: number, t: Mon, pale = false): void {
    this.mv.soulBolt(x, y - 6, t.x, t.y - MONSTERS[t.id].size * 0.5, pale);
  }

  /** 스킬 투사체 (trail: 날아가는 동안 꼬리 연출) */
  private shootSkill(ang: number, speed: number, range: number, pierce: number, mult: number, tex: string, b: BranchId, opts: HitOpts, home?: Mon | null, trail?: PShot["trail"]): void {
    const x = this.px + Math.cos(ang) * 6;
    const y = this.py - 7 + Math.sin(ang) * 4;
    const sprite = this.add.sprite(x, y, tex).setRotation(ang).setDepth(1e5 + 60).setScale(trail === "icicle" ? 0.3 : 1.4);
    // 고드름은 색을 구운 고유 그림 (틴트 없이), 넋불은 갈래 색 빛
    if (trail !== "icicle") sprite.setTint(PALETTES[b].light);
    if (b !== "frost") sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.pshots.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, left: range, pierce, mult, hit: new Set(), sprite, spin: false, opts, trail, ...(home !== undefined ? { home } : {}) });
  }

  /** 지금 화면(카메라에 보이는 영역) 안의 적 (궁극기 판정): 몸이 화면에 조금이라도 걸치면 맞는다. 우두머리 포함 */
  private screenTargets(): Mon[] {
    const v = this.cameras.main.worldView;
    return this.mons.filter((m) => {
      if (!m.alive || m.hidden) return false;
      const s = MONSTERS[m.id].size;
      return inView(v, m.x, m.y - s / 2, s / 2);
    });
  }

  /**
   * 궁극기 공통: 화면 전체 연출(준비 → 기 모으기 → 발사/폭발 → 여파)을 틀고, hitAt 박자마다 지금 화면 안의 적 모두를 친다
   * (다단히트: 박자마다 숫자가 쏟아지고 끝에 합계). beat(i, last, victims)는 박자마다 스킬 고유 연출 + 추가 효과
   */
  private castUltimate(id: SkillId, b: BranchId, f: { hitAt: readonly number[]; castMs: number; mult: number }, opts: HitOpts, beat: (i: number, last: boolean, victims: Mon[]) => void): void {
    const pow = this.dv.skillPower;
    this.cutIn(b, true);
    this.skfx.ultimate(b, { x: this.px, y: this.py }, f.castMs, f.hitAt);
    this.skfx.punch(2, b);
    this.hitstop = Math.max(this.hitstop, 120);
    // 소리: 기 모으기(상승음·심장 박동)가 첫 폭발 박자에 끝나게 (박자는 히트스톱만큼 늦게 온다), 박자마다 폭발·타격
    const k = this.skfx.pw;
    this.sfx.skill(id, "cast", k, { ms: f.hitAt[0] + this.hitstop }, 0);
    const g = this.hitGroup(id, this.px, this.py - 46, 700, 3);
    f.hitAt.forEach((t, i) => {
      this.later(t, () => {
        const last = i === f.hitAt.length - 1;
        const victims = this.screenTargets();
        this.skfx.ultBeat(b, i, last);
        beat(i, last, victims);
        this.sfx.skill(id, "hit", k, { i, last }, 0);
        g.x = this.px;
        g.y = this.py - 46;
        victims.forEach((m, k) => this.strike(m, f.mult * pow, true, k, this.sk(id, g, { aoe: true, kb: last ? 1.4 : 0.35, heavy: last, ...opts })));
        this.skfx.punch(last ? 4 : 2, b);
        if (last) this.slowMo(200);
      });
    });
  }

  /** 스킬 효과 (게임 판정 + 연출). 수치는 lib/rpg/skillTree.ts의 SKILL_FX, 연출은 skillMoves.ts (스킬마다 고유) */
  private castSkill(id: SkillId, lv: number): void {
    if (Object.keys(this.logSk).length < 40 || this.logSk[id]) this.logSk[id] = Math.min(100_000, (this.logSk[id] ?? 0) + 1);
    const pow = this.dv.skillPower;
    const now = this.now;
    const ang = () => Math.atan2(this.face.y, this.face.x);
    const mv = this.mv;
    const fxs = this.skfx;
    // 단·랭크 강도 (1단은 단정하게, 높은 단·랭크일수록 화려하게)
    const def = skillById(id);
    fxs.pw = def ? skillPower(def.tier, lv, def.maxLevel) : 1;
    // 스킬 고유 합성음 (같은 단·랭크 강도)
    const k = fxs.pw;
    const snd = (ev: SoundEv, o?: SoundOpt, gapMs = 0) => this.sfx.skill(id, ev, k, o, gapMs);
    const me = { x: this.px, y: this.py };
    switch (id) {
      // ════ 삽자루 일꾼 (11/19 물공: pow 없이 공격력만, 명중 판정을 받는다) ════
      case "wk_charge": {
        // 돌진: 가까운 적(없으면 바라보는 쪽)으로 미끄러지며 길 위의 적을 밀친다. 그동안 잠깐 무적
        const fx = SKILL_FX.wk_charge(lv);
        const t = this.nearest(fx.reach);
        if (t) this.setFace(t.x - this.px, t.y - this.py);
        this.cutIn("worker", false);
        snd("cast");
        if (fx.invulnMs > 0) this.buffs.set("invuln", { until: now + fx.invulnMs, v: 1 });
        const from = { x: this.px, y: this.py };
        const steps = 6;
        for (let i = 0; i < steps; i++) {
          this.slide((this.face.x * fx.dist) / steps, (this.face.y * fx.dist) / steps);
          this.player.setPosition(Math.round(this.px), Math.round(this.py));
          fxs.ghost(this.player, "worker", 0.55 - i * 0.07, 240 + i * 30);
        }
        const to = { x: this.px, y: this.py };
        fxs.zone({ kind: "band", x0: from.x, y0: from.y, x1: to.x, y1: to.y, w: fx.width }, "worker", 120);
        mv.shovelDash(from, to);
        this.leanBody(this.face.x, 220);
        const g = this.hitGroup(id, (from.x + to.x) / 2, (from.y + to.y) / 2 - 34);
        let k = 0;
        for (const m of [...this.mons]) {
          if (!m.alive || m.hidden) continue;
          if (segDist(m.x, m.y, from.x, from.y, to.x, to.y) < fx.width + MONSTERS[m.id].size / 2) this.strike(m, fx.mult, false, k++, this.sk(id, g, { kb: fx.kb, heavy: true }));
        }
        if (k) {
          snd("hit");
          fxs.punch(2, "worker");
        }
        break;
      }
      case "wk_combo": {
        // 찌르고 퍼 올리기: 앞을 두 번 찌르고(가는 부채꼴) 크게 퍼 올린다 — 마지막에 흙이 튀고 기절
        const fx = SKILL_FX.wk_combo(lv);
        this.aimNearest(fx.range + 10);
        this.cutIn("worker", false);
        snd("cast");
        const g = this.hitGroup(id, this.px + this.face.x * fx.range * 0.6, this.py - 34);
        fx.split.forEach((part, i) => {
          this.later(i * fx.gapMs, () => {
            if (this.died) return;
            const last = i === fx.split.length - 1;
            const a = ang();
            fxs.zone({ kind: "cone", x: this.px, y: this.py, ang: a, range: fx.range, arcDeg: last ? fx.arcDeg : 30 }, "worker", 70);
            this.fx.motion(last ? "smash" : "thrust", this.px + this.face.x * 4, this.py - 6 + this.face.y * 3, a, fx.range, last);
            mv.shovelThrust(this.px, this.py, a, fx.range, last);
            this.leanBody(this.face.x * (last ? 1.4 : 0.6), last ? 200 : 110);
            const hit = this.inArea({ range: fx.range, arcDeg: last ? fx.arcDeg : 40 });
            hit.forEach((m, j) => {
              this.strike(m, fx.mult * part, false, j, this.sk(id, g, { kb: last ? 1.6 : 0.4, heavy: last }));
              if (last && m.alive) this.hold(m, fx.stunMs, 0xe8d2a8);
            });
            if (last && hit.length) fxs.punch(2, "worker");
          });
        });
        break;
      }
      case "wk_leap": {
        // 봉분 뛰어넘기: 가장 몰린 곳으로 높이 뛰어 날아가(공중 무적) 착지하며 둘레를 내려찍는다. 착지 뒤 잠깐 못 움직인다
        const fx = SKILL_FX.wk_leap(lv);
        const to = this.crowdPoint(fx.reach, fx.radius);
        this.setFace(to.x - this.px, to.y - this.py);
        this.cutIn("worker", true);
        snd("cast", { ms: fx.airMs });
        fxs.aimAt(me, to, fx.radius, "worker", fx.airMs);
        mv.leapStart(me, to, fx.radius, fx.airMs);
        // 공중에서는 무적, 착지 뒤 landMs 동안 못 움직인다 (뛰어드는 위험)
        this.buffs.set("invuln", { until: now + fx.airMs, v: 1 });
        this.rootUntil = Math.max(this.rootUntil, now + fx.airMs + fx.landMs);
        this.leap = { x0: this.px, y0: this.py, x1: to.x, y1: to.y, at: now, dur: fx.airMs, lv };
        break;
      }
      case "wk_tireless": {
        const fx = SKILL_FX.wk_tireless(lv);
        this.cutIn("worker", false);
        snd("cast");
        this.buffs.set("wk_tireless", { until: now + fx.durMs, v: fx.aspd });
        mv.tireless(this.px, this.py);
        this.floatText(this.px, this.py - 24, `공격 속도 +${Math.round(fx.aspd * 100)}%`, "#e8d2a8", 10);
        break;
      }
      case "wk_whirl": {
        // 삽날 회오리: 켠다 (끄는 건 useSkill이 다시 누를 때). 공격 속도만큼 둘레를 기본 공격으로 벤다
        // 11/21 SP를 초당 쓰지 않고 정해진 시간(durMs)만 돈다 — 지능·최대 SP와 상관없다
        this.cutIn("worker", false);
        snd("cast");
        const until = now + SKILL_FX.wk_whirl(lv).durMs;
        this.whirl = { lv, nextAt: now, at: now, until, spin: 0 };
        // 위쪽 버프 줄에 「회오리 N초」 (끝나거나 끌 때 지운다)
        this.buffs.set("wk_whirl", { until, v: 1 });
        // 쿨은 끌 때 건다 (켜 있는 동안은 다시 눌러 끌 수 있게)
        this.skillReady[id] = 0;
        break;
      }
      case "wk_allnight": {
        // 밤샘 삽질 (궁극): 적 사이를 여섯 번 연달아 돌진 — 도는 동안 무적, 카메라는 나를 따라간다
        const fx = SKILL_FX.wk_allnight(lv);
        this.cutIn("worker", true);
        snd("cast");
        fxs.screenTint(PALETTES.worker.dark, 0.25, 120, fx.dashes * fx.gapMs, 300);
        mv.allnightCast(this.px, this.py);
        this.slowMo(220);
        const total = 360 + fx.dashes * fx.gapMs + 200;
        // 11/19 무적은 돌진하는 순간만 (뛰어드는 위험을 지게 — 도는 내내 무적이 아니다)
        this.rootUntil = Math.max(this.rootUntil, now + total);
        const g = this.hitGroup(id, this.px, this.py - 40, 900, 2);
        for (let i = 0; i < fx.dashes; i++) {
          this.later(360 + i * fx.gapMs, () => {
            if (this.died) return;
            const t = this.nearest(220);
            this.buffs.set("invuln", { until: this.now + 140, v: 1 });
            const a = t ? Math.atan2(t.y - this.py, t.x - this.px) : ang() + (i % 2 ? 2.4 : -2.4);
            this.setFace(Math.cos(a), Math.sin(a));
            const from = { x: this.px, y: this.py };
            const len = t ? Math.min(fx.len, Math.hypot(t.x - this.px, t.y - this.py) + 30) : fx.len;
            const steps = 6;
            for (let j = 0; j < steps; j++) {
              this.slide((Math.cos(a) * len) / steps, (Math.sin(a) * len) / steps);
              this.player.setPosition(Math.round(this.px), Math.round(this.py));
              fxs.ghost(this.player, "worker", 0.6 - j * 0.08, 260);
            }
            const to = { x: this.px, y: this.py };
            fxs.zone({ kind: "band", x0: from.x, y0: from.y, x1: to.x, y1: to.y, w: fx.width }, "worker", 140);
            snd("hit");
            let k = 0;
            for (const m of [...this.mons]) {
              if (!m.alive || m.hidden) continue;
              if (segDist(m.x, m.y, from.x, from.y, to.x, to.y) < fx.width + MONSTERS[m.id].size / 2) this.strike(m, fx.mult, false, k++, this.sk(id, g, { kb: 1.8, heavy: true, aoe: true }));
            }
            const lastDash = i === fx.dashes - 1;
            mv.shovelDash(from, to);
            mv.allnightBurst(to.x, to.y, lastDash);
            this.leanBody(Math.cos(a), 200);
            this.fx.shake(lastDash ? 260 : 90, lastDash ? 0.009 : 0.004);
            if (lastDash) fxs.punch(4, "worker");
          });
        }
        break;
      }
      // ════ 모닥불지기 ════
      case "em_kindle": {
        // 투사체형: 금빛 다트가 포물선으로 날아가 금빛 불꽃 꽃으로 터진다
        const fx = SKILL_FX.em_kindle(lv);
        const pt = this.targetPoint(fx.reach, 40);
        this.cutIn("ember", false);
        snd("cast");
        fxs.aimAt(me, pt, fx.blast, "ember", 150);
        mv.kindleFly(me, pt, 150);
        const g = this.hitGroup(id, pt.x, pt.y - 30);
        this.later(150, () => {
          mv.kindleHit(pt.x, pt.y, fx.blast + 6);
          snd("hit");
          this.aoeAt(pt.x, pt.y, fx.blast, fx.mult * pow, this.sk(id, g, { kb: 1.2 }));
          fxs.punch(1, "ember");
        });
        break;
      }
      case "em_fan": {
        // 부채형: 진홍 주름 부채가 펼쳐진다 (바닥에 판정 부채꼴 표시)
        const fx = SKILL_FX.em_fan(lv);
        this.aimNearest(fx.range);
        this.cutIn("ember", false);
        fxs.zone({ kind: "cone", x: this.px, y: this.py, ang: ang(), range: fx.range, arcDeg: fx.arcDeg }, "ember", 90);
        mv.fan(this.px, this.py, ang(), fx.range, fx.arcDeg);
        snd("cast");
        const g = this.hitGroup(id, this.px + this.face.x * fx.range * 0.5, this.py - 34);
        this.later(90, () => {
          this.coneAt(fx.range, fx.arcDeg, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 1.4 }));
          fxs.punch(2, "ember");
        });
        break;
      }
      case "em_stoke": {
        const fx = SKILL_FX.em_stoke(lv);
        this.cutIn("ember", true);
        snd("cast");
        mv.stoke(this.px, this.py);
        this.buffs.set("em_stoke", { until: now + fx.durMs, v: fx.atk });
        this.floatText(this.px, this.py - 24, `공격력 +${Math.round(fx.atk * 100)}%`, "#ffd27a", 10);
        break;
      }
      case "em_ring": {
        // 장판형: 불꽃 화환이 판정 원 그대로 타오른다
        const fx = SKILL_FX.em_ring(lv);
        this.cutIn("ember", true);
        snd("cast");
        fxs.zone({ kind: "circle", x: this.px, y: this.py, r: fx.radius }, "ember", 200);
        mv.ringCharge(this.px, this.py, fx.radius, 200);
        const g = this.hitGroup(id, this.px, this.py - 40);
        this.later(200, () => {
          mv.ringBlast(this.px, this.py, fx.radius);
          fxs.accent({ x: this.px, y: this.py }, "ember", "ring-wreath", fx.radius * 0.66, { vr: 1.4, ms: 600 });
          snd("hit");
          this.aoeAt(this.px, this.py, fx.radius, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 1.8, heavy: true }));
          fxs.punch(2, "ember");
        });
        break;
      }
      case "em_meteor": {
        // 낙하형: 용암이 갈라진 장작 유성이 떨어진다 → 용암 왕관 → 갈라진 구덩이
        const fx = SKILL_FX.em_meteor(lv);
        const pt = this.targetPoint(fx.reach);
        this.cutIn("ember", true);
        snd("cast", { ms: fx.delayMs });
        fxs.aimAt(me, pt, fx.radius, "ember", fx.delayMs);
        mv.meteorFall(pt.x, pt.y, fx.radius, fx.delayMs);
        const g = this.hitGroup(id, pt.x, pt.y - 34);
        this.later(fx.delayMs, () => {
          mv.meteorImpact(pt.x, pt.y, fx.radius);
          fxs.accent(pt, "ember", "meteor-splash", fx.radius, { vr: 0, oy: 0.95, ms: 760 });
          snd("hit");
          this.aoeAt(pt.x, pt.y, fx.radius, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 2.2, heavy: true, stun: 200 }));
          fxs.punch(3, "ember");
        });
        break;
      }
      case "em_brazier": {
        const fx = SKILL_FX.em_brazier(lv);
        this.cutIn("ember", false);
        snd("cast");
        const x = this.px + this.face.x * 14;
        const y = this.py + this.face.y * 10;
        fxs.zone({ kind: "circle", x, y, r: fx.radius }, "ember", 260);
        mv.brazierPlace(x, y, fx.radius);
        fxs.accent({ x, y }, "ember", "brazier-coals", fx.radius, { vr: 0.4, ms: 560 });
        this.addField("brazier", "ember", x, y, fx.radius, fx.durMs, fx.everyMs, fx.mult * pow, 0, false, "em_brazier");
        break;
      }
      case "em_bonfire": {
        // 큰 모닥불 (궁극): 화면 전체 — 장작더미에 불이 붙어 불기둥이 터지고, 박자마다 화면 안 적 모두의 발밑에서 불기둥이 솟는다
        const fx = SKILL_FX.em_bonfire(lv);
        this.castUltimate(id, "ember", fx, {}, (i, last, victims) => mv.bonfireHit(victims.map((m) => ({ x: m.x, y: m.y })), i, last));
        break;
      }
      // ════ 서리 묘지기 ════
      case "fr_breath": {
        // 부채형: 민트빛 안개가 판정 부채꼴로 밀려간다
        const fx = SKILL_FX.fr_breath(lv);
        this.aimNearest(fx.range);
        fxs.zone({ kind: "cone", x: this.px, y: this.py, ang: ang(), range: fx.range, arcDeg: fx.arcDeg }, "frost", 80);
        mv.breath(this.px, this.py, ang(), fx.range, fx.arcDeg);
        snd("cast");
        const g = this.hitGroup(id, this.px + this.face.x * fx.range * 0.5, this.py - 34);
        this.later(80, () => {
          this.coneAt(fx.range, fx.arcDeg, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 0.8, slowMs: fx.slowMs }));
          fxs.punch(1, "frost");
        });
        break;
      }
      case "fr_icicle": {
        // 투사체형: 고드름이 날아갈 궤적을 짧게 보이고, 진행 방향 꼬리를 끌며 날아가 깨진다
        const fx = SKILL_FX.fr_icicle(lv);
        this.aimNearest(fx.range);
        fxs.cutIn(this.px, this.py, "frost", false);
        const base = ang();
        const angs = Array.from({ length: fx.n }, (_, i) => base + (i - (fx.n - 1) / 2) * 0.15);
        fxs.aim(this.px, this.py - 7, angs, fx.range, "frost");
        mv.icicleLaunch(this.px, this.py, base);
        const g = this.hitGroup(id, this.px + Math.cos(base) * 50, this.py - 30 + Math.sin(base) * 30, 520);
        for (const a of angs) this.shootSkill(a, 280, fx.range, fx.pierce, fx.mult * pow, art(this, "icicle-lance"), "frost", this.sk(id, g, { kb: 0.9, slowMs: 1200 }), undefined, "icicle");
        snd("cast");
        break;
      }
      case "fr_ward": {
        const fx = SKILL_FX.fr_ward(lv);
        this.cutIn("frost", false);
        snd("cast");
        this.shield = Math.round(this.dv.maxHp * fx.shieldPct * pow);
        this.buffs.set("fr_ward", { until: now + fx.durMs, v: 1 });
        mv.wardForm(this.px, this.py);
        this.floatText(this.px, this.py - 24, `얼음 방패 ${this.shield}`, "#bfeaff", 10);
        break;
      }
      case "fr_nova": {
        // 장판형: 판정 원 그대로 거대한 여섯 갈래 눈송이가 핀다
        const fx = SKILL_FX.fr_nova(lv);
        this.cutIn("frost", true);
        snd("cast");
        fxs.zone({ kind: "circle", x: this.px, y: this.py, r: fx.radius }, "frost", 180);
        mv.novaCharge(this.px, this.py, fx.radius, 180);
        const g = this.hitGroup(id, this.px, this.py - 40);
        this.later(180, () => {
          mv.novaBloom(this.px, this.py, fx.radius);
          fxs.accent({ x: this.px, y: this.py }, "frost", "nova-flake", fx.radius, { vr: 0.8, ms: 640 });
          snd("hit");
          this.aoeAt(this.px, this.py, fx.radius, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 0.6 }), (m) => {
            this.hold(m, fx.freezeMs);
            mv.freezeOn(m.x, m.y, MONSTERS[m.id].size);
          });
          fxs.punch(2, "frost");
        });
        break;
      }
      case "fr_mist": {
        // 돌진형: 은빛 안개 띠를 남기며 미끄러지고, 지나친 적에게 X자 베기 (그동안 무적). 바닥에 판정 띠 표시
        const fx = SKILL_FX.fr_mist(lv);
        const from = { x: this.px, y: this.py };
        this.buffs.set("invuln", { until: now + 300, v: 1 });
        const steps = 6;
        for (let i = 0; i < steps; i++) {
          this.slide((this.face.x * fx.dist) / steps, (this.face.y * fx.dist) / steps);
          this.player.setPosition(Math.round(this.px), Math.round(this.py));
          fxs.ghost(this.player, "frost", 0.6 - i * 0.07, 280 + i * 40, i % 2 ? 0xffffff : 0xc8d4e4);
        }
        const to = { x: this.px, y: this.py };
        fxs.zone({ kind: "band", x0: from.x, y0: from.y, x1: to.x, y1: to.y, w: fx.width }, "frost", 120);
        fxs.aim(from.x, from.y, [Math.atan2(to.y - from.y, to.x - from.x)], Math.max(12, Math.hypot(to.x - from.x, to.y - from.y)), "frost", 260);
        mv.mistDash(from, to);
        snd("cast");
        const g = this.hitGroup(id, (from.x + to.x) / 2, (from.y + to.y) / 2 - 34);
        const a = Math.atan2(to.y - from.y, to.x - from.x);
        let k = 0;
        for (const m of [...this.mons]) {
          if (!m.alive || m.hidden) continue;
          if (segDist(m.x, m.y, from.x, from.y, to.x, to.y) < fx.width + MONSTERS[m.id].size / 2) {
            mv.slashMark(m.x, m.y - MONSTERS[m.id].size * 0.5, a);
            this.strike(m, fx.mult * pow, true, k++, this.sk(id, g, { kb: 1.4, slowMs: fx.slowMs }));
          }
        }
        if (k) fxs.punch(1, "frost");
        break;
      }
      case "fr_tomb": {
        // 낙하형: 청록 얼음 덩이가 쏟아진 뒤 얼음 비석 무리가 솟아 깨지고 묶는다
        const fx = SKILL_FX.fr_tomb(lv);
        const pt = this.targetPoint(fx.reach);
        this.cutIn("frost", true);
        snd("cast", { ms: fx.delayMs });
        fxs.aimAt(me, pt, fx.radius, "frost", fx.delayMs);
        mv.tombRain(pt.x, pt.y, fx.radius, fx.delayMs);
        const g = this.hitGroup(id, pt.x, pt.y - 40);
        this.later(fx.delayMs, () => {
          mv.tombRise(pt.x, pt.y, fx.radius);
          fxs.accent(pt, "frost", "tomb-slab", fx.radius * 0.9, { vr: 0, oy: 0.95, ms: 720 });
          snd("hit");
          this.aoeAt(pt.x, pt.y, fx.radius, fx.mult * pow, this.sk(id, g, { aoe: true, kb: 0.4, heavy: true }), (m) => {
            this.hold(m, fx.stunMs);
            this.weaken(m, fx.vuln, fx.vulnMs);
          });
          fxs.punch(3, "frost");
        });
        break;
      }
      case "fr_field": {
        // 장판형: 판정 원 그대로 서리 고사리 무늬가 번진다
        const fx = SKILL_FX.fr_field(lv);
        this.cutIn("frost", false);
        snd("cast");
        fxs.zone({ kind: "circle", x: this.px, y: this.py, r: fx.radius }, "frost", 300);
        this.addField("field", "frost", this.px, this.py, fx.radius, fx.durMs, fx.everyMs, fx.mult * pow, fx.vuln, false, undefined, id);
        fxs.accent({ x: this.px, y: this.py }, "frost", "field-ferns", fx.radius, { vr: 0.3, ms: 620 });
        break;
      }
      case "fr_blizzard": {
        // 한겨울 눈보라 (궁극): 화면 전체 — 만다라가 모이고, 박자마다 눈보라 돌풍이 가로지르며 화면 안 적 모두의 발밑에서 얼음 첨탑이 솟는다 (둔화)
        const fx = SKILL_FX.fr_blizzard(lv);
        this.castUltimate(id, "frost", fx, { slowMs: fx.slowMs }, (i, last, victims) => mv.blizzardHit(victims.map((m) => ({ x: m.x, y: m.y })), i, last));
        break;
      }
      // ════ 넋 인도자 ════
      case "so_wisp": {
        // 투사체형: 청록 넋불이 적을 쫓아간다 (나가는 방향을 짧게 보인다)
        const fx = SKILL_FX.so_wisp(lv);
        const targets = this.mons.filter((m) => m.alive && !m.hidden && Math.hypot(m.x - this.px, m.y - this.py) < fx.range).sort((p, q) => Math.hypot(p.x - this.px, p.y - this.py) - Math.hypot(q.x - this.px, q.y - this.py));
        fxs.cutIn(this.px, this.py, "soul", false);
        mv.wispCast(this.px, this.py);
        const g = this.hitGroup(id, this.px, this.py - 40, 700);
        const angs: number[] = [];
        for (let i = 0; i < fx.n; i++) {
          const t = targets[i % Math.max(1, targets.length)] ?? null;
          const a = ang() + (i - (fx.n - 1) / 2) * 0.9;
          angs.push(t ? Math.atan2(t.y - this.py, t.x - this.px) : a);
          this.shootSkill(a, 170, fx.range + 60, 0, fx.mult * pow, SKT.wisp, "soul", this.sk(id, g, { kb: 0.8 }), t, "wisp");
        }
        fxs.aim(this.px, this.py - 6, angs, Math.min(fx.range, 70), "soul", 280);
        snd("cast");
        break;
      }
      case "so_lamp": {
        const fx = SKILL_FX.so_lamp(lv);
        const heal = Math.round((this.dv.maxHp * fx.healPct * pow + this.dv.stats.int * 3) * soulFocus(this.skillsLive) * this.curse.healMul);
        this.hp = Math.min(this.dv.maxHp, this.hp + heal);
        this.rootUntil = now + fx.rootMs;
        this.cutIn("soul", false);
        snd("cast");
        mv.lamp(this.px, this.py);
        this.dmg.heal(this.px, this.py - 26, heal, true);
        break;
      }
      case "so_swift": {
        const fx = SKILL_FX.so_swift(lv);
        this.cutIn("soul", false);
        snd("cast");
        mv.swift(this.px, this.py);
        // 11/19 v3 넋에 쓴 포인트만큼 (섞어 찍기는 약하게)
        const k = soulFocus(this.skillsLive);
        this.buffs.set("so_swift", { until: now + fx.durMs, v: fx.move * k });
        this.buffs.set("so_swift_aspd", { until: now + fx.durMs, v: fx.aspd * k });
        this.floatText(this.px, this.py - 24, "바람 넋", "#9ff0dc", 10);
        break;
      }
      case "so_friend": {
        // 소환형: 새김 글자가 빛나는 묘비가 솟고 길동무가 나온다
        const fx = SKILL_FX.so_friend(lv);
        const dur = fx.durMs * (1 + this.mods.summonDurPct);
        this.helper?.sprite.destroy();
        this.helper = { sprite: this.add.sprite(this.px - 14, this.py, RTEX.helper, 0).setAlpha(0).setTint(0xe8e4f8), until: now + dur, nextAtk: now + 400 };
        this.tweens.add({ targets: this.helper.sprite, alpha: 0.9, delay: 220, duration: 260 });
        this.buffs.set("so_friend", { until: now + dur, v: fx.atkPct });
        this.cutIn("soul", false);
        snd("cast");
        mv.friend(this.px - 14, this.py);
        break;
      }
      case "so_chain": {
        // 연쇄형: 보랏빛 쇠사슬이 적에서 적으로 이어지고, 끌어모은 자리에 봉인 고리가 찍힌다 (판정 원 표시)
        const fx0 = SKILL_FX.so_chain(lv);
        // 11/19 끌려가는 결재 카드: 범위·약화 +
        const fx = { ...fx0, radius: fx0.radius * (this.cards?.stats.soulRange ?? 1), vuln: fx0.vuln + (this.cards?.stats.soulVuln ?? 0) };
        const cx = this.px + this.face.x * 16;
        const cy = this.py + this.face.y * 16;
        this.cutIn("soul", true);
        fxs.zone({ kind: "circle", x: this.px, y: this.py, r: fx.radius }, "soul", 160);
        const g = this.hitGroup(id, cx, cy - 36);
        const caught = this.mons
          .filter((m) => m.alive && !m.hidden && Math.hypot(m.x - this.px, m.y - this.py) <= fx.radius)
          .sort((p, q) => Math.hypot(p.x - this.px, p.y - this.py) - Math.hypot(q.x - this.px, q.y - this.py));
        mv.chain(
          { x: this.px, y: this.py },
          caught.map((m) => ({ x: m.x, y: m.y - MONSTERS[m.id].size / 2 })),
          { x: cx, y: cy },
        );
        fxs.accent({ x: cx, y: cy }, "soul", "chain-seal", 34, { vr: 1.2, ms: 620 });
        let k = 0;
        for (const m of caught) {
          const boss = m.boss || MONSTERS[m.id].behavior === "boss";
          const pull = boss ? 0.15 : 0.8;
          this.moveMon(m, (cx - m.x) * pull, (cy - m.y) * pull);
          this.hold(m, fx.stunMs, 0xd8c0ff);
          this.weaken(m, fx.vuln, fx.stunMs + fx.vulnMs);
          this.strike(m, fx.mult * pow, true, k++, this.sk(id, g, { aoe: true, kb: 0 }));
        }
        fxs.punch(2, "soul");
        snd("cast", { n: Math.max(1, caught.length) });
        break;
      }
      case "so_veil": {
        // 돌진형(순간이동): 검보라 장막에 덮여 사라지고, 장막이 걷히며 나타난다 (가는 방향 표시)
        const fx = SKILL_FX.so_veil(lv);
        const t = this.nearest(400);
        const dx = t ? this.px - t.x : -this.face.x;
        const dy = t ? this.py - t.y : -this.face.y;
        const k = Math.hypot(dx, dy) || 1;
        const from = { x: this.px, y: this.py };
        fxs.ghost(this.player, "soul", 0.7, 420, 0x4a2a8a);
        mv.veilOut(from.x, from.y);
        this.slide((dx / k) * fx.dist, (dy / k) * fx.dist);
        fxs.aim(from.x, from.y, [Math.atan2(this.py - from.y, this.px - from.x)], Math.max(12, Math.hypot(this.px - from.x, this.py - from.y)), "soul", 300);
        mv.veilIn(this.px, this.py);
        this.buffs.set("invuln", { until: now + fx.safeMs, v: 1 });
        fxs.cutIn(this.px, this.py, "soul", false);
        snd("cast");
        this.floatText(this.px, this.py - 22, "저승 너울", "#d8c0ff", 10);
        break;
      }
      case "so_harvest": {
        // 회오리형: 자홍·보라 은하 소용돌이가 세 번 휘감기며 적의 넋을 빨아들인다 (맞힌 적마다 HP 조금)
        const fx0 = SKILL_FX.so_harvest(lv);
        // 11/21 「끌려가는 결재」 범위는 넋 사슬에만 (소용돌이까지 넓혀 무리 피해가 넋 카드 없는 넋의 3배를 넘던 것)
        const fx = fx0;
        const pt = this.targetPoint(fx.reach);
        this.cutIn("soul", true);
        snd("cast");
        fxs.aimAt(me, pt, fx.radius, "soul", 220 + (fx.ticks - 1) * fx.gapMs);
        mv.vortexOpen(pt.x, pt.y, fx.radius, 220);
        fxs.accent(pt, "soul", "harvest-vortex", fx.radius, { vr: -3, ms: 760 });
        const g = this.hitGroup(id, pt.x, pt.y - 40, 600);
        let healed = 0;
        for (let i = 0; i < fx.ticks; i++) {
          this.later(220 + i * fx.gapMs, () => {
            const last = i === fx.ticks - 1;
            const victims: { x: number; y: number }[] = [];
            snd("tick", { i, last });
            const n = this.aoeAt(pt.x, pt.y, fx.radius, fx.mult * pow, this.sk(id, g, { aoe: true, kb: -0.8 }), (m) => victims.push({ x: m.x, y: m.y - MONSTERS[m.id].size / 2 }));
            mv.vortexTick(pt.x, pt.y, fx.radius, i, last, victims);
            const want = Math.min(fx.healCap * this.dv.maxHp - healed, n * fx.healPerHit * this.dv.maxHp) * this.curse.healMul;
            if (want > 0 && !this.died) {
              healed += want;
              this.hp = Math.min(this.dv.maxHp, this.hp + want);
              mv.absorb(pt, { x: this.px, y: this.py });
              if (last) this.dmg.heal(this.px, this.py - 26, healed);
            }
            fxs.punch(last ? 3 : 1, "soul");
          });
        }
        break;
      }
      case "so_lantern": {
        // 소환형: 연보라 유령 손이 금빛 초롱을 받쳐 든다
        const fx = SKILL_FX.so_lantern(lv);
        this.turret?.sprite.destroy();
        const key = "rpg-skill-lantern";
        if (!this.textures.exists(key)) this.textures.addCanvas(key, iconCanvas(skillById("so_lantern")!.art));
        const sprite = this.add.image(this.px + this.face.x * 12, this.py + this.face.y * 8, key).setOrigin(0.5, 1).setDepth(this.py);
        sprite.y -= 20;
        sprite.setAlpha(0);
        this.tweens.add({ targets: sprite, y: sprite.y + 20, alpha: 1, duration: 320, ease: "Bounce.easeOut" });
        const dur = fx.durMs * (1 + this.mods.summonDurPct);
        this.turret = { sprite, until: now + dur, nextAtk: now + 300, atkPct: fx.atkPct, everyMs: fx.everyMs, range: fx.range, group: null };
        this.cutIn("soul", false);
        snd("cast");
        fxs.zone({ kind: "circle", x: sprite.x, y: sprite.y + 20, r: fx.range }, "soul", 360);
        mv.lantern(sprite.x, sprite.y + 20);
        break;
      }
      case "so_procession": {
        // 별빛 행렬 (궁극): 화면 전체 — 별이 돋고 오로라가 드리운 뒤, 박자마다 순례자 행렬이 가로지르며 화면 안 적 모두에게 별빛이 꽂힌다 + 회복
        const fx = SKILL_FX.so_procession(lv);
        this.castUltimate(id, "soul", fx, {}, (i, last, victims) => mv.processionHit(victims.map((m) => ({ x: m.x, y: m.y })), i, last));
        // 11/19 백귀야행 카드: 8초 동안 부른 넋 피해 + · 넋 스킬 쿨타임 −
        if (this.cards?.stats.soulParade) {
          this.buffs.set("soulParade", { until: now + PARADE_MS, v: 1 });
          this.floatText(this.px, this.py - 30, "백귀야행", "#d8c0ff", 11);
        }
        const heal = Math.round(this.dv.maxHp * fx.healPct * this.curse.healMul);
        this.hp = Math.min(this.dv.maxHp, this.hp + heal);
        this.dmg.heal(this.px, this.py - 26, heal, true);
        break;
      }
    }
  }

  /** 근접 부채꼴 스킬: 앞에 아무도 없으면 범위 안 가장 가까운 적 쪽으로 돈다 */
  private aimNearest(range: number): void {
    if (this.inArea({ range, arcDeg: 90 }).length) return;
    const t = this.nearest(range);
    if (t) this.setFace(t.x - this.px, t.y - this.py);
  }

  /** (x,y)에서 가장 가까운 적 (skip 제외) */
  private nearestTo(x: number, y: number, range: number, skip?: Set<Mon>): Mon | null {
    let best: Mon | null = null;
    let bd = range;
    for (const m of this.mons) {
      if (!m.alive || m.hidden || skip?.has(m)) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** 바닥 스킬 놓기 (화톳불·서리밭·눈보라) */
  private addField(kind: Field["kind"], b: BranchId, x: number, y: number, r: number, durMs: number, every: number, mult: number, vuln: number, follow: boolean, prop?: SkillId, skill?: SkillId): void {
    if (kind === "brazier") for (const f of this.fields.filter((f) => f.kind === "brazier")) f.until = 0;
    const gfx = this.add.graphics().setDepth(-445);
    let img: Phaser.GameObjects.Image | undefined;
    if (prop) {
      const key = `rpg-skill-${prop}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, iconCanvas(skillById(prop)!.art));
      img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
    }
    // 바닥 무늬 (판정 원 크기): 서리밭은 서리 고사리, 화톳불은 숯 바닥이 끝날 때까지 남는다
    const deco = kind === "field" ? this.mv.fieldPlace(x, y, r) : this.mv.brazierGround(x, y, r);
    this.fields.push({ kind, branch: b, x, y, r, until: this.now + durMs, next: this.now + 150, every, mult, vuln, follow, gfx, prop: img, deco, group: null, skill: skill ?? prop });
  }

  /** 바닥 스킬: 간격마다 둘레를 치고, 바닥을 그린다 */
  private updateFields(now: number): void {
    for (const f of this.fields) {
      if (f.follow) {
        f.x = this.px;
        f.y = this.py;
      }
      const p = PALETTES[f.branch];
      const left = Math.max(0, f.until - now);
      const fade = Math.min(1, left / 400);
      const pulse = 0.5 + 0.5 * Math.sin(now / 140);
      f.gfx
        .clear()
        .fillStyle(p.main, (f.kind === "field" ? 0.2 : 0.12) * fade)
        .fillCircle(f.x, f.y, f.r)
        .lineStyle(1, p.light, (0.4 + 0.3 * pulse) * fade)
        .strokeCircle(f.x, f.y, f.r);
      // 바닥이 살아 있다: 화톳불은 곳곳에서 밑동이 푸른 불꽃이 솟고, 서리밭은 찬 안개가 깔린다
      if (f.until > now) {
        if (f.kind === "brazier") this.mv.brazierIdle(f.x, f.y, f.r);
        else this.mv.fieldIdle(f.x, f.y, f.r);
      }
      f.deco?.setAlpha(0.85 * fade).setRotation(Math.sin(now / 900) * 0.04);
      if (now >= f.next && now < f.until && !this.died) {
        f.next = now + f.every;
        if (f.kind === "brazier") {
          f.prop?.setScale(1.15);
          this.tweens.add({ targets: f.prop, scale: 1, duration: 160 });
          this.mv.brazierTick(f.x, f.y, f.r);
        } else this.mv.fieldTick(f.x, f.y, f.r);
        if (f.skill) this.passiveSnd(f.skill, 120, "tick");
        // 연타 묶음: 조용해지면 합계를 띄우고 다음 타격부터 새 묶음
        if (!f.group || f.group.closed) f.group = this.dmg.group(f.x, f.y - 40, f.branch, f.every + 400, 3);
        f.group.x = f.x;
        f.group.y = f.y - 40;
        const look = f.skill ? SKILL_LOOK[f.skill] : null;
        this.aoeAt(f.x, f.y, f.r, f.mult, { skill: f.branch, aoe: true, kb: 0.5, slowMs: f.kind === "brazier" ? 0 : 1100, weight: look ? Math.min(1, look.weight) : 1, group: f.group, sid: f.skill }, (m) => this.weaken(m, f.vuln, f.every + 200));
      }
    }
    for (const f of this.fields) {
      if (f.until > now && !this.died) continue;
      f.gfx.destroy();
      const dc = f.deco;
      if (dc) this.tweens.add({ targets: dc, alpha: 0, duration: 300, onComplete: () => dc.destroy() });
      const pr = f.prop;
      if (pr) this.tweens.add({ targets: pr, alpha: 0, duration: 240, onComplete: () => pr.destroy() });
    }
    this.fields = this.fields.filter((f) => f.until > now && !this.died);
  }

  /** 순간 이동(안개 걸음·저승 너울): 벽·장애물을 넘지 않게 조금씩 밀어 본다. 도착한 곳 */
  private slide(dx: number, dy: number): { x: number; y: number } {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let i = 0; i < steps; i++) {
      const p = { x: Phaser.Math.Clamp(this.px + dx / steps, WALL + PLAYER_R, W - WALL - PLAYER_R), y: Phaser.Math.Clamp(this.py + dy / steps, WALL + PLAYER_R + 8, H - WALL - 2) };
      for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
      this.arena.collide(p, PLAYER_R);
      this.px = p.x;
      this.py = p.y;
    }
    return { x: this.px, y: this.py };
  }

  /** 11/19 봉분 뛰어넘기: reach 안 적 자리 중 둘레 radius 안에 가장 많이 몰린 곳 (없으면 바라보는 쪽 reach의 절반) */
  private crowdPoint(reach: number, radius: number): { x: number; y: number } {
    let best: { x: number; y: number } | null = null;
    let bn = 0;
    for (const m of this.mons) {
      if (!m.alive || m.hidden || Math.hypot(m.x - this.px, m.y - this.py) - MONSTERS[m.id].size / 2 > reach) continue;
      let n = 0;
      for (const o of this.mons) if (o.alive && !o.hidden && Math.hypot(o.x - m.x, o.y - m.y) < radius + MONSTERS[o.id].size / 2) n += o.boss ? 2 : 1;
      if (n > bn) {
        bn = n;
        best = { x: m.x, y: m.y };
      }
    }
    return this.patHost.clampPoint(best ? best.x : this.px + this.face.x * reach * 0.5, best ? best.y : this.py + this.face.y * reach * 0.5);
  }

  /** 11/19 삽날 회오리 끄기 (쿨은 끌 때부터). 11/21 다 돌면 쿨 그대로, 일찍 끄면 돈 만큼만 (최소 minCdMs) */
  private stopWhirl(): void {
    const W = this.whirl;
    if (!W) return;
    this.whirl = null;
    this.buffs.delete("wk_whirl");
    const fx = SKILL_FX.wk_whirl(W.lv);
    const used = Math.min(1, Math.max(0, this.now - W.at) / Math.max(1, W.until - W.at));
    const cd = wkCdFloor("wk_whirl", W.lv, Math.round(this.cdOf("wk_whirl") * this.sg.cdMul()));
    this.skillReady.wk_whirl = this.now + Math.max(Math.min(cd, fx.minCdMs), Math.round(cd * used));
    this.player.setAngle(0);
  }

  /** 11/19 일꾼 몸짓: 나아가는 쪽으로 잠깐 기울였다 돌아온다 (돌진·찌르기) */
  private leanBody(dir: number, ms: number): void {
    if (this.data0.reduced || this.whirl) return;
    const deg = Math.max(-18, Math.min(18, dir * 14));
    this.tweens.killTweensOf(this.player);
    this.player.setAngle(deg);
    this.tweens.add({ targets: this.player, angle: 0, duration: ms, ease: "Quad.easeOut" });
  }

  /** 11/19 일꾼: 봉분 뛰어넘기(공중 → 착지)·삽날 회오리(켜 있는 동안 베기 · 11/21 정해진 시간) */
  private updateWorker(now: number, delta: number): void {
    const L = this.leap;
    if (L) {
      const t = Math.min(1, (now - L.at) / L.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.px = L.x0 + (L.x1 - L.x0) * e;
      this.py = L.y0 + (L.y1 - L.y0) * e;
      const lift = Math.sin(Math.PI * t) * 34;
      this.player.setPosition(Math.round(this.px), Math.round(this.py - lift)).setScale(1 + Math.sin(Math.PI * t) * 0.25);
      if (t >= 1) {
        this.leap = null;
        this.player.setScale(1);
        const p = { x: this.px, y: this.py };
        for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
        this.arena.collide(p, PLAYER_R);
        this.px = p.x;
        this.py = p.y;
        const fx = SKILL_FX.wk_leap(L.lv);
        this.sfx.skill("wk_leap", "hit", this.skPow("wk_leap"));
        this.skfx.pw = skillPower(3, L.lv, 5);
        this.mv.leapLand(this.px, this.py, fx.radius);
        this.fx.shake(160, 0.006);
        // 착지 웅크림 (찌그러졌다 펴진다)
        if (!this.data0.reduced) {
          this.player.setScale(1.18, 0.78);
          this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: fx.landMs, ease: "Back.easeOut" });
        }
        const g = this.hitGroup("wk_leap", this.px, this.py - 40);
        this.aoeAt(this.px, this.py, fx.radius, fx.mult, this.sk("wk_leap", g, { aoe: true, kb: 1.2, heavy: true }), (m) => this.hold(m, fx.stunMs, 0xe8d2a8));
        this.skfx.punch(3, "worker");
      }
    }
    const W0 = this.whirl;
    if (!W0) return;
    if (this.died || this.status.has("freeze", now) || this.status.has("silence", now) || this.endSnap) {
      this.stopWhirl();
      return;
    }
    const fx = SKILL_FX.wk_whirl(W0.lv);
    // 11/21 정해진 시간이 다 되면 멈춘다 (SP는 켤 때만)
    if (now >= W0.until) {
      this.stopWhirl();
      return;
    }
    // 빙글빙글 (그림만 — 아바타는 매 프레임 sync가 기울기를 되돌리므로 그 뒤에 돌린다)
    W0.spin = (W0.spin + delta * 1.2) % 360;
    this.player.setAngle(W0.spin);
    if (now >= W0.nextAt) {
      const aspd = this.dv.aspd * (1 + this.buff("so_swift_aspd") + this.buff("wk_tireless")) * this.sg.aspdMul(now);
      W0.nextAt = now + 1000 / Math.max(0.5, aspd);
      this.mv.whirlTick(this.px, this.py, fx.radius, W0.spin);
      this.sfx.skill("wk_whirl", "hit", this.skPow("wk_whirl"), {}, 120);
      // 기본 공격으로 벤다 (굳은살·뚝심·천 번째 삽질·카드 기본 공격 효과가 붙는다)
      this.aoeAt(this.px, this.py, fx.radius, fx.mult, { basic: true, aoe: true, kb: 0.5, skill: "worker", weight: 1, sid: "wk_whirl" });
    }
  }

  /** 망자의 초롱: 사거리 안 가장 가까운 적에게 넋불을 쏜다 */
  private updateTurret(now: number): void {
    const t = this.turret;
    if (!t) return;
    if (now > t.until || this.died) {
      const sp = t.sprite;
      this.tweens.add({ targets: sp, alpha: 0, duration: 200, onComplete: () => sp.destroy() });
      this.turret = null;
      return;
    }
    t.sprite.setDepth(t.sprite.y);
    if (now < t.nextAtk) return;
    const best = this.nearestTo(t.sprite.x, t.sprite.y, t.range);
    if (!best) return;
    t.nextAtk = now + t.everyMs * this.soulEvery();
    this.fx2Bolt(t.sprite.x, t.sprite.y - 10, best);
    this.passiveSnd("so_lantern", 120, "tick");
    this.passiveSnd("so_kinship", 1500);
    if (!t.group || t.group.closed) t.group = this.dmg.group(t.sprite.x, t.sprite.y - 36, "soul", t.everyMs + 500, 3);
    this.strike(best, t.atkPct * this.dv.skillPower * (1 + this.mods.summonPct) * this.paradeMul(), true, 0, { skill: "soul", kb: 0.5, weight: 1, group: t.group, sid: "so_lantern" });
  }

  private potionLeft(id: string): number {
    return (this.play.potions[id] ?? 0) - (this.potionsUsed[id] ?? 0);
  }

  private usePotion(id: string): void {
    const p = potionById(id);
    if (!p || p.revive || this.now < this.potionReadyAt) return;
    // 11/15 번아웃 저주 '탕비실 폐쇄' (부활 쿠키는 그대로)
    if (!this.curse.potions) {
      this.flash("탕비실이 닫혀서 지금은 물약을 못 마셔요", 900);
      return;
    }
    if (this.potionLeft(id) <= 0) {
      this.flash(`${p.name} 다 썼어요`, 900);
      return;
    }
    this.potionsUsed[id] = (this.potionsUsed[id] ?? 0) + 1;
    this.potionReadyAt = this.now + POTION_COOLDOWN_MS;
    const d = this.dv;
    // 11/15 번아웃 저주: 물약 회복 절반(2단계~), 받는 회복 절반(6단계~ — SP는 회복이 아니라 그대로)
    // 11/20 회장님 독대: 물약은 회복 감소·초당 상한 없이 그대로 (쿨타임으로만 묶인다)
    this.healFree = !!this.chair;
    if (p.hp) this.hp = Math.min(d.maxHp, this.hp + p.hp * this.curse.potionMul * (this.chair ? 1 : this.curse.healMul) * this.sg.potionMul());
    this.healFree = false;
    if (p.sp) this.sp = Math.min(d.maxSp, this.sp + p.sp * this.curse.potionMul);
    this.floatText(this.px, this.py - 20, p.name, "#ffe39a", 11);
    // 상태 이상 풀기 (커피: 독·화상·출혈, 에너지드링크: 둔화·빙결·혼란·침묵, 도시락: 전부)
    const cured = this.status.cure(POTION_CURES[id] ?? [], this.now);
    if (cured.length) {
      this.floatText(this.px, this.py - 30, `${cured.map((c) => STATUSES[c].name).join("·")} 풀림`, "#e8f0ff", 9);
      this.ringFx(0xe8f0ff, 22);
    }
    this.sfx.play("potion", 0.7);
  }

  /**
   * 11/17 낙법: 보는 쪽(방향 입력이 있으면 그쪽)으로 0.4초 구른다. 구르는 동안은 몬스터 공격·장판·투사체를 받지 않는다 (hurtPlayer·투사체 판정).
   * 쿨타임 6초 (lib/rpg/dodge). 쓰러짐·빙결·묶임(엘리베이터·시전 중)이면 못 구른다. 쿨타임 중에는 조용히 넘긴다 (HUD 칸에 남은 초가 보인다)
   */
  private roll(): void {
    const now = this.now;
    if (this.died || this.down || this.endSnap || this.lift || now < this.rootUntil || this.status.has("freeze", now)) return;
    const next = startDodge(this.dodge, now);
    if (!next) return;
    this.dodge = next;
    const a0 = this.axis();
    const a = this.status.has("confuse", now) ? { x: -a0.x, y: -a0.y } : a0;
    this.rollVec = rollDir(a, this.face);
    this.setFace(this.rollVec.x, this.rollVec.y);
    this.faceLockUntil = 0;
    this.rollDone = 0;
    this.rollSaid = false;
    this.dodgeFx.start(this.px, this.py, this.rollVec);
    this.sfx.synth("dodge", dodgeSound(), 120);
  }

  /** 낙법으로 굴러 가는 중 (매 프레임): 지난 프레임부터 지금까지 굴러 간 만큼 옮긴다 (벽·소품 충돌은 걷기와 같다). 굴렀으면 true */
  private rollStep(now: number): boolean {
    if (this.rollDone >= 1) return false;
    const t = rollT(this.dodge, now);
    const done = rollTravel(t);
    const step = DODGE_DIST * (done - this.rollDone);
    this.rollDone = done;
    const p = {
      x: Phaser.Math.Clamp(this.px + this.rollVec.x * step, WALL + PLAYER_R, W - WALL - PLAYER_R),
      y: Phaser.Math.Clamp(this.py + this.rollVec.y * step, WALL + PLAYER_R + 8, H - WALL - 2),
    };
    for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
    this.arena.collide(p, PLAYER_R);
    this.px = p.x;
    this.py = p.y;
    if (done >= 1) this.dodgeFx.land(this.px, this.py, this.rollVec);
    return true;
  }

  /** 맞으면 true (무적·회피 시간·보호막이 다 막으면 false). src가 있으면 상태 이상을 굴린다 */
  private hurtPlayer(dmg: number, src?: HitSrc): boolean {
    // 판이 끝나 드롭만 줍는 중에는 다치지 않는다 (지형 함정이 결과를 바꾸지 않게)
    if (this.died || this.down || this.endSnap || this.now < this.hurtUntil || this.buff("invuln")) return false;
    // 11/17 낙법으로 구르는 중: 무엇이든 받지 않는다 (카드 「반차」 같은 첫 공격 막기도 쓰지 않는다). 한 번 구를 때 "회피"를 한 번 띄운다
    if (rolling(this.dodge, this.now)) {
      if (!this.rollSaid) {
        this.rollSaid = true;
        this.floatText(this.px, this.py - 22, "회피", "#d8ecff", 10);
      }
      return false;
    }
    // 11/15 테스트 서버 슈퍼 계정의 야근 빌딩 구경 (무적) — 화면이 슈퍼 계정에만 켠다 (lib/rpg/types RpgPlay.tower.boost)
    if (this.play.tower?.boost) return false;
    // 11/21 회장님 독대 무적(시험) — 개발 서버 운영자만 (fight.godOn이 운영 빌드에선 늘 false)
    if (this.chair?.godOn) return false;
    this.hurtUntil = this.now + HURT_IFRAME_MS;
    this.fightAt = this.now;
    // 11/12 부재중 자동응답: 보호막이 먼저 받는다
    // 동지의 맹세: 받는 피해 감소
    // 11/20 회장님 독대: 받는 피해 감소(패시브·세트 옵션)는 반만 (CHAIR_GUARD_KEEP) — 만렙도 회장님 공격은 확실히 아프다
    const soft = (m: number) => (this.chair ? 1 - (1 - m) * CHAIR_GUARD_KEEP : m);
    dmg = Math.max(1, Math.round(dmg * soft((1 - this.mods.guard) * (1 - this.mods.wkGuard) * (1 - this.synGuard))));
    // 11/15 세트 장비: 받는 피해 옵션·야근 4세트 (맞은 시각도 적는다 — 출장 4세트)
    dmg = Math.max(1, Math.round(dmg * soft(this.sg.takenMul(this.now, this.hp, this.dv.maxHp))));
    // 11/15 능력 카드: 반차(층마다 첫 공격) · 사원증 목걸이 · 재택근무(서 있으면)
    if (this.cards) {
      dmg = this.cards.incoming(dmg, this.movingNow);
      if (dmg <= 0) return false;
    }
    // 서리 방패: 보호막이 먼저 받는다. 11/17 막은 몫은 파란 「−N 막음」 (깎인 체력 숫자와 따로)
    if (this.shield > 0 && this.buff("fr_ward")) {
      const take = Math.min(this.shield, dmg);
      this.shield -= take;
      dmg -= take;
      this.dmg.taken("block", this.px - 6, this.py - 46, take);
      this.floatText(this.px + 8, this.py - 42, "막음", "#8fc2ff", 10);
      if (this.shield <= 0) {
        this.buffs.delete("fr_ward");
        this.mv.wardBreak(this.px, this.py);
        this.passiveSnd("fr_ward", 0);
      }
      if (dmg <= 0) return false;
    }
    // 11/17 떠오르는 빨간 숫자 = HUD 체력이 실제로 줄어든 양 (0 아래로 넘친 몫은 빼고, 연차로 버티면 1까지만 — 아래 showHurt)
    const before = this.hp;
    this.hp -= dmg;
    this.passiveSnd("fr_collar", 300);
    this.player.setTintFill(0xff6a6a);
    // 번쩍임이 끝나면 drawStatus가 상태 색(없으면 원래 색)으로 되돌린다
    this.hurtFlashUntil = this.now + 90;
    this.tintNow = -1;
    this.fx.shake(90, 0.003);
    this.combo = 0;
    if (this.hp > 0) {
      this.showHurt(before);
      if (src) {
        this.inflict(src);
        // 11/15 블루스크린: 1초 방향 뒤집힘 + 파란 화면 테두리
        this.theme?.playerHit?.(src.id, src.pat);
      }
      return true;
    }
    // 11/15 전설 옵션 「연차」: 한 판에 한 번 체력 1로 버틴다 (11/17 같은 연출의 짧은 판 0.4초)
    if (this.sg.saveFromDeath()) {
      this.hp = 1;
      this.showHurt(before);
      this.startDown("vacation");
      return true;
    }
    this.hp = 0;
    this.showHurt(before);
    // 11/15 번아웃 저주 '사직서 즉시 수리'(10단계~): 부활 쿠키 없이 그 자리에서 끝
    if (!this.chair && !this.cookieUsed && this.curse.revive && (this.play.potions.p_cookie ?? 0) > 0) {
      // 부활 쿠키: 자동으로 먹고 반쯤 회복 (11/17 체력·무적은 연출이 끝날 때 — endDown)
      this.cookieUsed = true;
      this.potionsUsed.p_cookie = 1;
      this.startDown("cookie");
      return true;
    }
    // 11/15 전설 카드 「무한 야근」: 한 번 체력 30%로 다시 일어난다 (야근 빌딩에서 다시 일어나는 유일한 길)
    if (this.cards?.revive()) {
      this.startDown("card");
      return true;
    }
    this.died = true;
    this.status.clear();
    this.sfx.play("defeat");
    this.flash("쓰러졌어요…", 1500);
    this.player.setAlpha(0.5);
    // 쓰러진 뒤 잠깐: 그때까지의 결과로 끝내고, 받을 드롭이 있으면 바닥에 떨궈 날아오게 한 뒤 끝낸다
    // 11/20 회장님 독대: 회색 느린 연출 → 결과 창은 game/chairman이 (드롭 없음)
    if (!this.chair) this.time.delayedCall(900, () => !this.ended && !this.endSnap && this.endRun(this.result(), true, 0));
    return true;
  }

  /** 11/17 맞은 뒤 빨간 숫자: before → 지금 체력으로 HUD가 줄어든 만큼 (0.3초 안에 또 맞으면 합친다 — damageNumbers taken) */
  private showHurt(before: number, kind: "hit" | "dot" = "hit"): void {
    const lost = hpLost(before, this.hp);
    if (lost <= 0) return;
    // 이름표(머리 위) 위로 — 예전 자리(py−20)는 이름표와 겹쳤다
    if (kind === "dot") this.dmg.taken("dot", this.px + 7, this.py - 33, lost);
    else this.dmg.taken("hit", this.px, this.py - 36, lost);
  }

  /**
   * 11/17 쓰러졌다 일어나는 연출 시작 (무한 야근·부활 쿠키·세트 장비 연차). 끝날 때까지 게임 시간이 멈춘다 (update → stepDown).
   * 쓰러짐 → 「카드 발동」 표시 → 빛 기둥과 함께 일어나며 가까운 몬스터를 밀어냄 → 체력·1.5초 무적·「다시 일어났어요」 (endDown)
   */
  private startDown(kind: DownKind): void {
    this.atkBuffered = false;
    this.holdOn = false;
    this.holdAim = null;
    // 맞아서 빨갛게 칠한 몸을 원래 색으로 (멈춘 동안 drawStatus가 돌지 않는다)
    this.player.clearTint();
    this.tintNow = -1;
    this.hurtFlashUntil = 0;
    // 손에 든 무기는 쓰러진 동안 감춘다 (일어나면 step이 다시 그린다)
    this.held?.update(Math.round(this.px), Math.round(this.py), this.face.x, this.face.y, this.py, 0, this.now);
    const color = kind === "card" ? 0xffd84a : kind === "cookie" ? 0xffe39a : 0xfff2a8;
    if (kind !== "vacation") this.sfx.play("slam", 0.45);
    this.down = new DownCut(this, {
      kind,
      side: this.face.x < -0.2 ? -1 : 1,
      reduced: this.data0.reduced,
      sprite: this.player,
      x: this.px,
      y: this.py,
      color,
      onCard: () => {
        if (kind === "card") {
          showProc(cardProc("overtime", { reviveHp: this.cards?.reviveHp ?? 0.3, big: true }));
          this.sfx.synth("card-revive", CARD_SND.revive);
        } else if (kind === "cookie") {
          showProc(cookieProc());
          this.sfx.play("potion");
        } else this.flushSgProcs();
      },
      onRise: () => {
        this.reviveShove(kind === "vacation" ? 26 : 36);
        this.ringFx(color, kind === "vacation" ? 30 : 60);
        if (kind === "card") this.cards?.reviveBurst();
        else this.ringFx(0xffffff, kind === "vacation" ? 18 : 36);
      },
      onDone: () => this.endDown(kind),
    });
    // 멈춘 동안은 HUD를 안 보낸다 → 쓰러진 체력(0)을 지금 한 번
    bridge.emit("rpg:hud", this.hud());
  }

  /** 11/17 부활 연출 중 (실시간): 게임 시간은 흘리지 않는다. 멈춤 메뉴가 열려 있으면 연출도 멈춘다 */
  private stepDown(delta: number): void {
    if (this.paused || this.ended) return;
    this.down?.update(Math.min(delta, 100));
  }

  /** 11/17 일어나는 순간: 가까운 몬스터를 밀어내고 잠깐 묶는다, 날아오던 투사체는 지운다 (일어나자마자 다시 맞아 쓰러지지 않게) */
  private reviveShove(r: number): void {
    const now = this.now;
    for (const m of this.mons) {
      if (!m.alive || m.hidden) continue;
      const def = MONSTERS[m.id];
      const dx = m.x - this.px;
      const dy = m.y - this.py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > r + def.size / 2) continue;
      const boss = def.behavior === "boss" || m.boss;
      // 살짝: r 바깥으로 조금 (우두머리는 덜)
      const push = (r + def.size / 2 - d) * (boss ? 0.35 : 1) + (boss ? 2 : 4);
      const x0 = m.x;
      const y0 = m.y;
      this.moveMon(m, (dx / d) * push, (dy / d) * push);
      m.kbx = (dx / d) * (boss ? 20 : 70);
      m.kby = (dy / d) * (boss ? 20 : 70);
      m.stunUntil = Math.max(m.stunUntil, now + (boss ? 250 : 700));
      // 게임 시간이 멈춰 있어 그림은 직접 옮긴다 (밀려나는 모습)
      m.sprite.setPosition(x0, y0);
      this.tweens.add({ targets: [m.sprite, m.shadow], x: Math.round(m.x), y: Math.round(m.y), duration: 220, ease: "Quad.easeOut" });
    }
    for (const s of this.shots) if (Math.hypot(s.x - this.px, s.y - this.py) < r * 1.6) s.until = 0;
  }

  /** 11/17 부활 연출 끝: 체력·상태 이상·무적 1.5초, 「다시 일어났어요」 */
  private endDown(kind: DownKind): void {
    this.down = null;
    const now = this.now;
    const before = this.hp;
    if (kind === "card") this.hp = Math.max(1, Math.round(this.dv.maxHp * (this.cards?.reviveHp ?? 0.3)));
    else if (kind === "cookie") this.hp = Math.round(this.dv.maxHp * 0.5);
    if (kind !== "vacation") {
      // 다시 일어나면 상태 이상도 털어 낸다
      this.status.cure(STATUS_IDS, now);
      this.dmg.heal(this.px, this.py - 36, hpShown(this.hp) - hpShown(before), true);
    }
    this.buffs.set("invuln", { until: now + REVIVE_INVULN_MS, v: 1 });
    this.atkBuffered = false;
    this.holdOn = false;
    // 글은 머리 위에 크게 하나 (위쪽 알림 띠에도 띄우면 같은 말이 두 번 보인다)
    const msg = kind === "vacation" ? "연차를 쓰고 버텼어요" : "다시 일어났어요";
    const t = this.label(this.px, this.py - 46, msg, kind === "vacation" ? "#fff2a8" : "#ffe28a", 16).setDepth(1e6);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: { from: 1, to: 0 }, delay: 700, duration: 700, ease: "Quad.easeIn", onComplete: () => t.destroy() });
    bridge.emit("rpg:hud", this.hud());
  }

  /** 11/19 숨겨진 5세트 효과 (매 프레임): 칼퇴 본능(남은 시간) · 말풍선 따라가기 · 발밑 마일리지 · 처음 켜진 세트 「발견!」(알림 + 저장 요청) */
  private eggTick(now: number): void {
    if (!this.egg.any) return;
    const lv = this.egg.leave(this.runLimitMs - Math.max(now, this.floorAt), !!this.lift || !!this.endSnap || this.died);
    this.eggMove = lv.mul;
    if (lv.start) this.eggFx?.bubble(this.px, this.py - 34, "퇴근!", 1800, "#2f7a14");
    this.eggFx?.follow(this.px, this.py - 26);
    this.eggFx?.mile(this.px, this.py, this.egg.mileRatio(), this.egg.has("trip") && !this.died);
    for (const set of this.egg.takeFound()) {
      const a = this.egg.icon(set);
      if (a) showProc(eggProc(set, a.icon));
      bridge.emit("rpg:egg", { set: SG_SETS.indexOf(set) });
    }
  }

  /** 11/19 「회의가 길어진다」: 「…그래서 말인데요」 + 둘레 적이 1초 꾸벅꾸벅 (느려짐 — 우두머리는 1/3) */
  private eggTalk(): void {
    this.eggFx?.bubble(this.px, this.py - 34, "…그래서 말인데요", 1800);
    let i = 0;
    for (const m of this.mons) {
      if (!m.alive || Math.hypot(m.x - this.px, m.y - this.py) > SG_EGG_FX.talkR) continue;
      const boss = m.boss || MONSTERS[m.id].behavior === "boss";
      m.slowUntil = Math.max(m.slowUntil, this.now + (boss ? SG_EGG_FX.talkMs / 3 : SG_EGG_FX.talkMs));
      m.sprite.setTint(0xb8b0e8);
      if (i++ < 6) this.eggFx?.doze(m.x, m.y - MONSTERS[m.id].size - 4, i);
    }
  }

  /** 11/17 세트 장비 발동 효과 (연차·야근 4세트·결재 완료) → 발동 표시 */
  private flushSgProcs(): void {
    for (const k of this.sg.takeProcs()) {
      const a = this.sg.procIcon(k);
      if (a) showProc(sgProc(k, a.icon, a.grade));
    }
  }

  /** 몬스터 공격이 맞은 뒤: 그 몬스터·패턴의 상태 이상을 굴려 건다 (같은 상태는 갱신, 면역이면 무시) */
  private inflict(src: HitSrc): void {
    const now = this.now;
    for (const h of rollStatus(src.id, src.pat, this.play.difficulty)) {
      const r = this.status.apply(h, now);
      if (r === "immune") continue;
      const def = STATUSES[h.id];
      if (r === "new") {
        this.floatText(this.px, this.py - 30, def.name, `#${def.color.toString(16).padStart(6, "0")}`, 10);
        this.ringFx(def.color, 18);
      }
      if (h.id === "freeze") this.atkBuffered = false;
    }
  }

  /** 상태 이상 그림: 캐릭터 색, 머리 옆 아이콘, 작은 입자 */
  private drawStatus(now: number): void {
    const list = this.died ? [] : this.status.list(now);
    // 색: 가장 센 것 하나 (빙결 > 혼란 > 침묵 > 화상 > 출혈 > 독 > 둔화)
    if (now >= this.hurtFlashUntil) {
      const order: StatusId[] = ["freeze", "confuse", "silence", "burn", "bleed", "poison", "slow"];
      const top = order.find((id) => list.some((x) => x.id === id));
      const want = top ? STATUSES[top].color : 0xffffff;
      if (want !== this.tintNow) {
        this.tintNow = want;
        if (top) this.player.setTint(want);
        else this.player.clearTint();
      }
    }
    // 머리 옆 아이콘 (8×8): 위로 쌓는다. 끝나기 1초 전부터 깜빡
    for (const [id, img] of this.statusIcons) {
      if (!list.some((x) => x.id === id)) {
        img.destroy();
        this.statusIcons.delete(id);
      }
    }
    list.forEach((st, i) => {
      let img = this.statusIcons.get(st.id);
      if (!img) {
        const key = `rpg-st-${st.id}`;
        if (!this.textures.exists(key)) this.textures.addCanvas(key, iconCanvas(STATUSES[st.id].art));
        img = this.add.image(0, 0, key).setScale(0.5).setDepth(1e5);
        this.statusIcons.set(st.id, img);
      }
      img.setPosition(Math.round(this.px + 10), Math.round(this.py - 22 - i * 9));
      img.setAlpha(st.leftMs < 1000 && Math.floor(now / 120) % 2 ? 0.35 : 1);
    });
    // 입자: 걸린 상태를 돌아가며 하나씩
    if (list.length && now >= this.statusFxAt) {
      this.statusFxAt = now + 240;
      const st = list[this.statusFxI++ % list.length];
      const def = STATUSES[st.id];
      const tex = st.id === "burn" ? RTEX.fire : RTEX.spark;
      const x = this.px + (Math.random() - 0.5) * 10;
      const y = this.py - 6 - Math.random() * 8;
      const fall = st.id === "bleed" || st.id === "slow";
      const o = this.add.image(x, y, tex).setTint(def.color).setDepth(1e5).setScale(st.id === "burn" ? 0.5 : 0.7).setAlpha(0.9);
      this.tweens.add({ targets: o, y: y + (fall ? 8 : -12), alpha: 0, duration: 520, onComplete: () => o.destroy() });
    }
  }

  /** 내 발밑 공격 쿨다운 게이지: 차오르다 다 차면 반짝, 버퍼에 공격이 있으면 초록 */
  private drawGauge(now: number): void {
    const g = this.gauge;
    g.clear();
    if (this.died) return;
    const left = Math.max(0, this.atkReadyAt - now);
    const ready = left <= 0;
    if (ready && !this.wasReady) {
      this.wasReady = true;
      this.gaugeFlashUntil = now + 160;
    }
    const w = 16;
    const x = Math.round(this.px - w / 2);
    const y = Math.round(this.py + 3);
    const p = ready ? 1 : 1 - left / this.atkCdMs;
    g.fillStyle(0x0a0b10, 0.75).fillRect(x - 1, y - 1, w + 2, 4);
    const color = now < this.gaugeFlashUntil ? 0xffffff : this.atkBuffered ? 0x9fc5a8 : ready ? 0xe0c36a : 0x8a7a5a;
    g.fillStyle(color, 1).fillRect(x, y, Math.round(w * p), 2);
    g.setDepth(this.py + 2);
  }

  /**
   * 11/21 회장님 독대 폰 HUD(시안 B): 이름 바로 아래 체력(빨강)·SP(파랑) 막대 46px — 피해 숫자·콤보보다 위에 그린다.
   * 이름표를 막대 높이만큼 올려(unit.lift) 머리와 이름 사이에 막대 자리를 낸다
   */
  private drawChairBars(now: number): void {
    const on = this.chairSlim && !this.died;
    if (this.me) this.me.unit.lift = on ? CHAIR_BAR_H / this.cameras.main.zoom : 0;
    // 이름표·칭호도 피해 숫자(1e6+)보다 위로 — 늘 읽히게 (PC는 원래 깊이)
    this.me?.setNameDepth(on ? 1e6 + 999 : LABEL_DEPTH_ME);
    if (!on) {
      this.chairBars?.setVisible(false);
      return;
    }
    if (!this.chairBars?.scene) this.chairBars = this.add.graphics().setDepth(1e6 + 1000);
    const g = this.chairBars.clear().setVisible(true);
    const z = this.cameras.main.zoom;
    const lb = this.me?.label;
    g.setPosition(lb ? lb.x : this.px, lb ? lb.y + 1 / z : this.py - 40).setScale(1 / z);
    const w = 46;
    const x = -w / 2;
    const hp = Math.max(0, Math.min(1, this.hp / Math.max(1, this.dv.maxHp)));
    const sp = Math.max(0, Math.min(1, this.sp / Math.max(1, this.dv.maxSp)));
    const low = hp < 0.3 && Math.floor(now / 180) % 2 === 0;
    g.fillStyle(0x0a0b10, 0.9).fillRect(x - 1, 0, w + 2, CHAIR_BAR_H - 1);
    g.fillStyle(0x3a1414, 1).fillRect(x, 1, w, 5);
    g.fillStyle(low ? 0xff8a70 : 0xe0483a, 1).fillRect(x, 1, Math.round(w * hp), 5);
    g.fillStyle(0xff9a8a, 0.5).fillRect(x, 1, Math.round(w * hp), 1);
    g.fillStyle(0x14203a, 1).fillRect(x, 7, w, 3);
    g.fillStyle(0x5aa8ff, 1).fillRect(x, 7, Math.round(w * sp), 3);
  }

  /** 11/21 폰: 내 칭호 + 이름 + 아래 체력·SP 막대 + 오른쪽 콤보 칸 (월드 좌표) — 합계 숫자가 피해 간다 */
  private meNameBox(): Box | null {
    const lb = this.me?.label;
    if (!lb || !this.chairSlim) return null;
    const z = this.cameras.main.zoom;
    const hw = Math.max(lb.displayWidth / 2, 23 / z);
    const box = { x0: lb.x - hw, y0: lb.y - lb.displayHeight, x1: lb.x + hw + 44 / z, y1: lb.y + CHAIR_BAR_H / z };
    const tt = this.me?.titleText;
    if (tt?.visible && tt.text) {
      box.x0 = Math.min(box.x0, tt.x - tt.displayWidth / 2);
      box.x1 = Math.max(box.x1, tt.x + tt.displayWidth / 2);
      box.y0 = Math.min(box.y0, tt.y - tt.displayHeight);
    }
    return box;
  }

  private ringFx(color: number, radius: number): void {
    const r = this.add.image(this.px, this.py - 6, RTEX.ring).setTint(color).setDepth(1e5).setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: r, scale: radius / 32, alpha: 0, duration: 380, onComplete: () => r.destroy() });
  }

  private flash(msg: string, ms: number): void {
    this.message = msg;
    this.messageUntil = this.now + ms;
  }

  // ── 몬스터 ──

  private spawn(id: MonsterId, x: number, y: number, wave: number, elite = false): void {
    // 11/15 야근 빌딩: 기본 세기 하나(TOWER_POWER) × 층 배율 (11/19 100층까지 완만·그 위로 가파르게 — lib/rpg/tower towerScale)
    const base = this.play.tower ? monsterStats(id, "hell", TOWER_POWER, towerScale(this.floor)) : monsterStats(id, this.play.difficulty, this.zone.power);
    // 11/12 정예: 더 크고 질기다. EXP는 서버가 그 웨이브를 깼을 때 보너스로 더한다 (plan.eliteBonusExp)
    const st = elite
      ? { ...base, maxHp: Math.round(base.maxHp * ELITE.hp), atk: Math.round(base.atk * ELITE.atk), def: Math.round(base.def * ELITE.def), exp: Math.round(base.exp * ELITE.exp) }
      : base;
    const size = MONSTERS[id].size;
    // 40번: 장애물 위에 나오지 않게 가까운 빈자리로
    const at = this.arena.place(x, y, size / 2);
    x = at.x;
    y = at.y;
    const sprite = this.add.sprite(x, y, RTEX.monster(id), 0).setOrigin(...monsterOrigin(id)).setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 300 });
    const barBg = this.add.rectangle(x, y, size, 2, 0x000000, 0.6).setDepth(1e4);
    const bar = this.add.rectangle(x, y, size, 2, 0xc83c3c).setDepth(1e4 + 1).setOrigin(0, 0.5);
    const shadow = this.add.image(x, y, RTEX.shadow).setScale(size / 14, 1).setDepth(-500);
    this.mons.push({
      id,
      st,
      x,
      y,
      hp: st.maxHp,
      wave,
      alive: true,
      sprite,
      shadow,
      bar,
      barBg,
      nextAtk: this.now + 600,
      nextThink: this.now + 400 + Math.random() * 600,
      dx: 0,
      dy: 0,
      windUntil: 0,
      dashUntil: 0,
      vulnUntil: 0,
      vuln: 0,
      slowUntil: 0,
      hidden: false,
      kbx: 0,
      kby: 0,
      stunUntil: 0,
      cast: null,
      patReady: {},
      nextCastAt: 0,
      pats: [],
      boss: false,
      phase: 0,
    });
    // 2번: 패턴 준비 (마지막 웨이브 첫 몬스터 = 우두머리, 단계 패턴이 붙는다)
    const m = this.mons[this.mons.length - 1];
    if (elite) {
      m.elite = true;
      sprite.setScale(ELITE.scale);
      m.bar.setFillStyle(0xe8b830);
      this.floatText(x, y - size * ELITE.scale - 6, "정예", "#ffd04a", 10);
    }
    const w = this.plan[wave];
    m.boss = MONSTERS[id].behavior === "boss" || (!!w?.boss && w.monsters[0] === id && !this.mons.some((o) => o !== m && o.boss && o.wave === wave));
    m.pats = monsterPatterns(MONSTERS[id], { boss: m.boss, hpRatio: 1, difficulty: this.play.difficulty });
    seedPatternTimers(m, m.pats, this.now, this.play.difficulty);
    this.theme?.spawned?.(m);
    // 11/15 이 판에서 처음 나온 몬스터는 카드로 알린다 (졸개 조각은 빼고)
    if (this.intro && !MONSTERS[id].minion && !this.seenMons.has(id)) {
      this.seenMons.add(id);
      this.intro.push(id);
    }
  }

  /** 지도의 출현 지점 중 나에게서 충분히 먼 곳 (40번: 사냥터마다 문·입구 쪽) */
  private edgePoint(r = 10): { x: number; y: number } {
    return this.arena.edgePoint(this.px, this.py, r);
  }

  /**
   * 11/12 웨이브 모양 (plan.formation): 마릿수·종류는 계획 그대로, 나오는 자리·시간만 다르다.
   * scatter 입구 여기저기 · swarm 한 점에 무리 · pincer 무리가 양쪽에서 · surround 나를 빙 둘러 · stream 한 입구에서 줄지어
   */
  private spawnWave(): void {
    const w = this.plan[this.nextWave];
    this.lastWaveAt = this.now;
    this.waveAlive[w.index] = w.monsters.length;
    const solo = w.monsters.length - w.pack;
    const f = w.formation ?? (w.pack ? "swarm" : "scatter");
    const cx = (x: number) => Phaser.Math.Clamp(x, WALL + 10, W - WALL - 10);
    const cy = (y: number) => Phaser.Math.Clamp(y, WALL + 14, H - WALL - 4);
    const near = (c: { x: number; y: number }) => {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 14;
      return { x: cx(c.x + Math.cos(a) * r), y: cy(c.y + Math.sin(a) * r) };
    };
    const packA = this.edgePoint();
    this.packAt = packA;
    // 협공: 무리 반쪽은 첫 무리에서 가장 먼 입구로
    let packB = packA;
    if (f === "pincer") {
      for (let k = 0; k < 4; k++) {
        const p = this.edgePoint();
        if (Math.hypot(p.x - packA.x, p.y - packA.y) > Math.hypot(packB.x - packA.x, packB.y - packA.y)) packB = p;
      }
    }
    const gate = this.edgePoint();
    const phase = Math.random() * Math.PI * 2;
    const n = w.monsters.length;
    w.monsters.forEach((id, i) => {
      const elite = w.elite === i;
      const go = (p: { x: number; y: number }) => this.spawn(id, p.x, p.y, w.index, elite);
      if (f === "surround") {
        const a = phase + (i / n) * Math.PI * 2;
        const R = 88 + (i % 2) * 16;
        return go({ x: cx(this.px + Math.cos(a) * R), y: cy(this.py + Math.sin(a) * R * 0.8) });
      }
      if (f === "stream") {
        // 한 마리씩 (무리는 맨 끝에 한꺼번에)
        const at = Math.min(i, solo) * STREAM_GAP_MS;
        if (at <= 0) return go(i < solo ? gate : near(packA));
        this.pendingSpawns++;
        return this.later(at, () => {
          this.pendingSpawns--;
          go(i < solo ? near(gate) : near(packA));
        });
      }
      if (i < solo) return go(this.edgePoint(MONSTERS[id].size / 2));
      go(near(f === "pincer" && (i - solo) % 2 === 1 ? packB : packA));
    });
    this.nextWave++;
    const label = f === "swarm" && w.pack ? `${MONSTERS[w.monsters[solo]].name} 무리!` : WAVE_FORMATION_LABEL[f];
    const eliteNote = w.elite !== undefined ? ` · 정예 ${MONSTERS[w.monsters[w.elite]].name}` : "";
    this.flash(
      w.boss ? `마지막 웨이브 · ${MONSTERS[w.monsters[0]].name} 등장!` : `웨이브 ${w.index + 1} / ${this.plan.length}${label ? ` · ${label}` : ""}${eliteNote}`,
      1800,
    );
    if (w.boss || w.pack || w.elite !== undefined) this.sfx.play("tick");
    if (f === "surround") this.fx.shake(90, 0.002);
  }

  /**
   * 몬스터끼리 살짝 밀어내기 (무리가 한 점으로 뭉쳐 보이지 않게). 11/15 많을 때(야근 빌딩 분열·복사·불러들이기)는
   * 32px 칸 격자로 이웃 칸끼리만 본다 (n² → 거의 n). 격자 배열은 판마다 하나를 돌려 쓴다
   */
  private separate(): void {
    const ms = this.mons;
    if (ms.length > SEP_GRID_FROM) return this.separateGrid();
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (!a.alive || a.hidden) continue;
      const ra = MONSTERS[a.id].size / 2;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (!b.alive || b.hidden) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (ra + MONSTERS[b.id].size / 2) * 0.7;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        const ux = d2 > 0.0001 ? dx / d : Math.random() - 0.5;
        const uy = d2 > 0.0001 ? dy / d : Math.random() - 0.5;
        this.moveMon(a, -ux * push, -uy * push);
        this.moveMon(b, ux * push, uy * push);
      }
    }
  }

  private sepCells: Mon[][] = [];
  private separateGrid(): void {
    const C = SEP_CELL;
    const cols = Math.ceil(W / C);
    const rows = Math.ceil(H / C);
    const cells = this.sepCells;
    for (let k = 0; k < cols * rows; k++) {
      if (cells[k]) cells[k].length = 0;
      else cells[k] = [];
    }
    for (const m of this.mons) {
      if (!m.alive || m.hidden) continue;
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(m.x / C)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(m.y / C)));
      cells[cy * cols + cx].push(m);
    }
    const pair = (a: Mon, b: Mon) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = (MONSTERS[a.id].size / 2 + MONSTERS[b.id].size / 2) * 0.7;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2) || 0.01;
      const push = (min - d) / 2;
      const ux = d2 > 0.0001 ? dx / d : Math.random() - 0.5;
      const uy = d2 > 0.0001 ? dy / d : Math.random() - 0.5;
      this.moveMon(a, -ux * push, -uy * push);
      this.moveMon(b, ux * push, uy * push);
    };
    // 같은 칸 + 오른쪽·아래·오른쪽 아래·왼쪽 아래 칸 (한 쌍을 한 번만)
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const c = cells[cy * cols + cx];
        if (!c.length) continue;
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) pair(c[i], c[j]);
        for (const [ox, oy] of SEP_NEIGHBORS) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny >= rows || nx >= cols) continue;
          const n = cells[ny * cols + nx];
          for (const a of c) for (const b of n) pair(a, b);
        }
      }
  }

  private moveMon(m: Mon, dx: number, dy: number): void {
    const r = MONSTERS[m.id].size / 2;
    m.x = Phaser.Math.Clamp(m.x + dx, WALL + r, W - WALL - r);
    m.y = Phaser.Math.Clamp(m.y + dy, WALL + r + 4, H - WALL - 2);
    this.arena.collide(m, r);
  }

  private shoot(m: Mon, angle: number, speed: number, dmg: number, tex: string): void {
    const sprite = this.add.image(m.x, m.y - 8, tex).setDepth(1e4);
    this.shots.push({ x: m.x, y: m.y - 8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, until: this.now + 4000, sprite, src: { id: m.id, pat: m.cast?.id } });
  }

  private monsterAttackRoll(m: Mon, mult = 1): void {
    if (Math.random() > hitChance(m.st.hit, this.dv.flee)) {
      this.floatText(this.px, this.py - 18, "회피", "#9aa3ad", 10);
      return;
    }
    let dmg = damage(m.st.atk, mult, this.dv.def, Math.random(), false);
    // 11/19 단단한 허리 자동 막기: 근접 공격만, 같은 적은 2초에 한 번
    if (this.mods.parry > 0 && !this.died && (this.parryAt.get(m) ?? -1e9) + SKILL_FX.wk_back(1).parryGapMs <= this.now && Math.random() < this.mods.parry) {
      this.parryAt.set(m, this.now);
      dmg = Math.max(1, Math.round(dmg * (1 - SKILL_FX.wk_back(1).parryCut)));
      this.floatText(this.px, this.py - 22, "막음!", "#e8d2a8", 10);
      this.sfx.play("crit", 0.25);
      this.skfx.sparks(this.px + (m.x - this.px) * 0.4, this.py - 8 + (m.y - this.py) * 0.4, 6, [0xffffff, 0xd8d8d0, 0xffd27a], 110, { life: 220 });
      const d = Math.hypot(m.x - this.px, m.y - this.py) || 1;
      if (!m.boss) this.moveMon(m, ((m.x - this.px) / d) * 14, ((m.y - this.py) / d) * 14);
    }
    this.hurtPlayer(dmg, { id: m.id, pat: m.cast?.id ?? "bite" });
  }

  /**
   * 몬스터 한 마리: 넉백 → 경직 → (2번) 패턴 중이면 패턴이 움직임을 맡고, 아니면 쓸 수 있는 패턴을 고른 뒤 행동대로 걷는다.
   * 공격은 모두 패턴으로 한다 (물기·돌진·사격·자폭·기습·우두머리 단계 패턴 — 바닥 경고가 먼저 보인다)
   */
  private updateMonster(m: Mon, dt: number): void {
    // 11/20 회장님은 game/chairman이 움직인다
    if (m.chair) return;
    const def = MONSTERS[m.id];
    const now = this.now;
    if (m.kbx || m.kby) {
      this.moveMon(m, m.kbx * dt, m.kby * dt);
      const decay = Math.exp(-dt * 10);
      m.kbx = Math.abs(m.kbx * decay) < 3 ? 0 : m.kbx * decay;
      m.kby = Math.abs(m.kby * decay) < 3 ? 0 : m.kby * decay;
    }
    if (now < m.stunUntil) return;
    if (updateCast(this.patHost, m, dt)) return;
    if (!m.cast && !this.died) tryStartPattern(this.patHost, m, m.pats);
    if (m.cast?.root || m.hidden) return;
    // 11/15 야근 빌딩 테마 몬스터의 걸음 (랜선은 구불구불, 팬·프린터·카메라는 제자리 …)
    if (this.theme?.move?.(m, dt)) return;
    const dx = this.px - m.x;
    const dy = this.py - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    const slow = m.slowUntil > now ? 0.75 : 1;
    let spd = m.st.speed * slow;
    let mx = dx / dist;
    let my = dy / dist;
    const touch = dist < def.size / 2 + 7;

    switch (def.behavior) {
      case "wander":
        if (now > m.nextThink) {
          m.nextThink = now + 700;
          const a = Math.random() < 0.6 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
          m.dx = Math.cos(a);
          m.dy = Math.sin(a);
        }
        mx = m.dx;
        my = m.dy;
        break;
      case "ranged":
        // 거리를 두고 (조준 사격·부채 사격 패턴이 쏜다)
        if (dist < 60) {
          mx = -mx;
          my = -my;
        } else if (dist < 90) spd = 0;
        break;
      case "boss":
        if (dist < 22) spd = 0;
        break;
      default:
        // chase·dash·split·explode·blink: 쫓아온다 (돌진·자폭·기습은 패턴이 한다)
        break;
    }
    if (touch) spd = 0;
    // 40번: 곧장 못 가면 장애물을 돌아간다 (흐름장). 충돌은 moveMon이 맡는다
    const sv = spd > 0 ? this.arena.steer(m.x, m.y, mx, my, this.px, this.py) : { x: mx, y: my };
    this.moveMon(m, sv.x * spd * dt, sv.y * spd * dt);
  }

  private ringFxAt(x: number, y: number, color: number, radius: number): void {
    const r = this.add.image(x, y - 6, RTEX.ring).setTint(color).setDepth(1e5).setScale(0.2);
    this.tweens.add({ targets: r, scale: radius / 32, alpha: 0, duration: 320, onComplete: () => r.destroy() });
  }

  private pushOut(p: { x: number; y: number }, o: Obstacle, r: number): void {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    const min = o.r + r;
    if (d < min && d > 0.01) {
      p.x = o.x + (dx / d) * min;
      p.y = o.y + (dy / d) * min;
    }
  }

  // ── 매 프레임 ──

  update(_time: number, delta: number): void {
    // 11/18 드롭 시드: 첫 우두머리가 나올 때쯤 한 번 받는다 (우두머리 드롭·상자 연출용)
    if (!this.revealAsked && this.now >= this.revealAt) {
      this.revealAsked = true;
      void this.play.reveal?.().then((s) => {
        if (s !== null) this.dropSeed = s;
      });
    }
    // 11/15 능력 카드: 차례가 된 카드 고르기를 열고, 고르는 동안은 판이 멈춘다
    this.cards?.tick();
    if (this.cards?.picking) return;
    // 11/17 쓰러졌다 일어나는 연출 중: 게임 시간(판 시간·층 제한 시간)이 흐르지 않는다 → 몬스터도 멈춘다
    if (this.down) this.stepDown(delta);
    else this.step(delta);
    // 스킬 빛·입자와 피해 숫자는 실시간으로 흐른다 (히트스톱 중에도 빛은 번진다)
    this.skfx.update(delta);
    this.dmg.update(delta);
    // 내 view.sync 다음에 (이름표 겹침 풀기가 내 위치를 쓴다). 같은 방 사람들은 멈춤·히트스톱과 상관없이 계속 움직인다
    this.presence?.update(performance.now(), this.cameras.main.worldView, 1 / this.cameras.main.zoom);
    if (this.presence) for (const r of this.presence.remotes.values()) this.ghost(r);
  }

  /**
   * 11/13 같은 사냥터 사람의 공격·스킬 동작 (보여 주기만 — 그 사람의 몬스터·판정은 내 화면에 없다).
   * 기본 공격은 무기 궤적을 연하게, 스킬은 갈래 색 고리 + 머리 위에 스킬 이름. 소리는 내지 않는다
   */
  private remoteHunt(r: RemoteAvatar, h: HuntAct): void {
    const ang = (h.a * Math.PI) / 180;
    if (h.k === "atk") {
      const style: WeaponStyleId = h.w && h.w in WEAPON_STYLES ? (h.w as WeaponStyleId) : "swing";
      this.fx.motion(style, r.x + Math.cos(ang) * 4, r.y - 6 + Math.sin(ang) * 3, ang, 18, h.f === true)?.setAlpha(GHOST_ALPHA + 0.15);
      return;
    }
    const def = h.s ? skillById(h.s as SkillId) : undefined;
    if (!def) return;
    const pal = PALETTES[def.branch];
    const ring = this.add.image(r.x, r.y - 6, RTEX.ring).setTint(pal.main).setDepth(1e5).setScale(0.2).setAlpha(0.6);
    this.tweens.add({ targets: ring, scale: 22 / 32, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    const atlas = this.data0.atlas;
    if (!atlas) return;
    atlas.ensure(def.name);
    const lb = r.view.label;
    const t = this.add
      .bitmapText(lb.x, lb.y - lb.height - 1, FONT_KEY, def.name, FONT_PX)
      .setOrigin(0.5, 1)
      .setScale(1 / this.cameras.main.zoom)
      .setTint(pal.light)
      .setDepth(lb.depth + 1);
    this.tweens.add({ targets: t, y: t.y - 8, alpha: 0, delay: 500, duration: 700, onComplete: () => t.destroy() });
  }

  /**
   * 11/12 함께 사냥: 공간은 같이 쓰지만 스테이지(몬스터·전투)는 각자 → 다른 사람은 연하게, 머리 위에 "사냥 중".
   * 몸(시트에 그려진 꾸미기 포함)과 이름표만 연하게 한다. 이름이 바뀌어 다시 만들어진 아바타는 새 객체라 다시 붙는다
   */
  private ghost(r: RemoteAvatar): void {
    const v = r.view;
    // 11/13 자리 비움(탭을 숨겼거나 판을 멈춤) = 그 사람 화면이 멈춰 있다 → 더 연하게, 이름표에 알린다
    const away = this.presence?.away.has(r.sid) ?? false;
    const alpha = away ? AWAY_ALPHA : GHOST_ALPHA;
    if (v.sprite.alpha !== alpha) v.sprite.setAlpha(alpha);
    if (this.ghosted.get(r) === away) return;
    this.ghosted.set(r, away);
    v.setName(`${away ? "자리 비움" : "사냥 중"}\n${r.name}`);
    v.label.setCenterAlign().setAlpha(0.75);
  }

  private step(delta: number): void {
    // 11/20 회장님 독대: 업무 브리핑(멈춤) · 처음 보는 기술(0.3배) · 쓰러짐(회색 느리게)
    if (this.chair && !this.paused) {
      delta = this.chair.frame(delta);
      // 브리핑·결과 대기(시간이 안 흐름)에도 HUD는 보낸다
      if (delta <= 0 && ++this.chairHudN % 8 === 0) bridge.emit("rpg:hud", this.hud());
    }
    if (this.hitstop > 0 && !this.paused) {
      this.hitstop -= delta;
      return;
    }
    // 큰 광역기 직후 짧은 슬로 (게임 시간이 40%로 흐른다)
    if (this.slowMoUntil > 0 && performance.now() < this.slowMoUntil) delta *= 0.4;
    if (!this.tickCommon(delta)) return;
    const dt = Math.min(delta, 100) / 1000;
    const now = this.now;
    const d = this.dv;
    this.liftCut?.update(now);
    this.intro?.update(now);
    this.bossChest?.update(now);
    // 미뤄 둔 일 (휘두르는 동작 뒤 판정 등)
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= now);
      this.laters = this.laters.filter((l) => l.at > now);
      for (const l of due) l.fn();
    }

    // 웨이브
    const aliveAll = this.pendingSpawns > 0 || this.mons.some((m) => m.alive);
    if (this.chair) {
      // 11/20 회장님 독대: 웨이브·승리 없음 (내가 쓰러질 때까지)
    } else if (this.nextWave < this.plan.length) {
      const w = this.plan[this.nextWave];
      const prevDone = !aliveAll;
      // 11/15 야근 빌딩: 엘리베이터 문이 열리기 전에는 나오지 않는다
      if (!this.lift && ((prevDone && now - this.floorAt >= w.earliestSec * 1000) || now - this.lastWaveAt >= WAVE_MAX_GAP_SEC * 1000)) this.spawnWave();
    } else if (this.play.tower) {
      if (!aliveAll && !this.lift && !this.died && !this.endSnap) this.clearFloor();
    } else if (!aliveAll && !this.victoryAt && !this.died && !this.endSnap) {
      this.victoryAt = now + 1200;
      this.flash("모든 웨이브를 막아 냈어요!", 2000);
      this.sfx.play("victory");
      // 결과는 지금 잡는다 (걸린 시간은 예전처럼 1.2초 뒤 끝난 것으로 → 랭킹 기록이 드롭 줍는 시간만큼 늘지 않는다)
      this.endRun({ ...this.result(), durationMs: Math.round(Math.min(this.victoryAt, this.limitMs)) }, false, 1200);
    }
    if (!this.endSnap && !this.lift && now >= this.runLimitMs && !this.died) {
      this.flash("시간이 다 됐어요", 1500);
      this.endRun(this.result(), true, 0);
    }
    // 바닥 드롭 (우두머리 몫은 싸우는 중에도 바닥에 있다)
    this.loot.update(now, Math.min(delta, 100));
    // 판 끝: 드롭을 다 주웠거나(놓쳐도 잠시 뒤 날아온다) 기다림이 끝나면 결과를 보낸다
    if (this.endSnap) {
      if (now >= this.endAt) {
        if (now >= this.lootDeadline) this.loot.rush();
        if (this.loot.count === 0 || now >= this.lootDeadline + 900) return this.finish();
      }
      // 시간 끝·쓰러짐: 몬스터·이동은 멈춘 채 드롭만 날아온다
      if (this.over) return;
    }

    // 재생·버프
    if (this.chairHealOn) this.chairHealTok = Math.min(d.maxHp * CHAIR_HEAL_CAP_PER_SEC, this.chairHealTok + d.maxHp * CHAIR_HEAL_CAP_PER_SEC * dt);
    if (now >= this.regenAt) {
      this.regenAt = now + 1000;
      this.sp = Math.min(d.maxSp, this.sp + huntSpRegen(d.maxSp) * (1 + this.tm.spRegen));
      this.hp = Math.min(d.maxHp, this.hp + d.maxHp * 0.004 * this.curse.healMul);
    }
    // 상태 이상: 끝난 것 정리 + 지속 피해 (무적이면 안 받고, 이걸로는 쓰러지지 않는다 — HP 1에서 멈춤).
    // 11/17 숫자는 맞은 숫자와 같은 빨강(조금 작게), HUD가 줄어든 만큼. 독·화상이 한 프레임에 같이 와도 하나로 합친다
    const sd = this.status.update(now, d.maxHp, this.movingNow);
    if (!this.died && !this.buff("invuln")) {
      for (const x of sd.dmg) {
        const before = this.hp;
        this.hp = Math.min(before, Math.max(1, before - x.amount));
        this.showHurt(before, "dot");
      }
    }
    // 11/17 세트 장비 발동 효과 (야근 4세트는 체력 30% 아래로 떨어지는 순간) → 발동 표시
    this.sg.watch(this.hp, d.maxHp);
    this.flushSgProcs();
    this.eggTick(now);

    // 이동
    if (!this.died) {
      // 상태 이상: 빙결은 제자리, 혼란은 방향이 거꾸로, 둔화는 느리게
      const frozen = this.status.has("freeze", now);
      const a0 = this.axis();
      const a = this.status.has("confuse", now) ? { x: -a0.x, y: -a0.y } : a0;
      // 11/17 낙법으로 구르는 동안은 걷기 입력·지형 밀림 없이 구르는 쪽으로만
      const rolled = this.rollStep(now);
      const moving = !rolled && Math.hypot(a.x, a.y) > 0.15 && now >= this.rootUntil && !frozen;
      // 40번 지형: 늪·덩굴은 느리게, 웅덩이는 미끄럽게, 컨베이어·문·바람은 밀어낸다
      // 11/20 회장님 독대만 달린다 (Shift는 숫자와 같이 누르면 자동 켜기·끄기 — 혼자 누르면 달리기)
      const run = moving && this.canRun() && (this.runTouch || this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
      const spd = moving ? this.moveSpd(now, run) : 0;
      const v0 = rolled ? { x: 0, y: 0 } : this.arena.playerVelocity(a.x * spd, a.y * spd, this.px, this.py, dt, now);
      // 11/15 냉각수 웅덩이: 미끄러진다
      const v = !rolled && this.theme?.playerVelocity ? this.theme.playerVelocity(v0, dt) : v0;
      const [ex, ey] = [this.px, this.py];
      if (v.x || v.y) {
        this.px = Phaser.Math.Clamp(this.px + v.x * dt, WALL + PLAYER_R, W - WALL - PLAYER_R);
        this.py = Phaser.Math.Clamp(this.py + v.y * dt, WALL + PLAYER_R + 8, H - WALL - 2);
        const p = { x: this.px, y: this.py };
        for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
        this.arena.collide(p, PLAYER_R);
        this.px = p.x;
        this.py = p.y;
      }
      // 11/19 숨겨진 5세트 「마일리지 적립」: 걸은 거리
      if (this.egg.any && this.egg.walk(Math.hypot(this.px - ex, this.py - ey))) this.floatText(this.px, this.py - 30, "마일리지 가득!", "#ffd27a", 10);
      if (moving) {
        // 11/15 공격·스킬 판정 중에는 겨냥한 쪽을 그대로 본다 (뒷걸음질로 걷는다)
        if (now >= this.faceLockUntil) this.setFace(a.x, a.y);
        this.walkT += delta;
      }
      this.movingNow = moving || rolled;
      this.runningNow = run && !rolled;
      if (rolled) this.walkT += delta;
      else if (this.runningNow) {
        this.walkT += delta * (CHAIR_RUN - 1);
        if (now - this.dustAt > 90) {
          this.dustAt = now;
          this.fx.dust(this.px, this.py);
        }
      }
      if (this.me) this.me.apply(this.runningNow ? "run" : this.movingNow ? "walk" : "idle", (this.dirRow as DirId) ?? DIR.down, this.time.now);
      else this.player.setFrame(avFrame(this.dirRow, this.movingNow ? 2 + (Math.floor(this.walkT / 120) % 4) : Math.floor(now / 500) % 2));
      // 버퍼에 한 번 있거나, 공격 키·마우스·손가락을 누르고 있으면 쿨다운이 끝나는 순간 친다
      const held = this.holdOn || this.keys.has("Space") || this.keys.has("KeyJ");
      // 11/15 야근 빌딩도 기본 공격은 직접 (자동 공격 없음) — 서서 치면 멈추면 집중으로 더 빠르다
      if ((held || this.atkBuffered) && now >= this.atkReadyAt && now >= this.rootUntil && !frozen) {
        if (this.holdOn && this.holdAim) {
          const p = this.toWorld(this.holdAim.x, this.holdAim.y);
          if (Math.hypot(p.x - this.px, p.y - this.py) > 2) this.setFace(p.x - this.px, p.y - this.py);
        }
        this.attack(false);
      }
      // 11/15 자동 스킬 (0.4초에 하나, 판이 끝나 드롭만 줍는 중에는 안 쓴다)
      if (this.auto.on && !this.endSnap && !this.lift && now - this.autoAt >= AUTO_GAP_MS) this.autoCast(now);
    }
    if (this.me) {
      this.me.place(Math.round(this.px), Math.round(this.py));
      this.me.sync(this.time.now, 1 / this.cameras.main.zoom);
    }
    this.player.setPosition(Math.round(this.px), Math.round(this.py)).setDepth(this.py);
    // 11/17 낙법: 굴러가는 쪽으로 몸을 숙였다 일어나며 살짝 뜬다 + 잔상 (AvatarView.sync가 매 프레임 기울기를 되돌리므로 그 뒤에 입힌다)
    if (rolling(this.dodge, now)) {
      const pose = rollPose(rollT(this.dodge, now), this.rollVec.x < -0.2 ? -1 : 1, this.data0.reduced);
      this.player.setAngle(pose.angle).setY(this.player.y - pose.lift);
      this.dodgeFx.trail(this.player, now);
    } else if (!this.me && this.player.angle !== 0) this.player.setAngle(0);
    this.player.setAlpha(this.died ? 0.5 : this.buff("invuln") ? 0.55 + 0.3 * Math.sin(now / 60) : 1);
    this.pShadow.setPosition(this.px, this.py);
    this.held?.update(Math.round(this.px), Math.round(this.py), this.face.x, this.face.y, this.py, this.player.alpha, now);
    this.selfLight?.update(this.px, this.py - 10, now);
    this.drawGauge(now);
    this.drawStatus(now);
    this.drawChairBars(now);

    // 도우미 유령
    const h = this.helper;
    if (h) {
      if (now > h.until) {
        h.sprite.destroy();
        this.helper = null;
      } else {
        h.sprite.setPosition(h.sprite.x + (this.px - 14 - h.sprite.x) * 0.1, h.sprite.y + (this.py - 10 - h.sprite.y) * 0.1);
        h.sprite.setFrame(Math.floor(now / 300) % 2).setDepth(this.py);
        if (now > h.nextAtk) {
          h.nextAtk = now + 800 * this.soulEvery();
          const t = this.nearest(60);
          if (t) {
            this.fx2Bolt(h.sprite.x, h.sprite.y, t, true);
            this.passiveSnd("so_friend", 120, "tick");
            this.passiveSnd("so_kinship", 1500);
            if (!h.group || h.group.closed) h.group = this.dmg.group(h.sprite.x, h.sprite.y - 30, "soul", 1300, 3);
            this.strike(t, this.buff("so_friend") * this.dv.skillPower * (1 + this.mods.summonPct) * this.paradeMul(), true, 0, { skill: "soul", weight: 1, group: h.group, sid: "so_friend" });
          }
        }
      }
    }

    this.updateTurret(now);
    this.updateFields(now);
    this.updateWorker(now, delta);
    // 서리 방패: 방패가 남아 있는 동안 육각 껍질이 일렁인다
    this.mv.wardIdle(this.px, this.py, now, this.shield > 0 && this.buff("fr_ward") > 0);
    // 바람 넋: 움직이는 동안 잔상
    if (this.movingNow && this.buff("so_swift") && now >= this.ghostAt) {
      this.ghostAt = now + 90;
      this.skfx.ghost(this.player, "soul", 0.35);
    }

    // 몬스터
    for (const m of this.mons) {
      if (!m.alive) continue;
      this.updateMonster(m, dt);
      if (!m.alive) continue;
      if (m.slowUntil && m.slowUntil < now) {
        m.slowUntil = 0;
        m.sprite.clearTint();
      }
      const size = MONSTERS[m.id].size;
      m.sprite.setPosition(Math.round(m.x), Math.round(m.y)).setDepth(m.y).setFrame(monsterFrame(m, now)).setFlipX(this.px < m.x);
      m.shadow.setPosition(m.x, m.y);
      const top = m.y - size - 3;
      // 11/15: 체력 막대는 늘 보인다 — 어두운 맵·숨는 몬스터 때문에 어디 있는지 몰라 답답했다 (사용자 요청).
      // 어둠·숨기 기믹은 몸 그림에만 걸린다
      const showBar = !m.noBar;
      const eTop = m.elite ? m.y - size * ELITE.scale - 3 : top;
      m.barBg.setPosition(m.x, eTop).setVisible(showBar);
      m.bar.setPosition(m.x - size / 2, eTop).setSize(Math.max(0, (size * m.hp) / m.st.maxHp), 2).setVisible(showBar);
    }
    this.mons = this.mons.filter((m) => m.alive);
    this.separate();
    // 40번: 지형 기믹·우두머리 졸개·조명·입자
    this.arena.update(now, dt, { x: this.px, y: this.py }, this.mons, this.face);
    this.theme?.update(now, dt);
    this.chair?.update(dt);
    // 2번 바닥 경고 · 40번 내 투사체 · 16번 콤보
    this.tele.update(now);
    this.updatePShots(dt);
    this.cards?.update(dt);
    if (this.combo && now - this.comboAt > COMBO_RESET_MS) this.combo = 0;
    // 11/21 폰 HUD B: 이름 아래는 체력 막대 → 콤보는 이름 오른쪽 옆에 (이름을 덮지 않게)
    const lb = this.chairSlim ? this.me?.label : undefined;
    if (lb) this.fx.combo(this.died ? 0 : this.combo, lb.x + lb.displayWidth / 2 + 3 / this.cameras.main.zoom, lb.y + 1 / this.cameras.main.zoom, true);
    else this.fx.combo(this.died ? 0 : this.combo, this.px, this.py - 33);

    // 투사체 (11/15 서류 폭풍이면 바람에 휘어 날아온다)
    const wind = this.arena.shotWind(now);
    const tw = this.theme?.shotWind?.();
    for (const s of this.shots) {
      s.x += (s.vx + wind + (tw?.x ?? 0)) * dt;
      s.y += (s.vy + (tw?.y ?? 0)) * dt;
      s.sprite.setPosition(s.x, s.y);
      // 11/17 낙법으로 구르는 중이면 투사체가 몸을 지나간다
      if (!rolling(this.dodge, now) && Math.hypot(s.x - this.px, s.y - (this.py - 8)) < 8) {
        s.until = 0;
        // 11/19 삽으로 막기: 투사체도 같은 확률로 쳐낸다 (쏜 몬스터마다 2초에 한 번, 피해 −70%)
        let pd = damage(s.dmg, 1, d.def, Math.random(), false);
        const shooter = s.src ? this.mons.find((m) => m.id === s.src!.id && m.alive) : undefined;
        const key = shooter ?? this;
        if (this.mods.parry > 0 && !this.died && (this.parryAt.get(key) ?? -1e9) + SKILL_FX.wk_back(1).parryGapMs <= now && Math.random() < this.mods.parry) {
          this.parryAt.set(key, now);
          pd = Math.max(1, Math.round(pd * (1 - SKILL_FX.wk_back(1).parryCut)));
          this.floatText(this.px, this.py - 22, "쳐냄!", "#e8d2a8", 10);
          this.sfx.play("crit", 0.25);
          this.skfx.sparks(s.x, s.y, 6, [0xffffff, 0xd8d8d0, 0xffd27a], 120, { life: 220 });
        }
        this.hurtPlayer(pd, s.src);
      }
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) s.until = 0;
    }
    for (const s of this.shots) if (s.until <= now) s.sprite.destroy();
    this.shots = this.shots.filter((s) => s.until > now);
  }

  // ── 결과·HUD ──

  private wavesCleared(): number {
    let k = 0;
    while (k < this.nextWave && this.waveAlive[k] <= 0) k++;
    return k;
  }

  protected hud(): RpgHud {
    const d = this.dv;
    const now = this.now;
    const boss = this.mons.find((m) => m.alive && (MONSTERS[m.id].behavior === "boss" || (m.wave === this.plan.length - 1 && m.id === this.zone.boss)));
    return {
      game: "hunt",
      // 11/17 정수로, 살아 있으면 1 이상 (0.4가 남았는데 0으로 보이지 않게 — 빨간 숫자도 이 값의 차이로 띄운다)
      hp: hpShown(this.hp),
      maxHp: d.maxHp,
      sp: Math.round(this.sp),
      maxSp: d.maxSp,
      // 11/17 야근 빌딩: 엘리베이터 문이 열리기 전(floorAt이 앞날)에는 새 층 제한 시간 그대로 (예전엔 1:34처럼 층 시간보다 크게 보였다)
      leftMs: Math.max(0, this.runLimitMs - Math.max(this.lift ? this.floorMs : now, this.floorAt)),
      score: this.killCount,
      wave: [Math.max(1, this.nextWave), this.plan.length],
      ...(this.play.tower ? { floor: this.floor } : {}),
      kills: this.killCount,
      combo: this.combo,
      cooldowns: this.play.hotbar.map((id) => {
        if (!id) return 0;
        const left = (this.skillReady[id] ?? 0) - now;
        return left > 0 ? left / this.cdOf(id) : 0;
      }),
      potionCooldown: Math.max(0, (this.potionReadyAt - now) / POTION_COOLDOWN_MS),
      // 11/15 칸별 SP 비용 · 자동 상태
      skillSp: this.play.hotbar.map((id) => (id ? this.spCost(id, this.play.skills[id] ?? 1) : 0)),
      // 11/21 도는 중인 회오리 칸: 남은 시간 비율 (칸 테두리 시계)
      active: this.play.hotbar.map((id) => (id === "wk_whirl" && this.whirl ? Math.max(0, (this.whirl.until - now) / Math.max(1, this.whirl.until - this.whirl.at)) : 0)),
      auto: { slots: this.play.hotbar.map((id, i) => i < SKILL_SLOTS && !!id && this.auto.ids.includes(id)), on: this.auto.on, keepUlt: this.auto.keepUlt },
      attack: Math.max(0, (this.atkReadyAt - now) / this.atkCdMs),
      // 11/17 낙법 쿨타임 (스킬 칸 옆 칸·폰 구르기 버튼)
      dodge: dodgeCooldown(this.dodge, now),
      peers: this.presence ? this.peers || undefined : undefined,
      attackBuffered: this.atkBuffered,
      potions: Object.fromEntries(Object.keys(this.play.potions).map((id) => [id, this.potionLeft(id)])),
      buffs: [...this.buffs].filter(([, b]) => b.until > now).map(([id, b]) => ({ id, leftMs: b.until - now })),
      statuses: this.status.list(now),
      boss: boss ? { name: MONSTERS[boss.id].name, ratio: Math.max(0, boss.hp / boss.st.maxHp) } : null,
      message: now < this.messageUntil ? this.message : undefined,
      ...(this.cards ? { run: this.cards.hud(!this.movingNow && !this.died) } : {}),
      // 11/15 능력치 판: 카드를 얹기 전(dvBase)과 전투가 쓰는 지금(dv) — 보통 사냥은 카드 몫 없이
      stats: statPanel(this.dvBase, this.dv, this.wstyle.cdMul, this.cards?.stats ?? null, this.cards?.spare),
      // 11/20 회장님 독대: 체력 막대·웨이브 대신 단계 이름 · 반려 도장
      ...(this.chair ? { chair: this.chair.hudChair(), boss: null, wave: undefined } : {}),
    };
  }

  // ── 11/20 회장님 독대 (game/chairman) ──

  /** 봉인된 스킬을 뺀 스킬 표 (패시브·연계 보너스 계산용) */
  private get skillsLive(): Partial<Record<SkillId, number>> {
    return this.sealed.size ? liveSkills(this.play.skills, this.sealed) : this.play.skills;
  }

  /** 달릴 수 있는 판 (회장님 독대만 — 다른 사냥 밸런스는 그대로) */
  private canRun(): boolean {
    return !!this.chair;
  }

  /** 이동 속도 (px/s): 능력치 × 버프·상태·지형·휘두르기·이스터에그 × 달리기 */
  private moveSpd(now: number, run: boolean): number {
    const d = this.dv;
    return d.move * (1 + this.buff("so_swift")) * this.status.moveMul(now) * this.arena.speedMul(this.px, this.py) * (this.whirl ? SKILL_FX.wk_whirl(this.whirl.lv).moveMul : 1) * this.eggMove * (run ? CHAIR_RUN : 1);
  }

  /** 회장님(쓰러지지 않는 자리) + 싸움 실행부 */
  private startChair(): void {
    const c = this.play.chairman!;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 게터 안에서 씬을 가리킨다
    const sc = this;
    const host: ChairHost = {
      scene: this,
      skfx: this.skfx,
      fx: this.fx,
      dmg: this.dmg,
      reduced: this.data0.reduced,
      mode: c.mode,
      practice: c.practice,
      sealPool: c.mode === "hell" ? c.sealPool : [],
      hotbar: this.play.hotbar,
      best: c.best,
      acct: c.acct,
      now: () => sc.now,
      player: () => ({ x: sc.px, y: sc.py }),
      moveMax: () => sc.moveSpd(sc.now, true),
      topPad: () => chairCamPad(sc.cameras.main.width, sc.cameras.main.height)[0],
      rolling: () => rolling(sc.dodge, sc.now),
      hurt: (d) => sc.hurtPlayer(d),
      // 당첨 캡슐(물약)은 회복 감소 없이
      heal: (pct) => {
        if (sc.died) return;
        const n = Math.max(1, Math.round(sc.dv.maxHp * pct));
        sc.healFree = true;
        sc.hp = Math.min(sc.dv.maxHp, sc.hp + n);
        sc.healFree = false;
        sc.dmg.heal(sc.px, sc.py - 20, n);
      },
      maxHp: () => sc.dv.maxHp,
      dead: () => sc.died,
      boss: () => sc.chairBoss,
      spawnBug: (x, y, speed) => {
        sc.spawn("pending_sheet", x, y, 0);
        const m = sc.mons[sc.mons.length - 1];
        if (!m) return null;
        m.minion = true;
        m.noBar = true;
        m.pats = [];
        m.st = { ...m.st, maxHp: 1, speed };
        m.hp = 1;
        m.sprite.setVisible(false);
        return m;
      },
      removeMob: (mm) => {
        const m = mm as Mon;
        if (!m.alive) return;
        m.alive = false;
        m.sprite.destroy();
        m.shadow.destroy();
        m.bar.destroy();
        m.barBg.destroy();
      },
      float: (x, y, text, color) => sc.floatText(x, y, text, color, 10),
      sfx: (name, gain) => sc.sfx.play(name, gain),
      synth: (key, layers, gapMs) => sc.sfx.synth(key, layers, gapMs),
      hitstop: (ms) => (sc.hitstop = Math.max(sc.hitstop, ms)),
      seal: (ids) => sc.applySeal(ids),
      flash: (msg, ms) => sc.flash(msg, ms),
      ended: (r) => {
        sc.chairDone = true;
        c.ended({ ...r, potionsUsed: { ...sc.potionsUsed } });
      },
    };
    this.chair = new ChairmanFight(host);
    this.chair.create(this.play.seed);
    this.chairHealOn = true;
    this.chairHealTok = this.dv.maxHp * CHAIR_HEAL_CAP_PER_SEC;
    // 회장님 자리: 우두머리 크기 몬스터 하나 (맞는 판정·피해 숫자·자동 스킬 조준이 사냥 그대로 돈다)
    this.spawn("midnight_bell", CHAIR_W / 2, 190, 0);
    const m = this.mons[this.mons.length - 1];
    m.chair = true;
    m.noBar = true;
    m.boss = true;
    m.pats = [];
    m.st = { ...chairBossStats(), maxHp: 1e12 };
    m.hp = m.st.maxHp;
    m.sprite.setVisible(false);
    this.chairBoss = m;
  }

  /** 지옥 봉인: 칸은 못 쓰고, 패시브는 효과가 빠진다 (능력치·연계 보너스를 다시 계산) */
  private applySeal(ids: readonly string[]): void {
    const fresh = ids.filter((id) => !this.sealed.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.sealed.add(id);
    const live = this.skillsLive;
    this.mods = skillMods(live);
    this.syn = {};
    for (const id of Object.keys(SYNERGY) as SkillId[]) this.syn[id] = synergyMul(id, live);
    this.dv = withPassives(this.play.derived, this.mods, this.tm);
    this.dvBase = this.dv;
    this.hp = Math.min(this.hp, this.dv.maxHp);
    this.auto.ids = this.auto.ids.filter((id) => !this.sealed.has(id));
    if (this.whirl && this.sealed.has("wk_whirl")) this.stopWhirl();
    // 11/21 반려 알림은 오버레이 가운데 위 도장이 맡는다 (game/chairman/SealParts) — 띠 글자는 겹쳐서 뺐다
  }

  /** 싸우는 중 그만두기: 그 자리에서 쓰러진 것으로 (회색 연출 → 결과) */
  private chairGiveUp(): void {
    if (this.died) return;
    this.hp = 0;
    this.died = true;
    this.status.clear();
    this.sfx.play("defeat");
    this.player.setAlpha(0.5);
  }

  /**
   * 판 끝 (승리·시간 끝·쓰러짐): 결과를 잡아 두고, 그 결과로 서버가 줄 드롭을 마지막으로 잡은 몬스터 자리에서 떨군다.
   * freeze: 몬스터·입력을 멈춘다 (시간 끝·쓰러짐). minMs: 이만큼은 기다렸다 끝낸다 (승리 연출)
   */
  private endRun(r: HuntResult, freeze: boolean, minMs: number): void {
    this.endSnap = r;
    this.over = freeze;
    const now = this.now;
    this.endAt = now + minMs;
    let drops: ReturnType<typeof huntDropsFor> = [];
    try {
      // 테스트 서버 시험 드롭이 실린 판이면 서버가 그것을 준다 (승리·쓰러짐 관계없이) → 예측 대신 그대로
      if (this.play.testDrops?.length) drops = this.bossDropped ? [] : this.play.testDrops;
      // 11/15 연습 판(그날 초월 구간을 다 썼다): 서버가 드롭을 주지 않는다 → 떨구지 않는다
      // 11/15 야근 빌딩은 우두머리 층을 깰 때 상자를 떨궜다 (clearFloor)
      else if (!this.play.noDrops && !this.play.tower && this.dropSeed !== null) {
        drops = huntDropsFor(this.dropTicket(), r);
        // 우두머리 몫은 잡는 순간 이미 떨궜다 → 맨 앞(우두머리 몫)을 뺀 나머지만
        const b = this.bossDropped ? huntBossDrop(this.dropTicket()) : null;
        if (b && drops[0]?.kind === b.kind && drops[0].id === b.id) drops = drops.slice(1);
      }
    } catch {
      // 연출용 계산이 실패해도 판은 그대로 끝난다 (보상은 서버가)
    }
    // 바닥에 닿고 스스로 날아올 때까지 넉넉히 (그 뒤엔 남은 것을 끌어와 끝낸다)
    this.lootDeadline = now + minMs + (freeze ? 2600 : 4200);
    if (!drops.length) return;
    // 마지막으로 잡은 자리에서 (멀면 내 둘레에서)
    const src = this.lootSrc(this.lastKill);
    this.loot.drop(drops, src.x, src.y, freeze || this.died, freeze ? 120 : 380);
  }

  private dropTicket(): DropTicket {
    // 11/15 테스트 서버 슈퍼 계정 시험 드롭 (서버가 판 시작 응답으로 알려 준다 — 서버도 같은 값으로 굴린다)
    // 11/18 드롭은 받은 드롭 시드로, 몬스터 계획은 판 시드로 (서버 evalHunt와 같은 값)
    return { game: "hunt", difficulty: this.play.difficulty, seed: this.dropSeed ?? 0, planSeed: this.play.seed, zone: this.play.zone, ...(this.play.superDrops ? { sup: true } : {}) };
  }

  /** 드롭이 튀어 오를 자리: 멀면 내 둘레, 화면(세로로 긴 휴대폰은 좁다) 안쪽으로 당겨 떨어지는 걸 놓치지 않게 */
  private lootSrc(k: { x: number; y: number } | null): { x: number; y: number } {
    const src = k && Math.hypot(k.x - this.px, k.y - this.py) < 140 ? { ...k } : { x: this.px + this.face.x * 14, y: this.py + 4 };
    const v = this.cameras.main.worldView;
    if (v.width > 80 && v.height > 80) {
      src.x = Phaser.Math.Clamp(src.x, v.x + 34, v.right - 34);
      src.y = Phaser.Math.Clamp(src.y, v.y + 40, v.bottom - 30);
    }
    return src;
  }

  /**
   * 우두머리를 잡은 순간: 서버가 줄 우두머리 몫(같은 난수 줄의 맨 앞 — huntBossDrop)을 그 자리에 떨군다.
   * 운영자 시험 드롭이 실린 판이면 그 묶음을 모두 여기서. 너무 짧은 판(서버가 드롭을 주지 않는 8초 미만)이면 판 끝으로 미룬다
   */
  private dropBossLoot(x: number, y: number): void {
    const test = this.play.testDrops;
    if (!test?.length && (this.now < MIN_RUN_MS || this.play.noDrops)) return;
    this.bossDropped = true;
    let drops: ReturnType<typeof huntDropsFor> = [];
    try {
      if (test?.length) drops = test;
      else if (this.dropSeed === null) return;
      else {
        const b = huntBossDrop(this.dropTicket());
        drops = b ? [b] : [];
      }
    } catch {
      return;
    }
    if (!drops.length) return;
    const src = this.lootSrc({ x, y });
    this.loot.drop(drops, src.x, src.y, this.died, 320);
  }

  /** 드롭만 줍던 중에 나가도 판은 이미 끝났으니 정상 종료로 */
  protected finish(aborted = false): void {
    // 11/20 회장님 독대: 싸우는 중 그만두기 = 그 자리에서 쓰러진 것 (기록을 낸다). 결과 창에서 나갈 때만 진짜로 닫는다
    // 11/22 업무 브리핑 중(시작 전)이면 기록 없이 바로 닫는다 (예전엔 쓰러진 채 브리핑이 걷힐 때까지 기다렸다)
    if (this.chair) {
      const q = chairQuit({ started: this.chair.started, done: this.chairDone, died: this.died });
      if (q === "giveUp") this.chairGiveUp();
      if (q !== "close") return;
      this.chairDone = true;
    }
    if (aborted && !this.endSnap) this.quit = true;
    super.finish(aborted && !this.endSnap);
  }

  // ── 11/15 능력 카드 (game/rpg/cards/CardRun) ──

  /** 카드가 바뀌면: 기본 능력치에 카드를 얹고, 공격 범위(직보)도 다시 */
  private refreshCards(): void {
    if (!this.cards) return;
    this.dv = this.cards.derive(this.dvBase);
    this.area = this.cards.area(this.areaBase);
    this.hp = Math.min(this.hp, this.dv.maxHp);
  }

  /** 카드를 고르는 동안 멈춤 (트윈·지연 호출까지). 멈춤 메뉴가 열려 있으면 풀지 않는다 */
  private cardHold(on: boolean): void {
    if (on) {
      this.tweens.pauseAll();
      this.time.paused = true;
      this.holdOn = false;
      this.holdAim = null;
      this.atkBuffered = false;
      this.keys.clear();
    } else if (!this.paused) {
      this.tweens.resumeAll();
      this.time.paused = false;
    }
  }

  private cardHost(): CardHost<Mon> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- 화살표 함수 묶음에서 씬을 가리킨다
    const sc = this;
    return {
      scene: this,
      reduced: this.data0.reduced,
      now: () => sc.now,
      player: () => ({ x: sc.px, y: sc.py }),
      face: () => sc.face,
      mons: () => sc.mons,
      size: (m) => MONSTERS[m.id].size,
      style: () => sc.wstyle,
      area: () => sc.area,
      strike: (m, mult, nth, o) => sc.strike(m, mult, !!o.sure, nth, { kb: o.kb, basic: o.basic, heavy: o.heavy }),
      dot: (m, mult) => {
        if (!m.alive) return;
        const n = damage(sc.atk(), mult, m.st.def, Math.random(), false);
        m.hp -= n;
        sc.dmg.minor(m.x + (Math.random() - 0.5) * 6, m.y - MONSTERS[m.id].size - 2, n);
        if (m.hp <= 0) sc.killMonster(m);
        else if (m.boss) sc.checkBossPhase(m);
      },
      meleeArc: (ang, area, mult, fin, alpha) => {
        const st = sc.wstyle;
        const f = { x: Math.cos(ang), y: Math.sin(ang) };
        sc.fx.motion(st.id, sc.px + f.x * 4, sc.py - 6 + f.y * 3, ang, area.range, fin, area.arcDeg)?.setAlpha(alpha);
        let k = 0;
        for (const m of [...sc.mons])
          if (m.alive && !m.hidden && inAttackArea(area, f, m.x - sc.px, m.y - sc.py, MONSTERS[m.id].size / 2))
            sc.strike(m, mult, false, k++, { kb: st.kb, stun: st.stunMs, heavy: st.id === "smash", basic: true });
      },
      ink: (x, y, r, mult, delay) => {
        const st = sc.wstyle;
        sc.fx.castMark(x, y, r, delay);
        const bolt = sc.add.image(sc.px, sc.py - 8, FXT.inkBolt).setDepth(1e5);
        sc.tweens.add({ targets: bolt, x, y: y - 4, duration: Math.max(60, delay), ease: "Quad.easeIn", onComplete: () => bolt.destroy() });
        sc.later(delay, () => {
          sc.fx.ink(x, y, r);
          let k = 0;
          for (const m of [...sc.mons])
            if (m.alive && !m.hidden && Math.hypot(m.x - x, m.y - y) < r + MONSTERS[m.id].size / 2) sc.strike(m, mult, false, k++, { kb: st.kb, stun: st.stunMs, basic: true });
        });
      },
      clampPoint: (x, y) => sc.patHost.clampPoint(x, y),
      solid: (x, y) => {
        const p = { x, y };
        sc.arena.collide(p, 1);
        const d = Math.hypot(p.x - x, p.y - y);
        return d > 0.01 ? { x: (p.x - x) / d, y: (p.y - y) / d } : null;
      },
      bounds: () => ({ x0: WALL, y0: WALL, x1: W - WALL, y1: H - WALL }),
      enemyShots: () => sc.shots,
      hp: () => sc.hp,
      maxHp: () => sc.dv.maxHp,
      healMul: () => sc.curse.healMul,
      heal: (n, show) => {
        if (sc.died || n <= 0) return;
        sc.hp = Math.min(sc.dv.maxHp, sc.hp + n);
        if (show) sc.dmg.heal(sc.px, sc.py - 20, n, n > sc.dv.maxHp * 0.2);
      },
      later: (ms, fn) => sc.later(ms, fn),
      hold: (on) => sc.cardHold(on),
      canPick: () => !sc.died && !sc.down && !sc.endSnap && !sc.ended && !sc.paused,
      floorsCleared: () => sc.floorsCleared,
      refresh: () => sc.refreshCards(),
      addSp: (n) => (sc.sp = Math.min(sc.dv.maxSp, sc.sp + n)),
      invuln: (ms) => sc.buffs.set("invuln", { until: sc.now + ms, v: 1 }),
      flash: (msg, ms) => sc.flash(msg, ms),
      float: (x, y, text, color, px) => sc.floatText(x, y, text, color, px ?? 10),
      synth: (key, layers) => sc.sfx.synth(key, layers),
      shake: (ms, k) => sc.fx.shake(ms, k),
      ring: (x, y, color, r) => sc.ringFxAt(x, y, color, r),
    };
  }

  // ── 11/15 야근 빌딩: 층을 깨면 엘리베이터 → 다음 층 (체력·SP·버프·상태 이상은 그대로) ──

  /** 지금 판(보통 사냥) 또는 지금 층(야근 빌딩)이 끝나는 시각 */
  private get runLimitMs(): number {
    // 11/16 야근 빌딩 갈래 칭호면 층마다 몇 초 더 (play.tower.bonusSec)
    return this.play.tower ? this.floorAt + (towerFloorSec(this.floor) + (this.play.tower.bonusSec ?? 0)) * 1000 : this.limitMs;
  }

  /** 층 클리어: 우두머리 층이면 체력 회복 + 상자(오늘 남은 만큼 — 서버와 같은 굴림), 잠시 뒤 엘리베이터 */
  private clearFloor(): void {
    const f = this.floor;
    this.lift = true;
    this.floorsCleared++;
    if (this.logFt.length < 400) this.logFt.push(Math.round(this.now));
    this.floorMs = this.now;
    // 11/15 10층마다 우두머리 뒤 상사의 제안
    if (this.cards && isBossDealFloor(f)) this.cards.bossDeal(f);
    this.sfx.play("victory");
    if (isBossFloor(f)) {
      const heal = Math.round(this.dv.maxHp * TOWER_BOSS_HEAL * this.curse.healMul);
      this.hp = Math.min(this.dv.maxHp, this.hp + heal);
      this.dmg.heal(this.px, this.py - 20, heal);
      // 11/15 우두머리 상자: 우두머리가 쓰러진 자리의 상자가 층을 깨는 순간 열리고, 안의 것은 사냥터 드롭처럼 튀어나온다 (빔·소리·줍기 그대로).
      // 오늘 남은 상자만큼 — 서버(towerSettle)와 같은 순서·같은 굴림(towerChestDrops: 11/18 드롭 시드 + 층)
      let opened = false;
      // 11/19 상자는 TOWER_CHEST_FROM층부터 (서버 towerChestFloors와 같다)
      if (this.chestsLeft > 0 && isChestFloor(f)) {
        this.chestsLeft--;
        const c = this.bossChest ?? new BossChest(this, this.lootSrc(this.lastKill).x, this.lootSrc(this.lastKill).y, this.now, RTEX.glow, this.data0.reduced);
        this.bossChest = c;
        const at = c.open(this.now);
        opened = true;
        // 11/15 세트 장비 천장은 상자를 여는 순서대로 센다 (서버 finishTower와 같은 순서·같은 값)
        let drops: ReturnType<typeof towerChestDrops> = [];
        try {
          // 11/18 드롭 시드를 못 받았으면 상자 안 연출만 빠진다 (결과 화면에 그대로)
          if (this.dropSeed !== null) {
            drops = towerChestDrops(this.dropSeed, f, this.play.tower?.start ?? 1, this.sgPity, !!this.play.superDrops, this.play.tower?.sgChance);
            this.sgPity = nextPity(drops, this.sgPity);
          }
        } catch {
          // 연출만 빠진다 (보상은 서버가)
        }
        this.later(at - this.now, () => {
          this.sfx.play("levelup", 0.7);
          this.fx.shake(140, 0.004);
          try {
            // 상자에는 물약·결재 서류가 늘 들어 있어서(towerChestDrops) 빈 상자는 없다 — 드롭이 없으면 시드를 못 받은 것
            if (drops.length) {
              // 11/27 60층부터(탕비실 폐쇄) 물약은 가방에 들어가지 않고 판 끝에 바로 팔린다 (서버 settleTowerRun과 같은 나눔)
              const sp = splitChestPotions(f, drops);
              if (sp.keep.length) this.loot.drop(sp.keep, c.x, c.y - 8, false, 60);
              const n = Object.values(sp.sold).reduce((a, b) => a + b, 0);
              if (n > 0) this.floatText(c.x, c.y - 26, `물약 ${n}개는 바로 팔아요 +${potionSaleValue(sp.sold)}P`, "#ffe08a", 10);
            } else this.floatText(c.x, c.y - 26, "상자 안은 결과 화면에서 보여요", "#c8c0a8", 10);
          } catch {
            // 연출만 빠진다 (보상은 서버가)
          }
        });
        this.flash(`${f}층 우두머리를 처치했어요! HP가 회복되고 상자가 열려요`, 2200);
      } else {
        this.bossChest?.destroy();
        this.bossChest = null;
        // 11/24 상자 없는 우두머리 층(50층까지). 하루 상자 한도는 없어서(TOWER_CHESTS_PER_DAY) 「오늘 상자는 다 받았어요」는 뺐다
        this.flash(`${f}층 우두머리를 처치했어요! HP가 회복됐어요`, 2400);
      }
      // 상자에서 나온 것을 보여 줄 틈: 다 주웠으면 바로, 아니면 잠시 뒤 끌어오고 엘리베이터 (아무것도 놓치지 않는다)
      if (opened) {
        this.waitLoot(f, this.now + 2600, this.now + 5200);
        return;
      }
    } else this.flash(`${f}층 클리어!`, 1500);
    // 바닥에 떨어진 것을 끌어오고, 문이 닫힌다
    this.later(900, () => this.loot.rush());
    this.later(1500, () => this.liftTo(f + 1));
  }

  /** 11/15 상자 드롭을 다 주울 때까지(최소 minAt, 길어도 maxAt) 기다렸다 엘리베이터. maxAt 1.2초 전에 남은 것을 끌어온다 */
  private waitLoot(f: number, minAt: number, maxAt: number): void {
    const tick = () => {
      if (this.endSnap || this.ended) return;
      const now = this.now;
      if (now >= maxAt - 1200) this.loot.rush();
      if ((now >= minAt && this.loot.count === 0) || now >= maxAt) {
        this.loot.rush();
        this.liftTo(f + 1);
        return;
      }
      this.later(150, tick);
    };
    this.later(400, tick);
  }

  /**
   * 11/15 엘리베이터 (game/tower/elevator): 문이 지금 방을 덮으며 닫히고 → 층 표시가 오르며 웅·살짝 흔들림 → 띵 → 새 층 방에서 열린다 (약 2.2초).
   * 문이 닫혀 있는 동안 새 층(층 시드의 지도·계획·저주·테마)으로 바꾼다. 우두머리 층은 표시가 붉게 깜빡이고 낮은 종소리
   */
  private liftTo(f: number): void {
    if (this.endSnap || this.ended) return;
    this.rootUntil = Number.MAX_SAFE_INTEGER;
    const swap = () => {
      if (this.endSnap || this.ended) return;
      this.floor = f;
      this.zone = towerZone(this.play.seed, this.play.tower!.start, f);
      this.curse = towerCurseFx(f);
      this.plan = towerPlan(this.play.seed, f, this.play.tower!.start);
      this.nextWave = 0;
      this.waveAlive = this.plan.map(() => 0);
      for (const sh of this.shots) sh.sprite.destroy();
      this.shots = [];
      for (const t of [...this.tele.all()]) this.tele.cancel(t);
      this.arena.destroy();
      this.bossChest?.destroy();
      this.bossChest = null;
      this.arena = new Arena(this, this.zone.id, floorSeed(this.play.seed, f), this.arenaHooks, { floor: f, runSeed: this.play.seed, start: this.play.tower!.start }, this.concept);
      this.theme = this.makeTheme();
      this.px = this.arena.start.x;
      this.py = this.arena.start.y;
      // 문이 다 열릴 때까지 웨이브는 멈춰 있다 (lift)
      this.floorAt = this.lastWaveAt = this.now + 1200;
    };
    if (!this.liftCut) {
      swap();
      this.liftOpened(f);
      return;
    }
    this.liftCut.start(this.now, "floor", f - 1, f, isBossFloor(f), swap, () => this.liftOpened(f));
  }

  /** 엘리베이터 문이 열렸다: 잠깐 숨 고른 뒤 첫 웨이브 (층 이름을 읽을 틈), 층 표시가 크게 뜬다 */
  private liftOpened(f: number): void {
    if (this.endSnap || this.ended) return;
    this.lift = false;
    this.rootUntil = 0;
    this.floorAt = this.lastWaveAt = this.now + 700;
    const boss = isBossFloor(f);
    const sub = this.theme?.title?.();
    // 11/27 새 저주는 화면(RunHud 새 저주 알림·저주 줄)이 따로 띄운다 (웨이브 알림에 바로 덮이던 것 — 여기서는 층 이름만)
    this.flash(`${f}층 · ${this.zone.name}${sub ? ` · ${sub}` : ""}${boss ? " · 우두머리 층" : ""}`, 2400);
    const t = this.label(this.px, this.py - 26, `${f}F`, boss ? "#ff9a7a" : "#ffe08a", 30).setDepth(1e6).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: this.py - 34, duration: 260, ease: "Quad.easeOut" });
    this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 500, onComplete: () => t.destroy() });
  }

  protected result(): HuntResult {
    if (this.endSnap) return this.endSnap;
    return {
      game: "hunt",
      durationMs: Math.round(this.elapsed),
      kills: { ...this.kills },
      wavesCleared: this.wavesCleared(),
      died: this.died,
      potionsUsed: { ...this.potionsUsed },
      ...(this.play.tower ? { floors: this.floorsCleared, floorMs: Math.round(this.floorMs), ...(this.quit ? { quit: true } : {}) } : {}),
      ...(this.cards ? { cards: this.cards.picks() } : {}),
      // 11/18 판 기록 (관리자 확인 근거)
      ...(this.play.tower ? { log: { ft: [...this.logFt], dmg: Math.round(this.logDmg), sk: { ...this.logSk } } } : {}),
    };
  }
}

/** 점 (px,py)와 선분 (ax,ay)-(bx,by) 사이 거리 */
/** 점이 화면(월드 좌표 사각형) 안에 있나 (pad만큼 걸쳐도 안) — 궁극기 판정 */
export function inView(v: { x: number; y: number; width: number; height: number }, x: number, y: number, pad = 0): boolean {
  return x + pad >= v.x && x - pad <= v.x + v.width && y + pad >= v.y && y - pad <= v.y + v.height;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const u = l2 > 0 ? Phaser.Math.Clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * u), py - (ay + vy * u));
}

/** 스킬 트리 패시브를 판 능력치에 더한다 (서리 옷깃: 방어·최대 HP, 튀는 불티: 치명타, 화롯가 온기: 공격력) */
/**
 * 판 시작 때 한 번 더하는 패시브. 11/19 마공 패시브(화롯가 온기 공격력·튀는 불티 치명타)는 여기서 더하지 않고 마공 피해에만 붙인다 (strike).
 * 공격 속도(손에 익은 삽·빠른 손목)·최대 HP(서리 옷깃·초월의 숨)·방어는 모두에게
 */
/** 11/19 v2 모닥불 광역기의 우두머리 피해 배율 */
const EMBER_AOE_BOSS = 0.6;
/** 11/19 백귀야행 카드: 별빛 행렬 뒤 이만큼 부른 넋 피해 + · 넋 스킬 쿨타임 − */
const PARADE_MS = 8_000;
/** 11/21 백귀야행 부른 넋 피해 +50% → +25% (넋 균형 — 행렬 인도자를 넋 카드 전 수준 근처로) */
const PARADE_DMG = 0.25;
const PARADE_CD = 0.3;
/** 11/19 퇴근길 등불 카드: 넋불이 닿는 거리 */
const SOUL_BURST_R = 70;

function withPassives(d: Derived, m: SkillMods, t: TMods): Derived {
  return { ...d, maxHp: Math.round(d.maxHp * (1 + m.hpPct + t.hpPct)), def: d.def + m.def, aspd: Math.round(d.aspd * (1 + m.aspdPct + t.aspd) * 100) / 100 };
}
