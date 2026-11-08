import * as Phaser from "phaser";
import { flowersKey, TEX } from "../assets/manifest";
import { DEPTH, TOOLTIP_EPITAPH, TOOLTIP_NAME } from "../config";
import { GRAVE_STONE_H, graveOriginY, graveTexKey } from "../sprites/graves";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { GravePlacement } from "../world/graveLayout";

// 묘비 한 기의 화면 표현. 화면에 보이는 행만 풀에서 꺼내 붙인다 (GraveField).
// 살려주세요가 많을수록 은은한 빛, 아주 많으면 미세한 흔들림 (prefers-reduced-motion이면 흔들림 없음).
// 부활 대기석 상위 3개에는 촛불, 1위에는 유령불까지.

const RISE_MS = 1100;

/** 살려주세요 수 → 0..1 (로그 스케일) */
export function reviveLevel(revives: number): number {
  return Math.max(0, Math.min(1, Math.log2(1 + Math.max(0, revives)) / 5));
}

type Light = { img: Phaser.GameObjects.Image; base: number; phase: number };

export class GraveView {
  p: GravePlacement | null = null;
  private readonly stone: Phaser.GameObjects.Image;
  private flowers: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private candles: Phaser.GameObjects.Sprite[] = [];
  private wisp: Phaser.GameObjects.Sprite | null = null;
  private lights: Light[] = [];
  private sway = 0;
  private glowBase = 0;
  private phase = 0;
  riseAt = 0;
  /** 매 프레임 갱신이 필요한지 (흔들림·빛·촛불·솟아오르기) */
  animated = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.stone = scene.add.image(0, 0, TEX.pixel).setVisible(false);
  }

  bind(p: GravePlacement, reduced: boolean, riseAt: number): void {
    this.p = p;
    this.riseAt = riseAt;
    this.phase = (p.index * 1.7) % (Math.PI * 2);
    const s = this.stone;
    s.setTexture(graveTexKey(p.tier, p.variant))
      .setOrigin(0.5, graveOriginY(p.tier))
      .setPosition(p.x, p.y)
      .setDepth(p.y)
      .setRotation(0)
      .setScale(1)
      .setVisible(true);

    if (p.flowers > 0) {
      if (!this.flowers) this.flowers = this.scene.add.image(0, 0, flowersKey(1)).setOrigin(0.5, 0);
      this.flowers.setTexture(flowersKey(p.flowers)).setPosition(p.x, p.y - 2).setDepth(p.y + 1).setVisible(true);
    } else this.flowers?.setVisible(false);

    const level = reviveLevel(p.revives);
    this.glowBase = p.rank >= 0 ? Math.max(0.3, level * 0.6) : level >= 0.4 ? 0.12 + 0.35 * level : 0;
    if (this.glowBase > 0) {
      if (!this.glow)
        this.glow = this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setTint(0xffdf9e);
      const h = GRAVE_STONE_H[p.tier];
      this.glow.setPosition(p.x, p.y - h / 2).setScale((h + 18) / 64).setVisible(true);
    } else this.glow?.setVisible(false);
    this.sway = !reduced && level >= 0.6 ? 0.012 + 0.03 * level : 0;

    this.clearExtras();
    if (p.rank >= 0 && p.rank < 3) {
      for (const dx of [-10, 10]) {
        const c = this.scene.add.sprite(p.x + dx, p.y + 2, TEX.candle, 0).setOrigin(0.5, 1).setDepth(p.y + 2);
        c.play({ key: "fx-candle-flicker", startFrame: dx > 0 ? 1 : 0 });
        this.candles.push(c);
        this.lights.push({ img: this.makeLight(p.x + dx, p.y - 4, 0.45, 0xffc870), base: 0.55, phase: dx });
      }
      if (p.rank === 0) {
        this.wisp = this.scene.add.sprite(p.x - 12, p.y - 26, TEX.wisp, 0).setDepth(DEPTH.lights + 1);
        this.wisp.play("fx-wisp-float");
        this.lights.push({ img: this.makeLight(p.x - 12, p.y - 26, 0.6, 0x9fdcf0), base: 0.7, phase: 3 });
      }
    }
    this.animated = this.sway > 0 || this.glowBase > 0 || this.lights.length > 0 || riseAt > 0;
  }

  private makeLight(x: number, y: number, scale: number, tint: number): Phaser.GameObjects.Image {
    return this.scene.add
      .image(x, y, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setScale(scale)
      .setTint(tint);
  }

  private clearExtras(): void {
    for (const c of this.candles) c.destroy();
    for (const l of this.lights) l.img.destroy();
    this.wisp?.destroy();
    this.candles = [];
    this.lights = [];
    this.wisp = null;
  }

  unbind(): void {
    this.p = null;
    this.stone.setVisible(false);
    this.flowers?.setVisible(false);
    this.glow?.setVisible(false);
    this.clearExtras();
    this.animated = false;
  }

  setVisible(v: boolean): void {
    if (this.stone.visible === v) return;
    this.stone.setVisible(v);
    if (this.flowers && this.p && this.p.flowers > 0) this.flowers.setVisible(v);
    if (this.glow && this.glowBase > 0) this.glow.setVisible(v);
    for (const c of this.candles) c.setVisible(v);
    for (const l of this.lights) l.img.setVisible(v);
    this.wisp?.setVisible(v);
  }

  /** lightLevel: 시간대 빛 세기 0..1 */
  update(now: number, lightLevel: number): void {
    const p = this.p;
    if (!p || !this.stone.visible) return;
    if (this.sway) this.stone.setRotation(Math.sin(now / 900 + this.phase) * this.sway);
    if (this.glow && this.glowBase > 0) {
      const pulse = 0.75 + 0.25 * Math.sin(now / 1300 + this.phase);
      this.glow.setAlpha(this.glowBase * pulse * (0.35 + 0.65 * lightLevel));
    }
    for (const l of this.lights) {
      const f = 0.8 + 0.12 * Math.sin(now / 90 + l.phase) + 0.08 * Math.sin(now / 37 + l.phase * 2);
      l.img.setAlpha(l.base * f * (0.3 + 0.7 * lightLevel));
    }
    if (this.wisp) {
      const wy = p.y - 26 + Math.sin(now / 700) * 3;
      const wx = p.x - 12 + Math.sin(now / 1100) * 2;
      this.wisp.setPosition(wx, wy);
      if (this.lights.length) this.lights[this.lights.length - 1].img.setPosition(wx, wy);
    }
    if (this.riseAt) {
      const t = Math.min(1, (now - this.riseAt) / RISE_MS);
      const e = t < 0.35 ? 0 : 1 - Math.pow(1 - (t - 0.35) / 0.65, 3);
      this.stone.setScale(1, Math.max(0.001, e));
      this.flowers?.setAlpha(e);
      if (t >= 1) {
        this.riseAt = 0;
        this.stone.setScale(1);
        this.flowers?.setAlpha(1);
      }
    }
  }

  destroy(): void {
    this.clearExtras();
    this.stone.destroy();
    this.flowers?.destroy();
    this.glow?.destroy();
  }
}

