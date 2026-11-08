import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/game/bridge";
import type { PublicGrave } from "@/lib/types";
import { GraveCache } from "./useGraves";

const grave = (id: string, createdAt: number): PublicGrave => ({
  id,
  name: id,
  epitaph: "",
  bornAt: "2026-01-01",
  diedAt: "2026-01-02",
  ageDays: 2,
  causes: ["time"],
  mourner: "유령",
  createdAt,
  flowers: 0,
  revives: 0,
});

afterEach(() => vi.restoreAllMocks());

describe("GraveCache", () => {
  it("첫 목록을 받기 전에는 graves:set을 보내지 않고, 받으면 그때까지의 변경을 합쳐 보낸다", () => {
    const emit = vi.spyOn(bridge, "emit");
    const cache = new GraveCache();
    cache.upsert(grave("mine", 5));
    expect(emit).not.toHaveBeenCalled();
    expect(cache.getSnapshot().loaded).toBe(false);

    cache.setList({ graves: [grave("a", 1)], reviveTop: [], generatedAt: 1 });
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0] as [string, { graves: PublicGrave[] }];
    expect(event).toBe("graves:set");
    expect(payload.graves.map((g) => g.id)).toEqual(["a", "mine"]);
  });

  it("같은 목록(generatedAt)이 다시 오면 다시 보내지 않는다", () => {
    const cache = new GraveCache();
    cache.setList({ graves: [], reviveTop: [], generatedAt: 7 });
    const emit = vi.spyOn(bridge, "emit");
    cache.setList({ graves: [], reviveTop: [], generatedAt: 7 });
    expect(emit).not.toHaveBeenCalled();
  });
});
