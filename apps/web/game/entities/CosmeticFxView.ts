import * as Phaser from "phaser";
import { addCanvasTexture, fxTexLedger } from "../assets/manifest";
import { DEPTH } from "../config";
import { CosmeticFxSim, FX_ART, fxArtGrid, type FxArtId, type FxCmd, type FxInput } from "../sprites/cosmeticFx";
import { markCharTint } from "../world/charTint";

// F8 꾸미기 연출(우산·풍선·날개·발자국·오라·펫)을 Phaser 이미지로 그린다. 움직임은 CosmeticFxSim(상점 미리보기와 같은 계산)이 정하고
// 여기서는 명령마다 이미지 하나를 돌려 쓴다 (텍스처는 처음 쓸 때 만든다).
// 11/22 염색한 날개는 (그림, 색)마다 텍스처 하나 (cfx-<그림>~<색>) — 쓰는 연출 수를 세어(fxTexLedger) 아무도 안 쓰면 잠깐 뒤 지운다

const texKey = (art: FxArtId, tex?: string) => (tex ? `cfx-${art}~${tex}` : `cfx-${art}`);

function ensureTex(scene: Phaser.Scene, art: FxArtId, tex?: string): string {
  const key = texKey(art, tex);
  if (!scene.textures.exists(key)) {
    const a = FX_ART[art];
    addCanvasTexture(scene, key, { canvas: fxArtGrid(art, tex).toCanvas(), frameW: a.w, frameH: a.h });
  }
  return key;
}

/**
 * 장면별 층 바꾸기 (scene.data "cfxDepth"): 사냥터처럼 밤 어둠 층이 없고 전투 효과·피해 숫자가 위에 와야 하는 장면은
 * 바닥 층을 그 장면 바닥 효과 바로 아래로, 빛 층을 몸 바로 앞(y 정렬 — 몬스터와 앞뒤로 섞이고 전투 효과·숫자보다 아래)으로 내린다
 */
/**
 * ground = 바닥 층 depth (또는 "body" = 몸 depth 바로 아래 — 탑승 장면처럼 그림이 순서대로 쌓이는 곳).
 * noCull = 화면 밖 생략을 하지 않는다 (탑승 장면은 카메라 worldView가 그림 좌표와 맞지 않는다).
 * staffSoft = 운영자 오라·발밑 안개를 몸 뒤로 보내고 투명도에 곱할 값 (사냥 화면: 사냥 장비를 가리지 않게. 없으면 그대로 화려하게)
 */
export type CfxDepth = { ground: number | "body"; lightOnBody: boolean; noCull?: true; staffSoft?: number };

export class CosmeticFxView {
  private readonly sim = new CosmeticFxSim();
  private pool: Phaser.GameObjects.Image[] = [];
  private cmds: FxCmd[] = [];
  private readonly depthCfg: CfxDepth | undefined;
  /** 11/22 지금 잡고 있는 염색 날개 텍스처 키 (원장 hold/release) */
  private held: string[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.depthCfg = scene.data?.get("cfxDepth") as CfxDepth | undefined;
  }

  /** body = 몸 id (프리미엄 외형 등급 연출), champ = 주간 랭킹 1위 값 (1위 오라), staff = 31번 운영자 (운영자 오라가 우선) */
  setLook(look: readonly string[], body?: string, champ?: number, staff?: boolean): void {
    this.sim.setLook(look, body, champ, staff);
    if (this.sim.empty) this.clear();
    this.hold(this.sim.dyedArt().map((d) => texKey(d.art, d.tex)));
  }

  /** 11/22 입은 아이템 색 (색 표기의 items — 날개를 그 색으로) */
  setDye(items: Readonly<Record<string, string>> | undefined): void {
    this.sim.setDye(items);
    this.hold(this.sim.dyedArt().map((d) => texKey(d.art, d.tex)));
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
    if (view && view.width > 0 && !this.depthCfg?.noCull) {
      const m = 48;
      // 보이는 몸 자리로 본다 (관람차·열기구처럼 앵커는 땅에 두고 그림만 띄우는 탑승 중에도)
      const by = input.aura?.base ?? input.headY;
      input.offscreen = input.x < view.x - m || input.x > view.right + m || by < view.y - m || by > view.bottom + m + 40;
    }
    if (this.depthCfg?.staffSoft !== undefined) input.staffSoft = this.depthCfg.staffSoft;
    this.sim.step(input, this.cmds);
    let i = 0;
    for (; i < this.cmds.length; i++) {
      const c = this.cmds[i];
      let img = this.pool[i];
      const key = ensureTex(this.scene, c.art, c.tex);
      if (!img) {
        img = markCharTint(this.scene.add.image(0, 0, key, c.frame));
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
      // 몸 뒤로 돈 입자는 어둡게 (곱하기 색), 앞은 그대로. 11/22 특수 색 가면 덮개는 그 색을 곱한다
      const dim = c.dim ?? 1;
      if (c.tint !== undefined) img.setTint(c.tint);
      else if (dim < 1) {
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

  /**
   * 염색 날개 텍스처 잡기: 지금 입은 날개·색의 키는 잡고, 안 쓰게 된 키는 놓는다 (원장이 잠깐 뒤 지운다).
   * 숨은 자세(수영·해먹 …)라 안 그리는 동안도 입고 있으면 잡아 둔다 (다시 나올 때 또 굽지 않게)
   */
  private hold(keys: readonly string[]): void {
    const next = [...new Set(keys)];
    if (next.length === this.held.length && next.every((k) => this.held.includes(k))) return;
    const ledger = fxTexLedger(this.scene.game);
    for (const k of next) if (!this.held.includes(k)) ledger.hold(k);
    for (const k of this.held) if (!next.includes(k)) ledger.release(k);
    this.held = next;
  }

  setVisible(v: boolean): void {
    if (!v) for (const img of this.pool) img.setVisible(false);
  }

  private clear(): void {
    for (const img of this.pool) img.destroy();
    this.pool = [];
    if (this.held.length) this.hold([]);
  }

  destroy(): void {
    this.clear();
  }
}
