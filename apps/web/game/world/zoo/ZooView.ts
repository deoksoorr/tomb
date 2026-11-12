import * as Phaser from "phaser";
import { ZOO, ZOO_GATE, ZOOKEEPER } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../../assets/manifest";
import { DEPTH } from "../../config";
import { FX_ART } from "../../sprites/cosmeticFx";
import { GY } from "../../sprites/graveyardProps";
import { WP } from "../../sprites/worldProps";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import { ensureZooTextures, ZOO_ARCH_TEX_H, ZOO_FENCE_W, ZTEX } from "./zooArt";
import { ZOO_DECOR, ZOO_FENCES, zooColliders, type ZooDecor, type ZooFence } from "./zooLayout";
import { ZOO_ANIMALS, zooPose, type ZooPose } from "./zooSim";

// 동물원 그리기 (Phaser): 나무 울타리·정문 아치·우리 장식·사육사와 노점·우리 안을 돌아다니는 동물.
// 배치·충돌은 zooLayout(순수), 동물 움직임은 zooSim(채널 시드 + 서버 시계로 모두가 같은 자리), 그림은 zooArt + cosmeticFx 펫 그림.
// 동물원 사각형이 화면에 걸칠 때만 동물을 계산하고 그린다.

export type ZooViewDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 정적 충돌 그룹 (WorldMap.colliders) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
  /** 서버 시계 (ms) */
  serverNow: () => number;
  /** 시드 (채널 번호) */
  seed: () => number;
};

/** 사육사 이름·직함 (월드 이름표와 분양 창이 같이 쓴다) */
export const KEEPER_NAME = "사육사 곰이";
export const KEEPER_TITLE = "펫 분양";

type AnimalView = { img: Phaser.GameObjects.Image; ripple: Phaser.GameObjects.Image; pose: ZooPose };

const cfxKey = (art: string) => `cfx-${art}`;

