import type * as Phaser from "phaser";
import { campRaftWalks } from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import type { Grid } from "../sprites/pixel";
import { christmasTree, giftPile, snowCap, snowman, snowRoof, woodpile } from "../sprites/winterArt";
import { padCanvas } from "./campArtPad";
import { CAMP_TEX_PREFIX } from "./campTypes";
import * as L from "./campLayout";
import * as A from "./valleyArt";
import * as A3 from "./valleyProps";
import * as A4 from "./valleyHomeArt";
import * as A6 from "./valleyExtraArt";
import { campHammockGrid } from "./campHammock";

// 11/26 폭포 계곡 그림 텍스처 (판마다 따로 굽는다 — 눈 얹은 그림은 키에 판이 들어간다). CampMap이 그릴 때 처음 쓰는 것만 굽고,
// 버스 창밖 연출 동안 campPrebake가 이 목록(forEachValleyTex)을 조금씩 미리 굽는다. 한 번 구운 "camp-" 텍스처는 지우지 않는다.

export type ValleyBuilt = { canvas: HTMLCanvasElement; frameW?: number; frameH?: number; linear?: boolean };
type Flags = { snowy: boolean; xmas: boolean };
type Build = (f: Flags) => ValleyBuilt;

const c = (g: Grid): ValleyBuilt => ({ canvas: g.toCanvas() });
/** 겨울·크리스마스 판이면 윗면에 눈 */
const sc = (f: Flags, cv: HTMLCanvasElement, maxY: number): HTMLCanvasElement => (f.snowy ? snowCap(cv, { depth: 1, maxY }) : cv);

