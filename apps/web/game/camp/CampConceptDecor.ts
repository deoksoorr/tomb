import * as Phaser from "phaser";
import { CAMP_DECK_H, CAMP_DECK_W, CAMP_DECKS, CAMP_FIRE, CAMP_OFFICE, CAMP_SEATS, CAMP_VANS, DIR, type DirId } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { isSnowy, parseConceptOverride, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { Grid, hash2, makeCanvas, vnoise, type Color } from "../sprites/pixel";
import {
  bareTree,
  breathPuff,
  bulbGlowSheet,
  christmasTree,
  doorWreath,
  giftPile,
  lightString,
  snowCap,
  snowGlint,
  snowman,
  snowRoof,
  SNOW,
  woodpile,
  XTREE_H,
  XTREE_W,
} from "../sprites/winterArt";
import { addTwinkle } from "../world/conceptLights";
import * as Art from "./campArt";
import * as Lay from "./campLayout";
import { CAMP_TEX_PREFIX } from "./campTypes";
import { snowDriftArt } from "./campWinter";

// 11/17 캠핑장 맵 컨셉 (lib/mapConcept, 마을 game/world/ConceptDecor와 같은 방식): 겨울·크리스마스 판의 텍스처 고르기 + 겉 장식.
//  - campSkin(): 캠핑장 그림 키 → 그 판의 그림 키 (처음 쓸 때 원본 캔버스에 눈을 얹어 한 번 굽고, 지우지 않는다)
//    침엽수는 눈 쌓인 나무, 단풍·노란 잎 나무는 앙상한 나무, 낙엽 무더기·버섯은 눈 더미, 지붕(관리소·캠핑카·정류장)은 눈 + 고드름,
//    데크·통나무 다리·전망대 바닥·타프 천은 위에서 본 판이라 군데군데 쌓인 눈. 불(모닥불·화롯대·그릴)·빛·NPC는 그대로
//  - CampConceptDecor: 판마다 얹는 장식 (충돌 없음 — 배치·충돌·상호작용 자리는 그대로). 판이 바뀌면 다 지우고 다시 세운다
//    겨울: 장작더미, 관리소 굴뚝 연기, 캐릭터 입김
//    크리스마스: 겨울 + 모닥불 광장 큰 트리(전구·별빛), 데크와 데크를 잇는 전구 줄, 눈사람, 선물 더미, 가끔 반짝이는 눈
//  움직이는 건 빛 겹 프레임 바꾸기(conceptLights 타이머 하나)·별 숨쉬기 트윈 하나·작은 파티클 풀뿐이다 (폰에서도 가볍게)

const P = CAMP_TEX_PREFIX;
const XTREE = `${P}xtree`;
const XTREE_GLOW = `${P}xtree-glow`;
const GLINT = `${P}concept-glint`;
const BREATH = `${P}concept-breath`;
const WOODPILE = `${P}concept-woodpile`;
const DECK_POLE = `${P}concept-deckpole`;

/** 지금 판 (주소 시험 값이 있으면 그것, 없으면 관리자가 고른 값 — 마을 장면이 bridge로 알린다) */
export function campConceptNow(): MapConcept {
  return parseConceptOverride(window.location.search) ?? bridge.last("map:concept")?.concept ?? "default";
}

// ── 텍스처 고르기 ──

/** 겨울에도 그대로 쓰는 그림 (불·빛·하늘·사람·연기·음식) */
const KEEP = new Set<string>([
  Art.CAMP_TEX.flames,
  Art.CAMP_TEX.fireRing,
  Art.CAMP_TEX.logChair, // 모닥불 둘레 통나무 의자 (불 곁이라 녹았다)
  Art.CAMP_TEX.brazier,
  Art.CAMP_TEX.brazierFire,
  Art.CAMP_TEX.bbqGrill,
  Art.CAMP_TEX.lantern,
  Art.CAMP_TEX.bulb,
  Art.CAMP_TEX.bulbGlow,
  Art.CAMP_TEX.vendingLit,
  Art.CAMP_TEX.bbqSmoke,
  Art.CAMP_TEX.squirrel,
  Art.CAMP_TEX.milkyWay,
  Art.CAMP_TEX.mist,
  Art.CAMP_TEX.sunGlow,
  Art.CAMP_TEX.sparkle,
  Art.CAMP_TEX.ember,
  Art.CAMP_TEX.firefly,
  Art.CAMP_TEX.drip,
]);
/** 크리스마스판에서 리스·장식을 더 다는 그림 */
const XMAS = new Set<string>([Art.CAMP_TEX.office, Art.CAMP_TEX.vending, Art.CAMP_TEX.bbqTable, Art.CAMP_TEX.plateSign]);

/** 관리소 지붕 너와 색 (officeArt) */
const OFFICE_ROOF: readonly Color[] = [0xb85a3c, 0xa64e36, 0x8e4430, 0x6e3426, 0xd8784e];
/** 캠핑카 흰 지붕·루프 박스 (vanArt) */
const VAN_ROOF: readonly Color[] = [0xe8e4d8, 0xfaf8f0, 0xb8b4a8, 0xd8d4c8];

const name = (base: string) => base.slice(P.length);

/** 기본 그림 키 → 이 판의 그림 키 (없으면 굽는다). 기본 판·그대로 쓰는 그림·원본이 아직 없으면 base 그대로 */
export function campSkin(scene: Phaser.Scene, base: string, concept: MapConcept): string {
  if (!isSnowy(concept) || KEEP.has(base) || !base.startsWith(P) || base.startsWith(`${P}npc-`) || base.startsWith(`${P}bbqPlate-`)) return base;
  const xmas = concept === "christmas" && XMAS.has(base);
  const key = `${P}${xmas ? "x" : "w"}~${name(base)}`;
  if (scene.textures.exists(key)) return key;
  const src = sourceCanvas(scene, base);
  if (!src) return base;
  let c = winterCanvas(base, src);
  if (xmas) c = christmasCanvas(base, c);
  addCanvasTexture(scene, key, { canvas: c });
  return key;
}

/** 미리 굽기(campPrebake)에 넘길 겨울 그림 목록: 원본 키 + 굽는 함수 (구운 키를 돌려준다, 원본이 아직 없으면 원본 키) */
export function forEachCampSkin(concept: MapConcept, each: (base: string, build: (scene: Phaser.Scene) => string) => void): void {
  if (!isSnowy(concept)) return;
  const bases: string[] = [];
  const T = Art.CAMP_TEX;
  for (let v = 0; v < 2; v++) bases.push(T.spruce(v), T.pine(v), T.fir(v), T.maple(v), T.mapleO(v), T.yellow(v), T.bush(v), T.boulder(v));
  for (let v = 0; v < 3; v++) bases.push(T.leafPile(v), T.mushroom(v), T.fern(v), T.pebbles(v));
  bases.push(T.rockSeat, T.logChair, T.bench, T.rustyBench, T.plankBench2, T.plankBench3, T.table, T.office, T.board, T.bridge, T.tarp, T.tarpPole);
  bases.push(T.lookoutFloor, T.lookoutFront, T.pole, T.shelter, T.busSign, T.timetable, T.foldTable, T.icebox, T.plateSign, T.bbqTable, T.vending);
  for (const d of CAMP_DECKS) bases.push(T.deck(d.n));
  CAMP_VANS.forEach((_v, i) => bases.push(T.van(i, false), T.van(i, true)));
  for (let i = 0; i < 3; i++) bases.push(T.campChairFront(i), T.campChairSide(i));
  for (const b of bases) each(b, (scene) => campSkin(scene, b, concept));
}

function sourceCanvas(scene: Phaser.Scene, key: string): HTMLCanvasElement | null {
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage();
  return src instanceof HTMLCanvasElement ? src : null;
}

const leafyKind = (n: string): number | null => {
  const m = /^(maple|mapleO|yellow)(\d)$/.exec(n);
  if (!m) return null;
  const v = Number(m[2]);
  // 노란 잎 v1은 자작나무(흰 줄기) → 하얀 앙상한 나무, 나머지는 짙은 껍질 두 모양
  return m[1] === "yellow" ? (v % 2 ? 2 : 1) : (v + (m[1] === "mapleO" ? 1 : 0)) % 2;
};

function winterCanvas(base: string, src: HTMLCanvasElement): HTMLCanvasElement {
  const n = name(base);
  const h = src.height;
  const bare = leafyKind(n);
  if (bare !== null) return bareTree(bare);
  // 침엽수는 잎을 겨울빛(짙고 차갑게)으로, 덤불은 잎이 시든 빛으로 바꾼 뒤 눈을 얹는다
  if (/^(spruce|pine|fir)\d$/.test(n)) return snowCap(tone(src, 0x24403c, 0.3), { depth: 3, maxY: h - 4, seed: 131 + n.length });
  if (/^bush\d$/.test(n)) return snowCap(tone(src, 0x6a6650, 0.55), { depth: 3, maxY: h - 3, seed: 137 });
  if (/^(leafPile|mushroom)\d$/.test(n)) return snowDriftArt((Number(n.slice(-1)) + (n.startsWith("m") ? 1 : 0)) % 3).toCanvas();
  if (/^(fern|pebbles)\d$/.test(n)) return snowCap(src, { depth: 1, seed: 139 });
  if (/^deck\d+$/.test(n)) return snowFloor(src, { keep: (x, y) => x < 18 && y < 9, seed: Number(n.slice(4)) });
  if (n === "bridge") return snowFloor(src, { cover: 0.42, seed: 141 });
  if (n === "lookoutFloor") return snowFloor(src, { cover: 0.5, seed: 143 });
  if (n === "tarp") return snowFloor(src, { cover: 0.34, north: true, seed: 145 });
  if (n === "office") return snowRoof(src, OFFICE_ROOF, { seed: 147 });
  if (/^van\d[oc]$/.test(n)) return snowRoof(src, VAN_ROOF, { seed: 149 });
  // 정류장: 녹슨 골함석 지붕 띠(4~13줄)만 지붕으로 (기둥도 같은 녹 색이라 색으로 고르지 않는다)
  if (n === "shelter") return snowRoof(src, (_x, y) => y >= 4 && y <= 13, { seed: 151 });
  return snowCap(src, { depth: 2, maxY: h - 2, seed: 153 });
}

/** 잎(윤곽·그림자가 아닌 불투명 픽셀)을 target 쪽으로 t만큼 섞은 새 캔버스 */
function tone(src: HTMLCanvasElement, target: Color, t: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const tr = (target >> 16) & 255;
  const tg = (target >> 8) & 255;
  const tb = target & 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200 || 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] < 60) continue;
    // 줄기(갈색 — 빨강이 초록보다 센 짙은 색)는 그대로
    if (d[i] > d[i + 1] && d[i + 1] < 130 && d[i] < 170) continue;
    d[i] += (tr - d[i]) * t;
    d[i + 1] += (tg - d[i + 1]) * t;
    d[i + 2] += (tb - d[i + 2]) * t;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * 위에서 본 판(데크·다리·전망대 바닥·타프 천)에 쌓인 눈: 덩어리 노이즈로 군데군데 덮고, 원래 밝기 차(판자 틈·주름)는 눈의 명암으로 남긴다.
 * cover = 덮는 정도 (0..1), north = 위쪽(북쪽 경사면)일수록 더 덮는다, keep = 건드리지 않을 자리(번호 팻말)
 */