/** 부활 대기석으로 올라간 묘비의 원래 격자 자리: 빈 흙자리 + 작은 "↑" */
export class PlotView {
  index = -1;
  private readonly plot: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Image;
  private baseY = 0;

  constructor(scene: Phaser.Scene) {
    this.plot = scene.add.image(0, 0, TEX.plot).setDepth(DEPTH.decal).setVisible(false);
    this.marker = scene.add.image(0, 0, TEX.upMarker).setOrigin(0.5, 1).setVisible(false);
  }

  bind(index: number, x: number, y: number): void {
    this.index = index;
    this.baseY = y - 3;
    this.plot.setPosition(x, y - 2).setVisible(true);
    this.marker.setPosition(x, this.baseY).setDepth(y).setVisible(true);
  }

  unbind(): void {
    this.index = -1;
    this.plot.setVisible(false);
    this.marker.setVisible(false);
  }

  update(now: number, reduced: boolean): void {
    if (this.index < 0 || reduced) return;
    this.marker.setY(this.baseY - (Math.sin(now / 500 + this.index) > 0.6 ? 1 : 0));
  }

  setVisible(v: boolean): void {
    this.plot.setVisible(v);
    this.marker.setVisible(v);
  }

  destroy(): void {
    this.plot.destroy();
    this.marker.destroy();
  }
}

/** 근처 묘비 툴팁: 이름 + 묘비명 (BitmapText, 화면 1:1 픽셀) */
export class GraveTooltip {
  private readonly border: Phaser.GameObjects.Rectangle;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.BitmapText;
  private readonly epitaph: Phaser.GameObjects.BitmapText;
  private shownId: string | null = null;
  private anchor = { x: 0, y: 0 };
  private graveTop = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
  ) {
    this.border = scene.add.rectangle(0, 0, 1, 1, 0x4a4840, 0.95).setOrigin(0.5, 1).setDepth(DEPTH.tooltip);
    this.bg = scene.add.rectangle(0, 0, 1, 1, 0x121315, 0.88).setOrigin(0.5, 1).setDepth(DEPTH.tooltip + 1);
    this.name = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 0).setTint(TOOLTIP_NAME).setDepth(DEPTH.tooltip + 2);
    this.epitaph = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 0).setTint(TOOLTIP_EPITAPH).setDepth(DEPTH.tooltip + 2);
    this.hide();
  }

  show(p: GravePlacement, name: string, epitaph: string): void {
    if (this.shownId !== p.id || this.name.text !== name || this.epitaph.text !== epitaph) {
      this.atlas.ensure(name + epitaph);
      this.name.setText(name);
      this.epitaph.setText(epitaph);
      this.shownId = p.id;
    }
    this.graveTop = p.y - GRAVE_STONE_H[p.tier] - 3;
    this.anchor = { x: p.x, y: this.graveTop };
    for (const o of [this.border, this.bg, this.name, this.epitaph]) o.setVisible(true);
  }

  hide(): void {
    this.shownId = null;
    for (const o of [this.border, this.bg, this.name, this.epitaph]) o.setVisible(false);
  }

  get visible(): boolean {
    return this.shownId !== null;
  }

  /**
   * 줌에 맞춰 크기·위치를 맞춘다 (s = 1/zoom: 화면 1px의 월드 길이).
   * 묘비 뒤(위쪽)에 서 있으면 내 캐릭터·이름표를 가리지 않게 그 위로 올린다.
   */
  layout(s: number, playerY: number): void {
    if (!this.shownId) return;
    this.anchor.y = Math.min(this.graveTop, playerY - 20 - 16 * s);
    const pad = 5 * s;
    const lineH = (FONT_PX + 3) * s;
    this.name.setScale(s);
    this.epitaph.setScale(s);
    const hasEpitaph = this.epitaph.text.length > 0;
    const w = Math.max(this.name.width, this.epitaph.width) + pad * 2;
    const h = lineH * (hasEpitaph ? 2 : 1) + pad * 2 - 3 * s;
    const { x, y } = this.anchor;
    this.bg.setPosition(x, y).setSize(w, h);
    this.border.setPosition(x, y + s).setSize(w + 2 * s, h + 2 * s);
    this.name.setPosition(x, y - h + pad);
    this.epitaph.setPosition(x, y - h + pad + lineH);
  }

  destroy(): void {
    for (const o of [this.border, this.bg, this.name, this.epitaph]) o.destroy();
  }
}
