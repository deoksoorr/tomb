import * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { CosmeticFxSim, FX_ART, type FxArtId, type FxCmd, type FxInput } from "../sprites/cosmeticFx";

// F8 꾸미기 연출(우산·풍선·날개·발자국·오라·펫)을 Phaser 이미지로 그린다. 움직임은 CosmeticFxSim(상점 미리보기와 같은 계산)이 정하고
// 여기서는 명령마다 이미지 하나를 돌려 쓴다 (텍스처는 처음 쓸 때 만든다).

const texKey = (art: FxArtId) => `cfx-${art}`;

function ensureTex(scene: Phaser.Scene, art: FxArtId): string {
  const key = texKey(art);
  if (!scene.textures.exists(key)) {
    const a = FX_ART[art];
    addCanvasTexture(scene, key, { canvas: a.build().toCanvas(), frameW: a.w, frameH: a.h });
  }
  return key;
}

export class CosmeticFxView {
  private readonly sim = new CosmeticFxSim();
  private pool: Phaser.GameObjects.Image[] = [];
  private cmds: FxCmd[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  setLook(look: readonly string[]): void {
    this.sim.setLook(look);
    if (this.sim.empty) this.clear();
  }

  /** 발바닥에서 연출 맨 위 (이름표 높이용, 없으면 0) */
  labelTop(artTop: number, shoulder: number): number {
    return this.sim.labelTop(artTop, shoulder);
  }

  sync(input: FxInput, visible: boolean): void {
    if (this.sim.empty) return;
    this.cmds.length = 0;
    this.sim.step(input, this.cmds);
    let i = 0;
    for (; i < this.cmds.length; i++) {
      const c = this.cmds[i];
      let img = this.pool[i];
      const key = ensureTex(this.scene, c.art);
      if (!img) {
        img = this.scene.add.image(0, 0, key, c.frame);
        this.pool.push(img);
      } else if (img.texture.key !== key || String(img.frame.name) !== String(c.frame)) img.setTexture(key, c.frame);
      const depth = c.layer === "ground" ? DEPTH.decal + 2 : c.layer === "light" ? DEPTH.lights + 3 : c.depth;
      img
        .setOrigin(c.ox, c.oy)
        .setPosition(c.x, c.y)
        .setScale(c.sx, c.sy)
        .setRotation(c.rot)
        .setFlipX(c.flip)
        .setAlpha(c.alpha)
        .setBlendMode(c.layer === "light" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setDepth(depth)
        .setVisible(visible);
    }
    for (; i < this.pool.length; i++) if (this.pool[i].visible) this.pool[i].setVisible(false);
  }

  setVisible(v: boolean): void {
    if (!v) for (const img of this.pool) img.setVisible(false);
  }

  private clear(): void {
    for (const img of this.pool) img.destroy();
    this.pool = [];
  }

  destroy(): void {
    this.clear();
  }
}
