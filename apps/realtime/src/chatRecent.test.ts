import { CHAT_RECENT_MAX, CHAT_RECENT_MS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChatRecent } from "./chatRecent";

// 방별 최근 채팅 링버퍼: 60초 지난 줄은 꺼낼 때 버리고, 50줄 넘으면 오래된 것부터 버린다
const line = (text: string, visitorId = "v1") => ({
  sid: 1,
  visitorId,
  name: "이름",
  text,
});

describe("ChatRecent", () => {
  it("60초 지난 줄은 꺼낼 때 버린다 (딱 60초면 지난 것)", () => {
    const r = new ChatRecent(() => 0.5);
    r.push(line("a"), 0);
    r.push(line("b"), 30_000);
    expect(r.recent(CHAT_RECENT_MS - 1).map((l) => l.text)).toEqual(["a", "b"]);
    expect(r.recent(CHAT_RECENT_MS).map((l) => l.text)).toEqual(["b"]);
    expect(r.size).toBe(1);
    expect(r.recent(30_000 + CHAT_RECENT_MS)).toEqual([]);
  });

  it("50줄 상한: 넘치면 오래된 것부터 버린다", () => {
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
});
