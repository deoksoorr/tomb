import { describe, expect, it } from "vitest";
import { signInternal, verifyInternal } from "./internal";
import { MAINT_READ_TTL_SEC, RAFT_OUT_WHYS, isUnknownConnKind, parseConnWire, signMaintRead, verifyMaintRead } from "./maint";

// 11/26 GET /maintenance 통과 목록(skip)을 받을 때 붙이는 서명 머리글 (웹 → 실시간 서버)

describe("signMaintRead / verifyMaintRead", () => {
  const now = 1_800_000_000;

  it("같은 비밀값·만료 전이면 통과, 다른 비밀값·지난 것·모양이 틀린 것은 거절", async () => {
    const v = await signMaintRead("k", now);
    expect(v.startsWith(`${now + MAINT_READ_TTL_SEC}.`)).toBe(true);
    expect(await verifyMaintRead("k", v, now)).toBe(true);
    expect(await verifyMaintRead("k", v, now + MAINT_READ_TTL_SEC)).toBe(true);
    expect(await verifyMaintRead("k", v, now + MAINT_READ_TTL_SEC + 1)).toBe(false);
    expect(await verifyMaintRead("other", v, now)).toBe(false);
    expect(await verifyMaintRead("", v, now)).toBe(false);
    for (const bad of [null, "", "abc", ".x", "12.", `${now + 10}`, `x${v}`]) expect(await verifyMaintRead("k", bad, now), String(bad)).toBe(false);
  });

  it("만료를 먼 미래로 바꾼 서명은 받지 않는다", async () => {
    const far = await signMaintRead("k", now + 3_600);
    expect(await verifyMaintRead("k", far, now)).toBe(false);
  });
});

// 11/28 실시간 서버 동작 줄 "r" (탈것 타고 내림 · 좌대에서 내려보냄) + 모르는 줄 종류는 그 줄만 건너뛰기
describe('접속 기록 "r" 줄', () => {
  type R = Parameters<typeof parseConnWire>[0];
  const r = (x: unknown): R => ["v1", "r", 1000, 1, "pc", "", x];

  it("탈것 탐·내림·접은 줄·좌대 줄을 받는다", () => {
    for (const x of [
      { g: "kayak", m: "sea", on: 1, n: 2, k: 1 },
      { g: "tube", m: "sea", n: 3, d: 120, w: "quit" },
      { g: "rowboat", m: "camp", n: 1, k: 0, b: 1, d: 2, s: 4 },
      { g: "boat", m: "village", n: 1 },
      { g: "duck", m: "village", on: 1, n: 2, k: 1 },
      { g: "jetski", m: "sea" },
      { g: "raft", n: 4, w: "end" },
      { g: "raft", n: 1, w: "ticket", s: 2 },
    ])
      expect(parseConnWire(r(x)), JSON.stringify(x)).toEqual(r(x));
    expect(RAFT_OUT_WHYS).toEqual(["ticket", "end", "sold"]); // raft.ts RaftOutWhy와 같게
  });

  it("모양이 틀린 줄은 거른다", () => {
    for (const x of [
      null,
      [],
      {},
      { g: "ufo", m: "sea" },
      { g: "kayak" },
      { g: "kayak", m: "moon" },
      { g: "kayak", m: "sea", on: true },
      { g: "kayak", m: "sea", on: 1, d: 5 }, // 탄 시간은 내림 줄에만
      { g: "kayak", m: "sea", on: 1, w: "quit" },
      { g: "kayak", m: "sea", on: 1, b: 1 },
      { g: "kayak", m: "sea", n: 0 },
      { g: "kayak", m: "sea", k: 2 },
      { g: "kayak", m: "sea", d: -1 },
      { g: "kayak", m: "sea", d: 86_401 },
      { g: "kayak", m: "sea", w: "bored" },
      { g: "kayak", m: "sea", s: 0 },
      { g: "raft", n: 7, w: "end" },
      { g: "raft", n: 4 },
      { g: "raft", n: 4, w: "nope" },
    ])
      expect(parseConnWire(r(x)), JSON.stringify(x)).toBeNull();
    expect(parseConnWire(["v1", "r", 1000, 1, "pc", "", { g: "raft", n: 4, w: "end" }].slice(0, 6))).toBeNull(); // 여섯 칸
    expect(parseConnWire(["v1", "r", 1000, 1, "pc", "end", { g: "raft", n: 4, w: "end" }])).toBeNull();
  });

  it("모르는 종류 글자: 그 줄만 건너뛰고, 아는 종류인데 틀린 줄이 섞이면 묶음째 거절", async () => {
    const exp = Math.floor(Date.now() / 1000) + 10;
    const inRow = ["v1", "i", 1000, 1, "pc", ""];
    const future = ["v1", "z", 1000, 1, "pc", "", { anything: 1 }];
    expect(isUnknownConnKind(future)).toBe(true);
    expect(isUnknownConnKind(inRow)).toBe(false);
    expect(isUnknownConnKind(r({ g: "ufo" }))).toBe(false); // 아는 종류("r")의 틀린 줄
    expect(isUnknownConnKind(["bad id!", "z", 1, 1, "pc", ""])).toBe(false);
    const sign = (rows: unknown[]) => signInternal("s", { op: "connLog", rows: rows as never, exp });
    const a = await sign([inRow, future, r({ g: "raft", n: 4, w: "end" })]);
    expect(await verifyInternal("s", a.body, a.sig)).toMatchObject({ op: "connLog", rows: [inRow, r({ g: "raft", n: 4, w: "end" })] });
    const onlyFuture = await sign([future]);
    expect(await verifyInternal("s", onlyFuture.body, onlyFuture.sig)).toBeNull();
    const badKnown = await sign([inRow, r({ g: "ufo", m: "sea" })]);
    expect(await verifyInternal("s", badKnown.body, badKnown.sig)).toBeNull();
  });
});
