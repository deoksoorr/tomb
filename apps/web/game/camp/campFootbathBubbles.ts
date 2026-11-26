import * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { Grid } from "../sprites/pixel";
import { CAMP_TEX_PREFIX } from "./campTypes";
import { FOOT_WATER } from "./valleyExtraArt";

// 11/26 족욕탕 보글보글 (운영자 「족욕탕 연기를 빼 줄래?? 그냥 보글보글만 좀 더 빡세게」 — 김 기둥·김 파티클은 뺐어요).
// 탕 물 위 여기저기서 작은 거품이 올라와 커지다 톡 터지고, 터진 자리에 작은 물결 고리가 번진다.
// 픽셀 그림 프레임만 바꿔 끼운다 (늘이거나 흐린 알파 없이 — 맵 그림과 같은 또렷한 점). 물대롱이 떨어지는 자리는 조금 더 자주.
// 화면 밖이면 숨기고 멈춘다. 움직임 줄이기(reduced)면 거품 수를 줄인다.
// 밤: 같은 프레임의 빛 그림(그늘 픽셀 뺀 흰 테·반짝만)을 밤 어둠 위(DEPTH.lights)에 더하기로 한 겹 더 — 등롱 빛에 반짝이는 물처럼 또렷하게 (낮엔 0).
// 빛 겹은 사람보다 위라, 사람(몸·물에 담근 다리·물 조각 — 둘레 BODY)과 겹치는 거품은 그 프레임만 빛 겹을 끈다 (몸을 뚫고 빛나지 않게)

const TEX = `${CAMP_TEX_PREFIX}foot-bubble`;
const LIT_TEX = `${CAMP_TEX_PREFIX}foot-bubble-lit`;
const FW = 11;
const FH = 7;
/** 프레임 그림 가운데 (그림 좌표) */
const CX = 5;
const CY = 3;
/** 프레임: 0 점 · 1 작은 방울 · 2 중간 방울 · 3 큰 방울 · 4 톡 터짐 · 5 작은 고리 · 6 큰 고리 */
const F = { dot: 0, small: 1, mid: 2, big: 3, pop: 4, ring: 5, ring2: 6 } as const;
/** 탕 물 안쪽 (데크 왼쪽 위 기준 — valleyExtraArt footBathArt P0 18·32 ~ P1 61·92에서 가장자리·윗 테를 뺀 곳) */
const WATER = { x0: 23, x1: 56, y0: 38, y1: 87, r: 5 } as const;
/** 대나무 물대롱이 떨어지는 자리 (물이 늘 일렁이는 곳) */
const SPOUT = { x: 40, y: 40 } as const;
/** 사람 둘레 (발 기준 — 몸 + 족욕탕 옆 자리에서 탕 쪽으로 뻗은 다리·물 조각까지 넉넉히) */
const BODY = { l: 16, r: 16, up: 34, down: 4 } as const;

type Bubble = { img: Phaser.GameObjects.Image; lit: Phaser.GameObjects.Image; x: number; y: number; t0: number; big: boolean; spout: boolean; on: boolean; glow: boolean };

export class FootbathBubbles {
  private readonly bubbles: Bubble[] = [];
  private shown = true;
  /** 이번 프레임 족욕탕 둘레 사람 (탕 기준 x, y 쌍) */
  private readonly near: number[] = [];
  private litA = 0;

