import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FURNITURE, furnitureById, isExclusiveFurniture, SPECIAL_FURNITURE_PRICE_MUL, tierById } from "@/lib/housing/catalog";
import { footprint, nextRotation, SPIN_R0 } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import { buyFurniture } from "@/lib/housing/service";
import { STATE_MAX } from "@/lib/housing/states";
import { MemoryHouseStore } from "@/lib/housing/store";
import type { Placed } from "@/lib/housing/types";
import { OFFICE_FURN_IDS } from "@/lib/office/catalog";
import { artUp, furnitureGrid, itemVariant } from "./art";
import { BODY_HALF_W, houseSpots, houseTargets, USE_LABEL } from "./interact";
import { OFFICE_FX } from "./officeUse";
import { SEASON_FX, SEASON_LIGHTS, seasonLightLabel } from "./seasonUse";

// 11/20 총무팀 문대리 사무실 가구 15종: 카탈로그(값·점수·크기·전용 표시), 네 방향 그림, 써 보기(서서 E — 시즌 가구와 같은 길),
// 앉는 셋(바퀴 달린 사무 의자·안마의자·부장님 책상 — 손님 쪽을 보고 뒤에 앉는다), 야근 스탠드 켜기·끄기, 이파리 햇빛가리개 낮 잎 그림자

const OFFICE = FURNITURE.filter((f) => f.officeShop);
const F = { ox: 32, oy: 66 };
const T = 16;
const small = tierById("small")!;
const plan = roomPlan(small);
const at = (id: string, r: number, x = 3, y = 3, u = "a"): Placed => ({ u, i: id, x, y, r });
const px = (id: string, v: string) => [...furnitureGrid(id, v)!.px].join(",");
const boxOf = (p: Placed) => {
  const fp = footprint(furnitureById(p.i)!, p.r);
  const L = F.ox + p.x * T;
  const Tp = F.oy + p.y * T;
  return { L, Tp, R: L + fp.w * T, B: Tp + fp.h * T };
};

describe("사무실 가구 카탈로그", () => {
  it("15종, 값·크기·쓰기는 시안 표 그대로 (점수 = 값 ÷ 20), 사무실 갈래, 네 방향, 문대리 전용", () => {
    const want: Record<string, [number, number, string]> = {
      partition: [260, 1, "포스트잇 붙이기"],
      leaf_shade: [300, 1, "그늘에서 한숨 돌리기"],
      swivel_chair: [280, 1, "앉기 (빙그르르)"],
      copier: [380, 1, "복사하기 (위잉)"],
      water_cooler: [320, 1, "물 받기"],
      file_cabinet: [300, 1, "서랍 열기"],
      meeting_table: [400, 2, "회의 시작하기"],
      rubber_tree: [280, 1, "물 주기"],
      quit_clock: [260, 1, "시간 확인 (땡!)"],
      approval_tray: [280, 1, "도장 쾅"],
      paper_pile: [260, 1, "한 장 처리하기"],
      boss_desk: [420, 2, "앉아서 결재하기"],
      banker_lamp: [300, 1, "켜기·끄기"],
      massage_chair: [420, 1, "앉아서 안마받기"],
      leave_button: [340, 1, "누르기 (딸깍)"],
    };
    expect(OFFICE.map((f) => f.id)).toEqual(Object.keys(want));
    expect([...OFFICE_FURN_IDS]).toEqual(Object.keys(want));
    for (const f of OFFICE) {
      // 11/20 문대리 가구는 시안 표 값의 2배 (SPECIAL_FURNITURE_PRICE_MUL), 점수는 표 값 ÷ 20 그대로
      const [base, ...rest] = want[f.id];
      expect([f.price, ...rest], f.id).toEqual([base * SPECIAL_FURNITURE_PRICE_MUL, ...rest]);
      expect(f.score, f.id).toBe(base / 20);
      expect([f.h, f.spin, f.category, f.officeShop], f.id).toEqual([1, true, "dev", true]);
      expect(f.price, f.id).toBeGreaterThanOrEqual(260 * SPECIAL_FURNITURE_PRICE_MUL);
      expect(f.price, f.id).toBeLessThanOrEqual(420 * SPECIAL_FURNITURE_PRICE_MUL);
      expect(isExclusiveFurniture(f), f.id).toBe(true);
      expect(!!f.light, f.id).toBe(f.id === "banker_lamp");
    }
  });

  it("가구점 일반 구매는 막고 문대리(한정 판매 인자)로만 산다", async () => {
    const store = new MemoryHouseStore();
    for (const id of ["partition", "boss_desk"]) await expect(buyFurniture(store, "acc", id)).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining("문대리") });
    // 한정 판매 인자면 이 막음은 지나간다 (집이 없어 다음 단계에서 막힌다)
    await expect(buyFurniture(store, "acc", "partition", 0, "village", true)).rejects.not.toMatchObject({ message: expect.stringContaining("문대리") });
  });
});

