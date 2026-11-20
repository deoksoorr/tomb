import { CHAT_HISTORY_MS, CHAT_RECENT_MAX, CHAT_STORE_MAX } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChatRecent } from "./chatRecent";

// 방별 최근 채팅 링버퍼: 하루 지난 줄은 꺼낼 때 버리고, 상한을 넘으면 오래된 것부터 버린다. 저장은 최근 50줄
const line = (text: string, visitorId = "v1") => ({
  sid: 1,
  visitorId,
  name: "이름",
  text,
});

describe("ChatRecent", () => {
  it("하루 지난 줄은 꺼낼 때 버린다 (딱 하루면 지난 것)", () => {
    const r = new ChatRecent(() => 0.5);
    r.push(line("a"), 0);
    r.push(line("b"), 30_000);
    expect(r.recent(CHAT_HISTORY_MS - 1).map((l) => l.text)).toEqual(["a", "b"]);
    expect(r.recent(CHAT_HISTORY_MS).map((l) => l.text)).toEqual(["b"]);
    expect(r.size).toBe(1);
    expect(r.recent(30_000 + CHAT_HISTORY_MS)).toEqual([]);
  });

  it("메모리 상한: 넘치면 오래된 것부터 버린다", () => {
    const r = new ChatRecent();
    for (let i = 0; i < CHAT_RECENT_MAX + 7; i++) r.push(line(`m${i}`), i);
    const got = r.recent(100);
    expect(got).toHaveLength(CHAT_RECENT_MAX);
    expect(got[0].text).toBe("m7");
    expect(got.at(-1)?.text).toBe(`m${CHAT_RECENT_MAX + 6}`);
  });

  it("id는 겹치지 않고, 다시 뜬 버퍼와도 겹치지 않는다. visitorId는 내보내지 않고 같은 사람 줄만 mine", () => {
    const r1 = new ChatRecent(() => 0.1);
    const r2 = new ChatRecent(() => 0.2);
    const a = r1.push(line("a"), 0);
    const b = r1.push(line("b", "v2"), 1);
    const c = r2.push(line("c"), 2);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(r1.recent(10, "v1")).toEqual([
      { id: a.id, at: 0, name: "이름", text: "a", mine: true },
      { id: b.id, at: 1, name: "이름", text: "b" },
    ]);
    expect(JSON.stringify(r1.recent(10))).not.toContain("v1");
  });

  it("저장용 snapshot은 최근 50줄만 (넘으면 앞에서 버림), visitorId를 담는다", () => {
    const r = new ChatRecent(() => 0.3);
    for (let i = 0; i < CHAT_STORE_MAX + 10; i++) r.push(line(`m${i}`, `v${i % 2}`), i);
    const snap = r.snapshot(1_000);
    expect(snap).toHaveLength(CHAT_STORE_MAX);
    expect(snap[0].text).toBe("m10");
    expect(snap.at(-1)?.text).toBe(`m${CHAT_STORE_MAX + 9}`);
    expect(snap[0].visitorId).toBe("v0");
    // 하루 지난 줄은 저장하지 않는다
    expect(r.snapshot(CHAT_HISTORY_MS + 15)).toHaveLength(CHAT_STORE_MAX + 10 - 16);
  });

  it("restore: 저장된 줄로 되살리고, 깨진 줄·하루 지난 줄·같은 id는 버린다. 새 줄 id는 겹치지 않는다", () => {
    const old = new ChatRecent(() => 0.1);
    const a = old.push(line("a"), 1_000);
    const b = old.push(line("b", "v2"), 2_000);
    const saved = JSON.parse(JSON.stringify(old.snapshot(3_000))) as unknown[];
    const r = new ChatRecent(() => 0.9);
    const n = r.restore([...saved, { id: "x", at: "어제" }, null, { ...(saved[0] as object), id: "old", at: -CHAT_HISTORY_MS }, saved[1]], 5_000);
    expect(n).toBe(2);
    expect(r.recent(5_000, "v1")).toEqual([
      { id: a.id, at: 1_000, name: "이름", text: "a", mine: true },
      { id: b.id, at: 2_000, name: "이름", text: "b" },
    ]);
    const c = r.push(line("c"), 6_000);
    expect([a.id, b.id]).not.toContain(c.id);
    expect(r.recent(7_000).map((l) => l.text)).toEqual(["a", "b", "c"]);
    expect(r.restore("깨진 값", 7_000)).toBe(0);
  });

  it("purge: 그 사람 줄만 지운다 (지운 게 있으면 true)", () => {
    const r = new ChatRecent();
    r.push(line("a", "bad"), 0);
    r.push(line("b", "good"), 1);
    r.push(line("c", "bad"), 2);
    expect(r.purge("bad")).toBe(true);
    expect(r.recent(10).map((l) => l.text)).toEqual(["b"]);
    expect(r.purge("bad")).toBe(false);
  });
});

describe("ChatRecent 닉네임 꾸미기 (11/20)", () => {
  it("줄에 실은 꾸미기 id를 내보내고, 저장했다가 되살려도 남는다 (이상한 값은 버린다)", () => {
    const r = new ChatRecent(() => 0.5);
    r.push({ ...line("a"), ns: ["nc_rainbow", "np_wood"] }, 0);
    r.push(line("b"), 1);
    expect(r.recent(2).map((l) => l.ns)).toEqual([["nc_rainbow", "np_wood"], undefined]);
    const snap = r.snapshot(2);
    const back = new ChatRecent(() => 0.7);
    back.restore([...snap, { ...snap[1], id: "x.1", ns: ["a", "b", "c"] }, { ...snap[1], id: "x.2", ns: [1] }], 3);
    expect(back.recent(4).map((l) => l.ns)).toEqual([["nc_rainbow", "np_wood"], undefined, undefined, undefined]);
  });
});
