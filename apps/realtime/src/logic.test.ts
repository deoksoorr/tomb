import { CLIENT_VERSION, MAP_WIDTH, MAX_VALID_SPEED, RUN_SPEED } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { IsolateMemo, MoveBudget, RateLimiter, allocSid, isOutdatedClient, parseChannel, parseSpawn, pinEvent, sayRelay, stepToward } from "./logic";

describe("RateLimiter", () => {
  it("drops messages over 20/s for the rest of that second", () => {
    const rl = new RateLimiter(20, 10);
    for (let i = 0; i < 20; i++) expect(rl.hit(1000 + i)).toBe("ok");
    expect(rl.hit(1500)).toBe("drop");
    expect(rl.hit(1999)).toBe("drop");
    expect(rl.hit(2000)).toBe("ok"); // 다음 초는 다시 허용
  });

  it("kicks after 10 consecutive seconds over the limit", () => {
    const rl = new RateLimiter(20, 10);
    const verdicts: string[] = [];
    for (let s = 0; s < 10; s++) for (let i = 0; i < 21; i++) verdicts.push(rl.hit(s * 1000 + i));
    expect(verdicts.filter((v) => v === "kick")).toHaveLength(1);
    expect(verdicts.at(-1)).toBe("kick");
  });

  it("resets the streak when a second stays under the limit", () => {
    const rl = new RateLimiter(20, 10);
    const flood = (s: number) => {
      let last = "ok";
      for (let i = 0; i < 21; i++) last = rl.hit(s * 1000 + i);
      return last;
    };
    for (let s = 0; s < 9; s++) expect(flood(s)).toBe("drop");
    rl.hit(9000); // 9초째는 조용히
    for (let s = 10; s < 19; s++) expect(flood(s)).toBe("drop");
    expect(flood(19)).toBe("kick");
  });
});

describe("MoveBudget", () => {
  it("absorbs up to 1s of bunched movement, then refills at MAX_VALID_SPEED", () => {
    const b = new MoveBudget(0);
    // 0.5초 막혔다가 MOVE 5개(각 10px)가 한꺼번에 도착 → 모두 허용
    for (let i = 0; i < 5; i++) expect(b.take(10, 500)).toBe(10);
    // 버스트 상한(1초 분량)을 넘는 거리는 다 주지 않는다
    expect(b.take(1000, 500)).toBeCloseTo(MAX_VALID_SPEED - 50);
    expect(b.take(10, 500)).toBe(0);
    expect(b.take(1000, 600)).toBeCloseTo(MAX_VALID_SPEED * 0.1);
  });

  it("lets a legit runner keep up indefinitely", () => {
    const b = new MoveBudget(0);
    let lag = 0;
    for (let t = 100; t <= 60_000; t += 100) lag += RUN_SPEED * 0.1 - b.take(lag + RUN_SPEED * 0.1, t);
    expect(lag).toBeLessThan(1e-6);
  });
});

describe("helpers", () => {
  it("stepToward clamps distance and lands exactly when in reach", () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 300, y: 400 }, 50)).toEqual({ x: 30, y: 40 });
    expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 50)).toEqual({ x: 3, y: 4 });
  });

  it("allocSid reuses the lowest free id starting at 1", () => {
    expect(allocSid(new Set())).toBe(1);
    expect(allocSid(new Set([1, 2, 4]))).toBe(3);
  });

  it("parseChannel accepts 1..max only", () => {
    expect(parseChannel("1", 10)).toBe(1);
    expect(parseChannel("10", 10)).toBe(10);
    for (const bad of ["0", "11", "01", "-1", "1.5", "abc", "", "1e1"]) expect(parseChannel(bad, 10)).toBeNull();
  });

  it("parseSpawn needs both coordinates inside the map", () => {
    expect(parseSpawn("320", "56")).toEqual({ x: 320, y: 56 });
    expect(parseSpawn("320", null)).toBeUndefined();
    expect(parseSpawn(String(MAP_WIDTH), "56")).toEqual({ x: MAP_WIDTH, y: 56 });
    expect(parseSpawn(String(MAP_WIDTH + 1), "56")).toBeUndefined();
    expect(parseSpawn("-1", "56")).toBeUndefined();
    expect(parseSpawn("3.5", "56")).toBeUndefined();
    expect(parseSpawn("5000", "9000", true)).toEqual({ x: 5000, y: 9000 }); // 방은 u16 범위만
    expect(parseSpawn("70000", "1", true)).toBeUndefined();
  });
});

