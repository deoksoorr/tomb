import * as Phaser from "phaser";
import { itemById } from "@tomb/protocol";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { fireworkPlan, fitBurst, FW_BASE_RADIUS, heartPoint, meteorShower, type FireworkPlan, type MeteorStreak } from "./fxMath";
import {
  burstSparks,
  finaleShots,
  fireworkShots,
  fireworkSpecial,
  FOUNTAIN_MS,
  FW_BURST_H as BURST_H,
  FW_COLORS as COLORS,
  FW_GRAVITY as GRAVITY,
  FW_RISE_MS as RISE_MS,
  FW_SKY_RISE_MS as SKY_RISE_MS,
  LETTER_FALLBACK,
  LETTER_FLY,
  LETTER_HOLD,
  letterMask,
  letterSparks,
  sparkLook,
  stepSpark,
  type FwPattern as Pattern,
  type LetterMask,
  type SparkSpec,
} from "./fwShapes";
import type { Lighting } from "./Lighting";
import type { Sfx } from "./Sfx";

// 폭죽: 로켓이 솟아 터진다. 크기·길이는 아이템 power(가격)에 비례한다 (fxMath.fireworkPlan).
// 어떤 무늬로 터지는지(불티 방향·속도·지연)는 fwShapes가 정한다 — 상점 미리보기도 같은 코드를 쓴다.
//  1 fw_small     한 발 (금빛)            1 fw_fountain  분수: 발밑에서 2초 남짓 금빛 불티를 뿜는다
//  1 fw_ring      청록 고리               2 fw_heart     분홍 하트
//  2 fw_star      노란 오각별             2 fw_spiral    나선: 팔 4개가 돌며 풀려 나온다
//  3 fw_triple    세 발이 연달아 (색이 다르다)
//  3 fw_willow    금빛 버드나무: 오래 남아 아래로 늘어진다
//  3 fw_crossette 이중 폭발: 첫 불꽃 끝에서 저마다 다시 터진다
//  3 fw_smile     웃는 얼굴               3 fw_waterfall 폭포: 가로 불꽃 줄에서 커튼처럼 흘러내린다
//  4 fw_big    대형: 반경 2.8배 이상(화면 대부분), 잔상이 길고 뒤늦게 반짝이는 불티, 화면이 살짝 흔들리고 어둠이 걷힌다
//  fw_meteor   별똥별 비: 하늘 레이어(모두가 본다)에 10~14줄기가 비스듬히 긋고 지나가며 끝에서 반짝 (power 3)
//  fw_letter   글자 폭죽: 쏜 사람 이름이 불꽃 글자로 떠올라 잠깐 머문 뒤 흘러내린다 (power 3)
//  5 fw_grand  피날레: 쏜 사람이 어디 있든 채널 모두의 "하늘 레이어"(카메라 고정)에 4~6초 동안
//              여러 색 대형 불꽃 15~25발이 연달아, 마지막엔 몰아서. 그동안 화면 전체가 밝아진다
// 모르는 폭죽(옛 클라이언트가 새 종류를 받음)은 power 1 기본 금빛 폭죽으로 터진다.
// 1~4는 터지는 자리가 화면 밖이면 하늘 레이어에서 그 방향 위쪽 하늘에 작게 터뜨린다 (분수는 땅에서 뿜으니 안 보인다).
// 입자는 풀에서 꺼내 쓰고(최대 CAP), 모자라면 발당 입자 수를 줄인다. 프레임이 느려지면 입자 수를 더 줄인다.
// reduced-motion이면 입자·발 수를 줄이고 흔들림·반짝임을 끈다.

const POOL = 420;
/** 동시에 살아 있는 불티 최대 (피날레 동안에도 60fps) */
const CAP = 1100;
const SKY_GLOW = "fw-sky-glow";
/** 화면 밝아짐이 줄어드는 시간 상수 (ms) */
const GLOW_TAU = 900;

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
  /** 이 나이(ms)가 되면 공기 저항·중력을 바꾼다 (글자 모양으로 멈춰 있다가 흘러내리기). 없으면 Infinity */
  swapAt: number;
  /** 수명의 이 비율까지는 밝게 유지, 그 뒤로 사라진다 (0이면 처음부터 서서히) */
  fadeFrom: number;
};
/** 별똥별 한 줄기 (화면 비율 좌표) */
type Meteor = MeteorStreak & { t0: number; trailAt: number; head: Phaser.GameObjects.Image | null; color: number; loud: boolean };
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
  /** 글자 폭죽의 글자 */
  label?: string;
  /** 분수: 땅에서 바로 뿜는다 (솟지 않는다) */
  ground?: boolean;
};
type Flash = { x: number; y: number; age: number; r: number; ms: number };
type Timer = { at: number; run: () => void };

