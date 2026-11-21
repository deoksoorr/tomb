import * as Phaser from "phaser";
import { fillEdgeColors } from "@/lib/nameStyle";
import { STAFF_TITLE, type TitleDef, type TitleGrade } from "@/lib/titles";
import { TEX } from "../assets/manifest";
import { BakedShape, type BakeBounds } from "../sprites/bakedShape";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 머리 위 칭호 「…」 (이름표 바로 위). 등급이 높을수록 화려하게:
//  - 동: 구릿빛 글자
//  - 은: 은빛 글자 + 끝에서 작게 반짝
//  - 금: 금빛 글자 + 양옆 금빛 마름모 장식 + 둘레를 도는 반짝이 둘
//  - 전설: 무지개가 흐르는 글자(글자마다 색) + 양옆 작은 날개 + 은은한 빛무리 + 반짝이
//  - 11/15 운영자(신화, 운영자 표시일 때만 — AvatarView): 위 밝고 아래 짙은 금속빛 글자 + 글자를 지나가는 흰 반짝임 + 보랏빛 「」 +
//    양옆 금줄·보랏빛 보석 + 보랏빛 빛무리 + 금·보라 반짝이
//  - 11/15 신화(서버에 한 사람 — 서버 최초·꼭대기 층 주인·이번 주 최고층): 흰금빛 글자에 넓은 빛줄기가 천천히 흐르고 + 금빛 「」 +
//    양옆 금줄·금빛 별 보석 + 따뜻한 금빛 빛무리 + 글자 둘레에서 금가루가 흩날려 내려앉는다 (운영자 보라는 없다)
//  - 11/16 매니저(관리자가 임명한 계정만): 위 연민트·아래 청록 글자 + 지나가는 크림빛 반짝임 + 민트 「」 + 양옆 민트줄·서류판(클립보드) +
//    민트 빛무리 + 민트·크림 반짝이 둘이 둘레를 돈다
// 성능: 장식은 칭호를 달 때 한 번 만들고 고쳐 쓴다. 11/16 양옆 장식(마름모·날개·보석)은 텍스처로 한 번 굽는다 (BakedShape — 매 프레임 다각형 삼각분할을 하지 않게). 움직이는 색은 ANIM_STEP_MS마다만 다시 칠하고, 그리기는 보이는 아바타만(AvatarView.sync).
// 움직임 줄이기 설정이면 멈춘 그림. 모두 밤 어둠 층 위(이름표 층)라 밤에도 그대로 밝다.

/** 머리 위 칭호 모양 등급: 칭호 등급(신화 포함) + 운영자 전용 */
type ViewGrade = TitleGrade | "staff";

const TINT: Record<ViewGrade, number> = { bronze: 0xe2b07a, silver: 0xe8eef8, gold: 0xffd76a, legend: 0xffffff, mythic: 0xffffff, staff: 0xffffff, manager: 0xffffff };
/** 매니저: 연민트·청록 글자 (위·아래) · 지나가는 크림빛 반짝임 · 「」 민트 */
const MGR_TOP = 0xdcfff2;
const MGR_BOT = 0x22b89c;
const MGR_BRACKET = 0x5ff0c4;
const MGR_GLINT_MS = 2800;
/** 신화: 흰금빛 글자 (위·아래) · 흐르는 빛줄기 · 「」 금 · 금가루 */
const MYTHIC_TOP = 0xfff4c8;
const MYTHIC_BOT = 0xe8a838;
const MYTHIC_BRACKET = 0xffcf4a;
const MYTHIC_FLOW_MS = 3400;
const MYTHIC_DUST = 6;
const MYTHIC_DUST_MS = 2200;
const LEGEND_BAND = [0xff9a9a, 0xffd27a, 0xb8f58a, 0x8ad8ff, 0xc2a2ff];
const ANIM_STEP_MS = 80;
const RAINBOW_MS = 2600;
/** 운영자 칭호: 금속빛 (위·아래) · 지나가는 반짝임 · 「」 보라 */
const STAFF_TOP = 0xffeaa0;
const STAFF_BOT = 0xffa22e;
const STAFF_GLINT_TOP = 0xffffff;
const STAFF_GLINT_BOT = 0xfff0b8;
const STAFF_BRACKET = 0xb88cff;
const STAFF_GLINT_MS = 2400;

