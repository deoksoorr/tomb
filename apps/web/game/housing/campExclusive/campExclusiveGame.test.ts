import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CX_ACT, CX_ROWS } from "@/lib/housing/campExclusive";
import { CAMP_STARTER, FURNITURE, houseShape } from "@/lib/housing/catalog";
import { footprint, SPIN_R0 } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import type { Placed } from "@/lib/housing/types";
import { EMOTE_ICONS } from "../../sprites/emotes";
import { artUp, lightOffset, noFootShadow, windowGrid, floorGrid, furnitureGrid, itemVariant, wallCapColor, wallGrid } from "../art";
import { cxSpots, houseSpots, houseTargets, itemDepthY } from "../interact";
import { indoorPoseSheet } from "../../sprites/indoorPose";
import { Grid } from "../../sprites/pixel";
import { SEASON_FX } from "../seasonUse";
import { CX_WINDOW_OVER, CX_COVER, CX_DRAW, CX_FLOORS, CX_HELD, CX_PAPERS, CX_SPIN, CX_WALL_CAP, paintCxCover } from "./index";

// 11/27 캠핑장 전용 가구 게임 쪽 틀: 42개 모두 그림(지금은 임시)이 있고, 종류 파일의 act 선언이 자리·쓰기 대상이 된다

const CX = FURNITURE.filter((f) => f.campOnly);
const CX_ROWS_ALL = Object.values(CX_ROWS).flat();
const FURN = CX.filter((f) => !f.skin);
const F = { ox: 32, oy: 66 };
const pension = houseShape({ zone: "camp", tier: "small", camp: { kind: "pension", yard: 3 } });
const plan = roomPlan({ id: pension.id, w: pension.w, h: pension.h });
const withStarter = (...extra: Placed[]): Placed[] => [...CAMP_STARTER.pension.map((p) => ({ ...p })), ...extra];

describe("캠핑장 전용 가구 — 그림 틀", () => {
  it("가구 24개는 앞·옆·뒤 그림이 있고 크기 = 차지 칸 + 솟는 높이, 켜짐 변형도 그린다", () => {
    expect(Object.keys(CX_DRAW).sort()).toEqual(FURN.map((f) => f.id).sort());
    for (const f of FURN.filter((x) => x.spin)) expect(CX_SPIN[f.id], f.id).toBeDefined();
    for (const f of FURN)
      // 러그(turn)는 앞 그림 하나를 장면이 90°씩 돌린다
      for (let r = f.spin ? SPIN_R0 : 0; r < (f.spin ? SPIN_R0 + 4 : 1); r++) {
        const g = furnitureGrid(f.id, itemVariant(f.id, CX_ACT[f.id]?.toggle ? "on" : "", { r }))!;
        expect(g, `${f.id} r${r}`).not.toBeNull();
        const fp = footprint(f, r);
        expect([g.w, g.h], `${f.id} r${r}`).toEqual([fp.w * 16, fp.h * 16 + artUp(f.id)]);
        expect([...g.px].some((c) => c & 255), `${f.id} r${r} 비어 있음`).toBe(true);
      }
  });

  it("바닥·벽지 18개는 그 타일로 그린다 (기본 장판·판자 벽으로 떨어지지 않는다)", () => {
    const floors = CX.filter((f) => f.skin === "floor").map((f) => f.id);
    const walls = CX.filter((f) => f.skin === "wall").map((f) => f.id);
    expect(Object.keys(CX_FLOORS).sort()).toEqual([...floors].sort());
    expect(Object.keys(CX_PAPERS).sort()).toEqual([...walls].sort());
    const base = [...floorGrid("floor_grass", 0).px].join();
    for (const id of floors) expect([...floorGrid(id, 0).px].join(), id).not.toBe(base);
    const wbase = [...wallGrid("wall_fence", 0).px].join();
    for (const id of walls) {
      expect([...wallGrid(id, 0).px].join(), id).not.toBe(wbase);
      expect(wallCapColor(id), id).toBe(CX_WALL_CAP[id]);
    }
  });
});

