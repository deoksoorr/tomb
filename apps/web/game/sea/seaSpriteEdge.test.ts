import { SEA_LOTS } from "@tomb/protocol";
import { describe, expect, it, vi } from "vitest";
import { COTTAGE_STYLES } from "@/lib/housing/catalog";
import { edgeBad, edgeFmt, edgeRunsOf, installFakeCanvas, pixOfCanvas, pixOfGrid, type FakeCanvas, type Pix } from "../camp/campTestCanvas";
import type { Grid } from "../sprites/pixel";
import type { SeaPad } from "./seaPad";

vi.mock("phaser", () => ({ default: {}, BlendModes: {}, Renderer: { WebGL: { WebGLRenderer: class {} } } }));
installFakeCanvas();
// SeaConceptDecor가 원본 텍스처가 캔버스인지 instanceof로 본다 (node에는 없다 — 가짜 캔버스면 캔버스) · 주소 시험 값은 비어 있게
(globalThis as Record<string, unknown>).HTMLCanvasElement ??= { [Symbol.hasInstance]: (o: unknown) => !!o && typeof (o as FakeCanvas).px === "function" };
(globalThis as Record<string, unknown>).window ??= { location: { search: "" } };

/**
 * 11/26 운영자 「도트 잘린 게 중간중간 있다」(캠핑장 → 바닷가도): 바닷가 그림을 캔버스 끝 열·줄까지 칠하면 제 색 테두리를 둘 자리가 없고,
 * 밖으로 나간 칠은 사라져 칼로 자른 듯 평평하게 보인다. 맵에 올리는 텍스처 전부(forEachSeaTexture — 갈매기 과자·유령선 조각 포함)를
 * 기본·겨울·크리스마스 판 그대로(SeaConceptDecor seaSkinCanvas) 굽고, 오두막 바깥 그림(모든 모양 × 크기 × 터 × 낮·밤 × 판), 바다 보기 장면의 작은 그림까지 본다.
 * 규칙은 캠핑장(campSpriteEdge.test)과 같다: 왼쪽·오른쪽 끝 열·맨 윗줄에 불투명 픽셀이 닿으면 잘림, 맨 아랫줄은 윤곽 아닌 칠만 (땅에 닿는 줄).
 * 바닷가 테두리는 물건마다 제 색(toneOutline — 불투명도 254로 표시)이라 254 픽셀을 윤곽으로 본다.
 */

/** 맵에 깔거나 겹쳐 그리는 판·효과 (끝이 다른 그림과 이어지거나 끝까지 칠하는 게 맞는 것) — 왜 빼는지 하나씩 */
const SKIP: readonly [RegExp, string][] = [
  [/^sea-(water|duskWater|foam|duskFoam|lace|wet|sheen|sheenWet|depthShade|goldStreak|shimmer|iceBand)$/, "물·물거품·젖은 모래·반짝임 타일 (이어 붙이거나 맵 폭으로 늘이는 판)"],
  [/^sea-(star|glowDot|lightColumn|lampGlow|beaconGlow|wake|spray|sparkle)$/, "빛·물살·물보라 효과 (부드러운 점·띠)"],
  [/^sea-(pier|pierEnd|pierArm|pontoon|pontoonRamp|kayakWalk|kayakDock|kayakHead|breakwater|tip)$/, "위에서 본 선착장·방파제 판 (원점 왼쪽 위 — 끝이 옆 판·땅과 이어진다)"],
  [/^sea-shipReflect-/, "배 물빛 반사 (물에 깨져 퍼지는 줄)"],
  [/^sea-keeper(~n[wx])?$/, "등대지기 NPC (사람 그림 — 따로 본다)"],
  [/^sea-gull$|^sea-gull-(piece|pieceHot|steam|flame)$/, "갈매기·던진 과자 조각·김·불꽃 (날아다니는 작은 효과)"],
  [/^sea-ghost-sail\d$/, "유령선 돛 (반투명 돛천 — 테두리 없는 그림, 윗줄은 활대에 묶인 매듭)"],
  [/^sea-ghost-(plank|plank-front)$/, "유령선 널빤지 다리 (위에서 본 판 — 왼쪽 끝이 선착장과 이어진다)"],
  [/^sea-ghost-(reflect|mist|glow)$/, "유령선 물빛 반사·안개·빛"],
  [/^sea-ghost-merchant(~n[wx])?$/, "유령 상인 NPC"],
];
const skipOf = (key: string) => SKIP.find(([re]) => re.test(key))?.[1] ?? null;
/** 맨 아랫줄이 물높이 줄인 그림 (물에 잠긴 끝 — 일부러 끝까지): 아랫줄만 뺀다 */
const WATERLINE = /^sea-(ship-tanker|ship-cargo|buoy)$/;

