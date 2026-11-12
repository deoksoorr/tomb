import * as Phaser from "phaser";
import { DEPTH } from "../../config";
import { Grid } from "../../sprites/pixel";
import type { Sfx } from "../Sfx";
import { CROW_COUNT, CrowSim, type CrowPose } from "./crowSim";
import { playLife } from "./sounds";

// 까마귀 연못의 까마귀 2~4마리 (그리기·반응·소리). 자리는 crowSim(채널 시드 + 서버 시계)이라 모두에게 같다.
// - 앉아 있을 때: 마른 나무 가지·오래된 비석 위에서 가끔 고개를 갸웃, 가끔 "까악" (작게, 가까울 때만)
// - 날 때: 날갯짓 3프레임 + 땅(물) 위 그림자
// - 사람이 뛰어(점프해) 다가오면 내 화면에서만 푸드덕 날아올랐다가 잠시 뒤 제자리로 돌아온다
// - 밤에는 실루엣을 더 진하게 (밤 전용 그림)

const OUT = 0x16121a;
type Look = "day" | "night";
const KEY = {
  perch: (l: Look, tilt: boolean) => `crow-perch-${l}-${tilt ? 1 : 0}`,
  fly: (l: Look, f: number) => `crow-fly-${l}-${f}`,
  shadow: "crow-shadow",
};
const PAL: Record<Look, { body: number; sheen: number; beak: number; eye: number; outline: boolean }> = {
  day: { body: 0x23232c, sheen: 0x43496a, beak: 0x5a5a64, eye: 0xe8dcb0, outline: true },
  night: { body: 0x060608, sheen: 0x15151d, beak: 0x24242a, eye: 0x9a8a5a, outline: false },
};

/** 앉은 까마귀 (오른쪽을 본다). 12×11, 발 = 맨 아래 줄 가운데 */
function perchArt(look: Look, tilt: boolean): HTMLCanvasElement {
  const c = PAL[look];
  const g = new Grid(12, 11);
  g.ellipse(5, 6, 3.6, 2.6, c.body);
  g.set(1, 7, c.body); // 꼬리
  g.set(0, 8, c.body);
  g.set(1, 8, c.body);
  const hx = 8;
  const hy = tilt ? 2 : 3;
  g.ellipse(hx, hy, 1.8, 1.8, c.body);
  if (tilt) {
    g.set(10, 1, c.beak);
    g.set(11, 0, c.beak);
  } else {
    g.set(10, 3, c.beak);
    g.set(11, 3, c.beak);
  }
  g.set(hx + 1, hy - 1, c.eye);
  g.hline(3, 6, 5, c.sheen); // 날개 윤기
  g.set(5, 10, c.beak); // 다리
  g.set(6, 10, c.beak);
  g.set(5, 9, c.beak);
  if (c.outline) g.outline(OUT, false, 170);
  return g.toCanvas();
}

/** 나는 까마귀 (오른쪽으로). 16×11. f: 0 날개 위 · 1 펼침(미끄러짐) · 2 날개 아래 */
function flyArt(look: Look, f: number): HTMLCanvasElement {
  const c = PAL[look];
  const g = new Grid(16, 11);
  g.ellipse(7.5, 6, 3.6, 1.6, c.body);
  g.ellipse(11.5, 5, 1.6, 1.5, c.body);
  g.set(13, 5, c.beak);
  g.set(14, 5, c.beak);
  g.set(12, 4, c.eye);
  g.set(3, 6, c.body); // 꼬리 (부채꼴)
  g.set(2, 5, c.body);
  g.set(2, 7, c.body);
  g.set(1, 6, c.body);
  if (f === 0) {
    for (let i = 0; i < 5; i++) {
      g.set(6 - Math.floor(i / 2), 5 - i, c.body);
      g.set(8 + Math.floor(i / 2), 5 - i, c.body);
    }
    g.set(5, 1, c.sheen);
  } else if (f === 1) {
    g.hline(3, 12, 5, c.body);
    g.hline(4, 11, 4, c.body);
    g.set(2, 4, c.body);
    g.set(13, 3, c.body);
    g.hline(5, 9, 4, c.sheen);
  } else {
    for (let i = 0; i < 4; i++) {
      g.set(6 - Math.floor(i / 2), 7 + i, c.body);
      g.set(9 + Math.floor(i / 2), 7 + i, c.body);
    }
  }
  if (c.outline) g.outline(OUT, false, 170);
  return g.toCanvas();
}

function shadowArt(): HTMLCanvasElement {
  const g = new Grid(9, 3);
  g.ellipse(4, 1, 4, 1.2, 0x000000, 90);
  return g.toCanvas();
}

function ensureCrowTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(KEY.shadow)) return;
  for (const l of ["day", "night"] as const) {
    tx.addCanvas(KEY.perch(l, false), perchArt(l, false));
    tx.addCanvas(KEY.perch(l, true), perchArt(l, true));
    for (let f = 0; f < 3; f++) tx.addCanvas(KEY.fly(l, f), flyArt(l, f));
  }
  tx.addCanvas(KEY.shadow, shadowArt());
}

/** 뛰어오는 사람에 놀라는 거리 */
const STARTLE_RADIUS = 34;
/** 놀라서 날아올랐다가 돌아오기까지 (ms) */
const STARTLE_MS = 2_600;
/** "까악"이 들리는 거리 */
const HEAR_RADIUS = 220;