function snowFloor(src: HTMLCanvasElement, o: { cover?: number; north?: boolean; keep?: (x: number, y: number) => boolean; seed?: number }): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const W = src.width;
  const H = src.height;
  const seed = o.seed ?? 0;
  const cover = o.cover ?? 0.46;
  const lumAt = (i: number) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 200 || o.keep?.(x, y)) continue;
      const L = lumAt(i);
      if (L < 60) continue; // 윤곽은 그대로
      // 가장자리일수록(사람이 덜 밟는 곳) 많이
      const ex = Math.min(x, W - 1 - x) / (W / 2);
      const ey = Math.min(y, H - 1 - y) / (H / 2);
      const rim = 1 - Math.min(1, Math.min(ex, ey) * 2.2);
      const tilt = o.north ? (1 - y / H) * 0.35 - 0.1 : 0;
      const n = vnoise(x, y, 6, 461 + seed) * 0.75 + hash2(x, y, 463 + seed) * 0.25;
      if (n > 1 - cover - rim * 0.3 - tilt) {
        const c = L < 110 ? SNOW.shade : L < 150 ? SNOW.lo : n > 0.82 ? SNOW.hi : SNOW.mid;
        d[i] = (c >> 16) & 255;
        d[i + 1] = (c >> 8) & 255;
        d[i + 2] = c & 255;
      } else {
        // 눈이 없는 판자도 서리 낀 듯 살짝 차갑게
        d[i] = d[i] * 0.86 + 0xc8 * 0.14;
        d[i + 1] = d[i + 1] * 0.86 + 0xd4 * 0.14;
        d[i + 2] = d[i + 2] * 0.86 + 0xe0 * 0.14;
      }
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 작은 리스 (9×9 — 자판기·탁자·팻말에) */
function miniWreath(): HTMLCanvasElement {
  const g = new Grid(9, 9);
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const r = Math.hypot(x + 0.5 - 4.5, y + 0.5 - 4.5);
      if (r <= 4.2 && r >= 1.9) g.set(x, y, hash2(x, y, 471) < 0.35 ? 0x3e7a48 : 0x2b5a36);
    }
  for (const [x, y] of [
    [1, 3],
    [6, 1],
    [7, 5],
    [3, 7],
  ])
    g.set(x, y, 0xe8323a);
  g.set(3, 8, 0xd8323a);
  g.set(5, 8, 0xd8323a);
  g.set(4, 7, 0xf04a4a);
  g.outline(0x1f1d1a, false, 200);
  return g.toCanvas();
}

