import * as Phaser from "phaser";
import { BUG_SCORE, BUG_SLOTS, bugsPlan, comboMult, type BugSpawn } from "@/lib/rpg/plan";
import type { BugsResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { bridge } from "../bridge";
import { RpgScene } from "./base";
import { MeadowStage } from "./meadowStage";
import { ensureRpgTextures, RTEX } from "./sprites";

// 벌레 잡기: 3×3 창에서 튀어나오는 벌레를 누른다. 초록 체크는 누르면 감점.
// 출현은 서버가 준 시드의 계획(bugsPlan)대로이고, DEX는 버그가 보이는 시간을, LUK는 황금 버그 확률을 조금 늘린다.
// play.theme === "meadow"(32번 곤충 채집, 마을 수풀에서): 같은 규칙에 들판 한 장·덤불 9개·날아와 앉는 곤충으로 (meadowStage.ts).
//  그림·연출·소리는 MeadowStage가, 출현·판정·점수는 여기가 그대로 맡는다. 시작 전 "준비 → 시작!"(게임 시간은 흐르지 않음),
//  끝나면 "끝!"을 잠깐 보이고 낸다.

const COLS = 3;
const WIN_W = 76;
const WIN_H = 58;
const GAP = 6;
const AREA_W = COLS * WIN_W + (COLS - 1) * GAP;
const AREA_H = COLS * WIN_H + (COLS - 1) * GAP;
const SLOT_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC"];
const KEY_LABELS = ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"];
const LINE_COLORS = [0x6ad0c8, 0xc8a0e8, 0xffe39a, 0x9aa3ad, 0xe07a2a];

/** sprite: 옛 사냥터 그림일 때만 (들판은 MeadowStage가 곤충을 그린다) */
type Active = { s: BugSpawn; sprite: Phaser.GameObjects.Sprite | null; until: number; done: boolean };
/** 들판: 시작 글자 시간 (준비 → 시작!) · 끝 글자를 보이는 시간 (ms) */
const INTRO_MS = 1300;
const GO_AT_MS = 650;
const OUTRO_MS = 750;

const slotPos = (slot: number) => {
  const c = slot % COLS;
  const r = Math.floor(slot / COLS);
  return { x: c * (WIN_W + GAP), y: r * (WIN_H + GAP) };
};

export class BugsScene extends RpgScene {
  private plan: BugSpawn[] = [];
  private nextIdx = 0;
  private active: Active[] = [];
  private caught = 0;
  private golden = 0;
  private wrong = 0;
  private decoy = 0;
  /** 콤보 배수까지 넣은 점수 */
  private points = 0;
  private combo = 0;
  private maxCombo = 0;
  private lastTick = 0;
  private meadow = false;
  private stage: MeadowStage | null = null;
  /** 들판: 남은 시작 시간 / 끝 글자 남은 시간 (-1 = 아직 아님) */
  private intro = 0;
  private outro = -1;

  constructor() {
    super("rpg-bugs");
  }

  create(): void {
    this.setupCommon();
    ensureRpgTextures(this);
    const st = this.play.derived.stats;
    this.plan = bugsPlan(this.play.seed, this.play.difficulty, this.play.timeLimitSec, { dex: st.dex, luk: st.luk });
    this.nextIdx = 0;
    this.active = [];
    this.caught = this.golden = this.wrong = this.decoy = this.combo = this.maxCombo = this.points = 0;
    this.lastTick = 0;
    this.meadow = this.play.theme === "meadow";
    this.stage = null;
    this.intro = 0;
    this.outro = -1;
    if (this.meadow) {
      this.createMeadow();
      this.fit();
      return;
    }
    this.cameras.main.setBackgroundColor("#0e0d12");

    const rnd = new Phaser.Math.RandomDataGenerator([String(this.play.seed)]);
    for (let slot = 0; slot < BUG_SLOTS; slot++) {
      const { x, y } = slotPos(slot);
      this.add.rectangle(x, y, WIN_W, WIN_H, 0x1a1c22).setOrigin(0, 0).setStrokeStyle(1, 0x3a3f4a);
      this.add.rectangle(x, y, WIN_W, 8, 0x2a2e36).setOrigin(0, 0);
      for (let i = 0; i < 3; i++) this.add.rectangle(x + 4 + i * 5, y + 4, 3, 3, [0xc83c3c, 0xe8b830, 0x40a050][i]);
      for (let l = 0; l < 6; l++) {
        const indent = rnd.between(0, 3) * 4;
        let lx = x + 6 + indent;
        const ly = y + 12 + l * 7;
        this.add.rectangle(x + 2, ly, 2, 2, 0x4a4f58).setOrigin(0, 0);
        for (let k = 0; k < rnd.between(1, 3) && lx < x + WIN_W - 10; k++) {
          const w = rnd.between(6, 20);
          this.add.rectangle(lx, ly, Math.min(w, x + WIN_W - 4 - lx), 2, rnd.pick(LINE_COLORS), 0.7).setOrigin(0, 0);
          lx += w + 3;
        }
      }
      this.label(x + WIN_W - 7, y + WIN_H - 1, KEY_LABELS[slot], "#6a6e78", 10).setAlpha(0.8);
    }
    this.fit();
  }

  /** 곤충 채집: 들판 한 장 (시간대는 서버가 준 한국 시각 시간대, 없으면 밤 여부로) */
  private createMeadow(): void {
    const tone = this.play.tone ?? (this.play.night ? "night" : "day");
    this.stage = new MeadowStage(this, this.sfx, tone, this.data0.reduced, {
      label: (x, y, text, color, px) => this.label(x, y, text, color, px),
      float: (x, y, text, color, px) => this.floatText(x, y, text, color, px),
    });
    this.stage.build();
    this.intro = INTRO_MS;
  }

  private fit(): void {
    const cam = this.cameras.main;
    if (this.stage) {
      const z = this.stage.fit();
      for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Text) o.setScale(1 / z);
      return;
    }
    // 작은 화면에선 0.25 단위까지 키운다 (칸이 손가락보다 작아지지 않게)
    const z = Math.max(1, Math.floor(Math.min(cam.width / (AREA_W + 8), (cam.height - 150) / (AREA_H + 8)) * 4) / 4);
    cam.setZoom(z);
    cam.centerOn(AREA_W / 2, AREA_H / 2 + 4);
    for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Text) o.setScale(1 / z);
  }

  protected onResize(): void {
    this.fit();
  }

  protected onKey(code: string): void {
    const i = SLOT_KEYS.indexOf(code);
    if (i >= 0) this.press(i);
  }

  protected onAction(a: RpgAction): void {
    if (a.kind === "slot") this.press(a.slot);
  }

  protected onTap(x: number, y: number): void {
    if (this.stage) {
      const slot = this.stage.slotAt(x, y);
      if (slot >= 0) this.press(slot);
      return;
    }
    for (let slot = 0; slot < BUG_SLOTS; slot++) {
      const p = slotPos(slot);
      if (x >= p.x - 2 && x <= p.x + WIN_W + 2 && y >= p.y - 2 && y <= p.y + WIN_H + 2) return this.press(slot);
    }
  }

  private press(slot: number): void {
    // 들판: 시작 글자·끝 글자 동안은 누르지 않는다
    if (this.stage && (this.intro > 0 || this.outro >= 0)) return;
    const a = this.active.find((b) => !b.done && b.s.slot === slot);
    const { x, y } = slotPos(slot);
    const cx = x + WIN_W / 2;
    const cy = y + WIN_H / 2 + 6;
    if (!a) {
      this.combo = 0;
      if (this.stage) this.stage.whiff(slot);
      else this.sfx.play("miss", 0.4);
      return;
    }
    a.done = true;
    if (a.s.kind === "feature" || a.s.kind === "decoy") {
      if (a.s.kind === "feature") this.wrong++;
      else this.decoy++;
      this.points += BUG_SCORE[a.s.kind];
      this.combo = 0;
      if (this.stage) {
        this.stage.wrong(a.s, BUG_SCORE[a.s.kind]);
        return;
      }
      const sprite = a.sprite!;
      const warn = a.s.kind === "feature" ? "체크는 잡지 마세요" : "이미 잡은 벌레";
      this.floatText(cx, cy - 8, `${warn} ${a.s.kind === "feature" ? BUG_SCORE.feature : BUG_SCORE.decoy}`, "#ff6a6a", 11);
      this.cameras.main.shake(100, 0.004);
      this.sfx.play("miss");
      this.tweens.add({ targets: sprite, alpha: 0, duration: 200, onComplete: () => sprite.destroy() });
      return;
    }
    if (a.s.kind === "golden") this.golden++;
    else this.caught++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = comboMult(this.combo);
    const pts = Math.round(BUG_SCORE[a.s.kind] * mult);
    this.points += pts;
    if (this.stage) {
      this.stage.caught(a.s, pts, mult, this.combo);
      return;
    }
    const sprite = a.sprite!;
    this.floatText(cx, cy - 8, mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, a.s.kind === "golden" ? "#ffd04a" : "#f2ead3", a.s.kind === "golden" ? 14 : 12);
    this.sfx.play(a.s.kind === "golden" ? "coin-drop" : "hit", 0.7);
    const splat = this.add.image(sprite.x, sprite.y, RTEX.splat).setAlpha(0.8);
    this.tweens.add({ targets: splat, alpha: 0, duration: 600, onComplete: () => splat.destroy() });
    sprite.destroy();
  }

  /** 들판: 시작 글자 → 판 → 끝 글자. false면 이번 프레임은 판을 돌리지 않는다 */
  private meadowGate(stage: MeadowStage, delta: number): boolean {
    if (this.ended || this.paused) return false;
    const dt = Math.min(delta, 100);
    if (this.intro > 0) {
      // 게임 시계는 멈춘 채 (출현 계획 0초 = "시작!" 뒤)
      if (this.intro === INTRO_MS) {
        bridge.emit("rpg:hud", this.hud());
        stage.banner("ready");
      }
      const before = this.intro;
      this.intro = Math.max(0, this.intro - dt);
      if (before > INTRO_MS - GO_AT_MS && this.intro <= INTRO_MS - GO_AT_MS) stage.banner("go");
      stage.update(this.elapsed, dt);
      return false;
    }
    if (this.outro >= 0) {
      this.outro -= dt;
      stage.update(this.elapsed, dt);
      if (this.outro < 0) this.finish();
      return false;
    }
    return true;
  }

  update(_t: number, delta: number): void {
    const stage = this.stage;
    if (stage && !this.meadowGate(stage, delta)) return;
    if (!this.tickCommon(delta)) return;
    const now = this.elapsed;
    while (this.nextIdx < this.plan.length && this.plan[this.nextIdx].t <= now) {
      const s = this.plan[this.nextIdx++];
      if (stage) {
        stage.spawn(s, now);
        this.active.push({ s, sprite: null, until: s.t + s.lifeMs, done: false });
        continue;
      }
      const { x, y } = slotPos(s.slot);
      const tex = s.kind === "golden" ? RTEX.golden : s.kind === "feature" ? RTEX.feature : s.kind === "decoy" ? RTEX.decoy : RTEX.bug;
      const sprite = this.add.sprite(x + WIN_W / 2 + (Math.random() - 0.5) * 30, y + WIN_H / 2 + 8, tex, 0).setScale(0.3);
      this.tweens.add({ targets: sprite, scale: 1.4, y: sprite.y - 6, duration: 140, ease: "Back.easeOut" });
      this.active.push({ s, sprite, until: s.t + s.lifeMs, done: false });
    }
    for (const a of this.active) {
      if (a.done) continue;
      const missed = a.s.kind === "bug" || a.s.kind === "golden";
      if (stage) {
        if (now >= a.until) {
          a.done = true;
          if (missed) this.combo = 0;
          stage.escape(a.s, missed);
        }
        continue;
      }
      const sp = a.sprite!;
      sp.setFrame(Math.floor(now / 140) % 2);
      if (now >= a.until) {
        a.done = true;
        if (missed) {
          this.combo = 0;
          this.floatText(sp.x, sp.y - 8, "놓침", "#9aa3ad", 10);
        }
        this.tweens.add({ targets: sp, alpha: 0, scale: 0.4, duration: 160, onComplete: () => sp.destroy() });
      }
    }
    this.active = this.active.filter((a) => !a.done);
    stage?.update(now, Math.min(delta, 100));
    const left = this.limitMs - now;
    if (left <= 5000 && Math.ceil(left / 1000) !== this.lastTick) {
      this.lastTick = Math.ceil(left / 1000);
      this.sfx.play("tick", 0.5);
    }
    if (now >= this.limitMs) {
      if (stage) {
        // 끝 글자를 잠깐 보이고 낸다 (게임 시계는 여기서 멈춘다)
        bridge.emit("rpg:hud", this.hud());
        stage.finish();
        stage.banner("end");
        this.outro = OUTRO_MS;
        return;
      }
      this.sfx.play("victory");
      this.finish();
    }
  }

  private score(): number {
    return Math.max(0, this.points);
  }

  protected hud(): RpgHud {
    return {
      game: "bugs",
      hp: 0,
      maxHp: 0,
      sp: 0,
      maxSp: 0,
      leftMs: Math.max(0, this.limitMs - this.elapsed),
      score: this.score(),
      combo: this.combo,
      kills: this.caught + this.golden,
      cooldowns: [],
      potionCooldown: 0,
      potions: {},
      buffs: [],
      boss: null,
    };
  }

  protected result(): BugsResult {
    return {
      game: "bugs",
      durationMs: Math.round(this.elapsed),
      caught: this.caught,
      golden: this.golden,
      wrong: this.wrong,
      decoy: this.decoy,
      score: this.score(),
      maxCombo: this.maxCombo,
    };
  }
}
