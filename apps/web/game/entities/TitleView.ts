import * as Phaser from "phaser";
import { fillEdgeColors } from "@/lib/nameStyle";
import type { TitleDef, TitleGrade } from "@/lib/titles";
import { TEX } from "../assets/manifest";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 머리 위 칭호 「…」 (이름표 바로 위). 등급이 높을수록 화려하게:
//  - 동: 구릿빛 글자
//  - 은: 은빛 글자 + 끝에서 작게 반짝
//  - 금: 금빛 글자 + 양옆 금빛 마름모 장식 + 둘레를 도는 반짝이 둘
//  - 전설: 무지개가 흐르는 글자(글자마다 색) + 양옆 작은 날개 + 은은한 빛무리 + 반짝이
// 성능: 장식은 칭호를 달 때 한 번 만들고 고쳐 쓴다. 움직이는 색은 ANIM_STEP_MS마다만 다시 칠하고, 그리기는 보이는 아바타만(AvatarView.sync).
// 움직임 줄이기 설정이면 멈춘 그림. 모두 밤 어둠 층 위(이름표 층)라 밤에도 그대로 밝다.

const TINT: Record<TitleGrade, number> = { bronze: 0xe2b07a, silver: 0xe8eef8, gold: 0xffd76a, legend: 0xffffff };
const LEGEND_BAND = [0xff9a9a, 0xffd27a, 0xb8f58a, 0x8ad8ff, 0xc2a2ff];
const ANIM_STEP_MS = 80;
const RAINBOW_MS = 2600;

export class TitleView {
  readonly text: Phaser.GameObjects.BitmapText;
  private grade: TitleGrade = "bronze";
  private sparks: Phaser.GameObjects.Image[] = [];
  private orn: Phaser.GameObjects.Graphics | null = null;
  private ornKey = "";
  private halo: Phaser.GameObjects.Image | null = null;
  private readonly edges: number[] = [];
  private step = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly depth: number,
    private readonly reduced: boolean,
  ) {
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setDepth(depth);
  }

  /** 칭호 바꾸기 (같으면 그대로) */
  set(t: TitleDef): void {
    const label = `「${t.name}」`;
    if (label === this.text.text && t.grade === this.grade) return;
    this.atlas.ensure(label);
    this.text.setText(label);
    if (this.text.text.length) this.text.setCharacterTint(0, -1);
    this.grade = t.grade;
    this.text.setTint(TINT[t.grade]);
    this.step = -1;
    this.ornKey = "";
    // 장식: 등급에 맞게 만들거나 치운다
    const nSparks = t.grade === "silver" ? 1 : t.grade === "gold" ? 2 : t.grade === "legend" ? 3 : 0;
    while (this.sparks.length > nSparks) this.sparks.pop()!.destroy();
    while (this.sparks.length < nSparks)
      this.sparks.push(this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth + 0.01).setVisible(false));
    const wantOrn = t.grade === "gold" || t.grade === "legend";
    if (wantOrn && !this.orn) this.orn = this.scene.add.graphics().setDepth(this.depth - 0.01).setVisible(false);
    if (!wantOrn && this.orn) {
      this.orn.destroy();
      this.orn = null;
    }
    if (t.grade === "legend" && !this.halo) this.halo = this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth - 0.02).setTint(0xfff0c0).setVisible(false);
    if (t.grade !== "legend" && this.halo) {
      this.halo.destroy();
      this.halo = null;
    }
  }

  get height(): number {
    return this.text.height;
  }

  /** 글자 위아래로 장식이 차지하는 높이 (화면 px): 금 등급 테두리판 줄 — 이름표·배지와의 간격에 더한다 */
  get padY(): number {
    return this.grade === "gold" ? 3 : 0;
  }

  /** 글자 아래 가운데를 (x, bottom)에 놓고 장식을 맞춘다 (보이는 아바타만 매 프레임) */
  place(x: number, bottom: number, sc: number, vis: boolean, alpha: number, now: number): void {
    const t = this.text;
    if (t.scaleX !== sc) t.setScale(sc);
    t.setPosition(x, bottom).setAlpha(alpha).setVisible(vis);
    const w = t.width;
    const h = t.height;
    // 보이는 글자 높이와 그 가운데 (글자 칸 위아래 빈 줄을 뺀다 — GlyphAtlas inkPad)
    const pad = this.atlas.inkPad;
    const inkH = Math.max(sc, h - (pad.top + pad.bottom) * sc);
    const midY = bottom - pad.bottom * sc - inkH / 2;

    // 전설: 무지개가 글자를 따라 흐른다 (정해진 간격마다만 다시 칠한다)
    if (this.grade === "legend" && vis) {
      const step = this.reduced ? 0 : Math.floor(now / ANIM_STEP_MS);
      if (step !== this.step) {
        this.step = step;
        const n = t.text.length;
        const e = fillEdgeColors(this.edges, LEGEND_BAND, n, this.reduced ? 0 : now / RAINBOW_MS, 0.7);
        for (let i = 0; i < n; i++) t.setCharacterTint(i, 1, false, e[i], e[i + 1], e[i], e[i + 1]);
      }
    }

    if (this.orn) {
      const key = `${w}|${sc}|${this.grade}`;
      if (vis && key !== this.ornKey) {
        this.ornKey = key;
        drawOrnaments(this.orn.clear(), this.grade, w, inkH, sc);
      }
      this.orn.setPosition(x, midY).setAlpha(alpha).setVisible(vis);
    }

    if (this.halo) {
      const breathe = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 1100);
      this.halo
        .setPosition(x, midY)
        .setDisplaySize(w + 40 * sc, inkH + 18 * sc)
        .setAlpha(alpha * (0.18 + 0.16 * breathe))
        .setVisible(vis);
    }

    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!vis) {
        if (s.visible) s.setVisible(false);
        continue;
      }
      let px: number;
      let py: number;
      let a: number;
      if (this.grade === "silver") {
        // 끝에서 가끔 반짝
        const u = this.reduced ? 0.5 : (now % 1800) / 1800;
        px = x + w / 2 - 2 * sc;
        py = bottom - h + 2 * sc;
        a = this.reduced ? 0.7 : u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
      } else {
        // 둘레를 천천히 돈다 (타원)
        const ang = (this.reduced ? 0 : now / 1400) + (i * Math.PI * 2) / this.sparks.length;
        px = x + Math.cos(ang) * (w / 2 + 6 * sc);
        py = midY + Math.sin(ang) * (h / 2 + 1 * sc);
        a = this.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(now / 260 + i * 2);
      }
      s.setPosition(Math.round(px), Math.round(py))
        .setScale(sc * (0.6 + 0.4 * a))
        .setAlpha(alpha * a)
        .setVisible(true);
    }
  }

  setVisible(v: boolean): void {
    if (v) return; // 다음 place가 켠다
    this.text.setVisible(false);
    this.orn?.setVisible(false);
    this.halo?.setVisible(false);
    for (const s of this.sparks) s.setVisible(false);
  }

  destroy(): void {
    this.text.destroy();
    this.orn?.destroy();
    this.orn = null;
    this.halo?.destroy();
    this.halo = null;
    for (const s of this.sparks) s.destroy();
    this.sparks = [];
  }
}

