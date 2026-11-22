import * as Phaser from "phaser";
import { DIR, HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS, HOUSING_OFFICE, SHOP, TILE, type DirId } from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { SHOP_HUT_H, SHOP_HUT_W } from "../sprites/extras";
import { OFFICE_H, WP } from "../sprites/worldProps";
import {
  bareTree,
  breathPuff,
  bulbGlowSheet,
  christmasTree,
  doorWreath,
  giftPile,
  hollyBed,
  lightString,
  lightStringOrigin,
  snowCap,
  snowGlint,
  snowman,
  snowRoof,
  snowyRoundTree,
  woodpile,
  xmasLamp,
  XTREE_H,
  XTREE_W,
  type Bulb,
} from "../sprites/winterArt";
import { addTwinkle } from "./conceptLights";
import { allProps, groundKind, inWater, PLAZA_TREES, staticColliders, type PropDef } from "./layout";

// 11/17 마을 맵 컨셉 (lib/mapConcept): 겨울·크리스마스 판의 텍스처 고르기 + 겉 장식.
//  - skin(): 기본 그림 키 → 그 판의 그림 키 (처음 쓸 때 원본 캔버스에 눈을 얹어 한 번 굽는다). 나무는 종류마다 겨울나무로 바꾼다
//  - ConceptDecor: 판마다 얹는 장식 (충돌 없음 — 길·자리·충돌은 그대로). 판이 바뀌면 다 지우고 다시 세운다
//    겨울: 장작더미, 잡화점 굴뚝 연기, 캐릭터 입김
//    크리스마스: 겨울 + 광장 트리 전구·별빛, 주거 구역 골목 전구 줄, 리스, 눈사람, 선물 더미, 가끔 반짝이는 눈
//  움직이는 건 빛 겹 프레임 바꾸기(타이머 하나)·별 숨쉬기 트윈 둘·작은 파티클 풀 둘뿐이다 (폰에서도 가볍게)

/** 크리스마스판 광장 트리 텍스처 키 (트리 그림 + 빛 겹) */
const XTREE = "concept-xtree";
const XTREE_GLOW = "concept-xtree-glow";
const GLINT = "concept-glint";
const BREATH = "concept-breath";

/** 소품 종류 → 겨울 그림 (variant로 모양 고르기) */
function winterTreeKey(kind: PropDef["kind"], v: number): string | null {
  switch (kind) {
    case "tree":
      return `concept-snowtree-${v % 2}`;
    case "autumn":
      return `concept-bare-${v % 2}`;
    case "maple":
      return `concept-bare-${(v + 1) % 2}`;
    case "ginkgo":
    case "blossom":
      return "concept-bare-2";
    default:
      return null;
  }
}

function buildTreeKey(key: string): HTMLCanvasElement {
  if (key.startsWith("concept-snowtree-")) return snowyRoundTree(+key.slice(-1));
  return bareTree(+key.slice(-1));
}

/** 지붕 색 (snowRoof가 눈으로 덮는 픽셀) */
const ROOFS: Readonly<Record<string, readonly number[]>> = {
  [TEX.shopHut]: [0x5c4a6e, 0x463858, 0x342844],
  [WP.office]: [0x4f6a78, 0x3d5562, 0x2c3f4a],
};
/** 프레임 시트 (가로로 놓인 프레임 폭·높이) */
const SHEETS: Readonly<Record<string, { w: number; h: number }>> = {};

export function registerSheet(key: string, w: number, h: number): void {
  (SHEETS as Record<string, { w: number; h: number }>)[key] = { w, h };
}

function sourceCanvas(scene: Phaser.Scene, key: string): HTMLCanvasElement | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage();
  return src instanceof HTMLCanvasElement ? src : null;
}

/** 크리스마스판 오두막 장식: 문 위 리스 + 처마 전구 줄. 전구 자리를 돌려준다 */
function dressHut(c: HTMLCanvasElement, door: { x: number; y: number }, eave: { x0: number; x1: number; y: number }): Bulb[] {
  const ctx = c.getContext("2d")!;
  ctx.drawImage(doorWreath(), door.x - 5, door.y);
  const s = lightString(eave.x1 - eave.x0, 0, 3);
  ctx.drawImage(s.canvas, eave.x0 - s.ox, eave.y - s.oy);
  return s.bulbs.map((b) => ({ x: b.x + eave.x0 - s.ox, y: b.y + eave.y - s.oy, c: b.c }));
}

