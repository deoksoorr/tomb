import { describe, expect, it } from "vitest";
import { PERMANENT_UNTIL } from "@tomb/protocol";
import { lookRank, recordLook } from "./lookRank";
import { MemoryLookRank, type LookState } from "./store/lookRank";

// 꾸미기 랭킹: 기록 점수는 후보 색인일 뿐 — 읽을 때 지금 착용으로 다시 계산해 만료를 반영한다. 운영자·정지 계정은 빠진다

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

/** 계정 외형을 직접 들고 있는 메모리 랭킹 (계정 저장소 없이) */
class FakeLookRank extends MemoryLookRank {
  looks = new Map<string, LookState>();
  constructor() {
    super(() => null as never);
  }
  override async states(ids: readonly string[]) {
    return new Map(ids.flatMap((id) => (this.looks.has(id) ? [[id, this.looks.get(id)!] as const] : [])));
  }
}

const look = (name: string, items: [string, number][]): LookState => ({ name, body: null, dye: {}, equipped: items.map(([itemId, until]) => ({ itemId, until })) });

async function setup() {
  const store = new FakeLookRank();
  const add = async (id: string, l: LookState) => {
    store.looks.set(id, l);
    await recordLook(id, l, { store, staffId: "op", now: NOW });
  };
  await add("a", look("가", [["hat_crown", NOW + HOUR], ["pet_deer", PERMANENT_UNTIL]])); // 5 + 12 = 17 (왕관은 1시간 뒤 끝)
  await add("b", look("나", [["pet_cat", PERMANENT_UNTIL]])); // 8
  await add("c", look("다", [["neck_scarf", NOW + 2 * HOUR], ["hat_halo", PERMANENT_UNTIL]])); // 1 + 2 = 3
  await add("op", look("운영자", [["pet_goose", PERMANENT_UNTIL], ["staff_crown", PERMANENT_UNTIL]])); // 운영자는 기록하지 않는다
  return store;
}

const opts = (store: FakeLookRank, now: number, banned: string[] = []) => ({ store, staffId: "op", now, fresh: true, isBanned: async (id: string) => banned.includes(id) });
const brief = (rows: { rank: number; name: string; value: number }[]) => rows.map((r) => [r.rank, r.name, r.value]);

describe("꾸미기 랭킹", () => {
  it("점수 높은 순 + 대표 파츠, 운영자는 기록에도 목록에도 없다", async () => {
    const store = await setup();
    expect(await store.top(0, 10)).not.toContainEqual(expect.objectContaining({ accountId: "op" }));
    const r = await lookRank(null, 50, opts(store, NOW));
    expect(brief(r.rows)).toEqual([
      [1, "가", 17],
      [2, "나", 8],
      [3, "다", 3],
    ]);
    expect(r.rows[0].items).toEqual(["pet_deer", "hat_crown"]);
  });

  it("읽을 때 만료를 반영해 순위를 바로잡고, 기록 점수도 고친다", async () => {
    const store = await setup();
    // 기록은 그대로 17점이지만 왕관이 끝났다 → 12점
    let r = await lookRank(null, 2, opts(store, NOW + HOUR));
    expect(brief(r.rows)).toEqual([
      [1, "가", 12],
      [2, "나", 8],
    ]);
    expect((await store.top(0, 1))[0]).toEqual({ accountId: "a", score: 12 });
    // 영구 펫까지 벗은 게 아니라 기간제만 끝난 c는 2점, 다 끝난 사람은 빠진다
    store.looks.set("b", look("나", [["pet_cat", NOW + HOUR]]));
    r = await lookRank(null, 50, opts(store, NOW + 3 * HOUR));
    expect(brief(r.rows)).toEqual([
      [1, "가", 12],
      [2, "다", 2],
    ]);
    expect(await store.top(0, 10)).not.toContainEqual(expect.objectContaining({ accountId: "b" }));
  });

  it("상위 후보가 만료로 밀려나면 아래 후보를 더 읽어 채운다", async () => {
    const store = new FakeLookRank();
    for (let i = 0; i < 40; i++) {
      const l = look(`p${i}`, [["pet_deer", NOW + HOUR]]);
      store.looks.set(`x${i}`, l);
      await recordLook(`x${i}`, l, { store, staffId: null, now: NOW });
    }
    const keep = look("남은 사람", [["neck_scarf", PERMANENT_UNTIL]]);
    store.looks.set("keep", keep);
    await recordLook("keep", keep, { store, staffId: null, now: NOW });
    const r = await lookRank(null, 1, { ...opts(store, NOW + HOUR), staffId: null });
    expect(brief(r.rows)).toEqual([[1, "남은 사람", 1]]);
  });

  it("정지 계정은 목록에서 빠지고 순번은 이어진다", async () => {
    const store = await setup();
    const r = await lookRank(null, 50, opts(store, NOW, ["a"]));
    expect(brief(r.rows)).toEqual([
      [1, "나", 8],
      [2, "다", 3],
    ]);
  });

  it("내 줄: 판 밖이면 mine, 운영자 본인이면 staff + mine 없음", async () => {
    const store = await setup();
    const r = await lookRank("c", 2, opts(store, NOW));
    expect(r.rows.some((x) => x.me)).toBe(false);
    expect(r.mine).toMatchObject({ rank: 3, name: "다", value: 3, me: true });
    const inside = await lookRank("b", 2, opts(store, NOW));
    expect(inside.rows[1]).toMatchObject({ name: "나", me: true });
    expect(inside.mine).toBeNull();
    const op = await lookRank("op", 50, opts(store, NOW));
    expect(op.staff).toBe(true);
    expect(op.mine).toBeNull();
    expect(op.rows.map((x) => x.name)).not.toContain("운영자");
  });
});