export class TitleView {
  readonly text: Phaser.GameObjects.BitmapText;
  private grade: ViewGrade = "bronze";
  private sparks: Phaser.GameObjects.Image[] = [];
  private orn: BakedShape | null = null;
  /** 구운 장식의 키 (등급·글자 폭·높이가 바뀔 때만 다시 고른다) */
  private ornW = -1;
  private ornH = -1;
  private ornGrade: ViewGrade | null = null;
  private halo: Phaser.GameObjects.Image | null = null;
  private readonly edges: number[] = [];
  private step = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private depth: number,
    private readonly reduced: boolean,
  ) {
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setDepth(depth);
  }

  /** 칭호 바꾸기 (같으면 그대로) */
  set(t: TitleDef): void {
    this.apply(`「${t.name}」`, t.grade);
  }

  /** 운영자 전용 칭호 STAFF_TITLE (운영자 표시일 때만 AvatarView가 부른다) */
  setStaff(): void {
    this.apply(`「${STAFF_TITLE.name}」`, "staff");
  }

  private apply(label: string, grade: ViewGrade): void {
    if (label === this.text.text && grade === this.grade) return;
    this.atlas.ensure(label);
    this.text.setText(label);
    if (this.text.text.length) this.text.setCharacterTint(0, -1);
    this.grade = grade;
    this.text.setTint(TINT[grade]);
    this.step = -1;
    // 장식: 등급에 맞게 만들거나 치운다
    const nSparks = grade === "silver" ? 1 : grade === "gold" || grade === "staff" || grade === "manager" ? 2 : grade === "legend" ? 3 : grade === "mythic" ? MYTHIC_DUST : 0;
    while (this.sparks.length > nSparks) this.sparks.pop()!.destroy();
    while (this.sparks.length < nSparks)
      this.sparks.push(this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth + 0.01).setVisible(false));
    // 운영자 반짝이는 금·보라 번갈아 (다른 등급은 흰빛)
    // 신화 금가루는 진한 금·밝은 금 번갈아
    // 매니저 반짝이는 민트·크림 번갈아
    this.sparks.forEach((sp, i) => (grade === "staff" ? sp.setTint(i % 2 ? 0xc9a2ff : 0xffe08a) : grade === "mythic" ? sp.setTint(i % 2 ? 0xffc24a : 0xfff0b0) : grade === "manager" ? sp.setTint(i % 2 ? 0x6ff4cc : 0xfff4d8) : sp.clearTint()));
    const wantOrn = grade === "gold" || grade === "legend" || grade === "staff" || grade === "mythic" || grade === "manager";
    if (wantOrn && !this.orn) {
      this.orn = new BakedShape(this.scene, this.depth - 0.01);
      this.ornGrade = null;
    }
    if (!wantOrn && this.orn) {
      this.orn.destroy();
      this.orn = null;
    }
    const wantHalo = grade === "legend" || grade === "staff" || grade === "mythic" || grade === "manager";
    if (wantHalo && !this.halo) this.halo = this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.depth - 0.02).setVisible(false);
    if (!wantHalo && this.halo) {
      this.halo.destroy();
      this.halo = null;
    }
    this.halo?.setTint(grade === "staff" ? 0xa070ff : grade === "mythic" ? 0xffb838 : grade === "manager" ? 0x30d8a8 : 0xfff0c0);
  }

  /** 11/21 폰 사냥 HUD: 이름표와 함께 피해 숫자 위로 올린다 (장식·반짝이·후광도 같은 순서 그대로) */
  setDepth(d: number): void {
    if (d === this.depth) return;
    this.depth = d;
    this.text.setDepth(d);
    for (const sp of this.sparks) sp.setDepth(d + 0.01);
    this.orn?.img.setDepth(d - 0.01);
    this.halo?.setDepth(d - 0.02);
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
    // 운영자: 금속빛 글자에 흰 반짝임이 왼쪽에서 오른쪽으로 지나간다 (움직임 줄이기면 반짝임 없이)
    if (this.grade === "staff" && vis) {
      const step = this.reduced ? 0 : Math.floor(now / ANIM_STEP_MS);
      if (step !== this.step) {
        this.step = step;
        const n = t.text.length;
        const g = this.reduced ? -99 : ((now % STAFF_GLINT_MS) / STAFF_GLINT_MS) * (n + 6) - 3;
        for (let i = 0; i < n; i++) {
          if (i === 0 || i === n - 1) {
            t.setCharacterTint(i, 1, false, STAFF_BRACKET, STAFF_BRACKET, STAFF_BRACKET, STAFF_BRACKET);
            continue;
          }
          const d = Math.abs(i - g);
          const top = d < 0.8 ? STAFF_GLINT_TOP : STAFF_TOP;
          const bot = d < 0.8 ? STAFF_GLINT_BOT : d < 1.6 ? 0xffd27a : STAFF_BOT;
          t.setCharacterTint(i, 1, false, top, top, bot, bot);
        }
      }
    }

    // 매니저: 민트 글자에 크림빛 반짝임이 천천히 지나간다 (움직임 줄이기면 반짝임 없이)
    if (this.grade === "manager" && vis) {
      const step = this.reduced ? 0 : Math.floor(now / ANIM_STEP_MS);
      if (step !== this.step) {
        this.step = step;
        const n = t.text.length;
        const g = this.reduced ? -99 : ((now % MGR_GLINT_MS) / MGR_GLINT_MS) * (n + 6) - 3;
        for (let i = 0; i < n; i++) {
          if (i === 0 || i === n - 1) {
            t.setCharacterTint(i, 1, false, MGR_BRACKET, MGR_BRACKET, MGR_BRACKET, MGR_BRACKET);
            continue;
          }
          const d = Math.abs(i - g);
          const top = d < 0.8 ? 0xffffff : MGR_TOP;
          const bot = d < 0.8 ? 0xfff2cc : d < 1.6 ? 0x7ae8c8 : MGR_BOT;
          t.setCharacterTint(i, 1, false, top, top, bot, bot);
        }
      }
    }

    // 신화: 흰금빛 글자를 넓은 빛줄기가 천천히 지나간다 (움직임 줄이기면 멈춘 금빛)
    if (this.grade === "mythic" && vis) {
      const step = this.reduced ? 0 : Math.floor(now / ANIM_STEP_MS);
      if (step !== this.step) {
        this.step = step;
        const n = t.text.length;
        const band = this.reduced ? -99 : ((now % MYTHIC_FLOW_MS) / MYTHIC_FLOW_MS) * (n + 8) - 4;
        for (let i = 0; i < n; i++) {
          if (i === 0 || i === n - 1) {
            t.setCharacterTint(i, 1, false, MYTHIC_BRACKET, MYTHIC_BRACKET, MYTHIC_BRACKET, MYTHIC_BRACKET);
            continue;
          }
          const d = Math.abs(i - band);
          const top = d < 1.2 ? 0xffffff : d < 2.4 ? 0xfffae6 : MYTHIC_TOP;
          const bot = d < 1.2 ? 0xfff2c0 : d < 2.4 ? 0xf6cc6a : MYTHIC_BOT;
          t.setCharacterTint(i, 1, false, top, top, bot, bot);
        }
      }
    }

    if (this.orn) {
      if (vis) {
        // 화면 px 단위로 굽는다 (글자 폭·높이가 같으면 줌과 상관없이 같은 텍스처)
        const wp = Math.round(w / sc);
        const hp = Math.round(inkH / sc);
        const grade = this.grade;
        if (wp !== this.ornW || hp !== this.ornH || grade !== this.ornGrade) {
          this.ornW = wp;
          this.ornH = hp;
          this.ornGrade = grade;
          this.orn.show(`to|${grade}|${wp}|${hp}`, ornamentBounds(wp, hp), (g) => drawOrnaments(g, grade, wp, hp, 1));
        }
        this.orn.place(x, midY, sc, alpha);
      }
      this.orn.setVisible(vis);
    }

    if (this.halo) {
      const breathe = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 1100);
      const staff = this.grade === "staff";
      const mythic = this.grade === "mythic";
      this.halo
        .setPosition(x, midY)
        .setDisplaySize(w + (staff ? 30 : mythic ? 34 : 40) * sc, inkH + (staff ? 14 : mythic ? 16 : 18) * sc)
        .setAlpha(alpha * (staff ? 0.22 + 0.2 * breathe : mythic ? 0.24 + 0.18 * breathe : 0.18 + 0.16 * breathe))
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
      if (this.grade === "mythic") {
        // 금가루: 글자 위쪽 여기저기서 생겨 천천히 흩날리며 내려앉는다 (가루마다 자리·때가 다르다)
        const n = this.sparks.length;
        const t0 = this.reduced ? i / n : now / MYTHIC_DUST_MS + i / n;
        const u = t0 - Math.floor(t0);
        const cyc = Math.floor(t0);
        const rx = (((i * 0.37 + cyc * 0.61) % 1) + 1) % 1;
        px = x - w / 2 - 4 * sc + rx * (w + 8 * sc) + Math.sin(now / 520 + i) * 2 * sc;
        py = bottom - h - 2 * sc + u * (h + 8 * sc);
        a = this.reduced ? 0.6 : Math.sin(u * Math.PI) * 0.9;
        s.setPosition(Math.round(px), Math.round(py))
          .setScale(sc * (0.35 + 0.3 * a))
          .setAlpha(alpha * a)
          .setVisible(true);
        continue;
      } else if (this.grade === "silver") {
        // 끝에서 가끔 반짝
        const u = this.reduced ? 0.5 : (now % 1800) / 1800;
        px = x + w / 2 - 2 * sc;
        py = bottom - h + 2 * sc;
        a = this.reduced ? 0.7 : u < 0.3 ? Math.sin((u / 0.3) * Math.PI) : 0;
      } else {
        // 둘레를 천천히 돈다 (타원)
        const ang = (this.reduced ? 0 : now / 1400) + (i * Math.PI * 2) / this.sparks.length;
        px = x + Math.cos(ang) * (w / 2 + (this.grade === "staff" ? 12 : this.grade === "manager" ? 15 : 6) * sc);
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

/** 장식을 구울 영역 (화면 px, drawOrnaments와 같은 원점). 양옆 날개·보석·서류판과 금 등급 띠까지 넉넉히 */
function ornamentBounds(w: number, h: number): BakeBounds {
  const half = Math.round(w / 2 + 2);
  const X = half + 28;
  const Y = Math.ceil(h / 2) + 14;
  return { x: -X, y: -Y, w: 2 * X, h: 2 * Y };
}

/** 장식 (원점 = 글자 가운데). 금: 금빛 테두리판(위아래 금줄) + 양옆 금빛 마름모, 전설: 양옆 날개, 운영자: 양옆 금줄 + 보랏빛 보석 */
function drawOrnaments(g: Phaser.GameObjects.Graphics, grade: ViewGrade, w: number, h: number, sc: number): void {
  const u = sc;
  const half = Math.round(w / 2 + 2 * u);
  if (grade === "manager") {
    // 글자 쪽에서 바깥으로: 민트줄 두 가닥 → 서류판(청록 테 · 크림 종이 · 민트 글줄 · 위쪽 클립)
    for (const s of [-1, 1]) {
      const x0 = s * half;
      const len = 4 * u;
      const xa = s < 0 ? x0 - len : x0;
      g.fillStyle(0x0a0b10, 0.85).fillRect(xa - u, -2 * u, len + 2 * u, 4 * u);
      g.fillStyle(0xc8fff0, 1).fillRect(xa, -u, len, u);
      g.fillStyle(0x22b89c, 1).fillRect(xa, 0, len, u);
      const cx = x0 + s * (len + 4 * u);
      g.fillStyle(0x0a0b10, 0.9).fillRect(cx - 4 * u, -5 * u, 8 * u, 10 * u);
      g.fillStyle(0x1aa890, 1).fillRect(cx - 3 * u, -4 * u, 6 * u, 8 * u);
      g.fillStyle(0xfffaf0, 1).fillRect(cx - 2 * u, -3 * u, 4 * u, 6 * u);
      g.fillStyle(0x5fdcb8, 1).fillRect(cx - 2 * u, -u, 3 * u, u).fillRect(cx - 2 * u, u, 4 * u, u);
      g.fillStyle(0xd8f4ea, 1).fillRect(cx + u, -3 * u, u, u);
      g.fillStyle(0x0a0b10, 0.9).fillRect(cx - 2 * u, -6 * u, 4 * u, 2 * u);
      g.fillStyle(0x9af0dc, 1).fillRect(cx - u, -6 * u, 2 * u, 2 * u);
    }
    return;
  }
  if (grade === "mythic") {
    // 글자 쪽에서 바깥으로: 금줄 세 가닥(가운데 길게) → 금테 두른 금빛 네모 별(가운데 흰빛) → 위아래 작은 금가루 점
    for (const s of [-1, 1]) {
      const x0 = s * half;
      const len = 6 * u;
      const xa = s < 0 ? x0 - len : x0;
      g.fillStyle(0x0a0b10, 0.85).fillRect(xa - u, -3 * u, len + 2 * u, 6 * u);
      g.fillStyle(0xfff4c8, 1).fillRect(xa, -2 * u, len, u);
      g.fillStyle(0xffd04a, 1).fillRect(s < 0 ? xa - u : xa, -0.5 * u, len + u, u);
      g.fillStyle(0xd08a28, 1).fillRect(xa, u, len, u);
      const cx = x0 + s * (len + 4.5 * u);
      const star = (r: number, k: number) => [
        { x: cx, y: -r },
        { x: cx + k, y: -k },
        { x: cx + r, y: 0 },
        { x: cx + k, y: k },
        { x: cx, y: r },
        { x: cx - k, y: k },
        { x: cx - r, y: 0 },
        { x: cx - k, y: -k },
      ];
      g.fillStyle(0x0a0b10, 0.9).fillPoints(star(7 * u, 2.5 * u), true);
      g.fillStyle(0xffd36a, 1).fillPoints(star(6 * u, 1.8 * u), true);
      g.fillStyle(0xfff3c0, 1).fillPoints(star(3.5 * u, 1.1 * u), true);
      g.fillStyle(0xffffff, 1).fillRect(cx - 0.5 * u, -0.5 * u, u, u);
      for (const dy of [-5, 5]) {
        const dx = cx + s * 5 * u;
        g.fillStyle(0x0a0b10, 0.8).fillRect(dx - u, dy * u - u, 2 * u, 2 * u);
        g.fillStyle(0xffe08a, 1).fillRect(dx - 0.5 * u, dy * u - 0.5 * u, u, u);
      }
    }
    return;
  }
  if (grade === "staff") {
    // 글자 쪽에서 바깥으로: 금줄 두 가닥(위 밝게) → 금테 두른 보랏빛 마름모 보석(가운데 흰 반짝) → 끝 금 구슬
    for (const s of [-1, 1]) {
      const x0 = s * half;
      const len = 5 * u;
      const xa = s < 0 ? x0 - len : x0;
      g.fillStyle(0x0a0b10, 0.85).fillRect(xa - u, -2 * u, len + 2 * u, 4 * u);
      g.fillStyle(0xfff2bd, 1).fillRect(xa, -u, len, u);
      g.fillStyle(0xd9962e, 1).fillRect(xa, 0, len, u);
      const cx = x0 + s * (len + 4 * u);
      const diamond = (r: number) => [
        { x: cx, y: -r },
        { x: cx + r, y: 0 },
        { x: cx, y: r },
        { x: cx - r, y: 0 },
      ];
      g.fillStyle(0x0a0b10, 0.9).fillPoints(diamond(6 * u), true);
      g.fillStyle(0xffd36a, 1).fillPoints(diamond(5 * u), true);
      g.fillStyle(0x6a3cc0, 1).fillPoints(diamond(3.5 * u), true);
      g.fillStyle(0xb98cff, 1).fillPoints(diamond(2.5 * u), true);
      g.fillStyle(0xf6ecff, 1).fillRect(cx - u, -u, u, u);
      const bx = cx + s * 7 * u;
      g.fillStyle(0x0a0b10, 0.85).fillRect(bx - 1.5 * u, -1.5 * u, 3 * u, 3 * u);
      g.fillStyle(0xffe08a, 1).fillRect(bx - 0.5 * u, -0.5 * u, u, u);
    }
    return;
  }
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