type CrowView = {
  sim: CrowSim;
  pose: CrowPose;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** 놀라 날아오른 시각 (performance.now) / 날아갈 방향 */
  startledAt: number;
  fx: number;
  fy: number;
  lastCaw: number;
};

export class Crows {
  private readonly views: CrowView[] = [];
  private seed = -1;
  private look: Look = "day";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sfx: Sfx,
    private readonly reduced: boolean,
  ) {
    ensureCrowTextures(scene);
  }

  /** 채널(= 시드)이 바뀌면 다시 만든다 */
  setSeed(seed: number): void {
    if (seed === this.seed) return;
    this.seed = seed;
    for (const v of this.views) {
      v.img.destroy();
      v.shadow.destroy();
    }
    this.views.length = 0;
    for (let i = 0; i < CROW_COUNT; i++) {
      const sim = new CrowSim(i, seed);
      if (sim.perches.length < 2) return;
      const img = this.scene.add.image(0, 0, KEY.perch("day", false)).setOrigin(0.5, 1);
      const shadow = this.scene.add.image(0, 0, KEY.shadow).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 6).setVisible(false);
      this.views.push({ sim, pose: sim.at(0), img, shadow, startledAt: -Infinity, fx: 0, fy: 0, lastCaw: -Infinity });
    }
  }

  setNight(night: boolean): void {
    this.look = night ? "night" : "day";
  }

  /** 매 프레임. t = 서버 시각, pnow = performance.now, me = 내 발 위치·달리는지 */
  update(t: number, pnow: number, view: Phaser.Geom.Rectangle, me: { x: number; y: number; rushing: boolean }): void {
    for (const v of this.views) {
      const p = v.sim.at(t, v.pose);
      let x = p.x;
      let y = p.y;
      let lift = p.lift;
      let flying = p.flying;
      let face = p.face;
      // 놀람 (내 화면에서만): 앉아 있는 까마귀 곁으로 뛰어오면 푸드덕
      const sinceStartle = pnow - v.startledAt;
      if (!p.flying && sinceStartle > STARTLE_MS && me.rushing && Math.hypot(me.x - x, me.y - y) < STARTLE_RADIUS) {
        v.startledAt = pnow;
        const dx = x - me.x;
        const n = Math.hypot(dx, y - me.y) || 1;
        v.fx = (dx / n) * 46 || 30;
        v.fy = ((y - me.y) / n) * 20;
        if (this.inView(x, y - lift, view)) playLife(this.sfx, "flap", 0.28);
      }
      const s = pnow - v.startledAt;
      if (s >= 0 && s < STARTLE_MS && !p.flying) {
        // 0→0.35: 날아오름, 0.35→0.7: 머무름(빙빙), 0.7→1: 제자리로 내려앉음
        const k = s / STARTLE_MS;
        const out = k < 0.35 ? k / 0.35 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const e = out * out * (3 - 2 * out);
        x += v.fx * e + (k > 0.35 && k < 0.7 ? Math.sin(s / 160) * 4 : 0);
        y += v.fy * e;
        lift += 30 * e;
        flying = e > 0.05;
        if (flying) face = k < 0.7 ? (v.fx >= 0 ? 1 : -1) : v.fx >= 0 ? -1 : 1;
      }
      const sx = Math.round(x);
      const sy = Math.round(y - lift);
      const visible = this.inView(x, sy, view);
      v.img.setVisible(visible);
      v.shadow.setVisible(visible && flying);
      if (!visible) continue;
      if (flying) {
        const wing = this.reduced ? 1 : p.flying ? p.wing : Math.floor(pnow / 90) % 3;
        v.img.setTexture(KEY.fly(this.look, wing));
        // 하늘을 나는 동안은 나무·지붕 위에 그린다 (밤 어둠·안개 아래)
        v.img.setDepth(y + 140);
        v.shadow.setPosition(sx, Math.round(y)).setAlpha(Math.max(0.15, 0.5 - lift / 120));
      } else {
        v.img.setTexture(KEY.perch(this.look, p.tilt && !this.reduced));
        // 앉은 소품(나무·비석) 바로 앞
        v.img.setDepth((p.perch?.y ?? y) + 1);
      }
      v.img.setFlipX(face < 0).setPosition(sx, sy + 1);
      // "까악" (구간마다 정해진 시각, 가까울 때만 작게)
      if (p.cawAt >= 0 && t >= p.cawAt && t - p.cawAt < 400 && v.lastCaw !== p.cawAt) {
        v.lastCaw = p.cawAt;
        const d = Math.hypot(me.x - x, me.y - y);
        if (d < HEAR_RADIUS) playLife(this.sfx, "caw", 0.22 * (1 - d / HEAR_RADIUS) + 0.04);
      }
    }
  }

  private inView(x: number, y: number, view: Phaser.Geom.Rectangle): boolean {
    return x > view.x - 30 && x < view.right + 30 && y > view.y - 30 && y < view.bottom + 30;
  }

  /** ?debug·테스트용: 지금 그려진 자리 */
  get debug(): { x: number; y: number; flying: boolean }[] {
    return this.views.map((v) => ({ x: Math.round(v.img.x), y: Math.round(v.img.y), flying: v.pose.flying }));
  }

  destroy(): void {
    for (const v of this.views) {
      v.img.destroy();
      v.shadow.destroy();
    }
    this.views.length = 0;
  }
}
