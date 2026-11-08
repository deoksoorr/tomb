import * as Phaser from "phaser";
import { flowersKey, TEX } from "../assets/manifest";
import { DEPTH, TOOLTIP_EPITAPH, TOOLTIP_NAME } from "../config";
import { SHAPE_SIZE } from "../graveShape";
import { GRAVE_STONE_H, graveOriginY, graveTexKey, MONITOR_CURSOR, ROCKET_TIP, SERVER_LEDS } from "../sprites/graves";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { GravePlacement } from "../world/graveLayout";

// 묘비 한 기의 화면 표현. 화면에 보이는 행만 풀에서 꺼내 붙인다 (GraveField).
// 살려주세요가 많을수록 은은한 빛, 아주 많으면 미세한 흔들림 (prefers-reduced-motion이면 흔들림 없음).
// 부활 대기석 상위 3개에는 촛불, 1위에는 유령불까지. 묘비 꾸미기(촛불·화환·리본·작은 석등·유령 고양이·별빛)도 여기서.
// 유료 디자인은 저마다 작은 움직임이 있다 (커피 김, 커서 깜빡, LED, 꽃잎, 로켓 불빛, 수정 빛, 금빛 반짝 …).
// 움직임은 화면에 보이는 묘비만 갱신하고, prefers-reduced-motion이면 멈춘 그림으로 둔다.
// 내 묘비(graves:mine)에는 금빛 작은 깃발을 꽂아 맵에서 바로 찾게 한다.

const RISE_MS = 1100;

/** 살려주세요 수 → 0..1 (로그 스케일) */
export function reviveLevel(revives: number): number {
  return Math.max(0, Math.min(1, Math.log2(1 + Math.max(0, revives)) / 5));
}

type Light = { img: Phaser.GameObjects.Image; base: number; phase: number };
type Star = { img: Phaser.GameObjects.Image; t0: number };
type Fx = { img: Phaser.GameObjects.Image; a: number; b: number };

const GREEN = 0x6ae07a;
const AMBER = 0xf0b040;