describe("캠핑장 전용 가구 — 상호작용 틀 (종류 파일 act)", () => {
  it("서서 쓰기(fx)는 시즌 가구 연출 표에 들어가고, 이모티콘이 있는 것", () => {
    for (const [id, a] of Object.entries(CX_ACT))
      if (a.fx) {
        expect(SEASON_FX[id], id).toEqual(a.fx);
        if (a.fx.emote) expect(EMOTE_ICONS, id).toContain(a.fx.emote);
      }
  });

  it("흔들의자: 네 방향 모두 앉는 자리 (보는 쪽을 보고, 뒤를 보면 등받이가 앞)", () => {
    for (let d = 0; d < 4; d++) {
      const spots = houseSpots(withStarter({ u: "rk", i: "cx_pn_rocking", x: 2, y: 6, r: SPIN_R0 + d }), pension, F).filter((s) => s.u === "rk");
      expect(spots, `d${d}`).toHaveLength(1);
      expect(spots[0]).toMatchObject({ kind: "chair", use: "sit", inside: true, facing: [DIR.down, DIR.left, DIR.up, DIR.right][d] });
      expect(!!spots[0].behind).toBe(d === 2);
    }
  });

  it("보드게임 탁자(2×2): 변마다 가운데 한 자리 (4자리 — sideCenter), 옆 변이 막히면 그쪽 자리는 없다", () => {
    const t: Placed = { u: "bg", i: "cx_pn_boardgame", x: 6, y: 5, r: SPIN_R0 };
    const all = houseSpots(withStarter(t), pension, F).filter((s) => s.u === "bg");
    expect(all).toHaveLength(4);
    expect(all.map((s) => s.facing).sort()).toEqual([DIR.down, DIR.left, DIR.right, DIR.up].sort());
    expect(all.every((s) => !s.inside)).toBe(true);
    const blocked = houseSpots(withStarter(t, { u: "c1", i: "chair", x: 5, y: 5, r: 0 }), pension, F).filter((s) => s.u === "bg");
    expect(blocked).toHaveLength(3);
  });

  it("2층 벙커 침대·목화솜 이불 요: 눕는 자리 (침대 자리 bed)", () => {
    const s = houseSpots(withStarter({ u: "bk", i: "cx_cv_bunk", x: 2, y: 5, r: SPIN_R0 }), pension, F).find((x) => x.u === "bk");
    expect(s).toMatchObject({ kind: "bed", use: "lie" });
  });

  it("켜기·끄기 가구는 cxToggle 대상 (앞에 설 자리도), 서서 쓰기는 season, 러그는 rug", () => {
    const items = withStarter(
      { u: "st", i: "cx_pn_stove", x: 6, y: 5, r: SPIN_R0 },
      { u: "sk", i: "cx_pn_ski_rack", x: 10, y: 5, r: SPIN_R0 },
      { u: "rg", i: "cx_pn_check_rug", x: 2, y: 8, r: 0 },
    );
    const ts = houseTargets(items, pension, plan, F);
    expect(ts.find((t) => t.u === "st")).toMatchObject({ use: "cxToggle", stand: expect.any(Object) });
    expect(ts.find((t) => t.u === "sk")).toMatchObject({ use: "season", stand: expect.any(Object) });
    expect(ts.find((t) => t.u === "rg")).toMatchObject({ use: "rug", low: true });
  });
});