describe("사무실 가구 그림: 네 방향", () => {
  it.each(OFFICE.map((f) => [f.id]))("%s: 네 방향 모두 돌린 칸 크기 + 솟는 높이, 서로 다른 모습", (id) => {
    const f = furnitureById(id)!;
    const up = artUp(id);
    expect(up, id).toBeGreaterThan(0);
    const looks = new Set<string>();
    let r = 0;
    for (let i = 0; i < 4; i++) {
      r = nextRotation(f, r);
      const g = furnitureGrid(id, itemVariant(id, "", { r }))!;
      const fp = footprint(f, r);
      expect([g.w, g.h], `${id} r${r}`).toEqual([fp.w * T, fp.h * T + up]);
      let filled = 0;
      for (let k = 0; k < g.px.length; k++) if ((g.px[k] & 255) > 0) filled++;
      expect(filled, `${id} r${r}`).toBeGreaterThan(40);
      looks.add(r === SPIN_R0 + 3 ? [...g.mirrored().px].join(",") : [...g.px].join(","));
    }
    expect(looks.size, id).toBe(4);
  });

  it("이파리 햇빛가리개: 낮엔 바닥에 잎 그림자, 밤(n)엔 없다 — 네 방향 모두", () => {
    for (const d of ["", "d1", "d2"]) {
      const day = furnitureGrid("leaf_shade", d)!;
      const night = furnitureGrid("leaf_shade", ["n", d].filter(Boolean).join("-"))!;
      let shade = 0;
      for (let k = 0; k < day.px.length; k++) if ((day.px[k] & 255) > 0 && (day.px[k] & 255) < 120 && (night.px[k] & 255) === 0) shade++;
      expect(shade, d).toBeGreaterThan(20);
    }
    expect(itemVariant("leaf_shade", "", { night: true })).toBe("n");
  });

  it("야근 스탠드: 처음부터 켜짐, 꺼짐(off)이 저장되고 그림이 다르다 (네 방향)", () => {
    expect(STATE_MAX.banker_lamp).toBe(1);
    expect(SEASON_LIGHTS.has("banker_lamp")).toBe(true);
    expect(seasonLightLabel("banker_lamp", false)).toContain("끄기");
    expect(seasonLightLabel("banker_lamp", true)).toContain("켜기");
    for (const d of ["", "d1", "d2"]) expect(px("banker_lamp", d) !== px("banker_lamp", ["off", d].filter(Boolean).join("-")), d).toBe(true);
  });

  it("써 보기 그림(잠깐 바뀌는 그림)은 앞모습과 다르고 시즌 가구 연출 표에 들어 있다", () => {
    for (const [id, fx] of Object.entries(OFFICE_FX)) {
      expect(furnitureById(id)?.officeShop, id).toBe(true);
      expect(SEASON_FX[id], id).toBe(fx);
      expect(px(id, fx.v!) !== px(id, ""), `${id} ${fx.v}`).toBe(true);
      expect(fx.lines?.length, id).toBe(3);
    }
    expect(px("massage_chair", "buzz") !== px("massage_chair", "")).toBe(true);
  });
});

