import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import {
  CX_ACT,
  CX_STATE_MAX,
  cxLit,
  cxToggleVariant,
} from "@/lib/housing/campExclusive";
import { RURAL_CX } from "@/lib/housing/campExclusive/rural";
import { CAMP_STARTER, furnitureById, houseShape } from "@/lib/housing/catalog";
import { footprint, SPIN_R0 } from "@/lib/housing/layout";
import type { Placed } from "@/lib/housing/types";
import { artUp, furnitureGrid, itemVariant } from "../art";
import { houseSpots } from "../interact";
import { Grid } from "../../sprites/pixel";
import { coverArt, heldArt, RURAL_ART, windowOver } from "./ruralArt";

// 11/27 촌캉스 전용 가구 그림·상호작용 (시안 승인본을 옮긴 것)

const FURN = RURAL_CX.filter((r) => !r.skin);
const filled = (g: Grid) => [...g.px].filter((c) => c & 255).length;
const sig = (g: Grid) => [...g.px].join();
/** 테를 두르기 전 그림 (art.ts가 테를 두르므로 맨 왼쪽·오른쪽 열과 맨 윗줄은 비워 둔다) */
function bare(id: string, d: number, v: string): Grid {
  const def = furnitureById(id)!;
  const side = d % 2 === 1;
  const W = (side ? def.h : def.w) * 16;
  const H = (side ? def.w : def.h) * 16 + artUp(id);
  const g = new Grid(W, H);
  (d === 0
    ? RURAL_ART.draw[id]
    : d === 2
      ? RURAL_ART.spin[id].back
      : RURAL_ART.spin[id].side)(g, W, H, v);
  return g;
}
const grid = (id: string, d: number, base: string) =>
  furnitureGrid(id, itemVariant(id, base, { r: SPIN_R0 + d }))!;

const STATES: Record<string, string[]> = {
  cx_rr_cushion: [""],
  cx_rr_lamp: ["on", "on-f1", "s1"],
  cx_rr_dadumi: ["", "use", "use-f1"],
  cx_rr_gotgam: ["", "s1-on", "s2-on", "s3-on"],
  cx_rr_fan: ["", "s1-on", "s2-on-f1", "s3-on-f2", "s3-on-f3"],
  cx_rr_ssal: ["", "open"],
  cx_rr_tv: ["", "s1-on-static", "s1-on-static-f1", "s1-on", "s2-on", "s3-on"],
  cx_rr_bedding: [""],
};

