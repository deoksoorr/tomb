import * as Phaser from "phaser";
import { seeded } from "@/lib/rpg/formulas";
import { bridge } from "../bridge";
import type { CombatFx } from "../rpg/combatFx";
import { FXT } from "../rpg/combatFx";
import type { DamageNumbers } from "../rpg/damageNumbers";
import type { RpgSound } from "../rpg/sfx";
import { art } from "../rpg/skillArt";
import { DEPTH_FX, DEPTH_GROUND, SKT, type SkillFx } from "../rpg/skillFx";
import { BLOCK_COLORS, BOSS_H, BOSS_W, bubbleTex, CTX, ensureChairTextures, labelTex } from "./art";
import { chairSound, CHAIR_SND_GAP, type ChairSoundEv } from "./chairSound";
import type { Layer } from "../rpg/skillSound";
import {
  ACX,
  ACY,
  CHAIR_HEAL_TEXT,
  AH,
  ARENA,
  AW,
  DMG,
  leadAim,
  MailSeq,
  mailWaves,
  boomCount,
  boomLayout,
  flipWarn,
  GATHER,
  gatherBall,
  gatherCount,
  gatherPlan,
  stepGather,
  COFFEE,
  coffeeAt,
  coffeeReady,
  coffeeSpot,
  DROP,
  dropSafe,
  dropSeats,
  dropSweepAt,
  dropWarn,
  type GatherBall,
  patVariant,
  type PatVar,
  BK,
  blocks,
  chairPhase,
  chairThreat,
  chairDmgMul,
  DMG_EARLY,
  CHAIR_MAX_MS,
  clampArena,
  coverRect,
  COVER_FP,
  FL,
  hitDamage,
  inRect,
  KILL_INFO,
  layCovers,
  MODE_NAME,
  PHASE_CARD_SEC,
  PHASE_SUB,
  PHASES,
  drawPattern,
  MAIL,
  TRUCK,
  truckGreen,
  truckHits,
  truckLaneTop,
  truckPlan,
  truckShift,
  truckStartX,
  type TruckGreen,
  newPatBag,
  peekPatterns,
  ALL_PATS,
  overlapOf,
  PAT_INFO,
  patternGap,
  phaseKills,
  phaseName,
  rayLen,
  sealClock,
  sealedAt,
  sealSoon,
  SEAL_LINES,
  slotsOf,
  speedOf,
  WH,
  WW,
  type ChairMode,
  type Cover,
  type KillId,
  type PatId,
} from "./rules";

// 11/20 회장님 독대 싸움 (HuntScene 안에서 돈다 — 내 캐릭터·스킬·물약·낙법·자동 스킬은 사냥 그대로).
// 여기는 회장님(2배 그림, 쓰러지지 않음)·게임회사 밈 기술 18가지·즉사 셋·숨을 곳·단계 변신·피해 계기판·지옥 봉인·죽음 연출을 맡는다.
// 시간: update(dt)는 멈춤·히트스톱·처음 보는 기술 느리게를 거친 게임 시간. frame(delta)는 실제 시간 (느리게·회색·브리핑).

/** HuntScene Mon 중 회장님 (그림은 숨기고 자리만 쓴다) */
export type ChairBossMon = { x: number; y: number; hp: number; st: { maxHp: number }; kbx: number; kby: number; sprite: Phaser.GameObjects.Sprite; alive: boolean };
/** 벌레 떼 (HuntScene 졸개 — 내 공격에 맞고 쓰러진다) */
export type ChairMob = { x: number; y: number; alive: boolean; hp: number; sprite: Phaser.GameObjects.Sprite };

export type ChairHost = {
  readonly scene: Phaser.Scene;
  readonly skfx: SkillFx;
  readonly fx: CombatFx;
  readonly dmg: DamageNumbers;
  readonly reduced: boolean;
  readonly mode: ChairMode;
  readonly practice: boolean;
  readonly sealPool: readonly string[];
  readonly hotbar: readonly (string | null)[];
  readonly best: number;
  readonly acct: string;
  /** 게임 시간 ms (멈춤·브리핑 뺀 판 시간) */
  now(): number;
  player(): { x: number; y: number };
  /** 11/20 내 최고 이동 속도 (px/s, 지금 버프·상태 그대로 달리기 배수까지) */
  moveMax(): number;
  /** 11/22 화면 위를 HUD 글자가 가리는 높이 (화면 px — 폰 HUD. PC는 0): 말풍선이 이 밑으로만 */
  topPad?(): number;
  rolling(): boolean;
  /** 맞으면 true (낙법·무적이면 false) */
  hurt(dmg: number): boolean;
  heal(pct: number): void;
  maxHp(): number;
  dead(): boolean;
  boss(): ChairBossMon | null;
  spawnBug(x: number, y: number, speed: number): ChairMob | null;
  removeMob(m: ChairMob): void;
  float(x: number, y: number, text: string, color: string): void;
  sfx(name: RpgSound, gain?: number): void;
  /** 11/20 기술마다 다른 합성음 (같은 key는 gapMs 안에 한 번 — game/rpg/sfx synth) */
  synth(key: string, layers: Layer[], gapMs: number): void;
  hitstop(ms: number): void;
  /** 지옥 봉인 적용 (앞에서부터 이만큼) */
  seal(ids: readonly string[]): void;
  flash(msg: string, ms: number): void;
  /** 죽음 연출이 끝났다 → 결과 (판 시간 ms, 넣은 피해) */
  ended(r: { damage: number; durationMs: number; timeUp: boolean; god?: boolean }): void;
};

type Shape = "circle" | "rect" | "line" | "cross";
type Tele = {
  shape: Shape;
  x: number;
  y: number;
  r: number;
  w: number;
  h: number;
  x1: number;
  y1: number;
  len: number;
  warn: number;
  t: number;
  done: boolean;
  flash: number;
  on?: (z: Tele) => void;
  live?: boolean;
  swapAt?: number;
  swapTo?: boolean;
  swapped?: boolean;
  hatch?: boolean;
  blue?: boolean;
  xmark?: boolean;
  count?: boolean;
  meteor?: boolean;
  stamp?: boolean;
  drop?: number;
  label?: Phaser.GameObjects.Image;
  air?: Phaser.GameObjects.Image;
  air2?: Phaser.GameObjects.Image;
};
type Run = { id: PatId; t: number; ev: [number, () => void][]; pose: (t: number) => string };
type Bullet = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; t: number; life: number; r: number; dmg: number; on: boolean; spin: number };
type Fall = { img: Phaser.GameObjects.Image; fx: number; fy: number; x: number; y: number; t: number; dur: number; arc: number; spin: boolean; land: () => void; keep?: boolean };
type Mob = { kind: "bomb" | "pop" | "gather"; img: Phaser.GameObjects.Image; x: number; y: number; t: number; ttl: number; tx?: number; ty?: number };
type Bug = { m: ChairMob; img: Phaser.GameObjects.Image; ttl: number; bit: boolean };
/** 메일 파도 차례 하나 (rules.MailSeq) + 지금 파도에 맞은 때 · 지금 파도가 깎은 구조물 */
type Mail = { seq: MailSeq; hitT: number; passed: Set<Cover> };
/** L = 이번 프레임 줄마다 구조물에 막힌 길이 (stepBeams가 한 번 재고 draw가 그대로 쓴다) · flipAt = 방향이 뒤집히는 때 */
type Beam = { x: number; y: number; a: number; n: number; dir: number; t: number; warn: number; life: number; sp: number; hitT: number; flipAt: number; L: number[] };
type Zone = { cx: number; cy: number; w: number; h: number; t: number; warn: number; done: boolean; label: Phaser.GameObjects.Image };
type Truck = { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image; lane: number; x: number; y: number; dir: number; t: number; hit: boolean };
/** 11/22 트럭 시위 초록 길: free = 지금 빈 줄 · lanes = 이 기술이 깐 줄 예고 (아직 안 끝난 것이 빨간 줄) */
type TruckSafe = { free: number; lanes: { lane: number; z: Tele }[] };
/** 야근 집합 덩어리: st = 자기 단계 (rules.stepGather — 덩어리마다 따로) · aim = 나를 앞질러 노림 · ghosts = 이 덩어리로 빨려 드는 유령 */
type Ball = { st: GatherBall; box: Phaser.GameObjects.Container; x: number; y: number; vx: number; vy: number; r: number; hit: boolean; aim: boolean; ghosts: Mob[] };
type Laser = { kind: "cross" | "bolt"; x: number; y: number; len: number; w: number; t: number; life: number; pts?: number[] };
type Decal = { img: Phaser.GameObjects.Image; t: number; life: number };
type Sheet = { s: Phaser.GameObjects.Sprite; t: number; dur: number; n: number };
/** axis: 판 엎기가 좌우(x)로 나뉘나 위아래(y)로 나뉘나 */
/** warn = 판 엎기 예고 (rules.flipWarn) */
type Ev = { kind: KillId; t: number; warn: number; side: number; axis: "x" | "y"; safes: { x: number; y: number }[]; seats: Phaser.GameObjects.Image[]; labels: Phaser.GameObjects.Image[]; drop?: DropFx };
/** 11/22 프로젝트 드랍 연출 (rules.DROP): rain = 쏟아지는 서류철 · blasts = 바닥을 휩쓰는 폭발 (at = 즉사 시작부터 초) · ox = 폭발이 시작되는 x · num = 자리 위 카운트 숫자 · glow = 자리 빛 */
type DropFx = { rain: { x: number; y: number; at: number; done: boolean }[]; blasts: { x: number; y: number; at: number; done: boolean; big: boolean }[]; ox: number; judged: boolean; num: Phaser.GameObjects.Image[]; n: number; glow: Phaser.GameObjects.Image[] };
/** 11/22 탕비실 믹스커피 (rules.COFFEE) */
type Coffee = { x: number; y: number; t: number; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image };
type Strip = { t: number; to: number; thrown: boolean; relaid: boolean };

/** 11/22 회장님 맞는 빛: 0.06초 옅은 붉은 곱하기 빛 (하얗게 채우지 않는다) · 다음 번쩍임까지 쉬는 시간 */
const HURT_FLASH = 0.06;
const HURT_GAP = 0.2;
const HURT_TINT = 0xffb4a8;
const RED = 0xff3b30;
const GREEN = 0x5fe0a0;
const BLUE = 0x78b4ff;
const GOLD = 0xffd878;
const STRIP = [
  null,
  { line: "에잇, 더워서 못 하겠네!", text: "회장님이 패딩 조끼를 벗어 던졌다!" },
  { line: "사원증 같은 거 필요 없어!", text: "회장님이 사원증을 집어던졌다!" },
  { line: "...안경 벗으면 나 무서워.", text: "회장님이 안경을 내던졌다! 눈빛이 달라졌다" },
  { line: "누가 서버 내렸어!!!", text: "회장님 눈이 빨개졌다! 머리가 곤두섰다" },
  { line: "오늘 다 같이 집에 못 가!", text: "필승 머리띠를 질끈 묶었다! 크런치 모드" },
] as const;
const BULLET_CAP = 220;
/** 처음 보는 기술 느리게 (실제 초) */
const SLOW_SEC = 1.1;
/** 레이저 길이 (판 대각선보다 길게) */
const BEAM_LEN = 600;
const SHEET_CAP = 40;
/** 11/21 판에서 쓰는 글자 그림 (한 곳에 모아 판 시작 때 미리 굽는다 — 단계 전환·첫 기술에서 끊기지 않게) */
type LbOpt = NonNullable<Parameters<typeof labelTex>[3]>;
const D_LB: LbOpt = { color: "#fff4dc", stroke: "#5a0a08", px: 12 };
const C_LB: LbOpt = { px: 12, stroke: "#3a0808" };
const LB: Record<string, [string, LbOpt]> = {
  d1: ["D-1", D_LB],
  d2: ["D-2", D_LB],
  d3: ["D-3", D_LB],
  c1: ["1", C_LB],
  c2: ["2", C_LB],
  c3: ["3", C_LB],
  c4: ["4", C_LB],
  c5: ["5", C_LB],
  star1: ["★1", { color: "#ffe08a", stroke: "#3a2008" }],
  mySeat: ["내 자리", { color: "#06301c", px: 12 }],
  dn1: ["1", { color: "#eafff4", stroke: "#06301c", px: 20 }],
  dn2: ["2", { color: "#eafff4", stroke: "#06301c", px: 20 }],
  dn3: ["3", { color: "#eafff4", stroke: "#06301c", px: 20 }],
  newOffice: ["새 사무실", { color: "#d9fff0", stroke: "#06301c" }],
  stamp: ["마감", { color: "#c9402f", px: 12, bg: "rgba(0,0,0,0)", border: "#c9402f" }],
  truckLane: ["대표님 나와 주세요", { color: "#ffd0c8", stroke: "#3a0808" }],
  truckSign: ["대표님 나와 주세요!!", { color: "#ff5a44", px: 12, bg: "#101420", padX: 2, padY: 0 }],
  truckSafe: ["안전", { color: "#eafff4", stroke: "#06301c", px: 16, bg: "rgba(8,72,40,0.78)", border: "#5fe0a0", padX: 5, padY: 1 }],
};
const lb = (sc: Phaser.Scene, k: string) => labelTex(sc, k, LB[k]![0], LB[k]![1]);
/** 기술 이름 상자 (22px · 진한 테두리) */
const nameTex = (sc: Phaser.Scene, name: string) => labelTex(sc, `nm2-${name}`, `${name}!`, { color: "#fff0e0", stroke: "#2a0408", strokeW: 4, bg: "rgba(70,8,14,0.94)", border: "#ff5a3c", px: 22, padX: 10, padY: 5 });
/** 판에서 쓰는 큰 빛 그림 (skillArt) */
const ARTS = ["blizzard-mandala", "bonfire-flare", "bonfire-sun", "chain-seal", "harvest-vortex", "kindle-burst", "meteor-crater", "meteor-splash", "meteor-comet", "proc-star", "ring-wreath", "stoke-sigil", "wisp-burst"] as const;
/** 기술·즉사·변신 말고 회장님이 하는 말 */
const LINES = ["어서 와요. 오늘도 야근이죠?", "내일 아침 9시에 봐요~", "...오늘은 이만 퇴근하지.", "책상 다시 배치해!"] as const;

