import { describe, expect, it, vi } from "vitest";
import { installFakeCanvas, pixOfCanvas, type FakeCanvas, type Pix } from "../camp/campTestCanvas";
import type { PropDef } from "./layout";

vi.mock("phaser", () => ({ default: {}, BlendModes: {} }));
// 겨울·크리스마스 판 그림(skin)은 장면 텍스처에 굽는다 → 가짜 장면(textures.add)에 담는다
vi.mock("../assets/manifest", async (orig) => ({
  ...(await orig<object>()),
  addCanvasTexture: (scene: { textures?: { add?: (key: string, canvas: unknown) => void } } | undefined, key: string, o: { canvas: unknown }) => scene?.textures?.add?.(key, o.canvas),
}));
installFakeCanvas();
// skin이 원본 텍스처가 캔버스인지 instanceof로 본다 (node에는 없다 — 가짜 캔버스면 캔버스)
(globalThis as Record<string, unknown>).HTMLCanvasElement ??= { [Symbol.hasInstance]: (o: unknown) => !!o && typeof (o as FakeCanvas).px === "function" };

/**
 * 11/26 운영자 「캠핑장 나무도 도트 잘린 게 중간중간 있다」 → 마을까지. 마을 소품 텍스처(manifest — 나무·덤불·돌무더기·우물·종탑·그네·
 * 석등·가로등·벤치·의자·탁자·제단·정문·잡화점·동굴·허수아비·항아리·호박·배·통나무 의자·옛 묘역(옛 비석·납골당·울타리·큰 모닥불)·
 * 묘비 모양 전부·꽃다발·묘비 꾸미기)와 겨울·크리스마스 판(ConceptDecor.skin 그대로 — snow~ 눈 얹은 그림, 눈 나무·앙상한 나무·호랑가시 꽃밭·
 * 크리스마스 가로등·오두막 장식)을 칠해 보고, 끝 열·맨 윗줄에 불투명 픽셀이 닿으면(윤곽이라도 — 소수 배율에서 반만 그려진다)
 * 맨 아랫줄에 윤곽 아닌 칠이 닿으면 잘린 것으로 본다.
 */

