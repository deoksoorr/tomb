import { describe, expect, it } from "vitest";
import { LOOK_BURST, LOOK_REFILL_MS, newLookBucket, takeLookToken } from "./lookQueue";

// 11/22 염색 칸을 연달아 바꿔도 처음 몇 번은 바로, 그다음은 LOOK_REFILL_MS마다 하나
describe("look token bucket", () => {
  it("lets a short burst through, then refills one per LOOK_REFILL_MS", () => {
    const b = newLookBucket();
    for (let i = 0; i < LOOK_BURST; i++) expect(takeLookToken(b, 1000)).toBe(true);
    expect(takeLookToken(b, 1000)).toBe(false);
    expect(takeLookToken(b, 1000 + LOOK_REFILL_MS - 1)).toBe(false);
    expect(takeLookToken(b, 1000 + LOOK_REFILL_MS)).toBe(true);
  });

  it("never stores more than LOOK_BURST tokens after a long idle", () => {
    const b = newLookBucket();
    takeLookToken(b, 0);
    let n = 0;
    while (takeLookToken(b, 10 * 60_000)) n++;
    expect(n).toBe(LOOK_BURST);
  });

  it("is far quicker than the old 10s interval but still bounded (≤ 1 per refill sustained)", () => {
    const b = newLookBucket();
    let ok = 0;
    for (let t = 0; t <= 60_000; t += 100) if (takeLookToken(b, t)) ok++;
    expect(ok).toBeLessThanOrEqual(LOOK_BURST + 60_000 / LOOK_REFILL_MS);
    expect(ok).toBeGreaterThan(6);
  });
});
