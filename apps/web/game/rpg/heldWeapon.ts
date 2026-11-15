import * as Phaser from "phaser";
import type { IconArt } from "@/lib/rpg/catalog";
import { iconCanvas } from "./icons";
import { weaponGlow } from "./setGearRun";

// 11/15 사냥 중 손에 든 무기: 낀 무기 아이콘을 캐릭터 손 자리에 작게 들고 다닌다 (바라보는 쪽으로 뒤집힌다).
// 강화 +10 푸른 빛 · +13 보랏빛 · +15 금빛 반짝임 (game/rpg/setGearRun weaponGlow). 무기가 없으면 아무것도 안 그린다.

export class HeldWeapon {
  private readonly img: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image | null;
  private readonly spark: Phaser.GameObjects.Rectangle | null;
  private readonly fx: ReturnType<typeof weaponGlow>;

  constructor(
    private readonly scene: Phaser.Scene,
    art: IconArt,
    enh: number,
    glowTex: string,
    private readonly reduced: boolean,
  ) {
    const key = `rpg-held-${art.shape}-${art.main}-${art.accent}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, iconCanvas(art));
    this.fx = weaponGlow(enh);
    this.glow = this.fx
      ? scene.add
          .image(0, 0, glowTex)
          .setTint(this.fx.color)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(enh >= 15 ? 0.95 : 0.8)
      : null;
    this.img = scene.add.image(0, 0, key).setScale(0.75).setOrigin(0.25, 0.8);
    this.spark = this.fx?.spark ? scene.add.rectangle(0, 0, 2, 2, 0xffffff).setBlendMode(Phaser.BlendModes.ADD) : null;
  }

  /** 매 프레임: 캐릭터 발 자리(x, y)·바라보는 쪽·깊이·투명도 */
  update(x: number, y: number, faceX: number, faceY: number, depth: number, alpha: number, now: number): void {
    const left = faceX < -0.2;
    const back = faceY < -0.5 && Math.abs(faceX) < 0.5;
    const hx = x + (left ? -6 : 6);
    const hy = y - 7;
    this.img
      .setPosition(hx, hy)
      .setFlipX(left)
      .setOrigin(left ? 0.75 : 0.25, 0.8)
      .setDepth(depth + (back ? -0.5 : 0.5))
      .setAlpha(alpha);
    if (this.glow) {
      const pulse = this.reduced ? 0.8 : 0.75 + 0.25 * Math.sin(now / 220);
      this.glow
        .setPosition(hx + (left ? -3 : 3), hy - 4)
        .setDepth(depth + 0.4)
        .setAlpha(alpha * pulse);
    }
    if (this.spark) {
      // 금빛: 무기 위를 반짝이가 천천히 돈다
      const t = now / 260;
      this.spark
        .setPosition(hx + (left ? -1 : 1) * (3 + 3 * Math.cos(t)), hy - 6 + 3 * Math.sin(t * 1.3))
        .setDepth(depth + 0.6)
        .setAlpha(this.reduced ? 0.8 : alpha * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.1))))
        .setFillStyle(Math.sin(t * 2.1) > 0 ? 0xffffff : this.fx!.light);
    }
  }

  destroy(): void {
    this.img.destroy();
    this.glow?.destroy();
    this.spark?.destroy();
  }
}
