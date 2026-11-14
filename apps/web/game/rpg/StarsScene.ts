import * as Phaser from "phaser";
import { constellationById, type Constellation } from "@/lib/rpg/constellations";
import { comboMult, STAR_APPROACH, STAR_SCORE, starGroups, starWindows, starsPlan, type StarGroup, type StarNote } from "@/lib/rpg/plan";
import type { RpgAction, RpgHud, StarsResult } from "@/lib/rpg/types";
import { hash2 } from "../sprites/pixel";
import { RpgScene } from "./base";
import { artColor, artSegments, ensureStarTextures, STEX, type Seg } from "./starArt";
import { StarSfx } from "./starSound";
import { ensureRpgTextures, RTEX } from "./sprites";

// 별자리 잇기: 끝내지 못한 다짐들이 망원경 속 밤하늘에 별로 떠오른다. 빛의 고리가 별에 닿는 순간 누르면 별이 번쩍 켜지고,
// 앞 별과 빛이 흐르는 선으로 이어진다. 한 무리(별자리)를 하나도 놓치지 않고 다 이으면 그 별자리 그림이 떠올랐다 사라지며
// 이름과 (처음이면) "도감 등록!" — 등록은 서버가 결과의 완성 목록을 계획·시간·판정 수로 검사한 뒤에 한다.
// 박자는 시드 계획(starsPlan)대로 — 서버는 같은 계획으로 판정 수의 상한을 검사한다. 별자리 모양은 화면 비율을 지키며 펼친다.
// 어디를 눌러도 "다음 별"을 판정한다 (모바일에서 작은 별을 정확히 누를 필요가 없게). 너무 일찍 누르면 놓침.

const KEYS = new Set(["Space", "KeyJ", "KeyK", "KeyF", "Enter", "NumpadEnter"]);
/** 이만큼 일찍 누르면 그 별은 놓침 (마구 누르기 방지) */
const EARLY_MISS_MS = 260;
const RING_START = 26;
const RING_END = 5;
/** 무리가 끝난 뒤 별·선·그림이 남아 있는 시간 (완성했으면 조금 더) */
const LINGER_MS = 1500;
const LINGER_DONE_MS = 2300;
/** 완성 그림을 그어 나가는 시간 */
const ART_DRAW_MS = 700;

type Judge = "perfect" | "good" | "miss";
type Live = {
  n: StarNote;
  x: number;
  y: number;
  star: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  judged: Judge | null;
};
/** 무리마다: 화면 자리(가운데·한 변), 놓친 별이 있는지, 완벽으로만 이었는지, 함께 사라질 것들 */
type GroupView = {
  info: StarGroup;
  con: Constellation;
  cx: number;
  cy: number;
  size: number;
  hits: number;
  broken: boolean;
  flawless: boolean;
  objs: Phaser.GameObjects.GameObject[];
};

export class StarsScene extends RpgScene {
  private plan: StarNote[] = [];
  private groups: StarGroup[] = [];
  private views = new Map<number, GroupView>();
  private nextSpawn = 0;
  private live: Live[] = [];
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
  private judge: Judge | undefined;
  private judgeUntil = 0;
  /** 이번 판에 완성한 무리 · 그중 완벽으로만 이은 무리 */
  private doneGroups: number[] = [];
  private perfectGroups: number[] = [];
  /** 도감에 이미 있는 별자리 + 이번 판에 처음 완성한 것 ("도감 등록!"은 한 번만) */
  private known = new Set<string>();
  private lastName: string | null = null;
  private reduced = false;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snd!: StarSfx;

  constructor() {
    super("rpg-stars");
  }

