import * as Phaser from "phaser";
import { BRANCH_INFO, type BranchId } from "@/lib/rpg/skillTree";

// 스킬 트리 연출 (모닥불 · 서리 · 넋). 특정 게임 그림을 쓰지 않고 코드로 그린 빛·입자로 겹겹이 쌓는다:
//   시전 컷인(몸 둘레 오라 번쩍) → 바닥 마법진/부채꼴 표시 → 폭발(번쩍 핵 + 충격파 고리 두세 겹 + 입자) → 잔불·파편·넋 빛 → 그을음·잔상
//   큰 피해 숫자·연속 타격 수("N HIT"), 강약 있는 흔들림, 짧은 줌 펀치·번쩍(초당 3번 이하)
// 움직임 줄이기면: 흔들림·번쩍·줌 없이 입자도 적게. 휴대폰(손가락 기기·작은 화면)은 입자 상한을 낮게.

const DEPTH_FX = 1e5 + 50;
const DEPTH_GROUND = -440;
const FONT = '"Galmuri11", "Galmuri9", monospace';
/** 번쩍임 사이 최소 간격 (초당 3번 이하) */
const FLASH_GAP_MS = 340;

export const SKT = {
  glow: "skfx-glow",
  ember: "skfx-ember",
  shard: "skfx-shard",
  wisp: "skfx-wisp",
  rune: "skfx-rune",
  pillar: "skfx-pillar",
} as const;

type Pal = { main: number; light: number; dark: number; parts: number[]; tex: string; blend: boolean };

export const PALETTES: Record<BranchId, Pal> = {
  ember: { main: BRANCH_INFO.ember.color, light: BRANCH_INFO.ember.light, dark: BRANCH_INFO.ember.dark, parts: [0xffe8a0, 0xffb040, 0xff6a1e, 0xe8401a], tex: SKT.ember, blend: true },
  frost: { main: BRANCH_INFO.frost.color, light: BRANCH_INFO.frost.light, dark: BRANCH_INFO.frost.dark, parts: [0xffffff, 0xd8f4ff, 0x9fdcff, 0x6ab8f0], tex: SKT.shard, blend: false },
  soul: { main: BRANCH_INFO.soul.color, light: BRANCH_INFO.soul.light, dark: BRANCH_INFO.soul.dark, parts: [0xd8c0ff, 0xb98aff, 0x9ff0dc, 0xf2ecff], tex: SKT.wisp, blend: true },
};

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  draw(c);
  return cv;
}

function ensure(scene: Phaser.Scene, key: string, cv: () => HTMLCanvasElement | null): void {
  if (scene.textures.exists(key)) return;
  const c = cv();
  if (c) scene.textures.addCanvas(key, c);
}

/** 연출 텍스처 (흰색으로 그리고 색은 틴트로) */
export function ensureSkillTextures(scene: Phaser.Scene): void {
  ensure(scene, SKT.glow, () =>
    canvas(32, 32, (c) => {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
    }),
  );
  ensure(scene, SKT.ember, () =>
    canvas(4, 4, (c) => {
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillRect(0, 1, 4, 2);
      c.fillRect(1, 0, 2, 4);
      c.fillStyle = "#fff";
      c.fillRect(1, 1, 2, 2);
    }),
  );
  ensure(scene, SKT.shard, () =>
    canvas(5, 7, (c) => {
      c.fillStyle = "#fff";
      c.beginPath();
      c.moveTo(2.5, 0);
      c.lineTo(5, 3.5);
      c.lineTo(2.5, 7);
      c.lineTo(0, 3.5);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(160,200,230,0.9)";
      c.fillRect(2, 3, 1, 3);
    }),
  );
  ensure(scene, SKT.wisp, () =>
    canvas(8, 8, (c) => {
      const g = c.createRadialGradient(4, 4, 0, 4, 4, 4);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.5, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 8, 8);
    }),
  );
  // 바닥 마법진: 두 겹 원 + 눈금 + 안쪽 별(오각) + 점 (이 게임 고유의 등불 무늬)
  ensure(scene, SKT.rune, () =>
    canvas(96, 96, (c) => {
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(48, 48, 45, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
      c.beginPath();
      c.arc(48, 48, 38, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r0 = i % 3 === 0 ? 38 : 41;
        c.beginPath();
        c.moveTo(48 + Math.cos(a) * r0, 48 + Math.sin(a) * r0);
        c.lineTo(48 + Math.cos(a) * 45, 48 + Math.sin(a) * 45);
        c.stroke();
      }
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        const x = 48 + Math.cos(a) * 30;
        const y = 48 + Math.sin(a) * 30;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.beginPath();
      c.arc(48, 48, 12, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        c.fillRect(48 + Math.cos(a) * 34 - 1, 48 + Math.sin(a) * 34 - 1, 2, 2);
      }
    }),
  );
  ensure(scene, SKT.pillar, () =>
    canvas(16, 64, (c) => {
      const g = c.createLinearGradient(0, 0, 16, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 64);
      const v = c.createLinearGradient(0, 0, 0, 64);
      v.addColorStop(0, "rgba(0,0,0,1)");
      v.addColorStop(0.4, "rgba(0,0,0,0)");
      c.globalCompositeOperation = "destination-out";
      c.fillStyle = v;
      c.fillRect(0, 0, 16, 64);
    }),
  );
}

