import { nanoid } from "nanoid";
import { afterAll, expect, it } from "vitest";
import { BAG_MAX, DEX_EXPANSION_IDS, DEX_REWARD, dexBadgeBits, dexIdsOf, dexRewardOf, isCampSpecies, speciesOf } from "./catalog";
import { titlesOf } from "./dexReward";
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
    const pay = { settled: null, pending: {}, paid: {}, marks: [] };
    expect(s).toEqual({ bag: {}, dex: {}, claims: {}, pay, day: { fish: 0, gather: 0, auto: 0 }, took: [] });
    expect(await store.dex(a)).toEqual({ dex: {}, claims: {}, pay });
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

  it("11/18 끝내지 않은 낚시를 덮어쓰면 replacedFish (끝낸 낚시·채집을 덮으면 true)", async () => {
    const a = acct();
    const fish = '{"k":"fish","sp":"f_carp","sz":420}';
    expect(await store.begin(a, "f1", fish, 60, "h", 10)).toBe(true);
    expect(await store.begin(a, "f2", fish, 60, "h", 10)).toBe("replacedFish");
    expect((await store.claim(a, "f2")).status).toBe("ok");
    expect(await store.begin(a, "g1", '{"k":"gather"}', 60, "h", 10)).toBe(true);
    expect(await store.begin(a, "f3", fish, 60, "h", 10)).toBe(true);
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

  it("today: 오늘 기록·이번 묶음의 캔 자리 기록은 snapshot과 같다", async () => {
    const a = acct();
    expect(await store.today(a, DAY, 3)).toEqual({ day: { fish: 0, gather: 0, auto: 0 }, took: [] });
    await store.grant(a, DAY, "gather", [{ id: "h_mugwort", size: 0 }], 99, { window: 3, node: "n_a" });
    await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 400 }], 99);
    const t = await store.today(a, DAY, 3);
    const s = await store.snapshot(a, DAY, 3);
    expect(t).toEqual({ day: s.day, took: s.took });
    expect(t.took).toEqual(["3:n_a"]);
    expect(t.day).toMatchObject({ fish: 1, gather: 1 });
    // 11/22 기록은 `${창}:${지점}` 그대로 — 같은 묶음(창 3·4·5)이면 같이 보이고, 지점마다 어느 창을 볼지는 규칙이 정한다 (rules takenNow)
    expect((await store.today(a, DAY, 4)).took).toEqual(["3:n_a"]);
    expect((await store.today(a, DAY, 6)).took).toEqual([]);
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
    expect(s7.took.sort()).toEqual(["7:b874_1088", "7:o48_200", "8:o48_200"]);
    // 11/16 창 셋(6·7·8)이 한 키에 묶여도 창마다 따로 센다. 다음 묶음(9)은 빈 키
    expect((await store.today(a, DAY, 6)).took.sort()).toEqual(s7.took);
    expect((await store.today(a, DAY, 9)).took).toEqual([]);
    // 11/22 긴급 의뢰 5분 창(음수 id)은 자기가 든 10분 창의 묶음에, 10분 창 기록과 따로 센다
    // 5분 창 번호 15 → id −16 (10분 창 7 안)
    expect(await store.grant(a, DAY, "gather", [{ id: "o_coal", size: 0 }], 99, { window: -16, node: "o48_200" })).not.toBeNull();
    expect(await store.grant(a, DAY, "gather", [{ id: "o_coal", size: 0 }], 99, { window: -16, node: "o48_200" })).toBeNull();
    expect((await store.today(a, DAY, 7)).took).toContain("-16:o48_200");
    expect((await store.today(a, DAY, 9)).took).toEqual([]);
    expect(s7.bag.o_coal).toBe(2);
    expect((await store.snapshot(a, DAY, 7)).bag.o_coal).toBe(3);
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

  it("11/22 대물·월척: 가방은 등급 칸(`~1`·`~2`)에 따로, 도감·최대 크기는 종 id로. 꺼내기·되돌리기도 등급 칸 그대로", async () => {
    const a = acct();
    const g = await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 700, grade: 1 }], 99);
    expect(g).toEqual([{ id: "f_carp", size: 700, kept: true, isNew: true, record: false, grade: 1 }]);
    await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 820, grade: 2 }, { id: "f_carp", size: 820, grade: 2 }, { id: "f_carp", size: 400 }], 99);
    const s = await store.snapshot(a, DAY, 1);
    expect(s.bag).toEqual({ f_carp: 1, "f_carp~1": 1, "f_carp~2": 2 });
    expect(s.dex.f_carp).toEqual({ n: 4, max: 820, first: DAY });
    expect(Object.keys(s.dex)).toEqual(["f_carp"]);
    expect(s.day.fish).toBe(4);
    // 꺼내기는 칸 id 그대로 (보통이 모자라면 대물에서 빼지 않는다)
    expect(await store.remove(a, { f_carp: 2 })).toBe(false);
    expect(await store.remove(a, { "f_carp~2": 1, f_carp: 1 })).toBe(true);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ "f_carp~1": 1, "f_carp~2": 1 });
    // 되돌리기도 칸마다 상한 (등급 칸도 한 칸)
    await store.restore(a, { "f_carp~2": 5, f_carp: 1 }, 3);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 1, "f_carp~1": 1, "f_carp~2": 3 });
  });

  it("11/22 한 칸 상한은 등급 칸마다, 가방 전체(BAG_MAX)는 등급 칸까지 합쳐서", async () => {
    const a = acct();
    await store.grant(a, DAY, "fish", Array.from({ length: 3 }, () => ({ id: "f_carp", size: 900, grade: 2 as const })), 2);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ "f_carp~2": 2 });
    await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 1 }], 2);
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 1, "f_carp~2": 2 });
    const ids = speciesOf("fish").filter((s) => !s.junk && s.id !== "f_carp").map((s) => s.id).slice(0, Math.ceil(BAG_MAX / 99));
    for (const id of ids) await store.grant(a, DAY, "fish", Array.from({ length: 99 }, () => ({ id, size: 100 })), 99);
    const s = await store.snapshot(a, DAY, 1);
    expect(Object.values(s.bag).reduce((n, v) => n + v, 0)).toBe(BAG_MAX);
    const g = await store.grant(a, DAY, "fish", [{ id: "f_carp", size: 900, grade: 1 }], 99);
    expect(g?.[0]).toMatchObject({ kept: false, grade: 1 });
    expect((await store.snapshot(a, DAY, 1)).bag["f_carp~1"]).toBeUndefined();
  });

  it("11/22 자동 낚시는 등급을 넘겨도 늘 보통 칸에", async () => {
    const a = acct();
    const r = await store.grantAuto(a, DAY, [{ id: "f_carp", size: 840, grade: 2 }], 99);
    expect(r[0].grade).toBeUndefined();
    expect((await store.snapshot(a, DAY, 1)).bag).toEqual({ f_carp: 1 });
  });

  it("오늘 낚은 수 더하기·예전 단계 보상 표시는 한 번만", async () => {
    const a = acct();
    await store.addDay(a, DAY, "fish", 2);
    await store.addDay(a, DAY, "fish", 1);
    expect((await store.snapshot(a, DAY, 1)).day).toEqual({ fish: 3, gather: 0, auto: 0 });
    expect(await store.claimDex(a, "fish:25", DAY)).toBe(true);
    expect(await store.claimDex(a, "fish:25", DAY)).toBe(false);
    expect((await store.dex(a)).claims).toEqual({ "fish:25": DAY });
  });

  it("자동 낚시 세션: 이전 값과 같을 때만 바꾼다 (없음 → 만들기, 다른 값이면 거절, null이면 지움)", async () => {
    const a = acct();
    expect(await store.autoGet(a)).toBeNull();
    expect(await store.autoSwap(a, "x", "y")).toBe(false);
    expect(await store.autoSwap(a, null, "s1")).toBe(true);
    expect(await store.autoSwap(a, null, "s2")).toBe(false);
    expect(await store.autoGet(a)).toBe("s1");
    expect(await store.autoSwap(a, "s1", "s2")).toBe(true);
    expect(await store.autoSwap(a, "s1", "s3")).toBe(false);
    expect(await store.autoSwap(a, "s2", null)).toBe(true);
    expect(await store.autoGet(a)).toBeNull();
    // 동시에 같은 값에서 바꾸면 하나만
    await store.autoSwap(a, null, "base");
    const r = await Promise.all(Array.from({ length: 5 }, (_, i) => store.autoSwap(a, "base", `n${i}`)));
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it("11/19 가방 전체 한도: 물고기·채집물 합이 BAG_MAX면 직접 잡은 것은 놓아주고(도감은 남김) 자동 낚시는 쉰다", async () => {
    const a = acct();
    const ids = ["f_carp", "f_crucian", "f_catfish", "f_trout"];
    // 종마다 99까지 → 넷이면 396이라 BAG_MAX(300)에서 막힌다
    for (const id of ids) await store.grant(a, DAY, "fish", Array.from({ length: 99 }, () => ({ id, size: 100 })), 99);
    let s = await store.snapshot(a, DAY, 1);
    expect(Object.values(s.bag).reduce((n, v) => n + v, 0)).toBe(BAG_MAX);
    expect(s.dex.f_trout.n).toBe(99);
    // 직접: 넣지 못해도 도감·오늘 수는 센다
    const g = await store.grant(a, DAY, "gather", [{ id: "h_mugwort", size: 0 }], 99);
    expect(g?.[0]).toMatchObject({ kept: false, isNew: true });
    // 자동: 쉰다 (오늘 수·도감 그대로)
    const before = (await store.snapshot(a, DAY, 1)).day;
    const r = await store.grantAuto(a, DAY, [{ id: "f_carp", size: 900 }, { id: "@x", size: 0 }], 99);
    expect(r.every((x) => x.rest && !x.kept)).toBe(true);
    s = await store.snapshot(a, DAY, 1);
    expect(s.day).toEqual(before);
    expect(s.dex.f_carp.max).toBe(100);
    // 팔아서 비우면 다시 넣는다
    expect(await store.remove(a, { f_carp: 2 })).toBe(true);
    const r2 = await store.grantAuto(a, DAY, [{ id: "f_carp", size: 100 }, { id: "f_carp", size: 100 }, { id: "f_carp", size: 100 }], 99);
    expect(r2.map((x) => [x.kept, !!x.rest])).toEqual([[true, false], [true, false], [false, true]]);
  });

  it("자동 낚시 넣기: 한도 없이 전부 (11/19), 오늘 수를 올리고 도감 최대 크기도 기록한다", async () => {
    const a = acct();
    const fish = (n: number, size = 500) => Array.from({ length: n }, () => ({ id: "f_carp", size }));
    const g1 = await store.grantAuto(a, DAY, fish(3), 99);
    expect(g1).toEqual([
      { id: "f_carp", size: 500, kept: true, isNew: true, record: false },
      { id: "f_carp", size: 500, kept: true, isNew: false, record: false },
      { id: "f_carp", size: 500, kept: true, isNew: false, record: false },
    ]);
    // 예전 하루 75마리 한도를 넘겨도 다 들어간다
    expect(await store.grantAuto(a, DAY, fish(80), 99)).toHaveLength(80);
    expect(await store.grantAuto(a, DAY, fish(1), 99)).toHaveLength(1);
    let s = await store.snapshot(a, DAY, 1);
    expect(s.day).toMatchObject({ fish: 84, auto: 84 });
    expect(s.dex.f_carp).toEqual({ n: 84, max: 500, first: DAY });
    expect(s.bag.f_carp).toBe(84);
    // 직접 낚은 것과 합쳐서 센다 (보여 주기만)
    await store.grant(a, "20261113", "fish", fish(8, 300), 99);
    expect(await store.grantAuto(a, "20261113", fish(5), 99)).toHaveLength(5);
    s = await store.snapshot(a, "20261113", 1);
    expect(s.day).toMatchObject({ fish: 13, auto: 5 });
    expect(s.dex.f_carp.max).toBe(500); // 더 작은 크기는 최대 기록을 바꾸지 않는다
    // 더 큰 크기면 최대 기록을 바꾸고 record (처음 기록일 땐 record 아님 — 직접 낚을 때와 같다)
    expect(await store.grantAuto(a, "20261114", [{ id: "f_carp", size: 640 }, { id: "f_koi", size: 300 }], 99)).toEqual([
      { id: "f_carp", size: 640, kept: true, isNew: false, record: true },
      { id: "f_koi", size: 300, kept: true, isNew: true, record: false },
    ]);
    expect((await store.snapshot(a, "20261114", 1)).dex.f_carp.max).toBe(640);
    // "@"(물에 빠진 꾸미기 자리)는 낚은 수만 세고 가방·도감은 그대로
    const b = acct();
    expect(await store.grantAuto(b, DAY, [{ id: "@hat_cat", size: 0 }, { id: "f_carp", size: 1 }], 99)).toEqual([
      { id: "@hat_cat", size: 0, kept: false, isNew: false, record: false },
      { id: "f_carp", size: 1, kept: true, isNew: true, record: false },
    ]);
    const sb = await store.snapshot(b, DAY, 1);
    expect(sb.day).toMatchObject({ fish: 2, auto: 2 });
    expect(sb.bag).toEqual({ f_carp: 1 });
    expect(Object.keys(sb.dex)).toEqual(["f_carp"]);
  });

  it("도감 보상 전환 정산: 정산 전 등록은 쌓지 않고, 정산이 (등록 보상 합 − 받은 단계 보상)을 칸마다 한 번만 (음수는 0)", async () => {
    const a = acct();
    const fish = speciesOf("fish").filter((s) => !s.junk);
    const ten = fish.slice(0, 10);
    const sum = ten.reduce((n, s) => n + dexRewardOf(s.id), 0);
    await store.grant(a, DAY, "fish", ten.map((s) => ({ id: s.id, size: 0 })), 99);
    await store.addStars(a, DAY, [{ id: "c_gym", perfect: false }]);
    // 정산 전: 등록해도 받을 보상은 그대로
    expect((await store.dexPay(a)).pending).toEqual({});
    // 예전 단계 보상: 물고기 25% (20P), 곤충 25·50% (60P, 곤충은 하나도 등록 안 함 → 음수 → 0)
    await store.claimDex(a, "fish:25", "20261101");
    await store.claimDex(a, "bug:25", "20261101");
    await store.claimDex(a, "bug:50", "20261101");
    const owed = await store.settleDex(a, DAY);
    expect(owed).toMatchObject({ fish: sum - DEX_REWARD[25], bug: 0, star: dexRewardOf("c_gym"), herb: 0 });
    const pay = await store.dexPay(a);
    expect(pay.settled).toBe(DAY);
    expect(pay.pending).toEqual({ fish: sum - DEX_REWARD[25], star: dexRewardOf("c_gym") });
    // 두 번째는 아무것도 하지 않는다 (동시에 불러도 하나만)
    expect(await store.settleDex(a, DAY)).toBeNull();
    const again = await Promise.all([store.settleDex(a, DAY), store.settleDex(a, DAY)]);
    expect(again).toEqual([null, null]);
    expect((await store.dexPay(a)).pending).toEqual(pay.pending);
    // 예전 기록은 그대로 남는다
    expect((await store.dex(a)).claims).toEqual({ "fish:25": "20261101", "bug:25": "20261101", "bug:50": "20261101" });

    const b = acct();
    const races = await Promise.all(Array.from({ length: 4 }, () => store.settleDex(b, DAY)));
    expect(races.filter((r) => r !== null)).toHaveLength(1);
  });

  it("정산한 계정은 등록하는 순간 그 종의 보상이 받을 보상에 쌓인다 (낚시·채집·자동·별자리, 두 번째부터는 없음)", async () => {
    const a = acct();
    await store.settleDex(a, DAY);
    const [f1, f2] = speciesOf("fish").filter((s) => !s.junk);
    const herb = speciesOf("herb")[0];
    await store.grant(a, DAY, "fish", [{ id: f1.id, size: 10 }, { id: f1.id, size: 20 }], 99);
    await store.grant(a, DAY, "gather", [{ id: herb.id, size: 0 }], 99, { window: 3, node: "n1" });
    await store.grantAuto(a, DAY, [{ id: "@hat_x", size: 0 }, { id: f2.id, size: 5 }, { id: f1.id, size: 5 }], 99);
    await store.addStars(a, DAY, [{ id: "c_gym", perfect: false }, { id: "c_gym", perfect: true }]);
    expect((await store.dexPay(a)).pending).toEqual({
      fish: dexRewardOf(f1.id) + dexRewardOf(f2.id),
      herb: dexRewardOf(herb.id),
      star: dexRewardOf("c_gym"),
    });
    // 이미 캔 자리(taken)면 등록도 보상도 없다
    expect(await store.grant(a, DAY, "gather", [{ id: speciesOf("herb")[1].id, size: 0 }], 99, { window: 3, node: "n1" })).toBeNull();
    expect((await store.dexPay(a)).pending.herb).toBe(dexRewardOf(herb.id));
    expect(dexIdsOf("star")).toContain("c_gym");
  });

  it("받을 보상 꺼내기: 동시에 꺼내도 합이 쌓인 값을 넘지 않고, 못 들어간 만큼은 되돌리며 받은 기록이 쌓인다", async () => {
    const a = acct();
    await store.settleDex(a, DAY);
    const ones = speciesOf("ore").slice(0, 6);
    await store.grant(a, DAY, "gather", ones.map((s) => ({ id: s.id, size: 0 })), 99);
    const total = ones.reduce((n, s) => n + dexRewardOf(s.id), 0);
    expect((await store.dexPay(a)).pending.ore).toBe(total);
    expect(await store.takeDexPending(a, "ore", 0)).toBe(0);
    expect(await store.takeDexPending(a, "fish", 100)).toBe(0);
    const takes = await Promise.all(Array.from({ length: 6 }, () => store.takeDexPending(a, "ore", Number.MAX_SAFE_INTEGER)));
    expect(takes.reduce((x, y) => x + y, 0)).toBe(total);
    expect(takes.filter((t) => t > 0)).toHaveLength(1);
    expect((await store.dexPay(a)).pending.ore).toBeUndefined();
    // 꺼낸 total 중 5만 지갑에 → 나머지는 되돌린다
    await store.dexPaid(a, "ore", total, 5);
    let pay = await store.dexPay(a);
    expect(pay.pending.ore).toBe(total - 5);
    expect(pay.paid.ore).toBe(5);
    expect(await store.takeDexPending(a, "ore", 3)).toBe(3);
    await store.dexPaid(a, "ore", 3, 3);
    pay = await store.dexPay(a);
    expect(pay).toMatchObject({ pending: { ore: total - 8 }, paid: { ore: 8 } });
  });

  it("칭호 붙음 표시는 한 번 남으면 그대로", async () => {
    const a = acct();
    await store.markDexTitles(a, ["fish:50", "star:100"], DAY);
    await store.markDexTitles(a, ["fish:50"], "20261120");
    await store.markDexTitles(a, [], DAY);
    expect((await store.dexPay(a)).marks).toEqual(["fish:50", "star:100"]);
    expect((await store.snapshot(a, DAY, 1)).pay.marks).toEqual(["fish:50", "star:100"]);
  });

  it("11/26 100% 배지(칭호처럼 남기): 붙은 표시·예전 단계 보상·처음 날이 dex()에 실려 종이 늘어도 배지가 켜진다", async () => {
    const a = acct();
    const bugs = speciesOf("bug").filter((s) => !DEX_EXPANSION_IDS.includes(s.id) && !isCampSpecies(s));
    await store.grant(a, "20261110", "gather", bugs.map((s) => ({ id: s.id, size: 0 })), 99);
    const before = await store.dex(a);
    expect(before.dex[bugs[0].id].first).toBe("20261110");
    // 지금 기준(57종)으론 덜 채웠지만 11/14 전 확장 전 곤충을 다 채운 기록이라 「전부」 칭호 → 배지
    expect(dexBadgeBits(before.dex, titlesOf(before.dex, before.claims, before.pay.marks)) & 2).toBe(2);
    const b = acct();
    await store.grant(b, DAY.replace("1112", "1127"), "gather", bugs.map((s) => ({ id: s.id, size: 0 })), 99);
    let d = await store.dex(b);
    expect(dexBadgeBits(d.dex, titlesOf(d.dex, d.claims, d.pay.marks)) & 2).toBe(0);
    await store.markDexTitles(b, ["bug:100"], DAY);
    d = await store.dex(b);
    expect(dexBadgeBits(d.dex, titlesOf(d.dex, d.claims, d.pay.marks)) & 2).toBe(2);
    const c = acct();
    expect(await store.claimDex(c, "ore:100", DAY)).toBe(true);
    d = await store.dex(c);
    expect(dexBadgeBits(d.dex, titlesOf(d.dex, d.claims, d.pay.marks)) & 8).toBe(8);
  });

  it("동시에 같은 티켓을 내도 하나만 ok", async () => {
    const a = acct();
    await store.begin(a, "race", '{"x":1}', 60, "h", 100);
    const r = await Promise.all(Array.from({ length: 5 }, () => store.claim(a, "race")));
    expect(r.filter((x) => x.status === "ok")).toHaveLength(1);
  });

  it("별자리 등록: 처음만 새로, 완성 횟수·완벽 횟수·처음 날, 가방·오늘 잡은 수는 그대로", async () => {
    const a = acct();
    expect(await store.addStars(a, DAY, [])).toEqual([]);
    expect(await store.addStars(a, DAY, [{ id: "c_gym", perfect: false }, { id: "c_gym", perfect: true }])).toEqual([true, false]);
    expect(await store.addStars(a, "20261113", [{ id: "c_gym", perfect: true }, { id: "c_diet", perfect: false }])).toEqual([false, true]);
    const s = await store.snapshot(a, DAY, 1);
    expect(s.dex).toEqual({ c_gym: { n: 3, max: 0, first: DAY, pf: 2 }, c_diet: { n: 1, max: 0, first: "20261113" } });
    expect(s.bag).toEqual({});
    expect(s.day).toMatchObject({ fish: 0, gather: 0 });
  });

  it("11/16 몬스터 처치: 한 번에 수를 더하고 처음만 새로·처음 날, 0 이하·정수 아님은 건드리지 않는다, 가방·오늘 잡은 수는 그대로", async () => {
    const a = acct();
    expect(await store.addKills(a, DAY, [])).toEqual([]);
    expect(await store.addKills(a, DAY, [{ id: "scope_creep", n: 7 }, { id: "prod_dragon", n: 1 }, { id: "req_change", n: 0 }, { id: "endless_meeting", n: 1.5 }])).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(await store.addKills(a, "20261113", [{ id: "scope_creep", n: 93 }, { id: "req_change", n: 2 }])).toEqual([false, true]);
    const s = await store.snapshot(a, DAY, 1);
    expect(s.dex).toEqual({
      scope_creep: { n: 100, max: 0, first: DAY },
      prod_dragon: { n: 1, max: 0, first: DAY },
      req_change: { n: 2, max: 0, first: "20261113" },
    });
    expect(s.bag).toEqual({});
    expect(s.day).toMatchObject({ fish: 0, gather: 0 });
    // 정산 전 계정은 받을 보상을 쌓지 않는다 (정산이 한꺼번에 센다)
    expect((await store.dexPay(a)).pending).toEqual({});
  });

  it("11/16 몬스터 처치: 정산한 계정은 처음 쓰러뜨린 몬스터 보상만 p:mob에 쌓인다 (동시에 와도 한 번)", async () => {
    const a = acct();
    await store.settleDex(a, DAY);
    await Promise.all([store.addKills(a, DAY, [{ id: "prod_dragon", n: 1 }]), store.addKills(a, DAY, [{ id: "prod_dragon", n: 2 }])]);
    await store.addKills(a, DAY, [{ id: "scope_creep", n: 3 }, { id: "prod_dragon", n: 1 }]);
    expect((await store.dexPay(a)).pending).toEqual({ mob: dexRewardOf("prod_dragon") + dexRewardOf("scope_creep") });
    expect((await store.dex(a)).dex.prod_dragon.n).toBe(4);
  });
}