/** 바닷가 제 색 테두리(불투명도 254)는 윤곽으로 */
const tone = (p: Pix): Pix => ({ ...p, rgba: (x, y) => { const v = p.rgba(x, y); return v[3] === 254 ? [0x30, 0x20, 0x18, 254] : v; } });
const runs = (p: Pix, frameW?: number) => edgeRunsOf(tone(p), frameW);

type Built = { key: string; grid: Grid; frameW?: number };
async function seaTextures(): Promise<Built[]> {
  const { forEachSeaTexture } = await import("./SeaMap");
  const out: Built[] = [];
  forEachSeaTexture((key, build) => {
    const o = build() as Grid | { grid: Grid; frameW?: number };
    out.push("grid" in o ? { key, grid: o.grid, frameW: o.frameW } : { key, grid: o });
  });
  return out;
}

/** 모든 *_PAD를 잠깐 0으로 (여백 없던 예전 그림 — 같은 그림 함수 · 같은 좌표) */
async function allPads(): Promise<SeaPad[]> {
  const mods = await Promise.all([import("./seaArt"), import("./gullArt"), import("./ghostShipArt"), import("./seaViewArt")]);
  return mods.flatMap((m) => Object.entries(m).filter(([k, v]) => /_PAD$/.test(k) && v && typeof v === "object").map(([, v]) => v as SeaPad));
}
async function withoutPads<T>(fn: () => T | Promise<T>): Promise<T> {
  const pads = await allPads();
  const saved = pads.map((p) => ({ ...p }));
  for (const p of pads) Object.assign(p as object, { x: 0, top: 0, bottom: 0 });
  try {
    return await fn();
  } finally {
    pads.forEach((p, i) => Object.assign(p as object, saved[i]));
  }
}

