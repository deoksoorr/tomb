import * as Phaser from "phaser";
import { fillEdgeColors, flameColor, nameColorSpec, namePlateSpec, type NameColorSpec, type NamePlateSpec } from "@/lib/nameStyle";
import { TEX } from "../assets/manifest";
import { LABEL_ME, LABEL_OTHER } from "../config";

// 닉네임 꾸미기 (머리 위 이름표): 이름 글자 색(단색·그라데이션·움직이는 이름)과 이름표 바탕판.
// 이름표는 비트맵 글꼴(GlyphAtlas — 흰 글자 + 어두운 외곽선)이라 색은 tint로 입힌다:
//  - 단색: 이름표 전체 tint
//  - 그라데이션·무지개·불꽃: 글자마다 네 귀퉁이 tint (setCharacterTint — 글자 i의 왼쪽 = 경계 색 i, 오른쪽 = 경계 색 i+1 → 이름 전체가 한 띠)
//    Phaser는 글자 색 객체를 한 번 만든 뒤 고쳐 쓰므로, 움직이는 이름도 매 프레임 새 객체를 만들지 않는다 (경계 색 배열도 고쳐 쓴다)
//  - 빛 테두리·불꽃: 이름표 뒤 빛 무리 한 장 (가산 섞기), 별가루: 반짝이 3개를 돌려 쓴다
//  - 바탕판: Graphics 한 장. 이름표 크기·배율이 바뀔 때만 다시 그린다
// 성능: 움직이는 색은 ANIM_STEP_MS마다만 다시 칠하고, sync는 보이는 아바타만 부른다(화면 밖이면 멈춘다).
// 움직임 줄이기 설정이면 멈춘 그림(그라데이션·고정 빛·고정 반짝이).
// 이름표와 장식은 모두 밤 어둠 층 위(DEPTH.labels)라 밤에도 색이 그대로 보인다.
// 내 이름표: 산 색이 있으면 그 색을 쓰고, 내 것이라는 표시는 이름표 아래 작은 촛불빛 삼각형으로 한다 (색이 없으면 예전처럼 촛불빛 글자).
// 운영자: 금빛 테두리(StaffFxView)와 겹치지 않게 바탕판은 그리지 않는다 (글자 색은 그대로).

/** 움직이는 이름 색을 다시 칠하는 간격 (ms) */
const ANIM_STEP_MS = 80;
/** 흐르는 무지개 한 바퀴 (ms) */
const RAINBOW_MS = 3200;
/** 별가루 반짝이 수와 한 번 반짝이는 길이 */
const SPARKS = 3;
const SPARK_MS = 1300;

/** 무지개 띠 (파스텔 — 밤·낮 모두 외곽선과 대비가 높다) */
const RAINBOW = [0xff9a9a, 0xffd27a, 0xb8f58a, 0x8ad8ff, 0xc2a2ff];

/** 바탕판 여백 (화면 px): 옆·위·아래 */
const PAD_X = 3;
const PAD_Y = 1;