/** 판에 따라 달라지는 그림인지 (키에 판을 붙인다) — 나머지는 한 장 */
const BUILDS: Record<string, { build: Build; by: "none" | "snow" | "xmas" }> = {
  cliff: { by: "snow", build: (f) => c(A.cliffArt(f.snowy)) },
  falls: {
    by: "snow",
    build: (f) => {
      const s = A.fallsSheet(f.snowy);
      return { canvas: s.grid.toCanvas(), frameW: s.frameW, frameH: s.frameH };
    },
  },
  foamPlunge: { by: "none", build: () => sheet(A.foamSheet(136, 36, 3, 1.25)) },
  foamLedge: { by: "none", build: () => sheet(A.foamSheet(64, 14, 7, 1.3)) },
  foamSmall: { by: "none", build: () => sheet(A.foamSheet(18, 8, 11, 1)) },
  drop: { by: "none", build: () => c(A.dropArt()) },
  ripple: { by: "none", build: () => c(A.rippleArt()) },
  rainbow: { by: "none", build: () => ({ canvas: A.rainbowArt().toCanvas(), linear: true }) },
  vbridge: { by: "snow", build: (f) => c(f.snowy ? A.snowDust(A.viewBridgeArt(), 0.36, 5) : A.viewBridgeArt()) },
  shrub0: { by: "snow", build: (f) => c(A.ledgeShrubArt(0, f.snowy)) },
  shrub1: { by: "snow", build: (f) => c(A.ledgeShrubArt(1, f.snowy)) },
  saleStand: { by: "snow", build: (f) => ({ canvas: sc(f, A.saleStandArt().toCanvas(), 20) }) },
  lamp: { by: "snow", build: (f) => ({ canvas: sc(f, A.lampPostArt().toCanvas(), 20) }) },
  scree1: { by: "snow", build: (f) => c(A6.screeArt(1, f.snowy, !f.snowy)) },
  scree2: { by: "snow", build: (f) => c(A6.screeArt(2, f.snowy, !f.snowy)) },
  woodpile: { by: "none", build: () => ({ canvas: woodpile() }) },
  snowman0: { by: "none", build: () => ({ canvas: snowman(0) }) },
  snowman1: { by: "none", build: () => ({ canvas: snowman(1) }) },
  snowman2: { by: "none", build: () => ({ canvas: snowman(2) }) },
  gifts0: { by: "none", build: () => ({ canvas: giftPile(0) }) },
  gifts1: { by: "none", build: () => ({ canvas: giftPile(1) }) },
  penStand: { by: "snow", build: (f) => ({ canvas: sc(f, A3.pensionStandArt().toCanvas(), 20) }) },
  slide: { by: "xmas", build: (f) => c(f.snowy ? A3.sledHillArt(f.xmas) : A3.waterSlideArt()) },
  sledRide: { by: "none", build: () => c(A3.sledRideArt()) },
  trampB: { by: "none", build: () => c(A4.bigTrampolineArt().back) },
  trampF: { by: "snow", build: (f) => ({ canvas: sc(f, A4.bigTrampolineArt().front.toCanvas(), 999) }) },
  lawn: { by: "none", build: () => c(A6.lawnArt(L.PGARDEN.x1 - L.PGARDEN.x0, L.PGARDEN.y1 - L.PGARDEN.y0)) },
  firewood: { by: "snow", build: (f) => ({ canvas: sc(f, A3.firewoodArt().toCanvas(), 14) }) },
  swing: { by: "snow", build: (f) => ({ canvas: sc(f, A4.swingBenchArt().toCanvas(), 999) }) },
  // 11/26 해먹 (누울 수 있는 해먹 — 마을 해먹과 같은 48×30 칸, 캠핑장 천 무늬). 누가 누우면 기둥만
  hammockSun: { by: "snow", build: (f) => ({ canvas: sc(f, campHammockGrid("campSun").toCanvas(), 12) }) },
  hammockMint: { by: "snow", build: (f) => ({ canvas: sc(f, campHammockGrid("campMint").toCanvas(), 12) }) },
  hammockPosts: { by: "snow", build: (f) => ({ canvas: sc(f, campHammockGrid(null).toCanvas(), 8) }) },
  planter30: { by: "snow", build: (f) => ({ canvas: sc(f, A4.planterArt(30).toCanvas(), 999) }) },
  planter22: { by: "snow", build: (f) => ({ canvas: sc(f, A4.planterArt(22).toCanvas(), 999) }) },
  penSign: { by: "snow", build: (f) => ({ canvas: sc(f, A6.penSignArt().toCanvas(), 999) }) },
  lightArch: { by: "xmas", build: (f) => ({ canvas: sc(f, A6.lightArchArt(34, f.xmas).grid.toCanvas(), 16) }) },
  gLamp: { by: "snow", build: (f) => ({ canvas: sc(f, A6.gardenLampArt().toCanvas(), 999) }) },
  step0: { by: "none", build: () => c(A6.stepStoneArt(0)) },
  step1: { by: "none", build: () => c(A6.stepStoneArt(1)) },
  bike: { by: "snow", build: (f) => ({ canvas: sc(f, A6.bikeArt().toCanvas(), 999) }) },
  car: { by: "snow", build: (f) => ({ canvas: sc(f, A6.carArt(0x5a8ac0).toCanvas(), 999) }) },
  footbath: {
    by: "xmas",
    build: (f) => {
      const cv = A6.footBathArt(f.xmas).grid.toCanvas();
      return { canvas: f.snowy ? snowCap(cv, { depth: 1, maxY: A6.FOOTBATH.h - 6 }) : cv };
    },
  },
  steamCol0: { by: "none", build: () => ({ canvas: A6.steamColumnCanvas(0), linear: true }) },
  steamCol1: { by: "none", build: () => ({ canvas: A6.steamColumnCanvas(1.7), linear: true }) },
  steamCol2: { by: "none", build: () => ({ canvas: A6.steamColumnCanvas(3.4), linear: true }) },
  wpier: { by: "snow", build: (f) => c(f.snowy ? A.snowDust(A4.widePierArt(L.PIER.x1 - L.PIER.x0), 0.28, 9) : A4.widePierArt(L.PIER.x1 - L.PIER.x0)) },
  rowdock: { by: "snow", build: (f) => c(f.snowy ? A.snowDust(A6.rowDockArt(L.ROW_DOCK.len), 0.3, 13) : A6.rowDockArt(L.ROW_DOCK.len)) },
  boatSign: { by: "snow", build: (f) => ({ canvas: sc(f, A6.boatSignArt().toCanvas(), 14) }) },
  buoys: { by: "none", build: () => c(A6.buoyLineArt(L.BUOY_LINE.x1 - L.BUOY_LINE.x0)) },
  fishRock: { by: "snow", build: (f) => ({ canvas: sc(f, A6.fishRockArt(0).toCanvas(), 18) }) },
  swimSign: { by: "snow", build: (f) => ({ canvas: sc(f, A4.swimSignArt().toCanvas(), 14) }) },
  iceHole: { by: "none", build: () => c(A3.iceHoleArt()) },
  bankSeat: { by: "snow", build: (f) => ({ canvas: sc(f, A4.bankSeatArt().toCanvas(), 999) }) },
  snack: { by: "snow", build: (f) => ({ canvas: sc(f, A3.snackCartArt().toCanvas(), 14) }) },
  xtree: { by: "none", build: () => ({ canvas: christmasTree().canvas }) },
  sooni: { by: "snow", build: (f) => c(A6.sooniArt(f.snowy)) },
  ...Object.fromEntries(
    L.RAFTS.map((r) => [
      `raft${r.n}`,
      {
        by: "xmas" as const,
        build: (f: Flags): ValleyBuilt => {
          // 11/26 번호판 · 잔교에 붙은 좌대는 판자 다리 (protocol campRaftWalks — 걷는 칸과 같은 자리)
          const art = A6.raft4Art(r.roof, f.xmas, r.link ? "left" : "front", { n: r.n, walks: campRaftWalks(r).map((w) => w.x - r.x + 36), snowy: f.snowy });
          return { canvas: f.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 181 + r.n }) : art.grid.toCanvas() };
        },
      },
    ]),
  ),
  // 11/26 촌캉스 터 흙마당은 집 화면 담당(campHousingPlan)이 앞마당 단계에 맞춰 그린다
};