/** 장식 (원점 = 글자 가운데). 금: 금빛 테두리판(위아래 금줄) + 양옆 금빛 마름모, 전설: 양옆 날개 */
function drawOrnaments(g: Phaser.GameObjects.Graphics, grade: TitleGrade, w: number, h: number, sc: number): void {
  const u = sc;
  const half = Math.round(w / 2 + 2 * u);
  if (grade === "gold") {
    // 판: 어두운 금빛 바탕 + 위아래 금줄 (주간 1위 배지처럼 네모 테두리·왕관이 아니라 띠 모양)
    const ph = Math.round(h / 2 + 2 * u);
    g.fillStyle(0x2a1d08, 0.72).fillRect(-half, -ph, half * 2, ph * 2);
    g.fillStyle(0x0a0b10, 0.8).fillRect(-half, -ph - 2 * u, half * 2, u).fillRect(-half, ph + u, half * 2, u);
    g.fillStyle(0xffd76a, 1).fillRect(-half, -ph - u, half * 2, u).fillRect(-half, ph, half * 2, u);
    for (const s of [-1, 1]) {
      const cx = s * (half + 4 * u);
      const diamond = (r: number) => [
        { x: cx, y: -r },
        { x: cx + r, y: 0 },
        { x: cx, y: r },
        { x: cx - r, y: 0 },
      ];
      g.fillStyle(0x0a0b10, 0.9).fillPoints(diamond(6 * u), true);
      g.fillStyle(0xffd76a, 1).fillPoints(diamond(5 * u), true);
      g.fillStyle(0xfff6c8, 1).fillRect(cx - u, -2 * u, u, 2 * u);
    }
    return;
  }
  // 전설: 바깥쪽 위로 비스듬히 펼친 깃털 네 장 (어두운 외곽 + 흰빛·금빛 깃)
  for (const s of [-1, 1]) {
    const x0 = s * half;
    const feathers: [number, number, number, number][] = [
      [0, -2, 13, 0xffffff],
      [1, 1, 11, 0xfff3c8],
      [2, 4, 8, 0xffe08a],
      [3, 7, 5, 0xffc06a],
    ];
    for (const [k, dy, len, col] of feathers) {
      const xa = x0 + s * k * u;
      const xb = x0 + s * (k + len) * u;
      const ya = dy * u;
      const yb = ya - len * 0.45 * u;
      const quad = (grow: number) => [
        { x: xa, y: ya - grow },
        { x: xb + s * grow, y: yb - grow },
        { x: xb + s * grow, y: yb + 2 * u + grow },
        { x: xa, y: ya + 2 * u + grow },
      ];
      g.fillStyle(0x0a0b10, 0.85).fillPoints(quad(u), true);
      g.fillStyle(col, 1).fillPoints(quad(0), true);
    }
  }
}
