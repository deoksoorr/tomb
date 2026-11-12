import * as Phaser from "phaser";
import { MONSTERS, potionById, POTION_COOLDOWN_MS, SKILL_FX, skillById, zoneFor, type MonsterId, type SkillId, type ZoneDef } from "@/lib/rpg/catalog";
import { attackArea, damage, hitChance, inAttackArea, monsterStats, type AttackArea, type MonsterStats } from "@/lib/rpg/formulas";
import { bossPhaseIndex, bossPhaseList, monsterPatterns, type PatternId } from "@/lib/rpg/patterns";
import { attackCooldownMs, CHAIN_GRACE_MS, FINISHER_EVERY, weaponStyleOf, type WeaponStyle, type WeaponStyleId } from "@/lib/rpg/weapons";
import { gearById } from "@/lib/rpg/catalog";
import { ELITE, huntPlan, STREAM_GAP_MS, WAVE_FORMATION_LABEL, WAVE_MAX_GAP_SEC, type HuntWave } from "@/lib/rpg/plan";
import { POTION_CURES, rollStatus, STATUS_IDS, StatusBook, STATUSES, type StatusId } from "@/lib/rpg/status";
import type { HuntResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { DIR, STATE, type DirId } from "@tomb/protocol";
import { AvatarView } from "../entities/AvatarView";
import { RoomPresence } from "../net/RoomPresence";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { iconCanvas } from "./icons";
import { RpgScene } from "./base";
import { CombatFx, COMBO_RESET_MS, FXT } from "./combatFx";
import { cancelCast, seedPatternTimers, tryStartPattern, updateCast, type Cast, type PatternHost } from "./monsterPatterns";
import type { RpgSound } from "./sfx";
import { TelegraphLayer } from "./telegraph";
import { avFrame, ensureRpgTextures, makePlayer, RTEX } from "./sprites";
// 40번 테마 사냥터: 지도·기믹·길찾기 (arena/), 몬스터 동작별 프레임 (monsterArt)
import { Arena } from "./arena/Arena";
import { monsterFrame, monsterOrigin, playMonsterDeath } from "./monsterArt";

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
type PShot = { x: number; y: number; vx: number; vy: number; left: number; pierce: number; mult: number; hit: Set<Mon>; sprite: Phaser.GameObjects.Sprite; spin: boolean };

/** 무기 방식마다 휘두를 때 소리 */
const SWING_SFX: Record<WeaponStyleId, RpgSound> = { swing: "swish", smash: "thud", thrust: "stab", combo: "clack", shot: "twang", magic: "ink", card: "flick" };
/** 타격 옵션: 넉백 배율, 추가 경직, 묵직한 타격(내려찍기) */
type HitOpts = { kb?: number; stun?: number; heavy?: boolean };

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
  private helper: { sprite: Phaser.GameObjects.Sprite; until: number; nextAtk: number } | null = null;
  /** 11/12 복합기 설치 (포탑 소환) */
  private turret: { sprite: Phaser.GameObjects.Image; until: number; nextAtk: number; atkPct: number; everyMs: number; range: number } | null = null;
  /** 11/12 부재중 자동응답 보호막 남은 양 (buffs.auto_reply가 끝나면 사라진다) */
  private shield = 0;
  /** 11/12 줄지어 돌격(stream) 웨이브에서 아직 안 나온 몬스터 수 (다 나오기 전엔 웨이브가 끝난 게 아니다) */
  private pendingSpawns = 0;
  /** 11/12 같은 방 다른 사람: 반투명 + "사냥 중" 표시를 붙인 아바타 */
  private ghosted = new WeakSet<RemoteAvatar>();
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
    this.ghosted = new WeakSet();
    this.hp = play.derived.maxHp;
    this.sp = play.derived.maxSp;
    this.px = W / 2;
    this.py = H / 2;
    // 판 시간(elapsed) 기준 시각들: 씬 인스턴스는 판마다 재사용되고 elapsed는 0부터 다시 센다.
    // 안 지우면 지난 판 막바지의 커피 브레이크(rootUntil)가 다음 판의 이동·공격을 그 시각까지 막는다.
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
        if (this.died || this.hp >= this.play.derived.maxHp) return;
        this.hp = Math.min(this.play.derived.maxHp, this.hp + n);
        this.floatText(this.px, this.py - 20, `+${n}`, "#6ad07a", 9);
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
      maxHp: () => this.play.derived.maxHp,
    });
    this.px = this.arena.start.x;
    this.py = this.arena.start.y;

    this.pShadow = this.add.image(this.px, this.py, RTEX.shadow).setDepth(-500);
    const atlas = this.data0.atlas;
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
    this.tele = new TelegraphLayer(this);
    this.patHost = this.makePatternHost();
    this.wstyle = weaponStyleOf(play.equip.weapon ? gearById(play.equip.weapon) : undefined);
    this.chain = 0;
    this.lastAtkAt = -1e9;
    this.combo = this.maxCombo = this.comboAt = 0;
    this.pshots = [];
    this.laters = [];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.fx.destroy();
      this.tele.destroy();
    });

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.applyZoom();
    cam.startFollow(this.player, true, 0.15, 0.15);
    this.flash(`${zone.name} · ${zone.desc}`, 2600);
  }

  // ── 카메라 ──

  private applyZoom(): void {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(Math.floor(Math.min(cam.width, cam.height) / 220), 2, 4);
    cam.setZoom(z);
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
    if (code === "Space" || code === "KeyJ") this.attack(true);
    else if (/^Digit[1-6]$/.test(code)) this.useSkill(Number(code.slice(5)) - 1);
    else if (code === "KeyQ") this.usePotion("p_coffee");
    else if (code === "KeyE") this.usePotion("p_energy");
    else if (code === "KeyR") this.usePotion("p_lunchbox");
  }

  protected onAction(a: RpgAction): void {
    if (a.kind === "attack") this.attack(true);
    else if (a.kind === "hold") {
      this.holdOn = a.on;
      this.holdAim = a.on && a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : null;
    } else if (a.kind === "skill") this.useSkill(a.slot);
    else if (a.kind === "potion") this.usePotion(a.id);
  }

  /** 탭: 그쪽을 바라보고 공격 */
  protected onTap(x: number, y: number): void {
    const dx = x - this.px;
    const dy = y - this.py;
    if (Math.hypot(dx, dy) > 2) this.setFace(dx, dy);
    this.attack(true);
  }

  protected setPaused(p: boolean): void {
    super.setPaused(p);
    this.holdOn = false;
    this.holdAim = null;
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
    return this.play.derived.atk * (1 + this.buff("overtime"));
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
    this.atkCdMs = attackCooldownMs(this.play.derived.aspd * (1 + this.buff("team_dinner")), st);
    this.atkReadyAt = this.now + this.atkCdMs;
    this.wasReady = false;
    this.chain = this.now - this.lastAtkAt <= this.atkCdMs + CHAIN_GRACE_MS ? (this.chain % FINISHER_EVERY) + 1 : 1;
    this.lastAtkAt = this.now;
    const fin = this.chain === FINISHER_EVERY;
    const target = this.aim();
    this.swing(1);
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
    const opts: HitOpts = { kb: st.kb, stun: st.stunMs, heavy: st.id === "smash" };
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
      for (const m of [...this.mons]) if (m.alive && !m.hidden && Math.hypot(m.x - pt.x, m.y - pt.y) < r + MONSTERS[m.id].size / 2) this.strike(m, mult, false, k++, { kb: st.kb, stun: st.stunMs });
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
        this.strike(m, s.mult, false, k++, { kb: this.wstyle.kb });
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
    const d = this.play.derived;
    if (!sureHit && Math.random() > hitChance(d.hit, m.st.flee)) {
      this.fx.miss(m.x, m.y - MONSTERS[m.id].size - 2);
      if (nth === 0) this.sfx.play("miss", 0.45);
      return;
    }
    const crit = Math.random() * 100 < d.crit + this.buff("debugging");
    const vuln = m.vulnUntil > this.now ? m.vuln : 0;
    const dmg = damage(this.atk(), mult, m.st.def, Math.random(), crit, vuln);
    this.hurtMonster(m, dmg, crit, nth, opts);
  }

  /**
   * 16번 타격감: 흰 번쩍임 + 충격 별 + 튀는 숫자(치명타는 크게) + 넉백·경직 + 히트스톱(아주 잠깐 멈춤) + 콤보.
   * 패턴을 쓰는 중인 몬스터(물기 제외)는 밀리지 않는다 (경고가 보인 자리에서 그대로 친다)
   */
  private hurtMonster(m: Mon, dmg: number, crit: boolean, nth = 0, opts: HitOpts = {}): void {
    if (!m.alive) return;
    m.hp -= dmg;
    const def = MONSTERS[m.id];
    this.fx.damage(m.x, m.y - def.size, dmg, crit, nth);
    this.fx.impact(m.x + (Math.random() - 0.5) * 4, m.y - def.size * 0.5, crit, opts.heavy);
    if (nth === 0 || crit) this.sfx.play(crit ? "crit" : "hit", crit ? 0.7 : 0.55);
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(crit ? 90 : 60, () => m.alive && m.sprite.clearTint());
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
    this.hitstop = Math.max(this.hitstop, crit ? 85 : opts.heavy ? 65 : 45);
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
      strikePlayer: (m, mult) => sc.hurtPlayer(damage(m.st.atk, mult, sc.play.derived.def, Math.random(), false), { id: m.id, pat: m.cast?.id }),
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

  private useSkill(slot: number): void {
    const id = this.play.hotbar[slot];
    if (!id) return;
    const lv = this.play.skills[id] ?? 0;
    const def = skillById(id);
    if (!def || lv < 1) return;
    if ((this.skillReady[id] ?? 0) > this.now) return;
    if (this.status.has("freeze", this.now)) return;
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
    this.skillReady[id] = this.now + def.cooldownMs(lv);
    this.sfx.play("skill", 0.7);
    const pow = this.play.derived.skillPower;
    const now = this.now;
    switch (id) {
      case "refactor": {
        const fx = SKILL_FX.refactor(lv);
        const t = this.nearest(fx.range);
        if (t) this.setFace(t.x - this.px, t.y - this.py);
        this.swing(1.6);
        if (t) this.strike(t, fx.mult * pow, true);
        break;
      }
      case "hotfix": {
        const heal = Math.round(this.play.derived.maxHp * SKILL_FX.hotfix(lv).healPct * pow + this.play.derived.stats.int * 3);
        this.hp = Math.min(this.play.derived.maxHp, this.hp + heal);
        this.floatText(this.px, this.py - 20, `+${heal}`, "#6ad07a", 12);
        this.ringFx(0x6ad07a, 30);
        break;
      }
      case "rollback":
        this.buffs.set("rollback", { until: now + SKILL_FX.rollback(lv).durMs, v: 1 });
        this.ringFx(0xc8a0e8, 20);
        break;
      case "cache_hit":
        this.buffs.set("cache_hit", { until: now + SKILL_FX.cache_hit(lv).durMs, v: SKILL_FX.cache_hit(lv).speed });
        break;
      case "debugging":
        this.buffs.set("debugging", { until: now + SKILL_FX.debugging(lv).durMs, v: SKILL_FX.debugging(lv).crit });
        break;
      case "pair_prog": {
        const fx = SKILL_FX.pair_prog(lv);
        this.helper?.sprite.destroy();
        this.helper = { sprite: this.add.sprite(this.px - 14, this.py, RTEX.helper, 0).setAlpha(0.9), until: now + fx.durMs, nextAtk: now + 400 };
        this.buffs.set("pair_prog", { until: now + fx.durMs, v: fx.atkPct });
        break;
      }
      case "code_review": {
        const fx = SKILL_FX.code_review(lv);
        for (const m of this.mons) {
          if (!m.alive || Math.hypot(m.x - this.px, m.y - this.py) > fx.radius) continue;
          m.vulnUntil = now + fx.durMs;
          m.vuln = fx.vuln;
          m.slowUntil = now + fx.durMs;
          m.sprite.setTint(0xc8a0e8);
        }
        this.ringFx(0xe8d9b0, fx.radius);
        break;
      }
      case "overtime":
        this.buffs.set("overtime", { until: now + SKILL_FX.overtime(lv).durMs, v: SKILL_FX.overtime(lv).atk });
        this.ringFx(0xffe39a, 18);
        break;
      case "deploy": {
        const fx = SKILL_FX.deploy(lv);
        this.ringFx(0xe07a2a, fx.radius);
        this.cameras.main.shake(120, 0.004);
        let nth = 0;
        for (const m of [...this.mons]) if (m.alive && Math.hypot(m.x - this.px, m.y - this.py) < fx.radius + MONSTERS[m.id].size / 2) this.strike(m, fx.mult * pow, true, nth++);
        break;
      }
      case "coffee_break": {
        const fx = SKILL_FX.coffee_break(lv);
        const gain = Math.round(this.play.derived.maxSp * fx.spPct);
        this.sp = Math.min(this.play.derived.maxSp, this.sp + gain);
        this.rootUntil = now + fx.rootMs;
        this.floatText(this.px, this.py - 20, `SP +${gain}`, "#7ab0f0", 12);
        break;
      }
      // ── 11/12 추가 스킬 ──
      case "sprint": {
        // 돌진: 바라보는 쪽으로 미끄러지듯, 지나친 적을 한 번씩 친다 (달리는 동안 무적)
        const fx = SKILL_FX.sprint(lv);
        const from = { x: this.px, y: this.py };
        const to = this.slide(this.face.x * fx.dist, this.face.y * fx.dist);
        this.buffs.set("rollback", { until: now + 250, v: 1 });
        this.fx.motion("thrust", from.x, from.y - 6, Math.atan2(this.face.y, this.face.x), Math.hypot(to.x - from.x, to.y - from.y), true, 150);
        this.sfx.play("swish", 0.6);
        let nth = 0;
        for (const m of [...this.mons]) {
          if (!m.alive || m.hidden) continue;
          if (segDist(m.x, m.y, from.x, from.y, to.x, to.y) < fx.width + MONSTERS[m.id].size / 2) this.strike(m, fx.mult * pow, true, nth++, { kb: 1.4 });
        }
        break;
      }
      case "afk": {
        // 자리 비움: 가장 가까운 적의 반대쪽으로 순간이동 + 잠깐 피해 없음
        const fx = SKILL_FX.afk(lv);
        const t = this.nearest(400);
        const dx = t ? this.px - t.x : -this.face.x;
        const dy = t ? this.py - t.y : -this.face.y;
        const k = Math.hypot(dx, dy) || 1;
        this.ringFx(0xd9dccf, 18);
        this.slide((dx / k) * fx.dist, (dy / k) * fx.dist);
        this.buffs.set("rollback", { until: now + fx.safeMs, v: 1 });
        this.ringFx(0xd9dccf, 24);
        this.floatText(this.px, this.py - 22, "자리 비움", "#d9dccf", 10);
        break;
      }
      case "stapler_burst": {
        // 앞쪽 부채꼴로 철심 n발 (관통 없음)
        const fx = SKILL_FX.stapler_burst(lv);
        const t = this.nearest(fx.range);
        if (t) this.setFace(t.x - this.px, t.y - this.py);
        const base = Math.atan2(this.face.y, this.face.x);
        for (let i = 0; i < fx.n; i++) {
          const ang = base + (i - (fx.n - 1) / 2) * 0.16;
          const x = this.px + Math.cos(ang) * 6;
          const y = this.py - 7 + Math.sin(ang) * 4;
          const sprite = this.add.sprite(x, y, FXT.band, 0).setRotation(ang).setDepth(1e5).setTint(0xc8ccd2);
          this.pshots.push({ x, y, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260, left: fx.range, pierce: 0, mult: fx.mult * pow, hit: new Set(), sprite, spin: false });
        }
        this.sfx.play("twang", 0.6);
        break;
      }
      case "urgent_meeting": {
        // 긴급 회의 소집: 둘레 적을 내 앞으로 끌어모아 묶는다
        const fx = SKILL_FX.urgent_meeting(lv);
        const cx = this.px + this.face.x * 16;
        const cy = this.py + this.face.y * 16;
        for (const m of this.mons) {
          if (!m.alive || m.hidden || Math.hypot(m.x - this.px, m.y - this.py) > fx.radius) continue;
          const boss = m.boss || MONSTERS[m.id].behavior === "boss";
          const pull = boss ? 0.15 : 0.8;
          this.moveMon(m, (cx - m.x) * pull, (cy - m.y) * pull);
          m.stunUntil = Math.max(m.stunUntil, now + (boss ? fx.stunMs / 3 : fx.stunMs));
          m.kbx = m.kby = 0;
          if (fx.vuln > 0) {
            m.vulnUntil = now + fx.stunMs + 2000;
            m.vuln = Math.max(m.vulnUntil > now ? m.vuln : 0, fx.vuln);
          }
        }
        this.fx.shockwave(this.px, this.py, fx.radius, 0xe07a2a);
        this.flash("긴급 회의입니다! 모두 모이세요", 900);
        break;
      }
      case "printer": {
        // 복합기 설치: 그 자리에 포탑
        const fx = SKILL_FX.printer(lv);
        this.turret?.sprite.destroy();
        const key = "rpg-skill-printer";
        if (!this.textures.exists(key)) this.textures.addCanvas(key, iconCanvas(skillById("printer")!.art));
        const sprite = this.add.image(this.px + this.face.x * 12, this.py + this.face.y * 8, key).setOrigin(0.5, 1).setDepth(this.py);
        this.turret = { sprite, until: now + fx.durMs, nextAtk: now + 300, atkPct: fx.atkPct, everyMs: fx.everyMs, range: fx.range };
        this.ringFx(0xe8e8ec, 16);
        break;
      }
      case "team_dinner": {
        // 팀 회식: 공격 속도↑ + 매초 재생 (재생은 regen 틱에서)
        const fx = SKILL_FX.team_dinner(lv);
        this.buffs.set("team_dinner", { until: now + fx.durMs, v: fx.aspd });
        this.buffs.set("team_dinner_regen", { until: now + fx.durMs, v: fx.regenPct });
        this.ringFx(0xf0d050, 26);
        this.floatText(this.px, this.py - 22, "위하여!", "#f0d050", 11);
        break;
      }
      case "report_bomb": {
        // 보고서 폭탄: 가장 가까운 적 자리(없으면 앞)에 던지고 잠시 뒤 폭발
        const fx = SKILL_FX.report_bomb(lv);
        const t = this.nearest(fx.reach);
        const pt = this.patHost.clampPoint(t ? t.x : this.px + this.face.x * 50, t ? t.y : this.py + this.face.y * 50);
        this.fx.castMark(pt.x, pt.y, fx.radius, fx.delayMs);
        const key = "rpg-skill-report";
        if (!this.textures.exists(key)) this.textures.addCanvas(key, iconCanvas(skillById("report_bomb")!.art));
        const paper = this.add.image(this.px, this.py - 8, key).setDepth(1e5);
        this.tweens.add({ targets: paper, x: pt.x, y: pt.y - 4, angle: 360, duration: Math.min(400, fx.delayMs), ease: "Quad.easeOut" });
        const mult = fx.mult * pow;
        this.later(fx.delayMs, () => {
          paper.destroy();
          this.fx.shockwave(pt.x, pt.y, fx.radius, 0xd03030);
          this.fx.shake(140, 0.005);
          this.sfx.play("thud", 0.7);
          let k = 0;
          for (const m of [...this.mons]) if (m.alive && !m.hidden && Math.hypot(m.x - pt.x, m.y - pt.y) < fx.radius + MONSTERS[m.id].size / 2) this.strike(m, mult, true, k++, { kb: 1.6, heavy: true });
        });
        break;
      }
      case "auto_reply": {
        // 부재중 자동응답: 보호막
        const fx = SKILL_FX.auto_reply(lv);
        this.shield = Math.round(this.play.derived.maxHp * fx.shieldPct * pow);
        this.buffs.set("auto_reply", { until: now + fx.durMs, v: 1 });
        this.ringFx(0x6ad0c8, 22);
        this.floatText(this.px, this.py - 22, `보호막 ${this.shield}`, "#6ad0c8", 10);
        break;
      }
    }
  }

  /** 순간 이동(돌진·자리 비움): 벽·장애물을 넘지 않게 조금씩 밀어 본다. 도착한 곳 */
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

  /** 복합기 포탑: 사거리 안 가장 가까운 적에게 종이를 뱉는다 */
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
    let best: Mon | null = null;
    let bd = t.range;
    for (const m of this.mons) {
      if (!m.alive || m.hidden) continue;
      const d = Math.hypot(m.x - t.sprite.x, m.y - t.sprite.y);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return;
    t.nextAtk = now + t.everyMs;
    const target = best;
    const o = this.add.image(t.sprite.x, t.sprite.y - 10, RTEX.spark).setDepth(1e4).setTint(0xf2f2f2);
    this.tweens.add({ targets: o, x: target.x, y: target.y - 6, duration: 120, onComplete: () => o.destroy() });
    this.hurtMonster(target, damage(this.atk() * t.atkPct * this.play.derived.skillPower, 1, target.st.def, Math.random(), false), false);
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
    const d = this.play.derived;
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
    if (this.died || this.now < this.hurtUntil || this.buff("rollback")) return false;
    this.hurtUntil = this.now + HURT_IFRAME_MS;
    // 11/12 부재중 자동응답: 보호막이 먼저 받는다
    if (this.shield > 0 && this.buff("auto_reply")) {
      const take = Math.min(this.shield, dmg);
      this.shield -= take;
      dmg -= take;
      this.floatText(this.px, this.py - 22, `-${Math.round(take)}`, "#6ad0c8", 9);
      if (this.shield <= 0) this.buffs.delete("auto_reply");
      if (dmg <= 0) return false;
    }
    this.hp -= dmg;
    this.fx.playerHurt(this.px, this.py - 18, dmg);
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
      this.hp = Math.round(this.play.derived.maxHp * 0.5);
      this.buffs.set("rollback", { until: this.now + 2000, v: 1 });
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
    this.time.delayedCall(900, () => this.finish());
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
    if (Math.random() > hitChance(m.st.hit, this.play.derived.flee)) {
      this.floatText(this.px, this.py - 18, "회피", "#9aa3ad", 10);
      return;
    }
    this.hurtPlayer(damage(m.st.atk, mult, this.play.derived.def, Math.random(), false), { id: m.id, pat: m.cast?.id ?? "bite" });
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
    // 내 view.sync 다음에 (이름표 겹침 풀기가 내 위치를 쓴다). 같은 방 사람들은 멈춤·히트스톱과 상관없이 계속 움직인다
    this.presence?.update(performance.now(), this.cameras.main.worldView, 1 / this.cameras.main.zoom);
    if (this.presence) for (const r of this.presence.remotes.values()) this.ghost(r);
  }

  /**
   * 11/12 함께 사냥: 공간은 같이 쓰지만 스테이지(몬스터·전투)는 각자 → 다른 사람은 연하게, 머리 위에 "사냥 중".
   * 몸(시트에 그려진 꾸미기 포함)과 이름표만 연하게 한다. 이름이 바뀌어 다시 만들어진 아바타는 새 객체라 다시 붙는다
   */
  private ghost(r: RemoteAvatar): void {
    const v = r.view;
    if (v.sprite.alpha !== GHOST_ALPHA) v.sprite.setAlpha(GHOST_ALPHA);
    if (this.ghosted.has(r)) return;
    this.ghosted.add(r);
    v.setName(`사냥 중\n${r.name}`);
    v.label.setCenterAlign().setAlpha(0.75);
  }

  private step(delta: number): void {
    if (this.hitstop > 0 && !this.paused) {
      this.hitstop -= delta;
      return;
    }
    if (!this.tickCommon(delta)) return;
    const dt = Math.min(delta, 100) / 1000;
    const now = this.now;
    const d = this.play.derived;
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
    } else if (!aliveAll && !this.victoryAt && !this.died) {
      this.victoryAt = now + 1200;
      this.flash("모든 웨이브를 막아 냈어요!", 2000);
      this.sfx.play("victory");
    }
    if (this.victoryAt && now >= this.victoryAt) return this.finish();
    if (now >= this.limitMs && !this.died) {
      this.flash("시간이 다 됐어요", 1500);
      return this.finish();
    }

    // 재생·버프
    if (now >= this.regenAt) {
      this.regenAt = now + 1000;
      this.sp = Math.min(d.maxSp, this.sp + 1 + d.maxSp * 0.01);
      this.hp = Math.min(d.maxHp, this.hp + d.maxHp * 0.004);
      if (this.buff("overtime") && !this.died) this.hp = Math.max(1, this.hp - d.maxHp * SKILL_FX.overtime(1).hpDrainPct);
      const dinner = this.buffs.get("team_dinner_regen");
      if (dinner && dinner.until > now && !this.died) this.hp = Math.min(d.maxHp, this.hp + d.maxHp * dinner.v);
    }
    // 상태 이상: 끝난 것 정리 + 지속 피해 (무적이면 안 받고, 이걸로는 쓰러지지 않는다 — HP 1에서 멈춤)
    const sd = this.status.update(now, d.maxHp, this.movingNow);
    if (!this.died && !this.buff("rollback")) {
      for (const x of sd.dmg) {
        const before = this.hp;
        this.hp = Math.max(1, this.hp - x.amount);
        const lost = Math.round(before - this.hp);
        if (lost > 0) this.floatText(this.px + 6, this.py - 16, `-${lost}`, `#${STATUSES[x.id].color.toString(16).padStart(6, "0")}`, 8);
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
      const spd = moving ? d.move * (1 + this.buff("cache_hit")) * this.status.moveMul(now) * this.arena.speedMul(this.px, this.py) : 0;
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
    this.player.setAlpha(this.died ? 0.5 : this.buff("rollback") ? 0.55 + 0.3 * Math.sin(now / 60) : 1);
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
            const o = this.add.image(h.sprite.x, h.sprite.y, RTEX.spark).setDepth(1e4);
            this.tweens.add({ targets: o, x: t.x, y: t.y - 6, duration: 140, onComplete: () => o.destroy() });
            this.hurtMonster(t, damage(this.atk() * this.buff("pair_prog"), 1, t.st.def, Math.random(), false), false);
          }
        }
      }
    }

    this.updateTurret(now);

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
    const d = this.play.derived;
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
        const lv = this.play.skills[id] ?? 1;
        return left > 0 ? left / skillById(id)!.cooldownMs(lv) : 0;
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

  protected result(): HuntResult {
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
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const u = l2 > 0 ? Phaser.Math.Clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * u), py - (ay + vy * u));
}
