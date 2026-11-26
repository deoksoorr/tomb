import { BBQ_MENU, CAMP_LOTS, CAMP_RAFTS, CARAVAN_AWNING_COUNT, CARAVAN_COLOR_COUNT, CARAVAN_MODELS, type CampYard, type CaravanDesign } from "@tomb/protocol";
import { describe, expect, it, vi } from "vitest";
import type { Grid } from "../sprites/pixel";
import { snowRoof } from "../sprites/winterArt";
import * as Art from "./campArt";
import * as A from "./campHomeArt";
import { campHomePlan, type HomePlan } from "./campHousingPlan";

// 겨울·크리스마스 판 그림(campSkin)은 장면 텍스처에 굽는다 → 가짜 장면(textures.add)이 있으면 거기 담는다
vi.mock("../assets/manifest", () => ({
  addCanvasTexture: (scene: { textures?: { add?: (key: string, canvas: unknown) => void } } | undefined, key: string, o: { canvas: unknown }) => scene?.textures?.add?.(key, o.canvas),
}));
vi.mock("phaser", () => ({ default: {}, BlendModes: {} }));

/**
 * 11/26 운영자 「곁채 지붕이 잘린다」·「펜션 앞 화단 양옆이 잘려 있다」·「카라반 왼쪽 견인고리 쪽 픽셀이 잘려 있다」.
 * 그림 끝 열·줄까지 칠하면 윤곽(테)이 캔버스 밖으로 나가 잘린 면이 보인다 (game/sprites/petEdge.test와 같은 생각).
 * 캠핑장 집·앞마당 소품(모든 터 × 단계 × 빈 터·넓힌 집 × 겨울·크리스마스 × 낮·밤 — 실제로 맵에 올리는 그림 그대로, 눈 얹은 것까지),
 * 카라반 모델 3 × 몸통 색 × 차양 색 × 단계 3 × 크리스마스 × 눈, 맵 소품(campValleyTex 전부)을 칠해 보고
 * 왼쪽·오른쪽 끝 열·맨 윗줄·맨 아랫줄에 「윤곽이 아닌 불투명 픽셀」이 2칸 넘게 이어지면 잘린 것으로 본다.
 *  - 윤곽 = 어두운 픽셀 (밝기 < 70 — 그림 윤곽 0x2c2018) · 눈 윤곽(0x55606c). 그림자(반투명 alpha < 128)는 보지 않는다
 *  - 한 칸 끝점(러그 술·전구 하나)은 두고, 2칸 이상 이어진 면만 잘림
 *  - 위에서 본 바닥판(흙마당·러그·데크 바닥·발매트·디딤돌·잔교·물결 시트처럼 땅에 깔리는 것)은 판 끝이 곧 테라 제외 (FLAT)
 */

// ── 테스트용 캔버스 (campHomePath.test와 같은 가짜 — 픽셀만 담는다) ──
type Img = { width: number; height: number; data: Uint8ClampedArray };
type FakeCanvas = { width: number; height: number; px: () => Uint8ClampedArray; getContext: () => unknown };
function installFakeCanvas(): void {
  const make = (): FakeCanvas => {
    let buf: Uint8ClampedArray | null = null;
    let bw = 0;
    let bh = 0;
    const c: FakeCanvas = {
      width: 0,
      height: 0,
      px: () => {
        if (!buf || bw !== c.width || bh !== c.height) {
          buf = new Uint8ClampedArray(c.width * c.height * 4);
          bw = c.width;
          bh = c.height;
        }
        return buf;
      },
      getContext: () => ctx,
    };
    const put = (img: Img, dx: number, dy: number, over: boolean) => {
      const d = c.px();
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= c.width || ty >= c.height) continue;
          const s = (y * img.width + x) * 4;
          if (over && img.data[s + 3] === 0) continue;
          const t = (ty * c.width + tx) * 4;
          for (let k = 0; k < 4; k++) d[t + k] = img.data[s + k];
        }
    };
    const real: Record<string, unknown> = {
      createImageData: (w: number, h: number): Img => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img: Img, x: number, y: number) => put(img, x | 0, y | 0, false),
      getImageData: (x: number, y: number, w: number, h: number): Img => {
        const d = c.px();
        const out = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++) {
            const sx = i + x;
            const sy = j + y;
            if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
            for (let k = 0; k < 4; k++) out[(j * w + i) * 4 + k] = d[(sy * c.width + sx) * 4 + k];
          }
        return { width: w, height: h, data: out };
      },
      drawImage: (src: FakeCanvas, x = 0, y = 0) => {
        if (src && typeof src.px === "function") put({ width: src.width, height: src.height, data: src.px() }, Math.round(x), Math.round(y), true);
      },
    };
    const noop = () => undefined;
    const ctx: unknown = new Proxy(real, {
      get: (t, k: string) => (k in t ? t[k] : k === "canvas" ? c : noop),
      set: () => true,
    });
    return c;
  };
  (globalThis as { document?: unknown }).document = { createElement: () => make() };
}
installFakeCanvas();
// campSkin이 원본 텍스처가 캔버스인지 instanceof로 본다 (node에는 없다 — 가짜 캔버스면 캔버스)
(globalThis as Record<string, unknown>).HTMLCanvasElement ??= { [Symbol.hasInstance]: (o: unknown) => !!o && typeof (o as FakeCanvas).px === "function" };

