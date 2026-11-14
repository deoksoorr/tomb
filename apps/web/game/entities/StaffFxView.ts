import * as Phaser from "phaser";
import { DIR, type DirId } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { makeCanvas } from "../sprites/pixel";
import { STAFF_SHINE_FRAMES, staffPlateGrid, staffPlateLayout, staffShineGrid, type StaffPlateLayout } from "../sprites/staffPlate";
import type { GlyphAtlas } from "../text/GlyphAtlas";

// 31번 운영자 계정의 저승사자 차림: 검은 망토(AvatarView가 색을 STAFF_COLOR로 바꾼다) + 손에 든 낫 + 발밑에 은은한 안개 +
// 11/15 운영자 이름표: 금빛 겹테두리·금관·보석 마개를 단 자줏빛 판(sprites/staffPlate) + 몇 초마다 판을 훑는 빛줄기 + 판 위로 떠오르는 금빛·보랏빛 불티 +
// 숨쉬는 빛 무리. 이름은 닉네임 그대로이고 머리 위 「운영자」 칭호는 TitleView가 그린다 (AvatarView가 운영자면 칭호 자리에 띄운다).
// 운영자 표시는 실시간 서버가 입장 토큰(Vercel 서명)에서 받은 것만 오므로 흉내 낼 수 없다.
// 성능: 판·빛줄기 그림은 글자 크기가 바뀔 때만 고른다(같은 크기는 텍스처를 같이 쓴다). 매 프레임은 위치·알파·프레임 번호만 바꾼다.
// 움직임 줄이기: 빛줄기·불티 없이 멈춘 판 + 고정 빛.

/** 저승사자 망토 색 표기 (기본|머리|몸|포인트): 거의 검은 두건·망토, 보랏빛 회색 목도리 */
export const STAFF_COLOR = "#3a3446|#2b2734|#24212c|#6f6488";
/** 이름표 뒤 빛 무리 색 (가산 섞기) */
const HALO_GOLD = 0xffb840;
/** 숨쉬는 빛 주기 (ms 단위 각속도 분모) */
const HALO_BREATH_MS = 700;
/** 빛줄기: 이 간격마다 한 번, SHINE_MS 동안 왼쪽에서 오른쪽으로 훑는다 */
const SHINE_EVERY_MS = 4200;
const SHINE_MS = 650;
/** 불티 수·한 번 떠오르는 시간·떠오르는 높이(화면 px) */
const EMBERS = 4;
const EMBER_MS = 2400;
const EMBER_RISE = 11;
const EMBER_TINTS = [0xffd36a, 0xc9a2ff, 0xffe9a8, 0xb98cff];

// 낫 그림 (오른쪽을 보고 든 모습). L 외곽선, S 날, H 날 반짝임, W 자루, w 자루 그늘
const SCYTHE = [
  "....LLLLL....",
  "...LHHHSSLL..",
  "..LWSSSSSSSL.",
  "..LWLLLLSSSSL",
  "..LWL...LLSSL",
  "..LWL.....LSL",
  "..LWL......LL",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "...L.........",
];
const PAL: Record<string, string> = { L: "#1b1822", S: "#b7bccb", H: "#eef1f8", W: "#6e5238", w: "#4e3a28" };
const SCYTHE_W = SCYTHE[0].length;
const SCYTHE_H = SCYTHE.length;
/** 쥐는 자리 (그림 안 픽셀) */
const GRIP_X = 3.5;
const GRIP_Y = 12;
const SCYTHE_KEY = "staff-scythe";

function ensureScythe(scene: Phaser.Scene): string {
  if (!scene.textures.exists(SCYTHE_KEY)) {
    const { canvas, ctx } = makeCanvas(SCYTHE_W, SCYTHE_H);
    SCYTHE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = PAL[ch];
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    addCanvasTexture(scene, SCYTHE_KEY, { canvas });
  }
  return SCYTHE_KEY;
}

/** 같은 글자 크기의 판·빛줄기 텍스처 (운영자 여러 장면·다시 만들 때 같이 쓴다) */
function ensurePlate(scene: Phaser.Scene, tw: number, th: number): { plate: string; shine: string } {
  const plate = `staff-plate-${tw}x${th}`;
  const shine = `staff-shine-${tw}x${th}`;
  if (!scene.textures.exists(plate)) addCanvasTexture(scene, plate, { canvas: staffPlateGrid(tw, th).toCanvas() });
  if (!scene.textures.exists(shine)) {
    const L = staffPlateLayout(tw, th);
    addCanvasTexture(scene, shine, { canvas: staffShineGrid(tw, th).toCanvas(), frameW: L.w, frameH: L.h });
  }
  return { plate, shine };
}

