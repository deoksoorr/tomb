import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, SEA_ARRIVE } from "@tomb/protocol";
import { findPath } from "../logic/pathfind";
import { campWalkGrid } from "../camp/campLayout";
import { seaWalkGrid } from "../sea/seaLayout";
import { awayRouteTargets, gridOfCells, sellerRoute } from "./awayRouteMath";

// 11/26 캠핑장·바닷가 「팔기」 길 안내: 그 맵 상인까지 걸어서 가는 길이 있다
describe("AwayRoute — 「팔기」 길 안내", () => {
  it("캠핑장은 낚시터 사장님, 바닷가는 해녀 할망 앞 (팔기 목적지만)", () => {
    expect(awayRouteTargets).toEqual(["seller"]);
    expect(sellerRoute("camp", CAMP_ARRIVE)?.label).toBe("낚시터 사장님");
    expect(sellerRoute("sea", SEA_ARRIVE)?.label).toBe("해녀 할망");
  });
  it("정류장에서 상인 앞까지 물을 피해 걷는 길이 있다", () => {
    const camp = sellerRoute("camp", CAMP_ARRIVE)!.goals[0];
    expect(findPath(gridOfCells(campWalkGrid(8, false)), CAMP_ARRIVE, camp)?.length).toBeGreaterThan(0);
    const sea = sellerRoute("sea", SEA_ARRIVE)!.goals[0];
    expect(findPath(gridOfCells(seaWalkGrid(8)), SEA_ARRIVE, sea)?.length).toBeGreaterThan(0);
  });
});
