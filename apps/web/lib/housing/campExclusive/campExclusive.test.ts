import { describe, expect, it } from "vitest";
import {
  CAMP_ONLY_IDS,
  CAMP_STARTER,
  campOnlyBlock,
  FURNITURE,
  furnitureById,
  houseShape,
  isExclusiveFurniture,
  isFloorSkin,
  isWallSkin,
  SPECIAL_FURNITURE_PRICE_MUL,
  type CampHomeKind,
} from "../catalog";
import { footprint, validateLayout } from "../layout";
import { STATE_MAX } from "../states";
import type { HouseLayout } from "../types";
import { CX_ACT, CX_ROWS, CX_STATE_MAX, cxLit, cxToggleVariant } from "./index";

// 11/27 캠핑장 집 종류별 전용 가구·바닥·벽지: 확정 목록(이름·칸·값) · 점수 = 값 ÷ 20 · 네 방향 · 그 종류 집에서만

/** 확정 표: [이름, 가로, 세로, 값] — 가구 8 → 바닥 3 → 벽지 3 */
const TABLE: Record<CampHomeKind, [string, number, number, number][]> = {
  caravan: [
    ["접이식 캠핑 의자", 1, 1, 600],
    ["아이스박스", 1, 1, 640],
    ["레트로 라디오", 1, 1, 800],
    ["랜턴 스탠드", 1, 2, 880],
    ["캠핑 머그 선반", 2, 1, 960],
    ["릴렉스 체어", 1, 2, 1_200],
    ["전구 줄 캐노피", 3, 1, 1_280],
    ["2층 벙커 침대", 2, 3, 1_920],
    ["레트로 체크 장판", 1, 1, 1_400],
    ["캠핑 러그 마루", 1, 1, 1_600],
    ["민트 체크 타일", 1, 1, 1_200],
    ["크림색 합판 벽", 1, 1, 1_200],
    ["빈티지 체리 패널", 1, 1, 1_800],
    ["줄무늬 캔버스 벽", 1, 1, 1_400],
  ],
  pension: [
    ["자작나무 장작 바구니", 1, 1, 600],
    ["스키 거치대", 1, 2, 720],
    ["체크무늬 러그", 3, 2, 800],
    ["흔들의자", 1, 1, 1_040],
    ["보드게임 탁자", 2, 2, 1_200],
    ["미러볼 노래방 기계", 1, 1, 1_520],
    ["원목 6인 식탁", 4, 2, 1_680],
    ["펜션 장작 난로", 2, 2, 2_080],
    ["통나무 원목 마루", 1, 1, 1_600],
    ["헤링본 마루", 1, 1, 2_000],
    ["테라코타 타일", 1, 1, 1_400],
    ["회반죽 통나무 벽", 1, 1, 1_400],
    ["눈꽃 무늬 벽지", 1, 1, 1_800],
    ["빨간 체크 패브릭 벽", 1, 1, 1_600],
  ],
  rural: [
    ["꽃무늬 방석", 1, 1, 600],
    ["등잔", 1, 1, 640],
    ["다듬잇돌", 2, 1, 720],
    ["곶감 걸이", 2, 1, 800],
    ["옛날 선풍기", 1, 1, 960],
    ["쌀뒤주", 2, 1, 1_040],
    ["브라운관 TV", 2, 1, 1_280],
    ["목화솜 이불 요", 3, 2, 1_600],
    ["반들 비닐 장판", 1, 1, 1_200],
    ["콩댐 한지 장판", 1, 1, 1_800],
    ["대청마루", 1, 1, 1_600],
    ["창호 한지 벽", 1, 1, 1_400],
    ["황토 흙벽", 1, 1, 1_600],
    ["신문지 도배 벽", 1, 1, 1_000],
  ],
};
const KINDS = ["caravan", "pension", "rural"] as const;
const PREFIX: Record<CampHomeKind, string> = {
  caravan: "cx_cv_",
  pension: "cx_pn_",
  rural: "cx_rr_",
};