describe("촌캉스 전용 가구 그림", () => {
  it("가구 8개 네 방향·모든 변형: 크기 = 차지 칸 + up, 비어 있지 않고 테 자리(양 끝 열·맨 윗줄)는 비운다", () => {
    expect(Object.keys(RURAL_ART.draw).sort()).toEqual(
      FURN.map((r) => r.id).sort(),
    );
    for (const r of FURN)
      for (let d = 0; d < 3; d++)
        for (const v of STATES[r.id]) {
          const g = bare(r.id, d, v);
          expect(filled(g), `${r.id} d${d} ${v}`).toBeGreaterThan(20);
          for (let y = 0; y < g.h; y++) {
            expect(g.filled(0, y), `${r.id} d${d} ${v} 왼쪽 열 y${y}`).toBe(
              false,
            );
            expect(
              g.filled(g.w - 1, y),
              `${r.id} d${d} ${v} 오른쪽 열 y${y}`,
            ).toBe(false);
          }
          for (let x = 0; x < g.w; x++)
            expect(g.filled(x, 0), `${r.id} d${d} ${v} 맨 윗줄 x${x}`).toBe(
              false,
            );
          const fp = footprint(furnitureById(r.id)!, SPIN_R0 + d);
          expect([g.w, g.h]).toEqual([fp.w * 16, fp.h * 16 + artUp(r.id)]);
        }
  });

  it("곶감 걸이는 2×1 (앞은 넓고 옆은 깊다), 먹을수록 곶감이 줄어든다 (네 방향)", () => {
    expect(furnitureById("cx_rr_gotgam")).toMatchObject({ w: 2, h: 1 });
    for (let d = 0; d < 4; d++) {
      const n = [0, 1, 2, 3].map((a) =>
        grid("cx_rr_gotgam", d, cxToggleVariant("cx_rr_gotgam", a)),
      );
      for (let a = 1; a < 4; a++)
        expect(sig(n[a]), `d${d} 먹은 ${a}`).not.toBe(sig(n[a - 1]));
      expect(n[0].w).toBe(d % 2 ? 16 : 32);
    }
  });

  it("켜기·연출 변형마다 그림이 바뀐다 (등잔 불꽃 2장 · 선풍기 고개 4장 · TV 지지직 2장·채널 3 · 다듬이질 2장 · 쌀뒤주 뚜껑)", () => {
    for (let d = 0; d < 3; d++) {
      const diff = (id: string, a: string, b: string) =>
        expect(sig(grid(id, d, a)), `${id} d${d} ${a}/${b}`).not.toBe(
          sig(grid(id, d, b)),
        );
      diff("cx_rr_lamp", "on", "s1");
      diff("cx_rr_lamp", "on", "on-f1");
      diff("cx_rr_fan", "", "s1-on");
      diff("cx_rr_fan", "s1-on", "s1-on-f1");
      diff("cx_rr_fan", "s1-on-f1", "s1-on-f2");
      diff("cx_rr_dadumi", "", "use");
      diff("cx_rr_dadumi", "use", "use-f1");
      diff("cx_rr_ssal", "", "open");
      if (d !== 2) {
        // TV 뒷모습은 화면이 안 보인다
        diff("cx_rr_tv", "", "s1-on");
        diff("cx_rr_tv", "s1-on-static", "s1-on-static-f1");
        diff("cx_rr_tv", "s1-on", "s2-on");
        diff("cx_rr_tv", "s2-on", "s3-on");
      }
    }
  });

  it("움직이는 장면: 켜진 동안(등잔 불꽃 2 · 선풍기 고개 4 · TV 지지직 2) · 앉은 동안(다듬이질 2) — 장면 조각을 그림이 그린다", () => {
    expect(CX_ACT.cx_rr_lamp.toggle?.anim?.frames).toEqual(["", "f1"]);
    expect(CX_ACT.cx_rr_fan.toggle?.anim?.frames).toHaveLength(4);
    expect(CX_ACT.cx_rr_tv.toggle?.anim?.frames).toEqual(["", "f1"]);
    expect(CX_ACT.cx_rr_dadumi.seatAnim?.frames).toEqual(["use", "use-f1"]);
    expect(CX_ACT.cx_rr_dadumi.seatFx?.sfx).toBe("step");
    for (const id of ["cx_rr_fan", "cx_rr_gotgam", "cx_rr_tv"])
      expect(CX_ACT[id].toggle?.labels, id).toHaveLength(
        CX_ACT[id].toggle?.steps ?? 2,
      );
  });

  it("바닥 3 · 벽지 3 · 옆벽 윗면 색", () => {
    for (const r of RURAL_CX.filter((x) => x.skin)) {
      const map = r.skin === "floor" ? RURAL_ART.floors : RURAL_ART.papers;
      expect(map[r.id], r.id).toBeDefined();
      for (let v = 0; v < 4; v++) {
        const g = new Grid(16, 40);
        map[r.id](g, v);
        const rows = r.skin === "floor" ? [0, 16] : [6, 34];
        for (let y = rows[0]; y < rows[1]; y++)
          for (let x = 0; x < 16; x++)
            expect(g.filled(x, y), `${r.id} v${v} ${x},${y}`).toBe(true);
      }
      if (r.skin === "wall")
        expect(RURAL_ART.wallCap[r.id]).toBeTypeOf("number");
    }
  });

  it("창호 한지 벽에서는 창문 나무 테를 짙게 칠한다 (한지는 그대로)", () => {
    const g = new Grid(4, 1);
    g.set(0, 0, 0x8e5c34); // 나무
    g.set(1, 0, 0xf6eed6); // 한지
    g.set(2, 0, 0xd0a24a); // 놋쇠 문고리
    windowOver.cx_rr_wall_changho(g);
    expect(g.get(0, 0) >>> 8).not.toBe(0x8e5c34);
    expect(g.get(1, 0) >>> 8).toBe(0xf6eed6);
    expect(g.get(2, 0) >>> 8).toBe(0xd0a24a);
  });

  it("손에 드는 곶감 (작은 그림)", () => {
    for (const k of ["gotgam"]) {
      const g = heldArt[k]();
      expect(filled(g), k).toBeGreaterThan(10);
      expect(Math.max(g.w, g.h), k).toBeLessThanOrEqual(14);
    }
    expect(CX_ACT.cx_rr_gotgam.hold?.item).toBe("gotgam");
  });
});

