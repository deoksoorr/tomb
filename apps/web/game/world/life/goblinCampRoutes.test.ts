import { CAMP_GOBLIN_ROUTES, inCampStream } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { campStandable, campWalkGrid } from "../../camp/campLayout";
import { checkGoblinRoutes } from "./goblinRouteCheck";

// 11/26 황금 고블린 캠핑장 길 (임시). ★ 캠핑장 맵 개편으로 이 시험이 깨지면 protocol goblinMaps.ts campGoblinRoutes()만 새 땅에 맞춘다.

describe("11/26 goblin routes on the camp map", () => {
  it("standable, off the stream, hops never blocked", () => {
    expect(CAMP_GOBLIN_ROUTES.length).toBeGreaterThanOrEqual(2);
    checkGoblinRoutes(CAMP_GOBLIN_ROUTES, campStandable, (x, y) => inCampStream(x, y, 6), campWalkGrid(8));
  });
});