export class NameStyleView {
  private colorId: string | null = null;
  private plateId: string | null = null;
  private color: NameColorSpec | null = null;
  private plateSpec: NamePlateSpec | null = null;
  private staff = false;
  private plate: Phaser.GameObjects.Graphics | null = null;
  private plateKey = "";
  private halo: Phaser.GameObjects.Image | null = null;
  private sparks: Phaser.GameObjects.Image[] = [];
  private marker: Phaser.GameObjects.Graphics | null = null;
  private markerSc = 0;
  /** 글자 경계 색 (고쳐 쓴다) */
  private readonly edges: number[] = [];
  /** 마지막으로 칠한 움직임 단계 (-1 = 다시 칠해야 함) */
  private step = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly label: Phaser.GameObjects.BitmapText,
    private readonly isMe: boolean,
    private readonly reduced: boolean,
  ) {}

  /** 착용한 닉네임 꾸미기 (모르는 id는 없는 것으로). 바뀐 것만 다시 만든다 */
  set(colorId: string | null, plateId: string | null): void {
    const color = nameColorSpec(colorId);
    const plate = namePlateSpec(plateId);
    const cid = color ? colorId : null;
    const pid = plate ? plateId : null;
    if (cid === this.colorId && pid === this.plateId) return;
    if (cid !== this.colorId) {
      this.colorId = cid;
      this.color = color;
      this.rebuildColorFx();
      this.paint(0);
    }
    if (pid !== this.plateId) {
      this.plateId = pid;
      this.plateSpec = plate;
      this.plateKey = "";
      if (plate && !this.plate) this.plate = this.scene.add.graphics().setDepth(this.label.depth - 0.01).setVisible(false);
      if (!plate) {
        this.plate?.destroy();
        this.plate = null;
      }
    }
  }

  /** 꾸미기가 하나도 없는지 (AvatarView가 이 객체를 버린다) */
  get empty(): boolean {
    return this.colorId === null && this.plateId === null;
  }

  /** 운영자 표시가 켜지면 바탕판을 숨긴다 (금빛 테두리와 겹치지 않게) */
  setStaff(on: boolean): void {
    this.staff = on;
  }

  /** 이름 글자가 바뀌었다 (글자 수가 달라지면 경계 색도 다시) */
  textChanged(): void {
    this.step = -1;
    this.paint(0);
  }

  /** 바탕판이 보이는지 */
  private get plateOn(): boolean {
    return this.plateSpec !== null && !this.staff;
  }

  /** 이름표 옆에 붙는 표시(친구 하트·도감 별)가 바탕판 밖으로 비켜설 거리 (월드 단위) */
  sidePad(sc: number): number {
    if (!this.plateOn) return 0;
    return (PAD_X + 1 + (this.plateSpec?.kind === "ribbon" ? 4 : 0)) * sc;
  }

  /** 이름표 위에 얹는 것(1위 배지·말풍선)을 올릴 높이 (월드 단위) */
  topLift(sc: number): number {
    return this.plateOn ? (PAD_Y + 1 + (this.plateSpec?.kind === "cloud" || this.plateSpec?.kind === "tomb" ? 1 : 0)) * sc : 0;
  }

  /** 빛 무리·반짝이·내 표시를 꾸미기에 맞춰 만들거나 치운다 */
  private rebuildColorFx(): void {
    const c = this.color;
    const fx = c?.kind === "fx" ? c.fx : null;
    const wantHalo = fx === "glow" || fx === "flame";
    if (wantHalo && !this.halo) this.halo = this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.label.depth - 0.02).setVisible(false);
    if (!wantHalo && this.halo) {
      this.halo.destroy();
      this.halo = null;
    }
    if (fx === "stars" && !this.sparks.length)
      for (let i = 0; i < SPARKS; i++)
        this.sparks.push(this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.label.depth + 0.01).setVisible(false));
    if (fx !== "stars" && this.sparks.length) {
      for (const s of this.sparks) s.destroy();
      this.sparks = [];
    }
    const wantMarker = this.isMe && c !== null;
    if (wantMarker && !this.marker) {
      this.marker = this.scene.add.graphics().setDepth(this.label.depth + 0.01).setVisible(false);
      this.markerSc = 0;
    }
    if (!wantMarker && this.marker) {
      this.marker.destroy();
      this.marker = null;
    }
    this.step = -1;
  }

  /** 글자 색을 칠한다 (now = 움직이는 이름의 시각) */
  private paint(now: number): void {
    const l = this.label;
    const c = this.color;
    const n = l.text.length;
    // 글자마다 색 지우기 (단색·꾸미기 없음은 이름표 전체 tint만)
    if (!c || c.kind === "solid" || (c.kind === "fx" && c.fx === "glow")) {
      if (n) l.setCharacterTint(0, -1);
      l.setTint(!c ? (this.isMe ? LABEL_ME : LABEL_OTHER) : c.kind === "solid" ? c.color : c.stops[0]);
      return;
    }
    if (!n) return;
    if (c.kind === "fx" && c.fx === "flame") {
      const t = this.reduced ? 0 : now;
      for (let i = 0; i < n; i++) {
        const top = flameColor(i, t, true);
        const bottom = flameColor(i, t, false);
        l.setCharacterTint(i, 1, false, top, top, bottom, bottom);
      }
      return;
    }
    const e =
      c.kind === "fx" && c.fx === "rainbow"
        ? fillEdgeColors(this.edges, RAINBOW, n, this.reduced ? 0 : now / RAINBOW_MS, 0.6)
        : fillEdgeColors(this.edges, c.stops, n);
    for (let i = 0; i < n; i++) l.setCharacterTint(i, 1, false, e[i], e[i + 1], e[i], e[i + 1]);
  }

  /** 이름표에 맞춘다 (보이는 아바타만 매 프레임). sc = 이름표 배율, alpha = 실내 들어가며 흐려지는 정도 */
  sync(now: number, sc: number, vis: boolean, alpha: number): void {
    const l = this.label;
    const c = this.color;
    const on = vis && l.visible && l.text !== "";
    // 움직이는 색: 정해진 간격마다만 다시 칠한다
    const moving = !this.reduced && c?.kind === "fx" && (c.fx === "rainbow" || c.fx === "flame");
    if (moving && on) {
      const step = Math.floor(now / ANIM_STEP_MS);
      if (step !== this.step) {
        this.step = step;
        this.paint(now);
      }
    } else if (this.step === -1) {
      this.step = 0;
      this.paint(0);
    }

    const w = l.width;
    const h = l.height;
    const cx = l.x;
    const bottom = l.y;

    if (this.plate) {
      const show = on && this.plateOn;
      if (show) {
        const key = `${w}|${h}|${sc}`;
        if (key !== this.plateKey) {
          this.plateKey = key;
          drawPlate(this.plate.clear(), this.plateSpec!, w, h, sc);
        }
        this.plate.setPosition(cx, bottom).setAlpha(alpha);
      }
      this.plate.setVisible(show);
    }

    if (this.halo && c?.kind === "fx") {
      const breathe = this.reduced ? 0.5 : c.fx === "flame" ? 0.5 + 0.5 * Math.sin(now / 130) * Math.sin(now / 370) : 0.5 + 0.5 * Math.sin(now / 900);
      this.halo
        .setTint(c.halo ?? 0xffffff)
        .setPosition(cx, bottom - h / 2)
        .setDisplaySize(w + 14 * sc, h + 10 * sc)
        .setAlpha(alpha * (c.fx === "flame" ? 0.22 + 0.16 * breathe : 0.2 + 0.25 * breathe))
        .setVisible(on);
    }

    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!on) {
        if (s.visible) s.setVisible(false);
        continue;
      }
      // 반짝이마다 차례로 이름표 둘레 아무 데서나 반짝 (움직임 줄이기면 세 귀퉁이에 고정)
      let px: number;
      let py: number;
      let a: number;
      if (this.reduced) {
        px = i === 0 ? -0.5 : i === 1 ? 0.5 : 0.15;
        py = i === 2 ? 1 : 0;
        a = 0.8;
      } else {
        const t = now + (i * SPARK_MS) / SPARKS;
        const k = Math.floor(t / SPARK_MS);
        const u = (t % SPARK_MS) / SPARK_MS;
        px = hash01(k, i) - 0.5;
        py = hash01(k, i + 7);
        a = Math.sin(Math.PI * u);
      }
      s.setPosition(Math.round(cx + px * (w + 4 * sc)), Math.round(bottom - h * 0.15 - py * h * 0.9))
        .setScale(sc * (this.reduced ? 1 : 0.7 + 0.5 * a))
        .setAlpha(alpha * a)
        .setVisible(true);
    }

    if (this.marker) {
      if (on && sc !== this.markerSc) {
        this.markerSc = sc;
        // 아래를 가리키는 작은 삼각형 (어두운 테두리 + 촛불빛)
        this.marker
          .clear()
          .fillStyle(0x0a0b10, 0.9)
          .fillTriangle(-3 * sc, 0, 3 * sc, 0, 0, 3 * sc)
          .fillStyle(LABEL_ME, 1)
          .fillTriangle(-2 * sc, 0, 2 * sc, 0, 0, 2 * sc);
      }
      this.marker
        .setPosition(Math.round(cx), bottom + (this.plateOn ? PAD_Y + 1 : 0) * sc)
        .setAlpha(alpha)
        .setVisible(on);
    }
  }

  setVisible(v: boolean): void {
    if (v) return; // 다음 sync가 켠다
    this.plate?.setVisible(false);
    this.halo?.setVisible(false);
    this.marker?.setVisible(false);
    for (const s of this.sparks) s.setVisible(false);
  }

  /** 꾸미기를 모두 걷고 원래 이름표 색으로 */
  destroy(): void {
    if (this.label.active) {
      if (this.label.text.length) this.label.setCharacterTint(0, -1);
      this.label.setTint(this.isMe ? LABEL_ME : LABEL_OTHER);
    }
    this.plate?.destroy();
    this.plate = null;
    this.halo?.destroy();
    this.halo = null;
    this.marker?.destroy();
    this.marker = null;
    for (const s of this.sparks) s.destroy();
    this.sparks = [];
  }
}