const HUT_DRESS: Readonly<Record<string, { door: { x: number; y: number }; eave: { x0: number; x1: number; y: number } }>> = {
  [TEX.shopHut]: { door: { x: 30, y: 37 }, eave: { x0: 1, x1: 58, y: 26 } },
  [WP.office]: { door: { x: 30, y: 34 }, eave: { x0: 3, x1: 56, y: 24 } },
};

/**
 * 기본 그림 키 → 이 판의 그림 키. 없으면 만든다 (원본 캔버스에 눈을 얹어 한 번). default면 그대로.
 * prop을 주면 나무 종류는 겨울나무로, 크리스마스판 광장 나무는 트리로
 */
export function skin(scene: Phaser.Scene, base: string, concept: MapConcept, prop?: PropDef): string {
  if (!isSnowy(concept)) return base;
  if (prop) {
    if (concept === "christmas" && (prop.kind === "tree" || prop.kind === "autumn" || prop.kind === "maple" || prop.kind === "ginkgo" || prop.kind === "blossom") && isPlazaTree(prop)) {
      ensureXTree(scene);
      return XTREE;
    }
    const tk = winterTreeKey(prop.kind, prop.variant);
    if (tk) {
      if (!scene.textures.exists(tk)) addCanvasTexture(scene, tk, { canvas: buildTreeKey(tk) });
      return tk;
    }
    if (prop.kind === "flowers") {
      const k = `concept-holly-${prop.variant % 3}`;
      if (!scene.textures.exists(k)) addCanvasTexture(scene, k, { canvas: hollyBed(prop.variant % 3) });
      return k;
    }
    if (prop.kind === "pine") return skin(scene, prop.variant % 2 ? WP.snowPine1 : WP.snowPine0, concept);
    if (prop.kind === "lamp" && concept === "christmas") {
      const k = "concept-xmas-lamp";
      const src = sourceCanvas(scene, base);
      if (!scene.textures.exists(k) && src) addCanvasTexture(scene, k, { canvas: xmasLamp(src) });
      return scene.textures.exists(k) ? k : base;
    }
  }
  const hut = HUT_DRESS[base] && concept === "christmas";
  const key = `${hut ? "xmas" : "snow"}~${base}`;
  if (scene.textures.exists(key)) return key;
  const src = sourceCanvas(scene, base);
  if (!src) return base;
  const sheet = SHEETS[base];
  const flat = prop && (prop.kind === "mushroom" || prop.kind === "leaves" || prop.kind === "mat");
  let c = ROOFS[base] ? snowRoof(src, ROOFS[base]) : snowCap(src, { depth: flat ? 1 : 2, frameW: sheet?.w, frameH: sheet?.h, maxY: src.height - 2 });
  if (hut) {
    c = copyCanvas(c);
    const bulbs = dressHut(c, HUT_DRESS[base].door, HUT_DRESS[base].eave);
    addCanvasTexture(scene, `${key}~glow`, { canvas: bulbGlowSheet(c.width, c.height, bulbs), frameW: c.width, frameH: c.height });
  }
  addCanvasTexture(scene, key, { canvas: c, frameW: sheet?.w, frameH: sheet?.h });
  return key;
}

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

const isPlazaTree = (p: PropDef) => PLAZA_TREES.some((t) => Math.abs(t.x - p.x) < 2 && Math.abs(t.y - p.y) < 2);

let xtreeInfo: { star: { x: number; y: number } } | null = null;
function ensureXTree(scene: Phaser.Scene): void {
  if (scene.textures.exists(XTREE) && xtreeInfo) return;
  const t = christmasTree();
  xtreeInfo = { star: t.star };
  if (!scene.textures.exists(XTREE)) addCanvasTexture(scene, XTREE, { canvas: t.canvas });
  if (!scene.textures.exists(XTREE_GLOW)) addCanvasTexture(scene, XTREE_GLOW, { canvas: bulbGlowSheet(XTREE_W, XTREE_H, t.bulbs, t.star), frameW: XTREE_W, frameH: XTREE_H });
}

/** 크리스마스 오두막 빛 겹 키 (없으면 null) */
export function hutGlowKey(scene: Phaser.Scene, base: string, concept: MapConcept): string | null {
  if (concept !== "christmas" || !HUT_DRESS[base]) return null;
  const k = `xmas~${base}~glow`;
  return scene.textures.exists(k) ? k : null;
}