/**
 * 11/26 운영자 「펜션 앞 화단 양옆이 잘려 있다」: 바닥 가운데 원점(0.5, 1)으로 세우는 맵 소품은 다 구운 뒤 둘레에 빈 칸을 두른다
 * (좌우 1·위 2 — 끝 열·줄에 닿은 칠은 윤곽으로 닫힌다. 자리는 그대로). 땅에 닿는 줄까지 칠한 기둥·다리 그림은 아래도 1 (1px 올라간다).
 * 위 왼쪽 원점으로 까는 판(절벽·다리·잔교·선착장·잔디·미끄럼틀)·시트·좌대는 빼고 (campSpriteEdge.test가 본다)
 */
const PAD_BOTTOM = new Set(["bike", "gLamp", "lightArch", "penSign", "scree1", "scree2", "woodpile"]);
const PADDED = new Set([
  "saleStand", "lamp", "scree1", "scree2", "shrub0", "shrub1", "woodpile", "snowman0", "snowman1", "snowman2", "gifts0", "gifts1", "penStand", "sledRide", "trampB", "trampF",
  "firewood", "swing", "hammockSun", "hammockMint", "hammockPosts", "planter30", "planter22", "penSign", "lightArch", "gLamp", "bike", "car", "footbath", "boatSign", "fishRock",
  "swimSign", "bankSeat", "snack", "xtree", "sooni",
]);
/**
 * 11/26 물 건너 좌대(4~6)는 눈판에서 지붕 위 눈이 캔버스 윗줄에 닿아 잘렸다 → 텍스처 위에만 빈 칸 (CampMap 오두막 crop은 RAFT_TOP_PAD만큼 내린다).
 * 잔교에 붙은 좌대(1~3)는 윗줄이 잔교로 이어지는 판자 다리라 그대로 (그림 좌표·CAMP_RAFT_ART_H는 그대로 — 텍스처만)
 */
export const RAFT_TOP_PAD = 2;
const RAFT_PADDED = new Set(L.RAFTS.filter((r) => !r.link).map((r) => `raft${r.n}`));
function built(name: string, f: Flags): ValleyBuilt {
  const out = BUILDS[name].build(f);
  if (RAFT_PADDED.has(name)) return { ...out, canvas: padCanvas(out.canvas, { x: 0, top: RAFT_TOP_PAD }) };
  return PADDED.has(name) ? { ...out, canvas: padCanvas(out.canvas, { bottom: PAD_BOTTOM.has(name) ? 1 : 0 }) } : out;
}

function sheet(s: { grid: Grid; frameW: number; frameH: number }): ValleyBuilt {
  return { canvas: s.grid.toCanvas(), frameW: s.frameW, frameH: s.frameH };
}

const flagsOf = (concept: MapConcept): Flags => ({ snowy: isSnowy(concept), xmas: concept === "christmas" });

/** 이 판에서 그 그림의 텍스처 키 */
export function valleyKey(name: string, concept: MapConcept): string {
  const b = BUILDS[name];
  if (!b) throw new Error(`valley tex ${name}`);
  const f = flagsOf(concept);
  const tag = b.by === "none" ? "" : b.by === "snow" ? (f.snowy ? "-s" : "") : f.xmas ? "-x" : f.snowy ? "-s" : "";
  return `${CAMP_TEX_PREFIX}v-${name}${tag}`;
}

/** 그 그림 텍스처 (없으면 지금 굽는다) */
export function valleyTex(scene: Phaser.Scene, name: string, concept: MapConcept): string {
  const key = valleyKey(name, concept);
  if (!scene.textures.exists(key)) {
    const out = built(name, flagsOf(concept));
    addCanvasTexture(scene, key, { canvas: out.canvas, frameW: out.frameW, frameH: out.frameH, linear: out.linear });
  }
  return key;
}

/** 미리 굽기 목록 (그 판에서 쓰는 그림 전부 — 무거운 절벽·물줄기부터) */
export function forEachValleyTex(concept: MapConcept, each: (key: string, build: () => ValleyBuilt) => void): void {
  const f = flagsOf(concept);
  for (const name of Object.keys(BUILDS)) {
    if (name === "lawn" && f.snowy) continue;
    if ((name === "iceHole" || name.startsWith("snowman") || name === "woodpile" || name === "sledRide") && !f.snowy) continue;
    if ((name === "xtree" || name.startsWith("gifts")) && !f.xmas) continue;
    each(valleyKey(name, concept), () => built(name, f));
  }
}