export { heartPoint };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fireworks {
  private readonly free: Phaser.GameObjects.Image[] = [];
  private readonly sparks: Spark[] = [];
  private readonly rockets: Rocket[] = [];
  private readonly flashes: Flash[] = [];
  private readonly blooms: Bloom[] = [];
  private readonly timers: Timer[] = [];
  private readonly meteors: Meteor[] = [];
  private readonly letterCache = new Map<string, { pts: { x: number; y: number }[]; w: number; h: number }>();
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

  /**
   * (x,y): 쏜 사람의 발밑 (월드 좌표). mine이면 소리를 조금 크게.
   * view: 보이는 영역 (불멍 중이면 레터박스를 뺀 영역) — 화면 안에서 쏘면 터지는 높이·반경을 그 안에 맞춘다
   */
  launch(item: string, x: number, y: number, view: Phaser.Geom.Rectangle, mine: boolean, label?: string): void {
    const plan = fireworkPlan(itemById(item)?.power, this.reduced);
    const now = this.scene.time.now;
    const special = fireworkSpecial(item, plan);
    if (special === "meteor") {
      this.launchMeteors(plan, mine, now);
      return;
    }
    if (special === "letter") {
      const burstY = y - BURST_H - 8;
      const onScreen = x > view.x - 30 && x < view.right + 30 && burstY > view.y - 40 && y < view.bottom + 60;
      const text = (label ?? "").trim().slice(0, 12) || LETTER_FALLBACK;
      // 글자는 높이 약 30px: 그만큼 들어오게 솟는 높이만 맞춘다
      const lh = onScreen ? fitBurst(x, y, BURST_H + 8, 18, view).h : BURST_H + 8;
      this.rockets.push({ x, y, t0: now, delay: 0, h: lh, r: 0, colors: COLORS.gold, pattern: "letters", plan, mode: onScreen ? "world" : "sky", loud: mine, big: false, trailAt: 0, launched: false, label: text });
      return;
    }
    if (special === "finale") {
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
    for (const s of fireworkShots(item, plan, h)) {
      if (s.ground && mode !== "world") continue; // 분수는 땅에서 뿜는다: 화면 밖이면 보이지 않는다
      // 화면 안에서 쏘면 보이는 영역 안에서 터지게 맞춘다 (불멍처럼 가까이 당긴 구도에서 위로 잘리지 않게)
      const fit = mode === "world" && !s.ground ? fitBurst(x + s.dx, y, s.h, r, view) : { h: s.h, r };
      this.rockets.push({ x: x + s.dx, y, t0: now, delay: s.delay, h: fit.h, r: fit.r, colors: s.colors, pattern: s.pattern, plan, mode, loud: mine, big: false, trailAt: 0, launched: false, ground: s.ground });
    }
  }

  /** 피날레: 하늘 레이어에 연달아. 쏜 사람이 화면에 보이면 그 자리에서 신호탄이 먼저 솟는다 */
  private launchFinale(plan: FireworkPlan, x: number, y: number, view: Phaser.Geom.Rectangle, mine: boolean, now: number): void {
    const visible = x > view.x - 20 && x < view.right + 20 && y > view.y && y < view.bottom + 40;
    const lead = visible ? 480 : 120;
    if (visible) {
      this.rockets.push({ x, y, t0: now, delay: 0, h: y - view.y + 40, r: 0, colors: COLORS.gold, pattern: "peony", plan, mode: "signal", loud: mine, big: false, trailAt: 0, launched: false });
    }
    for (const s of finaleShots(plan, lead)) {
      this.rockets.push({ x: s.fx, y: s.fy, t0: now, delay: s.delay, h: s.h, r: 0, colors: s.colors, pattern: s.pattern, plan, mode: "finale", loud: mine, big: s.big, trailAt: 0, launched: false });
    }
  }

  /** 별똥별 비: 하늘 레이어에 비스듬한 줄기들 (쏜 자리와 상관없이 같은 채널 모두의 하늘에) */
  private launchMeteors(plan: FireworkPlan, mine: boolean, now: number): void {
    const streaks = meteorShower(this.reduced ? 5 : 12, this.reduced ? 2400 : 2600);
    const tints = [0xffffff, 0xfff4d0, 0xd8f0ff, 0xffe0f0];
    streaks.forEach((m, i) => this.meteors.push({ ...m, t0: now + 150, trailAt: 0, head: null, color: tints[i % tints.length], loud: mine }));
    this.brighten({ ...plan, lift: this.reduced ? 0.12 : 0.22 }, 0xd8e4ff, 0.6);
  }

  private updateMeteors(time: number): void {
    const cam = this.scene.cameras.main;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const t = time - m.t0 - m.at;
      if (t < 0) continue;
      const k = Math.min(1, t / m.dur);
      // 처음엔 빠르고 끝에서 살짝 느려진다
      const e = 1 - Math.pow(1 - k, 1.6);
      const p = this.toSky((m.x0 + m.dx * e) * cam.width, (m.y0 + m.dy * e) * cam.height);
      if (!m.head) {
        m.head = this.scene.add
          .image(p.x, p.y, TEX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScrollFactor(0)
          .setTint(m.color)
          .setDepth(DEPTH.weather - 2)
          .setScale((0.2 * m.size) / Math.max(1, cam.zoom / 3));
        if (i % 2 === 0) this.sfx.play("launch", 0.18 * (m.loud ? 1.2 : 1), 1.5, 6);
      }
      m.head.setPosition(p.x, p.y).setAlpha(k < 0.85 ? 1 : (1 - k) / 0.15);
      if (time >= m.trailAt && k < 1) {
        // 꼬리: 자리에 남아 금방 사그라드는 불티 (머리 쪽이 굵고 밝다)
        m.trailAt = time + (this.reduced ? 40 : 16);
        this.spawn(p.x, p.y, 0, 0, 380 + 140 * m.size, m.color, true, 0.75 * m.size, 4, 0);
        if (!this.reduced && Math.random() < 0.35) this.spawn(p.x, p.y, (Math.random() - 0.5) * 6, 4 + Math.random() * 6, 520, 0xfff0b0, true, 0.45, 2, 6);
      }
      if (k >= 1) {
        // 사라지는 자리에서 작게 반짝
        const n = this.budget(7);
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2;
          this.spawn(p.x, p.y, Math.cos(a) * 9, Math.sin(a) * 9, 480, q % 2 ? 0xffffff : m.color, true, 0.55, 3, 2);
        }
        if (i % 3 === 0) this.sfx.play("burst", 0.12, 1.8, 8);
        m.head.destroy();
        this.meteors.splice(i, 1);
      }
    }
  }

  /** 글자 → 불꽃이 설 점들 (캔버스에 한 번 그려 캐시) */
  private letterPoints(text: string): LetterMask {
    const hit = this.letterCache.get(text);
    if (hit) return hit;
    const res = letterMask(text);
    if (this.letterCache.size > 32) this.letterCache.clear();
    this.letterCache.set(text, res);
    return res;
  }

  /** 글자 폭죽: 가운데에서 글자 점들로 날아가 서고, 머물다 흘러내린다. f = 글자 1px의 크기(월드 또는 하늘 레이어 단위) */
  private letterBurst(bx: number, by: number, text: string, f: number, sky: boolean, size: number): void {
    const mask = this.letterPoints(text);
    this.spawnAll(bx, by, letterSparks(mask, f, size, this.budget(mask.pts.length / this.k)), sky);
    // 둘레에 작은 불꽃 고리 (글자를 감싸는 반짝임)
    this.explode(bx, by, Math.max(18, (mask.w * f) / 2), "ring", COLORS.silver, sky, 0.8, size * 0.7);
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

  private spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, sky: boolean, size: number, drag = 1.3, grav = GRAVITY): Spark | null {
    const img = this.take();
    if (!img) return null;
    img
      .setActive(true)
      .setVisible(true)
      .setTint(color)
      .setScrollFactor(sky ? 0 : 1)
      .setDepth(sky ? DEPTH.weather - 3 : DEPTH.lights + 10)
      .setPosition(x, y)
      .setScale(size)
      .setAlpha(1);
    const sp: Spark = { img, x, y, vx, vy, age: 0, life, sky, drag, grav, size, swapAt: Infinity, fadeFrom: 0 };
    this.sparks.push(sp);
    return sp;
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
   * life: 기본 수명 배율, size: 불티 크기. 무늬는 fwShapes.burstSparks
   */
  private explode(bx: number, by: number, R: number, pattern: Pattern, colors: readonly number[], sky: boolean, life: number, size: number): void {
    this.spawnAll(bx, by, burstSparks(pattern, R, colors, { life, size, budget: (n) => this.budget(n), reduced: this.reduced }), sky);
  }

  /** 불티 목록을 뿌린다. 늦게 나오는 불티(at)는 16ms 단위로 묶어 타이머로 */
  private spawnAll(bx: number, by: number, specs: readonly SparkSpec[], sky: boolean): void {
    const later = new Map<number, SparkSpec[]>();
    for (const s of specs) {
      if (s.at && s.at > 0) {
        const k = Math.round(s.at / 16) * 16;
        const list = later.get(k);
        if (list) list.push(s);
        else later.set(k, [s]);
        continue;
      }
      this.spawnSpec(bx, by, s, sky);
    }
    for (const [at, list] of later) this.later(at, () => list.forEach((s) => this.spawnSpec(bx, by, s, sky)));
  }

  private spawnSpec(bx: number, by: number, s: SparkSpec, sky: boolean): void {
    const sp = this.spawn(bx + (s.ox ?? 0), by + (s.oy ?? 0), s.vx, s.vy, s.life, s.color, sky, s.size, s.drag, s.grav);
    if (sp) {
      if (s.swapAt !== undefined) sp.swapAt = s.swapAt;
      if (s.fadeFrom !== undefined) sp.fadeFrom = s.fadeFrom;
    }
    if (s.pop) this.sfx.play("burst", sky ? 0.2 : 0.35, 1.7);
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
    if (r.pattern === "letters") {
      const text = r.label ?? LETTER_FALLBACK;
      const { w } = this.letterPoints(text);
      if (r.mode === "sky") {
        // 화면 밖에서 쏨: 하늘 레이어 위쪽에 화면 폭에 맞춰
        const p = this.skyPoint(r.x, view);
        const f = Math.min(1.7, (cam.width * 0.7) / cam.zoom / w);
        const q = this.toSky(cam.width / 2, cam.height * 0.2);
        this.bloom(q.x, q.y, 0xfff0c8, true, (w * f) / 40, 600);
        this.letterBurst(Math.max(q.x - cam.width * 0.3 / cam.zoom, Math.min(q.x + cam.width * 0.3 / cam.zoom, p.x)), q.y, text, f, true, 0.8);
        this.sfx.play("burst", 0.35 * plan.volume, 1.1);
        return;
      }
      const bx = r.x;
      const by = r.y - r.h;
      const f = Math.max(0.8, Math.min(2.2, (view.width * 0.8) / w));
      this.flashes.push({ x: bx, y: by, age: 0, r: plan.light, ms: LETTER_FLY + LETTER_HOLD });
      this.bloom(bx, by, 0xfff0c8, false, (w * f) / 40, 640);
      this.letterBurst(bx, by, text, f, false, 1);
      // 글자가 머무는 동안 은은한 빛
      this.bloom(bx, by, 0xffe8c0, false, (w * f) / 56, LETTER_FLY + LETTER_HOLD);
      this.sfx.play("burst", Math.min(1, 0.8 * (plan.volume / 0.7)) * (r.loud ? 1 : 0.9), 1.1);
      return;
    }
    if (r.ground) {
      // 분수: 발밑에서 뿜는 동안 둘레가 밝다
      this.flashes.push({ x: r.x, y: r.y - 12, age: 0, r: plan.light, ms: FOUNTAIN_MS });
      this.explode(r.x, r.y - r.h, r.r, r.pattern, r.colors, false, plan.life, 1);
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
    if (this.meteors.length) this.updateMeteors(time);
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
      const rise = r.ground ? 1 : finale ? SKY_RISE_MS : r.mode === "signal" ? RISE_MS * 0.8 : r.plan.power >= 4 ? RISE_MS * 1.15 : RISE_MS;
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
      stepSpark(p, dt);
      const look = sparkLook(p, this.reduced);
      p.img.setPosition(p.x, p.y).setAlpha(look.alpha).setScale(look.scale);
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
    return this.sparks.length + this.rockets.length + this.meteors.length;
  }

  destroy(): void {
    for (const p of this.sparks) p.img.destroy();
    for (const b of this.blooms) b.img.destroy();
    for (const img of this.free) img.destroy();
    this.skyGlow.destroy();
    for (const m of this.meteors) m.head?.destroy();
    this.meteors.length = 0;
    this.sparks.length = 0;
    this.blooms.length = 0;
    this.free.length = 0;
    this.rockets.length = 0;
    this.timers.length = 0;
  }
}