// ── 다른 장소 그림(동물원·야근 빌딩·판교의 등대·놀이기구·관람차·귀신의집·버스 정류장·범퍼카장·묘비)은 그 모듈을 건드리지 않고
//    텍스처 자리에서 바로 눈을 얹는다 (원본 픽셀은 따로 두었다가 기본으로 돌아가면 되돌린다). 프레임 시트는 프레임마다 따로

const WORLD_SNOW_KEYS =
  /^(?:zoo-(?:trough|stall|sign|shed|post|doghouse|den|arch|fence-v|fence-h|perch|hay)|tower-(?:body|door|sign)|lighthouse-(?:body|board)|sky-(?:sign|pad|ferris-frame)|ride-(?:carousel-top|fountain|duck-sign|trampoline|seesaw-base)|haunt-house|fishzone-(?:questBoard|busShelter|sea-shelter|busSign|sea-sign|timetable|placard|crates|barrel|stool)|bumper-(?:pillar|pole|sign|tyre)|gy-hunt-sign|grave-[A-Za-z]+-\d+|forage-stall-[a-z]+)$/;
const originals = new Map<string, HTMLCanvasElement>();

/** 목록에 있는 텍스처에 눈을 얹거나(on) 원래대로 (off). 아직 안 만든 텍스처는 다음 부름에 (ConceptDecor가 몇 초마다 다시 본다) */
export function snowWorldTextures(scene: Phaser.Scene, on: boolean): void {
  const tm = scene.textures;
  for (const key of tm.getTextureKeys()) {
    if (!WORLD_SNOW_KEYS.test(key)) continue;
    const done = originals.has(key);
    if (on === done) continue;
    const tex = tm.get(key);
    const src = tex.getSourceImage();
    if (!(src instanceof HTMLCanvasElement)) continue;
    const ctx = src.getContext("2d");
    if (!ctx) continue;
    if (on) {
      originals.set(key, copyCanvas(src));
      const frames = tex.getFrameNames().map((n) => tex.get(n));
      const rects = frames.length ? frames.map((f) => [f.cutX, f.cutY, f.cutWidth, f.cutHeight] as const) : [[0, 0, src.width, src.height] as const];
      for (const [x, y, w, h] of rects) {
        if (w < 3 || h < 3) continue;
        const part = document.createElement("canvas");
        part.width = w;
        part.height = h;
        part.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
        ctx.clearRect(x, y, w, h);
        ctx.drawImage(snowCap(part, { depth: 2, maxY: h - 2 }), x, y);
      }
    } else {
      const o = originals.get(key)!;
      originals.delete(key);
      ctx.clearRect(0, 0, src.width, src.height);
      ctx.drawImage(o, 0, 0);
    }
    tex.source[0].update();
  }
}

/** 입김·반짝임을 낼 사람 (내 캐릭터 + 화면 근처 다른 사람) */
export type Actor = { x: number; y: number; dir: DirId };

type Cull = (x: number, y: number, o: Phaser.GameObjects.Image) => void;

/** 눈사람·선물을 놓을 만한 곳 (구역마다 하나씩, 가장 가까운 빈 풀밭 칸으로) */
const SNOWMAN_ANCHORS: readonly [number, number][] = [
  [498, 210],
  [944, 236],
  [700, 196],
  [404, 220],
  [1000, 668],
  [596, 700],
];
const GIFT_ANCHORS: readonly [number, number][] = [
  [530, 214],
  [905, 214],
];

