import { beforeEach, describe, expect, it, vi } from "vitest";

// 11/23 낚시왕 판매 보너스 표: 낚시왕인 주에 잡은 만큼만, 판 만큼 빠지고, 다음 주엔 없다
const boards = vi.hoisted(() => ({ list: ["fish"] as string[] }));
vi.mock("../store/champ", () => ({ champBoardsSafe: async () => boards.list }));
import { recordKingCatch, resetKingFishForTest, takeKingCatch } from "./kingFish";

const WEEK1 = Date.UTC(2026, 10, 24, 3); // 화요일
const WEEK2 = WEEK1 + 7 * 86_400_000;

describe("낚시왕 판매 보너스 표 (lib/forage/kingFish)", () => {
  beforeEach(() => {
    resetKingFishForTest();
    boards.list = ["fish"];
  });

  it("낚시왕일 때 잡은 수만큼만 보너스, 판 만큼 빠진다", async () => {
    await recordKingCatch("a", ["f_carp", "f_carp", "f_carp~1"], WEEK1);
    expect(await takeKingCatch("a", { f_carp: 5, "f_carp~1": 1 }, WEEK1)).toEqual({ f_carp: 2, "f_carp~1": 1 });
    expect(await takeKingCatch("a", { f_carp: 5 }, WEEK1)).toEqual({});
  });

  it("낚시왕이 아닐 때 잡은 것은 기록되지 않는다", async () => {
    boards.list = [];
    await recordKingCatch("a", ["f_carp"], WEEK1);
    boards.list = ["fish"];
    expect(await takeKingCatch("a", { f_carp: 1 }, WEEK1)).toEqual({});
  });

  it("그 주에 잡아 다음 주에 팔면 보너스 없음", async () => {
    await recordKingCatch("a", ["f_carp"], WEEK1);
    expect(await takeKingCatch("a", { f_carp: 1 }, WEEK2)).toEqual({});
  });

  it("낚시왕이 끝난 뒤 팔면 보너스 없음", async () => {
    await recordKingCatch("a", ["f_carp"], WEEK1);
    boards.list = [];
    expect(await takeKingCatch("a", { f_carp: 1 }, WEEK1)).toEqual({});
  });
});
