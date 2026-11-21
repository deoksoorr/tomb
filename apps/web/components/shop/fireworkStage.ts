// 폭죽 미리보기 무대의 계산 (그리기 없이): 게임과 같은 fwShapes·fxMath로 불티를 만들고 움직인다.
// 무대는 W×H 월드 px, 쏘는 사람은 바닥 가운데. 한 번 다 터지면 잠깐 쉬었다가 다시 쏜다(반복 재생).

import { itemById } from "@tomb/protocol";
import { fireworkPlan, fitBurst, FW_BASE_RADIUS, meteorShower, type FireworkPlan } from "@/game/world/fxMath";
import {
  burstSparks,
  finaleShots,
  fireworkShots,
  fireworkSpecial,
  FW_BURST_H,
  FW_COLORS,
  FW_RISE_MS,
  FW_SKY_RISE_MS,
  LETTER_FALLBACK,
  letterMask,
  letterSparks,
  rocketTrail,
  slowFactor,
  sparkLook,
  sparkState,
  sparkTrail,
  stepSpark,
  type FwPattern,
  type LetterMask,
  type SparkSpec,
  type SparkState,
} from "@/game/world/fwShapes";
import { showProgram } from "@/game/world/fwShow";

export const STAGE_W = 220;
export const STAGE_H = 150;
/** 쏘는 사람 발밑 */
export const FEET = { x: STAGE_W / 2, y: STAGE_H - 14 };
/** 다 터진 뒤 다시 쏠 때까지 */
const REST_MS = 700;
/** 미리보기 불티 최대 수 */
const CAP = 700;

export type StageSpark = SparkState & { color: number; alpha: number; scale: number };
export type StageBloom = { x: number; y: number; color: number; scale: number; age: number; ms: number };
type Rocket = { x: number; y: number; bx: number; by: number; at: number; rise: number; r: number; colors: readonly number[]; pattern: FwPattern; size: number; ground?: boolean; trailAt: number; scale?: number; finale?: boolean };
type Meteor = { at: number; dur: number; x0: number; y0: number; dx: number; dy: number; size: number; color: number; trailAt: number; head: { x: number; y: number; alpha: number } | null };

export class FireworkStage {
  readonly sparks: StageSpark[] = [];
  readonly blooms: StageBloom[] = [];
  readonly heads: { x: number; y: number; size: number; color: number; alpha: number }[] = [];
  /** 하늘 밝아짐 (0..1) */
  glow = 0;
  private rockets: Rocket[] = [];
  private meteors: Meteor[] = [];
  private timers: { at: number; run: () => void }[] = [];
  private t = 0;
  private idleSince = -1;
  private readonly plan: FireworkPlan;
  private readonly k: number;
  private mask: LetterMask | null = null;

  constructor(
    private readonly item: string,
    private readonly reduced: boolean,
    private readonly label: string,
  ) {
    this.plan = fireworkPlan(itemById(item)?.power, reduced);
    this.k = reduced ? 0.45 : 1;
    this.fire();
  }

  /** 프레임 시간 이동 평균 (게임처럼 느리면 입자 수를 줄인다 — 같은 기기에서 게임과 같은 밀도로 보이게) */
  private dtAvg = 16;
  private budget = (want: number) => Math.max(0, Math.min(Math.round(want * this.k * slowFactor(this.dtAvg)), CAP - this.sparks.length));