describe("캠핑장 전용 가구 — 손에 들기 · 누운 덮개 틀", () => {
  it("눕는 자리 cover: true면 그 가구 id, 문자열이면 그 키로 덮개 이름 (방향마다)", () => {
    const p: Placed = { u: "bd", i: "cx_rr_bedding", x: 2, y: 2, r: SPIN_R0 + 1 };
    const b = { L: 0, Tp: 0, R: 32, B: 48, fw: 2, fh: 3 };
    const one = cxSpots(p, b, 1, { seats: () => [{ x: 8, y: 20, face: 0, lie: true, cover: true }] }, () => true);
    expect(one[0]).toMatchObject({ kind: "bed", use: "lie", cover: "cx|cx_rr_bedding|1" });
    const two = cxSpots(p, b, 3, { seats: () => [{ x: 8, y: 20, face: 0, lie: true, cover: "yo" }] }, () => true);
    expect(two[0].cover).toBe("cx|yo|3");
    // 앉는 자리엔 덮개가 없다
    expect(cxSpots(p, b, 0, { seats: () => [{ x: 8, y: 8, face: 0, cover: true }] }, () => true)[0].cover).toBeUndefined();
  });

  it("덮개 그림이 있으면 누운 자세에 그 그림을 목선부터 덮고, 없으면 마을 이불", () => {
    const quiltSheet = [...indoorPoseSheet("lie", "hood", "#9fb8d8").px].join();
    expect([...indoorPoseSheet("lie", "hood", "#9fb8d8", [], "cx|없는키|0").px].join()).toBe(quiltSheet);
    CX_COVER.test_cover = (d: number) => {
      const g = new Grid(20, 6);
      g.rect(0, 0, 20, 6, d === 2 ? 0x00ff00 : 0xff0000);
      return g;
    };
    try {
      const frame = new Grid(20, 28);
      expect(paintCxCover(frame, "cx|test_cover|2", 10)).toBe(true);
      expect(frame.get(5, 10) >>> 8).toBe(0x00ff00);
      expect(frame.get(5, 9) & 255).toBe(0);
      const sheet = [...indoorPoseSheet("lie", "hood", "#9fb8d8", [], "cx|test_cover|0").px].join();
      expect(sheet).not.toBe(quiltSheet);
      expect(paintCxCover(new Grid(20, 28), "cx|없는키|0", 10)).toBe(false);
    } finally {
      delete CX_COVER.test_cover;
    }
  });

  it("손에 드는 그림: 방향마다(0~3) 그림이 있고 48×48 안 (등에 멘 스키처럼 큰 것도)", () => {
    for (const [name, art] of Object.entries(CX_HELD))
      for (const d of [0, 1, 2, 3]) {
        const g = art(d);
        expect(g.w, `${name} d${d}`).toBeLessThanOrEqual(48);
        expect(g.h, `${name} d${d}`).toBeLessThanOrEqual(48);
      }
    for (const [id, a] of Object.entries(CX_ACT)) if (a.hold) expect(a.fx || a.toggle, `${id} hold는 서서 쓰기·켜기 가구에`).toBeTruthy();
  });
});

