import { describe, expect, it } from "vitest";
import { CARAVAN_CX } from "@/lib/housing/campExclusive/caravan";
import { furnitureGrid, itemVariant } from "../art";
import { indoorPoseSheet } from "../../sprites/indoorPose";
import { coverArt, cvCoverGrid, heldArt } from "./caravanArt";
import { cxCoverName } from "./types";

// 11/27 카라반 전용 가구 그림·동작 (시안 이식): 변형마다 그림이 바뀌고, 눕는 자리마다 덮개, 손에 드는 물건 그림이 있다

const FURN = CARAVAN_CX.filter((r) => !r.skin);
const grid = (id: string, v: string, d: number) => furnitureGrid(id, itemVariant(id, v, { r: 4 + d }))!;
const same = (a: { px: Uint32Array }, b: { px: Uint32Array }) => a.px.every((c, i) => c === b.px[i]);

describe("카라반 전용 가구 그림", () => {
  it("앞·옆·뒤가 서로 다른 그림 (옆을 보면 가로·세로 칸이 바뀐다)", () => {
    for (const r of FURN) {
      const [f, s, b] = [0, 1, 2].map((d) => grid(r.id, "", d));
      expect([s.w, s.h - (f.h - r.h * 16)], r.id).toEqual([r.h * 16, r.w * 16]);
      if (r.w === r.h) expect(same(f, s), `${r.id} 앞=옆`).toBe(false);
      if (r.id !== "cx_cv_canopy") expect(same(f, b), `${r.id} 앞=뒤`).toBe(false);
    }
  });

  it("켜기·서서 쓰기 변형마다 네 방향 그림이 바뀐다 (라디오·랜턴·캐노피 on, 아이스박스 open, 머그 선반 pour)", () => {
    const cases: [string, string][] = [
      ["cx_cv_radio", "on"],
      ["cx_cv_lantern", "on"],
      ["cx_cv_canopy", "on"],
      ["cx_cv_icebox", "open"],
      ["cx_cv_mug_shelf", "pour"],
    ];
    for (const [id, v] of cases) for (let d = 0; d < 3; d++) expect(same(grid(id, "", d), grid(id, v, d)), `${id} d${d} ${v}`).toBe(false);
    // 종류 파일 act의 변형 이름과 같다
    expect(CARAVAN_CX.find((r) => r.id === "cx_cv_icebox")?.act?.fx?.v).toBe("open");
    expect(CARAVAN_CX.find((r) => r.id === "cx_cv_mug_shelf")?.act?.fx?.v).toBe("pour");
  });

  it("캐노피 전구 줄은 테를 두른 뒤에 얹어 1px로 가늘다 (줄 바로 아래 칸이 테 색이 아니다)", () => {
    const g = grid("cx_cv_canopy", "on", 0);
    const x = Math.floor(g.w / 2) + 1;
    let y = 17;
    while (y < g.h && g.get(x, y) >>> 8 !== 0x3a3430) y++;
    expect(y, "줄").toBeLessThan(g.h);
    expect(g.get(x, y - 1) & 255, "줄 위는 비어 있다").toBe(0);
  });

  it("릴렉스 체어는 누가 누우면(lie) 담요가 다리 받침까지", () => {
    for (let d = 0; d < 3; d++) expect(same(grid("cx_cv_relax_chair", "", d), grid("cx_cv_relax_chair", "lie", d)), `d${d}`).toBe(false);
  });
});

describe("카라반 전용 가구 자리·덮개·손에 들기", () => {
  it("눕는 자리마다 덮개 그림이 있고 (벙커 위·아래는 다른 덮개), 덮개 맨 윗줄은 밝은 깃", () => {
    for (const r of FURN)
      for (let d = 0; d < 4; d++)
        for (const s of r.act?.seats?.(d as 0, (d % 2 ? r.h : r.w) * 16, (d % 2 ? r.w : r.h) * 16) ?? []) {
          if (!s.lie) continue;
          const key = s.cover === true ? r.id : s.cover!;
          expect(coverArt[key], `${r.id} ${key}`).toBeDefined();
          const g = coverArt[key](d);
          expect(g.w).toBe(20);
          // 몸 가운데 목선 줄은 덮개 색 (지우는 칸이 아니다)
          expect(g.get(10, 0) & 255, `${key} d${d}`).toBe(255);
        }
    const bunk = CARAVAN_CX.find((r) => r.id === "cx_cv_bunk")!.act!.seats!;
    for (let d = 0; d < 4; d++) expect(bunk(d as 0, 32, 48).map((s) => s.cover)).toEqual(["cx_cv_bunk_up", "cx_cv_bunk_lo"]);
    expect(same(cvCoverGrid("cx_cv_bunk_up", 0), cvCoverGrid("cx_cv_bunk_lo", 0))).toBe(false);
  });

  it("누운 자세 시트가 덮개를 쓴다 (마을 보라 이불과 다르다)", () => {
    const quilt = indoorPoseSheet("lie", "hood", "#9fb8d8");
    for (const key of ["cx_cv_relax_chair", "cx_cv_bunk_up", "cx_cv_bunk_lo"])
      for (let d = 0; d < 4; d++) expect(same(quilt, indoorPoseSheet("lie", "hood", "#9fb8d8", [], cxCoverName(key, d))), `${key} d${d}`).toBe(false);
  });

  it("앉는 의자: 네 방향 모두 보는 쪽을 보고, 뒤를 보면 등받이가 앞(behind)", () => {
    const seat = CARAVAN_CX.find((r) => r.id === "cx_cv_camp_chair")!.act!.seats!;
    for (let d = 0; d < 4; d++) {
      const [s] = seat(d as 0, 16, 16);
      expect(s.face).toBe(d);
      expect(!!s.behind).toBe(d === 2);
      expect(s.lie).toBeFalsy();
    }
  });

  it("손에 드는 물건: 아이스박스 캔 · 머그 선반 머그 그림이 있고 작다", () => {
    const holds = FURN.flatMap((r) => (r.act?.hold ? [r.act.hold.item] : []));
    expect(holds.sort()).toEqual(["can", "mug"]);
    for (const h of holds) {
      const g = heldArt[h]();
      expect(g.w).toBeLessThanOrEqual(12);
      expect(g.h).toBeLessThanOrEqual(14);
      expect([...g.px].some((c) => (c & 255) === 255), h).toBe(true);
    }
  });
});

