import * as Phaser from "phaser";
import { DIR, STATE_NAMES, type DirId, type StateName } from "@tomb/protocol";
import { AV_ACT_ANIM, AV_ANIM, AV_COLS, AV_H, AV_W, bodyOf, buildAvatarSheet, lookKey, type AvatarActAnim } from "../sprites/avatar";
import * as fx from "../sprites/fx";
import { SHAPE_SIZE, shapeVariants, type GraveShape } from "../graveShape";
import { flowersCanvas, graveCanvas, graveTexKey, mineFlagCanvas, plotCanvas, upMarkerCanvas } from "../sprites/graves";
import * as props from "../sprites/props";
import { WORLD_PROP_ART } from "../sprites/worldProps";
import * as art from "../sprites/extras";
import { parseHex } from "../sprites/pixel";

// 텍스처 키 → 생성기. 지금은 전부 코드로 그린 플레이스홀더 픽셀아트이고,
// 나중에 CC0 스프라이트시트로 바꾸려면 해당 항목을 { kind: "file", url, frameW?, frameH? } 로 바꾸면 된다
// (BootScene이 file 항목은 preload, procedural 항목은 캔버스로 생성한다. 출처는 CREDITS.md에 기록).

export type Built = { canvas: HTMLCanvasElement; frameW?: number; frameH?: number; linear?: boolean };
export type TextureSource =
  | { kind: "procedural"; build: () => Built }
  | { kind: "file"; url: string; frameW?: number; frameH?: number; linear?: boolean };

export const TEX = {
  pixel: "fx-pixel",
  glow: "fx-glow",
  firefly: "fx-firefly",
  dust: "fx-dust",
  shadow: "fx-shadow",
  petal: "fx-petal",
  dirt: "fx-dirt",
  spark: "fx-spark",
  bubble: "fx-bubble",
  candle: "fx-candle",
  wisp: "fx-wisp",
  flowerIcon: "fx-flower-icon",
  reviveIcon: "fx-revive-icon",
  splash: "fx-splash",
  vignette: "fx-vignette",
  fog: "fx-fog",
  cloud: "fx-cloud",
  rainNear: "fx-rain-near",
  rainFar: "fx-rain-far",
  snowNear: "fx-snow-near",
  snowFar: "fx-snow-far",
  shimmer: "fx-shimmer",
  tree0: "prop-tree-0",
  tree1: "prop-tree-1",
  dead0: "prop-dead-0",
  dead1: "prop-dead-1",
  lantern: "prop-lantern",
  bench2: "prop-bench-2",
  bench3: "prop-bench-3",
  bench4: "prop-bench-4",
  chairDown: "prop-chair-down",
  chairLeft: "prop-chair-left",
  chairRight: "prop-chair-right",
  table: "prop-table",
  altar: "prop-altar",
  gate: "prop-gate",
  wallFace: "prop-wall-face",
  plot: "grave-plot",
  upMarker: "grave-up",
  dot: "fx-dot",
  petalPink: "fx-petal-pink",
  wreath: "decor-wreath",
  ribbon: "decor-ribbon",
  miniLantern: "decor-lantern",
  ghostCat: "decor-ghostcat",
  rainbow: "decor-rainbow",
  butterfly: "decor-butterfly",
  snowman: "decor-snowman",
  flowerpot: "decor-flowerpot",
  shopHut: "shop-hut",
  shopFloor: "shop-floor",
  shopWall: "shop-wall",
  shopShelf0: "shop-shelf-0",
  shopShelf1: "shop-shelf-1",
  shopShelf2: "shop-shelf-2",
  shopCounter: "shop-counter",
  shopKeeper: "shop-keeper",
  shopDoor: "shop-door",
  mineFlag: "grave-mine-flag",
  // 아바타 꾸미기 연출 (AvatarView)
  avWings: "av-wings",
  avPetGhost: "av-pet-ghost",
  avFootFlower: "av-foot-flower",
  avRipple: "av-ripple",
  avBubble: "av-bubble",
} as const;

export function flowersKey(n: number): string {
  return `flowers-${Math.max(1, Math.min(8, n))}`;
}

const proc = (build: () => HTMLCanvasElement, opts: Omit<Built, "canvas"> = {}): TextureSource => ({
  kind: "procedural",
  build: () => ({ canvas: build(), ...opts }),
});