export class ConceptDecor {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private lotObjs: Phaser.GameObjects.GameObject[] = [];
  private concept: MapConcept = "default";
  private glints: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private nextGlint = 0;
  private nextBreath = 0;
  private readonly breathAt = new WeakMap<object, number>();
  private actors: (() => Iterable<Actor & { key: object }>) | null = null;
  private blockers: { props: readonly PropDef[]; cols: { x: number; y: number; w: number; h: number }[] } | null = null;
  private placed: [number, number][] = [];
  private recheck: Phaser.Time.TimerEvent | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    private readonly cull: Cull,
  ) {}

  /** 입김을 낼 사람들 (WorldScene이 한 번 넣는다) */
  setActors(fn: () => Iterable<Actor & { key: object }>): void {
    this.actors = fn;
  }

  apply(concept: MapConcept, houses: ReadonlySet<number>): void {
    this.clear();
    this.concept = concept;
    const scene = this.scene;
    snowWorldTextures(scene, isSnowy(concept));
    if (!isSnowy(concept)) return;
    // 늦게 만들어지는 다른 장소 그림 (관람차 칸·놀이기구 등)도 따라 덮는다 — 처음 1분만 몇 초마다
    this.recheck = scene.time.addEvent({ delay: 4000, repeat: 15, callback: () => snowWorldTextures(scene, isSnowy(this.concept)) });
    // 장작더미 (잡화점 동쪽 벽에 붙여서). 11/20 분양 사무소는 광장으로 옮겨 서쪽 벽 옆이 벤치 bC라 뺐다
    if (!scene.textures.exists("concept-woodpile")) addCanvasTexture(scene, "concept-woodpile", { canvas: woodpile() });
    for (const [x, y] of [[SHOP.x + SHOP_HUT_W / 2 + 8, SHOP.y - 2]] as const)
      this.add(scene.add.image(x, y + 1, "concept-woodpile").setOrigin(0.5, 1).setDepth(y), x, y);
    // 잡화점 굴뚝 연기 (겨울엔 불을 땐다)
    if (!this.reduced && scene.textures.exists(WP.smoke)) {
      const sx = SHOP.x - SHOP_HUT_W / 2 + 45;
      const sy = SHOP.y + 2 - SHOP_HUT_H;
      this.objs.push(
        scene.add
          .particles(sx, sy, WP.smoke, {
            lifespan: { min: 2600, max: 3600 },
            speedX: { min: 1, max: 6 },
            speedY: { min: -11, max: -6 },
            scale: { start: 0.25, end: 1 },
            alpha: { start: 0.32, end: 0 },
            frequency: 850,
          })
          .setDepth(SHOP.y + 1),
      );
    }
    this.makeBreath();
    if (concept !== "christmas") return;
    this.dressChristmas();
    this.setLots(houses);
  }

  /** 크리스마스판 주거 구역 골목 전구 줄 (집이 바뀌면 다시) */
  setLots(houses: ReadonlySet<number>): void {
    for (const o of this.lotObjs) o.destroy();
    this.lotObjs = [];
    if (this.concept !== "christmas") return;
    const scene = this.scene;
    // 줄마다 왼쪽 골목 가로등 → 필지 앞 가로등들 (빈 집터에는 같은 자리에 등 기둥을 하나 세운다)
    const rows = new Map<number, (typeof HOUSE_LOTS)[number][]>();
    for (const l of HOUSE_LOTS) rows.set(l.y, [...(rows.get(l.y) ?? []), l].sort((a, b) => a.x - b.x));
    const lampKey = skin(scene, WP.lamp, "christmas", { kind: "lamp", x: 0, y: 0, variant: 0 });
    let n = 0;
    for (const [y, lots] of rows) {
      const pts: [number, number][] = [];
      // 서쪽 골목 가로등 (layout: x 968, 필지 줄과 거의 같은 높이) — 가로등 머리
      const alleyY = [300, 440, 580, 720].find((ay) => Math.abs(ay - (y + HOUSE_LOT_H - 2)) < 12);
      if (alleyY) pts.push([968 + 3, alleyY - 26]);
      for (const l of lots) {
        const lx = l.x + 4;
        const ly = l.y + HOUSE_LOT_H - 2;
        if (!houses.has(l.lot)) {
          const pole = scene.add.image(lx, ly + 1, lampKey).setOrigin(0.5, 1).setDepth(ly);
          this.lotObjs.push(pole);
          this.cull(lx, ly, pole);
          pts.push([lx, ly - 27]);
        } else pts.push([lx, l.y + HOUSE_LOT_H - 21]);
      }
      for (let i = 0; i + 1 < pts.length; i++) this.addString(pts[i], pts[i + 1], n++, this.lotObjs);
    }
  }

  private addString(a: [number, number], b: [number, number], i: number, into: Phaser.GameObjects.GameObject[]): void {
    const scene = this.scene;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const sag = Math.max(5, Math.round(Math.abs(dx) * 0.07));
    const key = `concept-string-${dx}-${dy}-${sag}`;
    // 같은 줄은 한 번만 굽는다 (집이 바뀌어 줄을 다시 걸 때는 자리만 셈한다)
    if (!scene.textures.exists(key)) {
      const s = lightString(dx, dy, sag);
      addCanvasTexture(scene, key, { canvas: s.canvas });
      addCanvasTexture(scene, `${key}~glow`, { canvas: bulbGlowSheet(s.canvas.width, s.canvas.height, s.bulbs), frameW: s.canvas.width, frameH: s.canvas.height });
    }
    const s = lightStringOrigin(dx, dy);
    const x = a[0] - s.ox;
    const y = a[1] - s.oy;
    // 줄은 가로등 머리 높이에 걸린다 — 깊이는 아래 끝(받침) 기준으로 사람보다 뒤
    const depth = Math.max(a[1], b[1]) + 26;
    const img = scene.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
    const glow = addTwinkle(scene, `${key}~glow`, x, y, 0, 0, { reduced: this.reduced, phase: i % 2, alpha: 0.9 });
    into.push(img, glow);
    this.cull(a[0] + dx / 2, depth, img);
    this.cull(a[0] + dx / 2, depth, glow);
  }

  private dressChristmas(): void {
    const scene = this.scene;
    // 광장 트리 빛 겹·별빛 (트리 그림은 소품 텍스처 — skin)
    ensureXTree(scene);
    for (const [i, t] of PLAZA_TREES.entries()) {
      const glow = addTwinkle(scene, XTREE_GLOW, t.x, t.y + 1, 0.5, 1, { reduced: this.reduced, phase: i });
      this.add(glow, t.x, t.y);
      const star = xtreeInfo!.star;
      const sx = t.x - XTREE_W / 2 + star.x;
      const sy = t.y + 1 - XTREE_H + star.y + 1;
      const halo = scene.add.image(sx, sy, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setScale(0.55).setAlpha(0.6).setDepth(DEPTH.lights + 3);
      this.add(halo, t.x, t.y);
      if (!this.reduced) this.tweens.push(scene.tweens.add({ targets: halo, alpha: { from: 0.35, to: 0.85 }, scale: { from: 0.45, to: 0.65 }, duration: 1300 + i * 200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
    }
    // 잡화점·분양 사무소 처마 전구 빛 겹 (그림은 skin이 구운 크리스마스 오두막)
    for (const [base, x, y, h] of [
      [TEX.shopHut, SHOP.x, SHOP.y + 2, SHOP_HUT_H],
      [WP.office, HOUSING_OFFICE.x, HOUSING_OFFICE.y + 2, OFFICE_H],
    ] as const) {
      skin(scene, base, "christmas");
      const gk = hutGlowKey(scene, base, "christmas");
      if (gk) this.add(addTwinkle(scene, gk, x, y, 0.5, 1, { reduced: this.reduced, phase: h % 2 }), x, y);
    }
    // 눈사람·선물 더미 (빈 풀밭에만)
    for (const [i, [ax, ay]] of SNOWMAN_ANCHORS.entries()) {
      const at = this.freeSpot(ax, ay);
      if (!at) continue;
      const k = `concept-snowman-${i % 3}`;
      if (!scene.textures.exists(k)) addCanvasTexture(scene, k, { canvas: snowman(i % 3) });
      this.add(scene.add.image(at[0], at[1] + 1, k).setOrigin(0.5, 1).setDepth(at[1]), at[0], at[1]);
    }
    for (const [i, [ax, ay]] of GIFT_ANCHORS.entries()) {
      const at = this.freeSpot(ax, ay);
      if (!at) continue;
      const k = `concept-gifts-${i % 2}`;
      if (!scene.textures.exists(k)) addCanvasTexture(scene, k, { canvas: giftPile(i % 2) });
      this.add(scene.add.image(at[0], at[1] + 1, k).setOrigin(0.5, 1).setDepth(at[1]), at[0], at[1]);
    }
    // 반짝이는 눈 (화면 안 눈밭 아무 데나 가끔 한 점)
    if (!scene.textures.exists(GLINT)) addCanvasTexture(scene, GLINT, { canvas: snowGlint() });
    this.glints = scene.add
      .particles(0, 0, GLINT, {
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.4, end: 1.1 },
        alpha: { start: 1, end: 0 },
        tint: [0xffffff, 0xe0f0ff, 0xfff4d0],
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(DEPTH.lights + 1);
    this.objs.push(this.glints);
  }

  private makeBreath(): void {
    if (this.reduced) return;
    const scene = this.scene;
    if (!scene.textures.exists(BREATH)) addCanvasTexture(scene, BREATH, { canvas: breathPuff() });
    // 방향마다 하나 (아래·왼쪽·오른쪽): 입에서 앞으로 퍼지며 위로 흩어진다. 월드 색조 구간 안이라 밤엔 같이 어두워진다
    const mk = (sx: [number, number], sy: [number, number]) =>
      scene.add
        .particles(0, 0, BREATH, {
          lifespan: { min: 1100, max: 1500 },
          speedX: { min: sx[0], max: sx[1] },
          speedY: { min: sy[0], max: sy[1] },
          // 11/22 운영자: 얼굴을 덮지 않게 작고 옅게 (예전 0.6→1.7 · 0.8)
          scale: { start: 0.45, end: 1.05 },
          alpha: { start: 0.55, end: 0 },
          emitting: false,
        })
        .setDepth(DEPTH.worldMax - 1);
    this.breath = [mk([-4, 4], [2, 6]), mk([-12, -7], [-4, -1]), mk([7, 12], [-4, -1])];
    this.objs.push(...this.breath);
  }

  /** 매 프레임 (WorldMap.update): 입김·반짝임 */
  update(view: Phaser.Geom.Rectangle): void {
    if (!isSnowy(this.concept)) return;
    const now = this.scene.time.now;
    if (this.breath.length && this.actors && now >= this.nextBreath) {
      this.nextBreath = now + 150;
      for (const a of this.actors()) {
        if (a.x < view.x - 20 || a.x > view.right + 20 || a.y < view.y - 20 || a.y > view.bottom + 40) continue;
        const due = this.breathAt.get(a.key) ?? now + Math.random() * 1500;
        if (now < due) {
          if (!this.breathAt.has(a.key)) this.breathAt.set(a.key, due);
          continue;
        }
        this.breathAt.set(a.key, now + 4000 + Math.random() * 2000); // 11/22 덜 자주 (예전 2.2~3.1초)
        if (a.dir === DIR.up) continue; // 등을 보이면 입김이 안 보인다
        const e = a.dir === DIR.left ? this.breath[1] : a.dir === DIR.right ? this.breath[2] : this.breath[0];
        const ox = a.dir === DIR.left ? -4 : a.dir === DIR.right ? 4 : 0;
        e.explode(2, a.x + ox, a.y - 12); // 11/22 입 높이로 조금 내리고 2개만
      }
    }
    if (this.glints && now >= this.nextGlint) {
      this.nextGlint = now + (this.reduced ? 900 : 140);
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
      if ((k === "grass" || k === "hill" || k === "grave") && !inWater(x, y)) this.glints.explode(1, x, y);
    }
  }

  private add(o: Phaser.GameObjects.Image, x: number, y: number): void {
    this.objs.push(o);
    this.cull(x, y, o);
  }

  /** 앵커 근처(80px 안)에서 가장 가까운 빈 풀밭 자리 (소품·충돌·물·집터에서 떨어진 곳, 이미 놓은 장식과도). 없으면 null */
  private freeSpot(ax: number, ay: number): [number, number] | null {
    this.blockers ??= { props: allProps(), cols: staticColliders() };
    const { props, cols } = this.blockers;
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = ay - 80; y <= ay + 80; y += 4)
      for (let x = ax - 80; x <= ax + 80; x += 4) {
        const d = (x - ax) ** 2 + (y - ay) ** 2;
        if (d >= bd || d > 80 * 80) continue;
        if (groundKind(Math.floor(x / TILE), Math.floor(y / TILE)) !== "grass" || inWater(x, y)) continue;
        if (props.some((p) => Math.abs(p.x - x) < 22 && Math.abs(p.y - y) < 22)) continue;
        if (this.placed.some((p) => Math.abs(p[0] - x) < 24 && Math.abs(p[1] - y) < 20)) continue;
        if (cols.some((r) => x > r.x - 12 && x < r.x + r.w + 12 && y > r.y - 6 && y < r.y + r.h + 26)) continue;
        if (HOUSE_LOTS.some((l) => x > l.x - 8 && x < l.x + HOUSE_LOT_W + 8 && y > l.y - 8 && y < l.y + HOUSE_LOT_H + 30)) continue;
        bd = d;
        best = [x, y];
      }
    if (best) this.placed.push(best);
    return best;
  }

  private clear(): void {
    this.recheck?.remove();
    this.recheck = null;
    for (const t of this.tweens) t.remove();
    for (const o of [...this.objs, ...this.lotObjs]) o.destroy();
    this.tweens = [];
    this.objs = [];
    this.lotObjs = [];
    this.glints = null;
    this.breath = [];
    this.placed = [];
  }

  destroy(): void {
    this.clear();
  }
}

