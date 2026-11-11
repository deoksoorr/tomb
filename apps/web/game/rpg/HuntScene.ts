import * as Phaser from "phaser";
import { MONSTERS, potionById, POTION_COOLDOWN_MS, SKILL_FX, skillById, ZONES, type MonsterId, type SkillId } from "@/lib/rpg/catalog";
import { attackArea, damage, hitChance, inAttackArea, monsterStats, type AttackArea, type MonsterStats } from "@/lib/rpg/formulas";
import { huntPlan, WAVE_MAX_GAP_SEC, type HuntWave } from "@/lib/rpg/plan";
import type { HuntResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { DIR, STATE, type DirId } from "@tomb/protocol";
import { AvatarView } from "../entities/AvatarView";
import { RoomPresence } from "../net/RoomPresence";
import { RpgScene } from "./base";
import { avFrame, ensureFloor, ensureRpgTextures, makePlayer, RTEX } from "./sprites";

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
};

type Shot = { x: number; y: number; vx: number; vy: number; dmg: number; until: number; sprite: Phaser.GameObjects.Image };
type Obstacle = { x: number; y: number; r: number };

export class HuntScene extends RpgScene {
  private plan: HuntWave[] = [];
  private mons: Mon[] = [];
  private shots: Shot[] = [];
  private obstacles: Obstacle[] = [];
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

  constructor() {
    super("rpg-hunt");
  }