/** 호랑가시 장식 줄 (늘어진 초록 줄 + 빨간 열매) — 그림 위 (x0..x1, y)에 */
function garland(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, swag: number): void {
  const span = 18;
  for (let x = x0; x <= x1; x++) {
    const t = ((x - x0) % span) / span;
    const yy = Math.round(y + Math.sin(t * Math.PI) * swag);
    ctx.fillStyle = (x & 1) === 0 ? "#2b5a36" : "#3e7a48";
    ctx.fillRect(x, yy, 1, 2);
    if ((x - x0) % span === Math.round(span / 2)) {
      ctx.fillStyle = "#e8323a";
      ctx.fillRect(x, yy + 2, 1, 1);
      ctx.fillRect(x - 1, yy + 1, 1, 1);
    }
  }
}

function christmasCanvas(base: string, src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  const T = Art.CAMP_TEX;
  if (base === T.office) {
    // 관리소 문 리스 + 매점 차양 끝 호랑가시 줄
    const b = Art.OFFICE_ART_H - 3;
    ctx.drawImage(doorWreath(), 50, b - 18);
    garland(ctx, Art.OFFICE_ART_W / 2 + 6, Art.OFFICE_ART_W / 2 + 82, b - 34, 3);
  } else if (base === T.vending) ctx.drawImage(miniWreath(), 6, 0);
  else if (base === T.bbqTable) {
    garland(ctx, 3, 44, 11, 2);
    ctx.drawImage(miniWreath(), 19, 8);
  } else if (base === T.plateSign) ctx.drawImage(miniWreath(), Art.PLATE_SIGN_W / 2 - 4, 0);
  return canvas;
}

