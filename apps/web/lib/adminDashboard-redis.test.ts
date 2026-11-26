import { afterAll, describe, expect, it } from "vitest";
import { loadDashboard } from "./adminDashboard";
import { env } from "./env";
import { getHouseStore } from "./housing/service";
import { HK, RedisHouseStore } from "./housing/store-redis";
import { redisClient } from "./redisUsage";

// 11/26 관리자 대시보드 (실제 Redis — 일회용 DB): 집터 색인 파이프라인(HKEYS·HLEN) 응답 모양과 나머지 칸(맵 컨셉·접속 종료·가입 유입)
const conn = env.redis();

describe.skipIf(!conn)("관리자 대시보드 (실제 Redis)", () => {
  const store = getHouseStore();
  const made: string[] = [];
  afterAll(async () => {
    for (const id of made) await store.remove(id);
  });

  it("9채널 캠핑장 카라반 1·펜션 1·촌캉스 1, 바닷가 1, 마을 1을 센다", async () => {
    expect(store).toBeInstanceOf(RedisHouseStore);
    const now = Date.now();
    const mk = async (n: number, lot: number, zone?: "camp" | "sea", kind?: "caravan" | "pension" | "rural") => {
      const id = `dashr-h${n}-${now}`;
      made.push(id);
      const r = await store.create({
        id,
        owner: `dashr-o${n}-${now}`,
        name: "집",
        intro: "",
        ownerName: "주인",
        tier: "small",
        ch: 9,
        lot,
        now,
        zone,
        ...(kind ? { camp: { kind, yard: 1 as const } } : {}),
      });
      expect(r).toEqual({ lot });
    };
    await mk(1, 3, "camp", "caravan");
    await mk(2, 14, "camp", "pension");
    await mk(3, 16, "camp", "rural");
    await mk(4, 2, "sea");
    await mk(5, 5);
    // 11/27 철거한 집이 남긴 낡은 색인 칸 (가리키는 집 기록이 없다) — 마을 분양으로 세지 않는다 (운영 「2채널 마을 1」)
    const raw = redisClient(conn!, "test");
    await raw.hset(HK.lots(9), { "7": `dashr-gone-${now}` });
    const d = await loadDashboard(now + 10 * 60_000); // 1분 기억 밖
    expect(d.housing?.rows.find((r) => r.ch === 9)).toEqual({ ch: 9, camp: { caravan: 1, pension: 1, rural: 1 }, sea: 1, village: 1 });
    await raw.hdel(HK.lots(9), "7");
    expect(d.concept).toBe("default");
    expect(d.conn).not.toBeNull();
    expect(d.signups).toEqual(expect.objectContaining({ today: expect.any(Array), week: expect.any(Array) }));
  });
});
