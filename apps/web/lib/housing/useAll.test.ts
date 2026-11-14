import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { furnitureGrid } from "@/game/housing/art";
import { BUSH_FINDS, FRAME_LINES, houseTargets, pickPondSeat, pickTarget, POND_WATER_INSET, pondSeats, PRAY_LINES, USE_LABEL } from "@/game/housing/interact";
import { EMOTE_ICONS } from "@/game/sprites/emotes";
import { FURNITURE, tierById } from "./catalog";
import { roomPlan } from "./rooms";
import { liveStates, STATE_MAX, stateTarget } from "./states";
import type { HouseLayout, Placed } from "./types";

// 모든 가구 상호작용: 칸에 놓는 가구는 (디딤돌만 빼고) 모두 E로 할 수 있는 일이 있다. 연출만 하고 포인트·아이템은 주지 않는다

const F = { ox: 32, oy: 66 };
const small = tierById("small")!;
const plan = roomPlan(small);
const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_grass", wall: "wall_fence" });

describe("모든 가구 상호작용", () => {
  const placeable = FURNITURE.filter((f) => !f.skin && !f.ext);

  it("디딤돌(밟으면 발소리)만 빼고 모든 가구에 E로 할 수 있는 일이 있고, 상점에 그 일이 적혀 있다", () => {
    const missing: string[] = [];
    for (const f of placeable) {
      if (f.id === "stone_path") continue;
      const targets = houseTargets([{ u: "a1", i: f.id, x: 2, y: 2, r: 0 }], small, plan, F).filter((t) => t.u === "a1");
      if (!targets.length) missing.push(f.id);
      expect(f.use, f.id).toBeTruthy();
      for (const t of targets) expect(USE_LABEL[t.use]).toBeTruthy();
    }
    expect(missing).toEqual([]);
  });

  it("러그 위 소파 앞에 서면 러그보다 소파를 고른다 (바닥 물건은 뒤로)", () => {
    const items: Placed[] = [
      { u: "rg", i: "rug", x: 1, y: 2, r: 0 },
      { u: "so", i: "sofa", x: 1, y: 2, r: 0 },
    ];
    const targets = houseTargets(items, small, plan, F);
    const t = pickTarget(targets, F.ox + 1 * 16 + 10, F.oy + 3 * 16 + 4);
    expect(t?.u).toBe("so");
  });

  it("석등·촛대 켜기·끄기는 다른 상태처럼 저장된다 (값 1 = 꺼짐, 저장 안 됨 = 예전처럼 켜짐)", () => {
    expect(STATE_MAX.stone_lantern).toBe(1);
    expect(STATE_MAX.candles).toBe(1);
    const layout = lay([
      { u: "sl", i: "stone_lantern", x: 1, y: 1, r: 0 },
      { u: "cd", i: "candles", x: 3, y: 1, r: 0 },
    ]);
    const t = stateTarget(layout, "small", "sl");
    expect(t).toEqual({ s: "stone_lantern:1:1:0", max: 1 });
    expect(liveStates(layout, "small", { sl: { a: 1, s: t!.s } })).toEqual({ sl: 1 });
    // 옮기면(서명이 달라지면) 꺼짐 상태는 사라져 다시 켜진 모습
    expect(liveStates(layout, "small", { sl: { a: 1, s: "stone_lantern:2:1:0" } })).toEqual({});
    expect(liveStates(layout, "small", {})).toEqual({});
  });

  it("덤불·액자·비석 연출 문구와 감정 아이콘이 모두 있는 것", () => {
    for (const f of BUSH_FINDS) {
      expect(EMOTE_ICONS).toContain(f.emote);
      expect(f.line.length).toBeGreaterThan(3);
    }
    expect(FRAME_LINES.length).toBeGreaterThan(1);
    expect(PRAY_LINES.length).toBeGreaterThan(1);
  });
});

