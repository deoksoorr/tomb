import { WORLD_LOTS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { closeVillage, closeVillageNote } from "./closeVillage";
import { MemoryHouseStore } from "./store";

// 11/19 2단지 닫기: 2단지(16번지~) 집을 오래된 집부터 메인 맵 빈 번지(1..WORLD_LOTS)로, 자리가 없으면 필지 대기(번지 0)

const mk = (s: MemoryHouseStore, id: string, ch: number, lot: number, now: number) =>
  s.create({ id, owner: `o_${id}`, name: `집${id}`, intro: "", ownerName: "주인", tier: "small", ch, lot, now });

describe("2단지 닫기 (1회성 이전)", () => {
  it("미리 보기는 아무것도 바꾸지 않고, 실행하면 오래된 집부터 빈 번지로 옮긴다 (다시 돌려도 같다)", async () => {
    const s = new MemoryHouseStore();
    // 2채널: 1~13번지는 찼고 14·15번지가 비었다. 2단지에 셋 (분양 순 c → a → b)
    for (let l = 1; l <= 13; l++) await mk(s, `m${l}`, 2, l, 100 + l);
    await mk(s, "a", 2, 20, 2);
    await mk(s, "b", 2, 16, 3);
    await mk(s, "c", 2, 30, 1);
    // 다른 채널은 따로 센다
    await mk(s, "z", 4, 17, 5);

    const plan = await closeVillage(s, false, [2, 4]);
    expect(plan.moves.map((m) => [m.id, m.from, m.to])).toEqual([
      ["c", 30, 14],
      ["a", 20, 15],
      ["b", 16, 0],
      ["z", 17, 1],
    ]);
    expect((await s.get("c"))!.lot).toBe(30); // 미리 보기는 그대로

    const done = await closeVillage(s, true, [2, 4]);
    expect(done).toMatchObject({ apply: true, moved: 3, waiting: 1 });
    expect((await s.get("c"))!.lot).toBe(14);
    expect((await s.get("a"))!.lot).toBe(15);
    expect((await s.get("b"))!.lot).toBe(0); // 필지 대기 — 집은 그대로
    expect((await s.get("z"))!.lot).toBe(1);
    expect((await s.village(2)).every((h) => h.lot <= WORLD_LOTS)).toBe(true);

    // 다시 돌려도 옮길 집이 없다
    expect((await closeVillage(s, true, [2, 4])).moves).toEqual([]);
    // 빈 번지가 나면 필지 대기 집이 다시 번지를 받는다
    await s.remove("m3");
    expect(await s.assignLot("b")).toBe(3);
  });

  it("집 주인 안내 문구", () => {
    expect(closeVillageNote({ to: 12 })).toBe("2단지가 문을 닫아 12번지로 이사했어요. 집 안 물건은 그대로예요.");
    expect(closeVillageNote({ to: 0 })).toContain("빈 집터가 나면");
  });
});