export class GraveView {
  p: GravePlacement | null = null;
  private readonly stone: Phaser.GameObjects.Image;
  private flowers: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private candles: Phaser.GameObjects.Sprite[] = [];
  private wisp: Phaser.GameObjects.Sprite | null = null;
  private lights: Light[] = [];
  private decorObjs: Phaser.GameObjects.GameObject[] = [];
  private cat: Phaser.GameObjects.Sprite | null = null;
  private stars: Star[] = [];
  private fx: Fx[] = [];
  private fxGlow: Phaser.GameObjects.Image | null = null;
  private flag: Phaser.GameObjects.Image | null = null;
  private sway = 0;
  private glowBase = 0;
  private phase = 0;
  private reduced = false;
  riseAt = 0;
  /** 매 프레임 갱신이 필요한지 (흔들림·빛·촛불·솟아오르기·꾸미기) */
  animated = false;
  /** 어둠 걷어내기용: 묘비 위 스폿 세기 (부활 대기석·꾸미기 빛이 있으면 더 밝게) */
  spot = 0.3;
  /** 촛불·작은 석등 꾸미기가 있으면 둘레를 밝힌다 */
  decorLit = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.stone = scene.add.image(0, 0, TEX.pixel).setVisible(false);
  }

  get height(): number {
    return this.p ? GRAVE_STONE_H[this.p.shape] : 0;
  }

  bind(p: GravePlacement, reduced: boolean, riseAt: number, mine = false): void {
    this.p = p;
    this.riseAt = riseAt;
    this.reduced = reduced;
    this.phase = (p.index * 1.7) % (Math.PI * 2);
    const s = this.stone;
    s.setTexture(graveTexKey(p.shape, p.variant))
      .setOrigin(0.5, graveOriginY(p.shape))
      .clearTint()
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
      const h = GRAVE_STONE_H[p.shape];
      this.glow.setPosition(p.x, p.y - h / 2).setScale((h + 18) / 64).setVisible(true);
    } else this.glow?.setVisible(false);
    this.sway = !reduced && level >= 0.6 ? 0.012 + 0.03 * level : 0;

    this.clearExtras();
    if (p.rank >= 0 && p.rank < 3) {
      this.addCandles(p, -10, 10);
      if (p.rank === 0) {
        this.wisp = this.scene.add.sprite(p.x - 12, p.y - 26, TEX.wisp, 0).setDepth(DEPTH.lights + 1);
        this.wisp.play("fx-wisp-float");
        this.lights.push({ img: this.makeLight(p.x - 12, p.y - 26, 0.6, 0x9fdcf0), base: 0.7, phase: 3 });
      }
    }
    this.bindDecor(p);
    const bright = this.bindStyle(p);
    if (mine) {
      const w = SHAPE_SIZE[p.shape].w;
      this.flag = this.scene.add
        .image(p.x + w / 2, p.y - GRAVE_STONE_H[p.shape] + 4, TEX.mineFlag)
        .setOrigin(0.15, 1)
        .setDepth(p.y + 0.7);
    }
    // 묘비 위 스폿: 기본도 충분히 밝게, 부활 대기석·빛나는 디자인·꾸미기 빛·내 묘비는 더
    this.spot = 0.5 + (p.rank >= 0 ? 0.15 : 0) + (this.decorLit ? 0.15 : 0) + (bright ? 0.15 : 0) + (mine ? 0.15 : 0);
    this.animated =
      this.sway > 0 ||
      this.glowBase > 0 ||
      this.lights.length > 0 ||
      riseAt > 0 ||
      !!this.cat ||
      this.stars.length > 0 ||
      this.fx.length > 0 ||
      !!this.fxGlow ||
      !!this.flag ||
      p.shape === "duck" ||
      p.shape === "404";
  }

  /** 텍스처 좌표(tx,ty) → 월드 좌표 */
  private tw(p: GravePlacement, tx: number, ty: number): { x: number; y: number } {
    return { x: p.x - SHAPE_SIZE[p.shape].tex / 2 + tx, y: p.y - GRAVE_STONE_H[p.shape] + ty };
  }

  private dot(x: number, y: number, tint: number, w: number, h: number, depth: number, add = false): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x, y, TEX.pixel).setOrigin(0, 0).setDisplaySize(w, h).setTint(tint).setDepth(depth);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD);
    return img;
  }

  /** 유료 디자인의 작은 연출. 빛나는 디자인이면 true (조명을 더 밝게) */
  private bindStyle(p: GravePlacement): boolean {
    const h = GRAVE_STONE_H[p.shape];
    const glow = (dx: number, dy: number, scale: number, tint: number) => {
      this.fxGlow = this.scene.add
        .image(p.x + dx, p.y + dy, TEX.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.lights)
        .setScale(scale)
        .setTint(tint);
    };
    switch (p.shape) {
      case "coffee":
        for (let i = 0; i < 3; i++) {
          const img = this.scene.add.image(p.x, p.y - h, TEX.dot).setDepth(p.y + 0.4).setTint(0xeeeeee).setScale(0.6);
          this.fx.push({ img, a: i * 0.33, b: i - 1 });
        }
        return false;
      case "monitor": {
        const c = this.tw(p, MONITOR_CURSOR.x, MONITOR_CURSOR.y);
        this.fx.push({ img: this.dot(c.x, c.y, 0x9af0b0, 2, 1, p.y + 0.4), a: 0, b: 0 });
        glow(0, -h * 0.55, 0.35, 0x5ad87a);
        return true;
      }
      case "server":
        SERVER_LEDS.forEach(([tx, ty], i) => {
          const c = this.tw(p, tx + (i % 3 === 2 ? 1 : 0), ty);
          this.fx.push({ img: this.dot(c.x, c.y, i % 3 === 2 ? AMBER : GREEN, 1, 1, p.y + 0.4, true), a: 300 + i * 170, b: i });
        });
        return true;
      case "sakura":
        for (let i = 0; i < 3; i++) {
          const img = this.scene.add.image(p.x, p.y - h, TEX.petalPink).setDepth(p.y + 0.5);
          this.fx.push({ img, a: i * 0.33, b: i });
        }
        return false;
      case "rocket": {
        const c = this.tw(p, ROCKET_TIP.x, ROCKET_TIP.y - 1);
        this.fx.push({ img: this.dot(c.x, c.y, 0xff5040, 2, 1, p.y + 0.4, true), a: 0, b: 0 });
        return false;
      }
      case "crystal":
        glow(0, -h * 0.5, 0.75, 0x9ad8f0);
        return true;
      case "gold":
        glow(0, -h * 0.5, 0.6, 0xffd870);
        for (let i = 0; i < 2; i++) {
          const img = this.scene.add.image(p.x, p.y - h, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1);
          this.fx.push({ img, a: i * 1300, b: i });
        }
        return true;
      case "angel":
        glow(0, -h * 0.55, 0.55, 0xf4f0ff);
        return true;
      default:
        return false;
    }
  }

  private addCandles(p: GravePlacement, dl: number, dr: number): void {
    for (const dx of [dl, dr]) {
      const c = this.scene.add.sprite(p.x + dx, p.y + 2, TEX.candle, 0).setOrigin(0.5, 1).setDepth(p.y + 2);
      c.play({ key: "fx-candle-flicker", startFrame: dx > 0 ? 1 : 0 });
      this.candles.push(c);
      this.lights.push({ img: this.makeLight(p.x + dx, p.y - 4, 0.45, 0xffc870), base: 0.55, phase: dx });
    }
  }

  private bindDecor(p: GravePlacement): void {
    this.decorLit = false;
    const h = GRAVE_STONE_H[p.shape];
    for (const id of p.decor) {
      switch (id) {
        case "decor_candles":
          // 부활 대기석 촛불과 겹치지 않게 조금 바깥에
          if (p.rank < 0 || p.rank >= 3) this.addCandles(p, -9, 9);
          this.decorLit = true;
          break;
        case "decor_wreath":
          this.decorObjs.push(this.scene.add.image(p.x, p.y + 3, TEX.wreath).setDepth(p.y + 3));
          break;
        case "decor_ribbon":
          this.decorObjs.push(this.scene.add.image(p.x + 4, p.y - h + 3, TEX.ribbon).setOrigin(0.5, 0).setDepth(p.y + 0.5));
          break;
        case "decor_lantern": {
          const lx = p.x + 13;
          this.decorObjs.push(this.scene.add.image(lx, p.y + 2, TEX.miniLantern).setOrigin(0.5, 1).setDepth(p.y + 2));
          this.lights.push({ img: this.makeLight(lx, p.y - 6, 0.5, 0xffc070), base: 0.6, phase: 7 });
          this.decorLit = true;
          break;
        }
        case "decor_ghostcat":
          this.cat = this.scene.add
            .sprite(p.x, p.y - h + 1, TEX.ghostCat, 0)
            .setOrigin(0.5, 1)
            .setAlpha(0.8)
            .setDepth(p.y + 0.6);
          if (!this.reduced) this.cat.play("fx-ghostcat-tail");
          break;
        case "decor_stars":
          for (let i = 0; i < (this.reduced ? 2 : 5); i++) {
            const img = this.scene.add.image(p.x, p.y - h, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1);
            this.stars.push({ img, t0: i * 700 + this.phase * 300 });
          }
          break;
      }
    }
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
    for (const o of this.decorObjs) o.destroy();
    for (const st of this.stars) st.img.destroy();
    for (const f of this.fx) f.img.destroy();
    this.wisp?.destroy();
    this.cat?.destroy();
    this.fxGlow?.destroy();
    this.flag?.destroy();
    this.candles = [];
    this.lights = [];
    this.decorObjs = [];
    this.stars = [];
    this.fx = [];
    this.wisp = null;
    this.cat = null;
    this.fxGlow = null;
    this.flag = null;
  }

  unbind(): void {
    this.p = null;
    this.stone.setVisible(false);
    this.flowers?.setVisible(false);
    this.glow?.setVisible(false);
    this.clearExtras();
    this.animated = false;
  }

  get visible(): boolean {
    return !!this.p && this.stone.visible;
  }

  setVisible(v: boolean): void {
    if (this.stone.visible === v) return;
    this.stone.setVisible(v);
    if (this.flowers && this.p && this.p.flowers > 0) this.flowers.setVisible(v);
    if (this.glow && this.glowBase > 0) this.glow.setVisible(v);
    for (const c of this.candles) c.setVisible(v);
    for (const l of this.lights) l.img.setVisible(v);
    for (const o of this.decorObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
    for (const st of this.stars) st.img.setVisible(v);
    for (const f of this.fx) f.img.setVisible(v);
    this.wisp?.setVisible(v);
    this.cat?.setVisible(v);
    this.fxGlow?.setVisible(v);
    this.flag?.setVisible(v);
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
      // 유령불 빛은 촛불 둘 다음 (lights[2])
      if (this.lights.length > 2) this.lights[2].img.setPosition(wx, wy);
    }
    if (this.cat && !this.reduced) this.cat.setY(p.y - GRAVE_STONE_H[p.shape] + 1 - (Math.sin(now / 900 + this.phase) > 0.6 ? 1 : 0));
    this.updateStyle(p, now, lightLevel);
    if (this.flag && !this.reduced) this.flag.setRotation(Math.sin(now / 700 + this.phase) * 0.06);
    if (this.stars.length) {
      // 별가루: 묘비 위에서 천천히 내려오며 깜빡인다
      const h = GRAVE_STONE_H[p.shape];
      for (let i = 0; i < this.stars.length; i++) {
        const st = this.stars[i];
        const period = this.reduced ? 6000 : 3200;
        const t = ((now + st.t0) % period) / period;
        const dx = Math.sin(i * 2.3 + this.phase) * 7;
        st.img.setPosition(p.x + dx, p.y - h - 14 + t * (h + 10)).setAlpha(Math.sin(t * Math.PI) * 0.9).setScale(0.6 + 0.4 * Math.sin(t * Math.PI));
      }
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

  private updateStyle(p: GravePlacement, now: number, lightLevel: number): void {
    const h = GRAVE_STONE_H[p.shape];
    const still = this.reduced;
    if (this.fxGlow) {
      const pulse = still ? 1 : 0.75 + 0.25 * Math.sin(now / 900 + this.phase);
      this.fxGlow.setAlpha((p.shape === "crystal" ? 0.55 : 0.35) * pulse * (0.4 + 0.6 * lightLevel));
    }
    switch (p.shape) {
      case "coffee":
        // 식은 커피에서도 김이 살짝 (위로 피어오르며 흐려진다)
        for (const f of this.fx) {
          const t = still ? 0.4 : ((now / 2400 + f.a) % 1);
          f.img.setPosition(p.x - 1 + f.b * 2 + Math.sin(t * 6 + f.b) * 1.2, p.y - h - 1 - t * 9).setAlpha(still ? 0.35 : 0.55 * Math.sin(t * Math.PI));
        }
        break;
      case "monitor":
        this.fx[0]?.img.setVisible(this.stone.visible && (still || Math.floor(now / 530) % 2 === 0));
        break;
      case "server":
        for (const f of this.fx) f.img.setAlpha(still ? 0.9 : Math.floor((now + f.b * 97) / f.a) % 3 === 0 ? 0.25 : 1);
        break;
      case "sakura":
        for (const f of this.fx) {
          const t = still ? 0.5 : ((now / 3800 + f.a) % 1);
          f.img
            .setPosition(p.x - 6 + f.b * 6 + Math.sin(t * 5 + f.b) * 3, p.y - h - 2 + t * (h + 4))
            .setRotation(still ? 0 : t * 4)
            .setAlpha(Math.sin(t * Math.PI));
        }
        break;
      case "rocket":
        this.fx[0]?.img.setAlpha(still ? 0.8 : Math.floor(now / 700) % 2 ? 0.15 : 1);
        break;
      case "gold":
        // 금빛 비석 위 이곳저곳에서 반짝
        for (const f of this.fx) {
          const cycle = 2600;
          const t = ((now + f.a) % cycle) / cycle;
          const k = Math.floor((now + f.a) / cycle) + f.b * 7;
          f.img
            .setPosition(p.x - 4 + ((k * 37) % 9), p.y - h + 3 + ((k * 53) % Math.max(4, h - 8)))
            .setAlpha(still ? 0.6 : Math.max(0, Math.sin(t * Math.PI * 2)))
            .setScale(still ? 0.8 : 0.5 + 0.5 * Math.max(0, Math.sin(t * Math.PI * 2)));
        }
        break;
      case "duck":
        if (!still) {
          const t = (now + this.phase * 1000) % 3200;
          this.stone.setRotation(t < 400 ? Math.sin((t / 400) * Math.PI * 2) * 0.08 : 0);
        }
        break;
      case "404":
        if (!still) {
          const t = (now + this.phase * 1000) % 3700;
          const glitch = t < 120;
          this.stone.setX(p.x + (glitch ? (t < 60 ? 1 : -1) : 0));
          if (glitch) this.stone.setTint(0xb8d0ff);
          else this.stone.clearTint();
        }
        break;
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
  /** 툴팁 위쪽 끝 (월드 y). 위치 표시 라벨이 겹치지 않게 그 위로 올린다 */
  topY = 0;

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

  /** mine: 내 묘비면 이름 앞에 ★, 금빛 이름 */
  show(p: GravePlacement, name: string, epitaph: string, mine = false): void {
    const title = mine ? `★ ${name}` : name;
    if (this.shownId !== p.id || this.name.text !== title || this.epitaph.text !== epitaph) {
      this.atlas.ensure(title + epitaph);
      this.name.setText(title).setTint(mine ? 0xffd75a : TOOLTIP_NAME);
      this.epitaph.setText(epitaph);
      this.shownId = p.id;
    }
    this.graveTop = p.y - GRAVE_STONE_H[p.shape] - 3;
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

  /** 지금 툴팁이 가리키는 묘비 id */
  get graveId(): string | null {
    return this.shownId;
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
    this.topY = y - h - 2 * s;
    this.border.setPosition(x, y + s).setSize(w + 2 * s, h + 2 * s);
    this.name.setPosition(x, y - h + pad);
    this.epitaph.setPosition(x, y - h + pad + lineH);
  }

  destroy(): void {
    for (const o of [this.border, this.bg, this.name, this.epitaph]) o.destroy();
  }
}
