import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getHuntLevelStore } from "@/lib/huntLevelRank";
import { getRpgStore } from "@/lib/rpg/store";
import type { AdminRankFillResponse } from "./admin/rank/fill/route";
import * as fill from "./admin/rank/fill/route";

// 관리자 「운영 점검」 랭킹 다시 채우기 API (메모리 구성으로 라우트를 직접 부른다)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
});

const call = (body: unknown, admin = true) =>
  new NextRequest("http://localhost/api/admin/rank/fill", {
    method: "POST",
    headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": "dev-admin" } : {}) },
    body: JSON.stringify(body),
  });

describe("랭킹 다시 채우기 API", () => {
  it("관리자만 부를 수 있고, 모르는 랭킹은 거절한다", async () => {
    expect((await fill.POST(call({ board: "huntLevel" }, false))).status).toBe(401);
    expect((await fill.POST(call({ board: "points" }))).status).toBe(400);
  });

  it("사냥 저장소를 끝까지 훑어 레벨 랭킹에 적는다", async () => {
    await getRpgStore().update("fill-test-hero", (s) => ({ state: { ...s, level: 7, exp: 3, runs: 2 }, result: null }));
    let cursor = "0";
    let filled = 0;
    do {
      const res = await fill.POST(call({ board: "huntLevel", cursor }));
      expect(res.status).toBe(200);
      const r = (await res.json()) as AdminRankFillResponse;
      cursor = r.next;
      filled += r.filled;
    } while (cursor !== "0");
    expect(filled).toBeGreaterThanOrEqual(1);
    expect(await getHuntLevelStore().scoresOf(["fill-test-hero"])).toEqual([7e9 + 3]);
    // 꾸미기 랭킹도 같은 방식으로 돈다
    expect((await fill.POST(call({ board: "look" }))).status).toBe(200);
  });
});
