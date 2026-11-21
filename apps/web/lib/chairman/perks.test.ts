import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chairPerkLines } from "../chairPerks";
import { dayStartMs, weekEndMs, weekStartMs } from "../gameDay";
import { maxDealPerSec } from "../rpg/dealCap";
import { getRpgStore } from "../rpg/store";
import { setStaff } from "../staff";
import { getAccounts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import type { ChairMode } from "./rules";
import { abortChair, chairStatus, finishChair, resetChairRankCache, startChair } from "./service";
import { chairPerkFor, chairPerkSafe, resetChairMemo, settleChair } from "./settle";
import { getChairStore } from "./store";

// 11/24 회장님 독대 1위 1주일 혜택: 정리 → 자격(chairPerkFor — 칭호 주인과 같은 기록) → 하루 판 수(2관왕 3판) → 다음 정리에 끝 (메모리 저장소)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});

const g = globalThis as Record<string, unknown>;
beforeEach(async () => {
  for (const k of ["__tombAccounts", "__tombChair", "__tombRpg", "__tombReview", "__tombMegaphone", "__tombStore"]) delete g[k];
  resetChairMemo();
  resetChairRankCache();
  await setStaff(null);
});

const MIN = 60_000;
const W1 = "20261123";
const W2 = "20261130";
const W3 = "20261207";
const at = (week: string, days: number, hours = 12) => weekStartMs(week) + days * 86_400_000 + hours * 3_600_000;

async function player(name: string): Promise<{ id: string; dm: number }> {
  const id = `${name}${"_".repeat(21 - name.length)}`;
  await getAccounts().enter(id, { name, color: "#9fc5a8", body: "hood" }, Date.now());
  const { state } = await getRpgStore().update(id, (s) => ({
    state: { ...s, level: 50, fBest: 120 },
    result: null,
  }));
  return {
    id,
    dm: maxDealPerSec(state.level, state.stats, state.equip, state.skills, state.tSkills),
  };
}
async function run(p: { id: string; dm: number }, mode: ChairMode, now: number, ratio: number, durationMs = 5 * MIN) {
  const s = await startChair(p.id, mode, false, now);
  return finishChair(p.id, s.ticket, p.dm * ratio * (durationMs / 1000), durationMs, now + durationMs);
}

describe("자격 = 지난주 정리 기록의 1위 (칭호 주인과 같은 기록)", () => {
  it("노멀 1위 normal · 헬 1위 hell · 다른 사람 null → 정리 전엔 아무도 없고, 다음 정리에 넘어간다", async () => {
    const [a, b, c] = await Promise.all(["pkA", "pkB", "pkC"].map((n) => player(n)));
    await run(a, "normal", at(W1, 1), 0.5);
    await run(c, "normal", at(W1, 1, 14), 0.3);
    await run(b, "hell", at(W1, 2), 0.5);
    await run(c, "hell", at(W1, 2, 14), 0.3);
    const settleAt = weekEndMs(W1) + 3_600_000;
    // 정리 전 (W1 진행 중 · 마감 직후 정리 전)엔 아무도 없다
    expect(await chairPerkFor(a.id, at(W1, 3))).toBeNull();
    expect(await chairPerkFor(a.id, weekEndMs(W1) + 1)).toBeNull();
    resetChairMemo();
    await settleChair(W1, settleAt);
    expect(await chairPerkFor(a.id, settleAt)).toBe("normal");
    expect(await chairPerkFor(b.id, settleAt)).toBe("hell");
    expect(await chairPerkFor(c.id, settleAt)).toBeNull();
    // 내 정보에도 같은 값 (화면 표시용)
    expect((await loadMe(getAccounts(), a.id, settleAt)).chair).toBe("normal");
    expect((await loadMe(getAccounts(), c.id, settleAt)).chair).toBeUndefined();
    // 그 주 내내 이어진다
    expect(await chairPerkSafe(b.id, weekEndMs(W2) - 1)).toBe("hell");
    // 다음 정리(W2 — 이번엔 c만 노멀 기록) 뒤엔 c로 넘어가고 a·b는 끝
    await run(c, "normal", at(W2, 1), 0.3);
    const next = weekEndMs(W2) + 3_600_000;
    await settleChair(W2, next);
    expect(await chairPerkFor(a.id, next)).toBeNull();
    expect(await chairPerkFor(b.id, next)).toBeNull();
    expect(await chairPerkFor(c.id, next)).toBe("normal");
    // 그다음 주 정리 기록이 없으면(아무도 안 함) 아무도 없다
    await settleChair(W3, weekEndMs(W3) + 1000);
    expect(await chairPerkFor(c.id, weekEndMs(W3) + 2000)).toBeNull();
  });

  it("2관왕 duo (노멀·헬 모두 1위) — 혜택 문장은 두 갈래 + 걷기 + 하루 3판", async () => {
    const [a, b] = await Promise.all(["pkDuoA", "pkDuoB"].map((n) => player(n)));
    await run(a, "normal", at(W1, 1), 0.5);
    await run(a, "hell", at(W1, 1, 14), 0.5);
    await run(b, "hell", at(W1, 2), 0.3);
    const settleAt = weekEndMs(W1) + 3_600_000;
    await settleChair(W1, settleAt);
    expect(await chairPerkFor(a.id, settleAt)).toBe("duo");
    expect(await chairPerkFor(b.id, settleAt)).toBeNull();
    expect(chairPerkLines("duo").length).toBe(7);
  });

  it("저장소를 못 읽으면 혜택 없이 (chairPerkSafe — 구매·적립이 막히지 않게)", async () => {
    const store = getChairStore();
    const spy = vi.spyOn(store, "getSettle").mockRejectedValue(new Error("down"));
    resetChairMemo();
    expect(await chairPerkSafe("anyone", at(W2, 1))).toBeNull();
    spy.mockRestore();
  });
});

describe("2관왕: 회장님 독대 하루 판 모드마다 +1 (서버 시작 Lua가 센다)", () => {
  it("2관왕은 노멀 3·헬 3 → 넷째는 NO_RUNS, 상태·시작·끝·나가기 남은 판이 3 기준 · 돌려받기 규칙은 그대로 하루 한 번", async () => {
    const [a] = await Promise.all(["pkRunA"].map((n) => player(n)));
    await run(a, "normal", at(W1, 1), 0.5);
    await run(a, "hell", at(W1, 1, 14), 0.5);
    await settleChair(W1, weekEndMs(W1) + 3_600_000);
    const t = at(W2, 1, 10);
    const st = await chairStatus(a.id, t);
    expect(st).toMatchObject({
      perDay: 3,
      perk: "duo",
      remaining: { normal: 3, hell: 3 },
    });
    const r1 = await run(a, "normal", t, 0.2);
    expect(r1.remaining).toEqual({ normal: 2, hell: 3 });
    // 시작 전 나가기: 돌려받으면 남은 판이 3 기준으로 다시 늘어난다 (하루 한 번)
    const s = await startChair(a.id, "normal", false, t + 10 * MIN);
    expect(s.remaining.normal).toBe(1);
    const ab = await abortChair(a.id, s.ticket, 0, t + 10 * MIN + 1000);
    expect(ab).toMatchObject({
      refunded: true,
      remaining: { normal: 2, hell: 3 },
      refundLeft: 0,
    });
    await run(a, "normal", t + 20 * MIN, 0.2);
    const r3 = await run(a, "normal", t + 30 * MIN, 0.2);
    expect(r3.remaining.normal).toBe(0);
    await expect(startChair(a.id, "normal", false, t + 40 * MIN)).rejects.toMatchObject({ status: 409, code: "NO_RUNS" });
    // 둘째 돌려받기는 없다 (규칙 그대로)
    const h = await startChair(a.id, "hell", false, t + 50 * MIN);
    expect((await abortChair(a.id, h.ticket, 0, t + 50 * MIN + 1000)).refunded).toBe(false);
    // 다음 날 새벽 5시에 다시 3판
    const reset = dayStartMs(kstDay(t)) + 86_400_000;
    expect((await chairStatus(a.id, reset)).remaining).toEqual({
      normal: 3,
      hell: 3,
    });
  });

  it("노멀 1위·헬 1위·보통은 하루 2판 그대로, 다음 정리로 2관왕이 끝나면 2판으로", async () => {
    const [a, b] = await Promise.all(["pkOneA", "pkOneB"].map((n) => player(n)));
    await run(a, "normal", at(W1, 1), 0.5);
    await run(a, "hell", at(W1, 1, 14), 0.5);
    await run(b, "normal", at(W1, 2), 0.3);
    await settleChair(W1, weekEndMs(W1) + 3_600_000);
    expect((await chairStatus(b.id, at(W2, 1))).perDay).toBe(2);
    expect((await chairStatus(b.id, at(W2, 1))).perk).toBeUndefined();
    // W2: b가 노멀 1위, a는 헬만 1위
    await run(b, "normal", at(W2, 2), 0.6);
    await run(a, "hell", at(W2, 2, 14), 0.5);
    await settleChair(W2, weekEndMs(W2) + 3_600_000);
    const t = at(W3, 1, 10);
    expect(await chairStatus(a.id, t)).toMatchObject({
      perDay: 2,
      perk: "hell",
      remaining: { normal: 2, hell: 2 },
    });
    expect(await chairStatus(b.id, t)).toMatchObject({
      perDay: 2,
      perk: "normal",
    });
    await run(a, "normal", t, 0.2);
    await run(a, "normal", t + 10 * MIN, 0.2);
    await expect(startChair(a.id, "normal", false, t + 20 * MIN)).rejects.toMatchObject({ code: "NO_RUNS" });
  });
});
