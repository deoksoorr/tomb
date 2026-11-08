import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { heartPoint } from "./fxMath";
import type { Lighting } from "./Lighting";
import type { Sfx } from "./Sfx";

// 폭죽: 로켓이 솟아 터진다.
//  - fw_small  한 발 (금빛)
//  - fw_heart  분홍 하트 모양으로 퍼진다
//  - fw_triple 세 발이 연달아 (색이 다르다)
// 터지는 자리가 화면 밖이면 "하늘 레이어"(카메라 고정)에서 그 방향 위쪽 하늘에 작게 터뜨려 같은 채널 누구나 보게 한다.
// 입자는 미리 만든 풀에서 꺼내 쓴다 (프레임당 할당 없음). 터진 순간 둘레의 어둠도 잠깐 걷어낸다(lights).

const POOL = 420;
const GRAVITY = 26;
const RISE_MS = 720;
const BURST_H = 96;

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
  size: number;
};
type Bloom = { img: Phaser.GameObjects.Image; age: number; scale: number };
type Rocket = { x: number; y: number; y0: number; t0: number; delay: number; h: number; colors: readonly number[]; heart: boolean; sky: boolean; loud: boolean; trailAt: number; launched: boolean };
type Flash = { x: number; y: number; age: number };

const COLORS = {
  gold: [0xffe08a, 0xfff4d0, 0xffb860],
  pink: [0xff8fb8, 0xffc2d6, 0xff6f9f],
  cyan: [0x8fe0ff, 0xd8f6ff, 0x6ab8f0],
  violet: [0xd0a0ff, 0xf0dcff, 0xa070e8],
} as const;

export { heartPoint };

