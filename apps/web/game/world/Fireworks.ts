import * as Phaser from "phaser";
import { itemById } from "@tomb/protocol";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { burstSpeed, finaleTimes, fireworkPlan, FW_BASE_RADIUS, heartPoint, type FireworkPlan } from "./fxMath";
import type { Lighting } from "./Lighting";
import type { Sfx } from "./Sfx";

// 폭죽: 로켓이 솟아 터진다. 크기·길이는 아이템 power(가격)에 비례한다 (fxMath.fireworkPlan).
//  1 fw_small  한 발 (금빛)
//  2 fw_heart  분홍 하트, 조금 크게
//  3 fw_triple 세 발이 연달아 (색이 다르다)
//  4 fw_big    대형: 반경 2.8배 이상(화면 대부분), 잔상이 길고 뒤늦게 반짝이는 불티, 화면이 살짝 흔들리고 어둠이 걷힌다
//  5 fw_grand  피날레: 쏜 사람이 어디 있든 채널 모두의 "하늘 레이어"(카메라 고정)에 4~6초 동안
//              여러 색 대형 불꽃 15~25발이 연달아, 마지막엔 몰아서. 그동안 화면 전체가 밝아진다
// 1~4는 터지는 자리가 화면 밖이면 하늘 레이어에서 그 방향 위쪽 하늘에 작게 터뜨린다.
// 입자는 풀에서 꺼내 쓰고(최대 CAP), 모자라면 발당 입자 수를 줄인다. 프레임이 느려지면 입자 수를 더 줄인다.
// reduced-motion이면 입자·발 수를 줄이고 흔들림·반짝임을 끈다.

const POOL = 420;
/** 동시에 살아 있는 불티 최대 (피날레 동안에도 60fps) */
const CAP = 1100;
const GRAVITY = 26;
const RISE_MS = 720;
/** 피날레 로켓이 지평선에서 솟는 시간 */
const SKY_RISE_MS = 520;
const BURST_H = 96;
const SKY_GLOW = "fw-sky-glow";
/** 화면 밝아짐이 줄어드는 시간 상수 (ms) */
const GLOW_TAU = 900;

type Pattern = "peony" | "ring" | "heart" | "willow" | "double" | "brocade";
type Mode = "world" | "sky" | "finale" | "signal";

type Spark = {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  sky: boolean;
  /** 공기 저항 (하트는 작게 해서 모양이 오래 남는다) */
  drag: number;
  grav: number;
  size: number;
};
type Bloom = { img: Phaser.GameObjects.Image; age: number; scale: number; ms: number };
type Rocket = {
  /** world/sky/signal: 발사 위치(월드). finale: 터질 자리 (화면 비율 0..1) */
  x: number;
  y: number;
  t0: number;
  delay: number;
  /** world: 솟는 높이 / finale: 반경 (화면 짧은 변 비율) */
  h: number;
  /** world(대형): 불꽃 반경 (월드 px) */
  r: number;
  colors: readonly number[];
  pattern: Pattern;
  plan: FireworkPlan;
  mode: Mode;
  loud: boolean;
  /** 피날레의 첫 발·마지막 몰아치기 (더 크고 소리도 크게) */
  big: boolean;
  trailAt: number;
  launched: boolean;
};
type Flash = { x: number; y: number; age: number; r: number; ms: number };
type Timer = { at: number; run: () => void };

const COLORS = {
  gold: [0xffe08a, 0xfff4d0, 0xffb860],
  pink: [0xff8fb8, 0xffc2d6, 0xff6f9f],
  cyan: [0x8fe0ff, 0xd8f6ff, 0x6ab8f0],
  violet: [0xd0a0ff, 0xf0dcff, 0xa070e8],
  red: [0xff7a62, 0xffc0a8, 0xff4a4a],
  green: [0xa6ff9a, 0xe4ffd8, 0x62e07e],
  silver: [0xffffff, 0xe2ecff, 0xbcd0ff],
} as const;
const FINALE_COLORS: readonly (readonly number[])[] = [COLORS.gold, COLORS.pink, COLORS.cyan, COLORS.violet, COLORS.red, COLORS.green, COLORS.silver];
const FINALE_PATTERNS: readonly Pattern[] = ["peony", "ring", "double", "willow", "peony", "double", "ring", "heart"];

