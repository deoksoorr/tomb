import { describe, expect, it, vi } from "vitest";
import { LookPacer } from "./lookPacer";

// NEXT 29: 꾸미기를 연달아 입으면(유령 친구 → 발자국 꽃) 서버가 10초 안의 두 번째 look을 버려 남들에게 안 보였다
describe("LookPacer", () => {
  it("sends the latest grant once the server interval passes instead of dropping it", () => {
    vi.useFakeTimers();
    let t = 0;
    const sent: string[] = [];
    const p = new LookPacer((g) => (sent.push(g), true), 10_000, () => t);
    p.push("pet");
    expect(sent).toEqual(["pet"]);
    t = 2000;
    p.push("pet+flowers-old");
    p.push("pet+flowers");
    expect(sent).toEqual(["pet"]);
    t = 10_000;
    vi.advanceTimersByTime(8000);
    expect(sent).toEqual(["pet", "pet+flowers"]);
    expect(p.waiting).toBe(false);
    vi.useRealTimers();
  });

  it("keeps the grant while offline and sends it right after a new connection", () => {
    let online = false;
    const sent: string[] = [];
    const p = new LookPacer((g) => (online ? (sent.push(g), true) : false), 10_000, () => 0);
    p.push("a");
    expect(sent).toEqual([]);
    expect(p.waiting).toBe(true);
    online = true;
    p.reset();
    expect(sent).toEqual(["a"]);
    p.destroy();
  });

  // 11/22 입장: 증서를 보낸 뒤 reset하던 순서 탓에 다음 바꿈을 10초 안에 보내 옛 서버가 버렸다 (남들에게 영영 안 보임)
  it("reconnected() on an old server keeps the 10s gap after the welcome send", () => {
    vi.useFakeTimers();
    let t = 0;
    const sent: string[] = [];
    const p = new LookPacer((g) => (sent.push(g), true), 10_000, () => t);
    p.reconnected("entry", false);
    expect(sent).toEqual(["entry"]);
    t = 1000;
    p.push("dyed");
    expect(sent).toEqual(["entry"]); // 바로 보내면 옛 서버가 버린다 → 간격 뒤에
    t = 10_000;
    vi.advanceTimersByTime(9000);
    expect(sent).toEqual(["entry", "dyed"]);
    p.destroy();
    vi.useRealTimers();
  });

  it("reconnected(fast) — the server queues looks (welcome lk: 1) → every change goes out at once", () => {
    let t = 0;
    const sent: string[] = [];
    const p = new LookPacer((g) => (sent.push(g), true), 10_000, () => t);
    p.push("before-welcome"); // 옛 서버 간격으로 보낸 것
    expect(sent).toEqual(["before-welcome"]);
    p.reconnected("current", true);
    t = 300;
    p.push("slot1");
    t = 600;
    p.push("slot2");
    expect(sent).toEqual(["before-welcome", "current", "slot1", "slot2"]);
    expect(p.waiting).toBe(false);
    // 다시 옛 서버로 붙으면 간격을 지킨다
    p.reconnected(null, false);
    p.push("x");
    p.push("y");
    expect(sent.slice(4)).toEqual(["x"]);
    p.destroy();
  });

  it("reconnected() while offline keeps the current grant for the next chance", () => {
    let online = false;
    const sent: string[] = [];
    const p = new LookPacer((g) => (online ? (sent.push(g), true) : false), 10_000, () => 0);
    p.reconnected("cur", true);
    expect(p.waiting).toBe(true);
    online = true;
    p.reconnected("cur", true);
    expect(sent).toEqual(["cur"]);
    p.destroy();
  });
});
