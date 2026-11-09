import * as Phaser from "phaser";
import { CONSTELLATIONS, comboMult, STAR_APPROACH, STAR_SCORE, starWindows, starsPlan, type StarNote } from "@/lib/rpg/plan";
import type { RpgAction, RpgHud, StarsResult } from "@/lib/rpg/types";
import { RpgScene } from "./base";
import { ensureRpgTextures, RTEX } from "./sprites";

// 별자리 잇기: 끝내지 못한 아이디어들이 밤하늘에 별로 떠오른다. 빛의 고리가 별에 닿는 순간 누르면 별이 켜지고,
// 앞 별과 금빛 선으로 이어진다. 한 무리를 다 이으면 별자리 이름이 잠깐 떠올랐다가 사라진다.
// 박자는 시드 계획(starsPlan)대로 — 서버는 같은 계획으로 판정 수의 상한을 검사한다.
// 어디를 눌러도 "다음 별"을 판정한다 (모바일에서 작은 별을 정확히 누를 필요가 없게). 너무 일찍 누르면 놓침.

const KEYS = new Set(["Space", "KeyJ", "KeyK", "KeyF", "Enter", "NumpadEnter"]);
/** 이만큼 일찍 누르면 그 별은 놓침 (마구 누르기 방지) */
const EARLY_MISS_MS = 260;
const RING_START = 26;
const RING_END = 5;

type Live = {
  n: StarNote;
  x: number;
  y: number;
  star: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  judged: "perfect" | "good" | "miss" | null;
};