describe("촌캉스 전용 가구 상호작용", () => {
  const rural = houseShape({
    zone: "camp",
    tier: "small",
    camp: { kind: "rural", yard: 3 },
  });
  const F = { ox: 32, oy: 66 };
  const at = (i: string, d: number, x = 3, y = 6): Placed[] => [
    ...CAMP_STARTER.rural.map((p) => ({ ...p })),
    { u: "t", i, x, y, r: SPIN_R0 + d },
  ];

  it("꽃무늬 방석: 네 방향 모두 방석 가운데에 보는 쪽을 보고 앉는다", () => {
    for (let d = 0; d < 4; d++) {
      const s = houseSpots(at("cx_rr_cushion", d), rural, F).filter(
        (x) => x.u === "t",
      );
      expect(s, `d${d}`).toHaveLength(1);
      expect(s[0]).toMatchObject({
        kind: "chair",
        use: "sit",
        inside: true,
        x: F.ox + 3 * 16 + 8,
        y: F.oy + 6 * 16 + 9,
        facing: [DIR.down, DIR.left, DIR.up, DIR.right][d],
      });
      expect(s[0].behind).toBeFalsy();
    }
  });

  it("다듬잇돌: 돌 너머에 무릎 꿇는 자리 (앞 = 돌 뒤 칸 안·돌이 사람 앞 · 옆 = 옆 칸 · 뒤 = 아래 칸, 돌을 본다)", () => {
    for (let d = 0; d < 4; d++) {
      const s = houseSpots(at("cx_rr_dadumi", d, 4, 5), rural, F).filter(
        (x) => x.u === "t",
      );
      expect(s, `d${d}`).toHaveLength(1);
      expect(s[0]).toMatchObject({
        kind: "chair",
        use: "sit",
        inside: d === 0,
        facing: [DIR.down, DIR.left, DIR.up, DIR.right][d],
      });
      expect(!!s[0].behind).toBe(d === 0);
      const fp = footprint(furnitureById("cx_rr_dadumi")!, SPIN_R0 + d);
      const L = F.ox + 4 * 16;
      const T0 = F.oy + 5 * 16;
      if (d === 1) expect(s[0].x).toBeGreaterThan(L + fp.w * 16);
      if (d === 3) expect(s[0].x).toBeLessThan(L);
      if (d === 2) expect(s[0].y).toBeGreaterThan(T0 + fp.h * 16);
    }
  });

  it("목화솜 이불 요: 네 방향 두 자리, 차지 칸 안, 덮개는 자리마다 다홍 목단 이불 그림", () => {
    for (let d = 0; d < 4; d++) {
      const s = houseSpots(at("cx_rr_bedding", d, 2, 5), rural, F).filter(
        (x) => x.u === "t",
      );
      const fp = footprint(furnitureById("cx_rr_bedding")!, SPIN_R0 + d);
      expect(s, `d${d}`).toHaveLength(2);
      s.forEach((x, k) => {
        expect(x).toMatchObject({
          kind: "bed",
          use: "lie",
          inside: true,
          cover: `cx|cx_rr_bedding_${k}|${d}`,
        });
        expect(x.x).toBeGreaterThan(F.ox + 2 * 16);
        expect(x.x).toBeLessThan(F.ox + (2 + fp.w) * 16);
        expect(x.y).toBeGreaterThan(F.oy + 5 * 16);
        expect(x.y).toBeLessThan(F.oy + (5 + fp.h) * 16);
        const c = coverArt[`cx_rr_bedding_${k}`](d);
        expect(c.w).toBe(20);
        expect(filled(c), `덮개 d${d} ${k}`).toBeGreaterThan(40);
      });
      expect(new Set(s.map((x) => x.id)).size).toBe(2);
    }
    expect(
      [0, 1, 2, 3].map(
        (d) =>
          houseSpots(at("cx_rr_bedding", d, 2, 5), rural, F).find(
            (x) => x.u === "t",
          )!.tilt ?? 0,
      ),
    ).toEqual([0, 90, 180, -90]);
  });

  it("켜기 값: 등잔 처음 켜짐 · 선풍기·TV 꺼짐→1~3 · 곶감 먹은 개수 0~3 (방 상태 최댓값)", () => {
    expect(cxLit("cx_rr_lamp", 0)).toBe(true);
    expect(cxLit("cx_rr_lamp", 1)).toBe(false);
    expect(CX_STATE_MAX).toMatchObject({
      cx_rr_lamp: 1,
      cx_rr_fan: 3,
      cx_rr_tv: 3,
      cx_rr_gotgam: 3,
    });
    expect(cxToggleVariant("cx_rr_tv", 2)).toBe("s2-on");
    expect(cxLit("cx_rr_tv", 0)).toBe(false);
  });
});