export class Fireworks {
  private readonly free: Phaser.GameObjects.Image[] = [];
  private readonly sparks: Spark[] = [];
  private readonly rockets: Rocket[] = [];
  private readonly flashes: Flash[] = [];
  private readonly blooms: Bloom[] = [];
  private readonly k: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    private readonly sfx: Sfx,
  ) {
    this.k = reduced ? 0.45 : 1;
    for (let i = 0; i < POOL; i++) {
      this.free.push(scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setActive(false));
    }
  }

  /** (x,y): 쏜 사람의 발밑 (월드 좌표). mine이면 소리를 조금 크게 */
  launch(item: string, x: number, y: number, view: Phaser.Geom.Rectangle, mine: boolean): void {
    const burstY = y - BURST_H;
    const onScreen = x > view.x - 40 && x < view.right + 40 && burstY > view.y - 80 && y < view.bottom + 60;
    const sky = !onScreen;
    const now = this.scene.time.now;
    const add = (dx: number, delay: number, h: number, colors: readonly number[], heart: boolean) => {
      this.rockets.push({ x: x + dx, y, y0: y, t0: now, delay, h, colors, heart, sky, loud: mine, trailAt: 0, launched: false });
    };
    if (item === "fw_heart") add(0, 0, BURST_H + 6, COLORS.pink, true);
    else if (item === "fw_triple") {
      add(-16, 0, BURST_H - 10, COLORS.cyan, false);
      add(0, 280, BURST_H + 8, COLORS.gold, false);
      add(16, 560, BURST_H, COLORS.violet, false);
    } else add(0, 0, BURST_H, COLORS.gold, false);
  }

  private take(): Phaser.GameObjects.Image | null {
    return this.free.pop() ?? null;
  }

  private spawn(x: number, y: number, vx: number, vy: number, life: number, color: number, sky: boolean, size: number, drag = 1.3): void {
    const img = this.take();
    if (!img) return;
    img
      .setActive(true)
      .setVisible(true)
      .setTint(color)
      .setScrollFactor(sky ? 0 : 1)
      .setDepth(sky ? DEPTH.weather - 3 : DEPTH.lights + 10)
      .setScale(size)
      .setAlpha(1);
    this.sparks.push({ img, x, y, vx, vy, age: 0, life, sky, drag, size });
  }

  /** 터지는 순간의 둥근 섬광 */
  private bloom(x: number, y: number, color: number, sky: boolean, scale: number): void {
    const img = this.scene.add
      .image(x, y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScrollFactor(sky ? 0 : 1)
      .setDepth(sky ? DEPTH.weather - 4 : DEPTH.lights + 9);
    this.blooms.push({ img, age: 0, scale });
  }

  /** 하늘 레이어 좌표: 화면 위쪽, 폭죽이 있는 방향 (카메라 고정 오브젝트는 줌 중심 기준 좌표) */
  private skyPoint(wx: number, view: Phaser.Geom.Rectangle): { x: number; y: number } {
    const cam = this.scene.cameras.main;
    const sx = Math.max(40, Math.min(cam.width - 40, ((wx - view.x) / view.width) * cam.width));
    const sy = cam.height * 0.16;
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    return { x: ox + (sx - ox) / cam.zoom, y: oy + (sy - oy) / cam.zoom };
  }

  private burst(r: Rocket, view: Phaser.Geom.Rectangle): void {
    let bx = r.x;
    let by = r.y0 - r.h;
    let scale = 1;
    if (r.sky) {
      const p = this.skyPoint(r.x, view);
      bx = p.x;
      by = p.y;
      scale = 0.6; // 멀리 하늘에서 작게
    } else this.flashes.push({ x: bx, y: by, age: 0 });
    const n = Math.round((r.heart ? 60 : 44) * this.k);
    const size = r.sky ? 0.7 : 1;
    this.bloom(bx, by, r.colors[0], r.sky, (r.heart ? 1.6 : 1.3) * scale);
    for (let i = 0; i < n; i++) {
      const c = r.colors[i % r.colors.length];
      if (r.heart) {
        // 하트 모양 그대로 커지도록 공기 저항을 작게
        const h = heartPoint((i / n) * Math.PI * 2);
        const sp = 52 * scale;
        this.spawn(bx, by, h.x * sp, h.y * sp, 1500 + Math.random() * 300, c, r.sky, size, 0.5);
      } else {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
        const sp = (40 + Math.random() * 30) * scale;
        this.spawn(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, 1200 + Math.random() * 500, c, r.sky, size);
      }
    }
    this.sfx.play("burst", r.sky ? 0.35 : 0.8);
  }

  update(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const t = time - r.t0 - r.delay;
      if (t < 0) continue;
      if (!r.launched) {
        r.launched = true;
        this.sfx.play("launch", r.sky ? 0.3 : r.loud ? 0.7 : 0.55);
      }
      const k = Math.min(1, t / RISE_MS);
      if (!r.sky) {
        // 로켓 꼬리: 솟는 동안 작은 불티
        const e = 1 - Math.pow(1 - k, 2);
        const ry = r.y0 - 8 - (r.h - 8) * e;
        const rx = r.x + Math.sin(t / 70) * 0.8;
        if (time >= r.trailAt) {
          r.trailAt = time + (this.reduced ? 90 : 35);
          this.spawn(rx, ry, (Math.random() - 0.5) * 6, 8 + Math.random() * 8, 380, 0xffe8b0, false, 1);
        }
      }
      if (k >= 1) {
        this.burst(r, view);
        this.rockets.splice(i, 1);
      }
    }
    const s = dt / 1000;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i];
      b.age += dt;
      const u = b.age / 520;
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
        this.sparks.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-s * p.drag);
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * (p.sky ? 0.5 : p.drag < 1 ? 0.45 : 1) * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const u = p.age / p.life;
      // 끝무렵엔 반짝이며 사라진다
      const twinkle = u > 0.6 && !this.reduced ? (Math.floor(p.age / 60) % 2 ? 0.5 : 1) : 1;
      p.img
        .setPosition(p.x, p.y)
        .setAlpha((1 - u * u) * twinkle)
        .setScale(p.size * (1 - 0.4 * u));
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].age += dt;
      if (this.flashes[i].age > 700) this.flashes.splice(i, 1);
    }
  }

  /** 터진 자리 둘레의 어둠을 잠깐 걷어낸다 */
  addLights(l: Lighting): void {
    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      l.add(f.x, f.y, 80, 0.85 * (1 - f.age / 700));
    }
  }

  get active(): number {
    return this.sparks.length + this.rockets.length;
  }

  destroy(): void {
    for (const p of this.sparks) p.img.destroy();
    for (const b of this.blooms) b.img.destroy();
    for (const img of this.free) img.destroy();
    this.sparks.length = 0;
    this.free.length = 0;
  }
}
