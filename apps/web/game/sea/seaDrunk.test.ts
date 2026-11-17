import { describe, expect, it } from "vitest";
import { DRUNK_STEP_MS, SEA_PIER, SEA_PIER_END, seaWet, tideLineY } from "@tomb/protocol";
import { SEA_DRUNK_MSG, seaDrunkBlocked, seaDrunkStep, seaShorePoint } from "./seaDrunk";
import { seaStandable } from "./seaLayout";

// 11/17 사용자: 술 마시면 바다 놀이 금지
describe("seaDrunk (11/17)", () => {
  it("취기가 한 단계라도 남았으면 막고, 다 깨면 풀려요", () => {
    expect(seaDrunkBlocked(undefined, 0)).toBe(false);
    expect(seaDrunkBlocked({ lv: 1, at: 0 }, DRUNK_STEP_MS - 1)).toBe(true);
    expect(seaDrunkBlocked({ lv: 1, at: 0 }, DRUNK_STEP_MS)).toBe(false);
    expect(seaDrunkBlocked({ lv: 3, at: 0 }, DRUNK_STEP_MS * 2.5)).toBe(true);
    expect(SEA_DRUNK_MSG).toBe("술 마시고 물에 들어가면 위험해요. 술이 깬 뒤에 다시 와요.");
  });

  it("물가에서 한 걸음 들어서면 지난 마른 자리로 되돌려요", () => {
    const level = 1;
    const shore = tideLineY(level);
    const x = 500;
    const dryY = shore;
    const wetY = shore + 14;
    expect(seaWet(x, dryY, level)).toBe(false);
    expect(seaWet(x, wetY, level)).toBe(true);
    expect(seaDrunkStep(x, dryY, null, level, seaStandable)).toEqual({ kind: "ok" });
    expect(seaDrunkStep(x, wetY, { x, y: dryY }, level, seaStandable)).toEqual({ kind: "back", x, y: dryY });
  });

  it("이미 물속(먼바다)이면 가까운 뭍으로 올려요 — 마른 곳·걸을 수 있는 곳", () => {
    for (const level of [0, 0.5, 1])
      for (const [x, y] of [
        [500, 860],
        [1200, 800],
        [100, 900],
        [SEA_PIER.x - 30, SEA_PIER_END.y + 20],
      ]) {
        const s = seaDrunkStep(x, y, null, level, seaStandable);
        expect(s.kind).toBe("shore");
        if (s.kind !== "shore") continue;
        expect(seaWet(s.x, s.y, level)).toBe(false);
        expect(seaStandable(s.x, s.y)).toBe(true);
      }
  });

  it("뭍을 못 찾으면 stuck", () => {
    expect(seaShorePoint(500, 860, 1, () => false)).toBeNull();
  });
});