  private fire(): void {
    const { plan, item } = this;
    const now = this.t;
    const special = fireworkSpecial(item, plan);
    const stage = { x: 0, y: 0, width: STAGE_W, height: STAGE_H };
    if (special === "meteor") {
      meteorShower(this.reduced ? 5 : 12, this.reduced ? 2400 : 2600).forEach((m, i) =>
        this.meteors.push({ ...m, at: now + 150 + m.at, color: [0xffffff, 0xfff4d0, 0xd8f0ff, 0xffe0f0][i % 4], trailAt: 0, head: null }),
      );
      this.glow = Math.max(this.glow, this.reduced ? 0.12 : 0.22);
      return;
    }
    if (special === "show") {
      // 광역 불꽃쇼: 순서표를 빨리 감아(시간 ×0.45) 무대 전체에
      const prog = showProgram(item, this.reduced);
      const k = 0.45;
      const minDim = Math.min(STAGE_W, STAGE_H);
      for (const s of prog.shots) {
        const bx = s.fx * STAGE_W;
        const by = s.fy * STAGE_H;
        this.rockets.push({ x: (s.lx ?? s.fx) * STAGE_W, y: STAGE_H * 0.96, bx, by, at: now + s.delay * k, rise: FW_SKY_RISE_MS, r: s.rw ? s.rw * STAGE_W : s.h * minDim, colors: s.colors, pattern: s.pattern, size: s.big ? 1.1 : 0.9, trailAt: 0, finale: true });
      }
      for (const a of prog.auroras) this.aurora(now + a.at * k, a.dur * k);
      return;
    }
    if (special === "aurora") {
      this.aurora(now + 200, 6000);
      this.glow = Math.max(this.glow, 0.15);
      return;
    }
    if (special === "finale") {
      for (const s of finaleShots(plan, 300)) {
        const bx = s.fx * STAGE_W;
        const by = s.fy * STAGE_H;
        this.rockets.push({ x: bx, y: STAGE_H * 0.96, bx, by, at: now + s.delay, rise: FW_SKY_RISE_MS, r: s.h * Math.min(STAGE_W, STAGE_H), colors: s.colors, pattern: s.pattern, size: s.big ? 1.15 : 1, trailAt: 0, finale: true });
      }
      return;
    }
    if (special === "letter") {
      const h = fitBurst(FEET.x, FEET.y, FW_BURST_H + 8, 18, stage).h;
      this.rockets.push({ x: FEET.x, y: FEET.y, bx: FEET.x, by: FEET.y - h, at: now, rise: FW_RISE_MS, r: 0, colors: FW_COLORS.gold, pattern: "letters", size: 1, trailAt: 0 });
      return;
    }
    let h = FW_BURST_H;
    let r = FW_BASE_RADIUS * plan.radius;
    if (plan.power >= 4) {
      r = Math.min(FW_BASE_RADIUS * 4.6, Math.max(r, 0.42 * Math.min(STAGE_W, STAGE_H)));
      h = Math.max(64, Math.min(140, FEET.y - STAGE_H * 0.4));
    }
    for (const s of fireworkShots(item, plan, h)) {
      const x = FEET.x + s.dx;
      const rs = r * (s.scale ?? 1);
      const fit = s.ground ? { h: s.h, r: rs } : fitBurst(x, FEET.y, s.h, rs, stage);
      const rise = s.ground ? 1 : plan.power >= 4 ? FW_RISE_MS * 1.15 : FW_RISE_MS;
      this.rockets.push({ x, y: FEET.y, bx: x, by: FEET.y - fit.h, at: now + s.delay, rise, r: fit.r, colors: s.colors, pattern: s.pattern, size: 1, ground: s.ground, trailAt: 0, scale: s.scale });
    }
  }

  /** 오로라: 무대 위쪽에 초록·보라 띠 불티를 계속 흘린다 */
  private aurora(at: number, dur: number): void {
    for (let t = 0; t < dur; t += this.reduced ? 120 : 50) {
      this.timers.push({
        at: at + t,
        run: () => {
          for (let q = 0; q < 3; q++) {
            const fx = Math.random();
            const band = q % 2;
            const y = STAGE_H * (band ? 0.1 : 0.19) + Math.sin(fx * 7 + (at + t) * 0.0009) * STAGE_H * 0.04;
            const env = Math.min(1, t / 1200, (dur - t) / 1200);
            this.spawn(fx * STAGE_W, y, { vx: 0, vy: 5, life: 1200, color: band ? 0xc090ff : 0x7affb0, size: 1.6, drag: 0.6, grav: 0, bright: 0.5 * env, fadeFrom: 0.15 });
          }
        },
      });
    }
  }

  private spawn(x: number, y: number, s: SparkSpec): void {
    if (this.sparks.length >= CAP) return;
    this.sparks.push({ ...sparkState(x, y, s), color: s.color, alpha: 1, scale: s.size });
  }

  private spawnAll(x: number, y: number, specs: readonly SparkSpec[]): void {
    for (const s of specs) {
      if (s.at && s.at > 0) this.timers.push({ at: this.t + s.at, run: () => this.spawn(x, y, s) });
      else this.spawn(x, y, s);
    }
  }

  private burst(r: Rocket): void {
    const { plan } = this;
    if (r.pattern === "letters") {
      const text = this.label.trim().slice(0, 12) || LETTER_FALLBACK;
      this.mask ??= letterMask(text);
      const f = Math.max(0.8, Math.min(2.2, (STAGE_W * 0.8) / this.mask.w));
      this.blooms.push({ x: r.bx, y: r.by, color: 0xfff0c8, scale: (this.mask.w * f) / 40, age: 0, ms: 640 });
      this.spawnAll(r.bx, r.by, letterSparks(this.mask, f, 1, this.budget(this.mask.pts.length / this.k)));
      this.spawnAll(r.bx, r.by, burstSparks("ring", Math.max(18, (this.mask.w * f) / 2), FW_COLORS.silver, { life: 0.8, size: 0.7, budget: this.budget, reduced: this.reduced }));
      return;
    }
    const big = plan.power >= 4 || plan.sky;
    if (!r.ground) this.blooms.push({ x: r.bx, y: r.by, color: big ? 0xfff0c8 : r.colors[0], scale: big ? r.r / 16 : (r.pattern === "heart" ? 1.6 : 1.3) * (r.scale ?? 1), age: 0, ms: big ? 700 : 520 });
    this.spawnAll(r.bx, r.by, burstSparks(r.pattern, r.r, r.colors, { life: plan.life, size: r.size, budget: this.budget, reduced: this.reduced }));
    if (plan.lift > 0) this.glow = Math.min(plan.lift, this.glow + plan.lift * (plan.sky ? 0.5 : 1));
  }