function coarse(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720);
  } catch {
    return false;
  }
}

export class SkillFx {
  /** 동시에 떠 있는 입자 수 상한 (휴대폰은 낮게, 움직임 줄이기면 더 낮게) */
  readonly cap: number;
  private live = 0;
  private lastFlash = -1e9;
  private baseZoom = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    ensureSkillTextures(scene);
    this.cap = (coarse() ? 70 : 160) * (reduced ? 0.4 : 1);
  }

  private get zoom(): number {
    return this.scene.cameras.main.zoom || 1;
  }

  /** 입자 하나 (상한을 넘으면 그리지 않는다). 날아가 (dx,dy) 만큼 가고, rise만큼 위로(음수면 아래로 떨어짐) */
  particle(x: number, y: number, b: BranchId, dx: number, dy: number, ms: number, opts: { rise?: number; scale?: number; tint?: number; spin?: boolean; tex?: string; delay?: number } = {}): void {
    if (this.live >= this.cap) return;
    const p = PALETTES[b];
    const sc = this.scene;
    this.live++;
    const img = sc.add
      .image(x, y, opts.tex ?? p.tex)
      .setDepth(DEPTH_FX + 2)
      .setTint(opts.tint ?? pick(p.parts))
      .setScale(opts.scale ?? 1 + Math.random() * 0.8);
    if (p.blend || opts.tex === SKT.wisp || opts.tex === SKT.glow) img.setBlendMode(Phaser.BlendModes.ADD);
    if (opts.spin) img.setRotation(Math.random() * Math.PI);
    sc.tweens.add({
      targets: img,
      x: x + dx,
      y: y + dy - (opts.rise ?? 0),
      alpha: 0,
      scale: (opts.scale ?? 1) * 0.35,
      angle: opts.spin ? (Math.random() - 0.5) * 540 : 0,
      delay: opts.delay ?? 0,
      duration: ms,
      ease: "Cubic.easeOut",
      onComplete: () => {
        this.live--;
        img.destroy();
      },
    });
  }

  /** 빛 덩어리 하나 (번쩍임·오라). 크기 r(px) */
  glow(x: number, y: number, r: number, tint: number, ms: number, from = 0.3, alpha = 1, depth = DEPTH_FX): void {
    const g = this.scene.add
      .image(x, y, SKT.glow)
      .setDepth(depth)
      .setTint(tint)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((r / 16) * from);
    this.scene.tweens.add({ targets: g, scale: r / 16, alpha: 0, duration: ms, ease: "Quad.easeOut", onComplete: () => g.destroy() });
  }

  /** 시전 컷인: 몸 둘레 오라 번쩍 + 위로 솟는 빛 기둥(big) + 둘레에서 모여드는 입자 */
  cutIn(x: number, y: number, b: BranchId, big = false): void {
    const p = PALETTES[b];
    this.glow(x, y - 8, big ? 34 : 22, p.light, big ? 360 : 240, 0.2);
    this.glow(x, y - 8, big ? 22 : 14, 0xffffff, 160, 0.4, 0.9);
    if (big) {
      const pil = this.scene.add.image(x, y + 2, SKT.pillar).setOrigin(0.5, 1).setDepth(DEPTH_FX).setTint(p.light).setBlendMode(Phaser.BlendModes.ADD).setScale(1.6, 0.2);
      this.scene.tweens.add({ targets: pil, scaleY: 1.4, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => pil.destroy() });
    }
    const n = this.n(big ? 14 : 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = big ? 26 : 18;
      this.particle(x + Math.cos(a) * r, y - 6 + Math.sin(a) * r * 0.6, b, -Math.cos(a) * r * 0.9, -Math.sin(a) * r * 0.5, 260, { rise: 10, scale: 1.2 });
    }
    this.ring(x, y, big ? 30 : 20, p.light, 260, 2);
  }

  /** 입자 개수 보정 (움직임 줄이기면 줄인다) */
  n(k: number): number {
    return Math.max(1, Math.round(this.reduced ? k * 0.4 : k));
  }

  /** 바닥 마법진 (원형 경고): ms 동안 돌며 차오른다 */
  circle(x: number, y: number, r: number, b: BranchId, ms: number): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const rune = sc.add.image(x, y, SKT.rune).setDepth(DEPTH_GROUND).setTint(p.main).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    rune.setScale((r * 2) / 96, ((r * 2) / 96) * 0.62);
    const fill = sc.add.graphics().setDepth(DEPTH_GROUND - 1);
    const st = { t: 0 };
    sc.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      onUpdate: () => {
        rune.setAlpha(Math.min(1, st.t * 3) * 0.95).setRotation(st.t * 1.6);
        fill.clear().fillStyle(p.main, 0.12 + 0.18 * st.t).fillEllipse(x, y, r * 2 * st.t, r * 1.24 * st.t);
        fill.lineStyle(1, p.light, 0.6).strokeEllipse(x, y, r * 2, r * 1.24);
      },
      onComplete: () => {
        fill.destroy();
        sc.tweens.add({ targets: rune, alpha: 0, scaleX: rune.scaleX * 1.15, scaleY: rune.scaleY * 1.15, duration: 220, onComplete: () => rune.destroy() });
      },
    });
  }

  /** 부채꼴 경고 + 휩쓸기 (ang: 바라보는 각도) */
  cone(x: number, y: number, ang: number, range: number, arcDeg: number, b: BranchId, ms = 120): void {
    const p = PALETTES[b];
    const sc = this.scene;
    const g = sc.add.graphics().setDepth(DEPTH_GROUND);
    const half = (arcDeg / 2) * (Math.PI / 180);
    const st = { t: 0, a: 1 };
    const draw = () => {
      g.clear();
      g.fillStyle(p.main, 0.28 * st.a).slice(x, y, range * Math.min(1, st.t), ang - half, ang + half, false).fillPath();
      g.lineStyle(2, p.light, 0.9 * st.a).beginPath().arc(x, y, range * Math.min(1, st.t), ang - half, ang + half, false).strokePath();
    };
    sc.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      ease: "Quad.easeOut",
      onUpdate: draw,
      onComplete: () => sc.tweens.add({ targets: st, a: 0, duration: 240, onUpdate: draw, onComplete: () => g.destroy() }),
    });
    // 부채꼴을 따라 흩날리는 입자
    const n = this.n(18);
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() * 2 - 1) * half;
      const d = range * (0.5 + Math.random() * 0.6);
      this.particle(x + Math.cos(a) * 6, y + Math.sin(a) * 4 - 6, b, Math.cos(a) * d, Math.sin(a) * d * 0.8, 300 + Math.random() * 200, { rise: b === "ember" ? 8 : -4, spin: b === "frost", delay: Math.random() * 60 });
    }
  }

  /** 퍼지는 고리 하나 */
  ring(x: number, y: number, r: number, color: number, ms: number, w = 3, delay = 0, depth = DEPTH_FX - 1): void {
    const g = this.scene.add.graphics().setDepth(depth);
    const st = { r: r * 0.15, a: 1 };
    this.scene.tweens.add({
      targets: st,
      r,
      a: 0,
      delay,
      duration: ms,
      ease: "Cubic.easeOut",
      onUpdate: () => g.clear().lineStyle(w, color, st.a).strokeEllipse(x, y, st.r * 2, st.r * 1.24),
      onComplete: () => g.destroy(),
    });
  }

  /**
   * 폭발 (겹겹이): 번쩍 핵 → 충격파 고리 power+1겹 → 입자 폭발 → 잔불(위로)·얼음 파편(떨어짐)·넋 빛(맴돌다 오름) → 바닥 그을음.
   * power 1~3
   */
  burst(x: number, y: number, r: number, b: BranchId, power = 2): void {
    const p = PALETTES[b];
    const sc = this.scene;
    // 1) 핵 번쩍
    this.glow(x, y - 6, r * 0.9, p.light, 260 + power * 60, 0.25);
    this.glow(x, y - 6, r * 0.4, 0xffffff, 150, 0.3, 0.7);
    // 2) 충격파 고리 (바닥 + 공중)
    for (let i = 0; i <= power; i++) this.ring(x, y, r * (1 + i * 0.18), i === 0 ? p.light : i % 2 ? p.main : p.dark, 300 + i * 90, power >= 3 ? 4 - i * 0.6 : 3, i * 55, DEPTH_GROUND + 2);
    this.ring(x, y - 8, r * 0.8, p.light, 260, 2);
    // 3) 입자 폭발
    const n = this.n(10 + power * 8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const d = r * (0.6 + Math.random() * 0.7);
      this.particle(x, y - 6, b, Math.cos(a) * d, Math.sin(a) * d * 0.62, 340 + Math.random() * 260, { rise: b === "frost" ? -6 : 10 + Math.random() * 12, spin: b === "frost", scale: 1 + Math.random() * (power * 0.4) });
    }
    // 4) 잔여물 (조금 늦게): 모닥불은 잔불이 위로, 서리는 파편이 떨어지고, 넋은 빛이 맴돌다 오른다
    const m = this.n(4 + power * 4);
    for (let i = 0; i < m; i++) {
      const ox = (Math.random() - 0.5) * r * 1.4;
      const oy = (Math.random() - 0.5) * r * 0.8;
      if (b === "ember") this.particle(x + ox, y + oy, b, (Math.random() - 0.5) * 10, 0, 700 + Math.random() * 500, { rise: 24 + Math.random() * 20, delay: 120 + Math.random() * 200, scale: 0.8 });
      else if (b === "frost") this.particle(x + ox, y + oy - 16, b, (Math.random() - 0.5) * 8, 14, 600 + Math.random() * 300, { spin: true, delay: 100 + Math.random() * 200, tint: 0xffffff, scale: 0.7 });
      else this.particle(x + ox, y + oy, b, Math.sin(i) * 14, 0, 800 + Math.random() * 400, { rise: 30, delay: 100 + Math.random() * 250 });
    }
    // 5) 바닥 자국 (그을음·서리·넋 얼룩)
    const scar = sc.add.graphics().setDepth(DEPTH_GROUND - 2);
    const sst = { a: 0.55 };
    const color = b === "ember" ? 0x2a1208 : b === "frost" ? 0xd8f4ff : 0x3a2a5a;
    sc.tweens.add({
      targets: sst,
      a: 0,
      delay: 300,
      duration: 900,
      onUpdate: () => scar.clear().fillStyle(color, sst.a * (b === "frost" ? 0.5 : 0.6)).fillEllipse(x, y, r * 1.5, r * 0.9),
      onComplete: () => scar.destroy(),
    });
  }

  /** 잔상: 스프라이트를 갈래 색으로 한 장 남겨 흐려지게 */
  ghost(sprite: Phaser.GameObjects.Sprite, b: BranchId, alpha = 0.5): void {
    if (this.reduced || !sprite.texture) return;
    const g = this.scene.add
      .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame?.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setFlipX(sprite.flipX)
      .setDepth(sprite.depth - 1)
      .setTintFill(PALETTES[b].main)
      .setAlpha(alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.1, duration: 320, onComplete: () => g.destroy() });
  }

  /** 두 점 사이 빛줄기 (넋 사슬·순간이동 자국) */
  beam(x0: number, y0: number, x1: number, y1: number, b: BranchId, ms = 260, w = 2): void {
    const p = PALETTES[b];
    const g = this.scene.add.graphics().setDepth(DEPTH_FX).setBlendMode(Phaser.BlendModes.ADD);
    const st = { a: 1 };
    this.scene.tweens.add({
      targets: st,
      a: 0,
      duration: ms,
      onUpdate: () => g.clear().lineStyle(w + 2, p.main, 0.5 * st.a).lineBetween(x0, y0, x1, y1).lineStyle(w, p.light, st.a).lineBetween(x0, y0, x1, y1),
      onComplete: () => g.destroy(),
    });
  }

  /** 연속 타격 수 "N HIT" (3마리 이상 맞혔을 때 크게) */
  hitCount(n: number, x: number, y: number, b: BranchId): void {
    if (n < 3) return;
    const base = 1 / this.zoom;
    const color = `#${PALETTES[b].light.toString(16).padStart(6, "0")}`;
    const t = this.scene.add
      .text(x, y, `${n} HIT`, { fontFamily: FONT, fontSize: n >= 8 ? "18px" : "14px", color, stroke: "#120a14", strokeThickness: 4, resolution: 1 })
      .setOrigin(0.5, 1)
      .setDepth(1e6 + 5)
      .setScale(base * 2.2);
    this.scene.tweens.add({ targets: t, scale: base, duration: 160, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, delay: 520, duration: 420, onComplete: () => t.destroy() });
  }

  /**
   * 화면 손맛: 1 = 살짝 흔들림, 2 = 흔들림 + 줌 펀치, 3 = 강한 흔들림 + 줌 펀치 + 번쩍.
   * 움직임 줄이기면 아무것도 안 한다. 번쩍은 초당 3번 이하.
   */
  punch(level: 1 | 2 | 3, b: BranchId): void {
    if (this.reduced) return;
    const cam = this.scene.cameras.main;
    cam.shake(level === 1 ? 90 : level === 2 ? 150 : 240, level === 1 ? 0.0025 : level === 2 ? 0.0045 : 0.0075);
    if (level >= 2) {
      // 줌 펀치: 살짝 당겼다가 되돌린다 (겹쳐도 원래 배율로 돌아오게 기준을 기억해 둔다)
      if (!this.scene.tweens.isTweening(cam)) this.baseZoom = cam.zoom;
      const z = this.baseZoom || cam.zoom;
      this.scene.tweens.killTweensOf(cam);
      cam.setZoom(z * (level === 3 ? 1.08 : 1.045));
      this.scene.tweens.add({ targets: cam, zoom: z, duration: level === 3 ? 260 : 180, ease: "Quad.easeOut" });
    }
    if (level >= 3) {
      // 번쩍: 화면 전체를 갈래 색으로 옅게(최대 30%) 한 번 덮었다 걷는다 (초당 3번 이하)
      const now = performance.now();
      if (now - this.lastFlash >= FLASH_GAP_MS) {
        this.lastFlash = now;
        const f = this.scene.add
          .rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, PALETTES[b].light, 0.3)
          .setScrollFactor(0)
          .setDepth(2e6)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({ targets: f, alpha: 0, duration: 140, ease: "Quad.easeOut", onComplete: () => f.destroy() });
      }
    }
  }

  /** 줌 펀치 중 화면 크기가 바뀌면 (applyZoom) 기준 배율을 다시 잡는다 */
  resetZoom(z: number): void {
    this.scene.tweens.killTweensOf(this.scene.cameras.main);
    this.baseZoom = z;
  }

  /** 떠 있는 입자 수 (검수용) */
  get liveCount(): number {
    return this.live;
  }
}
