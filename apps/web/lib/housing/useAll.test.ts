import { describe, expect, it } from "vitest";
import { BUSH_FINDS, FRAME_LINES, houseTargets, pickTarget, PRAY_LINES, USE_LABEL } from "@/game/housing/interact";
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