/** 칠한 판 (RGBA — 캔버스·Grid 공용) */
type Pix = { w: number; h: number; rgba: (x: number, y: number) => [number, number, number, number] };
const fromCanvas = (cv: HTMLCanvasElement): Pix => {
  const c = cv as unknown as FakeCanvas;
  const d = c.px();
  return { w: c.width, h: c.height, rgba: (x, y) => [d[(y * c.width + x) * 4], d[(y * c.width + x) * 4 + 1], d[(y * c.width + x) * 4 + 2], d[(y * c.width + x) * 4 + 3]] };
};
const fromGrid = (g: Grid): Pix => ({
  w: g.w,
  h: g.h,
  rgba: (x, y) => {
    const v = g.get(x, y);
    return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  },
});

/** 윤곽 색 (캠핑장 그림 윤곽 0x2c2018 · 눈 윤곽 winterArt SNOW_EDGE · 몇몇 그림의 따로 쓴 윤곽) — 이보다 어두운 픽셀도 윤곽으로 본다 */
const OUTLINES = new Set([0x2c2018, 0x55606c, 0x1e2430, 0x5a3018, 0x5a5650]);
/**
 * 끝 열·줄에 닿은 칸 수 (가장 길게 이어진). 왼쪽·오른쪽·윗줄은 불투명 픽셀이면 윤곽이라도 닿은 것 —
 * 맵 확대가 소수 배율이면 텍스처 끝 열이 반 칸만 그려지거나 빠져 윤곽이 잘려 보인다 (운영자 「견인고리 쪽 픽셀이 잘려 있다」).
 * 아랫줄은 땅에 닿는 줄이라 윤곽·그림자는 두고, 윤곽 아닌 칠(다리·바닥이 잘린 것)만 본다
 */
