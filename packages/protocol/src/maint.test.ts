import { describe, expect, it } from "vitest";
import { MAINT_READ_TTL_SEC, signMaintRead, verifyMaintRead } from "./maint";

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
