import { describe, expect, it } from "vitest";
import type { Grave } from "../types";
import { MemoryAccounts } from "./accounts-memory";
import { MemoryStore } from "./memory";
import { activeGraveOf, DAY_MS, pagePassed, PASS_SWEEP_LOCK_MS, passAtOf, pickPassing, resetSweepGate, sweepPassing, sweepPassingIfDue } from "./passing";
import type { GraveRecord, GraveSettings } from "./types";

const settings: GraveSettings = { passDays: 14, passEpoch: 0 };

function grave(id: string, over: Partial<Grave> = {}): Grave {
  return {
    id,
    name: `묘비 ${id}`,
    epitaph: "e",
    bornAt: "2024-01-01",
    diedAt: "2024-01-02",
    ageDays: 2,
    causes: ["other"],
    mourner: "테스터",
    createdAt: 0,
    ownerTokenHash: "",
    ...over,
  };
}
const rec = (id: string, over: Partial<GraveRecord> = {}): GraveRecord => ({ ...grave(id), channel: 1, flowers: 0, revives: 0, ...over });

function kit(now = 1_000 * DAY_MS) {
  const store = new MemoryStore([], () => now);
  const accounts = new MemoryAccounts(() => store);
  return { store, accounts };
}

describe("pickPassing (성불 대상 고르기)", () => {
  it("기간: max(세운 시각, passEpoch) + passDays가 지나면", () => {
    const s = { passDays: 14, passEpoch: 10 * DAY_MS };
    const records = [rec("old", { createdAt: 0 }), rec("new", { createdAt: 20 * DAY_MS })];
    // 규칙을 켜기 전에 세운 묘비(old)는 켠 날(10일)부터 센다 → 24일에 성불
    expect(passAtOf(records[0], s)).toBe(24 * DAY_MS);
    expect(pickPassing(records, s, 24 * DAY_MS - 1)).toEqual([]);
    expect(pickPassing(records, s, 24 * DAY_MS)).toEqual([{ id: "old", reason: "time" }]);
    expect(pickPassing(records, s, 34 * DAY_MS)).toEqual([
      { id: "old", reason: "time" },
      { id: "new", reason: "time" },
    ]);
  });

  it("1인 1묘비: 같은 계정의 묘비가 여럿이면 가장 최근 것만 남긴다 (주인 없는 옛 묘비는 건드리지 않는다)", () => {
    const records = [
      rec("a1", { ownerAccountId: "A", createdAt: 1 }),
      rec("a2", { ownerAccountId: "A", createdAt: 3, channel: 2 }),
      rec("a3", { ownerAccountId: "A", createdAt: 2 }),
      rec("b1", { ownerAccountId: "B", createdAt: 1 }),
      rec("legacy1", { createdAt: 1 }),
      rec("legacy2", { createdAt: 2 }),
    ];
    expect(pickPassing(records, settings, 5)).toEqual([
      { id: "a3", reason: "one" },
      { id: "a1", reason: "one" },
    ]);
  });

  it("묘역 정원: 채널마다 보이는 묘비가 넘치면 가장 오래된 것부터 (숨김·이미 고른 것은 세지 않는다)", () => {
    const records = [
      rec("h", { createdAt: 0, hidden: true }),
      rec("c1", { createdAt: 1 }),
      rec("c2", { createdAt: 2 }),
      rec("c3", { createdAt: 3 }),
      rec("c4", { createdAt: 4 }),
      rec("x1", { createdAt: 1, channel: 2 }),
    ];
    expect(pickPassing(records, settings, 10, 2)).toEqual([
      { id: "c1", reason: "full" },
      { id: "c2", reason: "full" },
    ]);
    // 1인 1묘비로 이미 빠진 묘비는 정원에서 빼고 센다
    const owned = records.map((r) => (r.id === "c3" || r.id === "c4" ? { ...r, ownerAccountId: "A" } : r));
    expect(pickPassing(owned, settings, 10, 2)).toEqual([
      { id: "c3", reason: "one" },
      { id: "c1", reason: "full" },
    ]);
  });
});