export { heartPoint };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fireworks {
  private readonly free: Phaser.GameObjects.Image[] = [];
  private readonly sparks: Spark[] = [];
  private readonly rockets: Rocket[] = [];
  private readonly flashes: Flash[] = [];
  private readonly blooms: Bloom[] = [];
  private readonly timers: Timer[] = [];
  private readonly skyGlow: Phaser.GameObjects.Image;
  private made = 0;
  private readonly k: number;
  /** 프레임 시간 이동 평균 (느려지면 입자 수를 줄인다) */
  private dtAvg = 16;
  private glow = 0;
  private glowCap = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    private readonly sfx: Sfx,
  ) {
    this.k = reduced ? 0.45 : 1;
    for (let i = 0; i < POOL; i++) this.free.push(this.makeSpark());
    if (!scene.textures.exists(SKY_GLOW)) {
      // 위가 밝고 아래로 옅어지는 하늘빛 (세로 그라데이션)
      const tex = scene.textures.createCanvas(SKY_GLOW, 4, 64);
      if (tex) {
        const ctx = tex.getContext();
        const g = ctx.createLinearGradient(0, 0, 0, 64);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.55, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0.25)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 64);
        tex.refresh();
      }
    }
    this.skyGlow = scene.add
      .image(0, 0, SKY_GLOW)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights + 1)
      .setTint(0xffe6c0)
      .setVisible(false);
  }

  private makeSpark(): Phaser.GameObjects.Image {
    this.made++;
    return this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false);
  }

  /** (x,y): 쏜 사람의 발밑 (월드 좌표). mine이면 소리를 조금 크게 */
  launch(item: string, x: number, y: number, view: Phaser.Geom.Rectangle, mine: boolean): void {
    const plan = fireworkPlan(itemById(item)?.power, this.reduced);
    const now = this.scene.time.now;
    if (plan.sky) {
      this.launchFinale(plan, x, y, view, mine, now);
      return;
    }
    let h = BURST_H;
    let r = FW_BASE_RADIUS * plan.radius;
    if (plan.power >= 4) {
      // 대형: 화면 대부분을 덮도록 (보는 사람 화면 기준, 최소 2.8배)
      r = Math.min(FW_BASE_RADIUS * 4.6, Math.max(r, 0.42 * Math.min(view.width, view.height)));
      h = Math.max(64, Math.min(140, y - (view.y + view.height * 0.4)));
    }
    const margin = plan.power >= 4 ? r * 0.6 : 40;
    const burstY = y - h;
    const onScreen = x > view.x - margin && x < view.right + margin && burstY > view.y - 80 - margin && y < view.bottom + 60;
    const mode: Mode = onScreen ? "world" : "sky";
    const add = (dx: number, delay: number, hh: number, colors: readonly number[], pattern: Pattern) => {
      this.rockets.push({ x: x + dx, y, t0: now, delay, h: hh, r, colors, pattern, plan, mode, loud: mine, big: false, trailAt: 0, launched: false });
    };
    switch (plan.power) {
      case 2:
        add(0, 0, BURST_H + 6, COLORS.pink, "heart");
        break;
      case 3: {
        const gap = plan.spanMs / 2;
        add(-16, 0, BURST_H - 10, COLORS.cyan, "peony");
        add(0, gap, BURST_H + 8, COLORS.gold, "peony");
        add(16, gap * 2, BURST_H, COLORS.violet, "peony");
        break;
      }
      case 4:
        add(0, 0, h, COLORS.gold, "brocade");
        break;
      default:
        add(0, 0, BURST_H, COLORS.gold, "peony");
    }
  }

  /** 피날레: 하늘 레이어에 연달아. 쏜 사람이 화면에 보이면 그 자리에서 신호탄이 먼저 솟는다 */
  private launchFinale(plan: FireworkPlan, x: number, y: number, view: Phaser.Geom.Rectangle, mine: boolean, now: number): void {
    const visible = x > view.x - 20 && x < view.right + 20 && y > view.y && y < view.bottom + 40;
    const lead = visible ? 480 : 120;
    if (visible) {
      this.rockets.push({ x, y, t0: now, delay: 0, h: y - view.y + 40, r: 0, colors: COLORS.gold, pattern: "peony", plan, mode: "signal", loud: mine, big: false, trailAt: 0, launched: false });
    }
    const times = finaleTimes(plan.shots, plan.spanMs);
    const climaxAt = plan.spanMs * 0.85;
    const phase = Math.random();
    let last = -1;
    for (let i = 0; i < times.length; i++) {
      const big = i === 0 || times[i] >= climaxAt;
      // 황금비로 가로 자리를 흩어 겹치지 않게, 몰아치기는 가운데 쪽에 크게
      const fx = big && i > 0 ? 0.25 + 0.5 * ((phase + i * 0.618) % 1) : 0.12 + 0.76 * ((phase + i * 0.618) % 1);
      const fy = big ? rand(0.2, 0.34) : rand(0.13, 0.42);
      let ci = Math.floor(Math.random() * FINALE_COLORS.length);
      if (ci === last) ci = (ci + 1) % FINALE_COLORS.length;
      last = ci;
      const pattern = big ? (i === 0 ? "double" : i % 2 ? "peony" : "willow") : FINALE_PATTERNS[(i + Math.floor(phase * 8)) % FINALE_PATTERNS.length];
      this.rockets.push({
        x: fx,
        y: fy,
        t0: now,
        delay: lead + times[i],
        h: big ? rand(0.3, 0.38) : rand(0.17, 0.27),
        r: 0,
        colors: pattern === "willow" ? COLORS.gold : pattern === "heart" ? COLORS.pink : FINALE_COLORS[ci],
        pattern,
        plan,
        mode: "finale",
        loud: mine,
        big,
        trailAt: 0,
        launched: false,
      });
    }
  }

  private take(): Phaser.GameObjects.Image | null {
    const img = this.free.pop();
    if (img) return img;
    return this.made < CAP ? this.makeSpark() : null;
  }

  /** 이번 폭발에 쓸 수 있는 입자 수 (풀 한도 + 느린 프레임) */
  private budget(want: number): number {
    const slow = this.dtAvg > 24 ? 0.55 : this.dtAvg > 19 ? 0.8 : 1;
    const room = this.free.length + (CAP - this.made);
    return Math.max(0, Math.min(Math.round(want * this.k * slow), room - 16));
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, sky: boolean, size: number, drag = 1.3, grav = GRAVITY): void {
    const img = this.take();
    if (!img) return;
    img
      .setActive(true)
      .setVisible(true)
      .setTint(color)
      .setScrollFactor(sky ? 0 : 1)
      .setDepth(sky ? DEPTH.weather - 3 : DEPTH.lights + 10)
      .setPosition(x, y)
      .setScale(size)
      .setAlpha(1);
    this.sparks.push({ img, x, y, vx, vy, age: 0, life, sky, drag, grav, size });
  }

  /** 터지는 순간의 둥근 섬광 */
  private bloom(x: number, y: number, color: number, sky: boolean, scale: number, ms = 520): void {
    const img = this.scene.add
      .image(x, y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScrollFactor(sky ? 0 : 1)
      .setDepth(sky ? DEPTH.weather - 4 : DEPTH.lights + 9);
    this.blooms.push({ img, age: 0, scale, ms });
  }

  /** 화면 좌표(px) → 하늘 레이어 좌표 (카메라 고정 오브젝트는 줌 중심 기준) */
  private toSky(sx: number, sy: number): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    return { x: ox + (sx - ox) / cam.zoom, y: oy + (sy - oy) / cam.zoom };
  }

  /** 하늘 레이어 좌표: 화면 위쪽, 폭죽이 있는 방향 */
  private skyPoint(wx: number, view: Phaser.Geom.Rectangle): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const sx = Math.max(40, Math.min(cam.width - 40, ((wx - view.x) / view.width) * cam.width));
    return this.toSky(sx, cam.height * 0.16);
  }

  /** 화면 전체가 잠깐 밝아진다 (피날레·대형). 세기는 power에 비례 */
  private brighten(plan: FireworkPlan, color: number, amount = 0.55): void {
    if (plan.lift <= 0) return;
    this.glowCap = Math.max(this.glowCap, plan.lift);
    this.glow = Math.min(this.glowCap, this.glow + plan.lift * amount);
    this.skyGlow.setTint(color);
  }

  /** 화면 흔들림 (화면 px). Phaser shake는 줌² 배로 커지므로 거꾸로 나눠 준다 */
  private shake(px: number): void {
    if (px <= 0 || this.reduced) return;
    const cam = this.scene.cameras.main;
    const z2 = cam.zoom * cam.zoom;
    cam.shake(240, new Phaser.Math.Vector2(px / (cam.width * z2), px / (cam.height * z2)), false);
  }

  private later(ms: number, run: () => void): void {
    this.timers.push({ at: this.scene.time.now + ms, run });
  }

  /**
   * (bx,by)에서 반경 R로 퍼지는 불꽃 (sky면 하늘 레이어 좌표·단위).
   * life: 기본 수명 배율, size: 불티 크기
   */
  private explode(bx: number, by: number, R: number, pattern: Pattern, colors: readonly number[], sky: boolean, life: number, size: number): void {
    const g = GRAVITY * Math.pow(R / FW_BASE_RADIUS, 0.8);
    switch (pattern) {
      case "heart": {
        // 하트 모양 그대로 커지도록 공기 저항을 작게
        const n = this.budget(60);
        const sp = 52 * (R / (FW_BASE_RADIUS * 1.15));
        for (let i = 0; i < n; i++) {
          const h = heartPoint((i / n) * Math.PI * 2);
          this.spawn(bx, by, h.x * sp, h.y * sp, (1500 + Math.random() * 300) * life, colors[i % colors.length], sky, size, 0.5, g * 0.45);
        }
        break;
      }
      case "ring": {
        const n = this.budget(56);
        const L = 1500 * life;
        const sp = burstSpeed(R, 1.1, (L * 0.8) / 1000);
        const tilt = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + tilt;
          this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, L + Math.random() * 200, colors[i % 2], sky, size, 1.1, g * 0.6);
        }
        break;
      }
      case "willow": {
        // 금빛 버드나무: 오래 남아 아래로 늘어진다
        const n = this.budget(60);
        const L = 2400 * life;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
          const sp = burstSpeed(R * rand(0.8, 1.05), 1.6, 1.1);
          this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, L + Math.random() * 600, colors[i % colors.length], sky, size * 0.9, 1.6, g * 1.6);
        }
        break;
      }
      case "double": {
        const n = this.budget(48);
        const m = this.budget(30);
        const L = 1600 * life;
        const sp = burstSpeed(R, 1.2, (L * 0.8) / 1000);
        const inner = FINALE_COLORS[(FINALE_COLORS.indexOf(colors) + 3) % FINALE_COLORS.length] ?? COLORS.silver;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, L + Math.random() * 300, colors[i % colors.length], sky, size, 1.2, g * 0.6);
        }
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2 + 0.1;
          this.spawn(bx, by, Math.cos(a) * sp * 0.5, Math.sin(a) * sp * 0.5, L * 0.8, inner[i % inner.length], sky, size * 0.85, 1.2, g * 0.5);
        }
        break;
      }
      case "brocade": {
        // 대형: 금·흰 바깥 불꽃(길게 늘어지는 잔상) + 안쪽 청록 고리 + 뒤늦게 터지는 반짝이
        const n = this.budget(130);
        const m = this.budget(40);
        const L = 1450 * life;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.06;
          const sp = burstSpeed(R * rand(0.86, 1.08), 1.2, 1.5);
          const c = i % 3 === 0 ? 0xffffff : colors[i % colors.length];
          this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, L + Math.random() * 700, c, sky, size * 1.25, 1.2, g * 0.55);
        }
        const sp2 = burstSpeed(R * 0.45, 1.3, 1.1);
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2;
          this.spawn(bx, by, Math.cos(a) * sp2, Math.sin(a) * sp2, 1500 * life * 0.6, COLORS.cyan[i % 3], sky, size, 1.3, g * 0.4);
        }
        // 잔상 속 반짝이: 1초 뒤 바깥 둘레 여기저기서 작게 톡톡
        this.later(950, () => {
          const pops = this.reduced ? 4 : 10;
          for (let j = 0; j < pops; j++) {
            const a = Math.random() * Math.PI * 2;
            const d = R * rand(0.55, 0.95);
            const px = bx + Math.cos(a) * d;
            const py = by + Math.sin(a) * d + R * 0.15;
            const k = this.budget(6);
            for (let q = 0; q < k; q++) {
              const b = (q / k) * Math.PI * 2;
              this.spawn(px, py, Math.cos(b) * 14, Math.sin(b) * 14, 520, q % 2 ? 0xffffff : 0xfff0b0, sky, size * 0.7, 2.2, 6);
            }
          }
          this.sfx.play("burst", sky ? 0.2 : 0.35, 1.7);
        });
        break;
      }
      default: {
        const n = this.budget(44);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
          const sp = burstSpeed(R * rand(0.75, 1.25), 1.3, 1.23);
          this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, (1200 + Math.random() * 500) * life, colors[i % colors.length], sky, size, 1.3, g);
        }
      }
    }
  }

  private burst(r: Rocket, view: Phaser.Geom.Rectangle): void {
    const plan = r.plan;
    const cam = this.scene.cameras.main;
    if (r.mode === "finale") {
      const minDim = Math.min(cam.width, cam.height);
      const p = this.toSky(r.x * cam.width, r.y * cam.height);
      const R = (r.h * minDim) / cam.zoom;
      this.bloom(p.x, p.y, r.colors[1], true, R / 18, 620);
      this.explode(p.x, p.y, R, r.pattern, r.colors, true, plan.life, r.big ? 1.15 : 1);
      this.brighten(plan, r.colors[1], r.big ? 0.8 : 0.5);
      if (r.big && (r.delay < 700 || Math.random() < 0.5)) this.shake(plan.shake);
      this.sfx.play("burst", (r.big ? 1 : rand(0.5, 0.8)) * (r.loud ? 1 : 0.9), r.big ? rand(0.68, 0.78) : rand(0.85, 1.2));
      return;
    }
    const big = plan.power >= 4;
    if (r.mode === "sky") {
      const p = this.skyPoint(r.x, view);
      // 멀리 하늘에서: 1~3은 작게, 대형은 화면 짧은 변의 22% 반경
      const R = big ? (0.22 * Math.min(cam.width, cam.height)) / cam.zoom : FW_BASE_RADIUS * plan.radius * 0.6;
      this.bloom(p.x, p.y, r.colors[0], true, big ? R / 18 : (r.pattern === "heart" ? 1.6 : 1.3) * 0.6);
      this.explode(p.x, p.y, R, r.pattern, r.colors, true, plan.life, big ? 0.9 : 0.7);
      if (big) this.brighten(plan, r.colors[1], 0.5);
      this.sfx.play("burst", 0.35 * plan.volume, big ? 0.8 : 1);
      return;
    }
    const bx = r.x;
    const by = r.y - r.h;
    this.flashes.push({ x: bx, y: by, age: 0, r: plan.light, ms: plan.lightMs });
    this.bloom(bx, by, big ? 0xfff0c8 : r.colors[0], false, big ? r.r / 16 : r.pattern === "heart" ? 1.6 : 1.3, big ? 760 : 520);
    this.explode(bx, by, r.r, r.pattern, r.colors, false, plan.life, 1);
    if (big) {
      this.brighten(plan, 0xffe6c0, 1);
      this.shake(plan.shake);
    }
    this.sfx.play("burst", Math.min(1, 0.8 * (plan.volume / 0.7)) * (r.loud ? 1 : 0.9), big ? 0.75 : 1);
  }

  update(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    this.dtAvg += (Math.min(100, dt) - this.dtAvg) * 0.1;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (time < this.timers[i].at) continue;
      const t = this.timers[i];
      this.timers.splice(i, 1);
      t.run();
    }
    const cam = this.scene.cameras.main;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const t = time - r.t0 - r.delay;
      if (t < 0) continue;
      const finale = r.mode === "finale";
      if (!r.launched) {
        r.launched = true;
        const base = r.mode === "sky" ? 0.3 : finale ? 0.28 : r.loud ? 0.7 : 0.55;
        // 피날레 로켓 소리는 터지는 소리를 위해 자리를 남겨 둔다 (최대 7겹)
        this.sfx.play("launch", Math.min(1, base * (r.plan.volume / 0.8)), finale ? rand(0.9, 1.15) : 1, finale ? 7 : undefined);
      }
      const rise = finale ? SKY_RISE_MS : r.mode === "signal" ? RISE_MS * 0.8 : r.plan.power >= 4 ? RISE_MS * 1.15 : RISE_MS;
      const k = Math.min(1, t / rise);
      const e = 1 - Math.pow(1 - k, 2);
      if (time >= r.trailAt && k < 1) {
        r.trailAt = time + (this.reduced ? 90 : finale ? 45 : 35);
        if (finale) {
          // 하늘 레이어: 화면 아래쪽 지평선에서 터질 자리까지
          const sy = cam.height * (0.96 - (0.96 - r.y) * e);
          const p = this.toSky(r.x * cam.width + Math.sin(t / 60) * 1.5, sy);
          this.spawn(p.x, p.y, (Math.random() - 0.5) * 4, 6 + Math.random() * 6, 360, 0xffe8b0, true, 0.8, 1.3, 8);
        } else if (r.mode !== "sky") {
          // 로켓 꼬리: 솟는 동안 작은 불티 (대형은 굵게 두 줄)
          const ry = r.y - 8 - (r.h - 8) * e;
          const rx = r.x + Math.sin(t / 70) * 0.8;
          this.spawn(rx, ry, (Math.random() - 0.5) * 6, 8 + Math.random() * 8, 380, 0xffe8b0, false, 1);
          if (r.plan.power >= 4) this.spawn(rx + (Math.random() - 0.5) * 2, ry + 2, (Math.random() - 0.5) * 10, 10 + Math.random() * 10, 520, 0xffc070, false, 1.2);
        }
      }
      if (k >= 1) {
        this.rockets.splice(i, 1);
        if (r.mode !== "signal") this.burst(r, view);
      }
    }
    const s = dt / 1000;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      b.age += dt;
      const u = b.age / b.ms;
      if (u >= 1) {
        b.img.destroy();
        this.blooms.splice(i, 1);
        continue;
      }
      b.img.setScale(b.scale * (0.3 + 0.9 * u)).setAlpha(0.85 * (1 - u));
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.img.setVisible(false).setActive(false);
        this.free.push(p.img);
        // 순서는 상관없으니 맨 끝과 바꿔서 뺀다 (수백 개일 때 splice 비용)
        const lastSpark = this.sparks.pop()!;
        if (i < this.sparks.length) this.sparks[i] = lastSpark;
        continue;
      }
      const drag = Math.exp(-s * p.drag);
      p.vx *= drag;
      p.vy = p.vy * drag + p.grav * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const u = p.age / p.life;
      // 끝무렵엔 반짝이며 사라진다
      const twinkle = u > 0.6 && !this.reduced ? (Math.floor(p.age / 60 + p.size * 7) % 2 ? 0.5 : 1) : 1;
      p.img
        .setPosition(p.x, p.y)
        .setAlpha((1 - u * u) * twinkle)
        .setScale(p.size * (1 - 0.4 * u));
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].age += dt;
      if (this.flashes[i].age > this.flashes[i].ms) this.flashes.splice(i, 1);
    }
    // 화면 밝아짐: 터질 때마다 올라가고 천천히 가라앉는다
    if (this.glow > 0.002) {
      this.glow *= Math.exp(-dt / GLOW_TAU);
      this.skyGlow
        .setVisible(true)
        .setPosition(cam.width / 2, cam.height / 2)
        .setDisplaySize(cam.width / cam.zoom + 4, cam.height / cam.zoom + 4)
        .setAlpha(this.glow * 0.22);
    } else if (this.glow > 0) {
      this.glow = 0;
      this.glowCap = 0;
      this.skyGlow.setVisible(false);
    }
  }

  /** 화면 전체 어둠 걷힘 (0..1): 어둠 레이어 세기를 이만큼 줄인다 */
  get lift(): number {
    return this.glow;
  }

  /** 터진 자리 둘레의 어둠을 걷어낸다 (반경·시간은 power에 비례) */
  addLights(l: Lighting): void {
    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      const u = f.age / f.ms;
      l.add(f.x, f.y, f.r * (0.85 + 0.15 * u), 0.85 * (1 - u));
    }
  }

  get active(): number {
    return this.sparks.length + this.rockets.length;
  }

  destroy(): void {
    for (const p of this.sparks) p.img.destroy();
    for (const b of this.blooms) b.img.destroy();
    for (const img of this.free) img.destroy();
    this.skyGlow.destroy();
    this.sparks.length = 0;
    this.blooms.length = 0;
    this.free.length = 0;
    this.rockets.length = 0;
    this.timers.length = 0;
  }
}
