import * as Phaser from "phaser";
import { MONSTERS, potionById, POTION_COOLDOWN_MS, SKILL_FX, skillById, skillMods, zoneFor, type BranchId, type MonsterId, type SkillId, type SkillMods, type ZoneDef } from "@/lib/rpg/catalog";
import { attackArea, damage, hitChance, inAttackArea, monsterStats, type AttackArea, type Derived, type MonsterStats } from "@/lib/rpg/formulas";
import { bossPhaseIndex, bossPhaseList, monsterPatterns, type PatternId } from "@/lib/rpg/patterns";
import { attackCooldownMs, CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf, type WeaponStyle, type WeaponStyleId } from "@/lib/rpg/weapons";
import { gearById } from "@/lib/rpg/catalog";
import { ELITE, huntPlan, STREAM_GAP_MS, WAVE_FORMATION_LABEL, WAVE_MAX_GAP_SEC, type HuntWave } from "@/lib/rpg/plan";
import { POTION_CURES, rollStatus, STATUS_IDS, StatusBook, STATUSES, type StatusId } from "@/lib/rpg/status";
import type { HuntResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { DIR, STATE, type DirId, type HuntAct } from "@tomb/protocol";
import { FONT_KEY, FONT_PX } from "../text/GlyphAtlas";
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
import { DamageNumbers, type DmgGroup } from "./damageNumbers";
import { cancelCast, seedPatternTimers, tryStartPattern, updateCast, type Cast, type PatternHost } from "./monsterPatterns";
import type { RpgSound } from "./sfx";
import type { SoundEv, SoundOpt } from "./skillSound";
import { TelegraphLayer } from "./telegraph";
import { avFrame, ensureRpgTextures, makePlayer, RTEX } from "./sprites";
// 40번 테마 사냥터: 지도·기믹·길찾기 (arena/), 몬스터 동작별 프레임 (monsterArt)
import { Arena } from "./arena/Arena";
import { monsterFrame, monsterOrigin, playMonsterDeath } from "./monsterArt";
// 바닥 드롭 연출: 판이 끝나는 순간 서버와 같은 식으로 굴린 드롭을 몬스터 자리에 떨군다 (보상은 서버가)
import { huntDropsFor } from "@/lib/rpg/rewards";
import { LootLayer } from "./loot";

// 사냥터: 위에서 내려다보는 실시간 전투. 웨이브는 서버가 준 시드의 계획(huntPlan)대로 나온다.
//  - 웨이브 i는 앞 웨이브를 다 잡았고 i×8초가 지났을 때, 또는 앞 웨이브 뒤 35초가 지나면 나온다
//  - 끝: 시간 끝 / 모든 웨이브 클리어 / 쓰러짐(부활 쿠키가 있으면 한 번 일어난다)
//  - 공격: 바라보는 쪽 부채꼴(무기마다 다를 수 있음) 안의 몬스터를 모두 때린다.
//    누를 때마다 한 번(쿨다운 중이면 버퍼에 한 번), 누르고 있으면(키·마우스·손가락) 공격 속도대로 계속.

const W = 448;
const H = 288;
const WALL = 10;
const PLAYER_R = 5;
const HURT_IFRAME_MS = 450;
/** 같은 방 다른 사람 아바타 투명도 */
const GHOST_ALPHA = 0.42;
/** 11/13 자리 비움(탭을 숨겼거나 판을 멈춘 사람)은 더 연하게 */
const AWAY_ALPHA = 0.24;
const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;

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
  private arena!: Arena;
  private zone!: ZoneDef;
  private nextWave = 0;
  private lastWaveAt = 0;
  private waveAlive: number[] = [];
  private kills: Partial<Record<MonsterId, number>> = {};
  private killCount = 0;
  private potionsUsed: Record<string, number> = {};
  private potionReadyAt = 0;
  private skillReady: Partial<Record<SkillId, number>> = {};
  private buffs = new Map<string, { until: number; v: number }>();
  private died = false;
  private cookieUsed = false;
  private victoryAt = 0;
  private message: string | undefined;
  private messageUntil = 0;

  // 플레이어
  private px = W / 2;
  private py = H / 2;
  private hp = 1;
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
  private pShadow!: Phaser.GameObjects.Image;
  private helper: { sprite: Phaser.GameObjects.Sprite; until: number; nextAtk: number; group?: DmgGroup | null } | null = null;
  /** 스킬 트리 패시브를 더한 능력치 (판마다 create()에서) */
  private dv!: Derived;
  private mods: SkillMods = skillMods({});
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

  constructor() {
    super("rpg-hunt");
  }

  create(): void {
    this.setupCommon();
    const play = this.play;
    const zone = zoneFor(play.difficulty, play.zone);
    this.zone = zone;
    ensureRpgTextures(this);
    makePlayer(this, this.data0.color, this.data0.look, this.data0.body);
    this.plan = huntPlan(play.seed, play.difficulty, zone.id);
    this.mons = [];
    this.shots = [];
    this.nextWave = 0;
    this.lastWaveAt = 0;
    this.waveAlive = this.plan.map(() => 0);
    this.kills = {};
    this.killCount = 0;
    this.potionsUsed = {};
    this.potionReadyAt = 0;
    this.skillReady = {};
    this.buffs.clear();
    this.died = false;
    this.cookieUsed = false;
    this.victoryAt = 0;
    this.helper = null;
    this.turret = null;
    this.shield = 0;
    this.pendingSpawns = 0;
    this.ghosted = new WeakMap();
    // 스킬 트리 패시브 (공격력·치명타·방어·최대 HP …)는 판 시작 때 한 번 더해 둔다
    this.mods = skillMods(play.skills);
    this.dv = withPassives(play.derived, this.mods);
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
    this.obstacles = [];
    this.arena = new Arena(this, zone.id, play.seed, {
      hurtPlayer: (dmg) => this.hurtPlayer(dmg),
      healPlayer: (n) => {
        if (this.died || this.hp >= this.dv.maxHp) return;
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
    });
    this.px = this.arena.start.x;
    this.py = this.arena.start.y;

    this.pShadow = this.add.image(this.px, this.py, RTEX.shadow).setDepth(-500);
    const atlas = this.data0.atlas;
    // 착용 오라·전용 오라: 바닥 층은 바닥 효과 바로 아래, 빛 층은 몸 바로 앞 (전투 효과·몬스터 앞쪽·피해 숫자보다 아래)
    this.data.set("cfxDepth", { ground: DEPTH_GROUND - 5, lightOnBody: true } satisfies CfxDepth);
    if (atlas) {
      this.me = new AvatarView(this, atlas, this.px, this.py, this.data0.color, this.data0.name, true, this.data0.look, this.data0.body);
      this.player = this.me.sprite;
      const room = `hunt:${zone.slug}:${play.difficulty}`;
      this.peers = 0;
      this.presence = new RoomPresence(this, {
        atlas,
        room,
        me: this.me,
        getPose: () => ({ x: Math.round(this.px), y: Math.round(this.py), state: this.movingNow ? STATE.walk : STATE.idle, dir: this.dirRow as DirId }),
        onStatus: (st) => (this.peers = st.mode === "online" ? st.count : 0),
        // 11/13 같은 사냥터 사람의 공격·스킬 동작 (보여 주기만)
        onHunt: (r, h) => this.remoteHunt(r, h),
      });
    } else {
      this.me = null;
      this.player = this.add.sprite(this.px, this.py, RTEX.player, avFrame(0, 0)).setOrigin(0.5, 19 / 20);
    }
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
    });

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.applyZoom();
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.flash(`${zone.name} · ${zone.desc}${play.testDrops?.length ? " · 시험 드롭 예약됨" : ""}`, 2600);
  }

  // ── 카메라 ──

  private applyZoom(): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(Math.floor(Math.min(cam.width, cam.height) / 220), 2, 4);
    cam.setZoom(z);
    this.skfx?.resetZoom(z);
    const vw = cam.width / z;
    const vh = cam.height / z;
    cam.setBounds(vw > W ? (W - vw) / 2 : 0, vh > H ? (H - vh) / 2 : 0, Math.max(W, vw), Math.max(H, vh));
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
    // 판이 끝나 드롭만 줍는 중: 걷기만 (결과가 잡혀 있으니 포션·스킬은 막는다)
    if (this.endSnap) return;
    if (code === "Space" || code === "KeyJ") this.attack(true);
    else if (/^Digit[1-6]$/.test(code)) this.useSkill(Number(code.slice(5)) - 1);
    else if (code === "KeyQ") this.usePotion("p_coffee");
    else if (code === "KeyE") this.usePotion("p_energy");
    else if (code === "KeyR") this.usePotion("p_lunchbox");
  }

  protected onAction(a: RpgAction): void {
    if (this.endSnap) return;
    if (a.kind === "attack") this.attack(true);
    else if (a.kind === "hold") {
      this.holdOn = a.on;
      this.holdAim = a.on && a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : null;
    } else if (a.kind === "skill") this.useSkill(a.slot);
    else if (a.kind === "potion") this.usePotion(a.id);
  }

  /** 탭: 그쪽을 바라보고 공격 */
  protected onTap(x: number, y: number): void {
    if (this.endSnap) return;
    const dx = x - this.px;
    const dy = y - this.py;
    if (Math.hypot(dx, dy) > 2) this.setFace(dx, dy);
    this.attack(true);
  }

  protected setPaused(p: boolean): void {
    super.setPaused(p);
    this.holdOn = false;
    this.holdAim = null;
    // 11/13 판을 멈추면 같은 방 사람에게 "자리 비움" (내 아바타가 멈춰 있으니까)
    this.presence?.setAway(this.paused);
  }

  // ── 플레이어 행동 ──

  private get now(): number {
    return this.elapsed;
  }

  private buff(id: string): number {
    const b = this.buffs.get(id);
    return b && b.until > this.now ? b.v : 0;
  }

  private atk(): number {
    return this.dv.atk * (1 + this.buff("em_stoke"));
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
    if (this.now < this.atkReadyAt || this.now < this.rootUntil) {
      if (press) this.atkBuffered = true;
      return;
    }
    this.atkBuffered = false;
    const st = this.wstyle;
    this.atkCdMs = attackCooldownMs(this.dv.aspd * (1 + this.buff("so_swift_aspd")), st);
    this.atkReadyAt = this.now + this.atkCdMs;
    this.wasReady = false;
    this.chain = this.now - this.lastAtkAt <= this.atkCdMs + CHAIN_GRACE_MS ? (this.chain % FINISHER_EVERY) + 1 : 1;
    this.lastAtkAt = this.now;
    const fin = this.chain === FINISHER_EVERY;
    const target = this.aim();
    this.swing(1);
    // 11/13 같은 사냥터 사람에게 공격 동작 (혼자면 안 보낸다)
    this.presence?.hunt({ k: "atk", a: Math.round((Math.atan2(this.face.y, this.face.x) * 180) / Math.PI), w: st.id, ...(fin ? { f: true as const } : {}) });
    if (st.projectile) this.fire(fin);
    else if (st.blast) this.castInk(fin, target);
    else this.melee(fin);
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
    const area = fin && (st.finisher.range || st.finisher.arcDeg) ? { range: st.finisher.range ?? this.area.range, arcDeg: st.finisher.arcDeg ?? this.area.arcDeg } : this.area;
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
        this.inArea(area).forEach((m, i) => this.strike(m, mult, false, i, opts));
      });
    }
  }

  /** 쏘기·던지기: 투사체 (마무리는 세 갈래) */
  private fire(fin: boolean): void {
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
    const r = (fin ? st.finisher.blast : undefined) ?? st.blast ?? 20;
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
      s.x += s.vx * dt;
      s.y += s.vy * dt;
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
    if (!sureHit && Math.random() > hitChance(d.hit, m.st.flee)) {
      this.fx.miss(m.x, m.y - MONSTERS[m.id].size - 2);
      if (nth === 0) this.sfx.play("miss", 0.45);
      return;
    }
    const crit = Math.random() * 100 < d.crit;
    // 약화(넋 사슬·얼음 무덤·서리밭) + 살얼음 패시브(느려지거나 묶인 적)
    const held = m.slowUntil > this.now || m.stunUntil > this.now;
    const vuln = (m.vulnUntil > this.now ? m.vuln : 0) + (held ? this.mods.vsSlowed : 0);
    const dmg = damage(this.atk(), mult * (opts.aoe ? 1 + this.mods.aoePct : 1), m.st.def, Math.random(), crit, vuln);
    this.hurtMonster(m, dmg, crit, nth, opts);
    // 넋 거두기 패시브: 준 피해의 일부를 HP로 (한 번에 최대 HP의 3%까지)
    if (this.mods.steal > 0 && !this.died && this.hp < d.maxHp) {
      this.hp = Math.min(d.maxHp, this.hp + Math.min(d.maxHp * 0.03, dmg * this.mods.steal));
      this.mv.drainWisp({ x: m.x, y: m.y - MONSTERS[m.id].size / 2 }, { x: this.px, y: this.py });
      this.passiveSnd("so_drain", 260);
    }
    // 살얼음 패시브: 묶이거나 느려진 적이 맞으면 금이 쩍 간다
    if (held && this.mods.vsSlowed > 0) {
      this.mv.brittleCrack(m.x, m.y - MONSTERS[m.id].size / 2);
      this.passiveSnd("fr_brittle", 140);
    }
    if (opts.slowMs && m.alive) {
      m.slowUntil = Math.max(m.slowUntil, this.now + opts.slowMs);
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
    m.hp -= dmg;
    const def = MONSTERS[m.id];
    const sk = opts.skill ? PALETTES[opts.skill] : null;
    const w = opts.weight ?? (opts.heavy ? 2 : 0);
    // 큰 도트 숫자: 맞을 때마다 같은 자리 근처에 흩어져 겹쳐 쌓인다 (연타 묶음이면 합계에 더한다)
    this.dmg.hit(m.x, m.y - def.size - 2, dmg, crit, opts.skill ?? "basic", opts.group);
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
    // 히트스톱 강약: 기본 45 · 묵직 65 · 스킬 무게만큼 더 · 치명타는 더 길게 (짧은 정지)
    this.hitstop = Math.max(this.hitstop, (crit ? 85 : opts.heavy ? 65 : 45) + w * 8 + (crit && sk ? 25 : 0));
    if (crit) this.fx.shake(80, 0.003);
    else if (opts.heavy && nth === 0) this.fx.shake(60, 0.002);
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
    m.alive = false;
    this.lastKill = { x: m.x, y: m.y };
    this.kills[m.id] = (this.kills[m.id] ?? 0) + 1;
    this.killCount++;
    if (!m.minion && !MONSTERS[m.id].minion) this.waveAlive[m.wave]--;
    this.killFx(m);
    m.bar.destroy();
    m.barBg.destroy();
    m.shadow.destroy();
    playMonsterDeath(this, m.sprite);
    const split = MONSTERS[m.id].split;
    if (split) for (let i = 0; i < split.n; i++) this.spawn(split.id, m.x + (i - (split.n - 1) / 2) * 16, m.y, m.wave);
  }

  /** 16번 처치 효과: 파편·고리·동전·경험치 구슬 + 처치 소리 + 짧은 히트스톱 */
  private killFx(m: Mon): void {
    const def = MONSTERS[m.id];
    cancelCast(this.patHost, m);
    this.sfx.play("kill", m.boss ? 0.8 : 0.55);
    this.hitstop = Math.max(this.hitstop, m.boss ? 160 : 60);
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
      haste: (m) => (m.phase > 0 ? (bossPhaseList(MONSTERS[m.id])[m.phase - 1]?.haste ?? 1) : 1),
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

  /** 스킬 쿨타임 (동지의 맹세 패시브만큼 짧게) */
  private cdOf(id: SkillId): number {
    const def = skillById(id);
    const lv = this.play.skills[id] ?? 1;
    return def ? Math.round(def.cooldownMs(lv) * (1 - this.mods.cdCut)) : 1;
  }

  private useSkill(slot: number): void {
    const id = this.play.hotbar[slot];
    if (!id) return;
    const lv = this.play.skills[id] ?? 0;
    const def = skillById(id);
    if (!def || def.kind !== "active" || lv < 1) return;
    if ((this.skillReady[id] ?? 0) > this.now) return;
    if (this.died || this.status.has("freeze", this.now)) return;
    if (this.status.has("silence", this.now)) {
      this.flash("침묵: 지금은 스킬을 못 써요", 900);
      this.sfx.play("miss", 0.4);
      return;
    }
    const cost = def.sp(lv);
    if (this.sp < cost) {
      this.flash("SP가 모자라요", 900);
      this.sfx.play("miss", 0.4);
      return;
    }
    this.sp -= cost;
    this.skillReady[id] = this.now + this.cdOf(id);
    this.passiveSnd("fr_solstice", 2000);
    this.castSkill(id, lv);
    // 11/13 같은 사냥터 사람에게 스킬 동작 (이름은 받는 쪽 카탈로그에서)
    this.presence?.hunt({ k: "skill", a: Math.round((Math.atan2(this.face.y, this.face.x) * 180) / Math.PI), s: id });
  }

  /** 시전 컷인: 몸 둘레 오라 번쩍 + 아주 짧은 정지(히트스톱). 소리는 스킬마다 castSkill에서 따로 낸다 (skillSound.ts) */
  private cutIn(b: BranchId, big: boolean): void {
    this.skfx.cutIn(this.px, this.py, b, big);
    this.hitstop = Math.max(this.hitstop, big ? 80 : 50);
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
    return { skill: skillById(id)?.branch, weight: SKILL_LOOK[id].weight, group, ...more };
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
          this.slowMo(160);
          this.hitstop = Math.max(this.hitstop, 90);
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
          this.slowMo(160);
          this.hitstop = Math.max(this.hitstop, 90);
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
        const heal = Math.round(this.dv.maxHp * fx.healPct * pow + this.dv.stats.int * 3);
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
        this.buffs.set("so_swift", { until: now + fx.durMs, v: fx.move });
        this.buffs.set("so_swift_aspd", { until: now + fx.durMs, v: fx.aspd });
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
        const fx = SKILL_FX.so_chain(lv);
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
        const fx = SKILL_FX.so_harvest(lv);
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
            const want = Math.min(fx.healCap * this.dv.maxHp - healed, n * fx.healPerHit * this.dv.maxHp);
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
        const heal = Math.round(this.dv.maxHp * fx.healPct);
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
        this.aoeAt(f.x, f.y, f.r, f.mult, { skill: f.branch, aoe: true, kb: 0.5, slowMs: f.kind === "brazier" ? 0 : 1100, weight: look ? Math.min(1, look.weight) : 1, group: f.group }, (m) => this.weaken(m, f.vuln, f.every + 200));
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
    t.nextAtk = now + t.everyMs;
    this.fx2Bolt(t.sprite.x, t.sprite.y - 10, best);
    this.passiveSnd("so_lantern", 120, "tick");
    this.passiveSnd("so_kinship", 1500);
    if (!t.group || t.group.closed) t.group = this.dmg.group(t.sprite.x, t.sprite.y - 36, "soul", t.everyMs + 500, 3);
    this.strike(best, t.atkPct * this.dv.skillPower * (1 + this.mods.summonPct), true, 0, { skill: "soul", kb: 0.5, weight: 1, group: t.group });
  }

  private potionLeft(id: string): number {
    return (this.play.potions[id] ?? 0) - (this.potionsUsed[id] ?? 0);
  }

  private usePotion(id: string): void {
    const p = potionById(id);
    if (!p || p.revive || this.now < this.potionReadyAt) return;
    if (this.potionLeft(id) <= 0) {
      this.flash(`${p.name}이(가) 없어요`, 900);
      return;
    }
    this.potionsUsed[id] = (this.potionsUsed[id] ?? 0) + 1;
    this.potionReadyAt = this.now + POTION_COOLDOWN_MS;
    const d = this.dv;
    if (p.hp) this.hp = Math.min(d.maxHp, this.hp + p.hp);
    if (p.sp) this.sp = Math.min(d.maxSp, this.sp + p.sp);
    this.floatText(this.px, this.py - 20, p.name, "#ffe39a", 11);
    // 상태 이상 풀기 (커피: 독·화상·출혈, 에너지드링크: 둔화·빙결·혼란·침묵, 도시락: 전부)
    const cured = this.status.cure(POTION_CURES[id] ?? [], this.now);
    if (cured.length) {
      this.floatText(this.px, this.py - 30, `${cured.map((c) => STATUSES[c].name).join("·")} 풀림`, "#e8f0ff", 9);
      this.ringFx(0xe8f0ff, 22);
    }
    this.sfx.play("potion", 0.7);
  }

  /** 맞으면 true (무적·회피 시간·보호막이 다 막으면 false). src가 있으면 상태 이상을 굴린다 */
  private hurtPlayer(dmg: number, src?: HitSrc): boolean {
    // 판이 끝나 드롭만 줍는 중에는 다치지 않는다 (지형 함정이 결과를 바꾸지 않게)
    if (this.died || this.endSnap || this.now < this.hurtUntil || this.buff("invuln")) return false;
    this.hurtUntil = this.now + HURT_IFRAME_MS;
    // 11/12 부재중 자동응답: 보호막이 먼저 받는다
    // 동지의 맹세: 받는 피해 감소
    dmg = Math.max(1, Math.round(dmg * (1 - this.mods.guard)));
    // 서리 방패: 보호막이 먼저 받는다
    if (this.shield > 0 && this.buff("fr_ward")) {
      const take = Math.min(this.shield, dmg);
      this.shield -= take;
      dmg -= take;
      this.dmg.minor(this.px, this.py - 22, take, "shield");
      if (this.shield <= 0) {
        this.buffs.delete("fr_ward");
        this.mv.wardBreak(this.px, this.py);
        this.passiveSnd("fr_ward", 0);
      }
      if (dmg <= 0) return false;
    }
    this.hp -= dmg;
    this.dmg.hurt(this.px, this.py - 20, dmg);
    this.passiveSnd("fr_collar", 300);
    this.player.setTintFill(0xff6a6a);
    // 번쩍임이 끝나면 drawStatus가 상태 색(없으면 원래 색)으로 되돌린다
    this.hurtFlashUntil = this.now + 90;
    this.tintNow = -1;
    this.fx.shake(90, 0.003);
    this.combo = 0;
    if (this.hp > 0) {
      if (src) this.inflict(src);
      return true;
    }
    if (!this.cookieUsed && (this.play.potions.p_cookie ?? 0) > 0) {
      // 부활 쿠키: 자동으로 먹고 반쯤 회복, 잠깐 무적
      this.cookieUsed = true;
      this.potionsUsed.p_cookie = 1;
      this.hp = Math.round(this.dv.maxHp * 0.5);
      this.buffs.set("invuln", { until: this.now + 2000, v: 1 });
      this.flash("부활 쿠키를 먹고 다시 일어났어요", 2000);
      this.sfx.play("potion");
      this.ringFx(0xffe39a, 36);
      // 다시 일어나면 상태 이상도 털어 낸다
      this.status.cure(STATUS_IDS, this.now);
      return true;
    }
    this.hp = 0;
    this.died = true;
    this.status.clear();
    this.sfx.play("defeat");
    this.flash("쓰러졌어요…", 1500);
    this.player.setAlpha(0.5);
    // 쓰러진 뒤 잠깐: 그때까지의 결과로 끝내고, 받을 드롭이 있으면 바닥에 떨궈 날아오게 한 뒤 끝낸다
    this.time.delayedCall(900, () => !this.ended && !this.endSnap && this.endRun(this.result(), true, 0));
    return true;
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
    const base = monsterStats(id, this.play.difficulty, this.zone.power);
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

  /** 몬스터끼리 살짝 밀어내기 (무리가 한 점으로 뭉쳐 보이지 않게). n²이지만 수십 마리라 가볍다 */
  private separate(): void {
    const ms = this.mons;
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
    this.hurtPlayer(damage(m.st.atk, mult, this.dv.def, Math.random(), false), { id: m.id, pat: m.cast?.id ?? "bite" });
  }

  /**
   * 몬스터 한 마리: 넉백 → 경직 → (2번) 패턴 중이면 패턴이 움직임을 맡고, 아니면 쓸 수 있는 패턴을 고른 뒤 행동대로 걷는다.
   * 공격은 모두 패턴으로 한다 (물기·돌진·사격·자폭·기습·우두머리 단계 패턴 — 바닥 경고가 먼저 보인다)
   */
  private updateMonster(m: Mon, dt: number): void {
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
    this.step(delta);
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
    // 미뤄 둔 일 (휘두르는 동작 뒤 판정 등)
    if (this.laters.length) {
      const due = this.laters.filter((l) => l.at <= now);
      this.laters = this.laters.filter((l) => l.at > now);
      for (const l of due) l.fn();
    }

    // 웨이브
    const aliveAll = this.pendingSpawns > 0 || this.mons.some((m) => m.alive);
    if (this.nextWave < this.plan.length) {
      const w = this.plan[this.nextWave];
      const prevDone = !aliveAll;
      if ((prevDone && now >= w.earliestSec * 1000) || now - this.lastWaveAt >= WAVE_MAX_GAP_SEC * 1000) this.spawnWave();
    } else if (!aliveAll && !this.victoryAt && !this.died && !this.endSnap) {
      this.victoryAt = now + 1200;
      this.flash("모든 웨이브를 막아 냈어요!", 2000);
      this.sfx.play("victory");
      // 결과는 지금 잡는다 (걸린 시간은 예전처럼 1.2초 뒤 끝난 것으로 → 랭킹 기록이 드롭 줍는 시간만큼 늘지 않는다)
      this.endRun({ ...this.result(), durationMs: Math.round(Math.min(this.victoryAt, this.limitMs)) }, false, 1200);
    }
    if (!this.endSnap && now >= this.limitMs && !this.died) {
      this.flash("시간이 다 됐어요", 1500);
      this.endRun(this.result(), true, 0);
    }
    // 판 끝: 드롭을 다 주웠거나(놓쳐도 잠시 뒤 날아온다) 기다림이 끝나면 결과를 보낸다
    if (this.endSnap) {
      this.loot.update(now, Math.min(delta, 100));
      if (now >= this.endAt) {
        if (now >= this.lootDeadline) this.loot.rush();
        if (this.loot.count === 0 || now >= this.lootDeadline + 900) return this.finish();
      }
      // 시간 끝·쓰러짐: 몬스터·이동은 멈춘 채 드롭만 날아온다
      if (this.over) return;
    }

    // 재생·버프
    if (now >= this.regenAt) {
      this.regenAt = now + 1000;
      this.sp = Math.min(d.maxSp, this.sp + 1 + d.maxSp * 0.01);
      this.hp = Math.min(d.maxHp, this.hp + d.maxHp * 0.004);
    }
    // 상태 이상: 끝난 것 정리 + 지속 피해 (무적이면 안 받고, 이걸로는 쓰러지지 않는다 — HP 1에서 멈춤)
    const sd = this.status.update(now, d.maxHp, this.movingNow);
    if (!this.died && !this.buff("invuln")) {
      for (const x of sd.dmg) {
        const before = this.hp;
        this.hp = Math.max(1, this.hp - x.amount);
        const lost = Math.round(before - this.hp);
        if (lost > 0) this.dmg.minor(this.px + 6, this.py - 16, lost);
      }
    }

    // 이동
    if (!this.died) {
      // 상태 이상: 빙결은 제자리, 혼란은 방향이 거꾸로, 둔화는 느리게
      const frozen = this.status.has("freeze", now);
      const a0 = this.axis();
      const a = this.status.has("confuse", now) ? { x: -a0.x, y: -a0.y } : a0;
      const moving = Math.hypot(a.x, a.y) > 0.15 && now >= this.rootUntil && !frozen;
      // 40번 지형: 늪·덩굴은 느리게, 웅덩이는 미끄럽게, 컨베이어·문·바람은 밀어낸다
      const spd = moving ? d.move * (1 + this.buff("so_swift")) * this.status.moveMul(now) * this.arena.speedMul(this.px, this.py) : 0;
      const v = this.arena.playerVelocity(a.x * spd, a.y * spd, this.px, this.py, dt, now);
      if (v.x || v.y) {
        this.px = Phaser.Math.Clamp(this.px + v.x * dt, WALL + PLAYER_R, W - WALL - PLAYER_R);
        this.py = Phaser.Math.Clamp(this.py + v.y * dt, WALL + PLAYER_R + 8, H - WALL - 2);
        const p = { x: this.px, y: this.py };
        for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
        this.arena.collide(p, PLAYER_R);
        this.px = p.x;
        this.py = p.y;
      }
      if (moving) {
        this.setFace(a.x, a.y);
        this.walkT += delta;
      }
      this.movingNow = moving;
      if (this.me) this.me.apply(moving ? "walk" : "idle", (this.dirRow as DirId) ?? DIR.down, this.time.now);
      else this.player.setFrame(avFrame(this.dirRow, moving ? 2 + (Math.floor(this.walkT / 120) % 4) : Math.floor(now / 500) % 2));
      // 버퍼에 한 번 있거나, 공격 키·마우스·손가락을 누르고 있으면 쿨다운이 끝나는 순간 친다
      const held = this.holdOn || this.keys.has("Space") || this.keys.has("KeyJ");
      if ((held || this.atkBuffered) && now >= this.atkReadyAt && now >= this.rootUntil && !frozen) {
        if (this.holdOn && this.holdAim) {
          const p = this.toWorld(this.holdAim.x, this.holdAim.y);
          if (Math.hypot(p.x - this.px, p.y - this.py) > 2) this.setFace(p.x - this.px, p.y - this.py);
        }
        this.attack(false);
      }
    }
    if (this.me) {
      this.me.place(Math.round(this.px), Math.round(this.py));
      this.me.sync(this.time.now, 1 / this.cameras.main.zoom);
    }
    this.player.setPosition(Math.round(this.px), Math.round(this.py)).setDepth(this.py);
    this.player.setAlpha(this.died ? 0.5 : this.buff("invuln") ? 0.55 + 0.3 * Math.sin(now / 60) : 1);
    this.pShadow.setPosition(this.px, this.py);
    this.drawGauge(now);
    this.drawStatus(now);

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
          h.nextAtk = now + 800;
          const t = this.nearest(60);
          if (t) {
            this.fx2Bolt(h.sprite.x, h.sprite.y, t, true);
            this.passiveSnd("so_friend", 120, "tick");
            this.passiveSnd("so_kinship", 1500);
            if (!h.group || h.group.closed) h.group = this.dmg.group(h.sprite.x, h.sprite.y - 30, "soul", 1300, 3);
            this.strike(t, this.buff("so_friend") * this.dv.skillPower * (1 + this.mods.summonPct), true, 0, { skill: "soul", weight: 1, group: h.group });
          }
        }
      }
    }

    this.updateTurret(now);
    this.updateFields(now);
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
      const showBar = (m.elite || m.hp < m.st.maxHp) && !m.hidden;
      const eTop = m.elite ? m.y - size * ELITE.scale - 3 : top;
      m.barBg.setPosition(m.x, eTop).setVisible(showBar);
      m.bar.setPosition(m.x - size / 2, eTop).setSize(Math.max(0, (size * m.hp) / m.st.maxHp), 2).setVisible(showBar);
    }
    this.mons = this.mons.filter((m) => m.alive);
    this.separate();
    // 40번: 지형 기믹·우두머리 졸개·조명·입자
    this.arena.update(now, dt, { x: this.px, y: this.py }, this.mons);
    // 2번 바닥 경고 · 40번 내 투사체 · 16번 콤보
    this.tele.update(now);
    this.updatePShots(dt);
    if (this.combo && now - this.comboAt > COMBO_RESET_MS) this.combo = 0;
    this.fx.combo(this.died ? 0 : this.combo, this.px, this.py - 33);

    // 투사체
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.sprite.setPosition(s.x, s.y);
      if (Math.hypot(s.x - this.px, s.y - (this.py - 8)) < 8) {
        s.until = 0;
        this.hurtPlayer(damage(s.dmg, 1, d.def, Math.random(), false), s.src);
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
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: d.maxHp,
      sp: Math.round(this.sp),
      maxSp: d.maxSp,
      leftMs: Math.max(0, this.limitMs - now),
      score: this.killCount,
      wave: [Math.max(1, this.nextWave), this.plan.length],
      kills: this.killCount,
      combo: this.combo,
      cooldowns: this.play.hotbar.map((id) => {
        if (!id) return 0;
        const left = (this.skillReady[id] ?? 0) - now;
        return left > 0 ? left / this.cdOf(id) : 0;
      }),
      potionCooldown: Math.max(0, (this.potionReadyAt - now) / POTION_COOLDOWN_MS),
      attack: Math.max(0, (this.atkReadyAt - now) / this.atkCdMs),
      peers: this.presence ? this.peers || undefined : undefined,
      attackBuffered: this.atkBuffered,
      potions: Object.fromEntries(Object.keys(this.play.potions).map((id) => [id, this.potionLeft(id)])),
      buffs: [...this.buffs].filter(([, b]) => b.until > now).map(([id, b]) => ({ id, leftMs: b.until - now })),
      statuses: this.status.list(now),
      boss: boss ? { name: MONSTERS[boss.id].name, ratio: Math.max(0, boss.hp / boss.st.maxHp) } : null,
      message: now < this.messageUntil ? this.message : undefined,
    };
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
      drops = this.play.testDrops?.length ? this.play.testDrops : huntDropsFor({ game: "hunt", difficulty: this.play.difficulty, seed: this.play.seed, zone: this.play.zone }, r);
    } catch {
      // 연출용 계산이 실패해도 판은 그대로 끝난다 (보상은 서버가)
    }
    // 바닥에 닿고 스스로 날아올 때까지 넉넉히 (그 뒤엔 남은 것을 끌어와 끝낸다)
    this.lootDeadline = now + minMs + (freeze ? 2600 : 4200);
    if (!drops.length) return;
    // 마지막으로 잡은 자리에서 (멀면 내 둘레에서). 화면(세로로 긴 휴대폰은 좁다) 안쪽으로 당겨 떨어지는 걸 놓치지 않게
    const k = this.lastKill;
    const src = k && Math.hypot(k.x - this.px, k.y - this.py) < 140 ? { ...k } : { x: this.px + this.face.x * 14, y: this.py + 4 };
    const v = this.cameras.main.worldView;
    if (v.width > 80 && v.height > 80) {
      src.x = Phaser.Math.Clamp(src.x, v.x + 34, v.right - 34);
      src.y = Phaser.Math.Clamp(src.y, v.y + 40, v.bottom - 30);
    }
    this.loot.drop(drops, src.x, src.y, freeze || this.died, freeze ? 120 : 380);
  }

  /** 드롭만 줍던 중에 나가도 판은 이미 끝났으니 정상 종료로 */
  protected finish(aborted = false): void {
    super.finish(aborted && !this.endSnap);
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
function withPassives(d: Derived, m: SkillMods): Derived {
  return { ...d, maxHp: Math.round(d.maxHp * (1 + m.hpPct)), def: d.def + m.def, crit: Math.min(60, d.crit + m.crit), atk: Math.round(d.atk * (1 + m.atkPct)) };
}