describe("isOutdatedClient (큰 패치 강제 새로고침)", () => {
  it("v가 최소 버전보다 낮으면 거절, 없으면 1로 본다", () => {
    expect(isOutdatedClient("1", 1)).toBe(false);
    expect(isOutdatedClient("2", 1)).toBe(false); // 웹이 먼저 배포돼 더 새 클라이언트가 옛 서버에 붙어도 받는다
    expect(isOutdatedClient(null, 1)).toBe(false); // 버전을 보내기 전 클라이언트 = 1
    expect(isOutdatedClient(null, 2)).toBe(true);
    expect(isOutdatedClient("1", 2)).toBe(true);
    expect(isOutdatedClient("2", 2)).toBe(false);
    expect(isOutdatedClient("x", 2)).toBe(true);
    expect(isOutdatedClient(String(CLIENT_VERSION))).toBe(false); // 지금 빌드의 클라이언트는 언제나 받는다
  });
});

describe("pinEvent (11/17 고정 공지 → megaPin)", () => {
  it("채널 공지는 그 채널, 모든 채널 공지는 ch 0. 지우면 pin null", () => {
    expect(JSON.parse(pinEvent({ scope: "channel", ch: 4, pin: { text: "안내", name: "운영자", at: 7 } }))).toEqual({ t: "megaPin", scope: "channel", ch: 4, pin: { scope: "channel", ch: 4, text: "안내", name: "운영자", at: 7 } });
    expect(JSON.parse(pinEvent({ scope: "all", ch: 0, pin: { text: "안내", name: "운영자", at: 7 } })).pin).toEqual({ scope: "all", ch: 0, text: "안내", name: "운영자", at: 7 });
    expect(JSON.parse(pinEvent({ scope: "all", ch: 0, pin: null }))).toEqual({ t: "megaPin", scope: "all", ch: 0, pin: null });
  });
});

describe("sayRelay (11/15 마을 공지 → 확성기 방송)", () => {
  it("모든 채널 확성기 모양 + 공지 표시, nonce는 사람 확성기와 겹치지 않게", () => {
    const r = sayRelay({ id: "urg-t1-a1", name: "공지", text: "끝났어요.", at: 1_000, replaces: "urg-t1-a0" });
    expect(r.nonce).toBe("s:urg-t1-a1");
    expect(r.until).toBe(1_000 + 5 * 60_000);
    expect(JSON.parse(r.data)).toEqual({ t: "megaphone", id: "urg-t1-a1", name: "공지", text: "끝났어요.", scope: "all", ch: 0, at: 1_000, staff: true, system: true, replaces: "urg-t1-a0" });
    expect(JSON.parse(sayRelay({ id: "x", name: "공지", text: "한 줄", at: 5 }).data)).not.toHaveProperty("replaces");
  });
});


describe("11/17 IsolateMemo (GET /lobby·/hunt-rooms 아이솔레이트 메모)", () => {
  it("ttl 안에서는 다시 묻지 않고, 지나면 다시 묻는다. 실패는 기억하지 않는다", async () => {
    const memo = new IsolateMemo<string>(5000);
    let calls = 0;
    const load = async () => ({ v: `v${++calls}` });
    expect(await memo.get(0, load)).toBe("v1");
    expect(await memo.get(4999, load)).toBe("v1");
    expect(await memo.get(5000, load)).toBe("v2");
    const fail = async (): Promise<{ v: string }> => {
      throw new Error("lobby down");
    };
    await expect(memo.get(20_000, fail)).rejects.toThrow("lobby down");
    expect(await memo.get(20_001, load)).toBe("v3");
  });

  it("엣지 캐시에서 꺼낸 값은 그 값이 만들어진 시각(at)부터 센다", async () => {
    const memo = new IsolateMemo<string>(5000);
    expect(await memo.get(10_000, async () => ({ v: "edge", at: 7_000 }))).toBe("edge");
    expect(await memo.get(11_999, async () => ({ v: "fresh" }))).toBe("edge");
    expect(await memo.get(12_000, async () => ({ v: "fresh" }))).toBe("fresh");
  });
});
