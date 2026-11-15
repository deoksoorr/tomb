import * as Phaser from "phaser";
import { css, makeCanvas } from "../sprites/pixel";

// 11/15 야근 빌딩 우두머리 상자: 우두머리가 쓰러진 자리에 떨어진다 (닫힌 채 금빛으로 숨 쉰다).
// 그 층을 다 깨면(남은 졸개까지) 덜컥 열리며 빛이 터지고, 안의 것은 사냥터 드롭과 같은 길(LootLayer — 등급별 빔·소리·줍기)로 튀어나온다.
// 층을 다 깨기 전에 쓰러지거나 나가면 열리지 않는다 (서버도 깬 층의 상자만 준다).

const TEX = "tw-boss-chest";
const W = 22;
const H = 20;

function chestCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W * 2, H);
  const R = (x: number, y: number, w: number, h: number, c: number) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(x, y, w, h);
  };
  for (let f = 0; f < 2; f++) {
    const o = f * W;
    const open = f === 1;
    // 몸통 (짙은 남색 결재함 + 금테)
    R(o + 2, 9, 18, 10, 0x141218);
    R(o + 3, 10, 16, 8, 0x2a3048);
    R(o + 3, 10, 16, 1, 0x4a5478);
    R(o + 3, 14, 16, 1, 0xd8a830);
    R(o + 2, 9, 1, 10, 0xd8a830);
    R(o + 19, 9, 1, 10, 0xd8a830);
    // 자물쇠 (빨간 「결재」 도장 무늬)
    R(o + 9, 12, 4, 4, open ? 0x8a6a20 : 0xf0c040);
    R(o + 10, 13, 2, 2, open ? 0x3a2a10 : 0xd03030);
    if (open) {
      // 열린 뚜껑 (뒤로 젖혀졌다) + 안의 빛
      R(o + 3, 2, 16, 5, 0x141218);
      R(o + 4, 3, 14, 3, 0x2a3048);
      R(o + 4, 5, 14, 1, 0xd8a830);
      R(o + 4, 8, 14, 2, 0xfff0a0);
      R(o + 6, 7, 10, 1, 0xffffff);
    } else {
      // 닫힌 뚜껑 (둥근 등)
      R(o + 2, 4, 18, 6, 0x141218);
      R(o + 3, 5, 16, 4, 0x2a3048);
      R(o + 3, 5, 16, 1, 0x4a5478);
      R(o + 3, 8, 16, 1, 0xd8a830);
      R(o + 10, 4, 2, 6, 0xd8a830);
    }
  }
  return canvas;
}

export class BossChest {
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly t0: number;
  private openAt = 0;
  opened = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    now: number,
    private readonly glowTex: string,
    private readonly reduced: boolean,
  ) {
    if (!scene.textures.exists(TEX)) {
      const t = scene.textures.addCanvas(TEX, chestCanvas());
      if (t) {
        t.add(0, 0, 0, 0, W, H);
        t.add(1, 0, W, 0, W, H);
      }
    }
    this.t0 = now;
    this.glow = scene.add.image(x, y - 6, glowTex).setTint(0xffd04a).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(y - 1).setScale(1.2, 0.8);
    this.img = scene.add.sprite(x, y, TEX, 0).setOrigin(0.5, 1).setDepth(y);
    // 위에서 툭 떨어진다
    this.img.y = y - 30;
    scene.tweens.add({ targets: this.img, y, duration: 320, ease: "Bounce.easeOut" });
  }

  /** 층을 깼다: 덜컥 열린다 (열리는 순간을 돌려준다 — 그때 드롭을 튀어 올린다) */
  open(now: number): number {
    this.opened = true;
    this.openAt = now + 380;
    // 들썩들썩 두 번 → 열림
    this.scene.tweens.add({ targets: this.img, scaleX: 1.15, scaleY: 0.85, yoyo: true, repeat: 1, duration: 90 });
    return this.openAt;
  }

  update(now: number): void {
    const t = now - this.t0;
    if (!this.opened || now < this.openAt) {
      // 닫힌 채 금빛이 숨 쉰다
      this.glow.setAlpha(Math.min(0.5, t / 600) * (this.reduced ? 0.8 : 0.6 + 0.4 * Math.sin(now / 180)));
      return;
    }
    if (this.img.frame.name !== "1") {
      this.img.setFrame(1);
      this.glow.setAlpha(1).setScale(2.6, 1.8);
      this.scene.tweens.add({ targets: this.glow, alpha: 0.35, scaleX: 1.4, scaleY: 1, duration: 700, ease: "Quad.easeOut" });
      // 뚜껑에서 빛줄기 (위로)
      const beam = this.scene.add.image(this.x, this.y - 8, this.glowTex).setTint(0xfff0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.y + 1).setDisplaySize(10, 4).setOrigin(0.5, 1);
      this.scene.tweens.add({ targets: beam, displayHeight: 70, alpha: 0, duration: 650, ease: "Quad.easeOut", onComplete: () => beam.destroy() });
    }
  }

  destroy(): void {
    this.img.destroy();
    this.glow.destroy();
  }
}