describe("카라반 공용 연결 (depthY · 발 그늘 · 빛 자리 · 장면)", () => {
  it("벙커 위층은 depthY가 아래층 발 줄 + 1 (침대 그림 깊이 − 1보다 앞, 아래층 사람보다 뒤)", () => {
    const seats = CARAVAN_CX.find((r) => r.id === "cx_cv_bunk")!.act!.seats!;
    for (let d = 0; d < 4; d++) {
      const [up, lo] = seats(d as 0, d % 2 ? 48 : 32, d % 2 ? 32 : 48);
      expect(up.depthY, `d${d}`).toBe(lo.y + 1);
      expect(lo.depthY).toBeUndefined();
    }
  });

  it("랜턴·캐노피는 발 그늘 없이 빛 자리(dy)를 주고, 라디오는 켜진 동안 음표 장면 f1", () => {
    const row = (id: string) => CARAVAN_CX.find((r) => r.id === id)!;
    for (const id of ["cx_cv_lantern", "cx_cv_canopy"]) {
      expect(row(id).noShadow, id).toBe(true);
      expect(row(id).light?.dy, id).toBeLessThan(-10);
    }
    expect(row("cx_cv_radio").act?.toggle?.anim?.frames).toEqual(["", "f1"]);
    for (let d = 0; d < 3; d++) expect(same(grid("cx_cv_radio", "on", d), grid("cx_cv_radio", "on-f1", d)), `d${d}`).toBe(false);
  });
});

describe("벙커 침대 드나들기 (사다리 · 열린 쪽)", () => {
  const seats = CARAVAN_CX.find((r) => r.id === "cx_cv_bunk")!.act!.seats!;
  it("위층은 사다리 밑(차지 칸 밖)에서 사다리 칸을 따라 곧게 오르고, 아래층은 차지 칸 밖 한 점에서 들어간다", () => {
    for (let d = 0; d < 4; d++) {
      const w = d % 2 ? 48 : 32;
      const h = d % 2 ? 32 : 48;
      const [up, lo] = seats(d as 0, w, h);
      for (const s of [up, lo]) {
        const p0 = s.enter![0];
        expect(p0.x < 0 || p0.x > w || p0.y < 0 || p0.y > h, `d${d} 첫 점은 칸 밖`).toBe(true);
      }
      const climb = up.enter!.filter((q) => q.climb);
      expect(climb, `d${d}`).toHaveLength(1);
      const i = up.enter!.indexOf(climb[0]);
      const from = up.enter![i - 1];
      expect(from.x).toBe(climb[0].x);
      expect(climb[0].y).toBeLessThan(from.y);
      // 사다리 꼭대기는 위층 매트 높이 근처 (위층 발 자리에서 30px 안)
      expect(Math.abs(climb[0].y - up.y)).toBeLessThan(30);
      expect(lo.enter).toHaveLength(1);
    }
  });
  it("사다리 자리 = 그림의 사다리 기둥 사이 (앞: x 23~27 · 옆: 발치 x 5~9, 오른쪽을 보면 뒤집음 · 뒤: 먼 쪽 고리 x 22~28 — 침대 뒤로)", () => {
    const ladderX = (d: number) => seats(d as 0, d % 2 ? 48 : 32, d % 2 ? 32 : 48)[0].enter!.find((q) => q.climb)!.x;
    expect(ladderX(0)).toBe(25);
    expect(ladderX(1)).toBe(7);
    expect(ladderX(3)).toBe(48 - 7);
    expect(ladderX(2)).toBe(25);
    expect(seats(2, 32, 48)[0].enter!.find((q) => q.climb)!.behind).toBe(true);
    const g = grid("cx_cv_bunk", "", 0);
    // 앞모습 사다리 기둥 (x 23·27) 이 그려져 있다
    expect(g.get(23, 60) >>> 8).toBe(g.get(27, 60) >>> 8);
  });
});

describe("벙커 침대 고르기 (위칸·아래칸)", () => {
  it("두 자리에 서로 다른 고르는 이름, 가구에 고르기 안내", () => {
    const row = CARAVAN_CX.find((r) => r.id === "cx_cv_bunk")!;
    expect(row.act?.pickLabel).toBe("눕기 (위칸·아래칸)");
    for (let d = 0; d < 4; d++) expect(row.act!.seats!(d as 0, d % 2 ? 48 : 32, d % 2 ? 32 : 48).map((s) => s.pick)).toEqual(["위칸 눕기", "아래칸 눕기"]);
    // 다른 카라반 가구는 고르기가 없다 (가장 가까운 자리 그대로)
    for (const r of FURN.filter((x) => x.id !== "cx_cv_bunk")) expect(r.act?.pickLabel, r.id).toBeUndefined();
  });
});