describe("캠핑장 전용 가구 — 자리 깊이 · 둘레 가운데 · 그늘 · 빛 자리", () => {
  it("자리 y는 솟은 그림 높이까지 위로 갈 수 있다 (벙커 침대 위층)", () => {
    for (const f of FURN) {
      const seats = CX_ACT[f.id]?.seats;
      if (!seats) continue;
      for (const d of [0, 1, 2, 3] as const) {
        const fp = footprint(f, SPIN_R0 + d);
        for (const st of seats(d, fp.w * 16, fp.h * 16)) if (st.inside !== false) expect(st.y, `${f.id} d${d}`).toBeGreaterThanOrEqual(-artUp(f.id));
      }
    }
  });

  it("depthY 자리는 사람 깊이를 따로 갖고, 칸 위로 솟은 자리·depthY 자리는 가구 깊이를 끌어올리지 않는다", () => {
    const p: Placed = { u: "bk", i: "cx_cv_bunk", x: 2, y: 3, r: SPIN_R0 };
    const b = { L: F.ox + 32, Tp: F.oy + 48, R: F.ox + 64, B: F.oy + 96, fw: 2, fh: 3 };
    const up = cxSpots(p, b, 0, { seats: () => [{ x: 16, y: -10, face: 0, lie: true, depthY: 20 }] }, () => true);
    expect(up[0]).toMatchObject({ y: b.Tp - 10, depth: b.Tp + 20 });
    const def = FURNITURE.find((f) => f.id === "cx_cv_bunk")!;
    expect(itemDepthY(p, def, up, F)).toBe(b.B - 1);
    // 보통 자리(칸 안, depthY 없음)는 예전처럼 사람 앞에 가구가 오지 않게 깊이를 내린다
    const low = cxSpots(p, b, 0, { seats: () => [{ x: 16, y: 30, face: 0, lie: true }] }, () => true);
    expect(itemDepthY(p, def, low, F)).toBe(b.Tp + 30 - 1);
  });

  it("around sideCenter: 변마다 가운데 한 자리 (2×2 탁자 = 4자리), 막힌 변은 없다", () => {
    const p: Placed = { u: "bg", i: "cx_pn_boardgame", x: 6, y: 5, r: SPIN_R0 };
    const b = { L: 96, Tp: 80, R: 128, B: 112, fw: 2, fh: 2 };
    const four = cxSpots(p, b, 0, { around: { mode: "sideCenter" } }, () => true);
    expect(four.map((x) => x.facing).sort()).toEqual([DIR.down, DIR.left, DIR.right, DIR.up].sort());
    expect(four.find((x) => x.facing === DIR.up)).toMatchObject({ x: 112, y: 116 });
    const blocked = cxSpots(p, b, 0, { around: { mode: "sideCenter" } }, (x) => x !== 5);
    expect(blocked).toHaveLength(3);
  });

  it("noShadow 가구는 발밑 그늘이 없고, light.dx·dy가 있으면 그 자리 (오른쪽을 보면 dx 뒤집음), 없으면 예전 어림", () => {
    for (const f of CX) expect(noFootShadow(f.id), f.id).toBe(!!CX_ROWS_ALL.find((r) => r.id === f.id)?.noShadow);
    for (const f of CX.filter((x) => x.light)) {
      const [dx, dy] = lightOffset(f.id, SPIN_R0);
      if (f.light!.dy !== undefined) {
        expect([dx, dy], f.id).toEqual([f.light!.dx ?? 0, f.light!.dy]);
        if (f.spin) expect(lightOffset(f.id, SPIN_R0 + 3)[0], f.id).toBe(-(f.light!.dx ?? 0) || 0);
        // dx가 없으면 오른쪽을 봐도 -0이 아니라 0
        if (f.spin) expect(Object.is(lightOffset(f.id, SPIN_R0 + 3)[0], -0), f.id).toBe(false);
      } else expect([dx, dy], f.id).toEqual([0, -Math.min(14, artUp(f.id) + 6)]);
    }
    expect(lightOffset("stone_lantern")).toEqual([0, -Math.min(14, artUp("stone_lantern") + 6)]);
  });
});

describe("캠핑장 전용 가구 — 창문 덧칠 · 밖 자리 막힘", () => {
  it("벽지 windowOver가 있으면 그 벽지 창문에만 덧칠 (원본 그림은 그대로)", () => {
    const plain = [...windowGrid(false, false, "window_plain").px].join();
    CX_WINDOW_OVER.test_wall = (g) => g.rect(0, 0, 2, 2, 0x00ff00);
    try {
      const over = windowGrid(false, false, "window_plain", "test_wall");
      expect(over.get(0, 0) >>> 8).toBe(0x00ff00);
      expect([...windowGrid(false, false, "window_plain").px].join()).toBe(plain);
      expect([...windowGrid(false, false, "window_plain", "wall_fence").px].join()).toBe(plain);
    } finally {
      delete CX_WINDOW_OVER.test_wall;
    }
  });

  it("차지 칸 밖 칸에 발이 있는 자리(inside:false)는 그 칸이 막히면 없다 · 칸 안·위로 솟은 자리는 그대로", () => {
    const p: Placed = { u: "dd", i: "cx_rr_dadumi", x: 4, y: 4, r: SPIN_R0 + 2 };
    const b = { L: 64, Tp: 64, R: 96, B: 80, fw: 2, fh: 1 };
    const act = {
      seats: () => [
        { x: 16, y: 25, face: 2 as const, inside: false },
        { x: 8, y: 8, face: 0 as const },
        { x: 16, y: -10, face: 0 as const, lie: true },
      ],
    };
    expect(cxSpots(p, b, 2, act, () => true)).toHaveLength(3);
    // 뒤(아래) 줄 x=5,y=5 칸이 막힘 → 밖 자리 하나만 빠진다 (위로 솟은 자리는 칸 검사 안 함)
    const blocked = cxSpots(p, b, 2, act, (x, y) => !(x === 5 && y === 5) && y !== 3);
    expect(blocked).toHaveLength(2);
    expect(blocked.some((s) => s.facing === DIR.up)).toBe(false);
  });
});
