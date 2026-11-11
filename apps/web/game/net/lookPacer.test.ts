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
});