  create(): void {
    this.setupCommon();
    const play = this.play;
    const zone = ZONES[play.difficulty];
    ensureRpgTextures(this);
    makePlayer(this, this.data0.color, this.data0.look);
    this.plan = huntPlan(play.seed, play.difficulty);
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
    this.hp = play.derived.maxHp;
    this.sp = play.derived.maxSp;
    this.px = W / 2;
    this.py = H / 2;
    // 판 시간(elapsed) 기준 시각들: 씬 인스턴스는 판마다 재사용되고 elapsed는 0부터 다시 센다.
    // 안 지우면 지난 판 막바지의 커피 브레이크(rootUntil)가 다음 판의 이동·공격을 그 시각까지 막는다.
    this.rootUntil = 0;
    this.hurtUntil = 0;
    this.regenAt = 0;
    this.messageUntil = 0;
    this.gaugeFlashUntil = 0;
    this.face = { x: 0, y: 1 };
    this.dirRow = DIR_ROW.down;

    this.cameras.main.setBackgroundColor("#0e0d12");
    const floor = ensureFloor(this, play.difficulty, zone.floor[0], zone.floor[1], zone.deco, play.seed & 0xffff);
    this.add.tileSprite(0, 0, W, H, floor).setOrigin(0, 0).setDepth(-1000);
    const wallC = Phaser.Display.Color.IntegerToColor(zone.floor[0]).darken(40).color;
    for (const [x, y, w, h] of [
      [0, 0, W, WALL],
      [0, H - WALL, W, WALL],
      [0, 0, WALL, H],
      [W - WALL, 0, WALL, H],
    ])
      this.add.rectangle(x, y, w, h, wallC).setOrigin(0, 0).setDepth(-900);

    // 장애물: 사냥터마다 다른 소품
    const prop = play.difficulty === "easy" ? RTEX.desk : play.difficulty === "normal" ? RTEX.tree : RTEX.rock;
    this.obstacles = [];
    const rnd = new Phaser.Math.RandomDataGenerator([String(play.seed)]);
    for (let i = 0; i < 7; i++) {
      const x = rnd.between(50, W - 50);
      const y = rnd.between(50, H - 40);
      if (Math.hypot(x - W / 2, y - H / 2) < 60) continue;
      this.add.image(x, y, prop).setOrigin(0.5, 0.8).setDepth(y);
      this.obstacles.push({ x, y: y - 2, r: 9 });
    }

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
  private inArea(): Mon[] {
    return this.mons.filter((m) => m.alive && !m.hidden && inAttackArea(this.area, this.face, m.x - this.px, m.y - this.py, MONSTERS[m.id].size / 2));
  }

  /** press: 새로 누름 (쿨다운 중이면 버퍼에 한 번). false면 누르고 있는 동안의 자동 공격 */
  private attack(press: boolean): void {
    if (this.died) return;
    if (this.now < this.atkReadyAt || this.now < this.rootUntil) {
      if (press) this.atkBuffered = true;
      return;
    }
    this.atkBuffered = false;
    this.atkCdMs = 1000 / this.play.derived.aspd;
    this.atkReadyAt = this.now + this.atkCdMs;
    this.wasReady = false;
    let hits = this.inArea();
    if (!hits.length) {
      // 앞에 아무도 없으면 범위 안 가장 가까운 쪽으로 돌아서 친다
      const t = this.nearest(this.area.range);
      if (t) {
        this.setFace(t.x - this.px, t.y - this.py);
        hits = this.inArea();
      }
    }
    this.swing(this.area.range / 26);
    if (!hits.length) return this.sfx.play("miss", 0.4);
    hits.forEach((m, i) => this.strike(m, 1, false, i));
  }

  private swing(scale: number): void {
    const s = this.add
      .image(this.px + this.face.x * 10, this.py - 6 + this.face.y * 8, RTEX.slash)
      .setRotation(Math.atan2(this.face.y, this.face.x))
      .setScale(scale)
      .setDepth(this.py + 1)
      .setAlpha(0.95);
    this.tweens.add({ targets: s, alpha: 0, scale: scale * 1.25, duration: 160, onComplete: () => s.destroy() });
  }

  /** 명중·치명타 판정 후 피해. nth: 한 번에 여러 마리를 때릴 때 순번 (소리는 첫 마리만, 숫자는 조금씩 엇갈리게) */
  private strike(m: Mon, mult: number, sureHit = false, nth = 0): void {
    const d = this.play.derived;
    if (!sureHit && Math.random() > hitChance(d.hit, m.st.flee)) {
      this.floatText(m.x, m.y - 14, "빗나감", "#9aa3ad", 10);
      if (nth === 0) this.sfx.play("miss", 0.5);
      return;
    }
    const crit = Math.random() * 100 < d.crit + this.buff("debugging");
    const vuln = m.vulnUntil > this.now ? m.vuln : 0;
    const dmg = damage(this.atk(), mult, m.st.def, Math.random(), crit, vuln);
    this.hurtMonster(m, dmg, crit, nth);
  }

  private hurtMonster(m: Mon, dmg: number, crit: boolean, nth = 0): void {
    if (!m.alive) return;
    m.hp -= dmg;
    this.floatText(m.x + ((nth % 3) - 1) * 3, m.y - MONSTERS[m.id].size - (nth % 2) * 4, crit ? `${dmg}!` : String(dmg), crit ? "#ffd04a" : "#f2ead3", crit ? 14 : 12);
    if (nth === 0 || crit) this.sfx.play(crit ? "crit" : "hit", 0.6);
    m.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => m.alive && m.sprite.clearTint());
    // 넉백: 가벼울수록 멀리 (몸집 기준 무게), 우두머리는 거의 안 밀린다. 경직 동안은 움직이지도 때리지도 못한다
    const def = MONSTERS[m.id];
    const k = Math.hypot(m.x - this.px, m.y - this.py) || 1;
    const boss = def.behavior === "boss";
    const weight = boss ? 0.08 : Math.min(1.4, 13 / def.size);
    const power = (crit ? 230 : 150) * weight;
    m.kbx = ((m.x - this.px) / k) * power;
    m.kby = ((m.y - this.py) / k) * power;
    m.stunUntil = this.now + (boss ? 60 : crit ? 280 : 170);
    m.windUntil = Math.min(m.windUntil, this.now);
    m.dashUntil = Math.min(m.dashUntil, this.now);
    this.hitstop = Math.max(this.hitstop, crit ? 75 : 40);
    if (crit) this.cameras.main.shake(70, 0.003);
    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Mon): void {
    m.alive = false;
    this.kills[m.id] = (this.kills[m.id] ?? 0) + 1;
    this.killCount++;
    if (m.id !== "conflict_shard") this.waveAlive[m.wave]--;
    this.sfx.play("monster-die", 0.6);
    this.floatText(m.x, m.y - 6, `+${m.st.exp} EXP`, "#9ad07a", 10);
    m.bar.destroy();
    m.barBg.destroy();
    m.shadow.destroy();
    this.tweens.add({ targets: m.sprite, alpha: 0, scaleY: 0.2, duration: 260, onComplete: () => m.sprite.destroy() });
    if (MONSTERS[m.id].behavior === "split") {
      for (const s of [-1, 1]) this.spawn("conflict_shard", m.x + s * 8, m.y, m.wave);
    }
  }

