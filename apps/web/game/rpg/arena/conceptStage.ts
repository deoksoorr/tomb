import * as Phaser from "phaser";
import type { MapConcept } from "@/lib/mapConcept";
import { conceptSuffix } from "../../sprites/winterScenery";
import { bulbGlowSheet, breathPuff, type Bulb } from "../../sprites/winterArt";
import { RTEX } from "../sprites";
import { conceptPropCanvas } from "./art";
import { decorArt, decorPlan, isOutdoorZone, snowTileCanvas, wallOverlay, zoneNight, zoneWindows, type Rect } from "./conceptArt";
import { AH, AW, type ArenaLayout, type Prop, type Pt } from "./layout";

// 11/17 사냥터·야근 빌딩 겨울판·크리스마스판 실행부 (Arena가 판마다 하나 — 기본판이면 만들지 않는다).
// 그림은 conceptArt가 굽고, 여기는 띄우기만: 벽 겹(창 서리·전구 줄·리스) · 창밖에 내리는 눈 · 바닥 장식(트리·선물·히터·외투 걸이·눈사람) ·
// 전구 빛(두 장을 0.7초마다 번갈아 — 움직임 줄이기면 그대로) · 바깥 사냥터에 내리는 눈 · 내 입김.
// 몬스터·판정·충돌은 건드리지 않는다. 가벼움: 눈송이·입김은 미리 만든 그림을 다시 쓰고, 매 프레임 새 객체를 만들지 않는다.

const D_WINDOW_SNOW = -991;
const D_WALL_OVERLAY = -986;
/** 전구 빛: 분위기 곱하기 층(9000) 위 — 어두운 사냥터에서도 반짝이게. 정전 어둠(9200) 아래 */
const D_BULB = 9049;
const D_SNOW = 9101;

const TEX = {
  flake: "cx-flake",
  breath: "cx-breath",
  tile: (night: boolean) => `cx-snowtile-${night ? 1 : 0}`,
  overlay: (z: string, v: number, s: string) => `cx-wall-${z}-${v}${s}`,
  decor: (k: string, v: number, s: string) => `cx-decor-${k}-${v}${s}`,
} as const;

/** 소품 그림 키마다 전구 자리 (텍스처는 씬을 넘어 남으니 전구 자리도 모듈에 남긴다) */
const BULBS = new Map<string, Bulb[]>();
const STARS = new Map<string, { x: number; y: number }[]>();

type Twinkle = { img: Phaser.GameObjects.Image; ph: number };
const TWINKLES = new WeakMap<Phaser.Scene, { list: Set<Twinkle>; tick: number }>();

function twinkleReg(scene: Phaser.Scene, reduced: boolean): { list: Set<Twinkle>; tick: number } {
  let r = TWINKLES.get(scene);
  if (r) return r;
  const reg = { list: new Set<Twinkle>(), tick: 0 };
  TWINKLES.set(scene, reg);
  r = reg;
  if (!reduced)
    scene.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        reg.tick++;
        for (const t of reg.list) if (t.img.active) t.img.setFrame((reg.tick + t.ph) % 2);
      },
    });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => TWINKLES.delete(scene));
  return r;
}

/**
 * 전구 빛 겹 하나 (그림과 같은 크기·같은 원점으로 겹친다). 빛 시트가 없으면 만든다 (프레임 둘을 가로로).
 * 만든 이미지를 돌려준다 (전구가 없으면 null) — 지우는 건 부른 쪽
 */
export function bulbGlow(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  bulbs: readonly Bulb[],
  stars: readonly { x: number; y: number }[],
  x: number,
  y: number,
  ox: number,
  oy: number,
  o: { reduced: boolean; alpha: number; phase?: number },
): Phaser.GameObjects.Image | null {
  if (!bulbs.length && !stars.length) return null;
  const gk = `${key}-glow`;
  if (!scene.textures.exists(gk)) {
    const sheet = bulbGlowSheet(w, h, bulbs);
    // 별(트리 꼭대기)은 두 장 다 밝게 — 크기만 숨 쉬듯
    if (stars.length) {
      const c = sheet.getContext("2d")!;
      for (let f = 0; f < 2; f++)
        for (const s of stars) {
          const R = f ? 9 : 7;
          const g = c.createRadialGradient(f * w + s.x + 0.5, s.y + 0.5, 0, f * w + s.x + 0.5, s.y + 0.5, R);
          g.addColorStop(0, "rgba(255,240,170,0.95)");
          g.addColorStop(0.4, "rgba(255,210,90,0.35)");
          g.addColorStop(1, "rgba(255,200,80,0)");
          c.fillStyle = g;
          c.fillRect(f * w + s.x - R, s.y - R, R * 2 + 1, R * 2 + 1);
        }
    }
    const tex = scene.textures.addCanvas(gk, sheet);
    tex?.add(0, 0, 0, 0, w, h);
    tex?.add(1, 0, w, 0, w, h);
  }
  const reg = twinkleReg(scene, o.reduced);
  const ph = o.phase ?? 0;
  const img = scene.add.image(x, y, gk, ph % 2).setOrigin(ox, oy).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_BULB).setAlpha(o.alpha);
  const t = { img, ph };
  reg.list.add(t);
  img.once(Phaser.GameObjects.Events.DESTROY, () => reg.list.delete(t));
  return img;
}