function buildManifest(): Record<string, TextureSource> {
  const m: Record<string, TextureSource> = {
    [TEX.pixel]: proc(fx.pixel),
    [TEX.glow]: proc(fx.glow, { linear: true }),
    [TEX.firefly]: proc(fx.firefly),
    [TEX.dust]: proc(fx.dust),
    [TEX.shadow]: proc(fx.groundShadow),
    [TEX.petal]: proc(fx.petal),
    [TEX.dirt]: proc(fx.dirtBit),
    [TEX.spark]: proc(fx.spark),
    [TEX.bubble]: proc(fx.bubble),
    [TEX.candle]: proc(fx.candle, { frameW: 3, frameH: 8 }),
    [TEX.wisp]: proc(fx.wisp, { frameW: 8, frameH: 10 }),
    [TEX.flowerIcon]: proc(fx.flowerIcon),
    [TEX.reviveIcon]: proc(fx.reviveIcon),
    [TEX.splash]: proc(fx.splash),
    [TEX.vignette]: proc(fx.vignette, { linear: true }),
    [TEX.fog]: proc(fx.fog, { linear: true }),
    [TEX.cloud]: proc(fx.cloudShadow, { linear: true }),
    [TEX.rainNear]: proc(() => fx.rain(26, 3)),
    [TEX.rainFar]: proc(() => fx.rain(14, 9)),
    [TEX.snowNear]: proc(() => fx.snow(18, 4)),
    [TEX.snowFar]: proc(() => fx.snow(30, 8)),
    [TEX.shimmer]: proc(fx.shimmer),
    [TEX.tree0]: proc(() => props.tree(0)),
    [TEX.tree1]: proc(() => props.tree(1)),
    [TEX.dead0]: proc(() => props.deadTree(0)),
    [TEX.dead1]: proc(() => props.deadTree(1)),
    [TEX.lantern]: proc(props.lantern),
    [TEX.bench2]: proc(() => props.bench(40)),
    [TEX.bench3]: proc(() => props.bench(56)),
    [TEX.bench4]: proc(() => props.bench(72)),
    [TEX.chairDown]: proc(() => props.chair("down")),
    [TEX.chairLeft]: proc(() => props.chair("left")),
    [TEX.chairRight]: proc(() => props.chair("right")),
    [TEX.table]: proc(props.table),
    [TEX.altar]: proc(props.altar),
    [TEX.gate]: proc(props.gate),
    [TEX.wallFace]: proc(props.wallFaceTile),
    [TEX.plot]: proc(plotCanvas),
    [TEX.upMarker]: proc(upMarkerCanvas),
    [TEX.dot]: proc(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 2, 2);
      return c;
    }),
    [TEX.petalPink]: proc(art.petalPink),
    [TEX.wreath]: proc(art.wreath),
    [TEX.ribbon]: proc(art.ribbon),
    [TEX.miniLantern]: proc(art.miniLantern),
    [TEX.ghostCat]: proc(art.ghostCat, { frameW: 12, frameH: 8 }),
    [TEX.rainbow]: proc(art.rainbow),
    [TEX.butterfly]: proc(art.butterfly, { frameW: 7, frameH: 5 }),
    [TEX.snowman]: proc(art.snowman),
    [TEX.flowerpot]: proc(art.flowerpot),
    [TEX.shopHut]: proc(art.shopHut),
    [TEX.shopFloor]: proc(art.shopFloor),
    [TEX.shopWall]: proc(art.shopWall),
    [TEX.shopShelf0]: proc(() => art.shopShelf(1)),
    [TEX.shopShelf1]: proc(() => art.shopShelf(2)),
    [TEX.shopShelf2]: proc(() => art.shopShelf(3)),
    [TEX.shopCounter]: proc(art.shopCounter),
    [TEX.shopKeeper]: proc(art.shopKeeper, { frameW: 16, frameH: 22 }),
    [TEX.shopDoor]: proc(art.shopDoor),
    [TEX.mineFlag]: proc(mineFlagCanvas),
    [TEX.avWings]: proc(fx.avatarWings, { frameW: 26, frameH: 12 }),
    [TEX.avPetGhost]: proc(fx.petGhost),
    [TEX.avFootFlower]: proc(fx.footFlower, { frameW: 5, frameH: 5 }),
    [TEX.avRipple]: proc(fx.ripple),
    [TEX.avBubble]: proc(fx.avBubble),
  };
  // v3 월드 소품·특별한 장소 (sprites/worldProps.ts)
  for (const [key, build] of Object.entries(WORLD_PROP_ART)) m[key] = proc(build);
  for (const shape of Object.keys(SHAPE_SIZE) as GraveShape[])
    for (let v = 0; v < shapeVariants(shape); v++) m[graveTexKey(shape, v)] = proc(() => graveCanvas(shape, v));
  for (let n = 1; n <= 8; n++) m[flowersKey(n)] = proc(() => flowersCanvas(n));
  return m;
}