describe("11/26 바닷가 그림이 캔버스 끝에서 잘리지 않아요", () => {
  it("맵 텍스처 전부 (기본 · 겨울 · 크리스마스 — 맵이 입히는 그대로)", async () => {
    const { seaSkinCanvas } = await import("./SeaConceptDecor");
    const fails: string[] = [];
    const keys = new Set<string>();
    let n = 0;
    for (const t of await seaTextures()) {
      expect(keys.has(t.key), `${t.key} 키가 두 번`).toBe(false);
      keys.add(t.key);
      if (skipOf(t.key)) continue;
      const base = t.grid.toCanvas();
      for (const [look, cv] of [
        ["기본", base],
        ["겨울", seaSkinCanvas(t.key, base, "winter").canvas],
        ["크리스마스", seaSkinCanvas(t.key, base, "christmas").canvas],
      ] as const) {
        const r = runs(pixOfCanvas(cv), t.frameW);
        if (WATERLINE.test(t.key)) r.bottom = 0;
        n++;
        if (edgeBad(r)) fails.push(`${t.key} ${look} ${(cv as unknown as FakeCanvas).width}×${(cv as unknown as FakeCanvas).height} ${edgeFmt(r)}`);
      }
    }
    expect(n).toBeGreaterThan(250);
    expect(fails).toEqual([]);
  });

  it("오두막 바깥 그림 (모양 × 크기 × 터 × 낮·밤 × 기본·겨울·크리스마스)", async () => {
    const { cottageCanvas } = await import("./seaCottageArt");
    const { seaSkinCanvas } = await import("./SeaConceptDecor");
    const fails: string[] = [];
    for (const st of COTTAGE_STYLES)
      for (const tier of ["small", "wide", "manor"] as const)
        for (const l of SEA_LOTS)
          for (const night of [false, true]) {
            const c = cottageCanvas({ style: st.id, tier, deck: l.deck, night, lot: { w: l.w, h: l.h, gate: l.gate } });
            const key = `sea-cottage-${st.id}-${tier}-${l.n}-${night ? "n" : "d"}`;
            for (const cv of [c.canvas, seaSkinCanvas(key, c.canvas, "winter").canvas, seaSkinCanvas(key, c.canvas, "christmas").canvas]) {
              const r = runs(pixOfCanvas(cv));
              if (edgeBad(r)) fails.push(`${key} ${edgeFmt(r)}`);
            }
          }
    expect(fails).toEqual([]);
  });

  it("바다 보기 장면의 따로 선 작은 그림 (누운 머리 · 먼 돛단배 · 먼바다 배)", async () => {
    // 화면 가장자리에 걸치는 앞 그림(돗자리 끝·파라솔 술·선베드 발·해먹 틀·야자잎·난간·데크·돌 가장자리)·하늘·바다·구름·빛은 화면 틀이라 뺀다
    const V = await import("./seaViewArt");
    const fails: string[] = [];
    const items: [string, Grid, boolean][] = [
      // [이름, 그림, 아랫줄을 볼지] — 누운 머리 아래는 등받이에 가려지는 목, 배 아래는 물높이 줄
      ["lyingHead", V.lyingHead(), false],
      ["farBoat", V.farBoat(), false],
      ...(["tanker", "cargo", "fishing", "squid"] as const).map((k): [string, Grid, boolean] => [`farShip-${k}`, V.farShip(k), false]),
    ];
    for (const [name, g, bottom] of items) {
      const r = runs(pixOfGrid(g));
      if (!bottom) r.bottom = 0;
      if (edgeBad(r)) fails.push(`${name} ${edgeFmt(r)}`);
    }
    expect(fails).toEqual([]);
  });

  describe("여백 둔 그림이 예전 자리 그대로예요", () => {
    it("원래 그림 픽셀은 여백만큼 옮겨진 그대로 (새로 생긴 건 밖으로 나가 잘렸던 칠과 그 테두리뿐 · 원점 자리 그대로)", async () => {
      const before = new Map((await withoutPads(seaTextures)).map((t) => [t.key, t]));
      const pads = await import("./seaArt");
      const fails: string[] = [];
      let changed = 0;
      for (const t of await seaTextures()) {
        const b = before.get(t.key)!;
        if (b.grid.w === t.grid.w && b.grid.h === t.grid.h) continue;
        changed++;
        // 여백 (좌우 같은 폭)
        const dx = (t.grid.w - b.grid.w) / 2;
        expect(Number.isInteger(dx), `${t.key} 좌우 여백이 같아요`).toBe(true);
        // 위 여백 = 높이 차 − 아래 여백: 그림마다 정한 값 (모르면 아래 0)
        const bottom = /tetra/.test(t.key) ? pads.TETRA_PAD.bottom : /beachGrass|shell|flower|stone|drift$/.test(t.key) ? pads.DECOR_PAD.bottom : /tube/.test(t.key) ? pads.TUBE_PAD.bottom : /kayak-side/.test(t.key) ? pads.KAYAK_SIDE_PAD.bottom : /kayak-vert/.test(t.key) ? pads.KAYAK_VERT_PAD.bottom : /paddle/.test(t.key) ? pads.PADDLE_PAD.bottom : /gate-post/.test(t.key) ? 1 : 0;
        const dy = t.grid.h - b.grid.h - bottom;
        // 프레임 시트(유령선 깃발)는 프레임마다 여백 — 프레임 칸끼리 맞춘다
        const bfw = b.frameW ?? b.grid.w;
        const nfw = t.frameW ?? t.grid.w;
        const fdx = (nfw - bfw) / 2;
        let diff = 0;
        let added = 0;
        for (let y = 0; y < b.grid.h; y++)
          for (let x = 0; x < b.grid.w; x++) {
            const f = Math.floor(x / bfw);
            const fx = x - f * bfw;
            const ov = b.grid.get(x, y);
            const nv = t.grid.get(b.frameW ? f * nfw + fdx + fx : x + dx, y + dy);
            const edge = fx === 0 || y === 0 || fx === bfw - 1 || y === b.grid.h - 1;
            // 예전 끝 한 줄은 바깥 칸이 생겨 테두리·결이 달라질 수 있다 (잘렸던 자리)
            if (edge || ov === nv) continue;
            // 예전엔 빈 칸이었는데 새로 칠해진 것: 밖으로 나가 잘렸던 칠의 테두리(254)만
            if ((ov & 255) === 0 && (nv & 255) === 254) {
              added++;
              continue;
            }
            diff++;
          }
        if (diff) fails.push(`${t.key} 바뀐 픽셀 ${diff}`);
        void added;
      }
      expect(changed).toBeGreaterThan(40);
      expect(fails).toEqual([]);
    });

    it("정류장 앞 조각(SHELTER_FRONT)·파라솔 갓/기둥 자르기·튜브 고리 줄·카약 덮개 줄은 예전 조각과 같은 픽셀", async () => {
      const A = await import("./seaArt");
      const base = await withoutPads(() => ({ shelter: A.shelterArt(), parasol: A.parasolArt(0), tube: A.tubeArt(0), side: A.kayakSideArt(0), vert: A.kayakVertArt(0) }));
      const now = { shelter: A.shelterArt(), parasol: A.parasolArt(0), tube: A.tubeArt(0), side: A.kayakSideArt(0), vert: A.kayakVertArt(0) };
      /** 예전 칸 (x0, y0, w, h) 픽셀이 새 칸 (+dx, +dy) 에 그대로 */
      const same = (name: string, o: Grid, n: Grid, r: readonly [number, number, number, number], dx: number, dy: number) => {
        for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) expect(n.get(x + dx, y + dy), `${name} ${x},${y}`).toBe(o.get(x, y));
      };
      const S = A.SHELTER_PAD;
      A.SHELTER_FRONT_BASE.forEach((r, i) => {
        const [nx, ny, nw, nh] = A.SHELTER_FRONT[i];
        expect(ny).toBe(r[1] + S.top);
        expect(nh).toBe(r[3]);
        expect(nx <= r[0] + S.x && r[0] + S.x + r[2] <= nx + nw).toBe(true);
        same(`정류장 ${i}`, base.shelter, now.shelter, r, S.x, S.top);
      });
      // 파라솔: SeaMap이 갓(0 ~ PARASOL_CANOPY_H)·기둥(PARASOL_CANOPY_H ~ PARASOL_H)을 나눠 그린다 — 경계 줄이 예전 19줄과 같은 자리
      const P = A.PARASOL_PAD;
      expect(A.PARASOL_CANOPY_H - P.top).toBe(19);
      expect([now.parasol.w, now.parasol.h]).toEqual([A.PARASOL_W, A.PARASOL_H]);
      same("파라솔 갓", base.parasol, now.parasol, [0, 0, base.parasol.w, 19], P.x, P.top);
      same("파라솔 기둥", base.parasol, now.parasol, [0, 19, base.parasol.w, base.parasol.h - 19], P.x, P.top);
      // 튜브: 원점 (0.5, TUBE_CY / TUBE_H) · 앞 고리 자르기 TUBE_CY줄부터 — 예전 9줄
      expect(A.TUBE_CY - A.TUBE_PAD.top).toBe(9);
      expect([now.tube.w, now.tube.h]).toEqual([A.TUBE_W, A.TUBE_H]);
      same("튜브", base.tube, now.tube, [1, 1, base.tube.w - 2, base.tube.h - 2], A.TUBE_PAD.x, A.TUBE_PAD.top);
      // 카약 (가운데 원점 — 위아래 같은 여백) · 덮개 자르기 줄 (SeaKayaks: 옆 6 + 여백, 세로 구멍 13·29 + 1 + 여백)
      expect(A.KAYAK_SIDE_PAD.top).toBe(A.KAYAK_SIDE_PAD.bottom);
      expect(A.KAYAK_VERT_PAD.top).toBe(A.KAYAK_VERT_PAD.bottom);
      expect([now.side.w, now.side.h, now.vert.w, now.vert.h]).toEqual([A.KAYAK_SIDE_W, A.KAYAK_SIDE_H, A.KAYAK_VERT_W, A.KAYAK_VERT_H]);
      same("카약 옆 덮개", base.side, now.side, [1, 6, base.side.w - 2, base.side.h - 7], A.KAYAK_SIDE_PAD.x, A.KAYAK_SIDE_PAD.top);
      for (const cy of [13, 29]) same(`카약 세로 덮개 ${cy}`, base.vert, now.vert, [1, cy + 1, base.vert.w - 2, 8], A.KAYAK_VERT_PAD.x, A.KAYAK_VERT_PAD.top);
    });

    it("겹쳐 그리는 그림은 같은 크기 (과자 자판기·밤 불빛 · 유령선 뒤판·앞판·창 빛) · 터 그림 자리·앞 울타리 자르기 줄", async () => {
      const G = await import("./gullArt");
      const v = G.gullVendArt();
      const l = G.gullVendLitArt();
      expect([l.w, l.h]).toEqual([v.w, v.h]);
      const H = await import("./ghostShipArt");
      const [b, f, w] = [H.ghostBackArt(), H.ghostFrontArt(), H.ghostWindowsArt()];
      expect([f.w, f.h, w.w, w.h]).toEqual([b.w, b.h, b.w, b.h]);
      const A = await import("./seaArt");
      for (const lot of SEA_LOTS) {
        const o = A.lotArtOrigin(lot);
        const sz = A.lotArtSize(lot);
        // 예전 그림 왼쪽 위 (터 사각형 −2, −LOT_RISE)와 앞 울타리 줄 (LOT_RISE + h − 16)이 여백만큼 옮겨진 자리
        expect([o.x + A.LOT_PAD.x, o.y + A.LOT_PAD.top]).toEqual([lot.x - 2, lot.y - A.LOT_RISE]);
        expect(sz.front - A.LOT_PAD.top).toBe(A.LOT_RISE + lot.h - 16);
        const g = A.lotArt(lot);
        expect([g.w, g.h]).toEqual([sz.w, sz.h]);
      }
    });

    it("크리스마스 장식(처마 전구·리스·등대 나선·배 장식 줄·터 전구)은 여백만큼 옮겨 단다 (그린 그림 기준 자리 그대로)", async () => {
      const { seaSkinCanvas } = await import("./SeaConceptDecor");
      /** 크리스마스판 − 겨울판 이 다른 칸 (장식) */
      const dress = (key: string, g: Grid) => {
        const cv = g.toCanvas();
        const w = pixOfCanvas(seaSkinCanvas(key, cv, "winter").canvas);
        const x = pixOfCanvas(seaSkinCanvas(key, cv, "christmas").canvas);
        const out = new Set<string>();
        for (let y = 0; y < w.h; y++) for (let i = 0; i < w.w; i++) if (w.rgba(i, y).join() !== x.rgba(i, y).join()) out.add(`${i},${y}`);
        return out;
      };
      const before = new Map((await withoutPads(seaTextures)).map((t) => [t.key, t.grid]));
      const pads = await import("./seaArt");
      const G = await import("./gullArt");
      const padOf: Record<string, SeaPad> = { "sea-shelter": pads.SHELTER_PAD, "sea-kiosk": pads.KIOSK_PAD, "sea-lighthouse": pads.LIGHTHOUSE_PAD, "sea-boat": pads.BOAT_PAD, "sea-ship-tanker": pads.SHIP_PAD, "sea-ship-cargo": pads.SHIP_PAD, "sea-gullVend": G.GULL_VEND_PAD };
      for (const l of SEA_LOTS) padOf[`sea-lot${l.n}`] = pads.LOT_PAD;
      const now = new Map((await seaTextures()).map((t) => [t.key, t.grid]));
      for (const [key, p] of Object.entries(padOf)) {
        const o = await withoutPads(() => dress(key, before.get(key)!));
        const n = dress(key, now.get(key)!);
        expect(o.size, `${key} 장식이 있어요`).toBeGreaterThan(0);
        // 예전 장식 칸이 모두 새 그림에서 여백만큼 옮긴 자리에 (리스는 둘레 윤곽 한 칸이 더 생겨 새 쪽이 조금 더 많다)
        const miss = [...o].filter((s) => {
          const [x, y] = s.split(",").map(Number);
          return !n.has(`${x + p.x},${y + p.top}`);
        });
        expect(miss.slice(0, 5), `${key} 장식 자리`).toEqual([]);
      }
    });
  });
});
