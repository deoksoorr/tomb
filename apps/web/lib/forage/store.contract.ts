import { nanoid } from "nanoid";
import { afterAll, expect, it } from "vitest";
import type { ForageStore } from "./store";

// 저장소 계약: MemoryForageStore·RedisForageStore가 똑같이 지켜야 하는 동작 (store.test.ts가 두 구현에 돌린다).

export const DAY = "20261112";

export function contract(make: () => ForageStore, cleanup?: (ids: string[]) => Promise<void>) {
  const store = make();
  const used: string[] = [];
  const acct = () => {
    const id = `t-forage-${nanoid(8)}`;
    used.push(id);
    return id;
  };
  afterAll(async () => cleanup?.(used));

  it("빈 계정은 빈 가방·빈 도감·0인 오늘 기록", async () => {
    const a = acct();
    const s = await store.snapshot(a, DAY, 1);
    expect(s).toEqual({ bag: {}, dex: {}, claims: {}, day: { fishP: 0, gatherP: 0, dexP: 0, fish: 0, gather: 0 }, taken: [] });
    expect(await store.dex(a)).toEqual({ dex: {}, claims: {} });
  });

  it("시작 → 끝내기: 같은 티켓은 한 번만, 새로 시작하면 이전 것은 stale, 시간당 한도", async () => {
    const a = acct();
    expect(await store.begin(a, "n1", '{"k":"fish","sp":"f_carp","sz":420}', 60, "h1", 3)).toBe(true);
    expect(await store.claim(a, "n1")).toEqual({ status: "ok", payload: '{"k":"fish","sp":"f_carp","sz":420}' });
    expect(await store.claim(a, "n1")).toEqual({ status: "reused" });
    // 새로 시작하면 이전 기록은 끝난다
    expect(await store.begin(a, "n2", "{}", 60, "h1", 3)).toBe(true);
    expect(await store.begin(a, "n3", "{}", 60, "h1", 3)).toBe(true);
    expect(await store.claim(a, "n2")).toEqual({ status: "stale" });
    // 접두어가 같아도 다른 판이면 stale ("n3x"는 "n3|"로 시작하지 않는다)
    expect(await store.claim(a, "n3x")).toEqual({ status: "stale" });
    expect(await store.claim(a, "n3")).toEqual({ status: "ok", payload: "{}" });
    // 시간당 3번까지 (넷째는 거절, 다른 시간 칸은 새로)
    expect(await store.begin(a, "n4", "{}", 60, "h1", 3)).toBe(false);
    expect(await store.begin(a, "n5", "{}", 60, "h2", 3)).toBe(true);
  });

  it("잡은 것 넣기: 가방·도감(처음·최대 크기·처음 날)·오늘 잡은 수", async () => {
    const a = acct();
    const g1 = await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 420 }], 99);
    expect(g1).toEqual([{ id: "f_carp", size: 420, kept: true, isNew: true, record: false }]);
    const g2 = await store.grant(a, "20261113", "fish", [{ id: "f_carp", size: 300 }], 99);
    expect(g2).toEqual([{ id: "f_carp", size: 300, kept: true, isNew: false, record: false }]);
    const g3 = await store.grant(a, "20261113", "fish", [{ id: "f_carp", size: 610 }], 99);
    expect(g3?.[0]).toMatchObject({ isNew: false, record: true });
    // 크기 없는 것 (채집물) 두 개를 한 번에
    const g4 = await store.grant(a, DAY, "gather", [{ id: "h_mugwort", size: 0 }, { id: "h_mugwort", size: 0 }], 99);
    expect(g4).toEqual([
      { id: "h_mugwort", size: 0, kept: true, isNew: true, record: false },
      { id: "h_mugwort", size: 0, kept: true, isNew: false, record: false },
    ]);
    const s = await store.snapshot(a, DAY, 1);
    expect(s.bag).toEqual({ f_carp: 3, h_mugwort: 2 });
    expect(s.dex).toEqual({ f_carp: { n: 3, max: 610, first: DAY }, h_mugwort: { n: 2, max: 0, first: DAY } });
    expect(s.day).toMatchObject({ fish: 1, gather: 2 });
    expect((await store.snapshot(a, "20261113", 1)).day.fish).toBe(2);
  });

  it("한 칸이 가득 차면 가방에는 안 들어가도 도감엔 남는다", async () => {
    const a = acct();
    await store.grant(a, DAY, "fish", [{ id: "f_shoe", size: 0 }, { id: "f_shoe", size: 0 }], 2);
    const g = await store.grant(a, DAY, "fish", [{ id: "f_shoe", size: 0 }], 2);
    expect(g?.[0]).toMatchObject({ kept: false, isNew: false });
    const s = await store.snapshot(a, DAY, 1);
    expect(s.bag.f_shoe).toBe(2);
    expect(s.dex.f_shoe.n).toBe(3);
  });

  it("채집 지점: 한 창에 한 번만 (두 번째는 null, 아무것도 넣지 않는다), 빈손이어도 캔 것으로", async () => {
    const a = acct();
    expect(await store.grant(a, DAY, "gather", [{ id: "o_coal", size: 0 }], 99, { window: 7, node: "o48_200" })).not.toBeNull();
    expect(await store.grant(a, DAY, "gather", [{ id: "o_coal", size: 0 }], 99, { window: 7, node: "o48_200" })).toBeNull();
    expect(await store.grant(a, DAY, "gather", [], 99, { window: 7, node: "b874_1088" })).toEqual([]);
    // 다른 창이면 또 캘 수 있다
    expect(await store.grant(a, DAY, "gather", [{ id: "o_coal", size: 0 }], 99, { window: 8, node: "o48_200" })).not.toBeNull();
    const s7 = await store.snapshot(a, DAY, 7);
    expect(s7.taken.sort()).toEqual(["b874_1088", "o48_200"]);
    expect(s7.bag.o_coal).toBe(2);
    expect(s7.day.gather).toBe(2);
  });

  it("가방에서 꺼내기는 전부 있을 때만 한 번에, 되돌리기는 칸 상한까지", async () => {
    const a = acct();
    await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 1 }, { id: "f_carp", size: 1 }, { id: "f_koi", size: 1 }], 99);
    expect(await store.remove(a, { f_carp: 2, f_koi: 2 })).toBe(false);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 2, f_koi: 1 });
    expect(await store.remove(a, { f_carp: 1, f_koi: 1 })).toBe(true);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 1 });
    await store.restore(a, { f_koi: 1, f_carp: 5 }, 3);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 3, f_koi: 1 });
  });

  it("오늘 판 포인트·도감 보상은 한 번만", async () => {
    const a = acct();
    await store.addDay(a, DAY, "fishP", 12);
    await store.addDay(a, DAY, "fishP", 5);
    await store.addDay(a, DAY, "dexP", 20);
    expect((await store.snapshot(a, DAY, 1)).day).toMatchObject({ fishP: 17, dexP: 20, gatherP: 0 });
    expect(await store.claimDex(a, "fish:25", DAY)).toBe(true);
    expect(await store.claimDex(a, "fish:25", DAY)).toBe(false);
    expect((await store.dex(a)).claims).toEqual({ "fish:25": DAY });
  });

  it("동시에 같은 티켓을 내도 하나만 ok", async () => {
    const a = acct();
    await store.begin(a, "race", '{"x":1}', 60, "h", 100);
    const r = await Promise.all(Array.from({ length: 5 }, () => store.claim(a, "race")));
    expect(r.filter((x) => x.status === "ok")).toHaveLength(1);
  });
}
