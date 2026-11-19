import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { grantTowerRun } from "./service";
import { isChestFloor, TOWER_CHEST_FROM } from "./tower";
import { getRpgStore } from "./store";

// 11/15 관리자 대신 정산: 서버가 잘못 거절한 판을 판 끝과 같은 정산으로 (최고 층·초월 판·우두머리 상자)

describe("야근 빌딩 대신 정산 (관리자)", () => {
  it(`1층부터 30층을 깬 판: 최고 층 30, 우두머리 상자는 ${TOWER_CHEST_FROM}층부터라 그 위 우두머리 층만(11/19), 초월 EXP`, async () => {
    const a = `towergrant-${nanoid(8)}`;
    await getRpgStore().update(a, (s) => ({ state: { ...s, level: 50, exp: 0 }, result: null }));
    const r = await grantTowerRun(a, { start: 1, floors: 30, floorMs: 950_000 });
    expect(r.reward.tower?.best).toBe(30);
    expect(r.reward.tower?.newBest).toBe(true);
    expect(r.reward.tower?.chests).toEqual(Array.from({ length: 30 }, (_, i) => i + 1).filter(isChestFloor));
    expect(r.reward.transcend?.exp ?? 0).toBeGreaterThan(0);
    const s = await getRpgStore().get(a);
    expect(s.fBest).toBe(30);
  });
});
