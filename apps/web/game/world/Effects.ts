import * as Phaser from "phaser";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { Grid } from "../sprites/pixel";
import { DEPTH } from "../config";

// 짧은 연출: 달리기 먼지, 꽃 놓기·꽃잎, 살려주세요 빛, 흙 덮기, 아바타 머리 위 이모트 아이콘,
// 종소리 파동(채널 모두), 물 튀기기, 손 흔들기·환호 아이콘.
// 파티클 이미터는 미리 하나씩 만들어 두고 explode/emitParticleAt만 호출한다 (프레임당 할당 없음).

export class Effects {
  private readonly dustEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly petalEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dirtEm: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly scale: number;
  private readonly dropEm: Phaser.GameObjects.Particles.ParticleEmitter;

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
    makeActTextures(scene);
    this.dropEm = scene.add
      .particles(0, 0, TEX.spark, {
        lifespan: { min: 380, max: 620 },
        speed: { min: 26, max: 62 },
        angle: { min: 215, max: 325 },
        gravityY: 190,
        scale: { start: 0.7, end: 0.3 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xbfe8ff, 0x8fd0ff, 0xffffff],
        emitting: false,
      })
      .setDepth(DEPTH.lights + 2);
  }

  /** 종소리: 종에서 퍼지는 금빛 동심원 파동 */
  bellWave(x: number, y: number): void {
    const rings = this.reduced ? 1 : 3;
    for (let i = 0; i < rings; i++) {
      const r = this.scene.add
        .image(x, y, FX_RING)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd98a)
        .setDepth(DEPTH.lights + 3)
        .setScale(0.3)
        .setAlpha(0);
      this.scene.tweens.add({
        targets: r,
        scale: 5.5,
        alpha: { from: 0.85, to: 0 },
        delay: i * 280,
        duration: 1500,
        ease: "Sine.easeOut",
        onComplete: () => r.destroy(),
      });
    }
    const g = this.scene.add.image(x, y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a0).setDepth(DEPTH.lights + 2).setScale(0.6).setAlpha(0.7);
    this.scene.tweens.add({ targets: g, scale: 1.6, alpha: 0, duration: 900, ease: "Sine.easeOut", onComplete: () => g.destroy() });
    this.actIcon(x, y - 14, "bell");
  }

  /** 물 튀기기: 물방울 + 작은 물결 */
  splash(x: number, y: number): void {
    this.dropEm.explode(Math.ceil(16 * this.scale), x, y - 2);
    const r = this.scene.add.image(x, y, FX_RING).setTint(0xbfe8ff).setDepth(DEPTH.decal + 4).setScale(0.2, 0.1).setAlpha(0.9);
    this.scene.tweens.add({ targets: r, scaleX: 1.4, scaleY: 0.6, alpha: 0, duration: 900, ease: "Sine.easeOut", onComplete: () => r.destroy() });
  }

  /** 손 흔들기·환호·종 아이콘 (머리 위로 떠오른다) */
  actIcon(x: number, y: number, kind: "wave" | "cheer" | "bell"): void {
    const key = kind === "wave" ? FX_WAVE : kind === "cheer" ? FX_CHEER : FX_NOTE;
    const img = this.scene.add.image(x, y - 24, key).setDepth(DEPTH.bubble + 1);
    this.scene.tweens.add({ targets: img, y: y - 38, alpha: 0, duration: this.reduced ? 800 : 1400, ease: "Sine.easeOut", onComplete: () => img.destroy() });
    if (kind === "cheer") this.sparkEm.explode(Math.ceil(8 * this.scale), x, y - 16);
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

const FX_RING = "fx-act-ring";
const FX_WAVE = "fx-act-wave";
const FX_CHEER = "fx-act-cheer";
const FX_NOTE = "fx-act-note";

function makeActTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FX_RING)) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.stroke();
    addCanvasTexture(scene, FX_RING, { canvas: c, linear: true });
  }
  if (!scene.textures.exists(FX_WAVE)) {
    // 펼친 손
    const g = new Grid(9, 9);
    const skin = 0xf2e6c4;
    g.rect(2, 3, 5, 4, skin);
    for (const x of [2, 3, 4, 5]) g.vline(x, 0 + (x === 2 || x === 5 ? 1 : 0), 3, skin);
    g.set(7, 4, skin);
    g.set(8, 3, skin);
    g.outline(0x3a3027);
    addCanvasTexture(scene, FX_WAVE, { canvas: g.toCanvas() });
  }
  if (!scene.textures.exists(FX_CHEER)) {
    // 반짝이는 별 두 개
    const g = new Grid(11, 9);
    const star = (x: number, y: number, c: number) => {
      g.set(x, y, 0xffffff);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c);
    };
    star(3, 5, 0xffd060);
    star(8, 2, 0xff8fb8);
    g.set(8, 6, 0x8fe0ff);
    g.outline(0x3a3027);
    addCanvasTexture(scene, FX_CHEER, { canvas: g.toCanvas() });
  }
  if (!scene.textures.exists(FX_NOTE)) {
    // 음표
    const g = new Grid(8, 10);
    const c = 0xffe08a;
    g.vline(5, 1, 7, c);
    g.hline(5, 7, 1, c);
    g.set(7, 2, c);
    g.rect(2, 6, 3, 3, c);
    g.outline(0x3a3027);
    addCanvasTexture(scene, FX_NOTE, { canvas: g.toCanvas() });
  }
}