  private useSkill(slot: number): void {
    const id = this.play.hotbar[slot];
    if (!id) return;
    const lv = this.play.skills[id] ?? 0;
    const def = skillById(id);
    if (!def || lv < 1) return;
    if ((this.skillReady[id] ?? 0) > this.now) return;
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
    }
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
    this.sfx.play("potion", 0.7);
  }

  private hurtPlayer(dmg: number): void {
    if (this.died || this.now < this.hurtUntil || this.buff("rollback")) return;
    this.hurtUntil = this.now + HURT_IFRAME_MS;
    this.hp -= dmg;
    this.floatText(this.px, this.py - 18, `-${dmg}`, "#ff6a6a", 12);
    this.player.setTintFill(0xff6a6a);
    this.time.delayedCall(90, () => this.player.clearTint());
    this.cameras.main.shake(90, 0.003);
    if (this.hp > 0) return;
    if (!this.cookieUsed && (this.play.potions.p_cookie ?? 0) > 0) {
      // 부활 쿠키: 자동으로 먹고 반쯤 회복, 잠깐 무적
      this.cookieUsed = true;
      this.potionsUsed.p_cookie = 1;
      this.hp = Math.round(this.play.derived.maxHp * 0.5);
      this.buffs.set("rollback", { until: this.now + 2000, v: 1 });
      this.flash("부활 쿠키를 먹고 다시 일어났어요", 2000);
      this.sfx.play("potion");
      this.ringFx(0xffe39a, 36);
      return;
    }
    this.hp = 0;
    this.died = true;
    this.sfx.play("defeat");
    this.flash("쓰러졌어요…", 1500);
    this.player.setAlpha(0.5);
    this.time.delayedCall(900, () => this.finish());
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

  private spawn(id: MonsterId, x: number, y: number, wave: number): void {
    const st = monsterStats(id, this.play.difficulty);
    const size = MONSTERS[id].size;
    const sprite = this.add.sprite(x, y, RTEX.monster(id), 0).setOrigin(0.5, 0.9).setAlpha(0);
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
    });
  }

  /** 가장자리에서 나에게서 충분히 먼 한 점 */
  private edgePoint(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let k = 0; k < 10; k++) {
      const edge = Math.floor(Math.random() * 4);
      x = edge === 0 ? 24 : edge === 1 ? W - 24 : 24 + Math.random() * (W - 48);
      y = edge === 2 ? 24 : edge === 3 ? H - 20 : 24 + Math.random() * (H - 44);
      if (Math.hypot(x - this.px, y - this.py) > 90) break;
    }
    return { x, y };
  }

  private spawnWave(): void {
    const w = this.plan[this.nextWave];
    this.lastWaveAt = this.now;
    this.waveAlive[w.index] = w.monsters.length;
    const solo = w.monsters.length - w.pack;
    w.monsters.forEach((id, i) => {
      if (i < solo) {
        const p = this.edgePoint();
        return this.spawn(id, p.x, p.y, w.index);
      }
      // 무리: 한 점 둘레에 모여서 나온다
      if (i === solo) this.packAt = this.edgePoint();
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 14;
      this.spawn(id, Phaser.Math.Clamp(this.packAt.x + Math.cos(a) * r, WALL + 10, W - WALL - 10), Phaser.Math.Clamp(this.packAt.y + Math.sin(a) * r, WALL + 14, H - WALL - 4), w.index);
    });
    this.nextWave++;
    this.flash(w.boss ? `마지막 웨이브 · ${MONSTERS[w.monsters[0]].name} 등장!` : w.pack ? `웨이브 ${w.index + 1} / ${this.plan.length} · ${MONSTERS[w.monsters[solo]].name} 무리!` : `웨이브 ${w.index + 1} / ${this.plan.length}`, 1600);
    if (w.boss || w.pack) this.sfx.play("tick");
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
  }

  private shoot(m: Mon, angle: number, speed: number, dmg: number, tex: string): void {
    const sprite = this.add.image(m.x, m.y - 8, tex).setDepth(1e4);
    this.shots.push({ x: m.x, y: m.y - 8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, until: this.now + 4000, sprite });
  }

  private monsterAttackRoll(m: Mon, mult = 1): void {
    if (Math.random() > hitChance(m.st.hit, this.play.derived.flee)) {
      this.floatText(this.px, this.py - 18, "회피", "#9aa3ad", 10);
      return;
    }
    this.hurtPlayer(damage(m.st.atk, mult, this.play.derived.def, Math.random(), false));
  }

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
        if (dist < 60) {
          mx = -mx;
          my = -my;
        } else if (dist < 90) spd = 0;
        if (now > m.nextThink) {
          m.nextThink = now + 1900;
          this.shoot(m, Math.atan2(dy, dx), 92, m.st.atk, RTEX.orb);
        }
        break;
      case "dash":
        if (now < m.windUntil) spd = 0;
        else if (now < m.dashUntil) {
          spd *= 4;
          mx = m.dx;
          my = m.dy;
        } else if (dist < 90 && now > m.nextThink) {
          m.windUntil = now + 480;
          m.dashUntil = now + 930;
          m.dx = dx / dist;
          m.dy = dy / dist;
          m.nextThink = now + 2200;
          m.sprite.setTint(0xffb040);
          this.time.delayedCall(480, () => m.alive && m.slowUntil < this.now && m.sprite.clearTint());
        }
        break;
      case "blink":
        if (now > m.nextThink && dist > 30) {
          m.nextThink = now + 2300 + Math.random() * 700;
          m.hidden = true;
          this.tweens.add({
            targets: m.sprite,
            alpha: 0.1,
            duration: 220,
            onComplete: () => {
              if (!m.alive) return;
              const a = Math.random() * Math.PI * 2;
              const r = 34 + Math.random() * 20;
              m.x = Phaser.Math.Clamp(this.px + Math.cos(a) * r, WALL + 10, W - WALL - 10);
              m.y = Phaser.Math.Clamp(this.py + Math.sin(a) * r, WALL + 14, H - WALL - 4);
              m.hidden = false;
              this.tweens.add({ targets: m.sprite, alpha: 0.85, duration: 220 });
            },
          });
        }
        if (m.hidden) spd = 0;
        break;
      case "explode":
        if (dist < 16) {
          // 터지면서 사라진다 (처치로 친다)
          this.ringFxAt(m.x, m.y, 0xe84040, 30);
          if (dist < 30) this.monsterAttackRoll(m, 1);
          this.cameras.main.shake(140, 0.006);
          this.killMonster(m);
          return;
        }
        break;
      case "boss":
        if (now > m.nextThink) {
          m.nextThink = now + 2600;
          const base = Math.atan2(dy, dx);
          const fan = this.play.difficulty === "hell" ? 3 : 2;
          for (let i = -fan; i <= fan; i++) this.shoot(m, base + i * 0.2, 100, Math.round(m.st.atk * 0.9), RTEX.fire);
          this.sfx.play("skill", 0.5);
        }
        if (dist < 22) spd = 0;
        break;
      default:
        break;
    }

    if (!m.hidden && touch && now > m.nextAtk && def.behavior !== "explode") {
      m.nextAtk = now + (def.behavior === "boss" ? 1250 : 800);
      this.monsterAttackRoll(m, def.behavior === "boss" ? 1.3 : 1);
    }
    if (touch && def.behavior !== "dash") spd = 0;
    this.moveMon(m, mx * spd * dt, my * spd * dt);
    for (const o of this.obstacles) this.pushOut(m, o, def.size / 2);
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

    // 웨이브
    const aliveAll = this.mons.some((m) => m.alive);
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
    }

    // 이동
    if (!this.died) {
      const a = this.axis();
      const moving = Math.hypot(a.x, a.y) > 0.15 && now >= this.rootUntil;
      if (moving) {
        const spd = d.move * (1 + this.buff("cache_hit"));
        this.px = Phaser.Math.Clamp(this.px + a.x * spd * dt, WALL + PLAYER_R, W - WALL - PLAYER_R);
        this.py = Phaser.Math.Clamp(this.py + a.y * spd * dt, WALL + PLAYER_R + 8, H - WALL - 2);
        const p = { x: this.px, y: this.py };
        for (const o of this.obstacles) this.pushOut(p, o, PLAYER_R);
        this.px = p.x;
        this.py = p.y;
        this.setFace(a.x, a.y);
        this.walkT += delta;
      }
      this.movingNow = moving;
      if (this.me) this.me.apply(moving ? "walk" : "idle", (this.dirRow as DirId) ?? DIR.down, this.time.now);
      else this.player.setFrame(avFrame(this.dirRow, moving ? 2 + (Math.floor(this.walkT / 120) % 4) : Math.floor(now / 500) % 2));
      // 버퍼에 한 번 있거나, 공격 키·마우스·손가락을 누르고 있으면 쿨다운이 끝나는 순간 친다
      const held = this.holdOn || this.keys.has("Space") || this.keys.has("KeyJ");
      if ((held || this.atkBuffered) && now >= this.atkReadyAt && now >= this.rootUntil) {
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
      const bob = Math.floor(now / 260 + m.x) % 2;
      m.sprite.setPosition(Math.round(m.x), Math.round(m.y)).setDepth(m.y).setFrame(bob).setFlipX(this.px < m.x);
      m.shadow.setPosition(m.x, m.y);
      const top = m.y - size - 3;
      m.barBg.setPosition(m.x, top).setVisible(m.hp < m.st.maxHp && !m.hidden);
      m.bar.setPosition(m.x - size / 2, top).setSize(Math.max(0, (size * m.hp) / m.st.maxHp), 2).setVisible(m.hp < m.st.maxHp && !m.hidden);
    }
    this.mons = this.mons.filter((m) => m.alive);
    this.separate();

    // 투사체
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.sprite.setPosition(s.x, s.y);
      if (Math.hypot(s.x - this.px, s.y - (this.py - 8)) < 8) {
        s.until = 0;
        this.hurtPlayer(damage(s.dmg, 1, d.def, Math.random(), false));
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
    const boss = this.mons.find((m) => m.alive && (MONSTERS[m.id].behavior === "boss" || (m.wave === this.plan.length - 1 && m.id === ZONES[this.play.difficulty].boss)));
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