  constructor(
    scene: Phaser.Scene,
    /** 족욕탕 그림 왼쪽 위 (맵 좌표) */
    private readonly x0: number,
    private readonly y0: number,
    depth: number,
    /** 밤 빛 겹 깊이 (밤 어둠 위 — DEPTH.lights) */
    litDepth: number,
    reduced: boolean,
  ) {
    if (!scene.textures.exists(TEX)) addCanvasTexture(scene, TEX, { canvas: bubbleSheet(false), frameW: FW, frameH: FH });
    if (!scene.textures.exists(LIT_TEX)) addCanvasTexture(scene, LIT_TEX, { canvas: bubbleSheet(true), frameW: FW, frameH: FH });
    const n = reduced ? 6 : 18;
    const spouts = reduced ? 1 : 4;
    for (let i = 0; i < n; i++) {
      const img = scene.add.image(0, 0, TEX, 0).setOrigin(0, 0).setDepth(depth).setVisible(false);
      const lit = scene.add.image(0, 0, LIT_TEX, 0).setOrigin(0, 0).setDepth(litDepth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.bubbles.push({ img, lit, x: 0, y: 0, t0: Number.NaN, big: false, spout: i < spouts, on: false, glow: false });
    }
  }

  /** dark = 밤 어둠 (0 낮 ~ 1 한밤) · people = 맵 위 사람 발 위치 (나 + 같은 맵 사람) */
  update(time: number, view: Phaser.Geom.Rectangle, dark: number, people: Iterable<{ x: number; y: number }>): void {
    const pad = 24;
    const on = view.right > this.x0 + WATER.x0 - pad && view.x < this.x0 + WATER.x1 + pad && view.bottom > this.y0 + WATER.y0 - pad && view.y < this.y0 + WATER.y1 + pad;
    if (on !== this.shown) {
      this.shown = on;
      if (!on) for (const b of this.bubbles) this.hide(b);
    }
    if (!on) return;
    const litA = Math.round(Math.max(0, Math.min(1, (dark - 0.2) / 0.35)) * 20) / 20;
    const litChanged = litA !== this.litA;
    this.litA = litA;
    if (litChanged) for (const b of this.bubbles) b.lit.setAlpha(0.75 * litA);
    // 족욕탕 둘레에 선·앉은 사람 (밤에만 본다)
    const near = this.near;
    near.length = 0;
    if (litA > 0)
      for (const p of people) {
        const lx = p.x - this.x0;
        const ly = p.y - this.y0;
        if (lx > -BODY.r - FW && lx < 80 + BODY.l + FW && ly > -BODY.down - FH && ly < 122 + BODY.up + FH) near.push(lx, ly);
      }
    for (const b of this.bubbles) {
      // 처음엔 서로 다른 때에 올라오게 (한꺼번에 터지지 않게)
      if (Number.isNaN(b.t0)) this.spawn(b, time, Math.random() * 2000);
      const age = time - b.t0;
      let f = age < 0 ? -2 : frameAt(age, b.big, b.spout);
      if (f === -1) {
        // 다 터졌으면 조금 쉬었다가 새 자리에서 다시 (쉬는 시간도 제각각)
        this.spawn(b, time, b.spout ? 60 + Math.random() * 360 : 120 + Math.random() * 1200);
        f = -2;
      }
      if (f < 0) {
        this.hide(b);
        continue;
      }
      const glow = litA > 0 && !covered(b.x, b.y, near);
      if (!b.on) {
        b.on = true;
        b.img.setVisible(true);
      }
      if (glow !== b.glow) {
        b.glow = glow;
        b.lit.setVisible(glow);
      }
      // 올라오는 동안 1px 떠오른다 (점 → 방울)
      const rise = f <= F.small ? 1 : 0;
      const x = this.x0 + b.x - CX;
      const y = this.y0 + b.y - CY + rise;
      b.img.setFrame(f).setPosition(x, y);
      if (glow) b.lit.setFrame(f).setPosition(x, y);
    }
  }

  destroy(): void {
    for (const b of this.bubbles) {
      b.img.destroy();
      b.lit.destroy();
    }
    this.bubbles.length = 0;
  }

  private hide(b: Bubble): void {
    if (!b.on) return;
    b.on = false;
    b.img.setVisible(false);
    b.lit.setVisible(false);
    b.glow = false;
  }

  private spawn(b: Bubble, time: number, rest: number): void {
    b.t0 = time + rest;
    if (b.spout) {
      b.x = SPOUT.x - 4 + Math.round(Math.random() * 8);
      b.y = SPOUT.y + 1 + Math.round(Math.random() * 6);
      b.big = Math.random() < 0.25;
      return;
    }
    b.x = 40;
    b.y = 62;
    for (let k = 0; k < 8; k++) {
      const x = WATER.x0 + Math.round(Math.random() * (WATER.x1 - WATER.x0));
      const y = WATER.y0 + Math.round(Math.random() * (WATER.y1 - WATER.y0));
      if (!inWater(x, y)) continue;
      b.x = x;
      b.y = y;
      break;
    }
    b.big = Math.random() < 0.45;
  }
}

/** 나이(ms) → 프레임 (−1 = 다 터지고 사라짐). 큰 방울은 더 오래 머물다 크게 터진다 */
function frameAt(age: number, big: boolean, spout: boolean): number {
  if (spout) {
    // 물대롱 아래: 빠르게 올라와 바로 터진다
    if (age < 90) return F.dot;
    if (age < 200) return F.small;
    if (age < 330) return big ? F.mid : F.small;
    if (age < 400) return F.pop;
    if (age < 520) return F.ring;
    return big && age < 640 ? F.ring2 : -1;
  }
  if (age < 130) return F.dot;
  if (age < 280) return F.small;
  if (age < 440) return F.mid;
  if (big && age < 640) return F.big;
  const p = age - (big ? 640 : 440);
  if (p < 80) return F.pop;
  if (p < 230) return F.ring;
  if (p < (big ? 400 : 340)) return F.ring2;
  return -1;
}

/** 거품 프레임(탕 기준 bx·by 가운데, 11×7)이 사람 둘레와 겹치는지 */
function covered(bx: number, by: number, near: readonly number[]): boolean {
  for (let i = 0; i < near.length; i += 2) {
    const px = near[i];
    const py = near[i + 1];
    if (bx - CX < px + BODY.r && bx - CX + FW > px - BODY.l && by - CY < py + BODY.down && by - CY + FH > py - BODY.up) return true;
  }
  return false;
}

/** 탕 물 안쪽인지 (둥근 네모) */
function inWater(x: number, y: number): boolean {
  const { x0, x1, y0, y1, r } = WATER;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** 거품 프레임 일곱 장 (11×7 — 가운데 5·3). 흰 테 + 왼쪽 위 반짝 + 아래 짙은 물그늘 (밝은 물 위에서도 또렷하게). lit = 밤 빛 겹 (그늘 픽셀 없이) */
function bubbleSheet(lit: boolean): HTMLCanvasElement {
  const g = new Grid(FW * 7, FH);
  const W = 0xffffff;
  const { foam, hi, rim, deep } = FOOT_WATER;
  const at = (f: number, dx: number, dy: number, c: number) => {
    if (lit && (c === rim || c === deep)) return;
    g.set(f * FW + CX + dx, CY + dy, c);
  };
  // 0 점 (물속에서 올라오는 작은 방울)
  at(F.dot, 0, 0, foam);
  at(F.dot, 0, 1, deep);
  // 1 작은 방울 (2×2)
  at(F.small, 0, -1, W);
  at(F.small, 1, -1, foam);
  at(F.small, 0, 0, foam);
  at(F.small, 1, 0, hi);
  at(F.small, 0, 1, rim);
  at(F.small, 1, 1, rim);
  // 2 중간 방울 (3×3 둥근 테 + 반짝)
  for (const [dx, dy] of [
    [0, -1],
    [1, -1],
    [-1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ] as const)
    at(F.mid, dx, dy, foam);
  at(F.mid, 0, 0, W);
  at(F.mid, 1, 0, hi);
  at(F.mid, 0, 2, rim);
  at(F.mid, 1, 2, rim);
  // 3 큰 방울 (4×4 둥근 테 + 반짝 + 아래 그늘)
  for (const [dx, dy] of [
    [0, -2],
    [1, -2],
    [-1, -1],
    [2, -1],
    [-1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ] as const)
    at(F.big, dx, dy, foam);
  at(F.big, 0, -1, W);
  at(F.big, 1, -1, hi);
  at(F.big, 0, 0, hi);
  at(F.big, 1, 0, hi);
  at(F.big, -1, 1, rim);
  at(F.big, 2, 1, rim);
  at(F.big, 0, 2, rim);
  at(F.big, 1, 2, rim);
  // 4 톡 터짐 (가운데는 비고 물방울이 사방으로 튄다)
  for (const [dx, dy, c] of [
    [0, -3, W],
    [1, -3, W],
    [-2, -2, W],
    [3, -2, W],
    [-3, 0, foam],
    [4, 0, foam],
    [-1, 0, hi],
    [2, 0, hi],
  ] as const)
    at(F.pop, dx, dy, c);
  // 5 작은 물결 고리 (6×3 흰 테) · 6 큰 물결 고리 (10×5 옅은 물빛) — 가운데는 방울 가운데(0.5, 0.5)
  for (let dx = -1; dx <= 2; dx++) {
    at(F.ring, dx, -1, foam);
    at(F.ring, dx, 1, foam);
    at(F.ring2, dx, -2, hi);
    at(F.ring2, dx, 2, hi);
  }
  at(F.ring, -2, 0, foam);
  at(F.ring, 3, 0, foam);
  for (const dx of [-3, -2, 3, 4]) {
    at(F.ring2, dx, -1, hi);
    at(F.ring2, dx, 1, hi);
  }
  at(F.ring2, -4, 0, hi);
  at(F.ring2, 5, 0, hi);
  return g.toCanvas();
}