export class StarsScene extends RpgScene {
  private plan: StarNote[] = [];
  private nextSpawn = 0;
  private live: Live[] = [];
  private groupObjs = new Map<number, Phaser.GameObjects.GameObject[]>();
  private lastHit = new Map<number, { x: number; y: number }>();
  private aw = 320;
  private ah = 200;
  private approach = 1200;
  private win: [number, number] = [60, 140];
  private perfect = 0;
  private good = 0;
  private miss = 0;
  private combo = 0;
  private maxCombo = 0;
  private points = 0;
  private judge: "perfect" | "good" | "miss" | undefined;
  private judgeUntil = 0;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super("rpg-stars");
  }

  create(): void {
    this.setupCommon();
    ensureRpgTextures(this);
    this.textures.get(RTEX.glow).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const cam = this.cameras.main;
    // 화면 비율에 맞춰 하늘 크기를 정한다 (세로 화면은 세로로 긴 하늘)
    const portrait = cam.height > cam.width * 1.1;
    this.aw = portrait ? 210 : 320;
    this.ah = portrait ? 300 : 200;
    this.plan = starsPlan(this.play.seed, this.play.difficulty, this.play.timeLimitSec);
    this.approach = STAR_APPROACH[this.play.difficulty];
    this.win = starWindows(this.play.difficulty, this.play.derived.stats.dex);
    this.nextSpawn = 0;
    this.live = [];
    this.groupObjs.clear();
    this.lastHit.clear();
    this.perfect = this.good = this.miss = this.combo = this.maxCombo = this.points = 0;
    this.judge = undefined;
    cam.setBackgroundColor("#070812");
    this.fit();
    this.drawSky();
    this.burst = this.add.particles(0, 0, RTEX.dust, {
      lifespan: { min: 450, max: 900 },
      speed: { min: 12, max: 48 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.burst.setDepth(50);
  }

  private fit(): void {
    const cam = this.cameras.main;
    const z = Math.max(1, Math.floor(Math.min(cam.width / (this.aw + 8), (cam.height - 120) / (this.ah + 8)) * 4) / 4);
    cam.setZoom(z);
    cam.centerOn(this.aw / 2, this.ah / 2 + 4);
  }

  protected onResize(): void {
    this.fit();
    for (const o of this.children.list) if (o instanceof Phaser.GameObjects.Text) o.setScale(1 / this.cameras.main.zoom);
  }

  /** 밤하늘: 위가 깊고 아래가 옅은 그라데이션, 은하수 띠, 반짝이는 먼 별, 아래 언덕과 묘비 실루엣 */
  private drawSky(): void {
    const { aw, ah } = this;
    const key = `rpg-sky-${aw}x${ah}`;
    if (!this.textures.exists(key)) {
      const c = document.createElement("canvas");
      c.width = aw;
      c.height = ah;
      const ctx = c.getContext("2d")!;
      const gr = ctx.createLinearGradient(0, 0, 0, ah);
      gr.addColorStop(0, "#080a1c");
      gr.addColorStop(0.6, "#121634");
      gr.addColorStop(1, "#262046");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, aw, ah);
      this.textures.addCanvas(key, c);
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-100);
    // 은하수
    const rnd = new Phaser.Math.RandomDataGenerator([String(this.play.seed)]);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      this.add
        .image(aw * (0.1 + 0.8 * t), ah * (0.85 - 0.7 * t) + rnd.between(-10, 10), RTEX.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x6a7ad0)
        .setAlpha(0.08 + rnd.frac() * 0.06)
        .setScale(1.6 + rnd.frac())
        .setDepth(-90);
    }
    // 먼 별 (천천히 깜빡인다)
    for (let i = 0; i < 70; i++) {
      const d = this.add
        .image(rnd.between(2, aw - 2), rnd.between(2, Math.floor(ah * 0.85)), RTEX.dust)
        .setAlpha(0.15 + rnd.frac() * 0.5)
        .setScale(rnd.frac() < 0.15 ? 1 : 0.5)
        .setDepth(-80);
      if (!this.data0.reduced)
        this.tweens.add({ targets: d, alpha: 0.05, duration: 900 + rnd.between(0, 2400), yoyo: true, repeat: -1, delay: rnd.between(0, 2000) });
    }
    // 달
    this.add.image(aw * 0.84, ah * 0.16, RTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff0c8).setAlpha(0.35).setScale(0.9).setDepth(-70);
    this.add.circle(aw * 0.84, ah * 0.16, 6, 0xf2ead3).setDepth(-69);
    this.add.circle(aw * 0.84 + 2.5, ah * 0.16 - 1.5, 5.4, 0x10132c).setDepth(-68);
    // 언덕과 묘비 실루엣
    const g = this.add.graphics().setDepth(-60);
    g.fillStyle(0x0a0b16, 1);
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, ah)];
    for (let x = 0; x <= aw; x += 8) pts.push(new Phaser.Math.Vector2(x, ah - 14 - Math.sin(x / 37) * 5 - Math.sin(x / 13) * 1.5));
    pts.push(new Phaser.Math.Vector2(aw, ah));
    g.fillPoints(pts, true);
    for (let i = 0; i < 6; i++) {
      const x = rnd.between(10, aw - 10);
      const y = ah - 16 - Math.sin(x / 37) * 5;
      g.fillRect(x - 3, y - 7, 6, 8);
      g.fillCircle(x, y - 7, 3);
    }
  }

  // ── 입력 ──

  protected onKey(code: string): void {
    if (KEYS.has(code)) this.press();
  }

  protected onAction(a: RpgAction): void {
    if (a.kind === "attack" || a.kind === "slot") this.press();
  }

  protected onTap(): void {
    this.press();
  }

  private press(): void {
    const now = this.elapsed;
    const next = this.live.find((l) => !l.judged);
    if (!next) return;
    const dt = now - next.n.t;
    if (Math.abs(dt) <= this.win[1]) this.hit(next, Math.abs(dt) <= this.win[0] ? "perfect" : "good");
    else if (dt < 0 && dt > -EARLY_MISS_MS) this.fail(next, "너무 일찍");
  }

  // ── 판정 ──

  private hit(l: Live, j: "perfect" | "good"): void {
    l.judged = j;
    if (j === "perfect") this.perfect++;
    else this.good++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = comboMult(this.combo);
    this.points += Math.round(STAR_SCORE[j] * mult);
    this.setJudge(j);
    this.sfx.chime(l.n.idx + (l.n.group % 3), j === "perfect");
    l.ring.destroy();
    l.star.setAlpha(1).setTint(j === "perfect" ? 0xfff3c8 : 0xc8dcff);
    this.tweens.add({ targets: l.star, scale: { from: 1.8, to: 1.1 }, duration: 260, ease: "Quad.easeOut" });
    l.glow.setAlpha(j === "perfect" ? 0.55 : 0.35);
    this.tweens.add({ targets: l.glow, scale: { from: 0.9, to: 0.45 }, duration: 500 });
    this.burst.explode(j === "perfect" ? 14 : 7, l.x, l.y);
    this.floatText(l.x, l.y - 8, j === "perfect" ? (mult > 1 ? `완벽 ×${mult}` : "완벽") : "좋아", j === "perfect" ? "#ffe39a" : "#bcd0f0", 11);
    // 같은 별자리의 앞 별과 금빛 선으로 잇는다
    const prev = this.lastHit.get(l.n.group);
    if (prev) {
      const line = this.add.graphics().setDepth(5).setAlpha(0);
      line.lineStyle(1, 0xffe39a, 0.7).lineBetween(prev.x, prev.y, l.x, l.y);
      this.tweens.add({ targets: line, alpha: 1, duration: 220 });
      this.track(l.n.group, line);
    }
    this.lastHit.set(l.n.group, { x: l.x, y: l.y });
    this.afterJudge(l);
  }

  private fail(l: Live, why = "놓침"): void {
    l.judged = "miss";
    this.miss++;
    this.combo = 0;
    this.setJudge("miss");
    this.sfx.play("miss", 0.3);
    l.ring.destroy();
    l.star.setTint(0x50546a).setAlpha(0.45);
    l.glow.setAlpha(0);
    this.floatText(l.x, l.y - 8, why, "#7a7f90", 10);
    // 끊긴 자리부터 다시 잇는다
    this.lastHit.delete(l.n.group);
    this.afterJudge(l);
  }

  private setJudge(j: "perfect" | "good" | "miss"): void {
    this.judge = j;
    this.judgeUntil = this.elapsed + 500;
  }

  private track(group: number, o: Phaser.GameObjects.GameObject): void {
    const arr = this.groupObjs.get(group) ?? [];
    arr.push(o);
    this.groupObjs.set(group, arr);
  }

  /** 무리의 마지막 별이 판정되면 별자리 이름을 띄우고 천천히 지운다 */
  private afterJudge(l: Live): void {
    const g = l.n.group;
    const members = this.plan.filter((n) => n.group === g);
    if (l.n.idx !== members.length - 1) return;
    const lives = this.live.filter((x) => x.n.group === g);
    const hits = lives.filter((x) => x.judged === "perfect" || x.judged === "good").length;
    const objs = this.groupObjs.get(g) ?? [];
    if (hits >= Math.ceil(members.length * 0.6)) {
      const cx = lives.reduce((a, x) => a + x.x, 0) / lives.length;
      const cy = Math.min(...lives.map((x) => x.y)) - 10;
      const name = this.label(Phaser.Math.Clamp(cx, 40, this.aw - 40), Math.max(14, cy), CONSTELLATIONS[(g + this.play.seed) % CONSTELLATIONS.length], "#ffe39a", 11)
        .setAlpha(0)
        .setDepth(60);
      this.tweens.add({ targets: name, alpha: 1, duration: 400 });
      objs.push(name);
      this.sfx.play("coin-drop", 0.35);
      for (const x of lives) if (x.judged !== "miss") this.tweens.add({ targets: x.glow, alpha: 0.7, scale: 0.7, duration: 300, yoyo: true });
    }
    const all = [...objs, ...lives.flatMap((x) => [x.star, x.glow])];
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: all, alpha: 0, duration: 900, onComplete: () => all.forEach((o) => o.destroy()) });
      this.live = this.live.filter((x) => x.n.group !== g);
      this.groupObjs.delete(g);
    });
  }

  // ── 매 프레임 ──

  update(_t: number, delta: number): void {
    if (!this.tickCommon(delta)) return;
    const now = this.elapsed;
    while (this.nextSpawn < this.plan.length && this.plan[this.nextSpawn].t - this.approach <= now) {
      const n = this.plan[this.nextSpawn++];
      const x = 12 + n.x * (this.aw - 24);
      const y = 12 + n.y * (this.ah - 40);
      const glow = this.add.image(x, y, RTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd890).setAlpha(0.12).setScale(0.35).setDepth(8);
      const star = this.add.image(x, y, RTEX.star).setAlpha(0).setDepth(10);
      const ring = this.add.image(x, y, RTEX.ring).setTint(0xbcd0f0).setAlpha(0).setScale(RING_START / 32).setDepth(12);
      this.tweens.add({ targets: star, alpha: 0.6, duration: 300 });
      this.live.push({ n, x, y, star, ring, glow, judged: null });
    }
    for (const l of this.live) {
      if (l.judged) continue;
      const p = Phaser.Math.Clamp(1 - (l.n.t - now) / this.approach, 0, 1);
      l.ring.setScale((RING_START + (RING_END - RING_START) * p) / 32).setAlpha(0.25 + 0.65 * p);
      if (now - l.n.t > this.win[1]) this.fail(l);
    }
    const last = this.plan[this.plan.length - 1];
    const done = this.nextSpawn >= this.plan.length && this.live.every((l) => l.judged) && (!last || now > last.t + 1500);
    if (now >= this.limitMs || done) {
      this.sfx.play("victory", 0.6);
      this.finish();
    }
  }

  protected hud(): RpgHud {
    return {
      game: "stars",
      hp: 0,
      maxHp: 0,
      sp: 0,
      maxSp: 0,
      leftMs: Math.max(0, this.limitMs - this.elapsed),
      score: this.points,
      combo: this.combo,
      kills: this.perfect + this.good,
      judge: this.elapsed < this.judgeUntil ? this.judge : undefined,
      cooldowns: [],
      potionCooldown: 0,
      potions: {},
      buffs: [],
      boss: null,
    };
  }

  protected result(): StarsResult {
    return {
      game: "stars",
      durationMs: Math.round(this.elapsed),
      perfect: this.perfect,
      good: this.good,
      miss: this.miss,
      maxCombo: this.maxCombo,
      score: this.points,
    };
  }
}
