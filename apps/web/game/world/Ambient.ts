import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import type { Ambient as AmbientMode } from "../theme";
import type { TreeSpot } from "./WorldMap";

// 테마 분위기 파티클.
//  - sakura: 화면 안에서 비스듬히 흩날리는 꽃잎 (작은 풀, 화면 밖으로 나가면 위쪽에서 다시)
//  - gothic: 나무 몇 그루에 앉은 까마귀(가끔 고개를 돌림) + 이따금 화면을 가로질러 나는 까마귀
//  - temple: 없음 (반딧불·안개는 Atmosphere)
// prefers-reduced-motion이면 꽃잎 수를 크게 줄이고 천천히, 나는 까마귀는 없다.

const PETALS = 34;
const PETALS_REDUCED = 8;

type Petal = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; phase: number };
type Flyer = { img: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; t0: number };

export class Ambient {
  private mode: AmbientMode = "none";
  private petals: Petal[] = [];
  private perched: Phaser.GameObjects.Sprite[] = [];
  private flyer: Flyer | null = null;
  private nextFlyAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {}

  /** 테마·나무 배치가 바뀔 때 */
  set(mode: AmbientMode, trees: readonly TreeSpot[]): void {
    this.clear();
    this.mode = mode;
    if (mode === "petals") {
      const n = this.reduced ? PETALS_REDUCED : PETALS;
      for (let i = 0; i < n; i++) {
        const img = this.scene.add.image(0, 0, TEX.petalPink).setDepth(DEPTH.weather - 2).setVisible(false);
        this.petals.push({ img, x: NaN, y: 0, vx: 0, vy: 0, phase: Math.random() * 10 });
      }
    } else if (mode === "crows") {
      // 세 그루에 한 그루 꼴로 (결정적으로) 까마귀가 앉아 있다
      trees.forEach((t, i) => {
        if ((i * 7 + Math.round(t.x)) % 3 !== 0) return;
        const c = this.scene.add
          .sprite(t.x + (t.dead ? 3 : 2), t.y - (t.dead ? 30 : 34), TEX.crowPerch, i % 2)
          .setOrigin(0.5, 1)
          .setDepth(t.y + 1);
        this.perched.push(c);
      });
      this.nextFlyAt = 0;
    }
  }

  private clear(): void {
    for (const p of this.petals) p.img.destroy();
    for (const c of this.perched) c.destroy();
    this.flyer?.img.destroy();
    this.petals = [];
    this.perched = [];
    this.flyer = null;
  }

  update(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    if (this.mode === "petals") this.updatePetals(time, dt, view);
    else if (this.mode === "crows") this.updateCrows(time, dt, view);
  }

  private updatePetals(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    const k = dt / 1000;
    const slow = this.reduced ? 0.4 : 1;
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      const out = !(p.x > view.x - 20 && p.x < view.right + 20 && p.y > view.y - 20 && p.y < view.bottom + 20);
      if (Number.isNaN(p.x) || out) {
        // 처음엔 화면 아무 데나, 그 뒤로는 위쪽·왼쪽 가장자리에서 들어온다
        const fresh = Number.isNaN(p.x);
        p.x = fresh || Math.random() < 0.5 ? view.x + Math.random() * view.width : view.x - 10;
        p.y = fresh ? view.y + Math.random() * view.height : view.y - 10 - Math.random() * 20;
        p.vx = (8 + Math.random() * 10) * slow;
        p.vy = (10 + Math.random() * 10) * slow;
      }
      p.x += (p.vx + Math.sin(time / 700 + p.phase) * 8 * slow) * k;
      p.y += p.vy * k;
      p.img
        .setPosition(p.x, p.y)
        .setRotation(this.reduced ? 0 : Math.sin(time / 400 + p.phase) * 0.8)
        .setAlpha(0.85)
        .setVisible(true);
    }
  }

  private updateCrows(time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    // 앉은 까마귀: 가끔 고개를 돌린다
    for (let i = 0; i < this.perched.length; i++) {
      const c = this.perched[i];
      if (!this.reduced && Math.floor((time + i * 1700) / 2600) % 3 === 0) c.setFrame(1);
      else c.setFrame(0);
    }
    if (this.reduced) return;
    if (!this.flyer && time >= this.nextFlyAt) {
      if (this.nextFlyAt === 0) {
        this.nextFlyAt = time + 6000 + Math.random() * 8000;
        return;
      }
      const fromLeft = Math.random() < 0.5;
      const img = this.scene.add.sprite(0, 0, TEX.crowFly, 0).setDepth(DEPTH.weather - 1).setFlipX(!fromLeft);
      this.flyer = {
        img,
        x: fromLeft ? view.x - 12 : view.right + 12,
        y: view.y + view.height * (0.12 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (55 + Math.random() * 25),
        t0: time,
      };
    }
    const f = this.flyer;
    if (f) {
      f.x += (f.vx * dt) / 1000;
      const y = f.y + Math.sin((time - f.t0) / 300) * 3;
      f.img.setPosition(f.x, y).setFrame(Math.floor((time - f.t0) / 160) % 2);
      if (f.x < view.x - 40 || f.x > view.right + 40) {
        f.img.destroy();
        this.flyer = null;
        this.nextFlyAt = time + 15_000 + Math.random() * 20_000;
      }
    }
  }

  destroy(): void {
    this.clear();
  }
}