export class ZooView {
  private readonly scene: Phaser.Scene;
  private readonly animals: AnimalView[] = [];
  private readonly keeper: Phaser.GameObjects.Image;
  private keeperFrame = -1;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private shown = true;
  private readonly statics: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly d: ZooViewDeps) {
    const scene = (this.scene = d.scene);
    ensureZooTextures(scene);
    d.atlas.ensure("동물원" + KEEPER_NAME + KEEPER_TITLE + ZOO_DECOR.map((x) => x.label ?? "").join(""));
    this.drawFences();
    for (const x of ZOO_DECOR) this.drawDecor(x);
    // 사육사 (노점 앞)
    this.keeper = scene.add.image(ZOOKEEPER.x, ZOOKEEPER.y + 1, ZTEX.keeper(0)).setOrigin(0.5, 1).setDepth(ZOOKEEPER.y);
    this.label(ZOOKEEPER.x, ZOOKEEPER.y - 29, KEEPER_NAME, 0xffe8b0, 0.95);
    this.label(ZOOKEEPER.x, ZOOKEEPER.y - 37, KEEPER_TITLE, 0xc8e8b0, 0.85);
    for (const c of zooColliders()) this.addCollider(c.x, c.y, c.w, c.h);
    // 동물 (펫과 같은 그림)
    for (const a of ZOO_ANIMALS) {
      const key = cfxKey(a.art);
      if (!scene.textures.exists(key)) {
        const art = FX_ART[a.art];
        addCanvasTexture(scene, key, { canvas: art.build().toCanvas(), frameW: art.w, frameH: art.h });
      }
      const img = scene.add.image(0, 0, key, 0).setOrigin(0.5, 1);
      const ripple = scene.add.image(0, 0, ZTEX.ripple).setVisible(false);
      this.animals.push({ img, ripple, pose: { x: 0, y: 0, walking: false, face: 1, frame: 0, swimming: false } });
    }
    this.update(0, null);
  }

  private label(x: number, y: number, text: string, tint: number, alpha: number): void {
    const t = this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
  }

  private addCollider(x: number, y: number, w: number, h: number): void {
    const z = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
    this.scene.physics.add.existing(z, true);
    this.d.colliders.add(z);
  }

  /** 나무 울타리: 가로는 칸을 이어 붙이고, 세로는 8px마다 말뚝, 끝마다 모서리 말뚝 (붙은 우리의 같은 줄은 한 번만) */
  private drawFences(): void {
    const scene = this.scene;
    const seen = new Set<string>();
    const posts = new Set<string>();
    const post = (x: number, y: number) => {
      const k = `${x},${y}`;
      if (posts.has(k)) return;
      posts.add(k);
      this.statics.push(scene.add.image(x, y + 2, ZTEX.post).setOrigin(0.5, 1).setDepth(y + 1));
    };
    const key = (f: ZooFence) => `${f.x0},${f.y0},${f.x1},${f.y1}`;
    for (const f of ZOO_FENCES) {
      if (seen.has(key(f))) continue;
      seen.add(key(f));
      if (f.y0 === f.y1) {
        for (let x = f.x0; x < f.x1; x += ZOO_FENCE_W) {
          const w = Math.min(ZOO_FENCE_W, f.x1 - x);
          const img = scene.add.image(x, f.y0 + 1, ZTEX.fenceH).setOrigin(0, 1).setDepth(f.y0);
          if (w < ZOO_FENCE_W) img.setCrop(0, 0, w, img.height);
          this.statics.push(img);
        }
      } else {
        for (let y = f.y0 + 8; y <= f.y1; y += 8) this.statics.push(scene.add.image(f.x0, y + 1, ZTEX.fenceV).setOrigin(0.5, 1).setDepth(y));
      }
      post(f.x0, f.y0);
      post(f.x1, f.y1);
    }
  }

  private drawDecor(x: ZooDecor): void {
    const scene = this.scene;
    const img = (key: string, depth = x.y, frame?: number) => {
      const o = scene.add.image(x.x, x.y + 1, key, frame).setOrigin(0.5, 1).setDepth(depth);
      this.statics.push(o);
      return o;
    };
    switch (x.kind) {
      case "arch":
        img(ZTEX.arch, x.y + 2);
        this.label(x.x, x.y - ZOO_ARCH_TEX_H + 10, "동물원", 0x5a3a1a, 1);
        return;
      case "stall":
        img(ZTEX.stall);
        return;
      case "trough":
        img(ZTEX.trough);
        return;
      case "hay":
        img(ZTEX.hay);
        return;
      case "shed":
        img(ZTEX.shed);
        return;
      case "doghouse":
        img(ZTEX.doghouse);
        return;
      case "den":
        img(ZTEX.den);
        return;
      case "perch":
        img(ZTEX.perch);
        return;
      case "pond":
        img(ZTEX.pond, DEPTH.decal + 1);
        return;
      case "sign":
        img(ZTEX.sign);
        if (x.label) this.label(x.x, x.y - 15, x.label, 0xe8dcc0, 0.8);
        return;
      case "lantern":
        img(TEX.lantern);
        return;
      case "willow":
        img(GY.willow0);
        return;
      case "bush":
        img(WP.bush1);
        return;
      case "flowers":
        img(WP.flowers1, DEPTH.decal + 2);
        return;
    }
  }

  /** 1/zoom 배율 글씨 */
  scaleLabels(s: number): void {
    for (const l of this.labels) if (l.scaleX !== s) l.setScale(s);
  }

  /** 매 프레임: 사육사 숨쉬기, 화면에 걸치면 동물 자리 계산. view가 null이면 컬링 없이 */
  update(now: number, view: Phaser.Geom.Rectangle | null): void {
    const pad = 40;
    const on = !view || (view.right > ZOO.x - pad && view.x < ZOO.x + ZOO.w + pad && view.bottom > ZOO.y - pad && view.y < ZOO.y + ZOO.h + pad);
    if (on !== this.shown) {
      this.shown = on;
      for (const a of this.animals) {
        a.img.setVisible(on);
        if (!on) a.ripple.setVisible(false);
      }
    }
    if (!on) return;
    const f = this.d.reduced ? 0 : Math.floor(now / 700) % 2;
    if (f !== this.keeperFrame) {
      this.keeperFrame = f;
      this.keeper.setTexture(ZTEX.keeper(f));
    }
    const t = this.d.serverNow();
    const seed = this.d.seed();
    for (let i = 0; i < ZOO_ANIMALS.length; i++) {
      const a = ZOO_ANIMALS[i];
      const v = this.animals[i];
      const p = zooPose(a, i, seed, t, v.pose);
      const hover = a.hover ? a.hover + (this.d.reduced ? 0 : Math.sin(now / 420 + i) * 1.5) : 0;
      // 물 위의 거위는 반쯤 잠겨 떠 있다 (아랫부분을 자른다)
      const sink = p.swimming ? 5 : 0;
      v.img
        .setFrame(this.d.reduced ? 0 : p.frame)
        .setFlipX(p.face < 0)
        .setPosition(Math.round(p.x), Math.round(p.y - hover + sink))
        .setDepth(p.y);
      if (sink) v.img.setCrop(0, 0, a.w, a.h - sink);
      else if (v.img.isCropped) v.img.setCrop();
      v.ripple.setVisible(p.swimming).setPosition(Math.round(p.x), Math.round(p.y - 1)).setDepth(p.y + 0.1);
    }
  }

  destroy(): void {
    for (const a of this.animals) {
      a.img.destroy();
      a.ripple.destroy();
    }
    this.keeper.destroy();
    for (const l of this.labels) l.destroy();
    for (const o of this.statics) o.destroy();
  }
}

/** 정문 아치 가운데 (안내 화살표 자리) */
export const ZOO_ARCH_AT = { x: (ZOO_GATE.x0 + ZOO_GATE.x1) / 2, y: ZOO_GATE.y } as const;