type Flake = { img: Phaser.GameObjects.Image; vx: number; vy: number; ph: number };
type Puff = { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number };

export class ArenaConcept {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly suffix: string;
  private readonly outdoor: boolean;
  private readonly glowA: number;
  private tiles: Phaser.GameObjects.TileSprite[] = [];
  private flakes: Flake[] = [];
  private puffs: Puff[] = [];
  private heaters: { img: Phaser.GameObjects.Image; ph: number }[] = [];
  private breathAt = 0;
  private rnd: () => number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: ArenaLayout,
    readonly concept: MapConcept,
    private readonly reduced: boolean,
    /** 분위기 곱하기 세기 (어두운 사냥터일수록 전구를 밝게) */
    ambientAlpha: number,
  ) {
    this.suffix = conceptSuffix(concept);
    this.outdoor = isOutdoorZone(layout.zone);
    this.glowA = 0.5 + 0.45 * Math.min(1, ambientAlpha / 0.6);
    let s = (layout.variant * 9973 + 0x434e43) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  /** 소품 그림 키 (없으면 손질한 그림을 굽는다). 그림은 위로 PROP_PAD만큼 크다 — 원점 (0.5, 1) 그대로 */
  propKey(p: Prop, base: string): string {
    const key = base + this.suffix;
    if (!this.scene.textures.exists(key)) {
      const d = conceptPropCanvas(p.kind, p.v ?? 0, !!p.flip, this.layout.zone, this.concept);
      this.scene.textures.addCanvas(key, d.canvas);
      BULBS.set(key, d.bulbs);
    }
    return key;
  }

  /** 소품 전구 빛 (그림과 같은 자리) */
  propGlow(key: string, p: Prop): void {
    const bulbs = BULBS.get(key);
    if (!bulbs?.length) return;
    const src = this.scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const img = bulbGlow(this.scene, key, src.width, src.height, bulbs, [], Math.round(p.x), Math.round(p.y), 0.5, 1, { reduced: this.reduced, alpha: this.glowA, phase: Math.round(p.x) & 1 });
    if (img) this.keep(img);
  }

  /**
   * 벽 겹·창밖 눈·바닥 장식·내리는 눈·입김 (Arena.build 끝에서). floorKey = 이 판 바닥 그림 키 (리스 자리 찾기).
   * extra = 지도 밖 가구 자리 (장식이 피한다)
   */
  build(floorKey: string, extra: readonly Rect[] = []): void {
    const sc = this.scene;
    const l = this.layout;
    const floor = sc.textures.get(floorKey).getSourceImage() as HTMLCanvasElement;
    // 벽 겹
    const ok = TEX.overlay(l.zone, l.variant, this.suffix);
    if (!sc.textures.exists(ok)) {
      const o = wallOverlay(l, this.concept, floor);
      sc.textures.addCanvas(ok, o.canvas);
      BULBS.set(ok, o.bulbs);
    }
    this.keep(sc.add.image(0, 0, ok).setOrigin(0, 0).setDepth(D_WALL_OVERLAY));
    const ob = BULBS.get(ok) ?? [];
    if (ob.length) {
      const src = sc.textures.get(ok).getSourceImage() as HTMLCanvasElement;
      const g = bulbGlow(sc, ok, src.width, src.height, ob, [], 0, 0, 0, 0, { reduced: this.reduced, alpha: this.glowA });
      if (g) this.keep(g);
    }
    // 창밖에 내리는 눈 (창마다 무늬를 아래로 흘린다)
    const night = zoneNight(l.zone);
    const tk = TEX.tile(night);
    if (!sc.textures.exists(tk)) sc.textures.addCanvas(tk, snowTileCanvas(night));
    for (const [i, w] of zoneWindows(l.zone, l.variant).entries())
      this.tiles.push(this.keep(sc.add.tileSprite(w.x, w.y, w.w, w.h, tk).setOrigin(0, 0).setDepth(D_WINDOW_SNOW).setTilePosition(i * 11, i * 7)));
    // 바닥 장식
    for (const d of decorPlan(l, this.concept, extra)) {
      const k = TEX.decor(d.kind, d.v, this.suffix + (this.outdoor ? "o" : ""));
      const art = decorArt(d, this.outdoor);
      if (!sc.textures.exists(k)) {
        sc.textures.addCanvas(k, art.canvas);
        BULBS.set(k, art.bulbs);
        STARS.set(k, art.stars);
      }
      const src = sc.textures.get(k).getSourceImage() as HTMLCanvasElement;
      this.keep(sc.add.image(d.x, d.y, k).setOrigin(0.5, 1).setDepth(d.y));
      const ox = Math.round(d.x - src.width / 2);
      const oy = Math.round(d.y - src.height);
      const g = bulbGlow(sc, k, src.width, src.height, BULBS.get(k) ?? [], STARS.get(k) ?? [], ox, oy, 0, 0, { reduced: this.reduced, alpha: this.glowA });
      if (g) this.keep(g);
      // 히터 앞 따뜻한 빛
      if (art.glow) {
        const h = this.keep(
          sc.add
            .image(ox + art.glow.x, oy + art.glow.y + 6, RTEX.glow)
            .setTint(art.glow.color)
            .setDisplaySize(art.glow.w, art.glow.h)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(D_BULB)
            .setAlpha(0.32),
        );
        this.heaters.push({ img: h, ph: this.rnd() * 6 });
      }
    }
    // 바깥: 내리는 눈 (옥상은 폭풍 실행부가 눈보라를 따로 그린다) · 입김
    if (this.outdoor) {
      if (!sc.textures.exists(TEX.flake)) {
        const c = document.createElement("canvas");
        c.width = c.height = 3;
        const x = c.getContext("2d")!;
        x.fillStyle = "rgba(255,255,255,0.55)";
        x.fillRect(0, 1, 3, 1);
        x.fillRect(1, 0, 1, 3);
        x.fillStyle = "#ffffff";
        x.fillRect(1, 1, 1, 1);
        sc.textures.addCanvas(TEX.flake, c);
      }
      if (l.zone !== "rf_rooftop") {
        const n = this.reduced ? 18 : 46;
        for (let i = 0; i < n; i++) {
          const img = this.keep(sc.add.image(this.rnd() * AW, this.rnd() * AH, TEX.flake).setDepth(D_SNOW));
          const big = this.rnd() < 0.3;
          img.setScale(big ? 1 : 0.67).setAlpha(big ? 0.95 : 0.7);
          this.flakes.push({ img, vx: (this.rnd() - 0.5) * 6, vy: big ? 20 + this.rnd() * 8 : 12 + this.rnd() * 8, ph: this.rnd() * 6 });
        }
      }
      if (!this.reduced) {
        if (!sc.textures.exists(TEX.breath)) sc.textures.addCanvas(TEX.breath, breathPuff());
        for (let i = 0; i < 6; i++) this.puffs.push({ img: this.keep(sc.add.image(-50, -50, TEX.breath).setVisible(false)), vx: 0, vy: 0, life: 0 });
      }
    }
  }

  /** 매 프레임: 창밖 눈 · 내리는 눈 · 입김 · 히터 빛. wind = 지금 바람 (px/s, 사막 모래바람) */
  update(now: number, dt: number, player: Pt, face: Pt | null, wind: number): void {
    if (!this.reduced) for (const t of this.tiles) t.tilePositionY -= dt * 13;
    for (const f of this.flakes) {
      const img = f.img;
      img.x += (f.vx + wind * 1.6 + (this.reduced ? 0 : Math.sin(now / 900 + f.ph) * 6)) * dt;
      img.y += f.vy * dt * (wind ? 1.4 : 1);
      if (img.y > AH + 2) {
        img.y = -3;
        img.x = this.rnd() * AW;
      }
      if (img.x < -6) img.x += AW + 10;
      else if (img.x > AW + 6) img.x -= AW + 10;
    }
    for (const h of this.heaters) h.img.setAlpha(0.28 + (this.reduced ? 0 : Math.sin(now / 420 + h.ph) * 0.05));
    if (this.puffs.length) {
      // 입김: 2.4초마다 세 모금, 바라보는 쪽 입 앞에서 (등을 보이면 안 보인다)
      if (now >= this.breathAt) {
        this.breathAt = now + 2200 + this.rnd() * 700;
        const fx = face?.x ?? 0;
        const fy = face?.y ?? 1;
        if (fy > -0.6) {
          let k = 0;
          for (const p of this.puffs) {
            if (p.life > 0 || k >= 3) continue;
            k++;
            p.life = 1.1 + this.rnd() * 0.4;
            p.vx = fx * (7 + this.rnd() * 5) + (this.rnd() - 0.5) * 4;
            p.vy = -2 - this.rnd() * 3 + (fx === 0 ? 3 : 0);
            p.img
              .setPosition(player.x + fx * 4, player.y - 15)
              .setVisible(true)
              .setScale(0.6)
              .setAlpha(0.8);
          }
        }
      }
      for (const p of this.puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.img.setVisible(false);
          continue;
        }
        const t = 1 - p.life / 1.3;
        p.img.x += p.vx * dt;
        p.img.y += p.vy * dt;
        p.img
          .setScale(0.6 + 1.1 * Math.min(1, t))
          .setAlpha(0.8 * Math.max(0, 1 - t))
          .setDepth(p.img.y + 16);
      }
    }
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.tiles = [];
    this.flakes = [];
    this.puffs = [];
    this.heaters = [];
  }
}