describe("사무실 가구 쓰기", () => {
  it("모든 가구·모든 방향에서 쓸 대상과 안내가 있다", () => {
    for (const f of OFFICE)
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const t = houseTargets([at(f.id, r)], small, plan, F).filter((x) => x.item === f.id);
        expect(t.length, `${f.id} r${r}`).toBeGreaterThan(0);
        for (const x of t) expect(USE_LABEL[x.use], f.id).toBeTruthy();
      }
  });

  it.each(Object.keys(OFFICE_FX).map((id) => [id]))("%s: 서서 쓰면 돌린 앞쪽에 서서 바라본다 (몸이 가구 그림을 25% 넘게 덮지 않는다)", (id) => {
    for (let d = 0; d < 4; d++) {
      const p = at(id, SPIN_R0 + d);
      const t = houseTargets([p], small, plan, F).find((x) => x.u === "a")!;
      expect(t.use, `${id} d${d}`).toBe("season");
      const s = t.stand!;
      expect(s, `${id} d${d}`).toBeTruthy();
      const b = boxOf(p);
      const cover = Math.max(0, Math.min(s.x + BODY_HALF_W, b.R) - Math.max(s.x - BODY_HALF_W, b.L));
      expect(cover / (b.R - b.L), `${id} d${d} 겹침`).toBeLessThanOrEqual(0.25);
      // 위(뒤)에는 서지 않는다
      expect(s.side, `${id} d${d}`).not.toBe(2);
    }
  });

  it("야근 스탠드는 켜기·끄기, 앉는 셋은 자리", () => {
    expect(houseTargets([at("banker_lamp", SPIN_R0)], small, plan, F)[0].use).toBe("light");
    const spotOf = (id: string, r: number) => houseSpots([at(id, r)], small, F).find((s) => s.u === "a");
    for (let d = 0; d < 4; d++) {
      expect(spotOf("swivel_chair", SPIN_R0 + d)?.use).toBe("sit");
      expect(spotOf("massage_chair", SPIN_R0 + d)?.use).toBe("massage");
      expect(spotOf("boss_desk", SPIN_R0 + d)?.use).toBe("approve");
    }
    expect(USE_LABEL.massage).toBe("앉아서 안마받기");
    expect(USE_LABEL.approve).toBe("앉아서 결재하기");
  });

  it("안마의자: 차지 칸 안에 앉아 보는 쪽을 본다 (뒤를 보면 등받이가 사람 앞)", () => {
    const want = [DIR.down, DIR.left, DIR.up, DIR.right];
    for (let d = 0; d < 4; d++) {
      const p = at("massage_chair", SPIN_R0 + d);
      const s = houseSpots([p], small, F)[0];
      const b = boxOf(p);
      expect(s.facing, `d${d}`).toBe(want[d]);
      expect(s.inside).toBe(true);
      expect(s.x > b.L && s.x < b.R && s.y > b.Tp && s.y <= b.B, `d${d}`).toBe(true);
      expect(!!s.behind, `d${d}`).toBe(d === 2);
    }
  });

  it("부장님 책상: 손님 쪽(그림 앞)을 보고 책상 뒤에 앉는다 — 뒤가 막혀 있으면 자리가 없다", () => {
    const want = [
      { facing: DIR.down, side: "위" },
      { facing: DIR.left, side: "오른쪽" },
      { facing: DIR.up, side: "아래" },
      { facing: DIR.right, side: "왼쪽" },
    ];
    for (let d = 0; d < 4; d++) {
      const p = at("boss_desk", SPIN_R0 + d);
      const s = houseSpots([p], small, F)[0];
      const b = boxOf(p);
      expect(s.facing, `d${d}`).toBe(want[d].facing);
      expect(s.inside).toBe(false);
      if (d === 0) expect(s.y).toBeLessThan(b.Tp);
      if (d === 1) expect(s.x).toBeGreaterThan(b.R);
      if (d === 2) expect(s.y).toBeGreaterThan(b.B);
      if (d === 3) expect(s.x).toBeLessThan(b.L);
    }
    // 벽에 붙여 놓으면(맨 윗줄) 앞을 볼 때 뒤에 앉을 자리가 없다
    expect(houseSpots([at("boss_desk", SPIN_R0, 2, 0)], small, F)).toEqual([]);
    // 뒤 칸에 다른 물건이 있어도 자리가 없다
    expect(houseSpots([at("boss_desk", SPIN_R0, 2, 3), at("copier", SPIN_R0, 2, 2, "b")], small, F).filter((s) => s.u === "a")).toEqual([]);
  });

  it("바퀴 달린 사무 의자를 모니터 책상 앞에 두고 책상 쪽을 보면 앉아서 일하기", () => {
    const desk = at("monitor_desk", SPIN_R0, 2, 2, "d");
    const chair = at("swivel_chair", SPIN_R0 + 2, 2, 3, "a");
    const s = houseSpots([desk, chair], small, F).find((x) => x.u === "a")!;
    expect(s.use).toBe("type");
    expect(s.facing).toBe(DIR.up);
  });
});