export const MANIFEST: Readonly<Record<string, TextureSource>> = buildManifest();

/** 캔버스를 텍스처로 등록 (프레임 크기가 있으면 0..n 번호 프레임을 만든다) */
export function addCanvasTexture(scene: Phaser.Scene, key: string, b: Built): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, b.canvas);
  if (!tex) return;
  if (b.frameW && b.frameH) {
    const cols = Math.floor(b.canvas.width / b.frameW);
    const rows = Math.floor(b.canvas.height / b.frameH);
    for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * b.frameW, Math.floor(i / cols) * b.frameH, b.frameW, b.frameH);
  }
  if (b.linear) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** BootScene.preload: 파일 항목만 로드 */
export function preloadFiles(scene: Phaser.Scene): void {
  for (const [key, src] of Object.entries(MANIFEST)) {
    if (src.kind !== "file") continue;
    if (src.frameW && src.frameH) scene.load.spritesheet(key, src.url, { frameWidth: src.frameW, frameHeight: src.frameH });
    else scene.load.image(key, src.url);
  }
}

/** BootScene.create: 코드 생성 항목을 모두 만든다. 항목별 소요 시간(ms)을 돌려준다 (?debug=1 측정용) */
export function installProcedural(scene: Phaser.Scene): Record<string, number> {
  const timing: Record<string, number> = {};
  for (const [key, src] of Object.entries(MANIFEST)) {
    const t0 = performance.now();
    if (src.kind === "procedural") addCanvasTexture(scene, key, src.build());
    else if (src.linear && scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    timing[key] = performance.now() - t0;
  }
  return timing;
}

// ── 아바타: 색마다 시트를 하나씩 (처음 보는 색일 때 생성) ──

const DIR_IDS: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.up];

/** 색 + (시트에 그려지는) 꾸미기 + 몸 조합마다 시트 하나 */
export function avatarKey(color: string, look: readonly string[] = [], body: string = "hood"): string {
  const b = bodyOf(body);
  const base = `avatar-${parseHex(color).toString(16).padStart(6, "0")}${b === "hood" ? "" : `@${b}`}`;
  const k = lookKey(look);
  return k ? `${base}~${k}` : base;
}

/** 한 번 하는 동작(손 흔들기·환호) 애니메이션 키 */
export function avatarActAnimKey(texKey: string, act: AvatarActAnim, dir: DirId): string {
  return `${texKey}:act-${act}:${dir}`;
}

export function avatarAnimKey(texKey: string, state: StateName, dir: DirId): string {
  return `${texKey}:${state}:${dir}`;
}

/** 아바타 텍스처와 애니메이션을 준비하고 텍스처 키를 돌려준다 */
export function ensureAvatarTexture(scene: Phaser.Scene, color: string, look: readonly string[] = [], body: string = "hood"): string {
  const key = avatarKey(color, look, body);
  if (!scene.textures.exists(key)) {
    addCanvasTexture(scene, key, { canvas: buildAvatarSheet(color, look, body), frameW: AV_W, frameH: AV_H });
  }
  if (!scene.anims.exists(avatarAnimKey(key, "idle", DIR.down))) {
    for (const dir of DIR_IDS) {
      for (const state of STATE_NAMES) {
        const a = AV_ANIM[state];
        const start = dir * AV_COLS + a.col;
        scene.anims.create({
          key: avatarAnimKey(key, state, dir),
          frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: start + i })),
          frameRate: a.fps,
          repeat: a.frames > 1 ? -1 : 0,
        });
      }
      for (const act of Object.keys(AV_ACT_ANIM) as AvatarActAnim[]) {
        const a = AV_ACT_ANIM[act];
        const start = dir * AV_COLS + a.col;
        scene.anims.create({
          key: avatarActAnimKey(key, act, dir),
          frames: Array.from({ length: a.frames }, (_, i) => ({ key, frame: start + i })),
          frameRate: a.fps,
          repeat: -1,
        });
      }
    }
  }
  return key;
}

/** 특정 상태의 첫 프레임 번호 (꽃 놓기 같은 짧은 몸짓에 쓴다) */
export function avatarFrame(state: StateName, dir: DirId, i = 0): number {
  return dir * AV_COLS + AV_ANIM[state].col + i;
}
