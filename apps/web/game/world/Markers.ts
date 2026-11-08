import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { DEPTH, LABEL_ME } from "../config";
import { GRAVE_STONE_H } from "../sprites/graves";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { GravePlacement } from "./graveLayout";

// 새 묘비 위치 표시: 위에서 내려오는 가는 빛기둥 + 은은한 빛 + 아래를 가리키는 작은 화살표 (+ 라벨).
// 내가 세운 묘비는 8초 + "여기 잠들었어요", 같은 채널 다른 사람이 세운 묘비는 4초 (라벨 없음).
// prefers-reduced-motion이면 내려오기·흔들림·깜빡임 없이 그 자리에 정적으로 보였다가 사라진다.

const FADE_IN = 400;
const FADE_OUT = 800;
const DESCEND_MS = 700;
const BEAM_H = 140;

/** 같은 묘비에 툴팁이 떠 있으면 라벨을 그 위로 쌓는다 */
export type TooltipInfo = { readonly graveId: string | null; readonly topY: number };

type Marker = {
  id: string;
  x: number;
  y: number;
  top: number;
  start: number;
  end: number;
  beam: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  arrow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText | null;
};

export class GraveMarkers {
  private readonly items: Marker[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
  ) {}

  add(p: GravePlacement, ms: number, label: string | null, now: number): void {
    const top = p.y - GRAVE_STONE_H[p.tier];
    const s = this.scene;
    const beam = s.add
      .image(p.x, p.y - BEAM_H, TEX.pixel)
      .setOrigin(0.5, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe9b8)
      .setDepth(DEPTH.lights + 3)
      .setAlpha(0);
    const halo = s.add
      .image(p.x, p.y - BEAM_H / 2, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe2a0)
      .setScale(0.5, (BEAM_H + 20) / 64)
      .setDepth(DEPTH.lights + 2)
      .setAlpha(0);
    const arrow = s.add.image(p.x, top - 4, TEX.upMarker).setFlipY(true).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setAlpha(0);
    let text: Phaser.GameObjects.BitmapText | null = null;
    if (label) {
      this.atlas.ensure(label);
      text = s.add.bitmapText(p.x, top - 14, FONT_KEY, label, FONT_PX).setOrigin(0.5, 1).setTint(LABEL_ME).setDepth(DEPTH.labels + 2).setAlpha(0);
    }
    this.items.push({ id: p.id, x: p.x, y: p.y, top, start: now, end: now + ms, beam, halo, arrow, label: text });
  }

  update(now: number, labelScale: number, tip: TooltipInfo | null = null): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i];
      if (now >= m.end) {
        this.destroyItem(m);
        this.items.splice(i, 1);
        continue;
      }
      const t = now - m.start;
      const a = Math.min(1, t / FADE_IN) * Math.min(1, (m.end - now) / FADE_OUT);
      const pulse = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 420);
      // 빛기둥은 위에서 묘비까지 내려온다
      const k = this.reduced ? 1 : Math.min(1, t / DESCEND_MS);
      const ease = 1 - Math.pow(1 - k, 3);
      m.beam.setDisplaySize(2, Math.max(0.01, (BEAM_H - 2) * ease)).setAlpha(0.45 * a * pulse);
      m.halo.setAlpha(0.35 * a * pulse);
      const bob = this.reduced ? 0 : Math.round(Math.sin(now / 300) * 1.5);
      // 근처라 툴팁이 이 묘비 위에 떠 있으면: 화살표는 툴팁에 가려지므로 숨기고 라벨은 툴팁 위로
      const covered = !!tip && tip.graveId === m.id;
      m.arrow.setY(m.top - 4 + bob).setAlpha(covered ? 0 : a);
      if (m.label) {
        if (m.label.scaleX !== labelScale) m.label.setScale(labelScale);
        // 라벨은 화면 픽셀 크기라 줌에 따라 월드 높이가 달라진다
        const y = covered ? Math.min(m.top - 12, tip.topY - 2 * labelScale) : m.top - 12 + bob;
        m.label.setY(y).setAlpha(a);
      }
    }
  }

  private destroyItem(m: Marker): void {
    m.beam.destroy();
    m.halo.destroy();
    m.arrow.destroy();
    m.label?.destroy();
  }

  destroy(): void {
    for (const m of this.items) this.destroyItem(m);
    this.items.length = 0;
  }
}