describe("연못가 앉기: 네 방향 물가", () => {
  const wide = tierById("wide")!;
  const T = 16;
  // 연못 둘레가 비어 있으면 서 있는 쪽 물가에 연못을 보고 앉는다 (가로·세로 연못 모두)
  it.each([
    ["가로", 0, 3, 2],
    ["세로", 1, 2, 3],
  ] as const)("%s 연못: 아래·위·왼쪽·오른쪽에서 E → 그쪽 물가, 연못을 바라본다", (_n, r, fw, fh) => {
    const pond: Placed = { u: "po", i: "pond", x: 3, y: 3, r };
    const L = F.ox + 3 * T;
    const Tp = F.oy + 3 * T;
    const cx = L + (fw * T) / 2;
    const cy = Tp + (fh * T) / 2;
    const from = {
      아래: [cx, Tp + fh * T + 10],
      위: [cx, Tp - 6],
      왼쪽: [L - 10, cy],
      오른쪽: [L + fw * T + 10, cy],
    } as const;
    const got = Object.fromEntries(
      Object.entries(from).map(([k, [x, y]]) => {
        const s = pickPondSeat(pond, [pond], wide, F, x, y)!;
        return [k, { side: s.side, facing: s.facing }];
      }),
    );
    expect(got).toEqual({
      아래: { side: 0, facing: DIR.up },
      위: { side: 1, facing: DIR.down },
      왼쪽: { side: 2, facing: DIR.right },
      오른쪽: { side: 3, facing: DIR.left },
    });
  });

  it("막힌 물가(벽·가구·칸막이)는 건너뛰고 다음으로 가까운 물가, 다른 사람이 앉은 물가도 피한다", () => {
    // 맨 위 줄 연못: 위쪽은 벽. 왼쪽에 책장
    const pond: Placed = { u: "po", i: "pond", x: 2, y: 0, r: 0 };
    const shelf: Placed = { u: "bs", i: "bookshelf", x: 0, y: 1, r: 0 };
    const items = [pond, shelf];
    const seats = pondSeats(pond, items, wide, F);
    expect(seats.map((s) => s.open)).toEqual([true, false, false, true]);
    // 위(벽 쪽)에 서서 눌러도 아래·오른쪽 중 가까운 곳
    const s = pickPondSeat(pond, items, wide, F, F.ox + 3.5 * T, F.oy - 2)!;
    expect([0, 3]).toContain(s.side);
    // 그 자리에 누가 앉아 있으면 다른 물가
    const s2 = pickPondSeat(pond, items, wide, F, F.ox + 3.5 * T, F.oy - 2, (x, y) => x === s.x && y === s.y)!;
    expect(s2.side).not.toBe(s.side);
    // 칸막이 너머(다른 방) 칸은 막힌 물가
    const plan = roomPlan(wide);
    const px = plan.partitions[0]?.x;
    if (px !== undefined) {
      const right = pondSeats({ u: "p2", i: "pond", x: px - 3, y: 4, r: 0 }, [], wide, F);
      expect(right[3].open).toBe(false);
    }
  });

  it.each([
    ["가로", 0, 3, 2],
    ["세로", 1, 2, 3],
    ["가로 뒤집힘", 2, 3, 2],
    ["세로 뒤집힘", 3, 2, 3],
  ] as const)("%s 연못: 네 물가 모두 발끝이 물 영역 안 (돌 테두리 안쪽), 앉는 자리는 돌 테두리 위", (_n, r, fw, fh) => {
    const pond: Placed = { u: "po", i: "pond", x: 3, y: 3, r };
    const L = F.ox + 3 * T;
    const Tp = F.oy + 3 * T;
    const R = L + fw * T;
    const B = Tp + fh * T;
    const inset = POND_WATER_INSET;
    for (const s of pondSeats(pond, [pond], wide, F)) {
      // 발끝(잔물결 자리)은 물 안
      expect(s.foot.x, `물가 ${s.side}`).toBeGreaterThanOrEqual(L + inset);
      expect(s.foot.x).toBeLessThanOrEqual(R - inset);
      expect(s.foot.y).toBeGreaterThanOrEqual(Tp + inset);
      expect(s.foot.y).toBeLessThanOrEqual(B - inset);
      // 앉는 자리는 물가 돌 테두리 근처 (물에서 6px 안쪽 이내 — 허공에 뜨지 않게)
      const dx = Math.max(L - s.x, s.x - R, 0);
      const dy = Math.max(Tp - s.y, s.y - B, 0);
      expect(Math.hypot(dx, dy), `물가 ${s.side}`).toBeLessThanOrEqual(2);
      // 발끝과 앉는 자리 사이가 붙어 있다 (몸 길이 안)
      expect(Math.hypot(s.foot.x - s.x, s.foot.y - s.y)).toBeLessThanOrEqual(8);
    }
  });
  it("연못 그림의 물은 가로·세로 모두 네 변에서 POND_WATER_INSET px 안쪽부터 (자리 계산과 그림이 맞는지)", () => {
    for (const v of ["", "v", "n", "v-n"]) {
      const g = furnitureGrid("pond", v)!;
      const water = (x: number, y: number) => {
        const p = g.get(x, y);
        const c = p >>> 8;
        return (p & 255) > 0 && (c & 255) >= ((c >> 16) & 255) + 15; // 푸른 물빛
      };
      const cx = Math.floor(g.w / 2);
      const cy = Math.floor(g.h / 2);
      let top = -1;
      for (let y = 0; y < g.h && top < 0; y++) if (water(cx, y)) top = y;
      let left = -1;
      for (let x = 0; x < g.w && left < 0; x++) if (water(x, cy)) left = x;
      expect(top, v).toBe(POND_WATER_INSET);
      expect(left, v).toBe(POND_WATER_INSET);
    }
  });
});