// ── 장식 ──

/** 입김을 낼 사람 */
export type CampActor = { key: object; x: number; y: number; dir: DirId };
type Cull = (x: number, y: number, o: Phaser.GameObjects.Image) => void;

/** 크리스마스 트리 받침 (광장 위쪽, 두 조명 기둥 사이 — 모닥불을 앞에 두고 선다) */
export const CAMP_XTREE = { x: CAMP_FIRE.x, y: CAMP_FIRE.y - 72 } as const;
/** 장작더미 자리 (관리소 서쪽 벽·바베큐장 구석·광장 둘레) */
const WOODPILE_ANCHORS: readonly [number, number][] = [
  [CAMP_OFFICE.x - 100, CAMP_OFFICE.y - 4],
  [Lay.CAMP_BBQ.area.x + 14, Lay.CAMP_BBQ.area.y + 10],
  [CAMP_FIRE.x - 118, CAMP_FIRE.y - 40],
];
/** 눈사람 자리 (구역마다 하나씩, 가장 가까운 빈 눈밭으로) */
const SNOWMAN_ANCHORS: readonly [number, number][] = [
  [CAMP_FIRE.x + 150, CAMP_FIRE.y + 60],
  [CAMP_FIRE.x - 150, CAMP_FIRE.y + 70],
  [250, 590],
  [1196, 560],
  [560, 610],
];
/** 선물 더미 자리 (트리 밑동엔 그림에 선물이 있다 — 버스에서 내리는 곳·타프 옆·전망대 옆) */
const GIFT_ANCHORS: readonly [number, number][] = [
  [250, 604],
  [556, 676],
  [1210, 186],
];
/** 전구 줄 기둥 높이 (데크 번호 말뚝 위로) */
const DECK_POLE_H = 26;