/** 0~1 결정적 난수 (불티 자리) */
const rand = (n: number): number => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export type StaffSync = {
  now: number;
  /** 발밑 (표시 기준) */
  x: number;
  y: number;
  dir: DirId;
  /** 손 위치: 발밑에서 옆으로 dx, 위로 up */
  hand: { dx: number; up: number };
  depth: number;
  moving: boolean;
  /** 물속·해먹·눕기처럼 손이 안 보이는 자세 */
  hidden: boolean;
  reduced: boolean;
  label: Phaser.GameObjects.BitmapText;
  labelScale: number;
};

export class StaffFxView {
  private readonly scythe: Phaser.GameObjects.Image;
  private readonly fog: Phaser.GameObjects.Image[] = [];
  /** 이름표 판 (이름표 글자 바로 뒤) */
  private readonly plate: Phaser.GameObjects.Image;
  /** 판을 훑는 빛줄기 (가산 섞기, 글자 위) */
  private readonly shine: Phaser.GameObjects.Image;
  /** 이름표 뒤 숨쉬는 빛 무리 (가산 섞기) */
  private readonly halo: Phaser.GameObjects.Image;
  /** 판 위로 떠오르는 불티 */
  private readonly embers: Phaser.GameObjects.Image[] = [];
  /** 판을 마지막으로 맞춘 글자 크기 (바뀔 때만 텍스처를 고른다) */
  private plateKey = "";
  private layout: StaffPlateLayout | null = null;
  /** 이름표 칸 윗변 ↔ 판 꼭대기(금관) 거리 (그림 px, 배율 전) */
  private liftPx = 0;
  /** 이름표 글자 옆 ↔ 판 바깥 끝 거리 (그림 px, 배율 전) */
  private sidePx = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    labelDepth: number,
  ) {
    this.scythe = scene.add.image(0, 0, ensureScythe(scene));
    for (let i = 0; i < 4; i++)
      this.fog.push(
        scene.add
          .image(0, 0, TEX.glow)
          .setTint(i % 2 ? 0x8a7cb0 : 0x15121c)
          .setBlendMode(i % 2 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setScale(0.5, 0.16),
      );
    this.halo = scene.add.image(0, 0, TEX.glow).setTint(HALO_GOLD).setBlendMode(Phaser.BlendModes.ADD).setDepth(labelDepth - 0.03).setVisible(false);
    this.plate = scene.add.image(0, 0, TEX.pixel).setOrigin(0, 0).setDepth(labelDepth - 0.02).setVisible(false);
    // 빛줄기는 글자 위로 지나간다 (판 대부분이 글자라 뒤에 두면 가려진다. 가산 섞기라 글자는 잠깐 밝아질 뿐 그대로 읽힌다)
    this.shine = scene.add.image(0, 0, TEX.pixel).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(labelDepth + 0.005).setVisible(false);
    for (let i = 0; i < EMBERS; i++)
      this.embers.push(
        scene.add
          .image(0, 0, TEX.spark)
          .setTint(EMBER_TINTS[i % EMBER_TINTS.length])
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(labelDepth + 0.01)
          .setVisible(false),
      );
  }

  /** 이름표 위에 얹는 것(칭호·1위 배지·말풍선)을 올릴 높이: 이름표 칸 윗변 → 판 꼭대기 (월드 단위) */
  topLift(sc: number): number {
    return this.liftPx * sc;
  }

  /** 이름표 옆 표시(친구 하트·도감 별)가 판 밖으로 비켜설 거리 (월드 단위) */
  sidePad(sc: number): number {
    return this.sidePx * sc;
  }

  /** 글자 크기에 맞는 판을 고른다 (크기가 바뀔 때만) */
  private fitPlate(l: Phaser.GameObjects.BitmapText, sc: number): StaffPlateLayout {
    const pad = this.atlas.inkPad;
    const tw = Math.max(1, Math.round(l.width / sc));
    const th = Math.max(1, Math.round(l.height / sc) - pad.top - pad.bottom);
    const key = `${tw}|${th}`;
    if (key !== this.plateKey || !this.layout) {
      this.plateKey = key;
      const t = ensurePlate(this.scene, tw, th);
      this.plate.setTexture(t.plate);
      this.shine.setTexture(t.shine, 0);
      this.layout = staffPlateLayout(tw, th);
      this.liftPx = this.layout.inkY - pad.top;
      // 판 바깥 끝 − 외곽선 1px (하트·별은 2px 더 떨어져 놓인다)
      this.sidePx = this.layout.inkX - 1;
    }
    return this.layout;
  }

  sync(s: StaffSync, vis: boolean): void {
    const side = s.dir === DIR.left || s.dir === DIR.right;
    const flip = s.dir === DIR.left;
    const bob = s.moving && !s.reduced ? Math.round(Math.sin(s.now / 110)) : 0;
    this.scythe
      .setFlipX(flip)
      .setOrigin((flip ? SCYTHE_W - GRIP_X : GRIP_X) / SCYTHE_W, GRIP_Y / SCYTHE_H)
      .setPosition(Math.round(s.x + s.hand.dx), Math.round(s.y - s.hand.up + bob))
      // 뒷모습이면 몸 뒤, 나머지는 앞 (옆모습은 손이 앞에 있다)
      .setDepth(s.dir === DIR.up ? s.depth - 0.06 : s.depth + (side ? 0.06 : 0.04))
      .setVisible(vis && !s.hidden);

    for (let i = 0; i < this.fog.length; i++) {
      const a = s.now / 2100 + i * 1.7;
      const dark = i % 2 === 0;
      const breathe = s.reduced ? 0 : Math.sin(s.now / 900 + i);
      this.fog[i]
        .setPosition(s.x + Math.cos(a) * 7, s.y - 1 + Math.sin(a * 1.3) * 1.5)
        .setAlpha(dark ? 0.32 + 0.06 * breathe : 0.1 + 0.04 * breathe)
        .setDepth(s.depth + (dark ? -0.08 : 0.08))
        .setVisible(vis && !s.hidden);
    }

    const l = s.label;
    if (!(vis && l.visible && l.text !== "")) {
      this.hidePlate();
      return;
    }
    const sc = s.labelScale;
    const L = this.fitPlate(l, sc);
    // 판 왼쪽 위 = 글자 상자 왼쪽 위 − 판 안 글자 자리
    const px = l.x - l.width / 2 - L.inkX * sc;
    const py = l.y - l.height + this.atlas.inkPad.top * sc - L.inkY * sc;
    const fa = l.alpha;
    if (this.plate.scaleX !== sc) this.plate.setScale(sc);
    this.plate.setPosition(px, py).setAlpha(fa).setVisible(true);

    // 숨쉬듯 밝아지는 빛 무리 (움직임 줄이기면 고정 빛)
    const breathe = s.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(s.now / HALO_BREATH_MS);
    this.halo
      .setPosition(px + (L.w * sc) / 2, py + ((L.top + L.bottom + 1) / 2) * sc)
      .setDisplaySize((L.w + 28) * sc, (L.bottom - L.top + 26) * sc)
      .setAlpha(fa * (0.24 + 0.3 * breathe))
      .setVisible(true);

    // 빛줄기: SHINE_EVERY_MS마다 SHINE_MS 동안 프레임을 넘긴다
    const t = s.now % SHINE_EVERY_MS;
    if (!s.reduced && t < SHINE_MS) {
      const f = Math.min(STAFF_SHINE_FRAMES - 1, Math.floor((t / SHINE_MS) * STAFF_SHINE_FRAMES));
      if (this.shine.frame.name !== String(f)) this.shine.setFrame(f);
      if (this.shine.scaleX !== sc) this.shine.setScale(sc);
      this.shine.setPosition(px, py).setAlpha(fa).setVisible(true);
    } else if (this.shine.visible) this.shine.setVisible(false);

    // 불티: 판 윗변 근처에서 생겨 흔들리며 떠오르다 사라진다 (자리는 바퀴마다 결정적 난수)
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i];
      if (s.reduced) {
        if (e.visible) e.setVisible(false);
        continue;
      }
      const k = s.now / EMBER_MS + i / this.embers.length;
      const cycle = Math.floor(k);
      const u = k - cycle;
      const r = rand(cycle * 7 + i * 13 + 1);
      const ex = px + (L.left + 2 + r * (L.right - L.left - 4)) * sc + Math.sin(u * 5 + r * 6) * 1.5 * sc;
      const ey = py + (L.top + 1) * sc - u * EMBER_RISE * sc;
      e.setPosition(ex, ey)
        .setScale(sc * (0.35 + 0.35 * (1 - u)))
        .setAlpha(fa * Math.sin(u * Math.PI) * 0.9)
        .setVisible(true);
    }
  }

  private hidePlate(): void {
    this.plate.setVisible(false);
    this.shine.setVisible(false);
    this.halo.setVisible(false);
    for (const e of this.embers) e.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.scythe.setVisible(v);
    for (const f of this.fog) f.setVisible(v);
    if (!v) this.hidePlate(); // 켜기는 다음 sync가
  }

  destroy(): void {
    this.scythe.destroy();
    for (const f of this.fog) f.destroy();
    this.plate.destroy();
    this.shine.destroy();
    this.halo.destroy();
    for (const e of this.embers) e.destroy();
  }
}
