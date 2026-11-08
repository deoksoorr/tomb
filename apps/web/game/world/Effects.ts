import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";

// 짧은 연출: 달리기 먼지, 꽃 놓기·꽃잎, 살려주세요 빛, 흙 덮기, 아바타 머리 위 이모트 아이콘.
// 파티클 이미터는 미리 하나씩 만들어 두고 explode/emitParticleAt만 호출한다 (프레임당 할당 없음).

export class Effects {
  private readonly dustEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly petalEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dirtEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly scale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    this.scale = reduced ? 0.35 : 1;
    this.dustEm = scene.add
      .particles(0, 0, TEX.dust, {
        lifespan: 420,
        speedX: { min: -14, max: 14 },
        speedY: { min: -12, max: -3 },
        scale: { start: 0.9, end: 0.3 },
        alpha: { start: 0.55, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.decal + 3);
    this.petalEm = scene.add
      .particles(0, 0, TEX.petal, {
        lifespan: { min: 700, max: 1100 },
        speed: { min: 18, max: 48 },
        angle: { min: 200, max: 340 },
        gravityY: 70,
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.lights - 1);
    this.sparkEm = scene.add
      .particles(0, 0, TEX.spark, {
        lifespan: { min: 600, max: 1100 },
        speedX: { min: -10, max: 10 },
        speedY: { min: -45, max: -18 },
        scale: { start: 1, end: 0.4 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.lights + 2);
    this.dirtEm = scene.add
      .particles(0, 0, TEX.dirt, {
        lifespan: { min: 500, max: 900 },
        speed: { min: 20, max: 60 },
        angle: { min: 220, max: 320 },
        gravityY: 160,
        alpha: { start: 1, end: 0.2 },
        emitting: false,
      })
      .setDepth(DEPTH.lights - 1);
  }

  dust(x: number, y: number): void {
    if (this.reduced && Math.random() < 0.6) return;
    this.dustEm.emitParticleAt(x, y - 1, 1);
  }

  flowerBurst(x: number, y: number): void {
    this.petalEm.explode(Math.ceil(14 * this.scale), x, y - 6);
  }

  /** 아바타 손에서 묘비로 꽃 한 송이가 날아간다 → 도착하면 꽃잎 */
  flowerToss(fx: number, fy: number, tx: number, ty: number): void {
    const img = this.scene.add.image(fx, fy - 8, TEX.flowerIcon).setDepth(DEPTH.lights - 1);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: this.reduced ? 200 : 420,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const t = state.t;
        img.setPosition(fx + (tx - fx) * t, fy - 8 + (ty - 2 - (fy - 8)) * t - Math.sin(Math.PI * t) * 10);
      },
      onComplete: () => {
        img.destroy();
        this.flowerBurst(tx, ty);
      },
    });
  }

  reviveGlow(x: number, y: number): void {
    const g = this.scene.add
      .image(x, y - 10, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights + 1)
      .setTint(0xffe7a8)
      .setScale(0.2)
      .setAlpha(0.95);
    this.scene.tweens.add({
      targets: g,
      scale: 1.1,
      alpha: 0,
      duration: 1300,
      ease: "Sine.easeOut",
      onComplete: () => g.destroy(),
    });
    this.sparkEm.explode(Math.ceil(10 * this.scale), x, y - 6);
  }

  /** 흙이 덮이는 연출 (묘비가 솟아오르는 건 GraveField.rise) */
  bury(x: number, y: number): void {
    const n = Math.ceil(26 * this.scale);
    this.dirtEm.explode(n, x, y);
    this.scene.time.delayedCall(250, () => this.dirtEm.explode(Math.ceil(n / 2), x, y - 2));
    for (let i = 0; i < 4; i++) this.dustEm.emitParticleAt(x - 6 + i * 4, y + 1, 1);
  }

  /** 아바타 머리 위로 떠오르는 작은 아이콘 */
  emoteIcon(x: number, y: number, kind: "flower" | "revive"): void {
    const img = this.scene.add
      .image(x, y - 24, kind === "flower" ? TEX.flowerIcon : TEX.reviveIcon)
      .setDepth(DEPTH.bubble + 1);
    this.scene.tweens.add({
      targets: img,
      y: y - 36,
      alpha: 0,
      duration: this.reduced ? 700 : 1300,
      ease: "Sine.easeOut",
      onComplete: () => img.destroy(),
    });
  }

  /** 랭킹에서 고른 묘비를 잠깐 강조 */
  highlight(x: number, y: number): void {
    this.reviveGlow(x, y);
  }
}
