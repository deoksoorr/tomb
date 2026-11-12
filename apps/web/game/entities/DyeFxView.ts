import * as Phaser from "phaser";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH, prefersReducedMotion } from "../config";
import { AV_H, AV_W } from "../sprites/avatar";
import { buildPartMask, dyeFxAt, glintSpot, glowTime, maskPixels, specSpecials, type DyeFxPart } from "../sprites/dyeFx";

// 46번 특수 색 연출 (게임 안 아바타 하나): 특수 색 부위마다 "부위 가면" 텍스처를 아바타 위에 같은 프레임으로 겹쳐 색칠하고,
// 반짝 별을 띄운다. 아바타가 다른 텍스처(해먹에 눕기·집 안 자세)를 쓰는 동안은 숨는다.

type Layer = { fx: DyeFxPart; key: string; img: Phaser.GameObjects.Sprite; glint: Phaser.GameObjects.Image; frame: string | number | null };

export class DyeFxView {
  private layers: Layer[] = [];
  private sig = "";
  private texKey = "";
  private readonly salt = Math.floor(Math.random() * 1000);
  private readonly reduced = prefersReducedMotion();

  constructor(private readonly scene: Phaser.Scene) {}

  /** 특수 색 부위가 있는 색 표기면 true (없으면 아무것도 만들지 않는다) */
  static wants(spec: string): boolean {
    return specSpecials(spec).length > 0;
  }

  /** 색 표기·꾸미기·몸·아바타 텍스처 키가 바뀌면 가면을 다시 만든다 */
  set(spec: string, look: readonly string[], body: string, texKey: string): void {
    const sig = `${spec}|${look.join(",")}|${body}|${texKey}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.texKey = texKey;
    this.clear();
    for (const fx of specSpecials(spec)) {
      const key = `${texKey}#dye-${fx.part}`;
      if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: buildPartMask(spec, look, body, fx.part), frameW: AV_W, frameH: AV_H });
      const img = this.scene.add.sprite(0, 0, key, 0).setVisible(false);
      const glint = this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.layers.push({ fx, key, img, glint, frame: null });
    }
  }

  /** 아바타 스프라이트를 따라 그린다 (AvatarView.sync 끝에서) */
  sync(now: number, s: Phaser.GameObjects.Sprite): void {
    const on = s.visible && s.texture.key === this.texKey;
    const night = glowTime();
    // 움직임 줄이기: 무지개는 천천히 멈춘 듯, 반짝 별은 없다
    const t = this.reduced ? Math.floor(now / 4000) * 4000 : now;
    for (const L of this.layers) {
      if (!on) {
        if (L.img.visible) L.img.setVisible(false);
        if (L.glint.visible) L.glint.setVisible(false);
        continue;
      }
      const { layer, glint } = dyeFxAt(L.fx, t, this.salt, night);
      const name = s.frame.name;
      if (L.frame !== name) {
        L.frame = name;
        L.img.setFrame(name);
      }
      const depth = s.depth + 0.01;
      if (layer && layer.alpha > 0.01) {
        L.img
          .setPosition(s.x, s.y)
          .setDisplayOrigin(s.displayOriginX, s.displayOriginY)
          .setScale(s.scaleX, s.scaleY)
          .setAngle(s.angle)
          .setFlip(s.flipX, s.flipY)
          .setTint(layer.tint)
          .setBlendMode(layer.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setAlpha(layer.alpha * s.alpha)
          // 야광은 밤 어둠 위에 그려 정말 빛나 보이게 (후광 빛처럼 빛 층)
          .setDepth(L.fx.kind === "n" ? DEPTH.lights + 1 : depth)
          .setVisible(true);
      } else if (L.img.visible) L.img.setVisible(false);
      const p = !this.reduced && glint.k > 0.05 ? glintSpot(maskPixels(this.maskCanvas(L), Number(name)), glint.pick) : null;
      if (p) {
        const left = s.x - s.displayOriginX * s.scaleX;
        const top = s.y - s.displayOriginY * s.scaleY;
        L.glint
          .setPosition(left + (p.x + 0.5) * s.scaleX, top + (p.y + 0.5) * s.scaleY)
          .setScale(0.5 + 0.6 * glint.k)
          .setAlpha(Math.min(1, glint.k) * s.alpha)
          .setDepth(depth + 0.01)
          .setVisible(true);
      } else if (L.glint.visible) L.glint.setVisible(false);
    }
  }

  private maskCanvas(L: Layer): HTMLCanvasElement {
    return this.scene.textures.get(L.key).getSourceImage() as HTMLCanvasElement;
  }

  setVisible(v: boolean): void {
    if (v) return; // 보일 때는 다음 sync가 정한다
    for (const L of this.layers) {
      L.img.setVisible(false);
      L.glint.setVisible(false);
    }
  }

  private clear(): void {
    for (const L of this.layers) {
      L.img.destroy();
      L.glint.destroy();
    }
    this.layers = [];
  }

  destroy(): void {
    this.clear();
    this.sig = "";
  }
}
