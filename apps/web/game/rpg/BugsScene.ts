import * as Phaser from "phaser";
import { BUG_SCORE, BUG_SLOTS, bugsPlan, type BugSpawn } from "@/lib/rpg/plan";
import type { BugsResult, RpgAction, RpgHud } from "@/lib/rpg/types";
import { RpgScene } from "./base";
import { ensureRpgTextures, RTEX } from "./sprites";

// 버그 잡기: 3×3 코드 창에서 튀어나오는 버그를 누른다. 초록 체크('그건 기능이에요')는 누르면 감점.
// 출현은 서버가 준 시드의 계획(bugsPlan)대로이고, DEX는 버그가 보이는 시간을, LUK는 황금 버그 확률을 조금 늘린다.

const COLS = 3;
const WIN_W = 76;
const WIN_H = 58;
const GAP = 6;
const AREA_W = COLS * WIN_W + (COLS - 1) * GAP;
const AREA_H = COLS * WIN_H + (COLS - 1) * GAP;
const SLOT_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC"];
const KEY_LABELS = ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"];
const LINE_COLORS = [0x6ad0c8, 0xc8a0e8, 0xffe39a, 0x9aa3ad, 0xe07a2a];

type Active = { s: BugSpawn; sprite: Phaser.GameObjects.Sprite; until: number; done: boolean };

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
  private combo = 0;
  private maxCombo = 0;
  private lastTick = 0;

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
    this.caught = this.golden = this.wrong = this.combo = this.maxCombo = 0;
    this.lastTick = 0;
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

  private fit(): void {
    const cam = this.cameras.main;
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
    for (let slot = 0; slot < BUG_SLOTS; slot++) {
      const p = slotPos(slot);
      if (x >= p.x - 2 && x <= p.x + WIN_W + 2 && y >= p.y - 2 && y <= p.y + WIN_H + 2) return this.press(slot);
    }
  }

  private press(slot: number): void {
    const a = this.active.find((b) => !b.done && b.s.slot === slot);
    const { x, y } = slotPos(slot);
    const cx = x + WIN_W / 2;
    const cy = y + WIN_H / 2 + 6;
    if (!a) {
      this.combo = 0;
      this.sfx.play("miss", 0.4);
      return;
    }
    a.done = true;
    if (a.s.kind === "feature") {
      this.wrong++;
      this.combo = 0;
      this.floatText(cx, cy - 8, `그건 기능이에요 ${BUG_SCORE.feature}`, "#ff6a6a", 11);
      this.cameras.main.shake(100, 0.004);
      this.sfx.play("miss");
      this.tweens.add({ targets: a.sprite, alpha: 0, duration: 200, onComplete: () => a.sprite.destroy() });
      return;
    }
    if (a.s.kind === "golden") this.golden++;
    else this.caught++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const pts = BUG_SCORE[a.s.kind];
    this.floatText(cx, cy - 8, this.combo >= 3 ? `+${pts} · ${this.combo}콤보` : `+${pts}`, a.s.kind === "golden" ? "#ffd04a" : "#f2ead3", a.s.kind === "golden" ? 14 : 12);
    this.sfx.play(a.s.kind === "golden" ? "coin-drop" : "hit", 0.7);
    const splat = this.add.image(a.sprite.x, a.sprite.y, RTEX.splat).setAlpha(0.8);
    this.tweens.add({ targets: splat, alpha: 0, duration: 600, onComplete: () => splat.destroy() });
    a.sprite.destroy();
  }

  update(_t: number, delta: number): void {
    if (!this.tickCommon(delta)) return;
    const now = this.elapsed;
    while (this.nextIdx < this.plan.length && this.plan[this.nextIdx].t <= now) {
      const s = this.plan[this.nextIdx++];
      const { x, y } = slotPos(s.slot);
      const tex = s.kind === "golden" ? RTEX.golden : s.kind === "feature" ? RTEX.feature : RTEX.bug;
      const sprite = this.add.sprite(x + WIN_W / 2 + (Math.random() - 0.5) * 30, y + WIN_H / 2 + 8, tex, 0).setScale(0.3);
      this.tweens.add({ targets: sprite, scale: 1.4, y: sprite.y - 6, duration: 140, ease: "Back.easeOut" });
      this.active.push({ s, sprite, until: s.t + s.lifeMs, done: false });
    }
    for (const a of this.active) {
      if (a.done) continue;
      a.sprite.setFrame(Math.floor(now / 140) % 2);
      if (now >= a.until) {
        a.done = true;
        if (a.s.kind !== "feature") {
          this.combo = 0;
          this.floatText(a.sprite.x, a.sprite.y - 8, "놓침", "#9aa3ad", 10);
        }
        const sp = a.sprite;
        this.tweens.add({ targets: sp, alpha: 0, scale: 0.4, duration: 160, onComplete: () => sp.destroy() });
      }
    }
    this.active = this.active.filter((a) => !a.done);
    const left = this.limitMs - now;
    if (left <= 5000 && Math.ceil(left / 1000) !== this.lastTick) {
      this.lastTick = Math.ceil(left / 1000);
      this.sfx.play("tick", 0.5);
    }
    if (now >= this.limitMs) {
      this.sfx.play("victory");
      this.finish();
    }
  }

  private score(): number {
    return Math.max(0, this.caught * BUG_SCORE.bug + this.golden * BUG_SCORE.golden + this.wrong * BUG_SCORE.feature + this.maxCombo * 2);
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
      maxCombo: this.maxCombo,
    };
  }
}
