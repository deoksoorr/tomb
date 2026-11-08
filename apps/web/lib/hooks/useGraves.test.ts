import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/game/bridge";
import type { PublicGrave } from "@/lib/types";
import { GraveCache, parseCachedList } from "./useGraves";

const grave = (id: string, createdAt: number, channel = 1): PublicGrave => ({
  id,
  name: id,
  epitaph: "",
  bornAt: "2026-01-01",
  diedAt: "2026-01-02",
  ageDays: 2,
  causes: ["time"],
  mourner: "유령",
  channel,
  createdAt,
  flowers: 0,
  revives: 0,
});

afterEach(() => vi.restoreAllMocks());

describe("GraveCache", () => {
  it("첫 목록을 받기 전에는 graves:set을 보내지 않고, 받으면 그때까지의 변경을 합쳐 보낸다", () => {
    const emit = vi.spyOn(bridge, "emit");
    const cache = new GraveCache(1);
    cache.upsert(grave("mine", 5));
    expect(emit).not.toHaveBeenCalled();
    expect(cache.getSnapshot().loaded).toBe(false);

    cache.setList({ channel: 1, graves: [grave("a", 1)], reviveTop: [], generatedAt: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0] as [string, { channel: number; graves: PublicGrave[] }];
    expect(event).toBe("graves:set");
    expect(payload.channel).toBe(1);
    expect(payload.graves.map((g) => g.id)).toEqual(["a", "mine"]);
  });

  it("같은 목록(generatedAt)이 다시 오면 다시 보내지 않는다", () => {
    const cache = new GraveCache(1);
    cache.setList({ channel: 1, graves: [], reviveTop: [], generatedAt: 7 });
    const emit = vi.spyOn(bridge, "emit");
    cache.setList({ channel: 1, graves: [], reviveTop: [], generatedAt: 7 });
    expect(emit).not.toHaveBeenCalled();
  });

  it("채널을 옮기면 비우고, 다른 채널 목록·묘비는 섞지 않는다", () => {
    const cache = new GraveCache(1);
    cache.setList({ channel: 1, graves: [grave("a", 1)], reviveTop: [], generatedAt: 1 });
    cache.setChannel(2);
    expect(cache.getSnapshot()).toMatchObject({ channel: 2, graves: [], loaded: false });
    const emit = vi.spyOn(bridge, "emit");
    cache.setList({ channel: 1, graves: [grave("late", 2)], reviveTop: [], generatedAt: 2 });
    cache.upsert(grave("other", 3, 3));
    expect(emit).not.toHaveBeenCalled();
    cache.setList({ channel: 2, graves: [grave("b", 1, 2)], reviveTop: [], generatedAt: 3 });
    expect(cache.getSnapshot().graves.map((g) => g.id)).toEqual(["b"]);
  });
});

describe("parseCachedList", () => {
  it("형식이 맞는 저장본만 쓴다", () => {
    const list = { channel: 1, graves: [grave("a", 1)], reviveTop: [], generatedAt: 3 };
    expect(parseCachedList(JSON.stringify(list))).toEqual(list);
    expect(parseCachedList(null)).toBeNull();
    expect(parseCachedList("{깨진")).toBeNull();
    expect(parseCachedList(JSON.stringify({ graves: "x", reviveTop: [], generatedAt: 1 }))).toBeNull();
  });
});
