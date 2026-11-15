import * as Phaser from "phaser";
import type { ThemeHost, ThemeMon } from "./runtime";

// 11/15 테마 실행부 공용 도구 (지하 주차장·구내식당):
//  - 그 판에서 이 테마에 몇 번째로 왔나 (판 모양·몬스터 성질이 바뀐다)
//  - 짧게 살다 사라지는 그림(불꽃·김·물방울)을 미리 만든 묶음에서 돌려 쓴다 (매번 만들고 부수지 않게, 한도를 넘으면 가장 오래된 것부터)
//  - 몬스터가 많을 때 가까운 몬스터만 찾는 칸 나누기 (매 프레임 다시 채운다)

/** 그 판에서 이 테마에 몇 번째로 왔나 (0부터 — 씬이 판 시드·시작 층으로 센다) */
export function themeVisit(host: ThemeHost): number {
  return Math.max(0, Math.floor(host.visit()));
}

type Bit = { img: Phaser.GameObjects.Image; vx: number; vy: number; g: number; life: number; max: number; s0: number; s1: number; a0: number; on: boolean };

/** 입자 묶음: 크기 cap개를 처음에 만들어 두고 돌려 쓴다 */
export class FxPool {
  private readonly bits: Bit[] = [];
  private at = 0;

  constructor(scene: Phaser.Scene, tex: string, cap: number, depth: number, add = true) {
    for (let i = 0; i < cap; i++) {
      const img = scene.add.image(-99, -99, tex).setDepth(depth).setVisible(false);
      if (add) img.setBlendMode(Phaser.BlendModes.ADD);
      this.bits.push({ img, vx: 0, vy: 0, g: 0, life: 0, max: 1, s0: 1, s1: 1, a0: 1, on: false });
    }
  }

  /** 하나 띄운다 (ms 동안, 속도 px/s, g = 아래로 당기는 힘). 다 쓰고 있으면 가장 오래된 것을 다시 쓴다 */
  emit(x: number, y: number, o: { vx?: number; vy?: number; g?: number; ms: number; tint: number; s0?: number; s1?: number; a?: number; depth?: number; tex?: string }): void {
    const b = this.bits[this.at];
    this.at = (this.at + 1) % this.bits.length;
    b.vx = o.vx ?? 0;
    b.vy = o.vy ?? 0;
    b.g = o.g ?? 0;
    b.life = 0;
    b.max = o.ms;
    b.s0 = o.s0 ?? 1;
    b.s1 = o.s1 ?? b.s0;
    b.a0 = o.a ?? 1;
    b.on = true;
    if (o.tex) b.img.setTexture(o.tex);
    b.img.setPosition(x, y).setTint(o.tint).setScale(b.s0).setAlpha(b.a0).setVisible(true);
    if (o.depth !== undefined) b.img.setDepth(o.depth);
  }

  update(dt: number): void {
    for (const b of this.bits) {
      if (!b.on) continue;
      b.life += dt * 1000;
      const t = b.life / b.max;
      if (t >= 1) {
        b.on = false;
        b.img.setVisible(false);
        continue;
      }
      b.vy += b.g * dt;
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt;
      b.img.setScale(b.s0 + (b.s1 - b.s0) * t).setAlpha(b.a0 * (1 - t * t));
    }
  }

  destroy(): void {
    for (const b of this.bits) b.img.destroy();
    this.bits.length = 0;
  }
}

/** 몬스터 칸 나누기 (칸 크기 cell). fill로 다시 채우고 near로 둘레 칸만 훑는다 */
export class MonGrid {
  private readonly cells = new Map<number, ThemeMon[]>();
  constructor(private readonly cell = 32) {}

  private key(cx: number, cy: number): number {
    return (cy + 64) * 1024 + (cx + 64);
  }

  fill(mons: readonly ThemeMon[]): void {
    for (const l of this.cells.values()) l.length = 0;
    for (const m of mons) {
      if (!m.alive) continue;
      const k = this.key(Math.floor(m.x / this.cell), Math.floor(m.y / this.cell));
      let l = this.cells.get(k);
      if (!l) this.cells.set(k, (l = []));
      l.push(m);
    }
  }

  /** (x,y)에서 r 안의 몬스터를 하나씩 fn에 (fn이 true면 멈춘다) */
  near(x: number, y: number, r: number, fn: (m: ThemeMon) => boolean | void): void {
    const c = this.cell;
    for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++)
      for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
        const l = this.cells.get(this.key(cx, cy));
        if (!l) continue;
        for (const m of l) if (m.alive && (m.x - x) ** 2 + (m.y - y) ** 2 <= r * r && fn(m)) return;
      }
  }
}