describe("sweepPassing (묘역 정리, 몇 번을 돌려도 같은 결과)", () => {
  it("성불시키고 주인 계정 목록에서 빼고 소식을 남긴다. 다시 돌려도 더 옮기지 않는다", async () => {
    const now = 100 * DAY_MS;
    const { store, accounts } = kit(now);
    await store.settings(0); // 규칙을 켠 시각 = 0
    for (const [id, owner, createdAt] of [
      ["a-old", "A", 1],
      ["a-new", "A", 99 * DAY_MS],
      ["b-old", "B", 50 * DAY_MS],
      ["c-new", "C", 95 * DAY_MS],
    ] as const) {
      await store.put(grave(id, { ownerAccountId: owner, createdAt }));
      await accounts.addGrave(owner, id);
    }

    const passed = await sweepPassing(store, accounts, now, { force: true });
    expect(passed.map((p) => [p.record.id, p.reason]).sort()).toEqual([
      ["a-old", "one"],
      ["b-old", "time"],
    ]);
    expect((await store.listAll()).map((r) => r.id).sort()).toEqual(["a-new", "c-new"]);
    expect((await accounts.get("A", "20260101", now)).graves).toEqual(["a-new"]);
    expect((await accounts.get("B", "20260101", now)).graves).toEqual([]);
    const news = await accounts.activity("B");
    expect(news.items[0]).toMatchObject({ kind: "passed", targetId: "b-old", targetName: "묘비 b-old", who: "" });

    expect(await sweepPassing(store, accounts, now, { force: true })).toEqual([]);
    expect((await store.passedAll()).length).toBe(2);
  });

  it("잠금: force가 아니면 30분에 한 번만 돈다", async () => {
    const { store, accounts } = kit(0);
    await store.put(grave("g", { createdAt: 0 }));
    await store.setPassDays(1);
    expect(await sweepPassing(store, accounts, 0)).toEqual([]); // 아직 기간 전, 잠금을 잡는다
    expect(await sweepPassing(store, accounts, 30_000)).toEqual([]); // 잠금 중 (30분)
    expect((await sweepPassing(store, accounts, 2 * DAY_MS)).map((p) => p.record.id)).toEqual(["g"]); // 잠금이 풀림
    await store.put(grave("h", { createdAt: 0 }));
    expect(await sweepPassing(store, accounts, 2 * DAY_MS + 1000)).toEqual([]); // 다시 잠금 중
    expect((await sweepPassing(store, accounts, 2 * DAY_MS + 1000, { force: true })).map((p) => p.record.id)).toEqual(["h"]);
  });

  it("목록 요청용 sweepPassingIfDue: 인스턴스 메모리로 30분 안에는 잠금(Redis)도 묻지 않는다", async () => {
    resetSweepGate();
    const { store, accounts } = kit(0);
    await store.settings(0); // 규칙을 켠 시각 = 0
    await store.put(grave("g", { createdAt: 0 }));
    await store.setPassDays(1);
    let locks = 0;
    const lockSweep = store.lockSweep.bind(store);
    store.lockSweep = (ttl, now) => {
      locks++;
      return lockSweep(ttl, now);
    };
    expect(await sweepPassingIfDue(store, accounts, 2 * DAY_MS)).toHaveLength(1);
    await store.put(grave("h", { createdAt: 0 }));
    expect(await sweepPassingIfDue(store, accounts, 2 * DAY_MS + PASS_SWEEP_LOCK_MS - 1)).toEqual([]);
    expect(locks).toBe(1);
    expect((await sweepPassingIfDue(store, accounts, 2 * DAY_MS + PASS_SWEEP_LOCK_MS)).map((p) => p.record.id)).toEqual(["h"]);
    expect(locks).toBe(2);
    resetSweepGate();
  });
});

describe("activeGraveOf (1인 1묘비 판정)", () => {
  it("내 묘비와 성불 시각을 주고, 기간이 지난 것은 그 자리에서 성불시킨다", async () => {
    const now = 10 * DAY_MS;
    const { store, accounts } = kit(now);
    await store.settings(0);
    expect(await activeGraveOf(store, accounts, "A", now)).toBeNull();

    await store.put(grave("mine", { ownerAccountId: "A", createdAt: 5 * DAY_MS }));
    await accounts.addGrave("A", "mine");
    const active = await activeGraveOf(store, accounts, "A", now);
    expect(active?.grave.id).toBe("mine");
    expect(active?.passAt).toBe(19 * DAY_MS);

    expect(await activeGraveOf(store, accounts, "A", 19 * DAY_MS)).toBeNull();
    expect((await store.passedAll()).map((p) => p.reason)).toEqual(["time"]);
    expect((await accounts.get("A", "20260101", now)).graves).toEqual([]);
  });

  it("여러 개면 가장 최근 것만 남기고, 이미 없는 id는 계정 목록에서 지운다", async () => {
    const now = 10 * DAY_MS;
    const { store, accounts } = kit(now);
    await store.settings(0);
    for (const [id, at] of [
      ["x", 1],
      ["y", 3],
      ["z", 2],
    ] as const) {
      await store.put(grave(id, { ownerAccountId: "A", createdAt: at }));
      await accounts.addGrave("A", id);
    }
    await accounts.addGrave("A", "gone");
    const active = await activeGraveOf(store, accounts, "A", now);
    expect(active?.grave.id).toBe("y");
    expect((await store.passedAll()).map((p) => [p.record.id, p.reason]).sort()).toEqual([
      ["x", "one"],
      ["z", "one"],
    ]);
    expect((await accounts.get("A", "20260101", now)).graves).toEqual(["y"]);
  });
});

describe("pagePassed (성불한 이야기들)", () => {
  const all = [
    { record: rec("a", { name: "할 일 앱", createdAt: 1 }), passedAt: 300, reason: "time" as const },
    { record: rec("b", { name: "블로그", epitaph: "README만 화려했다", createdAt: 2 }), passedAt: 300, reason: "full" as const },
    { record: rec("c", { name: "숨김", hidden: true }), passedAt: 500, reason: "time" as const },
    { record: rec("d", { name: "게임", mourner: "새벽코더" }), passedAt: 100, reason: "one" as const },
  ];

  it("최신 성불 순 (같은 시각이면 늦게 세운 것 먼저), 숨김 제외, 순번으로 다음 쪽", () => {
    const first = pagePassed(all, { limit: 2 });
    expect(first.items.map((p) => p.record.id)).toEqual(["b", "a"]);
    expect(first).toMatchObject({ next: 2, total: 3 });
    const second = pagePassed(all, { limit: 2, offset: 2 });
    expect(second.items.map((p) => p.record.id)).toEqual(["d"]);
    expect(second.next).toBeNull();
    expect(pagePassed(all, { includeHidden: true }).items.map((p) => p.record.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("검색: 이름·묘비명·상주 (대소문자·앞뒤 공백 무시)", () => {
    expect(pagePassed(all, { q: " readme " }).items.map((p) => p.record.id)).toEqual(["b"]);
    expect(pagePassed(all, { q: "새벽" }).items.map((p) => p.record.id)).toEqual(["d"]);
    expect(pagePassed(all, { q: "숨김" }).total).toBe(0);
  });
});