describe("11/27 캠핑장 전용 가구 — 카탈로그", () => {
  it.each(KINDS)("%s: 확정 이름·칸·값 그대로 (전용 배수 없이), 점수 = 값 ÷ 20, id 접두사, 가구 8 · 바닥 3 · 벽지 3", (kind) => {
    const defs = CAMP_ONLY_IDS[kind].map((id) => furnitureById(id)!);
    expect(defs.map((d) => [d.name, d.w, d.h, d.price])).toEqual(TABLE[kind]);
    expect(SPECIAL_FURNITURE_PRICE_MUL).toBe(2);
    for (const d of defs) {
      expect(d.id.startsWith(PREFIX[kind]), d.id).toBe(true);
      expect(d.score, d.id).toBe(d.price / 20);
      expect(Number.isInteger(d.score), d.id).toBe(true);
      expect(d.campOnly, d.id).toBe(kind);
      expect(d.desc.length, d.id).toBeGreaterThan(8);
      expect(isExclusiveFurniture(d), d.id).toBe(true);
    }
    expect(defs.filter((d) => !d.skin)).toHaveLength(8);
    expect(defs.filter((d) => d.skin === "floor").every((d) => isFloorSkin(d.id))).toBe(true);
    expect(defs.filter((d) => d.skin === "floor")).toHaveLength(3);
    expect(defs.filter((d) => d.skin === "wall").every((d) => isWallSkin(d.id))).toBe(true);
    expect(defs.filter((d) => d.skin === "wall")).toHaveLength(3);
    // 가구는 모두 네 방향 (바닥 러그만 90°씩 돌리기), 모두 use 문구가 있다
    for (const d of defs.filter((x) => !x.skin)) {
      expect(d.use, d.id).toBeTruthy();
      if (d.floor) expect([d.turn, d.spin], d.id).toEqual([true, undefined]);
      else expect(d.spin, d.id).toBe(true);
      expect(d.category).toBe("camp");
    }
    // 밤 빛이 있는 가구는 종류 파일이 정한다 (빛 자리 dx·dy를 주면 둘 다 숫자)
    for (const d of defs.filter((x) => x.light)) if (d.light!.dy !== undefined) expect(typeof (d.light!.dx ?? 0), d.id).toBe("number");
  });

  it("42개, id가 겹치지 않고 카탈로그에 한 번씩", () => {
    const all = KINDS.flatMap((k) => CAMP_ONLY_IDS[k]);
    expect(all).toHaveLength(42);
    expect(new Set(all).size).toBe(42);
    expect(FURNITURE.filter((f) => f.campOnly).map((f) => f.id)).toEqual(all);
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(FURNITURE.length);
  });

  it("펜션 체크무늬 러그만 바닥층, 보드게임 탁자는 둘레 앉기, 6인 식탁은 그림 속 자리(seats)", () => {
    expect(FURNITURE.filter((f) => f.campOnly && f.floor).map((f) => f.id)).toEqual(["cx_pn_check_rug"]);
    expect(CX_ACT.cx_pn_boardgame.around).toBeDefined();
    expect(CX_ACT.cx_pn_long_table.seats ?? CX_ACT.cx_pn_long_table.around).toBeDefined();
  });

  it("켜기·끄기: 상태 최댓값이 방 상태 표에 있고, 처음부터 켜진 것(등잔·랜턴)은 값 0이 켜짐 · TV는 채널 셋", () => {
    for (const [id, max] of Object.entries(CX_STATE_MAX)) expect(STATE_MAX[id], id).toBe(max);
    expect(CX_STATE_MAX.cx_rr_tv).toBe(3);
    expect(cxLit("cx_rr_lamp", 0)).toBe(true);
    expect(cxLit("cx_rr_lamp", 1)).toBe(false);
    expect(cxLit("cx_rr_tv", 0)).toBe(false);
    expect(cxToggleVariant("cx_rr_tv", 2)).toBe("s2-on");
    expect(cxToggleVariant("cx_cv_lantern", 0)).toBe("on");
    expect(cxToggleVariant("cx_cv_lantern", 1)).toBe("s1");
    // 빛나는 가구는 모두 켜기·끄기가 된다
    for (const f of FURNITURE.filter((x) => x.campOnly && x.light)) expect(CX_ACT[f.id]?.toggle, f.id).toBeDefined();
  });

  // 위쪽 한계(솟는 높이만큼 칸 위 — 벙커 침대 위층)는 그림 높이를 아는 게임 쪽 시험에서 본다 (campExclusiveGame.test)
  it("자리 선언: 네 방향 모두 차지 칸 안(또는 inside:false)의 좌표 (위로는 솟은 그림까지)", () => {
    for (const rows of Object.values(CX_ROWS))
      for (const r of rows) {
        const seats = r.act?.seats;
        if (!seats) continue;
        const def = furnitureById(r.id)!;
        for (const d of [0, 1, 2, 3] as const) {
          const fp = footprint(def, 4 + d);
          const list = seats(d, fp.w * 16, fp.h * 16);
          expect(list.length, `${r.id} d${d}`).toBeGreaterThan(0);
          for (const s of list)
            if (s.inside !== false) {
              expect(s.x, `${r.id} d${d}`).toBeGreaterThanOrEqual(0);
              expect(s.x).toBeLessThanOrEqual(fp.w * 16);
              expect(s.y).toBeGreaterThanOrEqual(-64);
              expect(s.y).toBeLessThanOrEqual(fp.h * 16);
            }
        }
      }
  });
});