  /** dt(ms)만큼 진행 */
  step(dt: number): void {
    this.t += dt;
    this.dtAvg += (Math.min(100, dt) - this.dtAvg) * 0.1;
    const t = this.t;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (t < this.timers[i].at) continue;
      const tm = this.timers[i];
      this.timers.splice(i, 1);
      tm.run();
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const u = t - r.at;
      if (u < 0) continue;
      const k = Math.min(1, u / r.rise);
      const e = 1 - Math.pow(1 - k, 2);
      if (t >= r.trailAt && k < 1) {
        r.trailAt = t + (this.reduced ? 90 : 35);
        const ry = r.y + (r.by - r.y) * e;
        const rx = r.x + (r.bx - r.x) * e + (r.pattern === "whistle" && !this.reduced ? Math.sin(u / 55) * 5 * (1 - k * 0.7) : 0);
        // 게임과 같은 로켓 꼬리 (피날레 로켓은 한 줄)
        const tail = r.finale ? rocketTrail(r.pattern === "whistle" ? "whistle" : "peony", 1) : rocketTrail(r.pattern, this.plan.power);
        for (const s of tail) this.spawn(rx + Math.sin(u / 70) * 0.8, ry, s);
      }
      if (k >= 1) {
        this.rockets.splice(i, 1);
        this.burst(r);
      }
    }
    this.heads.length = 0;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const u = t - m.at;
      if (u < 0) continue;
      const k = Math.min(1, u / m.dur);
      const e = 1 - Math.pow(1 - k, 1.6);
      const x = (m.x0 + m.dx * e) * STAGE_W;
      const y = (m.y0 + m.dy * e) * STAGE_H;
      if (t >= m.trailAt && k < 1) {
        m.trailAt = t + (this.reduced ? 40 : 16);
        this.spawn(x, y, { vx: 0, vy: 0, life: 380 + 140 * m.size, color: m.color, size: 0.75 * m.size, drag: 4, grav: 0 });
      }
      if (k >= 1) {
        const n = this.budget(7);
        for (let q = 0; q < n; q++) {
          const a = (q / n) * Math.PI * 2;
          this.spawn(x, y, { vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, life: 480, color: q % 2 ? 0xffffff : m.color, size: 0.55, drag: 3, grav: 2 });
        }
        this.meteors.splice(i, 1);
        continue;
      }
      this.heads.push({ x, y, size: m.size, color: m.color, alpha: k < 0.85 ? 1 : (1 - k) / 0.15 });
    }
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      b.age += dt;
      if (b.age >= b.ms) this.blooms.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        const last = this.sparks.pop()!;
        if (i < this.sparks.length) this.sparks[i] = last;
        continue;
      }
      stepSpark(p, dt);
      const look = sparkLook(p, this.reduced);
      p.alpha = look.alpha;
      p.scale = look.scale;
      const tail = sparkTrail(p, this.reduced);
      if (tail) this.spawn(p.x, p.y, tail);
    }
    this.glow *= Math.exp(-dt / 900);
    // 다 끝나면 잠깐 쉬고 다시 쏜다
    const idle = !this.sparks.length && !this.rockets.length && !this.meteors.length && !this.timers.length && !this.blooms.length;
    if (!idle) this.idleSince = -1;
    else if (this.idleSince < 0) this.idleSince = t;
    else if (t - this.idleSince >= REST_MS) {
      this.idleSince = -1;
      this.fire();
    }
  }
}

/** 폭죽 창 카드의 정지 그림: 한 번 터뜨려 보며 불꽃이 가장 활짝 핀 순간을 골라 그 장면을 복사해 둔다 */
export type StageSnapshot = Pick<FireworkStage, "sparks" | "blooms" | "heads" | "glow">;

export function stillScene(item: string, label = "", maxMs = 4200): StageSnapshot {
  const st = new FireworkStage(item, false, label);
  let best: StageSnapshot = { sparks: [], blooms: [], heads: [], glow: 0 };
  let bestScore = -1;
  const dt = 16;
  for (let t = 0; t < maxMs; t += dt) {
    st.step(dt);
    if (t % 48 !== 0 || st.sparks.length < 8) continue;
    // 점수 = 밝기(제곱 합 — 흐려지면 크게 깎인다) × 퍼진 정도 (갓 터진 섬광보다 활짝 핀 순간, 흐려지기 전)
    let sum = 0;
    let bright = 0;
    let cx = 0;
    let cy = 0;
    for (const p of st.sparks) {
      sum += p.alpha;
      bright += p.alpha * p.alpha;
      cx += p.x * p.alpha;
      cy += p.y * p.alpha;
    }
    if (sum <= 0) continue;
    cx /= sum;
    cy /= sum;
    let spread = 0;
    for (const p of st.sparks) spread += Math.hypot(p.x - cx, p.y - cy) * p.alpha;
    const score = bright * Math.sqrt(spread / sum + 1);
    if (score > bestScore) {
      bestScore = score;
      best = { sparks: st.sparks.map((p) => ({ ...p })), blooms: st.blooms.map((b) => ({ ...b })), heads: st.heads.map((h) => ({ ...h })), glow: st.glow };
    }
  }
  return best;
}
