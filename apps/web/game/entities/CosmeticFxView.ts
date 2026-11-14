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

/**
 * 장면별 층 바꾸기 (scene.data "cfxDepth"): 사냥터처럼 밤 어둠 층이 없고 전투 효과·피해 숫자가 위에 와야 하는 장면은
 * 바닥 층을 그 장면 바닥 효과 바로 아래로, 빛 층을 몸 바로 앞(y 정렬 — 몬스터와 앞뒤로 섞이고 전투 효과·숫자보다 아래)으로 내린다
 */
/** ground = 바닥 층 depth (또는 "body" = 몸 depth 바로 아래 — 탑승 장면처럼 그림이 순서대로 쌓이는 곳) */
export type CfxDepth = { ground: number | "body"; lightOnBody: boolean };

export class CosmeticFxView {
  private readonly sim = new CosmeticFxSim();
  private pool: Phaser.GameObjects.Image[] = [];
  private cmds: FxCmd[] = [];
  private readonly depthCfg: CfxDepth | undefined;

  constructor(private readonly scene: Phaser.Scene) {
    this.depthCfg = scene.data?.get("cfxDepth") as CfxDepth | undefined;
  }

  /** body = 몸 id (프리미엄 외형 등급 연출), champ = 주간 랭킹 1위 값 (1위 오라) */
  setLook(look: readonly string[], body?: string, champ?: number): void {
    this.sim.setLook(look, body, champ);
    if (this.sim.empty) this.clear();
  }

  /** 발바닥에서 연출 맨 위 (이름표 높이용, 없으면 0) */
  labelTop(artTop: number, shoulder: number): number {
    return this.sim.labelTop(artTop, shoulder);
  }

  /** fade = 실내로 들어가며 흐려지는 정도 (1 = 그대로) */
  sync(input: FxInput, visible: boolean, fade = 1): void {
    if (this.sim.empty) return;
    this.cmds.length = 0;
    // 화면 밖이면 무거운 연출(주간 1위 오라)은 그리지 않는다 (펫·발자국은 따라오던 자리를 이어 가야 해서 그대로 계산)
    const view = this.scene.cameras.main?.worldView;
    if (view && view.width > 0) {
      const m = 48;
      // 보이는 몸 자리로 본다 (관람차·열기구처럼 앵커는 땅에 두고 그림만 띄우는 탑승 중에도)
      const by = input.aura?.base ?? input.headY;
      input.offscreen = input.x < view.x - m || input.x > view.right + m || by < view.y - m || by > view.bottom + m + 40;
    }
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
      const cfg = this.depthCfg;
      const depth =
        c.layer === "ground"
          ? cfg?.ground === "body"
            ? (input.depth ?? input.y) - 0.45
            : (cfg?.ground ?? DEPTH.decal + 2)
          : c.layer === "light"
            ? cfg?.lightOnBody
              ? (input.depth ?? input.y) + 0.3
              : DEPTH.lights + 3
            : c.depth;
      // 몸 뒤로 돈 입자는 어둡게 (곱하기 색), 앞은 그대로
      const dim = c.dim ?? 1;
      if (dim < 1) {
        const v = Math.round(255 * Math.max(0, dim));
        img.setTint((v << 16) | (v << 8) | v);
      } else if (img.isTinted) img.clearTint();
      img
        .setOrigin(c.ox, c.oy)
        .setPosition(c.x, c.y)
        .setScale(c.sx, c.sy)
        .setRotation(c.rot)
        .setFlipX(c.flip)
        .setAlpha(c.alpha * fade)
        .setBlendMode(c.layer === "light" || c.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setDepth(depth)
        .setVisible(visible);
      // 물에 잠긴 펫: 아래쪽 crop줄을 잘라 수면 아래로 (crop이 없으면 되돌린다 — 이미지를 돌려 쓰므로)
      if (c.crop) {
        const a = FX_ART[c.art];
        img.setCrop(0, 0, a.w, Math.max(0, a.h - c.crop));
      } else if (img.isCropped) img.setCrop();
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