describe("11/27 캠핑장 전용 가구 — 놓기 규칙 (validateLayout)", () => {
  const shape = (kind: CampHomeKind) => houseShape({ zone: "camp", tier: "small", camp: { kind, yard: 3 } });
  const base = (kind: CampHomeKind): HouseLayout => ({
    floor: `floor_${kind}`,
    wall: `wall_${kind}`,
    items: CAMP_STARTER[kind].map((p) => ({ ...p })),
  });
  /** 기본 가구와 안 겹치는 아래쪽 자리 */
  const add = (l: HouseLayout, i: string): HouseLayout => ({
    ...l,
    items: [...l.items, { u: "cx1", i, x: 1, y: 7, r: 4 }],
  });
  const lots = {
    cx_cv_camp_chair: 1,
    cx_pn_rocking: 1,
    cx_rr_cushion: 1,
    cx_cv_floor_check: 1,
    cx_cv_wall_cherry: 1,
    cx_pn_floor_log: 1,
  };

  it("그 종류 집에는 놓인다 (점수 = 값 ÷ 20)", () => {
    const v = validateLayout(add(base("caravan"), "cx_cv_camp_chair"), shape("caravan"), lots);
    expect(v).toMatchObject({ ok: true, placedScore: 30 });
  });

  it("다른 종류 캠핑장 집·마을 집·오두막에는 CAMP_ONLY로 거절 (어느 집 전용인지 알려 준다)", () => {
    const v1 = validateLayout(add(base("pension"), "cx_cv_camp_chair"), shape("pension"), lots);
    expect(v1).toEqual({
      ok: false,
      code: "CAMP_ONLY",
      message: "접이식 캠핑 의자: 카라반 전용 가구라 카라반에만 놓을 수 있어요.",
    });
    const village: HouseLayout = {
      floor: "floor_grass",
      wall: "wall_fence",
      items: [{ u: "a", i: "cx_rr_cushion", x: 1, y: 1, r: 4 }],
    };
    expect(validateLayout(village, "small", lots)).toMatchObject({
      ok: false,
      code: "CAMP_ONLY",
      message: expect.stringContaining("촌캉스에만"),
    });
    // 포구 오두막(houseShape — camp 없음)
    const sea = houseShape({ zone: "sea", tier: "small" });
    expect(
      validateLayout(
        {
          ...village,
          items: [{ u: "a", i: "cx_pn_rocking", x: 1, y: 1, r: 4 }],
        },
        sea,
        lots,
      ),
    ).toMatchObject({ ok: false, code: "CAMP_ONLY" });
  });

  it("전용 바닥·벽지도 그 종류 집에서만 (다른 집이면 CAMP_ONLY)", () => {
    expect(
      validateLayout(
        {
          ...base("caravan"),
          floor: "cx_cv_floor_check",
          wall: "cx_cv_wall_cherry",
        },
        shape("caravan"),
        lots,
      ),
    ).toMatchObject({ ok: true });
    expect(validateLayout({ ...base("rural"), floor: "cx_cv_floor_check" }, shape("rural"), lots)).toEqual({
      ok: false,
      code: "CAMP_ONLY",
      message: "레트로 체크 장판: 카라반 전용 바닥이라 카라반에만 깔 수 있어요.",
    });
    expect(validateLayout({ floor: "floor_grass", wall: "cx_cv_wall_cherry", items: [] }, "small", lots)).toMatchObject({
      code: "CAMP_ONLY",
      message: "빈티지 체리 패널: 카라반 전용 벽지라 카라반에만 바를 수 있어요.",
    });
    expect(validateLayout({ floor: "cx_pn_floor_log", wall: "wall_fence", items: [] }, "wide", lots)).toMatchObject({ code: "CAMP_ONLY" });
  });

  it("campOnlyBlock: 전용이 아니면·같은 종류면 null", () => {
    expect(campOnlyBlock(furnitureById("chair"), null)).toBeNull();
    expect(campOnlyBlock(furnitureById("cx_pn_stove"), "pension")).toBeNull();
    expect(campOnlyBlock(furnitureById("cx_pn_stove"), null)).toBe("펜션 장작 난로: 펜션 전용 가구라 펜션에만 놓을 수 있어요.");
  });
});