  create(): void {
    this.setupCommon();
    this.snd = new StarSfx();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.snd.destroy());
    ensureRpgTextures(this);
    this.textures.get(RTEX.glow).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const cam = this.cameras.main;
    // 화면 비율에 맞춰 하늘 크기를 정한다 (세로 화면은 세로로 긴 하늘)
    const portrait = cam.height > cam.width * 1.1;
    this.aw = portrait ? 210 : 320;
    this.ah = portrait ? 300 : 200;
    ensureStarTextures(this, this.aw, this.ah);
    this.reduced = this.data0.reduced;
    this.plan = starsPlan(this.play.seed, this.play.difficulty, this.play.timeLimitSec, !!this.play.starry);
    this.groups = starGroups(this.plan);
    this.approach = STAR_APPROACH[this.play.difficulty];
    this.win = starWindows(this.play.difficulty, this.play.derived.stats.dex);
    this.nextSpawn = 0;
    this.live = [];
    this.views.clear();
    this.lastHit.clear();
    this.perfect = this.good = this.miss = this.combo = this.maxCombo = this.points = 0;
    this.judge = undefined;
    this.doneGroups = [];
    this.perfectGroups = [];
    this.known = new Set(this.play.starsKnown ?? []);
    this.lastName = null;
    cam.setBackgroundColor("#04050c");
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
    // 가끔 별똥별 (동작 줄이기면 없음)
    if (!this.reduced) this.time.addEvent({ delay: 4200, loop: true, callback: () => Math.random() < 0.55 && this.shootingStar() });
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