export function edgeRuns(p: Pix, frameW = p.w, tile = false): { left: number; right: number; top: number; bottom: number } {
  const solid = (x: number, y: number) => (tile ? open(x, y) : p.rgba(x, y)[3] >= 128);
  const open = (x: number, y: number) => {
    const [r, g, b, a] = p.rgba(x, y);
    if (a < 128) return false;
    return !OUTLINES.has((r << 16) | (g << 8) | b) && 0.3 * r + 0.59 * g + 0.11 * b >= 40;
  };
  const run = (pts: [number, number][], hit: (x: number, y: number) => boolean) => {
    let best = 0;
    let cur = 0;
    for (const [x, y] of pts) {
      cur = hit(x, y) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  for (let f = 0; f * frameW < p.w; f++) {
    const x0 = f * frameW;
    const col = (x: number) => Array.from({ length: p.h }, (_, y) => [x, y] as [number, number]);
    const row = (y: number) => Array.from({ length: frameW }, (_, x) => [x0 + x, y] as [number, number]);
    out.left = Math.max(out.left, run(col(x0), solid));
    out.right = Math.max(out.right, run(col(x0 + frameW - 1), solid));
    out.top = Math.max(out.top, run(row(0), solid));
    out.bottom = Math.max(out.bottom, run(row(p.h - 1), open));
  }
  return out;
}
const bad = (r: ReturnType<typeof edgeRuns>, min = 1) => r.left >= min || r.right >= min || r.top >= min || r.bottom >= min;
const fmt = (r: ReturnType<typeof edgeRuns>) => `L${r.left} R${r.right} T${r.top} B${r.bottom}`;

/** 땅에 까는 판 (끝이 곧 판 테두리 — 잘림 검사에서 뺀다) */
const FLAT = /chome-(yard|terrace|lowDeck|doormat|step|rug|patioRug|plotRope|brushF)/;
/** 이어 붙이는 조각 (돌담 가로·세로 · 통유리 난간 — 크기·원점이 자리라 빈 칸을 못 두른다): 끝 열·줄은 윤곽으로 닫혀 있어야 한다 (윤곽 아닌 칠 금지) */
const TILE = /chome-(dolH|dolV|glassRail)-/;

const T = Art.CAMP_TEX;
const CAMP_GRID: Record<string, () => Grid> = {
  [T.logChair]: Art.logChairArt,
  [T.brazier]: Art.brazierArt,
  [T.foldTable]: Art.foldTableArt,
  [T.picnicV]: Art.picnicTableVArt,
  [T.benchV]: Art.picnicBenchVArt,
  [T.campChairFront(0)]: () => Art.campChairFrontArt(0),
  [T.campChairFront(1)]: () => Art.campChairFrontArt(1),
  [T.campChairFront(2)]: () => Art.campChairFrontArt(2),
  [T.lantern]: Art.lanternArt,
  [T.pole]: Art.poleArt,
  [T.pebbles(0)]: () => Art.pebblesArt(0),
  [T.pebbles(1)]: () => Art.pebblesArt(1),
  [T.pebbles(2)]: () => Art.pebblesArt(2),
};

function plans(): { name: string; plan: HomePlan }[] {
  const out: { name: string; plan: HomePlan }[] = [];
  for (const l of CAMP_LOTS)
    for (const owned of [true, false])
      for (const yard of [1, 2, 3] as CampYard[])
        for (const wide of [false, true])
          for (const look of ["default", "snow", "xmas"] as const)
            for (const night of [false, true])
              for (const model of l.kind === "caravan" ? CARAVAN_MODELS : [undefined]) {
                if (!owned && (l.kind === "caravan" || yard > 1 || wide)) continue;
                const design = model ? { model, color: (l.lot + yard) % CARAVAN_COLOR_COUNT, awning: l.lot % CARAVAN_AWNING_COUNT } : undefined;
                const plan = campHomePlan(l, { owned, yard, wide, snowy: look !== "default", xmas: look === "xmas", night, design, fire: night });
                out.push({ name: `${l.lot}번 ${owned ? `${yard}단계` : "빈 터"}${wide ? " 넓힘" : ""} ${look}${night ? " 밤" : ""}${model ? ` ${model}` : ""}`, plan });
              }
  return out;
}

describe("11/26 캠핑장 그림이 캔버스 끝에서 잘리지 않아요", () => {
  it("집·앞마당 소품 (모든 터 × 단계 × 빈 터·넓힌 집 × 기본·겨울·크리스마스 × 낮·밤 — 맵에 올리는 그림 그대로)", () => {
    const seen = new Map<string, string>();
    for (const { name, plan } of plans())
      for (const q of plan.props) {
        if (FLAT.test(q.key) || seen.has(q.key)) continue;
        let p: Pix | null = null;
        if (q.make) p = fromCanvas(q.make());
        else if (CAMP_GRID[q.key]) p = fromGrid(CAMP_GRID[q.key]());
        expect(p, `${name} — 그림을 모르는 소품 ${q.key}`).not.toBeNull();
        const r = edgeRuns(p!, undefined, TILE.test(q.key));
        // 이어 붙이는 조각은 끝을 윤곽으로 닫았다 — 눈판에서 윤곽 꼭대기 한 칸이 눈이 되는 것(모든 모서리와 같다)까지는 둔다
        seen.set(q.key, bad(r, TILE.test(q.key) ? 2 : 1) ? `${q.key} (${name}) ${fmt(r)}` : "");
      }
    expect(seen.size).toBeGreaterThan(150);
    expect([...seen.values()].filter(Boolean)).toEqual([]);
  });

  it("카라반 모델 3 × 몸통 색 × 차양 색 × 단계 3 × 기본·크리스마스 × 눈 (좌우 뒤집은 그림은 같은 끝을 본다)", () => {
    const fails: string[] = [];
    let n = 0;
    for (const model of CARAVAN_MODELS)
      for (let color = 0; color < CARAVAN_COLOR_COUNT; color++)
        for (let awning = 0; awning < CARAVAN_AWNING_COUNT; awning++)
          for (const stage of [1, 2, 3] as CampYard[])
            for (const xmas of [false, true])
              for (const snowy of [false, true]) {
                const d: CaravanDesign = { model, color, awning };
                const art = A.caravanDesignArt(d, stage, { xmas });
                const cv = snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 149 + color, icicles: false }) : art.grid.toCanvas();
                const r = edgeRuns(fromCanvas(cv));
                n++;
                if (bad(r)) fails.push(`${model} 색${color} 차양${awning} ${stage}단계${xmas ? " 크리스마스" : ""}${snowy ? " 눈" : ""} ${fmt(r)}`);
              }
    expect(n).toBe(CARAVAN_MODELS.length * CARAVAN_COLOR_COUNT * CARAVAN_AWNING_COUNT * 3 * 4);
    expect(fails).toEqual([]);
  });

  it("맵 소품 (campValleyTex — 기본·겨울·크리스마스 판 전부, 바닥에 까는 판 제외)", async () => {
    const { forEachValleyTex } = await import("./campValleyTex");
    // 물결·물보라·빛 (흐릿한 효과 시트) · 땅에 까는 판(잔디·잔교·선착장·디딤돌·부표 줄·얼음 구멍·폭포·절벽 — 끝이 맵 다른 그림과 이어진다)
    const SKIP = /-v-(cliff|falls|foam|drop|ripple|rainbow|lawn|step|wpier|rowdock|buoys|iceHole|vbridge)/;
    // 좌대: 아랫줄은 물에 잠기는 받침·사다리 (일부러 끝까지) · 잔교에 붙은 좌대(1~3)의 윗줄은 잔교로 이어지는 판자 다리
    const LINKED = new Set(CAMP_RAFTS.filter((r) => r.link).map((r) => `raft${r.n}`));
    const fails: string[] = [];
    const seen = new Set<string>();
    for (const concept of ["default", "christmas", "winter"] as const)
      forEachValleyTex(concept as never, (key, build) => {
        if (seen.has(key) || SKIP.test(key)) return;
        seen.add(key);
        const out = build();
        const r = edgeRuns(fromCanvas(out.canvas), out.frameW);
        const raft = /-v-(raft\d)/.exec(key)?.[1];
        if (raft) {
          r.bottom = 0;
          if (LINKED.has(raft)) r.top = 0;
        }
        if (bad(r)) fails.push(`${key} ${fmt(r)}`);
      });
    expect(seen.size).toBeGreaterThan(40);
    expect(fails).toEqual([]);
  });

  /**
   * 11/26 운영자 「캠핑장 나무도 도트 잘린 게 중간중간 있다」(크리스마스판 밤 앙상한 나무 꼭대기가 평평하게 잘림).
   * 숲 그림(나무 6종 × 2 · 덤불 · 바위 · 낙엽 · 버섯 · 고사리 · 자갈) · 벤치 · 게시판 · 정류장 표지 · 시간표 · 조명 기둥을
   * 기본판 그대로, 겨울·크리스마스판은 맵이 쓰는 campSkin 그대로(침엽수 눈 · 단풍 → 앙상한 나무 · 낙엽·버섯 → 눈 더미) 굽고, 눈더미(눈사람 재료)까지 본다.
   * 땅에 까는 것(낙엽 무더기 · 겨울 눈 더미)은 아랫줄이 곧 땅이라 아랫줄만 뺀다
   */
  it("숲 그림 · 벤치 · 팻말 (기본 + 겨울·크리스마스 판 눈 얹은 그림 · 앙상한 나무 · 눈더미)", async () => {
    const { campSkin } = await import("./CampConceptDecor");
    const { bareTree } = await import("../sprites/winterArt");
    const { snowPileArt, SNOW_PILE_VARIANTS } = await import("./snowmanArt");
    const T = Art.CAMP_TEX;
    const bases: [string, () => Grid][] = [];
    for (let v = 0; v < 2; v++)
      bases.push(
        [T.spruce(v), () => Art.spruceArt(v)],
        [T.pine(v), () => Art.pineArt(v)],
        [T.fir(v), () => Art.firArt(v)],
        [T.maple(v), () => Art.mapleArt(v)],
        [T.mapleO(v), () => Art.mapleOArt(v)],
        [T.yellow(v), () => Art.yellowArt(v)],
        [T.bush(v), () => Art.bushArt(v)],
        [T.boulder(v), () => Art.boulderArt(v)],
      );
    for (let v = 0; v < 3; v++)
      bases.push([T.leafPile(v), () => Art.leafPileArt(v)], [T.mushroom(v), () => Art.mushroomArt(v)], [T.fern(v), () => Art.fernArt(v)], [T.pebbles(v), () => Art.pebblesArt(v)]);
    bases.push([T.logChair, Art.logChairArt], [T.bench, Art.benchArt], [T.rustyBench, Art.rustyBenchArt], [T.board, Art.boardArt], [T.busSign, Art.busSignArt], [T.timetable, Art.timetableArt], [T.pole, Art.poleArt]);
    // 11/26 관리소 · 정류장 · 자판기(+밤 불빛) · 널빤지 벤치 · 모닥불 돌 고리 · 바베큐 그릴·탁자 · 먹을 때 뜨는 접시 (예외 없이 같은 검사)
    bases.push(
      [T.office, Art.officeArt],
      [T.shelter, Art.shelterArt],
      [T.vending, Art.vendingArt],
      [T.vendingLit, Art.vendingLitArt],
      [T.plankBench2, () => Art.plankBenchArt(2)],
      [T.plankBench3, () => Art.plankBenchArt(3)],
      [T.fireRing, Art.fireRingArt],
      [T.bbqGrill, Art.bbqGrillArt],
      [T.bbqTable, Art.bbqTableArt],
      ...BBQ_MENU.map((m) => [T.bbqPlate(m.id), () => Art.bbqPlateArt(m.id)] as [string, () => Grid]),
    );
    const store = new Map<string, unknown>();
    const scene = {
      textures: {
        exists: (k: string) => store.has(k),
        get: (k: string) => ({ getSourceImage: () => store.get(k) }),
        add: (k: string, c: unknown) => void store.set(k, c),
      },
    };
    /** 땅에 까는 것 (아랫줄 = 땅) */
    const GROUND = /(leafPile\d|w~mushroom\d)$/;
    const fails: string[] = [];
    const sizes = new Map<string, string>();
    const check = (key: string, p: Pix) => {
      const r = edgeRuns(p);
      if (GROUND.test(key)) r.bottom = 0;
      if (bad(r)) fails.push(`${key} ${p.w}×${p.h} ${fmt(r)}`);
    };
    for (const [key, build] of bases) {
      const g = build();
      store.set(key, g.toCanvas());
      check(key, fromGrid(g));
    }
    for (const concept of ["winter", "christmas"] as const)
      for (const [base] of bases) {
        const key = campSkin(scene as never, base, concept);
        if (key === base) continue;
        const cv = store.get(key) as HTMLCanvasElement;
        // 같은 키를 두 판이 나눠 쓰면 같은 크기여야 한다 (크기가 다른 그림이 한 키에 섞이면 먼저 구운 것이 남는다)
        const size = `${cv.width}×${cv.height}`;
        expect(sizes.get(key) ?? size, `${key} 크기`).toBe(size);
        sizes.set(key, size);
        check(`${concept} ${key}`, fromCanvas(cv));
      }
    for (let k = 0; k < 3; k++) check(`bareTree${k}`, fromCanvas(bareTree(k)));
    for (let v = 0; v < SNOW_PILE_VARIANTS * 2; v++) check(`snowPile${v}`, fromGrid(snowPileArt(v)));
    expect(sizes.size).toBeGreaterThan(30);
    expect(fails).toEqual([]);
  });

  it("맵 소품 텍스처 키 하나에 한 그림 (판마다 다시 구워도 같은 키면 같은 크기·같은 픽셀)", async () => {
    const { forEachValleyTex } = await import("./campValleyTex");
    const first = new Map<string, { w: number; h: number; sum: number; from: string }>();
    const fails: string[] = [];
    for (const concept of ["default", "christmas", "winter"] as const)
      forEachValleyTex(concept as never, (key, build) => {
        const c = build().canvas as unknown as FakeCanvas;
        const d = c.px();
        let sum = 0;
        for (let i = 0; i < d.length; i++) sum = (sum * 31 + d[i]) >>> 0;
        const f = first.get(key);
        if (!f) first.set(key, { w: c.width, h: c.height, sum, from: concept });
        else if (f.w !== c.width || f.h !== c.height || f.sum !== sum) fails.push(`${key}: ${f.from} ${f.w}×${f.h} ≠ ${concept} ${c.width}×${c.height}`);
      });
    expect(first.size).toBeGreaterThan(40);
    expect(fails).toEqual([]);
  });

  /**
   * 11/26 여백을 두른 그림은 (1) 원래 그림 픽셀이 여백만큼 옮겨진 그대로이고 (새로 생긴 건 끝을 닫는 윤곽뿐),
   * (2) 좌우 같은 폭·아래 0이라 원점 바닥 가운데로 세우면 맵 자리가 픽셀 그대로, (3) 그림 안 좌표(자르기·겹치는 그림·앞줄)도 같이 옮겨졌다
   */
  describe("여백 둔 그림이 예전 자리 그대로예요", () => {
    const same = (name: string, base: Grid, padded: Grid, pad: { x: number; top: number; bottom: number }) => {
      expect(pad.bottom, `${name} 아래 여백`).toBe(0);
      expect(padded.w, `${name} 폭`).toBe(base.w + pad.x * 2);
      expect(padded.h, `${name} 높이`).toBe(base.h + pad.top);
      const diff: string[] = [];
      for (let y = 0; y < padded.h; y++)
        for (let x = 0; x < padded.w; x++) {
          const bx = x - pad.x;
          const by = y - pad.top;
          const v = padded.get(x, y);
          if (bx >= 0 && by >= 0 && bx < base.w && by < base.h) {
            if (v !== base.get(bx, by)) diff.push(`${x},${y}`);
          } else if (v & 255 && v >>> 8 !== 0x2c2018) diff.push(`여백 ${x},${y}`);
        }
      expect(diff.slice(0, 5), `${name} 바뀐 픽셀`).toEqual([]);
      // 원점(0.5, 1)으로 x·y에 세우면 원래 그림 왼쪽 위 칸이 놓이는 맵 자리
      const at = (w: number, h: number, ox: number, oy: number) => [100 - w / 2 + ox, 200 - h + oy];
      expect(at(padded.w, padded.h, pad.x, pad.top), `${name} 맵 자리`).toEqual(at(base.w, base.h, 0, 0));
    };
    it("관리소 · 정류장 · 자판기·밤 불빛 · 널빤지 벤치 · 그릴 · 접시", () => {
      same("관리소", Art.officeBaseArt(), Art.officeArt(), Art.OFFICE_PAD);
      same("정류장", Art.shelterBaseArt(), Art.shelterArt(), Art.SHELTER_PAD);
      same("자판기", Art.vendingBaseArt(), Art.vendingArt(), Art.VENDING_PAD);
      same("자판기 불빛", Art.vendingLitBaseArt(), Art.vendingLitArt(), Art.VENDING_PAD);
      for (const n of [2, 3] as const) same(`널빤지 벤치 ${n}`, Art.plankBenchBaseArt(n), Art.plankBenchArt(n), Art.PLANK_PAD);
      same("그릴", Art.bbqGrillBaseArt(), Art.bbqGrillArt(), Art.GRILL_PAD);
      for (const m of BBQ_MENU) same(`접시 ${m.id}`, Art.bbqPlateIconArt(m.id), Art.bbqPlateArt(m.id), Art.PLATE_PAD);
    });
    it("정류장 앞 조각(SHELTER_FRONT)은 예전 조각과 같은 픽셀 (지붕 조각은 양옆 닫은 윤곽 열까지)", () => {
      const base = Art.shelterBaseArt();
      const g = Art.shelterArt();
      const P = Art.SHELTER_PAD;
      expect(Art.SHELTER_FRONT.length).toBe(Art.SHELTER_FRONT_BASE.length);
      Art.SHELTER_FRONT_BASE.forEach(([x0, y0, w, h], i) => {
        const [nx, ny, nw, nh] = Art.SHELTER_FRONT[i];
        expect(ny).toBe(y0 + P.top);
        expect(nh).toBe(h);
        // 예전 조각 픽셀은 새 조각 안 같은 자리(여백만큼 옮긴)에 그대로
        for (let y = y0; y < y0 + h; y++)
          for (let x = x0; x < x0 + w; x++) {
            expect(nx <= x + P.x && x + P.x < nx + nw).toBe(true);
            expect(g.get(x + P.x, y + P.top), `${i} ${x},${y}`).toBe(base.get(x, y));
          }
        // 새로 더 들어온 칸은 지붕 끝을 닫은 윤곽뿐
        for (let y = ny; y < ny + nh; y++)
          for (let x = nx; x < nx + nw; x++) {
            const bx = x - P.x;
            if (bx >= x0 && bx < x0 + w) continue;
            const v = g.get(x, y);
            if (v & 255) expect(v >>> 8, `${i} ${x},${y}`).toBe(0x2c2018);
          }
      });
    });
    it("널빤지 벤치 앞줄(CampMap PLANK_UP_FRONT_ROW = 4)은 위 여백이 없어 그대로 · 자판기 밤 불빛은 자판기와 같은 크기", () => {
      expect(Art.PLANK_PAD.top).toBe(0);
      const v = Art.vendingArt();
      const l = Art.vendingLitArt();
      expect([l.w, l.h]).toEqual([v.w, v.h]);
    });
    it("크리스마스 관리소 문 리스·차양 장식, 자판기 리스는 여백만큼 옮겨 단다 (그린 그림 기준 자리 그대로)", async () => {
      const { campSkin } = await import("./CampConceptDecor");
      const store = new Map<string, unknown>();
      const scene = { textures: { exists: (k: string) => store.has(k), get: (k: string) => ({ getSourceImage: () => store.get(k) }), add: (k: string, c: unknown) => void store.set(k, c) } };
      const T = Art.CAMP_TEX;
      /** 크리스마스판 − 겨울판 이 다른 칸 (장식) → 그린 그림 좌표로 */
      const decor = (base: string, build: () => Grid, pad: { x: number; top: number }) => {
        store.set(base, build().toCanvas());
        const w = fromCanvas(store.get(campSkin(scene as never, base, "winter")) as HTMLCanvasElement);
        const x = fromCanvas(store.get(campSkin(scene as never, base, "christmas")) as HTMLCanvasElement);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let y = 0; y < w.h; y++)
          for (let i = 0; i < w.w; i++)
            if (w.rgba(i, y).join() !== x.rgba(i, y).join()) {
              x0 = Math.min(x0, i - pad.x);
              x1 = Math.max(x1, i - pad.x);
              y0 = Math.min(y0, y - pad.top);
              y1 = Math.max(y1, y - pad.top);
            }
        return { x0, y0, x1, y1 };
      };
      const b = Art.OFFICE_ART_H - 3;
      const o = decor(T.office, Art.officeArt, Art.OFFICE_PAD);
      // 문 리스 (50, b − 18)에 11×12 + 둘레 윤곽 한 칸 (차양 호랑가시 줄은 fillRect라 가짜 캔버스에 안 그려진다 — 같은 OFFICE_PAD로 옮긴다)
      expect(o).toEqual({ x0: 50 - 1, x1: 50 + 11, y0: b - 18 - 1, y1: b - 18 + 12 });
      const v = decor(T.vending, Art.vendingArt, Art.VENDING_PAD);
      // 리스 (6, 0)에 9×9 + 둘레 윤곽 한 칸
      expect([v.x0, v.y0]).toEqual([6 - 1, -1]);
      expect(v.x1).toBeLessThanOrEqual(6 + 9);
    });
  });
});