/** 결정적 [0,1) (반짝이 자리) */
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 바탕판 그리기 (원점 = 이름표 아래 가운데, 단위 = 화면 1px × sc). 이름표 글자 칸(w×h)을 PAD만큼 둘러싼다.
 * 픽셀 느낌이 나게 sc 단위로만 그린다
 */
export function drawPlate(g: Phaser.GameObjects.Graphics, p: NamePlateSpec, w: number, h: number, sc: number): void {
  const L = Math.round(-w / 2 - PAD_X * sc);
  const R = Math.round(w / 2 + PAD_X * sc);
  const T = Math.round(-h - PAD_Y * sc);
  const B = Math.round(PAD_Y * sc);
  const W = R - L;
  const H = B - T;
  const u = sc;
  switch (p.kind) {
    case "wood": {
      g.fillStyle(p.edge, 1).fillRect(L - u, T - u, W + 2 * u, H + 2 * u);
      g.fillStyle(p.fill, p.alpha).fillRect(L, T, W, H);
      g.fillStyle(p.light, p.alpha).fillRect(L, T, W, u);
      // 나뭇결
      g.fillStyle(p.edge, 0.35).fillRect(L + 2 * u, T + Math.round(H * 0.62), Math.max(u, W * 0.3), u);
      g.fillStyle(p.dots[0], 1).fillRect(L + u, T + u, u, u).fillRect(R - 2 * u, T + u, u, u);
      break;
    }
    case "ribbon": {
      // 갈라진 꼬리 (양옆)
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? L : R;
        g.fillStyle(p.edge, 1).fillPoints(
          [
            { x: x0, y: T + u },
            { x: x0 + s * 5 * u, y: T + u },
            { x: x0 + s * 3 * u, y: T + H / 2 },
            { x: x0 + s * 5 * u, y: B - u },
            { x: x0, y: B - u },
          ],
          true,
        );
      }
      g.fillStyle(p.edge, 1).fillRect(L - u, T - u, W + 2 * u, H + 2 * u);
      g.fillStyle(p.fill, p.alpha).fillRect(L, T, W, H);
      g.fillStyle(p.light, p.alpha).fillRect(L, T, W, u);
      break;
    }
    case "cloud": {
      const r = Math.max(2 * u, Math.round(H / 2));
      const bumps = Math.max(2, Math.round(W / (7 * u)));
      // 테두리 (한 겹 크게) → 바탕
      for (const [col, a, grow] of [
        [p.edge, 1, u],
        [p.fill, p.alpha, 0],
      ] as const) {
        g.fillStyle(col, a).fillRoundedRect(L - grow, T - grow, W + 2 * grow, H + 2 * grow, r + grow);
        for (let i = 0; i < bumps; i++) {
          const bx = L + r + ((W - 2 * r) * (i + 0.5)) / bumps;
          g.fillCircle(bx, T + u, r * 0.7 + grow);
        }
      }
      g.fillStyle(p.light, 0.9).fillRect(L + r, T, W - 2 * r, u);
      break;
    }
    case "wreath": {
      g.fillStyle(p.edge, 1).fillRoundedRect(L - u, T - u, W + 2 * u, H + 2 * u, 3 * u);
      g.fillStyle(p.fill, p.alpha).fillRoundedRect(L, T, W, H, 2 * u);
      // 둘레의 작은 꽃 (위·아래 줄, 번갈아 색)
      const step = 6 * u;
      let k = 0;
      for (let x = L + 2 * u; x <= R - 2 * u; x += step, k++) {
        g.fillStyle(p.dots[k % p.dots.length], 1).fillRect(Math.round(x), T - u, 2 * u, 2 * u);
        g.fillStyle(p.dots[(k + 1) % p.dots.length], 1).fillRect(Math.round(x + step / 2), B - u, 2 * u, 2 * u);
      }
      break;
    }
    case "tomb": {
      const top = T - u;
      const rad = Math.min(5 * u, H / 2);
      g.fillStyle(p.edge, 1).fillRoundedRect(L - u, top - u, W + 2 * u, B - top + 2 * u, { tl: rad + u, tr: rad + u, bl: u, br: u });
      g.fillStyle(p.fill, p.alpha).fillRoundedRect(L, top, W, B - top, { tl: rad, tr: rad, bl: 0, br: 0 });
      g.fillStyle(p.light, p.alpha).fillRect(L + rad, top, W - 2 * rad, u);
      // 밑동 이끼
      g.fillStyle(p.dots[0], 1).fillRect(L, B - u, 3 * u, u).fillRect(R - 4 * u, B - u, 2 * u, u);
      break;
    }
    case "star": {
      g.fillStyle(p.edge, 1).fillRect(L - u, T - u, W + 2 * u, H + 2 * u);
      g.fillStyle(p.fill, p.alpha).fillRect(L, T, W, H);
      g.fillStyle(p.light, p.alpha).fillRect(L, T, W, u);
      // 귀퉁이 별 (십자 모양)
      const star = (x: number, y: number, c: number) => {
        g.fillStyle(c, 1).fillRect(x, y, u, u);
        g.fillStyle(c, 0.6).fillRect(x - u, y, u, u).fillRect(x + u, y, u, u).fillRect(x, y - u, u, u).fillRect(x, y + u, u, u);
      };
      star(L, T, p.dots[0]);
      star(R - u, B - u, p.dots[0]);
      star(R - 2 * u, T + u, p.dots[1]);
      break;
    }
  }
}