  /** 망원경 속 밤하늘: 구워 둔 하늘(은하수·별밭) + 깜빡이는 별 몇 개 + 달 + 언덕·묘비 실루엣 + 망원경 테 */
  private drawSky(): void {
    const { aw, ah } = this;
    this.add.image(0, 0, STEX.sky(aw, ah)).setOrigin(0, 0).setDepth(-100);
    const rnd = new Phaser.Math.RandomDataGenerator([String(this.play.seed)]);
    // 깜빡이는 가까운 별 (구워 둔 별밭 위에 몇 개만 — 트윈 수를 적게)
    for (let i = 0; i < (this.reduced ? 8 : 18); i++) {
      const d = this.add
        .image(rnd.between(6, aw - 6), rnd.between(6, Math.floor(ah * 0.8)), STEX.spark)
        .setAlpha(0.25 + rnd.frac() * 0.4)
        .setScale(rnd.frac() < 0.3 ? 0.7 : 0.45)
        .setTint(rnd.pick([0xffffff, 0xc8d8ff, 0xffe2b0]))
        .setDepth(-80);
      if (!this.reduced)
        this.tweens.add({ targets: d, alpha: 0.05, duration: 1100 + rnd.between(0, 2400), yoyo: true, repeat: -1, delay: rnd.between(0, 2000) });
    }
    // 달
    const mx = aw * 0.86;
    const my = ah * 0.13;
    this.add.image(mx, my, RTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff0c8).setAlpha(0.3).setScale(0.8).setDepth(-70);
    this.add.circle(mx, my, 6, 0xf2ead3).setDepth(-69);
    this.add.circle(mx + 2.5, my - 1.5, 5.4, 0x0b0e26).setDepth(-68);
    // 언덕과 묘비 실루엣
    const g = this.add.graphics().setDepth(-60);
    g.fillStyle(0x07080f, 1);
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, ah)];
    for (let x = 0; x <= aw; x += 8) pts.push(new Phaser.Math.Vector2(x, ah - 12 - Math.sin(x / 37) * 4 - Math.sin(x / 13) * 1.5));
    pts.push(new Phaser.Math.Vector2(aw, ah));
    g.fillPoints(pts, true);
    for (let i = 0; i < 5; i++) {
      const x = rnd.between(14, aw - 14);
      const y = ah - 13 - Math.sin(x / 37) * 4;
      g.fillRect(x - 3, y - 6, 6, 7);
      g.fillCircle(x, y - 6, 3);
    }
    // 망원경 테 (맨 위 — 별자리는 테 안쪽에만 펼친다)
    this.add.image(0, 0, STEX.rim(aw, ah)).setOrigin(0, 0).setDepth(95);
  }

  private shootingStar(): void {
    if (this.paused || this.ended) return;
    const { aw, ah } = this;
    const x0 = aw * (0.15 + Math.random() * 0.7);
    const y0 = ah * (0.05 + Math.random() * 0.25);
    const ang = Phaser.Math.DegToRad(150 + Math.random() * 30);
    const dist = 60 + Math.random() * 50;
    const c = this.add.image(x0, y0, STEX.comet).setOrigin(1, 0.5).setRotation(ang).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(-50);
    this.tweens.add({
      targets: c,
      x: x0 + Math.cos(ang) * dist,
      y: y0 + Math.sin(ang) * dist,
      alpha: { from: 0.9, to: 0 },
      duration: 650,
      ease: "Quad.easeIn",
      onComplete: () => c.destroy(),
    });
    this.snd.shoot();
  }

  // ── 무리 자리 ──

  /**
   * 무리가 펼쳐질 자리: 겹치지 않게 번갈아 (가로 화면 = 왼쪽·오른쪽, 세로 화면 = 위·아래) + 시드로 조금 흔든다.
   * 별자리 모양은 정사각형(size) 안에 화면 비율을 지키며 그린다
   */
  private view(g: number): GroupView {
    const known = this.views.get(g);
    if (known) return known;
    const info = this.groups[g];
    const con = constellationById(info.con)!;
    const { aw, ah } = this;
    const portrait = ah > aw;
    const jx = (hash2(g, 1, this.play.seed) - 0.5) * 12;
    const jy = (hash2(g, 2, this.play.seed) - 0.5) * 10;
    const size = portrait ? 140 : 150;
    const cx = portrait ? aw / 2 + jx : (g % 2 ? aw * 0.72 : aw * 0.28) + jx;
    const cy = portrait ? (g % 2 ? ah * 0.7 : ah * 0.27) + jy : ah * 0.46 + jy;
    const v: GroupView = { info, con, cx, cy, size, hits: 0, broken: false, flawless: true, objs: [] };
    this.views.set(g, v);
    // 무리가 처음 보일 때: 앞으로 이을 별 자리를 아주 옅은 점으로 (모양을 미리 짐작할 수 있게)
    for (const n of this.plan)
      if (n.group === g) {
        const p = this.place(v, n.x, n.y);
        v.objs.push(this.add.image(p.x, p.y, RTEX.dust).setAlpha(0).setTint(0xaab8ff).setDepth(6));
      }
    this.tweens.add({ targets: v.objs, alpha: 0.35, duration: 500 });
    return v;
  }

  private place(v: GroupView, x: number, y: number): { x: number; y: number } {
    return { x: v.cx + (x - 0.5) * v.size, y: v.cy + (y - 0.5) * v.size };
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
    const v = this.view(l.n.group);
    v.hits++;
    if (j !== "perfect") v.flawless = false;
    this.snd.link(l.n.idx, j === "perfect");
    l.ring.destroy();
    l.star.setAlpha(1).setTint(j === "perfect" ? 0xfff3c8 : 0xc8dcff);
    this.tweens.add({ targets: l.star, scale: { from: 2.2, to: 1.2 }, duration: 260, ease: "Quad.easeOut" });
    l.glow.setAlpha(j === "perfect" ? 0.55 : 0.35);
    this.tweens.add({ targets: l.glow, scale: { from: 0.9, to: 0.45 }, duration: 500 });
    // 켜질 때 번쩍임
    const fl = this.add
      .image(l.x, l.y, STEX.flash)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(30)
      .setTint(j === "perfect" ? 0xfff3c8 : 0xc8dcff);
    this.tweens.add({
      targets: fl,
      scale: { from: 0.4, to: this.reduced ? 0.9 : 1.3 },
      alpha: { from: 1, to: 0 },
      duration: 260,
      onComplete: () => fl.destroy(),
    });
    this.burst.explode(this.reduced ? 4 : j === "perfect" ? 12 : 6, l.x, l.y);
    this.floatText(l.x, l.y - 8, j === "perfect" ? (mult > 1 ? `완벽 ×${mult}` : "완벽") : "좋아", j === "perfect" ? "#ffe39a" : "#bcd0f0", 11);
    // 같은 별자리의 앞 별과 선으로 잇는다: 선이 켜지며 빛 한 점이 앞 별에서 이 별로 흐른다
    const prev = this.lastHit.get(l.n.group);
    if (prev) {
      const line = this.add.graphics().setDepth(5).setAlpha(0);
      line.lineStyle(3, 0xffd890, 0.16).lineBetween(prev.x, prev.y, l.x, l.y);
      line.lineStyle(1, 0xffe39a, 0.85).lineBetween(prev.x, prev.y, l.x, l.y);
      this.tweens.add({ targets: line, alpha: 1, duration: 200 });
      v.objs.push(line);
      if (!this.reduced) {
        const dot = this.add.image(prev.x, prev.y, RTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff3c8).setScale(0.18).setDepth(7);
        this.tweens.add({ targets: dot, x: l.x, y: l.y, duration: 200, ease: "Sine.easeIn", onComplete: () => dot.destroy() });
      }
    }
    this.lastHit.set(l.n.group, { x: l.x, y: l.y });
    this.afterJudge(l);
  }

  private fail(l: Live, why = "놓침"): void {
    l.judged = "miss";
    this.miss++;
    this.combo = 0;
    this.setJudge("miss");
    const v = this.view(l.n.group);
    v.broken = true;
    v.flawless = false;
    this.snd.miss();
    l.ring.destroy();
    l.star.setTint(0x50546a).setAlpha(0.45);
    l.glow.setAlpha(0);
    this.floatText(l.x, l.y - 8, why, "#7a7f90", 10);
    // 끊긴 자리부터 다시 잇는다 (도감 등록은 놓친 별이 없을 때만)
    this.lastHit.delete(l.n.group);
    this.afterJudge(l);
  }

  private setJudge(j: Judge): void {
    this.judge = j;
    this.judgeUntil = this.elapsed + 500;
  }

  /** 무리의 마지막 별이 판정되면: 다 이었으면 별자리 그림·이름, 아니면 (꽤 이었으면) 이름만 흐리게. 그리고 천천히 지운다 */
  private afterJudge(l: Live): void {
    const g = l.n.group;
    const v = this.view(g);
    if (l.n.idx !== v.info.size - 1) return;
    const lives = this.live.filter((x) => x.n.group === g);
    const complete = v.info.full && !v.broken && v.hits === v.info.size;
    if (complete) this.complete(v);
    else if (v.hits >= Math.ceil(v.info.size * 0.6)) {
      const top = this.place(v, 0.5, Math.min(...v.con.stars.map((s) => s[1])));
      const name = this.nameLabel(top.x, top.y - 6, `${v.con.name} · 끊김`, "#8a90a8", 11);
      v.objs.push(name);
    }
    const all = [...v.objs, ...lives.flatMap((x) => [x.star, x.glow])];
    this.time.delayedCall(complete ? LINGER_DONE_MS : LINGER_MS, () => {
      this.tweens.add({ targets: all, alpha: 0, duration: 900, onComplete: () => all.forEach((o) => o.destroy()) });
      this.live = this.live.filter((x) => x.n.group !== g);
    });
  }

  private nameLabel(x: number, y: number, text: string, color: string, px: number): Phaser.GameObjects.Text {
    const t = this.label(Phaser.Math.Clamp(x, 44, this.aw - 44), Math.max(16, y), text, color, px)
      .setAlpha(0)
      .setDepth(60);
    this.tweens.add({ targets: t, alpha: 1, duration: 350 });
    return t;
  }

  /** 별자리 완성: 이은 선 위로 그 별자리 그림(가는 빛 선)을 그어 나가고, 이름 + 희귀도 + (처음이면) "도감 등록!" */
  private complete(v: GroupView): void {
    const { con } = v;
    this.doneGroups.push(v.info.group);
    if (v.flawless) this.perfectGroups.push(v.info.group);
    const fresh = !this.known.has(con.id);
    this.known.add(con.id);
    this.lastName = con.name;
    const color = artColor(con.rarity);
    const art = this.add.graphics().setDepth(40).setBlendMode(Phaser.BlendModes.ADD);
    const segs = artSegments(con);
    const total = segs.reduce((a, s) => a + s.len, 0);
    const draw = (p: number) => this.drawArt(art, v, segs, total * p, color);
    if (this.reduced) {
      draw(1);
      art.setAlpha(0);
      this.tweens.add({ targets: art, alpha: 1, duration: 300 });
    } else {
      const st = { p: 0 };
      this.tweens.add({ targets: st, p: 1, duration: ART_DRAW_MS, ease: "Sine.easeInOut", onUpdate: () => draw(st.p) });
    }
    v.objs.push(art);
    // 이름 (모양 위쪽), 희귀도, 처음이면 도감 등록
    const top = this.place(v, 0.5, Math.min(...con.stars.map((s) => s[1]), ...con.art.flat().map((p) => p[1])));
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    const tag = con.rarity >= 5 ? " ★전설" : con.rarity >= 3 ? " ★희귀" : "";
    v.objs.push(this.nameLabel(top.x, top.y - 4, `${con.name}${tag}`, con.rarity >= 3 ? hex : "#ffe39a", 14));
    if (fresh) {
      const bottom = this.place(v, 0.5, Math.max(...con.stars.map((s) => s[1])));
      const t = this.nameLabel(bottom.x, Math.min(this.ah - 22, bottom.y + 16), "도감 등록!", "#9ef0c0", 12);
      if (!this.reduced) this.tweens.add({ targets: t, y: t.y - 3, duration: 260, yoyo: true, repeat: 2, ease: "Sine.easeOut" });
      v.objs.push(t);
    }
    for (const x of this.live)
      if (x.n.group === v.info.group) {
        this.tweens.add({ targets: x.glow, alpha: 0.75, scale: 0.75, duration: 320, yoyo: true });
        if (!this.reduced) this.burst.explode(5, x.x, x.y);
      }
    if (con.rarity >= 5 && !this.reduced) this.cameras.main.flash(260, 255, 232, 170);
    this.snd.complete(con.rarity, fresh);
  }

  /** 그림 선을 len만큼(앞에서부터) 그린다: 넓고 옅은 빛 + 가는 선 */
  private drawArt(g: Phaser.GameObjects.Graphics, v: GroupView, segs: Seg[], len: number, color: number): void {
    g.clear();
    let left = len;
    for (const s of segs) {
      if (left <= 0) break;
      const k = Math.min(1, left / Math.max(1e-6, s.len));
      left -= s.len;
      const a = this.place(v, s.x0, s.y0);
      const b = this.place(v, s.x0 + (s.x1 - s.x0) * k, s.y0 + (s.y1 - s.y0) * k);
      g.lineStyle(3, color, 0.14).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(1, color, 0.7).lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  // ── 매 프레임 ──

  update(_t: number, delta: number): void {
    if (!this.tickCommon(delta)) return;
    const now = this.elapsed;
    while (this.nextSpawn < this.plan.length && this.plan[this.nextSpawn].t - this.approach <= now) {
      const n = this.plan[this.nextSpawn++];
      const { x, y } = this.place(this.view(n.group), n.x, n.y);
      const glow = this.add.image(x, y, RTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd890).setAlpha(0.12).setScale(0.35).setDepth(8);
      const star = this.add.image(x, y, STEX.spark).setAlpha(0).setDepth(10);
      const ring = this.add
        .image(x, y, RTEX.ring)
        .setTint(0xbcd0f0)
        .setAlpha(0)
        .setScale(RING_START / 32)
        .setDepth(12);
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
    // 지금 잇는 무리: 아직 판정 안 된 첫 별의 무리, 없으면 마지막으로 본 무리
    const cur = this.live.find((l) => !l.judged) ?? this.live[this.live.length - 1];
    const v = cur ? this.views.get(cur.n.group) : undefined;
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
      stars: {
        hit: v?.hits ?? 0,
        size: v?.info.size ?? 0,
        broken: v?.broken ?? false,
        done: this.doneGroups.length,
        last: this.lastName,
      },
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
      groups: [...this.doneGroups],
      perfectGroups: [...this.perfectGroups],
    };
  }
}
