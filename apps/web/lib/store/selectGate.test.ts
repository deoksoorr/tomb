import { describe, expect, it } from "vitest";
import { DYE_SELECT_LEVEL_KEEP_MS, DYE_SELECT_LOCK_MS } from "../dye/rules";
import { MemoryStyle, selectGate } from "./style";

// 11/22 색 보관함 「이 색 입기」 연타 잠금 규칙 (메모리 저장소 — Redis Lua는 style-redis.test.ts에서 같은 표로)

const MIN = 60_000;
const HOUR = 60 * MIN;

type Gate = Parameters<typeof selectGate>[0];
/** t에 n번 연달아 누른다 → 마지막 결과의 waitMs와 상태 */
function burst(g: Gate, t: number, n: number) {
  let cur = g;
  let wait = 0;
  for (let i = 0; i < n; i++) {
    const r = selectGate(cur, t + i * 100);
    cur = r.next;
    wait = r.waitMs;
  }
  return { g: cur, wait };
}

describe("이 색 입기 연타 잠금", () => {
  it("10초 안에 5번까지 되고 6번째부터 10분 잠금, 10초가 지나면 횟수는 처음부터", () => {
    expect(DYE_SELECT_LOCK_MS).toEqual([10 * MIN, 30 * MIN, HOUR, 3 * HOUR, 24 * HOUR]);
    expect(burst(undefined, 0, 5).wait).toBe(0);
    expect(burst(undefined, 0, 6).wait).toBe(10 * MIN);
    // 5번 → 10초 쉼 → 5번: 잠기지 않는다
    const a = burst(undefined, 0, 5);
    expect(burst(a.g, 10_000, 5).wait).toBe(0);
    // 잠금 중엔 남은 시간, 끝나면 다시 된다
    const l = burst(undefined, 0, 6);
    expect(selectGate(l.g, 500 + 4 * MIN).waitMs).toBe(10 * MIN - 4 * MIN);
    expect(selectGate(l.g, 500 + 10 * MIN).waitMs).toBe(0);
  });

  it("24시간 안에 또 걸리면 단계가 오른다: 10분 → 30분 → 1시간 → 3시간 → 24시간(상한)", () => {
    let g: Gate = undefined;
    let t = 0;
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = burst(g, t, 6);
      waits.push(r.wait);
      g = r.g;
      t += r.wait + HOUR; // 풀리고 1시간 뒤 또 연타
    }
    expect(waits).toEqual([10 * MIN, 30 * MIN, HOUR, 3 * HOUR, 24 * HOUR, 24 * HOUR, 24 * HOUR]);
  });

  it("마지막 잠금이 끝나고 24시간 동안 안 걸리면 처음 단계(10분)로", () => {
    const one = burst(undefined, 0, 6);
    const two = burst(one.g, 20 * MIN, 6);
    expect(two.wait).toBe(30 * MIN);
    const lockEnd = 20 * MIN + 500 + 30 * MIN;
    // 끝나고 24시간 직전이면 3단계, 24시간 지나면 1단계
    expect(burst(two.g, lockEnd + DYE_SELECT_LEVEL_KEEP_MS - 1000, 6).wait).toBe(HOUR);
    expect(burst(two.g, lockEnd + DYE_SELECT_LEVEL_KEEP_MS + 1000, 6).wait).toBe(10 * MIN);
  });

  it("메모리 저장소: 잠금은 계정마다, 빈 칸 요청도 센다", async () => {
    const st = new MemoryStyle();
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(await st.selectItemColor("a", "hat_beanie", 0, t + i)).toEqual({ r: "empty" });
    expect(await st.selectItemColor("a", "hat_beanie", -1, t + 10)).toEqual({ r: "locked", waitMs: 10 * MIN });
    expect(await st.selectItemColor("b", "hat_beanie", -1, t + 10)).toEqual({ r: "ok" });
    expect(await st.selectItemColor("a", "hat_beanie", -1, t + 10 + 10 * MIN)).toEqual({ r: "ok" });
  });
});