/** 11/21 무적(시험) 단추는 개발 서버에서만 (운영 빌드에서는 이 값이 false로 굳어 무적이 아예 없다) */
const GOD_OK = process.env.NODE_ENV !== "production";
const SEEN_KEY = (acct: string) => `tomb.chair.seen.${acct}`;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export class ChairmanFight {
  private readonly sc: Phaser.Scene;
  /** 판 시간(초, 게임 시간) */
  private t = 0;
  private ph = -1;
  private phT = 0;
  private seed = 0;
  /** 이번 단계 커피가 놓일 때 (null = 없음 · 크런치) · 놓았나 · 지금 바닥에 있는 커피 */
  private coffeeT: number | null = null;
  private coffeePlaced = false;
  private coffee: Coffee | null = null;
  private stg = 0;
  private threat = 1;
  /** 11/21 피해 배율 (판 시간 — rules.chairDmgMul) */
  private dmgK = DMG_EARLY;
  private spd = 1;
  // 회장님
  private bx = WW / 2;
  private by = 165;
  private face = 1;
  private walk = 0;
  private wander: { x: number; y: number } | null = null;
  private dash: { x: number; y: number; t: number } | null = null;
  private body!: Phaser.GameObjects.Image;
  private glowL!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Image;
  private hurtFlash = -1;
  private bubble: { img: Phaser.GameObjects.Image; t: number; dur: number; hold: number } | null = null;
  /** 11/21 붙잡힌 말풍선(반려 한마디) 뒤에 줄 선 대사 (마지막 것 하나) */
  private bubbleNext: { text: string; dur: number } | null = null;
  private nameBox: { img: Phaser.GameObjects.Image; t: number } | null = null;
  // 기술
  private runs: Run[] = [];
  /** 11/20 단계별 기술 주머니 (한 바퀴 다 쓰기 전엔 안 겹친다) */
  private bag = newPatBag();
  private nextPat = 1.2;
  private tele: Tele[] = [];
  private bullets: Bullet[] = [];
  private bulletFree: Phaser.GameObjects.Image[] = [];
  private falls: Fall[] = [];
  private mobs: Mob[] = [];
  private bugs: Bug[] = [];
  private mails: Mail[] = [];
  private beams: Beam[] = [];
  private zone: Zone | null = null;
  private trucks: Truck[] = [];
  private truckSafe: TruckSafe | null = null;
  /** 초록 길 「안전」 글씨 (몇 개 돌려 쓴다) */
  private truckSafeLb: Phaser.GameObjects.Image[] = [];
  private balls: Ball[] = [];
  private lasers: Laser[] = [];
  private decals: Decal[] = [];
  private sheets: Sheet[] = [];
  private props: Phaser.GameObjects.Image[] = [];
  /** 내 움직임 (px/s, 부드럽게) — 앞질러 노리기 */
  private pv = { x: 0, y: 0 };
  private pLast: { x: number; y: number } | null = null;
  /** 게임 시간으로 미뤄 둔 일 (기술 안의 두 번째 줄 등) */
  private laters: { at: number; fn: () => void }[] = [];
  /** 이펙트 예산 (폭발 꽃·큰 그림이 한꺼번에 몰리면 가볍게) */
  private boomT: number[] = [];
  private glowTok = 14;
  private lastStop = -9;
  private sheetFree: Phaser.GameObjects.Sprite[] = [];
  private darkUntil = 0;
  private ev: Ev | null = null;
  private kills: { at: number; kind: KillId; done: boolean }[] = [];
  private strip: Strip | null = null;
  /** 11/20 단계 전환 화면 (실제 초 — 끝나면 변신 연출) */
  private trans: { t: number; ph: number } | null = null;
  // 숨을 곳
  covers: Cover[] = [];
  private coverImg = new Map<Cover, Phaser.GameObjects.Image>();
  // 그리기 층
  private gFloor!: Phaser.GameObjects.Graphics;
  private gAir!: Phaser.GameObjects.Graphics;
  private gTop!: Phaser.GameObjects.Graphics;
  private hitDot!: Phaser.GameObjects.Image;
  private hitDotBg!: Phaser.GameObjects.Image;
  private dark: Phaser.GameObjects.Rectangle[] = [];
  private darkHole!: Phaser.GameObjects.Image;
  private arrows: Phaser.GameObjects.Image[] = [];
  private vignette!: Phaser.GameObjects.Image;
  // 실제 시간 연출
  private slowLeft = 0;
  private briefing = true;
  private briefAt = 0;
  private deadT = -1;
  private endedSent = false;
  private grey: ReturnType<Phaser.GameObjects.Components.FX["addColorMatrix"]> | null = null;
  private seen: Set<string>;
  private lowFx: boolean;
  private fpsAcc = 0;
  private fpsN = 0;
  private fpsLowFor = 0;
  // 피해 계기판
  total = 0;
  private buckets = new Float64Array(12);
  private bucketAt = 0;
  private hudAt = 0;
  private sealN = 0;
  private realT = 0;
  private offs: (() => void)[] = [];

  constructor(private readonly host: ChairHost) {
    this.sc = host.scene;
    this.lowFx = host.reduced;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY(host.acct)) ?? "[]") as string[];
    } catch {
      seen = [];
    }
    this.seen = new Set(Array.isArray(seen) ? seen : []);
    ensureChairTextures(this.sc);
  }

  /** 기술 고르기·자리 굴림 (서버가 준 판 seed) */
  private rng: () => number = Math.random;

  create(seed: number): void {
    this.rng = seeded((seed ^ 0x43484149) >>> 0);
    this.seed = seed >>> 0;
    const sc = this.sc;
    this.gFloor = sc.add.graphics().setDepth(DEPTH_GROUND - 6);
    this.gAir = sc.add.graphics().setDepth(DEPTH_FX + 20).setBlendMode(Phaser.BlendModes.ADD);
    this.gTop = sc.add.graphics().setDepth(DEPTH_FX + 30);
    this.body = sc.add.image(this.bx, this.by, CTX.boss(0), "idle0").setOrigin(0.5, 1).setScale(BK);
    this.glowL = sc.add.image(this.bx, this.by, CTX.bossEm(0), "idle0").setOrigin(0.5, 1).setScale(BK).setBlendMode(Phaser.BlendModes.ADD);
    this.aura = sc.add.image(this.bx, this.by, SKT.glow).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(DEPTH_FX - 5);
    this.hitDotBg = sc.add.image(0, 0, CTX.dot).setTint(0x000000).setAlpha(0.55).setDisplaySize(4, 3).setOrigin(0.5, 0.34);
    this.hitDot = sc.add.image(0, 0, CTX.dot).setDisplaySize(2, 1).setOrigin(0.5, 0);
    for (let i = 0; i < 4; i++) this.dark.push(sc.add.rectangle(0, 0, 10, 10, 0x04060c, 0.86).setOrigin(0, 0).setDepth(DEPTH_FX + 40).setVisible(false));
    this.darkHole = sc.add.image(0, 0, this.holeTex()).setDepth(DEPTH_FX + 40).setVisible(false);
    this.vignette = sc.add.image(0, 0, this.vignetteTex()).setScrollFactor(0).setDepth(2e6 - 30).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.covers = layCovers(this.rng);
    this.syncCovers(false);
    this.prewarm();
    this.offs.push(bridge.on("chairman:go", () => this.go()));
    // 11/21 개발 서버 운영자: 무적(시험) 단추·G (한 번이라도 켠 채 싸우면 끝에 서버가 기록·포인트 없이 친다)
    if (GOD_OK) {
      this.godAble = bridge.last("me:staff")?.on === true;
      // 11/22 사용자 「실전인데 왜 연습이라고 나오지」: 이제 난이도를 실제로 시험하는 단계 → 꺼진 채 시작 (단추·G로 켠다)
      this.god = false;
      this.offs.push(bridge.on("chairman:god", () => this.toggleGod()));
    }
    // 개발 서버에서만: 기술·즉사·변신을 바로 불러 보는 손잡이 (화면 확인용)
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const w = window as unknown as { __chairDev?: unknown };
      w.__chairDev = {
        pat: (id: PatId) => this.startPattern(id),
        kill: (k: KillId) => this.fire(k),
        strip: (n: number) => this.startStrip(n),
        go: () => this.go(),
        god: (on = true) => (this.god = on),
        seal: () => (this.sealBoost += 45_000),
        hit: (n: number) => this.dealt(n),
        arrows: () => this.arrows.map((o) => [o.visible, Math.round(o.x), Math.round(o.y), o.scale]),
        cam: () => {
          const c = this.sc.cameras.main;
          return [c.width, c.height, c.zoom, c.worldView.x, c.worldView.y, c.worldView.width];
        },
      };
      this.offs.push(() => delete w.__chairDev);
    }
    this.bubbleSay("어서 와요. 오늘도 야근이죠?", 2.6);
    // 11/21 「판교의 등대 꼭대기 · 회장실」은 등장 컷 이름판이 포효 때 같이 띄운다 → 회장실에서 또 띄우지 않는다 (브리핑보다 먼저 떠 보였다)
    // 11/21 판 전체 기술 주머니: 브리핑에 실제로 먼저 나올 기술 5개
    bridge.emit("chairman:ui", { kind: "brief", phase: 0, pats: peekPatterns(this.bag, this.rng, 5) });
  }

  /**
   * 11/21 사용자 「페이즈 바뀌고 첫 공격쯤에서 갑자기 멈춘다」: 판에서 쓰는 그림·글자(말풍선·기술 이름·표지)·빛 그림을 브리핑 뒤에서 전부 굽고,
   * 한 번씩 거의 투명하게 그려 GPU에 올려 둔다 (처음 쓰는 순간 캔버스 굽기·텍스처 올리기가 프레임을 잡아먹지 않게). 2프레임 뒤 지운다
   */
  private prewarm(): void {
    const sc = this.sc;
    const keys: string[] = [];
    for (let k = 0; k <= 5; k++) keys.push(CTX.boss(k), CTX.bossEm(k));
    for (const id of ALL_PATS) keys.push(bubbleTex(sc, PAT_INFO[id].line, PAT_INFO[id].line), nameTex(sc, PAT_INFO[id].name));
    for (const k of Object.keys(KILL_INFO) as KillId[]) keys.push(bubbleTex(sc, KILL_INFO[k].line, KILL_INFO[k].line), nameTex(sc, KILL_INFO[k].name));
    for (const st of STRIP) if (st) keys.push(bubbleTex(sc, st.line, st.line));
    for (const t of LINES) keys.push(bubbleTex(sc, t, t));
    if (this.host.mode === "hell") for (const t of SEAL_LINES) keys.push(bubbleTex(sc, t, t));
    for (const k of Object.keys(LB)) keys.push(lb(sc, k));
    for (const n of ARTS) keys.push(art(sc, n));
    for (let i = 1; i <= 4; i++) keys.push(CTX.item(i));
    for (let i = 0; i < 6; i++) keys.push(CTX.block(i), CTX.staff(i));
    for (let i = 0; i < 4; i++) keys.push(CTX.cap(i));
    keys.push(CTX.bug, CTX.folder, CTX.truck, CTX.seat, CTX.tag, CTX.paper, CTX.arrow, CTX.coffee, ...Object.values(FXT));
    const cam = sc.cameras.main;
    this.warm = [...new Set(keys)]
      .filter((k) => sc.textures.exists(k))
      .map((k) => sc.add.image(cam.width / 2, cam.height / 2, k).setScrollFactor(0).setAlpha(0.01).setDepth(-1e6));
    this.warmN = 2;
  }
  private warm: Phaser.GameObjects.Image[] = [];
  private warmN = 0;

  destroy(): void {
    for (const o of this.offs.splice(0)) o();
    for (const w of this.warm.splice(0)) w.destroy();
    this.clearGrey();
  }

  /** 업무 브리핑 [바로 시작] */
  private go(): void {
    if (!this.briefing) return;
    this.briefing = false;
    bridge.emit("chairman:ui", { kind: "status", state: "fight" });
  }

  get started(): boolean {
    return !this.briefing;
  }

  // ───────── 실제 시간 (HuntScene.step 맨 앞) ─────────

  /** 실제 delta(ms) → 게임에 흘릴 delta (브리핑 0, 처음 보는 기술 0.3배, 죽음 느리게) */
  frame(delta: number): number {
    const dsec = Math.min(0.1, delta / 1000);
    this.realT += dsec;
    if (this.warm.length && --this.warmN <= 0) for (const w of this.warm.splice(0)) w.destroy();
    this.watchFps(delta);
    if (this.briefing) {
      this.briefAt += dsec;
      // 오래 두면 저절로 시작 (자리 비움 방지: 40초)
      if (this.briefAt > 40) this.go();
      this.idleBoss(dsec);
      return 0;
    }
    if (this.deadT >= 0) {
      this.deadT += dsec;
      this.greyStep();
      if (this.deadT > 1.9 && !this.endedSent) {
        this.endedSent = true;
        this.host.ended({ damage: Math.round(this.total), durationMs: Math.round(this.host.now()), timeUp: this.host.now() >= CHAIR_MAX_MS, ...(GOD_OK && this.godUsed ? { god: true } : {}) });
      }
      return this.deadT < 1.4 ? delta * 0.25 : 0;
    }
    if (this.host.dead() || this.host.now() >= CHAIR_MAX_MS) {
      this.deadT = 0;
      if (!this.host.dead()) this.host.flash("퇴근 시간! 20분을 다 버텼어요", 2400);
      this.bubbleSay(this.host.dead() ? "내일 아침 9시에 봐요~" : "...오늘은 이만 퇴근하지.", 2.4);
      bridge.emit("chairman:ui", { kind: "status", state: "dead" });
      return delta * 0.25;
    }
    // 단계 전환 화면: 1.4초 동안 0.3배 (공격은 다 걷혔고 새 공격도 없다) → 끝나면 변신 연출
    if (this.trans) {
      this.trans.t += dsec;
      if (this.trans.t >= PHASE_CARD_SEC) {
        const ph = this.trans.ph;
        this.trans = null;
        this.startStrip(Math.min(5, ph));
      }
      return delta * 0.3;
    }
    // 11/21 처음 보는 기술: 0.4배에서 1배로 부드럽게 차오른다 (예전 0.3배로 1.3초 뚝 멈춘 듯 — 「첫 공격쯤에서 갑자기 멈춘다」)
    if (this.slowLeft > 0) {
      this.slowLeft -= dsec;
      const k = 1 - Math.max(0, this.slowLeft) / SLOW_SEC;
      return delta * (0.4 + 0.6 * k * k);
    }
    return delta;
  }

  private watchFps(delta: number): void {
    if (this.lowFx || !this.host.skfx.mobile) return;
    this.fpsAcc += delta;
    this.fpsN++;
    if (this.fpsAcc < 1000) return;
    const fps = (this.fpsN * 1000) / this.fpsAcc;
    this.fpsAcc = this.fpsN = 0;
    this.fpsLowFor = fps < 50 ? this.fpsLowFor + 1 : 0;
    // 폰에서 3초 넘게 50fps 아래면 이펙트를 줄인다
    if (this.fpsLowFor >= 3) this.lowFx = true;
  }

  private greyStep(): void {
    const cam = this.sc.cameras.main;
    if (!this.grey && cam.postFX) this.grey = cam.postFX.addColorMatrix();
    this.grey?.reset();
    this.grey?.grayscale(Math.min(1, this.deadT / 1.2), false);
  }

  /** 다시 시작할 때 회색을 걷는다 */
  clearGrey(): void {
    // 씬을 닫는 중이면 카메라가 먼저 사라졌을 수 있다
    if (this.grey) this.sc.cameras?.main?.postFX?.remove(this.grey as unknown as Phaser.FX.Controller);
    this.grey = null;
  }

  // ───────── 피해 ─────────

  /** HuntScene이 회장님에게 넣은 피해 */
  dealt(dmg: number): void {
    if (this.deadT >= 0 || this.briefing) return;
    this.total += dmg;
    this.buckets[this.bucketAt] += dmg;
    // 11/22 사용자 「회장님이 하얀 덩어리가 된다」: 맞을 때마다 하얗게 채우면 연타에 늘 하얗다 → 0.06초 옅은 붉은 빛, 다음 번쩍임까지 0.2초 쉰다
    if (dmg > 0 && this.hurtFlash <= -HURT_GAP) this.hurtFlash = HURT_FLASH;
  }

  private dps(): number {
    let s = 0;
    for (const v of this.buckets) s += v;
    return s / 3;
  }

  /** HuntScene hud()에 얹는 것 */
  hudChair(): { title: string; practice: boolean; phase: string; sealed: number[]; warn: number[]; ms: number; crunch: boolean; heal: string } {
    const ms = this.host.now() + this.sealBoost;
    const pool = this.host.mode === "hell" ? this.host.sealPool : [];
    const soon = this.host.mode === "hell" ? sealSoon(pool, ms) : null;
    return {
      // 11/20 연습 판은 제목부터 티 나게 (HUD 테두리도 청록 — RunHud data-practice)
      title: `회장님 독대${this.host.practice ? " (연습 모드)" : ""} · ${MODE_NAME[this.host.mode]}`,
      practice: this.host.practice,
      phase: phaseName(Math.max(0, this.ph)),
      sealed: slotsOf(this.host.hotbar, sealedAt(pool, ms)),
      warn: soon && Math.floor(this.realT * 6) % 2 === 0 ? slotsOf(this.host.hotbar, [soon]) : [],
      // 버틴 시간 (판 시간 — 봉인 당기기 dev는 안 더한다)
      ms: this.host.now(),
      crunch: this.ph >= 5,
      heal: CHAIR_HEAL_TEXT,
    };
  }

  // ───────── 한 틱 (게임 시간) ─────────

  update(dt: number): void {
    const H = this.host;
    const ms = H.now();
    this.t += dt;
    this.phT += dt;
    if (this.god && dt > 0) this.godUsed = true;
    // 3초 창의 초당 피해 (0.25초 칸)
    const bk = Math.floor(this.t * 4) % 12;
    if (bk !== this.bucketAt) {
      this.bucketAt = bk;
      this.buckets[bk] = 0;
    }
    this.threat = chairThreat(H.mode, ms);
    this.dmgK = chairDmgMul(H.mode, ms);
    this.spd = speedOf(this.threat) * (this.ph >= 5 ? 1.1 : 1);
    // 내 움직임 (앞질러 노리기) · 이펙트 예산 채우기 · 미뤄 둔 일
    const pp = H.player();
    if (this.pLast && dt > 0) {
      const k = Math.min(1, dt * 8);
      this.pv.x = lerp(this.pv.x, (pp.x - this.pLast.x) / dt, k);
      this.pv.y = lerp(this.pv.y, (pp.y - this.pLast.y) / dt, k);
    }
    this.pLast = { x: pp.x, y: pp.y };
    this.glowTok = Math.min(14, this.glowTok + dt * 30);
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= this.t);
      this.laters = this.laters.filter((l) => l.at > this.t);
      if (this.deadT < 0) for (const l of due) l.fn();
    }
    const ph = chairPhase(ms);
    if (ph !== this.ph) this.enterPhase(ph);
    this.stepSeal(ms + this.sealBoost);
    this.stepStrip(dt);
    // 기술 진행
    for (const r of this.runs) {
      const prev = r.t;
      r.t += dt;
      for (const [at, fn] of r.ev) if (prev < at && r.t >= at && this.deadT < 0) fn();
    }
    this.runs = this.runs.filter((r) => r.t < PAT_INFO[r.id].dur);
    if (!this.ev && !this.strip && !this.trans && this.deadT < 0) {
      this.nextPat -= dt;
      if (this.nextPat <= 0 && this.runs.length < overlapOf(this.ph)) {
        const id = drawPattern(this.bag, this.rng, this.runs.map((r) => r.id));
        if (id) {
          this.startPattern(id);
          this.nextPat = patternGap(this.ph, this.threat);
        }
      }
      for (const k of this.kills) if (!k.done && this.phT >= k.at) {
        k.done = true;
        this.fire(k.kind);
        break;
      }
    }
    // 11/22 탕비실 커피: 때가 되면 (즉사 예고 중·전환 화면·변신 중이면 끝난 뒤로)
    if (this.deadT < 0 && !this.trans && !this.strip && coffeeReady(this.coffeeT, this.phT, this.coffeePlaced, !!this.ev)) this.placeCoffee();
    this.stepCoffee(dt);
    this.stepBoss(dt);
    if (this.ev) this.stepEv(dt);
    this.stepTele(dt);
    this.stepBullets(dt);
    this.stepFalls(dt);
    this.stepMobs(dt);
    this.stepWaves(dt);
    this.stepBeams(dt);
    this.stepZone(dt);
    this.stepTrucks(dt);
    this.stepBalls(dt);
    for (const L of this.lasers) L.t += dt;
    this.lasers = this.lasers.filter((L) => L.t < L.life);
    this.stepDecals(dt);
    this.stepSheets(dt);
    this.draw();
    this.hudAt += dt;
    if (this.hudAt >= 0.125) {
      this.hudAt = 0;
      // 11/21 지옥: 반려 예고·반려함 (반려 당기기 dev도 같은 시계)
      const clk = H.mode === "hell" ? sealClock(H.sealPool, ms + this.sealBoost) : null;
      bridge.emit("chairman:hud", {
        total: Math.round(this.total),
        dps: Math.round(this.dps()),
        best: H.best,
        phase: Math.max(0, this.ph),
        ms,
        mode: H.mode,
        practice: H.practice,
        under: this.bossUnderMeter(),
        box: this.bossBox(),
        me: this.meBox(),
        ...(GOD_OK && this.godAble ? { god: this.god, godUsed: this.godUsed } : {}),
        ...(clk ? { seal: { ids: clk.sealed, next: clk.next, left: clk.leftMs, total: H.sealPool.length } } : {}),
      });
    }
  }

  /** 브리핑 중에도 회장님은 서성인다 (그림만) */
  private idleBoss(dt: number): void {
    this.t += dt;
    this.stepBoss(dt);
    this.draw();
  }

  private enterPhase(ph: number): void {
    const first = this.ph < 0;
    this.ph = ph;
    this.phT = 0;
    this.kills = phaseKills(this.rng, ph).map((k) => ({ ...k, done: false }));
    // 커피 시각은 판 seed·단계로 따로 정한다 (기술 고르기 순서와 상관없이 같은 판이면 같은 때)
    this.coffeeT = coffeeAt(seeded((this.seed ^ 0xc0ffee ^ Math.imul(ph + 1, 0x9e3779b1)) >>> 0), ph);
    this.coffeePlaced = false;
    if (first) return;
    // 11/20 단계 전환 화면 (1분마다): 공격을 다 걷고 → 화면을 가로지르는 띠 「PHASE n」 → 이어서 변신 연출·대사
    this.clearPatterns();
    if (this.ev) {
      for (const o of [...this.ev.seats, ...this.ev.labels]) o.destroy();
      this.ev = null;
    }
    this.trans = { t: 0, ph };
    const crunch = ph >= 5;
    bridge.emit("chairman:ui", { kind: "phase", n: Math.min(6, ph + 1), name: crunch ? "CRUNCH MODE" : PHASES[ph], sub: PHASE_SUB[Math.min(5, ph)], crunch, reduced: this.host.reduced });
    this.snd(crunch ? "siren" : "phase");
    this.host.skfx.screenFlash(crunch ? 0xff3020 : 0xfff0d0, crunch ? 0.35 : 0.2, 260);
  }

  private stepSeal(ms: number): void {
    if (this.host.mode !== "hell") return;
    const ids = sealedAt(this.host.sealPool, ms);
    if (ids.length === this.sealN) return;
    this.sealN = ids.length;
    this.host.seal(ids);
    const p = this.host.player();
    this.host.float(p.x, p.y - 34, "반려!", "#ff6a5a");
    this.snd("seal");
    this.host.skfx.screenFlash(0xff3020, 0.18, 200);
    // 11/21 사용자 「자동 반려면 표현을 해 줘야지」: 회장님 한마디 + 가운데 위 도장 (오버레이) + 짧은 흔들림
    const line = SEAL_LINES[(ids.length - 1) % SEAL_LINES.length];
    // 11/21 바로 다음 기술 대사에 덮이지 않게 1.4초 붙잡는다
    this.bubbleSay(line, 1.8, 1.4);
    this.shake(140, 0.004);
    // 11/21 도장 카드는 말풍선 반대쪽 (풍선이 왼쪽 반이면 오른쪽)
    const cam = this.sc.cameras.main;
    const side = (this.bx - cam.worldView.x) * cam.zoom < cam.width / 2 ? "r" : "l";
    bridge.emit("chairman:ui", { kind: "seal", id: ids[ids.length - 1], line, reduced: this.host.reduced, side });
  }

  // ───────── 기술 ─────────

  private startPattern(id: PatId): void {
    const def = this.pattern(id, patVariant(this.rng, Math.max(0, this.ph)));
    this.runs.push({ id, t: 0, ev: def.ev, pose: def.pose });
    this.bubbleSay(PAT_INFO[id].line, 1.8);
    this.showName(PAT_INFO[id].name);
    this.firstSeen(id, PAT_INFO[id].name, PAT_INFO[id].how);
    this.dash = null;
    // 시전 원: 발밑에 마법진이 돌고 손에 빛이 모인다
    this.glowArt("stoke-sigil", this.bx, this.by + 2, 0.42, 1.0, this.ph >= 4 ? 0xff7a60 : 0xffd0a0, true, 0.75);
    this.host.skfx.implode(this.bx, this.by - 30 * BK, 44, 0xffc890, 420);
    this.snd(`${id}:cast`);
  }

  /** 11/20 기술 소리 (같은 소리는 CHAIR_SND_GAP 안에 한 번) */
  private snd(ev: ChairSoundEv): void {
    this.host.synth(`ch-${ev}`, chairSound(ev), CHAIR_SND_GAP);
  }

  /** 게임 시간 sec초 뒤에 (기술이 지워지면 같이 지워진다) */
  private later(sec: number, fn: () => void): void {
    this.laters.push({ at: this.t + sec, fn });
  }

  /** 내가 lead초 뒤에 있을 자리 (지금 움직임 그대로) */
  private lead(sec: number): { x: number; y: number } {
    return leadAim(this.host.player(), this.pv, sec);
  }

  private firstSeen(id: string, name: string, how: string): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    try {
      localStorage.setItem(SEEN_KEY(this.host.acct), JSON.stringify([...this.seen]));
    } catch {
      // 저장 못 해도 이번 판은 그대로
    }
    this.slowLeft = SLOW_SEC;
    bridge.emit("chairman:ui", { kind: "caption", name, how });
  }

  private near(r: number): { x: number; y: number } {
    const p = this.host.player();
    return clampArena({ x: p.x + (this.rng() - 0.5) * r, y: p.y + (this.rng() - 0.5) * r * 0.6 });
  }
  private anywhere(): { x: number; y: number } {
    return { x: ARENA.x0 + this.rng() * AW, y: ARENA.y0 + this.rng() * AH };
  }

  /**
   * 기술 표 (동작 · 시각별 일). v = 이번 변형 (좌우·방향 뒤집기, 나를 앞질러 노리기, 회전 — rules.patVariant).
   * 11/20 사용자 「패턴이 단조롭다·죽지가 않는다」 → 판을 640×400으로 좁히며 탄을 더 촘촘·빠르게, 안전한 칸은 적게, 노리는 공격은 내 움직임을 앞질러
   */
  private pattern(id: PatId, v: PatVar): { pose: (t: number) => string; ev: [number, () => void][] } {
    const B = () => ({ x: this.bx, y: this.by });
    const blink = (t: number, hz: number, a: string, b: string) => (Math.floor(t * hz) % 2 ? a : b);
    const ph = this.ph;
    const sgn = v.reverse ? -1 : 1;
    switch (id) {
      case "dot": {
        const waves = ph >= 2 ? 3 : 2;
        return {
          pose: (t) => (t < 0.8 ? "stylus" : t < 3.6 ? blink(t, 6, "stylusDown", "stylus") : "idle0"),
          ev: [
            [0.5, () => this.glowArt("stoke-sigil", this.bx, this.by + 2, 0.5, 1.2, 0xff9ad8, true, 0.75)],
            ...Array.from({ length: waves }, (_, w): [number, () => void] => [
              0.9 + w * 1.05,
              () => {
                // 노림 변형: 내가 가는 쪽으로 판을 깐다
                const p = v.aimed && w > 0 ? this.lead(0.5) : this.host.player();
                const cell = 26;
                const cx0 = Math.round((p.x - cell * 3.5) / cell) * cell;
                const cy0 = Math.round((p.y - cell * 2.5) / cell) * cell;
                const safe = Math.floor(this.rng() * 35);
                const keep = (i: number) => i === safe || i === (safe + 1) % 35 || (ph < 2 && i === (safe + 7) % 35);
                for (let i = 0; i < 35; i++) {
                  if (keep(i) || this.rng() < 0.12) continue;
                  const x = cx0 + (i % 7) * cell;
                  const y = cy0 + Math.floor(i / 7) * cell;
                  if (x < ARENA.x0 - 8 || x > ARENA.x1 - cell + 8 || y < ARENA.y0 - 14 || y > ARENA.y1 - 4) continue;
                  const col = BLOCK_COLORS[(i + w) % BLOCK_COLORS.length];
                  this.addTele(
                    "rect",
                    { x, y, w: cell - 2, h: cell - 2 },
                    0.8 + this.rng() * 0.15,
                    (z) => {
                      this.strikeHit(z, DMG.light);
                      this.snd("dot:hit");
                      this.decal(this.sc.add.image(x + cell / 2, y + cell / 2, CTX.block((i + w) % 6)).setDepth(DEPTH_GROUND - 3), 1.4);
                      this.sheet(FXT.impact, x + cell / 2, y + cell / 2, 4, 0.25, 0.9);
                      this.debris(x + cell / 2, y + cell / 2, 3, [0xffffff, 0xff8ac0, 0x9ad0ff, 0xffe08a], 50);
                    },
                    { drop: col },
                  );
                }
                this.shake(60, 0.002);
              },
            ]),
          ],
        };
      }
      case "projBoom": {
        // 11/22 폴더 3/4/4/5/5/크런치 6개 + 폴더마다 둘레 작은 연쇄 2~3개. 자리는 첫 폴더 때 한 번에 정한다 (빈 칸 하나는 늘 남는다 — rules.boomLayout)
        let lay: ReturnType<typeof boomLayout> | null = null;
        const n = boomCount(ph);
        return {
          pose: (t) => (t < 0.6 ? "throwFolder" : t < 0.7 + n * 0.3 ? blink(t, 3.3, "throw", "throwFolder") : t < 4.2 ? "sweat" : "idle0"),
          ev: Array.from({ length: n }, (_, k): [number, () => void] => [
            0.7 + k * 0.3,
            () => {
              if (!lay) {
                const p = this.host.player();
                lay = boomLayout(this.rng, { ph: Math.max(0, ph), px: p.x, py: p.y, first: v.aimed ? this.lead(0.9) : this.near(30) });
              }
              const f = lay.folders[k];
              if (!f) return;
              this.throwImg(CTX.folder, B().x + 14 * this.face, B().y - 34 * BK, f.x, f.y, 0.55, 60, false, () => {
                this.sheet(FXT.puff, f.x, f.y, 3, 0.3, 2);
                const img = this.sc.add.image(f.x, f.y + 2, CTX.folder).setOrigin(0.5, 1).setDepth(f.y);
                this.mobs.push({ kind: "bomb", img, x: f.x, y: f.y, t: 0, ttl: 2.0 / this.spd });
                this.addTele(
                  "circle",
                  { x: f.x, y: f.y, r: f.r },
                  2.0,
                  (z) => {
                    this.strikeHit(z, DMG.heavy);
                    this.snd("projBoom:hit");
                    this.boom(f.x, f.y, 1.5, 0xffd27a, k === 0 || k === n - 1);
                    // 종이 고리는 첫 폴더만 (변형마다 비틀림이 다르다)
                    if (k === 0) {
                      const m = ph >= 3 ? 28 : 22;
                      for (let j = 0; j < m; j++) {
                        const a = (j / m) * Math.PI * 2 + v.rot * 0.13;
                        this.shoot(CTX.paper, f.x, f.y - 6, Math.cos(a) * 175, Math.sin(a) * 118, 2, 6, DMG.light, 0xffffff, 0);
                      }
                    }
                  },
                  { count: true },
                );
                // 연쇄: 예고 원은 폴더와 같이 깔리고, 폴더가 터진 뒤 0.15~0.3초에 작게 터진다
                for (const c of f.chain)
                  this.addTele("circle", { x: c.x, y: c.y, r: c.r }, 2.0 + c.dt * this.spd, (z) => {
                    this.strikeHit(z, DMG.light);
                    this.snd("projBoom:hit");
                    this.boom(c.x, c.y, 0.7, 0xffa050);
                  });
              });
            },
          ]),
        };
      }
      case "teamBoom": {
        const rings = ph >= 3 ? 4 : 3;
        const n = ph >= 4 ? 30 : 26;
        return {
          pose: (t) => (t < 1.2 ? "armsWide" : t < 3.8 ? blink(t, 4, "castUp", "armsWide") : "idle0"),
          ev: [
            [
              0.3,
              () => {
                for (let k = 0; k < 6; k++) {
                  const a = k * 1.047;
                  const x = this.bx + Math.cos(a) * 34;
                  const y = this.by + Math.sin(a) * 20;
                  this.mobs.push({ kind: "pop", img: this.sc.add.image(x, y + 2, CTX.staff(k)).setOrigin(0.5, 1).setDepth(y), x, y, t: 0, ttl: 1.0 });
                  this.sheet(FXT.puff, x, y, 3, 0.3, 2);
                }
              },
            ],
            ...Array.from({ length: rings }, (_, w): [number, () => void] => [
              1.2 + w * 0.65,
              () => {
                if (w === 0)
                  for (const m of this.mobs)
                    if (m.kind === "pop") {
                      this.boom(m.x, m.y, 0.6, 0xff9ad8);
                      m.ttl = 0;
                    }
                const ox = this.bx;
                const oy = this.by - 14 * BK;
                // 노림 변형: 고리 하나가 나를 곧장 향한다 (옆으로 비켜야 한다) · 아니면 고리마다 돌아가며 비튼다
                const p = this.host.player();
                const base = v.aimed ? Math.atan2((p.y - oy) / 0.69, p.x - ox) : sgn * w * 0.12;
                for (let k = 0; k < n; k++) {
                  const a = base + (k / n) * Math.PI * 2 + (v.aimed ? 0 : sgn * w * 0.06);
                  const tint = Phaser.Display.Color.HSVToRGB(((k * 40) % 360) / 360, 0.5, 1).color;
                  this.shoot(CTX.tag, ox, oy, Math.cos(a) * 150, Math.sin(a) * 104, 3, 5, DMG.light, tint, 6);
                }
                this.snd("teamBoom:hit");
                this.glowArt("ring-wreath", ox, oy, 0.5, 0.45, 0xff9ad8);
                this.host.skfx.ring(this.bx, this.by, 60, 0xffb4dc, 400);
              },
            ]),
          ],
        };
      }
      case "planChange":
        return {
          pose: (t) => (t < 2.4 ? "phone" : t < 2.9 ? "point" : "idle0"),
          ev: [
            [
              0.4,
              () => {
                const swap = this.rng() < 0.85;
                // 변형: 네 칸(2×2) 또는 여섯 칸(3×2, 바둑판)
                const cols = v.rot % 2 ? 3 : 2;
                const cw = AW / cols;
                const ch = AH / 2;
                const cells = Array.from({ length: cols * 2 }, (_, i) => [ARENA.x0 + (i % cols) * cw, ARENA.y0 + Math.floor(i / cols) * ch]);
                const odd = this.rng() < 0.5 ? 1 : 0;
                const isBad = (i: number) => ((i % cols) + Math.floor(i / cols)) % 2 === odd;
                const warn = 2.4;
                const swapAt = swap ? Math.max(0.6, warn / this.spd - 0.8) : 99;
                cells.forEach(([x, y], i) =>
                  this.addTele(
                    "rect",
                    { x, y, w: cw, h: ch },
                    warn,
                    (z) => {
                      if (!z.live) return;
                      this.strikeHit(z, DMG.heavy);
                      this.snd("planChange:hit");
                      for (let k = 0; k < 3; k++) this.boom(z.x + 20 + this.rng() * (z.w - 40), z.y + 14 + this.rng() * (z.h - 28), 0.8, 0xffd27a);
                    },
                    { live: isBad(i), swapAt, swapTo: !isBad(i), hatch: true },
                  ),
                );
              },
            ],
          ],
        };
      case "quick": {
        const n = ph >= 2 ? 4 : 3;
        const gap = ph >= 2 ? 0.95 : 1.15;
        return {
          pose: (t) => {
            const k = t % gap;
            return t < 0.5 ? "clock" : k < 0.45 ? "crouch" : k < 0.75 ? "dash" : "idle0";
          },
          ev: [
            [0.1, () => this.glowArt("stoke-sigil", this.bx, this.by - 30 * BK, 0.4, 0.7, 0xffb070)],
            ...Array.from({ length: n }, (_, k): [number, () => void] => [
              0.45 + k * gap,
              () => {
                // 노림: 내가 갈 자리를 앞질러 (변형이 아니면 홀수 번째만)
                const p = v.aimed || k % 2 ? this.lead(0.45) : this.host.player();
                const ang = Math.atan2(p.y - this.by, p.x - this.bx);
                const d = Math.hypot(p.x - this.bx, p.y - this.by) + 90;
                const to = clampArena({ x: this.bx + Math.cos(ang) * d, y: this.by + Math.sin(ang) * d });
                this.addTele("line", { x: this.bx, y: this.by, x1: to.x, y1: to.y, w: 36 }, 0.5, (z) => {
                  this.dash = { x: to.x, y: to.y, t: 0.2 };
                  this.strikeHit(z, DMG.normal);
                  this.snd("quick:hit");
                  this.sheet(FXT.crack, to.x, to.y, 3, 0.5, 1.4);
                  this.debris(to.x, to.y, 10, [0x8a5a32, 0xffd25a, 0xffffff], 70);
                  this.shake(120, 0.005);
                });
              },
            ]),
          ],
        };
      }
      case "launch":
        return {
          pose: (t) => (t < 0.8 ? "castUp" : t < 3.6 ? "point" : "laugh"),
          ev: [
            [
              0.5,
              () => {
                const cols = 8;
                const rows = 4;
                const cw = AW / cols;
                const ch = AH / rows;
                // 변형: 무작위 · 한쪽에서 쓸어 오기 (D-3이 왼쪽/오른쪽 끝부터)
                const sweep = v.rot >= 2;
                const order = [...Array(cols * rows).keys()]
                  .map((i) => ({ i, k: sweep ? ((v.mirror ? cols - 1 - (i % cols) : i % cols) + this.rng() * 1.5) : this.rng() }))
                  .sort((a, b) => a.k - b.k);
                order.forEach(({ i }, j) => {
                  const d = 3 - Math.floor((j / order.length) * 3);
                  const x = ARENA.x0 + (i % cols) * cw;
                  const y = ARENA.y0 + Math.floor(i / cols) * ch;
                  const z = this.addTele("rect", { x: x + 1, y: y + 1, w: cw - 2, h: ch - 2 }, 0.85 + (3 - d) * 0.85, () => {
                    this.strikeHit(z, DMG.normal);
                    this.snd("launch:hit");
                    this.boom(x + cw / 2, y + ch / 2, 0.7, d === 1 ? 0xffd27a : 0x9ad8ff);
                  });
                  z.label = this.sc.add.image(x + cw / 2, y + ch / 2, lb(this.sc, `d${d}`)).setDepth(DEPTH_GROUND - 2).setAlpha(0.85).setScale(this.ts());
                });
              },
            ],
          ],
        };
      case "bug": {
        const n = ph >= 3 ? 32 : 26;
        return {
          pose: (t) => (t < 1.0 ? "laugh" : "idle0"),
          ev: [
            [
              0.4,
              () => {
                for (let k = 0; k < n; k++) {
                  const a = this.rng() * Math.PI * 2;
                  const m = this.host.spawnBug(this.bx + Math.cos(a) * 20, this.by + Math.sin(a) * 12, (60 + this.rng() * 32) * this.spd);
                  if (!m) continue;
                  this.bugs.push({ m, img: this.sc.add.image(m.x, m.y, CTX.bug).setOrigin(0.5, 1), ttl: 4.6, bit: false });
                }
                this.glowArt("harvest-vortex", this.bx, this.by - 6 * BK, 0.4, 0.8, 0x9af08a);
              },
            ],
          ],
        };
      }
      case "maint":
        return {
          pose: (t) => (t < 4.4 ? blink(t, 3, "castRed", "castUp") : "idle0"),
          ev: [
            [0.2, () => (this.darkUntil = this.t + 4.8)],
            ...Array.from({ length: 9 }, (_, k): [number, () => void] => [
              0.8 + k * 0.45,
              () => {
                // 번개: 내 자리 · 내가 갈 자리를 번갈아 (노림 변형이면 늘 앞질러)
                const pp = v.aimed || k % 2 ? this.lead(0.55) : this.host.player();
                const p = { x: pp.x + (this.rng() - 0.5) * 12, y: pp.y + (this.rng() - 0.5) * 8 };
                this.addTele(
                  "circle",
                  { x: p.x, y: p.y, r: 28 },
                  0.62,
                  (z) => {
                    this.strikeHit(z, DMG.normal);
                    this.snd("maint:hit");
                    this.bolt(p.x, p.y);
                    this.boom(p.x, p.y, 0.8, 0xa8d0ff);
                    this.host.skfx.screenFlash(0xdfe8ff, 0.18, 140);
                  },
                  { blue: true },
                );
              },
            ]),
          ],
        };
      case "hotfix": {
        const n = ph >= 2 ? 7 : 5;
        return {
          pose: (t) => (t < 1.2 ? "castUp" : t < 2.6 ? "point" : "idle0"),
          ev: [
            [
              0.5,
              () => {
                for (let k = 0; k < n; k++) {
                  const p = k === 0 ? (v.aimed ? this.lead(0.8) : this.host.player()) : k === 1 && ph >= 2 ? this.lead(1.1) : this.anywhere();
                  this.addTele("cross", { x: p.x, y: p.y, len: 260, w: 18 }, 1.0 + k * 0.1, (z) => {
                    this.strikeHit(z, DMG.normal);
                    this.snd("hotfix:hit");
                    this.lasers.push({ kind: "cross", x: p.x, y: p.y, len: 260, w: 18, t: 0, life: 0.45 });
                    this.glowArt("chain-seal", p.x, p.y, 0.4, 0.4, 0xff9a9a);
                    this.debris(p.x, p.y, 8, [0xffe0c8, 0xffffff, 0xff9a8a], 90);
                    this.shake(80, 0.003);
                  });
                }
              },
            ],
          ],
        };
      }
      case "gacha":
        return {
          pose: (t) => (t < 3.6 ? blink(t, 5, "capsule", "throw") : "laugh"),
          ev: Array.from({ length: 20 }, (_, k): [number, () => void] => [
            0.4 + k * 0.15,
            () => {
              const tg = k % 2 === 0 ? (v.aimed && k % 4 === 0 ? this.lead(0.9) : this.near(30)) : this.anywhere();
              const lucky = k === 11;
              this.throwImg(CTX.cap(k % 4), this.bx, this.by - 40 * BK, tg.x, tg.y, 0.6, 70, false, () => {
                if (lucky) {
                  const img = this.sc.add.image(tg.x, tg.y + 2, CTX.cap(2)).setOrigin(0.5, 1).setDepth(tg.y);
                  this.mobs.push({ kind: "bomb", img, x: tg.x, y: tg.y, t: -99, ttl: 3.0 });
                  this.glowArt("proc-star", tg.x, tg.y - 6, 0.45, 0.8, 0xfff0a0);
                  this.host.float(tg.x, tg.y - 20, "당첨!", "#ffe08a");
                } else
                  this.addTele("circle", { x: tg.x, y: tg.y, r: 26 }, 0.38, (z) => {
                    this.strikeHit(z, DMG.light);
                    this.snd("gacha:hit");
                    this.boom(tg.x, tg.y, 0.8, [0xff9ad8, 0x9ad8ff, 0xffe08a, 0x9af0a8][k % 4]);
                  });
              });
            },
          ]),
        };
      case "truck": {
        // 11/22 줄 일정은 rules.truckPlan (초록 길 = rules.truckGreen — 시험이 트럭과 안 겹치는 걸 본다)
        const wave = (plan: ReturnType<typeof truckPlan>, k: number) => {
          const evs = plan.filter((e) => e.wave === k);
          const lanes = evs.map((e) => {
            const y = truckLaneTop(e.lane);
            const lh = truckLaneTop(e.lane + 1) - y;
            const z = this.addTele("rect", { x: ARENA.x0, y: y + 2, w: AW, h: lh - 4 }, e.warn, () => this.spawnTruck(e.lane, e.dir));
            z.label = this.sc.add.image(ACX, y + lh / 2, lb(this.sc, "truckLane")).setDepth(DEPTH_GROUND - 2).setAlpha(0.8).setScale(this.ts());
            return { lane: e.lane, z };
          });
          this.truckSafe = { free: evs[0]?.free ?? -1, lanes: [...(this.truckSafe?.lanes ?? []), ...lanes] };
        };
        return {
          pose: (t) => (t < 4 ? "sweat" : "idle0"),
          ev: [
            [
              TRUCK.at,
              () => {
                const free = Math.floor(this.rng() * TRUCK.lanes);
                // 2단계 넘으면 두 번째 줄: 빈 줄이 2~3칸 옮겨 간다 (달려서 갈아타야 한다)
                const f2 = ph >= 2 ? truckShift(free, 2 + Math.floor(this.rng() * 2)) : null;
                const plan = truckPlan({ free, f2, mirror: v.mirror, reverse: v.reverse });
                wave(plan, 0);
                if (f2 !== null) this.later(TRUCK.gap, () => wave(plan, 1));
              },
            ],
          ],
        };
      }
      case "stars":
        return {
          pose: (t) => (t < 3.8 ? blink(t, 4, "sweat", "hurt") : "idle0"),
          ev: Array.from({ length: 28 }, (_, k): [number, () => void] => [
            0.3 + k * 0.13,
            () => {
              const p = k % 2 ? (v.aimed && k % 4 === 1 ? this.lead(0.8) : this.near(70)) : this.anywhere();
              this.addTele(
                "circle",
                { x: p.x, y: p.y, r: 22 },
                0.85,
                (z) => {
                  this.strikeHit(z, DMG.light);
                  this.snd("stars:hit");
                  this.boom(p.x, p.y, 0.8, 0xffb070);
                },
                { meteor: true },
              );
            },
          ]),
        };
      case "buildFail":
        return {
          pose: (t) => (t < 3.6 ? blink(t, 5, "point", "castRed") : "idle0"),
          ev: Array.from({ length: 8 }, (_, k): [number, () => void] => [
            0.4 + k * 0.42,
            () => {
              const p = v.aimed && k % 2 ? this.lead(0.5) : { ...this.host.player() };
              this.addTele(
                "circle",
                { x: p.x, y: p.y, r: 18 },
                0.5,
                (z) => {
                  this.strikeHit(z, DMG.normal);
                  this.snd("buildFail:hit");
                  this.sheet(FXT.cross, p.x, p.y - 2, 2, 0.3, 2.2);
                  this.boom(p.x, p.y, 0.6, 0xffd27a);
                },
                { xmark: true },
              );
            },
          ]),
        };
      case "deadline":
        return {
          pose: (t) => (t < 3.4 ? blink(t, 5, "castUp", "throw") : "laugh"),
          ev: Array.from({ length: 30 }, (_, k): [number, () => void] => [
            0.3 + k * 0.1,
            () => {
              const p = k % 3 === 0 ? (v.aimed && k % 6 === 0 ? this.lead(0.7) : this.near(40)) : this.anywhere();
              this.addTele(
                "rect",
                { x: p.x - 13, y: p.y - 9, w: 26, h: 18 },
                0.75,
                (z) => {
                  this.strikeHit(z, DMG.light);
                  this.snd("deadline:hit");
                  this.decal(this.sc.add.image(p.x, p.y, lb(this.sc, "stamp")).setRotation(-0.2).setDepth(DEPTH_GROUND - 3).setScale(this.ts()), 2.0);
                  this.sheet(FXT.impact, p.x, p.y, 4, 0.25, 1);
                  this.debris(p.x, p.y, 4, [0xc9402f, 0xffffff], 50);
                  this.shake(50, 0.002);
                },
                { stamp: true },
              );
            },
          ]),
        };
      case "mail":
        return {
          pose: (t) => (t < 4.4 ? blink(t, 4, "phone", "point") : "idle0"),
          // 11/22 파도 둘(4단계부터 셋)을 하나씩: 벽 예고 → 쓸고 → 다 빠진 뒤 반대쪽 벽에서 다음 (틈은 예고 때 한 번 — rules.MailSeq)
          ev: [[0.35, () => this.mails.push({ seq: new MailSeq(mailWaves(ph), v.reverse, this.rng), hitT: -9, passed: new Set() })]],
        };
      case "okr":
        return {
          pose: (t) => (t < 4.4 ? "castRed" : "laugh"),
          ev: [
            [
              0.3,
              () => {
                const dir = v.mirror ? 1 : -1;
                const n = ph >= 4 ? 5 : 4;
                const o = this.beamOrigin();
                const p = this.host.player();
                // 노림: 레이저 하나가 내 자리 조금 뒤에서 시작해 곧장 쓸어 온다
                const a0 = v.aimed ? Math.atan2(p.y - 6 - o.y, p.x - o.x) - dir * 0.7 : this.rng() * Math.PI * 2;
                this.beams.push({ x: o.x, y: o.y, a: a0, n, dir, t: 0, warn: 0.9 / this.spd, life: 4.4, sp: 0.75 * this.spd, hitT: -9, flipAt: v.reverse ? 2.3 : 99, L: [] });
                this.glowArt("blizzard-mandala", this.bx, this.by - 10, 0.5, 4.4, 0xff8aa0, true, 0.5, 0.05, true);
              },
            ],
          ],
        };
      case "move":
        return {
          pose: (t) => (t < 3.4 ? "armsWide" : t < 4.0 ? "flip" : "laugh"),
          ev: [
            [
              0.3,
              () => {
                const w = ph >= 3 ? 92 : 110;
                const h = ph >= 3 ? 60 : 72;
                // 새 사무실은 나에게서 먼 쪽 (여덟 번 굴려 가장 먼 곳)
                const p = this.host.player();
                let best = { cx: ACX, cy: ACY, d: -1 };
                for (let k = 0; k < 8; k++) {
                  const cx = ARENA.x0 + w / 2 + this.rng() * (AW - w);
                  const cy = ARENA.y0 + h / 2 + this.rng() * (AH - h);
                  const d = Math.min(Math.hypot(cx - p.x, cy - p.y), 260);
                  if (d > best.d) best = { cx, cy, d };
                }
                const { cx, cy } = best;
                const label = this.sc.add.image(cx, cy - h / 2 - 2, lb(this.sc, "newOffice")).setOrigin(0.5, 1).setDepth(DEPTH_GROUND - 1).setScale(this.ts());
                this.zone = { cx, cy, w, h, t: 0, warn: 3.0 / this.spd, done: false, label };
              },
            ],
          ],
        };
      case "gather": {
        // 11/22 덩어리마다 따로 모이기 → 들어 올림(예고) → 구르기. 둘째는 첫째가 굴러갈 때 옆자리에서 처음부터 모인다 (rules.gatherPlan)
        // 11/22 1~3단계 하나 · 4~5단계 둘 · 크런치 셋 (rules.gatherCount)
        const plan = gatherPlan(gatherCount(ph), this.spd, v.mirror ? -1 : 1);
        const end = plan[plan.length - 1].at + GATHER.gather + GATHER.lift / this.spd;
        return {
          pose: (t) => (t < end - 0.5 ? blink(t, 3, "mic", "armsWide") : t < end + 0.8 ? "point" : "laugh"),
          ev: plan.map((g, k): [number, () => void] => [g.at, () => this.startBall(k, g.cx, g.cy, v.aimed || k > 0)]),
        };
      }
    }
  }

  // ───────── 즉사 (판 엎자 · 프로젝트 드랍 · 권고사직) ─────────

  private fire(kind: KillId): void {
    this.clearPatterns();
    const p = this.host.player();
    // 판 엎기: 4단계부터 반은 위아래로 나뉜다 (내가 있는 쪽이 엎어진다)
    const axis = kind === "flip" && this.ph >= 4 && this.rng() < 0.5 ? "y" : "x";
    const ev: Ev = { kind, t: 0, warn: kind === "flip" ? flipWarn(this.ph, axis) : 0, side: axis === "x" ? (p.x < ACX ? -1 : 1) : p.y < ACY ? -1 : 1, axis, safes: [], seats: [], labels: [] };
    if (kind === "drop") this.dropStart(ev);
    this.ev = ev;
    this.bubbleSay(KILL_INFO[kind].line, 1.8);
    this.showName(KILL_INFO[kind].name);
    this.firstSeen(`k-${kind}`, KILL_INFO[kind].name, KILL_INFO[kind].how);
    this.snd(`k-${kind}:cast`);
  }

  /**
   * 11/22 프로젝트 드랍 (사용자 「화려하고 스피디하게」): 책상 쾅 + 기획서 찢기 → 붉은 경보·사이렌·큰 글자 → 「내 자리」 둘이 초록 고리·카운트 →
   * 서류철이 바닥 전체에 쏟아지고 → 회장님 쪽부터 폭발이 바닥을 휩쓴다 (rules.DROP — 예고는 가장 먼 곳에서 달려와도 닿는 시간 밑으로 안 줄인다)
   */
  private dropStart(ev: Ev): void {
    ev.safes = dropSeats(this.rng, this.covers);
    ev.warn = dropWarn(this.ph, ev.safes);
    const fx: DropFx = { rain: [], blasts: [], ox: Math.max(ARENA.x0, Math.min(ARENA.x1, this.bx)), judged: false, num: [], n: 0, glow: [] };
    for (const s of ev.safes) {
      ev.seats.push(this.sc.add.image(s.x, s.y + 4, CTX.seat).setOrigin(0.5, 1).setDepth(s.y));
      ev.labels.push(this.sc.add.image(s.x, s.y + 8, lb(this.sc, "mySeat")).setOrigin(0.5, 0).setDepth(DEPTH_GROUND - 1).setScale(this.ts()));
      const gl = this.sc.add.image(s.x, s.y - 2, SKT.glow).setTint(GREEN).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_FX + 2).setAlpha(0.7);
      const num = this.sc.add.image(s.x, s.y - 34, lb(this.sc, "dn3")).setDepth(DEPTH_FX + 32).setScale(this.ts());
      fx.glow.push(gl);
      fx.num.push(num);
      ev.labels.push(gl, num);
    }
    const nearSeat = (x: number, y: number, r: number) => ev.safes.some((s) => Math.hypot(x - s.x, (y - s.y) * 1.3) < r);
    // 서류철 비: 폭발 rain초 전부터 바닥 전체에 (자리 둘레는 비운다)
    const nR = this.lowFx ? 10 : 18;
    for (let i = 0; i < nR; i++) {
      let x = 0;
      let y = 0;
      for (let k = 0; k < 6; k++) {
        x = ARENA.x0 + 10 + ((i * 0.618 + this.rng() * 0.5) % 1) * (AW - 20);
        y = ARENA.y0 + 10 + this.rng() * (AH - 20);
        if (!nearSeat(x, y, 34)) break;
      }
      fx.rain.push({ x, y, at: ev.warn - DROP.rain + (i / nR) * DROP.rain * 0.8 + this.rng() * 0.06, done: false });
    }
    // 폭발: 가로 8칸 × 세로 3줄, 회장님 x에서 양옆으로 휩쓴다 (자리 둘레 36px는 비운다)
    const C = 8;
    const R = 3;
    for (let c = 0; c < C; c++)
      for (let r = 0; r < R; r++) {
        const x = ARENA.x0 + ((c + 0.5) / C) * AW + (this.rng() - 0.5) * 22;
        const y = ARENA.y0 + ((r + 0.5) / R) * AH + (this.rng() - 0.5) * 26;
        if (nearSeat(x, y, 36)) continue;
        fx.blasts.push({ x, y, at: ev.warn + dropSweepAt(x, fx.ox) + this.rng() * 0.04, done: false, big: r === 1 && c % 3 === 1 });
      }
    ev.drop = fx;
    // 책상 쾅: 회장님 발밑 충격 + 기획서가 찢겨 흩날린다
    this.host.fx.impact(this.bx, this.by, true, true, 0xffd27a);
    this.host.skfx.ring(this.bx, this.by, 70, 0xff5a3c, 380, 3);
    this.shake(200, 0.009);
    this.host.skfx.screenFlash(0xff2020, 0.35, 260);
    this.debris(this.bx, this.by - 26 * BK, 18, [0xf6f2e4, 0xffffff, 0xc9402f], 90);
    for (let i = 0; i < (this.lowFx ? 3 : 7); i++) {
      const a = (i / 7) * Math.PI * 2 + this.rng();
      const to = clampArena({ x: this.bx + Math.cos(a) * (40 + this.rng() * 50), y: this.by + Math.sin(a) * 30 + 10 });
      this.throwImg(CTX.paper, this.bx + (this.rng() - 0.5) * 20, this.by - 28 * BK, to.x, to.y, 0.45 + this.rng() * 0.2, 30 + this.rng() * 30, true, () => {});
    }
    // 경보 (사이렌) · 큰 글자
    this.later(0.12, () => this.snd("siren"));
    bridge.emit("chairman:ui", { kind: "banner", text: KILL_INFO.drop.name, hot: true, big: true });
  }

  private stepDrop(e: Ev, fx: DropFx, prev: number): void {
    const t = e.t;
    const cross = (a: number) => prev < a && t >= a;
    const p = this.host.player();
    // 카운트 (구운 숫자 그림만 바꾼다)
    const n = Math.max(1, Math.min(3, Math.ceil(e.warn - t)));
    if (t < e.warn) {
      if (n !== fx.n) {
        fx.n = n;
        for (const o of fx.num) o.setTexture(lb(this.sc, `dn${n}`));
      }
      const f = (e.warn - t) % 1;
      for (const o of fx.num) o.setScale(this.ts() * (1 + Math.max(0, f - 0.7) * 1.6)).setVisible(true);
    } else for (const o of fx.num) o.setVisible(false);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 12);
    for (const g of fx.glow) g.setScale(0.9 + pulse * 0.35, 0.6 + pulse * 0.22).setAlpha(t < e.warn + DROP.sweep ? 0.55 + pulse * 0.35 : Math.max(0, 1 - (t - e.warn - DROP.sweep)));
    // 서류철 비: 위에서 곧장 떨어져 꽝 (소리는 셋에 하나)
    fx.rain.forEach((r, i) => {
      if (r.done || t < r.at - 0.3) return;
      r.done = true;
      const tex = i % 3 === 2 ? CTX.paper : CTX.folder;
      this.throwImg(tex, r.x + (this.rng() - 0.5) * 30, r.y - 200, r.x, r.y, 0.3, 0, i % 2 === 0, () => {
        this.sheet(FXT.impact, r.x, r.y - 4, 4, 0.22, 0.7);
        this.sheet(FXT.puff, r.x, r.y, 3, 0.3, 1.6);
        this.debris(r.x, r.y - 2, 6, [0xf6f2e4, 0xe8b850, 0xffffff], 60);
        this.decal(this.sc.add.image(r.x, r.y + 2, tex).setOrigin(0.5, 1).setDepth(r.y - 1).setRotation((this.rng() - 0.5) * 0.8), Math.max(0.4, e.warn + DROP.sweep - t + 0.2));
        this.shake(70, 0.003);
        if (i % 3 === 0) this.host.sfx("slam", 0.22);
      });
    });
    if (cross(e.warn)) {
      this.snd("k-drop:hit");
      this.host.skfx.screenFlash(0xffe0c0, 0.45, 200);
      this.shake(520, 0.012);
    }
    // 휩쓰는 폭발 (boom이 0.1초에 넷까지만 온전히 — 나머지는 충격·고리만)
    for (const b of fx.blasts) {
      if (b.done || t < b.at) continue;
      b.done = true;
      this.boom(b.x, b.y, b.big ? 1.3 : 1, b.big ? 0xffd27a : 0xff8a50, b.big);
      if (!this.lowFx) this.debris(b.x, b.y - 4, 5, [0xf6f2e4, 0xe8b850], 80);
    }
    // 내 칸에 폭발이 닿는 순간 판정 (자리 안이면 산다)
    if (!fx.judged && t >= e.warn + dropSweepAt(p.x, fx.ox)) {
      fx.judged = true;
      if (dropSafe(p, e.safes)) this.host.float(p.x, p.y - 30, "살았다!", "#9ff0c8");
      else this.killHit();
    }
    // 다 휩쓸면 자리가 초록으로 번쩍
    if (cross(e.warn + DROP.sweep)) {
      for (const s of e.safes) {
        this.glowArt("wisp-burst", s.x, s.y - 8, 0.6, 0.7, 0xb0ffd0);
        this.host.skfx.ring(s.x, s.y, 46, GREEN, 420, 3);
        this.debris(s.x, s.y, 12, [0x8fe0a8, 0xffffff], 70);
      }
    }
  }

  /** 회장님 공격에 맞기 (무적(시험)이면 안 맞는다 — 즉사도) */
  private hurtP(dmg: number): boolean {
    return this.godOn ? false : this.host.hurt(dmg);
  }
  private god = false;
  /** 11/21 무적(시험)을 쓸 수 있다 (개발 서버 + 운영자) · 이번 판에 켠 채 싸운 적이 있다 (끝에 서버가 연습 판으로 친다) */
  private godAble = false;
  private godUsed = false;
  /** HuntScene hurtPlayer도 본다 (벌레·상태 이상까지) */
  get godOn(): boolean {
    return GOD_OK && this.god;
  }
  private toggleGod(): void {
    if (!GOD_OK || !this.godAble || this.deadT >= 0) return;
    this.god = !this.god;
    this.host.flash(this.god ? "무적 시험 켬 — 이번 판은 기록이 남지 않아요" : "무적 시험 끔", 1200);
  }
  /** 개발 손잡이: 봉인 시계를 앞당긴다 (ms) */
  private sealBoost = 0;

  private killHit(): void {
    // 즉사: 최대 HP의 몇 배 (낙법·무적이면 안 맞는다)
    this.hurtP(this.host.maxHp() * 30);
  }

  private stepEv(dt: number): void {
    const e = this.ev!;
    const prev = e.t;
    e.t += dt;
    const cross = (a: number) => prev < a && e.t >= a;
    const p = this.host.player();
    if (e.kind === "quit") {
      const tx = clampArena({ x: p.x + (p.x > WW / 2 ? -58 : 58), y: p.y - 14 });
      const d = Math.hypot(tx.x - this.bx, tx.y - this.by);
      if (d > 2 && e.t < 1.2) {
        this.bx += ((tx.x - this.bx) / d) * 90 * dt;
        this.by += ((tx.y - this.by) / d) * 90 * dt;
      }
      if (cross(3.5)) {
        this.snd("k-quit:hit");
        this.boom(this.bx, this.by - 10 * BK, 2.6, 0xffd27a, true);
        this.host.skfx.screenFlash(0xffffff, 0.6, 260);
        if (this.host.rolling()) this.host.float(p.x, p.y - 30, "무적 회피!", "#9ff0c8");
        else this.killHit();
      }
    }
    if (e.kind === "drop" && e.drop) this.stepDrop(e, e.drop, prev);
    // 11/22 예고 3.0초 → 1.8~2.07초 (rules.flipWarn)
    if (e.kind === "flip" && cross(e.warn)) {
      this.snd("k-flip:hit");
      const r = this.flipRect(e);
      for (let k = 0; k < (this.lowFx ? 5 : 9); k++) this.boom(r.x + 20 + this.rng() * (r.w - 40), Math.max(ARENA.y0, r.y) + 14 + this.rng() * (Math.min(ARENA.y1, r.y + r.h) - Math.max(ARENA.y0, r.y) - 28), 1.1, 0xffd27a, k === 3);
      this.host.skfx.screenFlash(0xffe0c0, 0.5, 220);
      if (inRect(p, r)) this.killHit();
    }
    if (e.t > (e.kind === "flip" ? e.warn + 2.4 : e.kind === "drop" ? e.warn + DROP.sweep + 1.1 : 5.4)) {
      for (const o of [...e.seats, ...e.labels]) o.destroy();
      this.ev = null;
      this.nextPat = 1.2;
    }
  }

  /** 판 엎기로 쓸리는 반쪽 (방 전체 기준) */
  private flipRect(e: Ev): { x: number; y: number; w: number; h: number } {
    if (e.axis === "x") return e.side < 0 ? { x: 0, y: FL, w: ACX, h: WH - FL } : { x: ACX, y: FL, w: WW - ACX, h: WH - FL };
    return e.side < 0 ? { x: 0, y: FL, w: WW, h: ACY - FL } : { x: 0, y: ACY, w: WW, h: WH - ACY };
  }

  // ───────── 탕비실 믹스커피 (회복 아이템) ─────────

  /** 내 자리에서 120px 넘게 · 예고(빨간 칸·덩어리·사무실 이전)가 없는 바닥 · 구조물 위가 아닌 곳에 한 잔. 자리가 없으면 다음 프레임에 다시 */
  private placeCoffee(): void {
    const bad = (q: { x: number; y: number }) =>
      this.tele.some((z) => !z.done && this.inTele(q, z)) ||
      this.balls.some((b) => Math.hypot(q.x - b.x, q.y - b.y) < b.r + 30) ||
      (!!this.zone && !this.zone.done);
    const at = coffeeSpot(this.rng, this.host.player(), this.covers, bad);
    if (!at) return;
    this.coffeePlaced = true;
    this.dropCoffee();
    const img = this.sc.add.image(at.x, at.y + 1, CTX.coffee).setOrigin(0.5, 1).setDepth(at.y).setScale(1.4);
    const glow = this.sc.add.image(at.x, at.y - 6, SKT.glow).setTint(0xffd890).setBlendMode(Phaser.BlendModes.ADD).setDepth(at.y - 1).setAlpha(0.55);
    this.coffee = { x: at.x, y: at.y, t: 0, img, glow };
    this.sheet(FXT.puff, at.x, at.y - 4, 3, 0.3, 1.4);
    this.glowArt("proc-star", at.x, at.y - 8, 0.22, 0.5, 0xfff0c0);
  }

  private dropCoffee(): void {
    this.coffee?.img.destroy();
    this.coffee?.glow.destroy();
    this.coffee = null;
  }

  private stepCoffee(dt: number): void {
    const c = this.coffee;
    if (!c) return;
    c.t += dt;
    const p = this.host.player();
    if (this.deadT < 0 && Math.hypot(p.x - c.x, (p.y - c.y) * 1.3) < COFFEE.pick) {
      // 마시기: 최대 체력 20% 고정 (host.heal = 물약 길 — 회복 감소·초당 상한 없이)
      this.host.heal(COFFEE.heal);
      this.host.float(c.x, c.y - 22, "커피 한 잔", "#ffe0a8");
      this.snd("coffee");
      this.glowArt("wisp-burst", c.x, c.y - 8, 0.45, 0.5, 0xffe0b0);
      this.host.skfx.ring(p.x, p.y - 6, 22, 0x9ff0c8, 360, 2);
      this.dropCoffee();
      return;
    }
    // 마지막 3초 깜빡 → 김이 빠지며 사라진다
    const left = COFFEE.life - c.t;
    const blink = left < COFFEE.blink && Math.floor(c.t * 8) % 2 === 1;
    c.img.setAlpha(blink ? 0.35 : 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    c.glow.setAlpha((blink ? 0.15 : 0.35 + pulse * 0.25) * Math.min(1, left / COFFEE.blink + 0.3)).setScale(0.32 + pulse * 0.06, 0.24 + pulse * 0.04);
    if (left <= 0) {
      this.sheet(FXT.puff, c.x, c.y - 6, 3, 0.35, 1.2);
      this.dropCoffee();
    }
  }

  /** 김 세 줄 · 반짝임 · 발밑 초록 빛 (그래픽만 — 글자 없음) */
  private drawCoffee(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics): void {
    const c = this.coffee;
    if (!c) return;
    const now = this.t;
    const left = COFFEE.life - c.t;
    const steam = Math.max(0, Math.min(1, left / COFFEE.blink));
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    g.lineStyle(2, GREEN, 0.5 + pulse * 0.4).strokeEllipse(c.x, c.y, 26 + pulse * 6, 12 + pulse * 3);
    // 김 세 줄 (마지막 3초엔 옅어진다)
    for (let i = 0; i < 3; i++) {
      const q = (now * 0.8 + i / 3) % 1;
      const x = c.x - 3 + i * 3 + Math.sin(q * 7 + i * 2) * 2;
      const y = c.y - 19 - q * 16;
      top.fillStyle(0xf8f4ee, (1 - q) * 0.8 * steam).fillRect(Math.round(x), Math.round(y), 2, 3);
    }
    // 반짝임 (네 갈래 별이 돌아가며)
    const sp = (now * 1.3) % 1;
    const sx = c.x + Math.cos(now * 2.1) * 9;
    const sy = c.y - 9 + Math.sin(now * 2.1) * 5;
    const al = Math.sin(sp * Math.PI);
    top.fillStyle(0xfff6c8, al).fillRect(sx - 2, sy, 5, 1).fillRect(sx, sy - 2, 1, 5);
  }

  // ───────── 단계 변신 ─────────

  private startStrip(to: number): void {
    if (!STRIP[to]) return;
    this.clearPatterns();
    this.strip = { t: 0, to, thrown: false, relaid: false };
    this.bubbleSay(STRIP[to]!.line, 1.8);
  }

  private stepStrip(dt: number): void {
    const st = this.strip;
    if (!st) return;
    st.t += dt;
    if (!st.thrown && st.t > 0.7) {
      st.thrown = true;
      this.stg = st.to;
      // 11/21 전환 화면이 이미 0.3배로 1.4초 느렸다 → 던질 때는 더 느리게 하지 않고, 큰 폭발의 히트스톱도 건너뛴다
      this.lastStop = this.t;
      this.host.skfx.screenFlash(st.to >= 4 ? 0xff7a60 : 0xfff4dc, 0.4, 260);
      bridge.emit("chairman:ui", { kind: "banner", text: STRIP[st.to]!.text, hot: st.to >= 4 });
      this.boom(this.bx, this.by - 30 * BK, 1.4, st.to >= 4 ? 0xff7a60 : 0xfff0c0, st.to >= 4);
      this.glowArt("bonfire-sun", this.bx, this.by - 30 * BK, 0.6, 0.8, st.to >= 4 ? 0xff8a60 : 0xffe8b0);
      this.snd(st.to >= 5 ? "crunch" : "strip");
      this.nextPat = Math.min(this.nextPat, 1.0);
      if (st.to <= 4) {
        const side = this.rng() < 0.5 ? -1 : 1;
        const to = clampArena({ x: this.bx + side * (90 + this.rng() * 120), y: this.by + 40 + this.rng() * 80 });
        const k = st.to;
        this.throwImg(CTX.item(k), this.bx, this.by - 40 * BK, to.x, to.y, 0.8, 110, true, () => {
          this.sheet(FXT.puff, to.x, to.y, 3, 0.35, 2.4);
          this.debris(to.x, to.y, 8, [0xcfd5e2, 0xffffff], 50);
          this.props.push(this.sc.add.image(to.x, to.y + 2, CTX.item(k)).setOrigin(0.5, 1).setDepth(to.y - 1));
          if (k === 3) {
            this.snd("glass");
            this.debris(to.x, to.y - 2, 10, [0xd8eef6, 0xffffff], 60);
            this.host.float(to.x, to.y - 14, "쨍그랑!", "#d8eef6");
          }
        });
      }
    }
    if (!st.relaid && st.t > 1.3) {
      st.relaid = true;
      this.relay();
      this.bubbleSay("책상 다시 배치해!", 1.2);
    }
    if (st.t > 2.0) this.strip = null;
  }

  private clearPatterns(): void {
    this.runs = [];
    this.laters = [];
    for (const z of this.tele) this.dropTele(z);
    this.tele = [];
    this.mails = [];
    // 아직 안 굴러간 덩어리 (즉사·변신 때) — 굴러가는 건 그대로 둔다
    this.balls = this.balls.filter((b) => {
      if (b.st.ph === "roll") return true;
      this.dropBall(b);
      return false;
    });
    this.beams = [];
    if (this.zone) this.zone.label.destroy();
    this.zone = null;
    this.darkUntil = 0;
  }

  // ───────── 숨을 곳 ─────────

  /** 다시 배치 (단계가 바뀔 때) */
  private relay(): void {
    for (const img of this.coverImg.values()) img.destroy();
    this.coverImg.clear();
    this.covers = layCovers(this.rng);
    this.syncCovers(true);
  }

  private syncCovers(puff: boolean): void {
    // 내가 구조물 안에 끼지 않게 (새로 깔린 자리 밖으로)
    const p = this.host.player();
    for (const c of this.covers) {
      const r = coverRect(c);
      if (inRect(p, r, 8)) c.y = Math.min(ARENA.y1 - 2, r.y + r.h + 24 + COVER_FP[c.kind][1]);
      this.coverImg.set(c, this.sc.add.image(c.x, c.y + 2, CTX.cover(c.kind)).setOrigin(0.5, 1).setDepth(c.y));
      if (puff) this.sheet(FXT.puff, c.x, c.y - 6, 3, 0.35, 2.2);
    }
  }

  private hitCover(c: Cover, n = 1): void {
    if (c.dead) return;
    c.hp -= n;
    c.hitT = this.t;
    this.debris(c.x, c.y - 10, 5, [0xcfd5e2, 0xffffff, 0x8a8a98], 50);
    if (c.hp > 0) return;
    c.dead = true;
    this.coverImg.get(c)?.destroy();
    this.coverImg.delete(c);
    this.sheet(FXT.puff, c.x, c.y - 8, 3, 0.4, 2.6);
    this.debris(c.x, c.y - 10, 16, c.kind === "pile" ? [0xf6f2e4, 0xe6e0cc, 0xc9402f] : [0x7a8aa6, 0xcfd5e2, 0xffe08a], 80);
    this.host.float(c.x, c.y - 26, "와장창!", "#ffe0b0");
    this.shake(80, 0.003);
  }

  // ───────── 예고 ─────────

  private addTele(shape: Shape, o: Partial<Tele>, warn: number, on: (z: Tele) => void, extra: Partial<Tele> = {}): Tele {
    const z: Tele = { shape, x: 0, y: 0, r: 0, w: 0, h: 0, x1: 0, y1: 0, len: 0, ...o, ...extra, warn: warn / this.spd, t: 0, done: false, flash: 0, on };
    if (z.meteor) z.air = this.sc.add.image(z.x, z.y - 160, art(this.sc, "meteor-comet")).setRotation(2.3).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_FX + 10);
    if (z.meteor) z.air2 = this.sc.add.image(z.x, z.y - 166, lb(this.sc, "star1")).setDepth(DEPTH_FX + 11).setScale(this.ts());
    if (z.count) z.label = this.sc.add.image(z.x, z.y - 22, lb(this.sc, "c3")).setDepth(DEPTH_FX + 11).setScale(this.ts());
    this.tele.push(z);
    return z;
  }

  private dropTele(z: Tele): void {
    z.label?.destroy();
    z.air?.destroy();
    z.air2?.destroy();
    z.label = z.air = z.air2 = undefined;
  }

  private inTele(p: { x: number; y: number }, z: Tele): boolean {
    switch (z.shape) {
      case "circle":
        return Math.hypot((p.x - z.x) / z.r, (p.y - z.y) / (z.r * 0.6)) < 1;
      case "rect":
        return p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h;
      case "line": {
        const dx = z.x1 - z.x;
        const dy = z.y1 - z.y;
        const L2 = dx * dx + dy * dy || 1;
        const u = ((p.x - z.x) * dx + (p.y - z.y) * dy) / L2;
        if (u < 0 || u > 1) return false;
        return Math.hypot(p.x - (z.x + dx * u), p.y - (z.y + dy * u)) < z.w / 2;
      }
      case "cross":
        return (Math.abs(p.x - z.x) < z.w / 2 && Math.abs(p.y - z.y) < z.len) || (Math.abs(p.y - z.y) < z.w / 2 && Math.abs(p.x - z.x) < z.len);
    }
  }

  /** 예고 판정: 서류 산더미에 붙어 있으면 운석·도장을 대신 맞는다 */
  private strikeHit(z: Tele, base: number): void {
    const p = this.host.player();
    if (z.meteor || z.stamp) {
      const pile = this.covers.find((c) => !c.dead && c.kind === "pile" && inRect(p, coverRect(c), 18) && this.inTele({ x: c.x, y: c.y - 4 }, z));
      if (pile) {
        this.hitCover(pile, 9);
        this.host.float(p.x, p.y - 26, "막았다!", "#9ff0c8");
        return;
      }
    }
    if (this.inTele(p, z)) this.hurtP(hitDamage(base, this.host.maxHp(), this.dmgK));
  }

  private stepTele(dt: number): void {
    for (const z of this.tele) {
      z.t += dt;
      if (z.swapAt !== undefined && !z.swapped && z.t > z.swapAt) {
        z.swapped = true;
        z.live = z.swapTo;
        if (z.live) this.host.float(z.x + z.w / 2, z.y + z.h / 2, "기획 변경!", "#ff9a7a");
      }
      if (z.count && z.label) {
        const n = Math.max(1, Math.ceil(z.warn - z.t));
        z.label.setTexture(lb(this.sc, `c${Math.min(5, n)}`));
      }
      if (z.meteor && z.air && z.air2) {
        const h = (1 - Math.min(1, z.t / z.warn)) * 160;
        z.air.setPosition(z.x + h * 0.4, z.y - h);
        z.air2.setPosition(z.x + h * 0.4, z.y - h - 8);
      }
      if (!z.done && z.t >= z.warn) {
        z.done = true;
        z.flash = 0.16;
        this.dropTele(z);
        z.on?.(z);
      }
      if (z.flash > 0) z.flash -= dt;
    }
    this.tele = this.tele.filter((z) => !z.done || z.flash > 0);
  }

  // ───────── 탄 · 떨어지는 것 · 졸개 ─────────

  private shoot(tex: string, x: number, y: number, vx: number, vy: number, life: number, r: number, dmg: number, tint: number, spin: number): void {
    if (this.bullets.length >= BULLET_CAP) return;
    const img = (this.bulletFree.pop() ?? this.sc.add.image(0, 0, tex)).setTexture(tex).setVisible(true).setPosition(x, y).setTint(tint).setDepth(DEPTH_FX - 2);
    this.bullets.push({ img, x, y, vx: vx * this.spd, vy: vy * this.spd, t: 0, life, r, dmg, on: true, spin });
  }

  private stepBullets(dt: number): void {
    const p = this.host.player();
    for (const b of this.bullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const c of this.covers)
        if (b.on && blocks(c) && inRect(b, coverRect(c), 3)) {
          b.on = false;
          if (this.t - c.hitT > 0.25) this.hitCover(c);
          this.sheet(FXT.impact, b.x, b.y, 4, 0.18, 0.6);
          break;
        }
      if (b.on && Math.hypot(b.x - p.x, (b.y - p.y + 6) * 1.4) < b.r + 4) {
        b.on = false;
        this.hurtP(hitDamage(b.dmg, this.host.maxHp(), this.dmgK));
        this.sheet(FXT.impact, b.x, b.y, 4, 0.2, 0.7);
      }
      b.img.setPosition(b.x, b.y).setRotation(b.spin ? this.t * b.spin + b.vx : 0);
      if (!b.on || b.t > b.life || b.x < -20 || b.x > WW + 20 || b.y < FL || b.y > WH + 10) {
        b.on = false;
        b.img.setVisible(false);
        this.bulletFree.push(b.img);
      }
    }
    this.bullets = this.bullets.filter((b) => b.on);
  }

  private throwImg(tex: string, fx: number, fy: number, x: number, y: number, dur: number, arc: number, spin: boolean, land: () => void): void {
    const img = this.sc.add.image(fx, fy, tex).setDepth(DEPTH_FX - 1);
    this.falls.push({ img, fx, fy, x, y, t: 0, dur, arc, spin, land });
  }

  private stepFalls(dt: number): void {
    for (const f of this.falls) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.img.setPosition(lerp(f.fx, f.x, k), lerp(f.fy, f.y, k) - Math.sin(k * Math.PI) * f.arc);
      if (f.spin) f.img.setRotation(this.t * 14);
      if (k >= 1) {
        f.img.destroy();
        f.land();
      }
    }
    this.falls = this.falls.filter((f) => f.t < f.dur);
  }

  private stepMobs(dt: number): void {
    const p = this.host.player();
    for (const m of this.mobs) {
      m.t += dt;
      if (m.kind === "bomb") {
        // 확률 공개의 당첨 캡슐(t<0)은 주우면 물약
        if (m.t < -50) {
          if (Math.hypot(p.x - m.x, p.y - m.y) < 12) {
            m.ttl = -999;
            this.host.heal(0.2);
            this.glowArt("wisp-burst", m.x, m.y - 6, 0.5, 0.5, 0xb0ffd0);
            this.host.sfx("potion", 0.6);
          } else if (m.t + 99 > m.ttl) m.ttl = -999;
        } else m.img.setX(m.x + Math.sin(this.t * 30) * (m.t > 1.6 ? 1.5 : 0.5));
      }
      if (m.kind === "pop") m.img.setScale(m.t < 0.2 ? 1 + (0.2 - m.t) * 2 : 1);
      if (m.kind === "gather" && m.tx !== undefined && m.ty !== undefined) {
        const k = Math.min(1, m.t / m.ttl);
        m.x = lerp(m.x, m.tx, k * 0.08 + 0.01);
        m.y = lerp(m.y, m.ty, k * 0.08 + 0.01);
        m.img.setPosition(m.x, m.y).setDepth(m.y);
      }
    }
    this.mobs = this.mobs.filter((m) => {
      const alive = m.t < -50 ? m.ttl > -999 : m.t < m.ttl;
      if (!alive) m.img.destroy();
      return alive;
    });
    // 벌레 떼
    for (const b of this.bugs) {
      b.ttl -= dt;
      const m = b.m;
      if (!m.alive) continue;
      b.img.setPosition(Math.round(m.x), Math.round(m.y) + 2).setDepth(m.y).setFlipX(m.x > p.x);
      if (!b.bit && Math.hypot(m.x - p.x, m.y - p.y) < 10) {
        b.bit = true;
        this.hurtP(hitDamage(DMG.light * 0.6, this.host.maxHp(), this.dmgK));
      }
    }
    this.bugs = this.bugs.filter((b) => {
      if (b.m.alive && b.ttl > 0) return true;
      if (!b.m.alive) {
        this.glowArt("proc-star", b.m.x, b.m.y - 4, 0.18, 0.35, 0xfff0a0);
        this.host.float(b.m.x, b.m.y - 12, "기능!", "#ffe08a");
      } else this.host.removeMob(b.m);
      b.img.destroy();
      return false;
    });
  }

  private spawnTruck(lane: number, dir: number): void {
    const y = (truckLaneTop(lane) + truckLaneTop(lane + 1)) / 2 + 10;
    const x = truckStartX(dir);
    const img = this.sc.add.image(x, y, CTX.truck).setOrigin(0.5, 1).setFlipX(dir < 0);
    const label = this.sc.add.image(x, y - 14, lb(this.sc, "truckSign")).setScale(0.5);
    const light = this.sc.add.image(x, y - 8, SKT.glow).setTint(0xfff0b4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setScale(1.6, 1);
    this.trucks.push({ img, label, light, lane, x, y, dir, t: 0, hit: false });
    this.snd("truck:hit");
  }

  private stepTrucks(dt: number): void {
    const p = this.host.player();
    for (const tr of this.trucks) {
      tr.t += dt;
      tr.x += tr.dir * TRUCK.sp * this.spd * dt;
      for (const c of this.covers) if (!c.dead && Math.abs(tr.y - c.y) < 22 && Math.abs(tr.x - c.x) < 30) this.hitCover(c, 9);
      // 11/22 맞는 자리 = 빨간 줄 그대로 (초록 길과 딱 맞물린다 — rules.truckHits)
      if (!tr.hit && truckHits(tr, p)) {
        tr.hit = true;
        this.hurtP(hitDamage(DMG.heavy, this.host.maxHp(), this.dmgK));
        this.boom(p.x, p.y, 0.8, 0xffd27a);
      }
      tr.img.setPosition(tr.x, tr.y).setDepth(tr.y);
      tr.label.setPosition(tr.x - tr.dir * 6, tr.y - 14).setDepth(tr.y + 0.1);
      tr.light.setPosition(tr.x + tr.dir * 30, tr.y - 10).setDepth(tr.y + 0.2);
      if (!this.lowFx && Math.floor(tr.t * 20) % 2) this.debris(tr.x - tr.dir * 26, tr.y, 1, [0x8a8a98, 0xcfd5e2], 20);
    }
    this.trucks = this.trucks.filter((tr) => {
      if (tr.t < TRUCK.life) return true;
      tr.img.destroy();
      tr.label.destroy();
      tr.light.destroy();
      return false;
    });
  }

  /** 덩어리 하나 시작: 유령 22명이 빨려 들며 뭉친다 (자기 유령만 갖는다) · 굴러 나갈 자리에 예고 원 */
  private startBall(k: number, cx: number, cy: number, aim: boolean): void {
    const st = gatherBall(k, cx, cy, this.spd);
    const ghosts: Mob[] = [];
    for (let j = 0; j < 22; j++) {
      const a = (j / 22) * Math.PI * 2 + k * 0.4;
      const x = cx + Math.cos(a) * 250;
      const y = cy + Math.sin(a) * 140;
      const m: Mob = { kind: "gather", img: this.sc.add.image(x, y, CTX.staff(j % 6)).setOrigin(0.5, 1).setAlpha(0.8), x, y, t: 0, ttl: GATHER.gather, tx: cx, ty: cy };
      ghosts.push(m);
      this.mobs.push(m);
    }
    this.glowArt("harvest-vortex", cx, cy, 0.6, GATHER.gather + 0.3, 0xd0c0ff, true, 0.7, 0.1, true);
    if (k > 0) this.snd("gather:cast");
    // 예고 원: 모이는 동안 + 들어 올리는 동안 (굴러 나가는 순간 이 자리에 있으면 맞는다)
    this.addTele("circle", { x: cx, y: cy, r: 44 }, (GATHER.gather + st.lift) * this.spd, () => {});
    const box = this.sc.add.container(cx, cy).setScale(0.2);
    for (let j = 0; j < 18; j++) box.add(this.sc.add.image(0, 0, CTX.staff(j % 6)));
    this.balls.push({ st, box, x: cx, y: cy, vx: 0, vy: 0, r: 34, hit: false, aim, ghosts });
  }

  private dropBall(b: Ball): void {
    b.box.destroy();
    for (const m of b.ghosts) m.ttl = 0;
  }

  private stepBalls(dt: number): void {
    const p = this.host.player();
    for (const b of this.balls) {
      const ch = stepGather(b.st, dt);
      const st = b.st;
      if (ch === "lift") {
        // 굴러갈 줄 예고 (들어 올리는 동안)
        const tg = b.aim ? this.lead(0.6 + st.lift) : this.host.player();
        const ang = Math.atan2(tg.y - b.y, tg.x - b.x);
        b.vx = Math.cos(ang) * 240 * this.spd;
        b.vy = Math.sin(ang) * 170 * this.spd;
        this.addTele("line", { x: b.x, y: b.y, x1: b.x + Math.cos(ang) * 520, y1: b.y + Math.sin(ang) * 360, w: 68 }, st.lift * this.spd, () => {});
      }
      if (ch === "roll") {
        this.boom(b.x, b.y, 1.4, 0xd0a0ff);
        this.snd("gather:hit");
      }
      if (st.ph === "gone") continue;
      let lift = 0;
      let al = 1;
      if (st.ph === "gather") {
        const k = st.t / GATHER.gather;
        b.box.setScale(0.2 + 0.8 * k * k);
        al = 0.4 + 0.6 * k;
        b.r = 34 * (0.4 + 0.6 * k);
      } else if (st.ph === "lift") {
        const k = (st.t - GATHER.gather) / st.lift;
        b.box.setScale(1 + Math.sin(this.t * 40) * 0.04);
        lift = 18 * Math.min(1, k * 2);
        b.r = 34;
      } else {
        b.box.setScale(1);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r = 34 + Math.sin(this.t * 10) * 1.5;
        const left = GATHER.gather + st.lift + st.roll + GATHER.fade - st.t;
        al = Math.min(1, left / GATHER.fade);
        if (!b.hit && al > 0.5 && Math.hypot(b.x - p.x, (b.y - p.y) * 1.3) < b.r) {
          b.hit = true;
          this.hurtP(hitDamage(DMG.heavy, this.host.maxHp(), this.dmgK));
        }
        if (!this.lowFx && Math.floor(st.t * 30) % 2) this.debris(b.x, b.y + b.r * 0.5, 1, [0xcfd5e2, 0x8a8a98], 30);
      }
      b.box.setPosition(b.x + (st.ph === "lift" ? Math.sin(this.t * 50) * 1.5 : 0), b.y - b.r * 0.6 - lift).setDepth(b.y).setAlpha(al);
      b.box.list.forEach((o, k) => {
        const a = k * 0.35 + this.t * (st.ph === "gather" ? 9 : 6);
        const rr = 34 * (0.4 + (k % 3) * 0.25);
        (o as Phaser.GameObjects.Image).setPosition(Math.cos(a) * rr, Math.sin(a) * rr * 0.7).setRotation(a);
      });
    }
    this.balls = this.balls.filter((b) => {
      if (b.st.ph !== "gone") return true;
      this.dropBall(b);
      return false;
    });
  }

  // ───────── 메일 파도 · OKR 레이저 · 사무실 이전 ─────────

  /** 파도·레이저를 막는 그늘: 구조물 바로 뒤(파도가 오는 반대쪽) 80px */
  private shadowed(x: number, y: number, vy: number): boolean {
    return this.covers.some((c) => {
      if (!blocks(c)) return false;
      const r = coverRect(c);
      if (x < r.x - 2 || x > r.x + r.w + 2) return false;
      return vy > 0 ? r.y < y && y - (r.y + r.h) < 80 : r.y + r.h > y && r.y - y < 80;
    });
  }

  /**
   * 메일 파도 (rules.MailSeq): 11/22 사용자 「메일이 올라오면서 범위가 바뀌며 이어진다」 → 한 줄씩 따로.
   * 예고(띵 + 벽 빨간 띠·편지) 순간 초록 틈이 정해지고 그 파도가 맞은편 벽 밖으로 다 빠질 때까지 안 움직인다. 빠르기는 단계마다 6%씩 (rules.mailSpeedMul)
   */
  private stepWaves(dt: number): void {
    const p = this.host.player();
    const me = { x: p.x, y: p.y, vmax: this.host.moveMax(), ph: Math.max(0, this.ph), threat: this.threat };
    for (const m of this.mails) {
      const prevT = m.seq.cur?.t ?? -1;
      if (m.seq.step(dt, me, this.deadT >= 0)) {
        m.hitT = -9;
        m.passed = new Set();
        this.snd("mail:cast");
      }
      const w = m.seq.cur;
      if (!w || w.t < w.warn) continue;
      if (prevT < w.warn) this.snd("mail:hit");
      const inGap = w.gaps.some((gx) => p.x > gx + 4 && p.x < gx + MAIL.gw - 4) || this.shadowed(p.x, p.y, w.vy);
      for (const c of this.covers) {
        if (!blocks(c) || m.passed.has(c)) continue;
        const r = coverRect(c);
        if (Math.abs(w.y - (r.y + r.h / 2)) < 6) {
          m.passed.add(c);
          this.hitCover(c);
        }
      }
      if (Math.abs(p.y - w.y) < MAIL.hit && !inGap && this.t - m.hitT > 0.6) {
        m.hitT = this.t;
        this.hurtP(hitDamage(DMG.normal, this.host.maxHp(), this.dmgK));
        this.sheet(FXT.impact, p.x, p.y - 6, 4, 0.2, 1);
      }
    }
    this.mails = this.mails.filter((m) => !m.seq.done && !(this.deadT >= 0 && !m.seq.cur));
  }

  private beamOrigin(): { x: number; y: number } {
    return { x: this.bx, y: this.by - 24 * BK };
  }

  private stepBeams(dt: number): void {
    const p = this.host.player();
    for (const b of this.beams) {
      b.t += dt;
      const o = this.beamOrigin();
      b.x = o.x;
      b.y = o.y;
      const live = b.t > b.warn;
      // 뒤집기 변형: 잠깐 멈췄다가 반대로
      if (b.t >= b.flipAt && b.t - dt < b.flipAt) {
        b.dir = -b.dir;
        this.host.skfx.screenFlash(0xff3c5a, 0.12, 120);
        this.snd("okr:cast");
      }
      const pause = b.t > b.flipAt && b.t < b.flipAt + 0.3;
      b.a += b.dir * (pause ? 0 : live ? b.sp : 0.25) * dt;
      if (live && b.t - dt <= b.warn) this.snd("okr:hit");
      // 줄마다 구조물에 막히는 길이: 프레임에 한 번만 잰다 (그리기도 이 값을 쓴다 — 예전엔 그리기가 따로 또 쟀다)
      for (let i = 0; i < b.n; i++) b.L[i] = rayLen(this.covers, b.x, b.y, b.a + (i / b.n) * Math.PI * 2, BEAM_LEN);
      if (!live) continue;
      for (let i = 0; i < b.n; i++) {
        const a = b.a + (i / b.n) * Math.PI * 2;
        // 막힌 줄 끝의 구조물이 깎인다 (0.9초에 한 번)
        if (b.L[i] < BEAM_LEN - 1) {
          const ex = b.x + Math.cos(a) * (b.L[i] + 2);
          const ey = b.y + Math.sin(a) * (b.L[i] + 2);
          const c = this.covers.find((c) => blocks(c) && inRect({ x: ex, y: ey }, coverRect(c), 3));
          if (c && this.t - c.hitT > 0.9) this.hitCover(c);
        }
        if (this.t - b.hitT <= 0.5) continue;
        const dx = p.x - b.x;
        const dy = p.y - 6 - b.y;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
        // 구조물 뒤(막힌 길이보다 멀리)면 안 맞는다
        if (along > 0 && perp < 8 && along < b.L[i] + 4) {
          b.hitT = this.t;
          this.hurtP(hitDamage(DMG.normal, this.host.maxHp(), this.dmgK));
          break;
        }
      }
    }
    this.beams = this.beams.filter((b) => b.t < b.life);
  }

  private stepZone(dt: number): void {
    const z = this.zone;
    if (!z) return;
    z.t += dt;
    if (!z.done && z.t >= z.warn) {
      z.done = true;
      const p = this.host.player();
      const inside = (x: number, y: number) => Math.abs(x - z.cx) < z.w / 2 && Math.abs(y - z.cy) < z.h / 2;
      this.snd("move:hit");
      if (!inside(p.x, p.y)) this.hurtP(hitDamage(DMG.heavy, this.host.maxHp(), this.dmgK));
      for (const c of this.covers) if (!inside(c.x, c.y)) this.hitCover(c, 9);
      // 걸을 수 있는 바닥 전체(새 사무실만 빼고)가 터진다
      const n = this.lowFx ? 6 : 10;
      for (let k = 0; k < n; k++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 8; tries++) {
          x = ARENA.x0 + this.rng() * AW;
          y = ARENA.y0 + this.rng() * AH;
          if (!inside(x, y)) break;
        }
        this.boom(x, y, 1, 0xffd27a, k === 0);
      }
      this.host.skfx.screenFlash(0xffd0b0, 0.4, 240);
    }
    if (z.t > z.warn + 0.8) {
      z.label.destroy();
      this.zone = null;
    }
  }

  private bolt(x: number, y: number): void {
    const pts: number[] = [];
    let yy = y - 220;
    let xx = x + (Math.random() - 0.5) * 10;
    pts.push(xx, yy);
    while (yy < y) {
      yy = Math.min(y, yy + 12);
      xx += (Math.random() - 0.5) * 12;
      pts.push(xx, yy);
    }
    this.lasers.push({ kind: "bolt", x, y, len: 0, w: 0, t: 0, life: 0.22, pts });
    this.host.skfx.light(x, y, 60, 0xc8e0ff, 260);
  }

  // ───────── 연출 도구 (스킬 그림 · 사냥 이펙트 시트) ─────────

  private glowArt(name: string, x: number, y: number, s: number, life: number, tint = 0xffffff, add = true, alpha = 1, grow = 0.35, floor = false): void {
    if (this.lowFx && !floor && life < 0.5) return;
    // 큰 가산 그림 예산 (초당 30장, 한꺼번에 14장까지) — 바닥 마법진은 늘
    if (!floor) {
      if (this.glowTok < 1) return;
      this.glowTok -= 1;
    }
    this.host.skfx.big({ tex: art(this.sc, name), x, y, s0: s, s1: s * (1 + grow), life: life * 1000, tint, add, alpha, fadeIn: 0.15, fadeOut: 0.85, rot: Math.random() * 6, depth: floor ? DEPTH_GROUND + 2 : DEPTH_FX + 4 });
  }

  /** 이펙트 시트 한 번 (스프라이트는 돌려 쓴다 — 만들고 부수기를 되풀이하지 않게) */
  private sheet(key: string, x: number, y: number, n: number, dur: number, scale = 1, rot = 0): void {
    if (this.sheets.length >= SHEET_CAP) return;
    const s = (this.sheetFree.pop() ?? this.sc.add.sprite(x, y, key, 0)).setTexture(key, 0).setVisible(true).setPosition(x, y);
    // 연기 시트는 칸이 128px라 그대로 2배면 화면을 덮는 하얀 안개가 된다 (11/20 4배 카메라에서 드러남) → 4분의 1
    s.setScale(key === FXT.puff ? scale * 0.25 : scale).setRotation(rot).setDepth(key === FXT.crack ? DEPTH_GROUND - 1 : DEPTH_FX + 6).setBlendMode(key === FXT.impact ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.sheets.push({ s, t: 0, dur, n });
  }

  private stepSheets(dt: number): void {
    for (const f of this.sheets) {
      f.t += dt;
      const i = Math.min(f.n - 1, Math.floor((f.t / f.dur) * f.n));
      f.s.setFrame(i);
      if (f.t >= f.dur) {
        f.s.setVisible(false);
        this.sheetFree.push(f.s);
      }
    }
    this.sheets = this.sheets.filter((f) => f.t < f.dur);
  }

  private decal(img: Phaser.GameObjects.Image, life: number): void {
    this.decals.push({ img, t: 0, life });
    if (this.decals.length > 60) this.decals.shift()!.img.destroy();
  }

  private stepDecals(dt: number): void {
    for (const d of this.decals) {
      d.t += dt;
      d.img.setAlpha(Math.max(0, 1 - d.t / d.life) * 0.85);
    }
    this.decals = this.decals.filter((d) => {
      if (d.t < d.life) return true;
      d.img.destroy();
      return false;
    });
  }

  private debris(x: number, y: number, n: number, tints: number[], speed: number): void {
    this.host.skfx.sparks(x, y, this.lowFx ? Math.ceil(n / 3) : n, tints, speed * 1.6, { ay: 160, life: 520 });
  }

  private shake(ms: number, k: number): void {
    this.host.fx.shake(ms, k);
  }

  /** 큰 폭발: 충격 별 + 스킬 불꽃 빛 + 파편 + 고리 + 그을음 + 흔들림 + 짧은 멈칫 */
  private boom(x: number, y: number, size: number, tint: number, big = false): void {
    const S = this.host.skfx;
    // 11/20 사용자 「공격 두 개가 겹치면 화면이 느려진다」: 폭발마다 히트스톱(40ms 멈춤)이 이어져 게임 시간이 끊겼고,
    // 한 프레임에 폭발 수십 개가 큰 그림·불티를 쏟았다 → 0.1초에 넷까지만 온전히, 나머지는 충격 별·고리만
    this.boomT = this.boomT.filter((t) => this.t - t < 0.1);
    this.boomT.push(this.t);
    if (!big && this.boomT.length > 4) {
      this.host.fx.impact(x, y - 6, false, false, tint);
      S.ring(x, y, 28 * size, tint, 380, 2);
      return;
    }
    this.host.fx.impact(x, y - 6, big, true, tint);
    if (!this.lowFx || big) {
      this.glowArt(big ? "bonfire-sun" : "kindle-burst", x, y - 8, (big ? 0.4 : 0.32) * size, 0.55, tint, true, 0.8);
      this.glowArt("bonfire-flare", x, y - 8, 0.24 * size, 0.3, tint, true, 0.7);
    }
    if (big) {
      this.glowArt("meteor-crater", x, y, 0.75 * size, 0.9, tint, false, 0.9, 0, true);
      this.glowArt("meteor-splash", x, y - 10, 0.6 * size, 0.6, tint);
    }
    this.debris(x, y - 4, Math.round(10 * size), [0xffd25a, 0xff7a3c, 0xffffff, tint], 80 * size);
    S.ring(x, y, 34 * size, tint, 450, 3);
    S.light(x, y, 40 * size, tint, 300, 0.6);
    S.scar(x, y, 12 * size, 0x140a08, 3500, 0.5, 120);
    this.shake(big ? 220 : 100, big ? 0.008 : 0.004 * size);
    if (big && this.t - this.lastStop > 1) {
      this.lastStop = this.t;
      this.host.hitstop(60);
    }
    if (big) this.host.sfx("slam", 0.45);
  }

  // ───────── 말풍선 · 이름 상자 ─────────

  /** 회장님 머리 위에 고정 (화면 가장자리로 밀지 않는다) */
  /** hold: 이 시간(초) 안에는 다른 대사가 덮지 못하고 뒤에 줄 선다 */
  private bubbleSay(text: string, dur: number, hold = 0): void {
    if (this.bubble && this.bubble.t < this.bubble.hold) {
      this.bubbleNext = { text, dur };
      return;
    }
    this.bubbleNext = null;
    this.bubble?.img.destroy();
    const img = this.sc.add.image(this.bx, this.by, bubbleTex(this.sc, text, text)).setOrigin(0.5, 1).setDepth(DEPTH_FX + 50);
    this.bubble = { img, t: 0, dur: Math.max(dur, hold), hold };
  }

  /** 기술 이름 상자 (회장님 발밑) */
  private showName(name: string): void {
    this.nameBox?.img.destroy();
    // 11/20 글자를 크게 (22px · 진한 테두리) — 한 번 굽고 돌려 쓴다
    const img = this.sc.add.image(this.bx, this.by, nameTex(this.sc, name)).setOrigin(0.5, 0).setDepth(DEPTH_FX + 49);
    this.nameBox = { img, t: 0 };
  }

  // ───────── 회장님 ─────────

  private stepBoss(dt: number): void {
    const bm = this.host.boss();
    const run = this.runs[0];
    let pose: string | null = null;
    if (this.strip) pose = this.strip.t < 0.7 ? (this.strip.to >= 4 ? "castRed" : "flip") : this.strip.t < 1.2 ? "throw" : "armsWide";
    else if (this.ev) pose = this.evPose();
    else if (run) pose = run.pose(run.t);
    if (this.deadT >= 0) pose = Math.floor(this.realT * 3) % 2 ? "laugh" : "idle1";
    if (this.dash) {
      this.dash.t -= dt;
      const k = Math.min(1, dt / Math.max(0.01, this.dash.t + dt));
      this.bx = lerp(this.bx, this.dash.x, k);
      this.by = lerp(this.by, this.dash.y, k);
      if (this.dash.t <= 0) this.dash = null;
      if (!this.lowFx) this.host.skfx.emit({ x: this.bx + (Math.random() - 0.5) * 16, y: this.by - Math.random() * 60, tex: SKT.glow, tint: 0xc8dcff, life: 250, s0: 0.25, s1: 0.1, alpha: 0.6 });
    } else if (!run && !this.ev && !this.strip) {
      if (!this.wander || Math.hypot(this.bx - this.wander.x, this.by - this.wander.y) < 6) this.wander = clampArena({ x: ACX + (this.rng() - 0.5) * 320, y: 150 + this.rng() * 150 });
      const d = Math.hypot(this.wander.x - this.bx, this.wander.y - this.by);
      const sp = 34 * this.spd * dt;
      if (d > 1 && dt > 0) {
        this.bx += ((this.wander.x - this.bx) / d) * Math.min(d, sp);
        this.by += ((this.wander.y - this.by) / d) * Math.min(d, sp);
        this.walk += dt * 8;
        pose ??= `walk${Math.floor(this.walk) % 4}`;
      }
    }
    pose ??= Math.floor(this.t * 2) % 2 ? "idle1" : "idle0";
    const p = this.host.player();
    this.face = p.x >= this.bx ? 1 : -1;
    // HuntScene 몬스터 자리 = 회장님 발 (넉백은 받지 않는다 · 쓰러지지 않는다)
    if (bm) {
      bm.x = this.bx;
      bm.y = this.by;
      bm.kbx = bm.kby = 0;
      bm.hp = bm.st.maxHp;
      bm.sprite.setVisible(false);
    }
    const stg = this.stg;
    this.body.setTexture(CTX.boss(stg), pose).setPosition(Math.round(this.bx), Math.round(this.by) + 4).setFlipX(this.face < 0).setDepth(this.by);
    this.glowL.setTexture(CTX.bossEm(stg), pose).setPosition(this.body.x, this.body.y).setFlipX(this.face < 0).setDepth(this.by + 0.1);
    if (this.hurtFlash > -HURT_GAP) this.hurtFlash -= dt;
    if (this.hurtFlash > 0) this.body.setTint(HURT_TINT);
    else this.body.clearTint();
    // 4단계부터 눈빛 · 크런치는 몸 둘레가 붉게
    if (stg >= 4) {
      const pulse = 0.35 + Math.sin(this.t * 6) * 0.15;
      this.aura
        .setVisible(true)
        .setPosition(this.bx, stg >= 5 ? this.by - 20 * BK : this.by + 4 - 34 * BK)
        .setScale(stg >= 5 ? 2.6 : 0.9)
        .setTint(stg >= 5 ? 0xff5020 : 0xff3c28)
        .setAlpha(stg >= 5 ? pulse * 0.7 : pulse);
      if (stg >= 5 && !this.lowFx && Math.random() < 0.15) this.host.skfx.emit({ x: this.bx + (Math.random() - 0.5) * 20, y: this.by - 46 * BK, tex: SKT.cloud, tint: 0xf0f0fa, add: false, vy: -30, life: 800, s0: 0.3, s1: 0.6, alpha: 0.5 });
    } else this.aura.setVisible(false);
    // 말풍선 · 이름 상자 (회장님에 붙어 다닌다)
    // 11/21 붙잡은 시간이 지나면 줄 선 대사로 바꾼다
    if (this.bubbleNext && (!this.bubble || this.bubble.t >= this.bubble.hold)) {
      const n = this.bubbleNext;
      this.bubbleSay(n.text, n.dur);
    }
    if (this.bubble) {
      const b = this.bubble;
      b.t += dt || 1 / 60;
      // 튀어나오는 팝: 0.6 → 1.1 (0.1초) → 1.0 (0.22초)
      const k = b.t < 0.1 ? 0.6 + (b.t / 0.1) * 0.5 : b.t < 0.22 ? 1.1 - ((b.t - 0.1) / 0.12) * 0.1 : 1;
      b.img.setScale(k * this.ts() * (this.host.skfx.mobile ? 0.88 : 1)).setAlpha(b.t > b.dur - 0.25 ? Math.max(0, (b.dur - b.t) / 0.25) : 1);
      // 11/22 사용자 「말풍선이 왼쪽 위 단계·시간 글자를 덮는다」: 풍선 윗변은 화면 위 HUD 글자 밑으로 (모자라면 회장님 머리 쪽으로 내려온다)
      const cam = this.sc.cameras.main;
      const minTop = cam.worldView.y + ((this.host.topPad?.() ?? 0) + 4) / cam.zoom;
      // 회장님이 화면 위로 나가 있으면 (발이 HUD 줄 위) 붙잡지 않는다 — 풍선만 떨어져 떠 있지 않게
      const head = this.by - BOSS_H * BK - 2;
      // 옆으로도 화면 밖으로 잘리지 않게 (회장님이 화면 가장자리에 있을 때)
      const v = cam.worldView;
      const hw = b.img.displayWidth / 2 + 2 / cam.zoom;
      const bx = hw * 2 < v.width ? Math.min(Math.max(this.bx, v.x + hw), v.x + v.width - hw) : this.bx;
      b.img.setPosition(Math.round(bx), Math.round(this.by > minTop ? Math.max(head, minTop + b.img.displayHeight) : head));
      if (b.t > b.dur) {
        b.img.destroy();
        this.bubble = null;
      }
    }
    if (this.nameBox) {
      const n = this.nameBox;
      n.t += dt;
      n.img.setPosition(Math.round(this.bx), Math.round(this.by + 10)).setScale(this.ts() * (this.host.skfx.mobile ? 0.88 : 1)).setAlpha(Math.min(1, n.t * 8) * (n.t > 0.9 ? Math.max(0, (1.1 - n.t) / 0.2) : 1));
      if (n.t > 1.1) {
        n.img.destroy();
        this.nameBox = null;
      }
    }
  }

  /** 글자 그림 배율: 도트 글꼴을 화면 1:1로 (카메라 줌을 거꾸로) */
  private ts(): number {
    return 1 / Math.max(0.5, this.sc.cameras.main.zoom);
  }

  private evPose(): string {
    const e = this.ev!;
    const t = e.t;
    if (e.kind === "flip") return t < e.warn - 0.2 ? (Math.floor(t * 4) % 2 ? "crouch" : "flip") : t < e.warn + 0.6 ? "flip" : "laugh";
    if (e.kind === "drop") return t < 0.35 ? "slam" : t < e.warn ? (Math.floor(t * 6) % 2 ? "castRed" : "flip") : "laugh";
    return t < 3.5 ? "point" : "laugh";
  }

  /** 11/21 회장님 몸 + 말풍선 화면 상자 (CSS px, 뷰포트 기준) — 위 HUD 판 반투명용 */
  private bossBox(): [number, number, number, number] {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const cv = this.sc.game.canvas.getBoundingClientRect();
    const k = cv.width / this.sc.scale.width;
    let l = this.bx - (BOSS_W * BK) / 2;
    let r = this.bx + (BOSS_W * BK) / 2;
    let t = this.by - BOSS_H * BK;
    const b = this.by;
    if (this.bubble) {
      const g = this.bubble.img.getBounds();
      l = Math.min(l, g.left);
      r = Math.max(r, g.right);
      t = Math.min(t, g.top);
    }
    const X = (x: number) => Math.round((x - v.x) * z * k + cv.left);
    const Y = (y: number) => Math.round((y - v.y) * z * k + cv.top);
    return [X(l), Y(t), X(r), Y(b)];
  }

  /** 11/22 내 캐릭터 화면 상자 [l,t,r,b] (CSS px, 이름표까지) — PC 가운데 반려 카드가 이 위면 반투명 */
  private meBox(): [number, number, number, number] {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const cv = this.sc.game.canvas.getBoundingClientRect();
    const k = cv.width / this.sc.scale.width;
    const p = this.host.player();
    const X = (x: number) => Math.round((x - v.x) * z * k + cv.left);
    const Y = (y: number) => Math.round((y - v.y) * z * k + cv.top);
    return [X(p.x - 14), Y(p.y - 46), X(p.x + 14), Y(p.y + 4)];
  }

  /** 피해 계기판(화면 위 가운데) 밑에 회장님이 있나 */
  private bossUnderMeter(): boolean {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const sx = (this.bx - v.x) * z;
    const sy = (this.by - BOSS_H * BK - v.y) * z;
    // 11/21 계기판에 시간 칸·반려 아이콘 줄이 붙어 키가 커졌다 (약 240px)
    return Math.abs(sx - cam.width / 2) < 220 && sy < 250;
  }

  // ───────── 그리기 ─────────

  private draw(): void {
    const g = this.gFloor;
    const a = this.gAir;
    const top = this.gTop;
    g.clear();
    a.clear();
    top.clear();
    const now = this.t;
    for (const z of this.tele) this.drawTele(z);
    // 사무실 이전: 걸을 수 있는 바닥 전체가 빨갛고, 점선 「새 사무실」만 남는다
    if (this.zone && !this.zone.done) {
      const z = this.zone;
      const k = Math.min(1, z.t / z.warn);
      const ox = lerp(ARENA.x0, z.cx - z.w / 2, k);
      const oy = lerp(ARENA.y0, z.cy - z.h / 2, k);
      const ow = lerp(ARENA.x1 - ARENA.x0, z.w, k);
      const oh = lerp(ARENA.y1 - ARENA.y0, z.h, k);
      g.fillStyle(RED, 0.22 + k * 0.2);
      g.fillRect(ARENA.x0, ARENA.y0, ARENA.x1 - ARENA.x0, oy - ARENA.y0);
      g.fillRect(ARENA.x0, oy + oh, ARENA.x1 - ARENA.x0, ARENA.y1 - (oy + oh));
      g.fillRect(ARENA.x0, oy, ox - ARENA.x0, oh);
      g.fillRect(ox + ow, oy, ARENA.x1 - (ox + ow), oh);
      g.lineStyle(2, GREEN, 0.7 + Math.sin(now * 12) * 0.3);
      g.strokeRect(ox, oy, ow, oh);
      g.fillStyle(GREEN, 0.18);
      g.fillRect(z.cx - z.w / 2, z.cy - z.h / 2, z.w, z.h);
      this.dashRect(g, z.cx - z.w / 2, z.cy - z.h / 2, z.w, z.h, 0xffffff, 0.75);
    }
    // 메일 파도 (11/22 한 줄씩): 예고 = 나올 벽 쪽 빨간 띠가 깜빡이고 편지가 벽에 줄지어 들썩 + 초록 길이 바닥 끝까지 깔린다 →
    // 출발하면 편지 줄이 바닥을 쓸고 맞은편 벽 밖에서 옅어진다. 초록 길 자리는 그 파도가 끝날 때까지 그대로
    const envelope = (x: number, y: number, al: number) => {
      top.fillStyle(0x141218, al).fillRect(x - 1, y - 7, 12, 10);
      top.fillStyle(0xf6f2e4, al).fillRect(x, y - 6, 10, 8);
      top.lineStyle(1, 0xc9402f, al).lineBetween(x, y - 6, x + 5, y - 2).lineBetween(x + 5, y - 2, x + 10, y - 6);
    };
    const vw = this.sc.cameras.main.worldView;
    const vz = this.sc.cameras.main.zoom;
    for (const m of this.mails) {
      const w = m.seq.cur;
      if (!w) continue;
      const gw = MAIL.gw;
      const al = 0.5 + Math.sin(now * 20) * 0.3;
      const down = w.vy > 0;
      const wk = Math.min(1, w.t / w.warn);
      const live = w.t >= w.warn;
      const inGapX = (x: number) => w.gaps.some((gx) => x + 10 > gx && x < gx + gw);
      // 초록 길: 바닥 끝까지 옅게 + 파도가 아직 안 온 쪽은 진하게
      for (const gx of w.gaps) {
        g.fillStyle(GREEN, 0.08).fillRect(gx, ARENA.y0, gw, AH);
        const ya = live && down ? Math.max(ARENA.y0, w.y) : ARENA.y0;
        const yb = live && !down ? Math.min(ARENA.y1, w.y) : ARENA.y1;
        if (yb <= ya) continue;
        g.fillStyle(GREEN, live ? 0.3 * al + 0.12 : 0.14 + 0.16 * wk + 0.1 * al).fillRect(gx, ya, gw, yb - ya);
        g.fillStyle(0xd9fff0, 0.85).fillRect(gx, ya, 1, yb - ya).fillRect(gx + gw - 1, ya, 1, yb - ya);
      }
      if (!live) {
        // 벽 예고: 빨간 띠(나올 쪽 바닥 끝) 깜빡임 + 벽 줄 + 편지 줄이 들썩.
        // 카메라가 나를 따라가 벽이 화면 밖이면 띠·편지 줄을 화면 그쪽 끝(HUD 밑)으로 당겨 그린다 (화살표도 — drawArrows)
        const on = Math.floor(w.t * 8) % 2 === 0;
        const ry = down ? Math.max(w.y0, vw.y + 92 / vz) : Math.min(w.y0, vw.y + vw.height - 122 / vz);
        const by = down ? Math.max(ARENA.y0, ry - 4) : Math.min(ARENA.y1, ry + 4) - 22;
        g.fillStyle(RED, (on ? 0.4 : 0.18) + 0.15 * wk).fillRect(ARENA.x0, by, AW, 22);
        top.fillStyle(RED, Math.min(1, al + 0.25)).fillRect(ARENA.x0, ry - 1, AW, 3);
        for (let x = ARENA.x0 + 4; x < ARENA.x1 - 10; x += 22) {
          if (inGapX(x)) continue;
          envelope(x, ry + (down ? 4 : -2) - Math.abs(Math.sin(now * 14 + x * 0.2)) * 3 * wk, 0.45 + 0.55 * wk);
        }
        continue;
      }
      // 맞은편 벽 밖으로 나가며 옅어진다
      const past = down ? w.y - ARENA.y1 : ARENA.y0 - w.y;
      const fa = past > 0 ? Math.max(0, 1 - past / (MAIL.edge + MAIL.out)) : 1;
      if (fa <= 0) continue;
      for (let x = ARENA.x0; x < ARENA.x1; x += 12) {
        if (inGapX(x)) continue;
        if (this.shadowed(x + 5, w.y, w.vy)) continue;
        envelope(x, w.y + Math.sin(now * 10 + x * 0.3) * 2, fa);
      }
      top.fillStyle(GREEN, 0.25 * fa);
      for (const gx of w.gaps) top.fillRect(gx, w.y - 10, gw, 18);
    }
    // OKR 레이저 (구조물에 끊긴다)
    for (const b of this.beams)
      for (let i = 0; i < b.n; i++) {
        const an = b.a + (i / b.n) * Math.PI * 2;
        const L = b.L[i] ?? BEAM_LEN;
        const ex = b.x + Math.cos(an) * L;
        const ey = b.y + Math.sin(an) * L;
        if (b.t < b.warn) {
          a.lineStyle(2, RED, 0.5 + Math.sin(now * 18) * 0.3).lineBetween(b.x, b.y, ex, ey);
          continue;
        }
        // 세 겹 (예전 네 겹 — 굵은 가산 선이 많을수록 느리다)
        a.lineStyle(20, 0xff3c5a, 0.3).lineBetween(b.x, b.y, ex, ey);
        a.lineStyle(8, 0xff8a9a, 0.9).lineBetween(b.x, b.y, ex, ey);
        a.lineStyle(3, 0xffffff, 1).lineBetween(b.x, b.y, ex, ey);
        if (L < BEAM_LEN - 1) {
          a.fillStyle(0xfff0c8, 0.9).fillCircle(ex, ey, 4 + Math.random() * 2);
          if (!this.lowFx && Math.random() < 0.12) this.debris(ex, ey, 1, [0xffd25a, 0xffffff], 50);
        }
      }
    // 레이저 · 번개
    for (const L of this.lasers) {
      const k = 1 - L.t / L.life;
      if (L.kind === "cross") {
        for (const [w, col, al] of [
          [L.w * 1.6, 0xff7878, 0.5],
          [L.w, 0xffc8be, 0.8],
          [L.w * 0.35, 0xffffff, 1],
        ] as const) {
          a.fillStyle(col, al * k);
          a.fillRect(L.x - w / 2, L.y - L.len, w, L.len * 2);
          a.fillRect(L.x - L.len, L.y - w / 2, L.len * 2, w);
        }
      } else if (L.pts) {
        a.lineStyle(3, 0xc8e0ff, k);
        for (let i = 2; i < L.pts.length; i += 2) a.lineBetween(L.pts[i - 2], L.pts[i - 1], L.pts[i], L.pts[i + 1]);
        a.lineStyle(1, 0xffffff, k);
        for (let i = 2; i < L.pts.length; i += 2) a.lineBetween(L.pts[i - 2], L.pts[i - 1], L.pts[i], L.pts[i + 1]);
      }
    }
    // 즉사 바닥
    if (this.ev) this.drawEv(g, top);
    // 구조물: 내가 뒤에 있으면 반투명 · 깎인 칸
    const p = this.host.player();
    for (const c of this.covers) {
      const img = this.coverImg.get(c);
      if (!img) continue;
      const behind = p.y < c.y && p.y > c.y - img.height - 6 && Math.abs(p.x - c.x) < img.width / 2 + 4;
      const shk = this.t - c.hitT < 0.2 ? (Math.random() - 0.5) * 2 : 0;
      img.setAlpha(behind ? 0.5 : 1).setX(c.x + shk);
      // 맞은 순간 붉게 번쩍 (예전 흰색 채우기는 4배 화면에서 글자 없는 흰 네모처럼 보였다)
      if (this.t - c.hitT < 0.08) img.setTint(0xff9a8a);
      else img.clearTint();
      if (c.hp < c.max)
        for (let i = 0; i < c.max; i++) {
          const x = c.x - c.max * 3 + i * 6;
          const y = c.y - img.height - 4;
          top.fillStyle(0x141218, 1).fillRect(x, y, 5, 3);
          top.fillStyle(i < c.hp ? 0xffd25a : 0x4a4a58, 1).fillRect(x + 1, y + 1, 3, 1);
        }
    }
    // 맞는 자리: 발밑 작은 점
    const hurt = this.host.dead();
    this.hitDotBg.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y + 0.5);
    this.hitDot.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y + 0.6).setTint(hurt ? 0xff5a4a : 0xfff6c8);
    // 긴급 점검: 불이 꺼지고 내 둘레만 보인다
    const dk = this.darkUntil && this.t < this.darkUntil ? Math.min(1, (this.darkUntil - this.t) * 2, (this.t - this.darkUntil + 4.6) * 3) : 0;
    const on = dk > 0.01;
    this.darkHole.setVisible(on);
    for (const r of this.dark) r.setVisible(on);
    if (on) {
      const hw = this.darkHole.width / 2;
      const hh = this.darkHole.height / 2;
      const cx = p.x;
      const cy = p.y - 6;
      this.darkHole.setPosition(cx, cy).setAlpha(dk);
      const [r0, r1, r2, r3] = this.dark;
      r0.setPosition(-200, -200).setSize(WW + 400, cy - hh + 200).setAlpha(dk * 0.86);
      r1.setPosition(-200, cy + hh).setSize(WW + 400, WH + 200 - (cy + hh)).setAlpha(dk * 0.86);
      r2.setPosition(-200, cy - hh).setSize(cx - hw + 200, hh * 2).setAlpha(dk * 0.86);
      r3.setPosition(cx + hw, cy - hh).setSize(WW + 200 - (cx + hw), hh * 2).setAlpha(dk * 0.86);
    }
    // 크런치: 화면 가장자리가 붉게 맥박친다
    // 11/22 프로젝트 드랍 예고 중에도 (사이렌 박자로 더 세게)
    const dropOn = this.ev?.kind === "drop" && this.ev.t < this.ev.warn + DROP.sweep;
    if (this.ph >= 5 || dropOn) {
      const cam = this.sc.cameras.main;
      const z = cam.zoom;
      this.vignette
        .setVisible(true)
        .setPosition(cam.width / 2, cam.height / 2)
        .setDisplaySize(cam.width / z, cam.height / z)
        .setAlpha(dropOn ? 0.6 + Math.sin(now * 12) * 0.25 : 0.5 + Math.sin(now * 5) * 0.3);
    } else this.vignette.setVisible(false);
    this.drawCoffee(g, top);
    this.drawTruckSafe(g, top);
    this.drawArrows();
  }

  /** 트럭 시위 지금 초록 길 (없으면 null) · 이 기술 예고가 다 끝나고 트럭도 다 빠지면 지운다 */
  private truckG(): TruckGreen | null {
    const s = this.truckSafe;
    if (!s) return null;
    const pending = s.lanes.filter((l) => !l.z.done && this.tele.includes(l.z)).map((l) => l.lane);
    if (!pending.length && !this.trucks.length) {
      this.truckSafe = null;
      return null;
    }
    return truckGreen(s.free, pending, this.trucks);
  }

  /**
   * 11/22 사용자 「트럭 패턴일 때 안전 구역 초록색으로」: 빈 줄을 바닥 끝까지 초록 띠로 (가장자리가 숨 쉬듯 번진다) + 「› 안전 ‹」.
   * 트럭이 아직 지나가는 줄이면 꽁무니 뒤만 · 테두리·구조물에 가린 자리는 위 층에 한 번 더 (구조물이 띠를 안 가린다)
   */
  private drawTruckSafe(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics): void {
    const tg = this.truckG();
    let used = 0;
    if (tg) {
      const now = this.t;
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      const w = tg.x1 - tg.x0;
      const h = tg.y1 - tg.y0;
      g.fillStyle(GREEN, 0.3 + 0.08 * pulse).fillRect(tg.x0, tg.y0, w, h);
      // 가장자리 번짐 (위·아래 4겹)
      for (let k = 0; k < 4; k++) {
        const al = (0.34 - k * 0.08) * (0.55 + 0.45 * pulse);
        g.fillStyle(GREEN, al).fillRect(tg.x0, tg.y0 + k * 2, w, 2).fillRect(tg.x0, tg.y1 - (k + 1) * 2, w, 2);
      }
      // 구조물이 띠를 가린 자리
      for (const [c, img] of this.coverImg) {
        if (c.dead || !img.visible) continue;
        const b = img.getBounds();
        const ix = Math.max(tg.x0, b.x);
        const iy = Math.max(tg.y0, b.y);
        const iw = Math.min(tg.x1, b.right) - ix;
        const ih = Math.min(tg.y1, b.bottom) - iy;
        if (iw > 0 && ih > 0) top.fillStyle(GREEN, 0.2 + 0.1 * pulse).fillRect(ix, iy, iw, ih);
      }
      // 테두리 빛줄 (위 층)
      top.fillStyle(GREEN, 0.3 + 0.3 * pulse).fillRect(tg.x0, tg.y0 - 1, w, 3).fillRect(tg.x0, tg.y1 - 2, w, 3);
      top.fillStyle(0xeafff4, 0.6 + 0.3 * pulse).fillRect(tg.x0, tg.y0, w, 1).fillRect(tg.x0, tg.y1 - 1, w, 1);
      if (tg.x0 > ARENA.x0) top.fillStyle(0xeafff4, 0.7).fillRect(tg.x0, tg.y0, 1, h);
      if (tg.x1 < ARENA.x1) top.fillStyle(0xeafff4, 0.7).fillRect(tg.x1 - 1, tg.y0, 1, h);
      // 「› 안전 ‹」 (자리는 판에 고정 — 띠가 자라면 하나씩 켜진다)
      const cy = (tg.y0 + tg.y1) / 2;
      // 갈매기표는 화면에서 늘 같은 크기 (ts = 1/줌)
      const ts = this.ts();
      const bob = Math.sin(now * 8) * 3 * ts;
      const ch = 7 * ts;
      const chev = (x: number, d: number) => {
        top.lineStyle(3 * ts, 0xeafff4, 0.9);
        top.lineBetween(x - ch * 0.7 * d, cy - ch, x + ch * 0.3 * d, cy).lineBetween(x + ch * 0.3 * d, cy, x - ch * 0.7 * d, cy + ch);
      };
      for (const dx of [-177, -59, 59, 177]) {
        const x = ACX + dx;
        if (x < tg.x0 + 34 || x > tg.x1 - 34) continue;
        chev(x - 34 * ts + bob, 1);
        chev(x + 34 * ts - bob, -1);
        const lbImg = this.truckSafeLb[used] ?? this.truckSafeLb[this.truckSafeLb.push(this.sc.add.image(0, 0, lb(this.sc, "truckSafe")).setDepth(DEPTH_FX + 31)) - 1]!;
        lbImg.setVisible(true).setPosition(x, cy).setScale(ts).setAlpha(0.8 + 0.2 * pulse);
        used++;
      }
    }
    for (let i = used; i < this.truckSafeLb.length; i++) this.truckSafeLb[i]!.setVisible(false);
  }

  private dashRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, col: number, al: number): void {
    g.fillStyle(col, al);
    for (let i = 0; i < w; i += 7) {
      g.fillRect(x + i, y, Math.min(4, w - i), 1);
      g.fillRect(x + i, y + h - 1, Math.min(4, w - i), 1);
    }
    for (let i = 0; i < h; i += 7) {
      g.fillRect(x, y + i, 1, Math.min(4, h - i));
      g.fillRect(x + w - 1, y + i, 1, Math.min(4, h - i));
    }
  }

  private teleColor(z: Tele): number {
    return z.blue ? BLUE : z.live === false ? GREEN : RED;
  }

  private teleShape(g: Phaser.GameObjects.Graphics, z: Tele, k: number, fill: boolean): void {
    switch (z.shape) {
      case "circle":
        if (fill) g.fillEllipse(z.x, z.y, z.r * 2 * k, z.r * 1.2 * k);
        else g.strokeEllipse(z.x, z.y, z.r * 2, z.r * 1.2);
        break;
      case "rect":
        if (fill) g.fillRect(z.x, z.y + z.h * (1 - k), z.w, z.h * k);
        else g.strokeRect(z.x, z.y, z.w, z.h);
        break;
      case "line": {
        const an = Math.atan2(z.y1 - z.y, z.x1 - z.x);
        const L = Math.hypot(z.x1 - z.x, z.y1 - z.y) * k;
        const nx = -Math.sin(an) * (z.w / 2);
        const ny = Math.cos(an) * (z.w / 2);
        const ux = Math.cos(an) * L;
        const uy = Math.sin(an) * L;
        const pts = [
          { x: z.x + nx, y: z.y + ny },
          { x: z.x + ux + nx, y: z.y + uy + ny },
          { x: z.x + ux - nx, y: z.y + uy - ny },
          { x: z.x - nx, y: z.y - ny },
        ];
        if (fill) g.fillPoints(pts, true);
        else g.strokePoints(pts, true);
        break;
      }
      case "cross":
        if (fill) {
          g.fillRect(z.x - z.w / 2, z.y - z.len * k, z.w, z.len * 2 * k);
          g.fillRect(z.x - z.len * k, z.y - z.w / 2, z.len * 2 * k, z.w);
        } else {
          g.strokeRect(z.x - z.w / 2, z.y - z.len, z.w, z.len * 2);
          g.strokeRect(z.x - z.len, z.y - z.w / 2, z.len * 2, z.w);
        }
        break;
    }
  }

  private drawTele(z: Tele): void {
    const g = this.gFloor;
    const now = this.t;
    if (z.done) {
      if (z.flash > 0 && z.live !== false) {
        g.fillStyle(0xfff0e0, 0.7 * (z.flash / 0.16));
        this.teleShape(g, z, 1, true);
      }
      return;
    }
    if (z.live === false && !z.hatch) return;
    const k = Math.min(1, z.t / z.warn);
    const col = this.teleColor(z);
    g.fillStyle(col, 0.12 + k * 0.18);
    this.teleShape(g, z, 1, true);
    g.lineStyle(1, col, 0.55 + 0.4 * Math.abs(Math.sin(now * (6 + k * 18))));
    this.teleShape(g, z, 1, false);
    g.fillStyle(col, 0.3);
    this.teleShape(g, z, Math.max(0.02, k), true);
    // 기획 변경: 빨간 칸엔 빗금이 흐른다
    if (z.hatch && z.live) {
      g.lineStyle(3, col, 0.5);
      const off = (now * 30) % 12;
      for (let s = -z.h; s < z.w; s += 12) {
        const x0 = z.x + s + off;
        const ax = Math.max(z.x, x0);
        const ay = z.y + z.h - (ax - x0);
        const bx = Math.min(z.x + z.w, x0 + z.h);
        const by = z.y + z.h - (bx - x0);
        if (bx > ax) g.lineBetween(ax, ay, bx, by);
      }
    }
    if (z.xmark) {
      g.lineStyle(3, 0xff503c, 0.95);
      g.lineBetween(z.x - 8, z.y - 5, z.x + 8, z.y + 5).lineBetween(z.x + 8, z.y - 5, z.x - 8, z.y + 5);
    }
    if (z.stamp) {
      const h = (1 - k) * 90;
      this.gTop.fillStyle(0xb01c22, 0.9).fillRect(z.x + 6, z.y - h - 4, 14, 8);
      this.gTop.fillStyle(0x6a3a1e, 0.9).fillRect(z.x + 11, z.y - h - 12, 4, 8);
    }
    if (z.drop !== undefined) {
      const h = (1 - k) * 120;
      this.gTop.fillStyle(z.drop, 0.85).fillRect(z.x + 4, z.y + 4 - h, z.w - 8, z.h - 8);
    }
  }

  private drawEv(g: Phaser.GameObjects.Graphics, top: Phaser.GameObjects.Graphics): void {
    const e = this.ev!;
    const t = e.t;
    const now = this.t;
    const p = this.host.player();
    if (e.kind === "drop" && t < e.warn + DROP.sweep) {
      // 붉은 경보 (사이렌 박자) · 자리 둘만 초록 + 퍼지는 고리 + 남은 시간 고리
      const pulse = 0.5 + 0.5 * Math.sin(now * 12);
      g.fillStyle(0x1e0206, (0.42 + 0.14 * pulse) * Math.min(1, t / 0.2));
      g.fillRect(0, FL, WW, WH - FL);
      g.fillStyle(0xc0101e, (0.1 + 0.14 * pulse) * Math.min(1, t / 0.2));
      g.fillRect(0, FL, WW, WH - FL);
      const frac = Math.max(0, e.warn - t) / e.warn;
      for (const s of e.safes) {
        g.fillStyle(GREEN, 0.5 + pulse * 0.35).fillRect(s.x - 18, s.y - 12, 36, 24);
        g.lineStyle(1, 0xd9fff0, 1).strokeRect(s.x - 18.5, s.y - 12.5, 37, 25);
        for (let i = 0; i < 2; i++) {
          const q = (now * 1.8 + i / 2) % 1;
          top.lineStyle(2, GREEN, (1 - q) * 0.9).strokeEllipse(s.x, s.y, 40 + q * 70, 28 + q * 46);
        }
        if (t < e.warn) {
          top.lineStyle(4, 0x06301c, 0.85).strokeCircle(s.x, s.y - 34, 13);
          top.lineStyle(2, frac < 0.34 ? 0xffd25a : GREEN, 1);
          top.beginPath();
          top.arc(s.x, s.y - 34, 13, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
          top.strokePath();
        }
      }
    }
    if (e.kind === "flip" && t < e.warn + 0.1) {
      const r = this.flipRect(e);
      g.fillStyle(RED, 0.3 + Math.min(1, t / e.warn) * 0.3).fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(3, 0xff503c, 0.5);
      const off = (now * 30) % 12;
      for (let s = -r.h; s < r.w; s += 12) {
        const xa = r.x + s + off;
        const ax = Math.max(r.x, xa);
        const bx = Math.min(r.x + r.w, xa + r.h);
        if (bx > ax) g.lineBetween(ax, r.y + r.h - (ax - xa), bx, r.y + r.h - (bx - xa));
      }
      g.fillStyle(0xff5a5a, 1);
      if (e.axis === "x") g.fillRect(ACX - 1, FL, 2, WH - FL);
      else g.fillRect(0, ACY - 1, WW, 2);
    }
    if (e.kind === "flip" && t >= e.warn && t < e.warn + 0.8) {
      const r = this.flipRect(e);
      g.fillStyle(0xffd0b0, 1 - (t - e.warn) / 0.8).fillRect(r.x, r.y, r.w, r.h);
    }
    if (e.kind === "quit" && t > 1.0 && t < 3.5) {
      // 금빛 고리 = 낙법 타이밍 (닿는 순간 구르기)
      const r = 70 - ((t - 1) / 2.5) * 60;
      top.lineStyle(2, GOLD, 0.75 + Math.sin(now * 25) * 0.25).strokeEllipse(p.x, p.y - 6, Math.max(7, r) * 2, Math.max(5, r * 0.7) * 2);
      top.lineStyle(1, 0xff5a3c, 0.7).strokeEllipse(p.x, p.y - 6, 18, 12);
      const sx = this.bx + this.face * 18;
      const sy = this.by - 26 * BK;
      const d = Math.hypot(p.x - sx, p.y - 6 - sy);
      for (let s = 0; s < d; s += 6) top.fillStyle(0xff5a3c, 0.7).fillRect(sx + ((p.x - sx) * s) / d, sy + ((p.y - 6 - sy) * s) / d, 3, 1);
    }
  }

  /** 폰: 화면 밖 예고는 가장자리 빨간 화살표 */
  private drawArrows(): void {
    const cam = this.sc.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const live: { x: number; y: number }[] = [];
    const safe: { x: number; y: number }[] = [];
    if (v.width < WW - 4 || v.height < WH - 4) {
      const out = (x: number, y: number) => x < v.x || x > v.x + v.width || y < v.y || y > v.y + v.height;
      // 초록 화살표: 화면 밖 살 자리 (프로젝트 드랍 「내 자리」 · 사무실 이전 「새 사무실」)
      if (this.ev?.kind === "drop") for (const s of this.ev.safes) if (out(s.x, s.y)) safe.push(s);
      if (this.zone && !this.zone.done && out(this.zone.cx, this.zone.cy)) safe.push({ x: this.zone.cx, y: this.zone.cy });
      // 탕비실 커피
      if (this.coffee && out(this.coffee.x, this.coffee.y)) safe.push({ x: this.coffee.x, y: this.coffee.y });
      // 메일 파도의 초록 틈 (폰은 틈이 화면 밖일 때가 많다)
      const pp = this.host.player();
      for (const m of this.mails) for (const gx of m.seq.cur?.gaps ?? []) if (out(gx + MAIL.gw / 2, pp.y)) safe.push({ x: gx + MAIL.gw / 2, y: pp.y });
      // 트럭 시위 초록 길 (내 x에서 가장 가까운 초록 자리) — 폰은 위·아래 HUD에 가려도 화면 밖으로 친다
      const tg = this.truckG();
      if (tg) {
        const q = { x: Phaser.Math.Clamp(pp.x, tg.x0 + 12, Math.max(tg.x0 + 12, tg.x1 - 12)), y: (tg.y0 + tg.y1) / 2 };
        // 폰 아래 조작판(≈250px)에 가리면 화살표를 조작판 바로 위에 (아래를 가리킨다)
        const low = this.host.skfx.mobile ? 250 : 122;
        if (q.y > v.y + (cam.height - low) / z) safe.push({ x: q.x, y: Math.min(q.y, v.y + (cam.height - low) / z) });
        else if (out(q.x, q.y) || q.y < v.y + 92 / z) safe.push(q);
      }
      for (const s of safe) live.push(s);
      // 메일 파도 줄이 화면 밖이면 빨간 화살표 (예고 때부터)
      for (const m of this.mails) {
        const w = m.seq.cur;
        if (w && out(pp.x, w.y)) live.push({ x: pp.x, y: w.y });
      }
      for (const t of this.tele) {
        if (t.done || t.live === false) continue;
        const cx = t.shape === "rect" ? t.x + t.w / 2 : t.shape === "line" ? (t.x + t.x1) / 2 : t.x;
        const cy = t.shape === "rect" ? t.y + t.h / 2 : t.shape === "line" ? (t.y + t.y1) / 2 : t.y;
        if (cx >= v.x && cx <= v.x + v.width && cy >= v.y && cy <= v.y + v.height) continue;
        live.push({ x: cx, y: cy });
        if (live.length >= 10) break;
      }
    }
    while (this.arrows.length < live.length) this.arrows.push(this.sc.add.image(0, 0, CTX.arrow).setScrollFactor(0).setDepth(2e6 - 10));
    this.arrows.forEach((a, i) => {
      const q = live[i];
      if (!q) {
        a.setVisible(false);
        return;
      }
      // 화면 px → 고정 층 좌표 (카메라 줌을 거꾸로)
      const sx = Phaser.Math.Clamp((q.x - v.x) * z, 28, cam.width - 28);
      const sy = Phaser.Math.Clamp((q.y - v.y) * z, 90, cam.height - 120);
      const ang = Math.atan2(q.y - (v.y + v.height / 2), q.x - (v.x + v.width / 2));
      if (i < safe.length) a.setTintFill(GREEN);
      else a.clearTint();
      a.setVisible(true)
        .setPosition(cam.width / 2 + (sx - cam.width / 2) / z, cam.height / 2 + (sy - cam.height / 2) / z)
        .setRotation(ang)
        .setScale(1.5 / z + 0.5)
        .setAlpha(0.6 + Math.sin(this.t * 14) * 0.3);
    });
  }

  // ───────── 굽는 그림 (판마다 한 번) ─────────

  private holeTex(): string {
    const key = "ch-dark-hole";
    if (this.sc.textures.exists(key)) return key;
    const cv = document.createElement("canvas");
    cv.width = 200;
    cv.height = 140;
    const c = cv.getContext("2d")!;
    c.fillStyle = "rgba(4,6,12,0.86)";
    c.fillRect(0, 0, 200, 140);
    c.globalCompositeOperation = "destination-out";
    c.save();
    c.translate(100, 70);
    c.scale(1, 0.7);
    const gr = c.createRadialGradient(0, 0, 50, 0, 0, 80);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr;
    c.beginPath();
    c.arc(0, 0, 80, 0, Math.PI * 2);
    c.fill();
    c.restore();
    this.sc.textures.addCanvas(key, cv);
    return key;
  }

  private vignetteTex(): string {
    const key = "ch-vignette";
    if (this.sc.textures.exists(key)) return key;
    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 180;
    const c = cv.getContext("2d")!;
    const gr = c.createRadialGradient(160, 90, 60, 160, 90, 200);
    gr.addColorStop(0, "rgba(255,40,30,0)");
    gr.addColorStop(1, "rgba(255,40,30,0.45)");
    c.fillStyle = gr;
    c.fillRect(0, 0, 320, 180);
    const t = this.sc.textures.addCanvas(key, cv);
    t?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return key;
  }
}
