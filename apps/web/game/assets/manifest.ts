import * as Phaser from "phaser";
import { DIR, STATE_NAMES, type DirId, type StateName } from "@tomb/protocol";
import { AV_ANIM, AV_COLS, AV_H, AV_W, buildAvatarSheet } from "../sprites/avatar";
import * as fx from "../sprites/fx";
import { flowersCanvas, graveCanvas, graveTexKey, plotCanvas, upMarkerCanvas } from "../sprites/graves";
import * as props from "../sprites/props";
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
  chairDown: "prop-chair-down",
  chairLeft: "prop-chair-left",
  chairRight: "prop-chair-right",
  table: "prop-table",
  altar: "prop-altar",
  gate: "prop-gate",
  wallFace: "prop-wall-face",
  plot: "grave-plot",
  upMarker: "grave-up",
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
    [TEX.chairDown]: proc(() => props.chair("down")),
    [TEX.chairLeft]: proc(() => props.chair("left")),
    [TEX.chairRight]: proc(() => props.chair("right")),
    [TEX.table]: proc(props.table),
    [TEX.altar]: proc(props.altar),
    [TEX.gate]: proc(props.gate),
    [TEX.wallFace]: proc(props.wallFaceTile),
    [TEX.plot]: proc(plotCanvas),
    [TEX.upMarker]: proc(upMarkerCanvas),
  };
  for (const tier of ["woodSign", "smallStone", "largeStone", "pagoda"] as const)
    for (let v = 0; v < 3; v++) m[graveTexKey(tier, v)] = proc(() => graveCanvas(tier, v));
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

/** BootScene.create: 코드 생성 항목을 모두 만든다 */
export function installProcedural(scene: Phaser.Scene): void {
  for (const [key, src] of Object.entries(MANIFEST)) {
    if (src.kind === "procedural") addCanvasTexture(scene, key, src.build());
    else if (src.linear && scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}

// ── 아바타: 색마다 시트를 하나씩 (처음 보는 색일 때 생성) ──

const DIR_IDS: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.up];

export function avatarKey(color: string): string {
  return `avatar-${parseHex(color).toString(16).padStart(6, "0")}`;
}

export function avatarAnimKey(texKey: string, state: StateName, dir: DirId): string {
  return `${texKey}:${state}:${dir}`;
}

/** 아바타 텍스처와 애니메이션을 준비하고 텍스처 키를 돌려준다 */
export function ensureAvatarTexture(scene: Phaser.Scene, color: string): string {
  const key = avatarKey(color);
  if (!scene.textures.exists(key)) {
    addCanvasTexture(scene, key, { canvas: buildAvatarSheet(color), frameW: AV_W, frameH: AV_H });
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
    }
  }
  return key;
}

/** 특정 상태의 첫 프레임 번호 (꽃 놓기 같은 짧은 몸짓에 쓴다) */
export function avatarFrame(state: StateName, dir: DirId, i = 0): number {
  return dir * AV_COLS + AV_ANIM[state].col + i;
}
