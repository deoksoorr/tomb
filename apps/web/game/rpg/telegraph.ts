import * as Phaser from "phaser";
import { inTelegraph, type TelegraphShape } from "@/lib/rpg/patterns";

// 2번 범위 미리 표시: 바닥에 깔리는 경고 모양. 테두리는 처음부터 다 보이고, 안쪽이 빨갛게 차오르다
// 다 차면 번쩍이며 판정한다 (판정은 lib/rpg/patterns.ts inTelegraph — 보이는 모양 그대로).
// 게임 시간(멈춤·히트스톱을 뺀 시간)으로 움직이므로 멈추면 같이 멈춘다.

export type Telegraph = {
  shape: TelegraphShape;
  x: number;
  y: number;
  angle: number;
  start: number;
  end: number;
  color: number;
  /** 다 찼을 때 한 번 (판정·발사). 취소되면 부르지 않는다 */
  onFire?: (t: Telegraph) => void;
  /** 다 찬 뒤 잠깐 남는 번쩍임 끝 시각 */
  flashUntil: number;
  fired: boolean;
  cancelled: boolean;
};

const FLASH_MS = 160;
/** 땅바닥 위, 그림자 위 */
const DEPTH = -450;

export class TelegraphLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private list: Telegraph[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  add(shape: TelegraphShape, x: number, y: number, angle: number, now: number, windupMs: number, onFire?: (t: Telegraph) => void, color = 0xff3b30): Telegraph {
    const t: Telegraph = { shape, x, y, angle, start: now, end: now + windupMs, color, onFire, flashUntil: 0, fired: false, cancelled: false };
    this.list.push(t);
    return t;
  }

  cancel(t: Telegraph | null | undefined): void {
    if (t) t.cancelled = true;
  }

  /** 아직 판정 전인 경고 수 */
  get pending(): number {
    return this.list.filter((t) => !t.fired && !t.cancelled).length;
  }

  /** 지금 이 점이 어떤 경고 안에 있나 (검수·도움말용) */
  covers(x: number, y: number, r = 0): boolean {
    return this.list.some((t) => !t.fired && !t.cancelled && inTelegraph(t.shape, t.x, t.y, t.angle, x, y, r));
  }

  all(): readonly Telegraph[] {
    return this.list;
  }

  update(now: number): void {
    for (const t of this.list) {
      if (t.cancelled || t.fired || now < t.end) continue;
      t.fired = true;
      t.flashUntil = now + FLASH_MS;
      t.onFire?.(t);
    }
    this.list = this.list.filter((t) => !t.cancelled && (!t.fired || now < t.flashUntil));
    this.draw(now);
  }

  private draw(now: number): void {
    const g = this.g;
    g.clear();
    for (const t of this.list) {
      if (t.fired) {
        const a = Math.max(0, (t.flashUntil - now) / FLASH_MS);
        this.shape(g, t, 1, 0xffe0d0, 0.55 * a, 0xffffff, 0.9 * a);
        continue;
      }
      const p = Phaser.Math.Clamp((now - t.start) / Math.max(1, t.end - t.start), 0, 1);
      // 끝나기 직전엔 테두리가 깜빡인다
      const blink = p > 0.75 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 45)) : 0.75;
      this.shape(g, t, 1, t.color, 0.1, t.color, blink);
      this.shape(g, t, Math.max(0.02, p), t.color, 0.22 + 0.2 * p, 0, 0);
    }
  }

  /** k: 차오른 정도 (0..1). 채우기·테두리를 같이 그린다 (alpha 0이면 생략) */
  private shape(g: Phaser.GameObjects.Graphics, t: Telegraph, k: number, fill: number, fillA: number, line: number, lineA: number): void {
    const s = t.shape;
    if (fillA > 0) g.fillStyle(fill, fillA);
    if (lineA > 0) g.lineStyle(1, line, lineA);
    switch (s.kind) {
      case "circle": {
        // 위에서 비스듬히 내려다보는 바닥이라 세로를 조금 눌러 그린다 (판정은 원 그대로 — 차이는 작다)
        if (fillA > 0) g.fillCircle(t.x, t.y, s.r * k);
        if (lineA > 0) g.strokeCircle(t.x, t.y, s.r);
        break;
      }
      case "ring": {
        const w = (s.r1 - s.r0) * k;
        if (fillA > 0 && w > 0) {
          g.lineStyle(w, fill, fillA);
          g.strokeCircle(t.x, t.y, s.r0 + w / 2);
        }
        if (lineA > 0) {
          g.lineStyle(1, line, lineA);
          g.strokeCircle(t.x, t.y, s.r0);
          g.strokeCircle(t.x, t.y, s.r1);
        }
        break;
      }
      case "cone": {
        const half = (s.arcDeg / 2) * (Math.PI / 180);
        if (fillA > 0) {
          g.beginPath();
          g.moveTo(t.x, t.y);
          g.arc(t.x, t.y, s.r * k, t.angle - half, t.angle + half, false);
          g.closePath();
          g.fillPath();
        }
        if (lineA > 0) {
          g.beginPath();
          g.moveTo(t.x, t.y);
          g.arc(t.x, t.y, s.r, t.angle - half, t.angle + half, false);
          g.closePath();
          g.strokePath();
        }
        break;
      }
      case "line": {
        const ux = Math.cos(t.angle);
        const uy = Math.sin(t.angle);
        const nx = -uy * (s.width / 2);
        const ny = ux * (s.width / 2);
        const quad = (len: number) => [
          new Phaser.Math.Vector2(t.x + nx, t.y + ny),
          new Phaser.Math.Vector2(t.x + ux * len + nx, t.y + uy * len + ny),
          new Phaser.Math.Vector2(t.x + ux * len - nx, t.y + uy * len - ny),
          new Phaser.Math.Vector2(t.x - nx, t.y - ny),
        ];
        if (fillA > 0) g.fillPoints(quad(s.len * k), true);
        if (lineA > 0) g.strokePoints(quad(s.len), true);
        break;
      }
    }
  }

  destroy(): void {
    this.list = [];
    this.g.destroy();
  }
}