export class CampConceptDecor {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tweens: Phaser.Tweens.Tween[] = [];
  private concept: MapConcept = "default";
  private glints: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private nextGlint = 0;
  private nextBreath = 0;
  private readonly breathAt = new WeakMap<object, number>();
  private placed: [number, number][] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    private readonly cull: Cull,
    /** 입김을 낼 사람들 (내 캐릭터 + 같은 맵 사람) */
    private readonly actors: () => Iterable<CampActor>,
  ) {}

  apply(concept: MapConcept): void {
    this.clear();
    this.concept = concept;
    if (!isSnowy(concept)) return;
    const scene = this.scene;
    // 장작더미
    if (!scene.textures.exists(WOODPILE)) addCanvasTexture(scene, WOODPILE, { canvas: woodpile() });
    for (const [ax, ay] of WOODPILE_ANCHORS) {
      const at = this.freeSpot(ax, ay, 40);
      if (at) this.add(scene.add.image(at[0], at[1] + 1, WOODPILE).setOrigin(0.5, 1).setDepth(at[1]), at[0], at[1]);
    }
    // 관리소 굴뚝 연기 (겨울엔 난로를 땐다 — officeArt 굴뚝 x 34~41)
    if (!this.reduced && scene.textures.exists(Art.CAMP_TEX.bbqSmoke)) {
      const sx = CAMP_OFFICE.x - Art.OFFICE_ART_W / 2 + 38;
      const sy = CAMP_OFFICE.y + 3 - Art.OFFICE_ART_H;
      this.objs.push(
        scene.add
          .particles(sx, sy, Art.CAMP_TEX.bbqSmoke, {
            lifespan: { min: 2600, max: 3600 },
            speedX: { min: 1, max: 6 },
            speedY: { min: -12, max: -7 },
            scale: { start: 0.5, end: 1.8 },
            alpha: { start: 0.45, end: 0 },
            frequency: 700,
          })
          .setDepth(CAMP_OFFICE.y + 1),
      );
    }
    this.makeBreath();
    if (concept === "christmas") this.dressChristmas();
  }

  private dressChristmas(): void {
    const scene = this.scene;
    // 모닥불 광장 큰 트리 + 전구 빛 겹 + 별빛
    const t = christmasTree();
    if (!scene.textures.exists(XTREE)) addCanvasTexture(scene, XTREE, { canvas: t.canvas });
    if (!scene.textures.exists(XTREE_GLOW)) addCanvasTexture(scene, XTREE_GLOW, { canvas: bulbGlowSheet(XTREE_W, XTREE_H, t.bulbs, t.star), frameW: XTREE_W, frameH: XTREE_H });
    const { x, y } = CAMP_XTREE;
    this.add(scene.add.image(x, y + 1, XTREE).setOrigin(0.5, 1).setDepth(y), x, y);
    this.add(addTwinkle(scene, XTREE_GLOW, x, y + 1, 0.5, 1, { reduced: this.reduced }), x, y);
    const sx = x - XTREE_W / 2 + t.star.x;
    const sy = y + 1 - XTREE_H + t.star.y + 1;
    const halo = scene.add.image(sx, sy, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe08a).setScale(0.55).setAlpha(0.6).setDepth(DEPTH.lights + 3);
    this.add(halo, x, y);
    if (!this.reduced) this.tweens.push(scene.tweens.add({ targets: halo, alpha: { from: 0.35, to: 0.85 }, scale: { from: 0.45, to: 0.65 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
    this.placed.push([x, y], [x - 20, y], [x + 20, y]);
    // 데크와 데크를 잇는 전구 줄 (데크 번호 말뚝 자리에 기둥을 세운다 — 텐트를 치면 그 텐트들을 잇는 줄)
    if (!scene.textures.exists(DECK_POLE)) addCanvasTexture(scene, DECK_POLE, { canvas: deckPole() });
    const tops = CAMP_DECKS.map((d) => {
      const px = d.x - CAMP_DECK_W / 2 + 2;
      const py = d.y - CAMP_DECK_H / 2 - 2;
      this.add(scene.add.image(px, py + 1, DECK_POLE).setOrigin(0.5, 1).setDepth(py), px, py);
      return [px, py - DECK_POLE_H, py] as const;
    });
    tops.forEach((a, i) => {
      const b = tops[(i + 1) % tops.length];
      this.addString(a, b, i);
    });
    // 눈사람·선물 더미 (빈 눈밭에만)
    for (const [i, [ax, ay]] of SNOWMAN_ANCHORS.entries()) {
      const at = this.freeSpot(ax, ay, 90);
      if (!at) continue;
      const k = `${P}concept-snowman-${i % 3}`;
      if (!scene.textures.exists(k)) addCanvasTexture(scene, k, { canvas: snowman(i % 3) });
      this.add(scene.add.image(at[0], at[1] + 1, k).setOrigin(0.5, 1).setDepth(at[1]), at[0], at[1]);
    }
    for (const [i, [ax, ay]] of GIFT_ANCHORS.entries()) {
      const at = this.freeSpot(ax, ay, 50);
      if (!at) continue;
      const k = `${P}concept-gifts-${i % 2}`;
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

  /** 두 기둥 머리를 잇는 전구 줄 (a·b = [x, 머리 y, 받침 y]) */
  private addString(a: readonly [number, number, number], b: readonly [number, number, number], i: number): void {
    const scene = this.scene;
    const dx = Math.round(b[0] - a[0]);
    const dy = Math.round(b[1] - a[1]);
    const sag = Math.max(5, Math.round(Math.hypot(dx, dy) * 0.09));
    const key = `${P}concept-string-${dx}-${dy}-${sag}`;
    const s = lightString(dx, dy, sag);
    if (!scene.textures.exists(key)) {
      addCanvasTexture(scene, key, { canvas: s.canvas });
      addCanvasTexture(scene, `${key}~glow`, { canvas: bulbGlowSheet(s.canvas.width, s.canvas.height, s.bulbs), frameW: s.canvas.width, frameH: s.canvas.height });
    }
    const x = a[0] - s.ox;
    const y = a[1] - s.oy;
    // 줄은 기둥 머리 높이에 걸린다 — 깊이는 두 받침 중 앞쪽 기준 (그 앞을 지나는 사람·나무가 가린다)
    const depth = Math.max(a[2], b[2]) + 2;
    const mx = a[0] + dx / 2;
    this.add(scene.add.image(x, y, key).setOrigin(0, 0).setDepth(depth), mx, depth);
    this.add(addTwinkle(scene, `${key}~glow`, x, y, 0, 0, { reduced: this.reduced, phase: i % 2, alpha: 0.9 }), mx, depth);
  }

  private makeBreath(): void {
    if (this.reduced) return;
    const scene = this.scene;
    if (!scene.textures.exists(BREATH)) addCanvasTexture(scene, BREATH, { canvas: breathPuff() });
    // 방향마다 하나 (아래·왼쪽·오른쪽): 입에서 앞으로 퍼지며 위로 흩어진다
    const mk = (sx: [number, number], sy: [number, number]) =>
      scene.add
        .particles(0, 0, BREATH, {
          lifespan: { min: 1100, max: 1500 },
          speedX: { min: sx[0], max: sx[1] },
          speedY: { min: sy[0], max: sy[1] },
          scale: { start: 0.6, end: 1.7 },
          alpha: { start: 0.8, end: 0 },
          emitting: false,
        })
        .setDepth(DEPTH.worldMax - 1);
    this.breath = [mk([-4, 4], [2, 6]), mk([-12, -7], [-4, -1]), mk([7, 12], [-4, -1])];
    this.objs.push(...this.breath);
  }

  /** 매 프레임 (CampMap.update): 입김·반짝임 */
  update(now: number, view: Phaser.Geom.Rectangle): void {
    if (!isSnowy(this.concept)) return;
    if (this.breath.length && now >= this.nextBreath) {
      this.nextBreath = now + 150;
      for (const a of this.actors()) {
        if (a.x < view.x - 20 || a.x > view.right + 20 || a.y < view.y - 20 || a.y > view.bottom + 40) continue;
        const due = this.breathAt.get(a.key) ?? now + Math.random() * 1500;
        if (now < due) {
          if (!this.breathAt.has(a.key)) this.breathAt.set(a.key, due);
          continue;
        }
        this.breathAt.set(a.key, now + 2200 + Math.random() * 900);
        if (a.dir === DIR.up) continue; // 등을 보이면 입김이 안 보인다
        const e = a.dir === DIR.left ? this.breath[1] : a.dir === DIR.right ? this.breath[2] : this.breath[0];
        const ox = a.dir === DIR.left ? -4 : a.dir === DIR.right ? 4 : 0;
        e.explode(3, a.x + ox, a.y - 15);
      }
    }
    if (this.glints && now >= this.nextGlint) {
      this.nextGlint = now + (this.reduced ? 900 : 140);
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      const k = Lay.campGroundKind(x, y);
      if (k === "grass" || k === "rock" || k === "bank") this.glints.explode(1, x, y);
    }
  }

  private add(o: Phaser.GameObjects.Image, x: number, y: number): void {
    this.objs.push(o);
    this.cull(x, y, o);
  }

  /** 앵커 근처(r px 안)에서 가장 가까운 빈 자리: 걸을 수 있는 눈밭(광장·길·물 밖), 나무·데크·자리·상호작용·이미 놓은 장식과 떨어진 곳 */
  private freeSpot(ax: number, ay: number, r: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = ay - r; y <= ay + r; y += 4)
      for (let x = ax - r; x <= ax + r; x += 4) {
        const d = (x - ax) ** 2 + (y - ay) ** 2;
        if (d >= bd || d > r * r) continue;
        const k = Lay.campGroundKind(x, y);
        if (k !== "grass") continue;
        if (Lay.pathEdgeDist(x, y, 8) < 6) continue;
        if (!Lay.campStandable(x, y) || !Lay.campStandable(x - 10, y) || !Lay.campStandable(x + 10, y)) continue;
        if (Lay.CAMP_TREES.some((t) => Math.abs(t.x - x) < 20 && y > t.y - 16 && y < t.y + 22)) continue;
        if (Lay.CAMP_DECOR.some((t) => Math.abs(t.x - x) < 12 && Math.abs(t.y - y) < 8)) continue;
        if (CAMP_DECKS.some((dk) => Math.abs(dk.x - x) < CAMP_DECK_W / 2 + 12 && y > dk.y - CAMP_DECK_H / 2 - 4 && y < dk.y + CAMP_DECK_H / 2 + 24)) continue;
        if (CAMP_SEATS.some((s) => Math.abs(s.x - x) < 18 && Math.abs(s.y - y) < 18)) continue;
        if (Lay.CAMP_INTERACTABLES.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 10)) continue;
        if (this.placed.some((p) => Math.abs(p[0] - x) < 26 && Math.abs(p[1] - y) < 20)) continue;
        bd = d;
        best = [x, y];
      }
    if (best) this.placed.push(best);
    return best;
  }

  private clear(): void {
    for (const t of this.tweens) t.remove();
    for (const o of this.objs) o.destroy();
    this.tweens = [];
    this.objs = [];
    this.glints = null;
    this.breath = [];
    this.placed = [];
  }

  destroy(): void {
    this.clear();
  }
}

/** 데크 번호 말뚝 위로 올린 가는 전구 줄 기둥 (5×30, 원점 바닥 가운데) — 머리에 눈 */
function deckPole(): HTMLCanvasElement {
  const H = DECK_POLE_H + 4;
  const g = new Grid(5, H);
  g.rect(1, 2, 2, H - 2, 0x845e38);
  g.vline(1, 2, H - 1, 0xb08250);
  g.rect(0, 2, 4, 2, 0x4a321e); // 걸이
  g.outline(0x2c2018);
  return snowCap(g.toCanvas(), { depth: 1, maxY: 6, seed: 157 });
}