/** 마을 그림 윤곽 색 (sprites/villagePad VILLAGE_LINES — 이 색·어두운 픽셀은 아랫줄에 닿아도 닫힌 면) */
let LINES: ReadonlySet<number> = new Set();
function edges(p: Pix, fw = p.w, fh = p.h): { L: number; R: number; T: number; B: number } {
  const solid = (x: number, y: number) => p.rgba(x, y)[3] >= 128;
  const open = (x: number, y: number) => {
    const [r, g, b, a] = p.rgba(x, y);
    return a >= 128 && !LINES.has((r << 16) | (g << 8) | b) && 0.3 * r + 0.59 * g + 0.11 * b >= 40;
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
  const o = { L: 0, R: 0, T: 0, B: 0 };
  for (let fy = 0; fy * fh < p.h; fy++)
    for (let f = 0; f * fw < p.w; f++) {
      const x0 = f * fw;
      const y0 = fy * fh;
      const col = (x: number) => Array.from({ length: fh }, (_, y) => [x, y0 + y] as [number, number]);
      const row = (y: number) => Array.from({ length: fw }, (_, x) => [x0 + x, y] as [number, number]);
      o.L = Math.max(o.L, run(col(x0), solid));
      o.R = Math.max(o.R, run(col(x0 + fw - 1), solid));
      o.T = Math.max(o.T, run(row(y0), solid));
      o.B = Math.max(o.B, run(row(y0 + fh - 1), open));
    }
  return o;
}
const fmt = (r: ReturnType<typeof edges>) => `L${r.L} R${r.R} T${r.T} B${r.B}`;

/**
 * 검사에서 빼는 텍스처 (그 까닭):
 *  - fx-·av-: 빛·효과·아바타 연출 조각 · shop-floor/wall: 이어 붙이는 바닥·벽 타일 · prop-wall-face: 담 타일
 *  - shop-shelf/counter/door/keeper: 유령 잡화점 가게 안(ShopScene) 그림 — 마을 맵 소품이 아니다
 *  - grave-plot: 땅에 까는 무덤 자리 판 · grave-up: 머리 위 화살표 표시(UI)
 *  - prop-mat: 위에서 본 돗자리 (땅에 깔린 천 — 판 끝이 곧 천 끝) · prop-bridge: 위에서 본 나무다리 (길과 이어지는 판)
 *  - prop-hammock·prop-hammock-posts·prop-fire·prop-fire-ring·prop-smoke·gy-mist·gy-big-ring: 따로 검사하는 그림(해먹)·불·연기·안개·땅에 까는 불 자리
 */
const SKIP = /^(fx-|av-|shop-(floor|wall|shelf|counter|door|keeper)|prop-wall-face|grave-(plot|up)$|prop-mat-|prop-bridge|prop-hammock|prop-fire|prop-smoke|gy-mist|gy-big-ring)/;
/** 땅에 닿는 아랫줄 (윤곽 없이 땅에 박힌 줄기·심지 받침·무지개 끝·동굴 바닥·낙엽·버섯·비석 위에 앉은 고양이·꽂은 깃대 밑동 — 아랫줄만 뺀다) */
const GROUND = /(prop-reeds-|gy-candle-|decor-rainbow|place-cave|prop-leaves-|prop-mushroom-|decor-ghostcat|concept-holly|grave-mine-flag)/;
/** 이어 붙이는 울타리 조각 (좌우 끝은 옆 조각과 이어진다 — 위·아래만 본다) */
const TILE_X = /gy-fence-h/;

describe("11/26 마을 그림이 캔버스 끝에서 잘리지 않아요", () => {
  it("마을 소품 텍스처 전부 + 겨울·크리스마스 판 (ConceptDecor.skin 그대로)", async () => {
    LINES = (await import("../sprites/villagePad")).VILLAGE_LINES;
    const { MANIFEST } = await import("../assets/manifest");
    const { skin } = await import("./ConceptDecor");
    const { WP } = await import("../sprites/worldProps");
    const store = new Map<string, unknown>();
    const frames = new Map<string, { w: number; h: number }>();
    const scene = {
      textures: {
        exists: (k: string) => store.has(k),
        get: (k: string) => ({ getSourceImage: () => store.get(k) }),
        add: (k: string, c: unknown) => void store.set(k, c),
      },
    };
    const fails: string[] = [];
    const check = (key: string, cv: unknown) => {
      const base = key.replace(/^(?:winter|christmas) (?:snow|xmas)~/, "");
      const f = frames.get(base);
      const r = edges(pixOfCanvas(cv), f?.w, f?.h);
      if (GROUND.test(key)) r.B = 0;
      if (TILE_X.test(key)) r.L = r.R = 0;
      if (r.L || r.R || r.T || r.B) fails.push(`${key} ${fmt(r)}`);
    };
    const bases: string[] = [];
    for (const [k, src] of Object.entries(MANIFEST)) {
      if (SKIP.test(k) || src.kind !== "procedural") continue;
      const b = src.build();
      store.set(k, b.canvas);
      if (b.frameW) frames.set(k, { w: b.frameW, h: b.frameH ?? b.canvas.height });
      bases.push(k);
      check(k, b.canvas);
    }
    expect(bases.length).toBeGreaterThan(80);
    // 겨울·크리스마스: 소품 종류별 (나무 → 눈 나무·앙상한 나무, 꽃밭 → 호랑가시, 소나무 → 눈 소나무, 가로등 → 크리스마스 가로등) + 나머지는 눈 얹은 그림
    const prop = (kind: PropDef["kind"], variant: number): PropDef => ({ kind, variant, x: -999, y: -999 }) as PropDef;
    const kinds: [PropDef["kind"], string][] = [
      ["tree", "prop-tree-0"],
      ["autumn", WP.autumn0],
      ["maple", WP.maple0],
      ["ginkgo", WP.ginkgo0],
      ["blossom", WP.blossom0],
      ["flowers", WP.flowers0],
      ["pine", WP.pine0],
      ["lamp", WP.lamp],
    ];
    for (const concept of ["winter", "christmas"] as const) {
      for (const [kind, base] of kinds)
        for (let v = 0; v < 3; v++) {
          const k = skin(scene as never, base, concept, prop(kind, v));
          if (k !== base) check(`${concept} ${k}`, store.get(k));
        }
      // 묘비 꾸미기·꽃다발·내 묘비 깃발은 판이 바뀌어도 그대로 (묘비는 snowWorldTextures가 같은 눈을 얹는다 — 아래 skin과 같은 snowCap)
      for (const base of bases.filter((b) => !/^(decor-|flowers-|grave-mine)/.test(b))) {
        let k = base;
        try {
          k = skin(scene as never, base, concept);
        } catch {
          // 크리스마스 오두막 빛 겹(bulbGlowSheet)은 그라디언트라 가짜 캔버스로 못 굽는다 — 오두막 그림은 아래 따로
          continue;
        }
        if (k !== base) check(`${concept} ${k}`, store.get(k));
      }
    }
    expect(fails).toEqual([]);
  });

  it("크리스마스 오두막 문 리스·처마 전구 자리(HUT_DRESS)는 여백만큼 옮겨 예전 그림 자리 그대로", async () => {
    const { MANIFEST, MANIFEST_RAW, TEX } = await import("../assets/manifest");
    const { HUT_DRESS } = await import("./ConceptDecor");
    const { SHOP_HUT_TEX_PAD: P } = await import("../sprites/villagePad");
    const neu = pixOfCanvas((MANIFEST[TEX.shopHut] as { build: () => { canvas: unknown } }).build().canvas);
    const old = pixOfCanvas((MANIFEST_RAW[TEX.shopHut] as { build: () => { canvas: unknown } }).build().canvas);
    const d = HUT_DRESS[TEX.shopHut];
    // 예전 자리 (여백 빼기) — 문 30, 37 · 처마 1~58, 26
    expect([d.door.x - P.x, d.door.y - P.top, d.eave.x0 - P.x, d.eave.x1 - P.x, d.eave.y - P.top]).toEqual([30, 37, 1, 58, 26]);
    // 리스·전구 줄이 얹히는 칸의 그림이 예전 자리 그림과 같다
    for (let y = -2; y <= 12; y++)
      for (let x = -6; x <= 6; x++) expect(neu.rgba(d.door.x + x, d.door.y + y).join(), `문 ${x},${y}`).toBe(old.rgba(d.door.x - P.x + x, d.door.y - P.top + y).join());
    for (let x = d.eave.x0; x <= d.eave.x1; x++) expect(neu.rgba(x, d.eave.y).join(), `처마 ${x}`).toBe(old.rgba(x - P.x, d.eave.y - P.top).join());
  });
});

describe("여백 둔 마을 그림이 예전 자리 그대로예요", () => {
  it("원래 그림 픽셀은 여백만큼 옮겨진 그대로, 새로 생긴 건 끝을 닫는 윤곽뿐 · 원점(0.5, 1) 그림은 아래 여백 0", async () => {
    const { MANIFEST, MANIFEST_RAW } = await import("../assets/manifest");
    const { villageTexPad } = await import("../sprites/villagePad");
    const fails: string[] = [];
    let n = 0;
    for (const [k, src] of Object.entries(MANIFEST_RAW)) {
      const pad = villageTexPad(k);
      if (!pad || src.kind !== "procedural") continue;
      const dst = MANIFEST[k];
      if (dst.kind !== "procedural") continue;
      const a = src.build();
      const b = dst.build();
      const A = pixOfCanvas(a.canvas);
      const B = pixOfCanvas(b.canvas);
      const fw = a.frameW ?? A.w;
      const fh = a.frameH ?? A.h;
      const nf = Math.floor(A.w / fw);
      const W = fw + pad.x * 2;
      const H = fh + pad.top + pad.bottom;
      n++;
      if (B.w !== W * nf || B.h !== H) {
        fails.push(`${k} 크기 ${B.w}×${B.h} ≠ ${W * nf}×${H}`);
        continue;
      }
      if (a.frameW && b.frameW !== W) fails.push(`${k} 프레임 폭 ${b.frameW} ≠ ${W}`);
      for (let f = 0; f < nf; f++)
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const nb = B.rgba(f * W + x, y);
            const ax = x - pad.x;
            const ay = y - pad.top;
            if (ax >= 0 && ay >= 0 && ax < fw && ay < fh) {
              if (nb.join() !== A.rgba(f * fw + ax, ay).join()) fails.push(`${k} ${f}:${x},${y} 바뀜`);
            } else if (nb[3] && ((nb[0] << 16) | (nb[1] << 8) | nb[2]) !== pad.line) fails.push(`${k} 여백 ${x},${y} 윤곽 아님`);
          }
    }
    expect(n).toBeGreaterThan(60);
    expect(fails.slice(0, 10)).toEqual([]);
  });

  it("원점이 바닥 가운데가 아닌 그림·그림 안 좌표도 여백만큼 같이 옮겼다", async () => {
    const P = await import("../sprites/villagePad");
    const { GRAVE_MOUND_H, GRAVE_STONE_H, graveOriginY } = await import("../sprites/graves");
    const { BENCH_UP_BACK_ROW, BENCH_TEX_PAD_TOP } = await import("../sprites/props");
    const { mineFlagCanvas } = await import("../sprites/graves");
    // 묘비: 받침 줄(원점)이 화면에서 같은 자리 — 원점 y × 높이 = 받침 줄 (여백 위 줄 수 + 예전 받침 줄)
    for (const shape of Object.keys(GRAVE_STONE_H) as (keyof typeof GRAVE_STONE_H)[]) {
      const h0 = GRAVE_STONE_H[shape] + GRAVE_MOUND_H;
      const h1 = h0 + P.GRAVE_TEX_PAD.top + P.GRAVE_TEX_PAD.bottom;
      expect(P.graveTexOriginY(shape) * h1, shape).toBeCloseTo(graveOriginY(shape) * h0 + P.GRAVE_TEX_PAD.top, 6);
    }
    // 벤치 등받이 앞 조각: 텍스처 줄 = 그림 줄 7 + 위 여백
    expect(BENCH_UP_BACK_ROW).toBe(7 + BENCH_TEX_PAD_TOP);
    expect(P.BENCH_TEX_PAD.top).toBe(BENCH_TEX_PAD_TOP);
    // 내 묘비 깃발 (원점 x 0.15): 넓힌 그림에서 원점이 가리키는 픽셀 열이 예전과 같은 그림 열
    const flagW = (mineFlagCanvas() as unknown as FakeCanvas).width;
    expect(flagW).toBe(P.MINE_FLAG_W);
    expect(P.MINE_FLAG_ORIGIN_X * (flagW + P.MINE_FLAG_TEX_PAD.x * 2) - P.MINE_FLAG_TEX_PAD.x).toBeCloseTo(0.15 * flagW, 6);
    // 원점(0.5, 0.5) 그림(꽃 화환·나비)은 위아래 같은 여백, 원점(0.5, 0) 그림(꽃다발·리본)은 Grave.ts가 위 여백만큼 올려 놓는다
    expect(P.VILLAGE_TEX_PAD["decor-wreath"].top).toBe(P.VILLAGE_TEX_PAD["decor-wreath"].bottom);
    expect(P.VILLAGE_TEX_PAD["decor-butterfly"].top).toBe(P.VILLAGE_TEX_PAD["decor-butterfly"].bottom);
    // 나머지(원점 바닥 가운데)는 아래 여백 0
    for (const [k, p] of Object.entries(P.VILLAGE_TEX_PAD)) if (!/decor-(wreath|butterfly)/.test(k)) expect(p.bottom, k).toBe(0);
  });

  it("크리스마스 가로등 리본·리스는 여백만큼 옮겨 그 기둥 위에 그대로", async () => {
    const { xmasLamp } = await import("../sprites/winterArt");
    const { streetLamp } = await import("../sprites/worldProps");
    const { padTexCanvas, STREET_LAMP_TEX_PAD: P } = await import("../sprites/villagePad");
    const old = pixOfCanvas(xmasLamp(streetLamp()));
    const neu = pixOfCanvas(xmasLamp(padTexCanvas(streetLamp(), P).canvas, { x: P.x, y: P.top }));
    // 리본(빨간 줄)·리스 픽셀은 여백만큼 옮긴 자리에 같은 색
    let same = 0;
    for (let y = 0; y < old.h; y++)
      for (let x = 0; x < old.w; x++) {
        const c = old.rgba(x, y);
        if (c[0] > 150 && c[1] < 80) {
          expect(neu.rgba(x + P.x, y + P.top).join(), `${x},${y}`).toBe(c.join());
          same++;
        }
      }
    expect(same).toBeGreaterThan(10);
  });
});
