import { CHAMP_AURA_OFF, CHAMP_HAT } from "@tomb/protocol";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getFishRank } from "./forage/fishRank";
import { setStaff } from "./staff";
import { getAccounts, getMegaphone } from "./store";
import { kstWeek, loadMe, lookGrant, rankValue, weekOfDay, weekTieFrac } from "./store/accounts";
import { champBitsFor, champUntil, getChamp, kstWeekOf, prevWeek, weekEndMs, weekStartMs } from "./store/champ";
import { CHAMP_POINTS, ensureChampSettled, noteLeaders, resetChampMemo, resetLeaderMemo, settleChamps } from "./weeklyChamp";
import { verifyGrant } from "@tomb/protocol";

// 주간 랭킹 1위 보상: 한 번만 지급 · 동점은 먼저 달성 · 운영자 제외 · 주 경계(월요일 0시 KST) · 연속 1위면 대여가 이어짐 · 다관왕

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});

const g = globalThis as Record<string, unknown>;
beforeEach(async () => {
  // 메모리 저장소를 매번 새로
  for (const k of ["__tombAccounts", "__tombChamp", "__tombFishRank", "__tombMegaphone", "__tombStore"]) delete g[k];
  resetChampMemo();
  resetLeaderMemo();
  await setStaff(null);
});

const WEEK = "20261116"; // 월요일
const NEXT = "20261123";
const at = (week: string, days: number, hours = 12) => weekStartMs(week) + days * 86_400_000 + hours * 3_600_000;
const dayOf = (week: string, days: number) => new Date(weekStartMs(week) + days * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");

async function user(name: string): Promise<string> {
  const id = `${name}${"_".repeat(21 - name.length)}`;
  await getAccounts().enter(id, { name, color: "#9fc5a8", body: "hood" }, Date.now());
  return id;
}
const earn = (id: string, week: string, days: number, amount: number) => getAccounts().earn(id, "hunt", dayOf(week, days), { amount });

describe("주 경계 (월요일 0시 KST)", () => {
  it("일요일 23:59 KST는 그 주, 월요일 0시는 다음 주", () => {
    const mon = weekStartMs(NEXT);
    expect(kstWeekOf(mon - 1)).toBe(WEEK);
    expect(kstWeekOf(mon)).toBe(NEXT);
    expect(kstWeek(mon - 1)).toBe(WEEK);
    expect(kstWeek(mon)).toBe(NEXT);
    expect(prevWeek(NEXT)).toBe(WEEK);
    expect(weekEndMs(WEEK)).toBe(mon);
    expect(weekOfDay(dayOf(WEEK, 6))).toBe(WEEK);
    // 대여: 다음 주 마감(다다음 월요일 0시) + 여유
    expect(champUntil(WEEK)).toBeGreaterThan(weekEndMs(NEXT));
    expect(champUntil(WEEK) - weekEndMs(NEXT)).toBeLessThanOrEqual(12 * 3_600_000);
  });

  it("마감 전에는 정리하지 않고, 기능을 연 주보다 이른 주도 정리하지 않는다", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 100);
    expect((await settleChamps(WEEK, weekEndMs(WEEK) - 1)).rec).toBeNull();
    expect((await settleChamps("20261026", at(WEEK, 1))).rec).toBeNull();
    expect((await settleChamps(WEEK, weekEndMs(WEEK))).rec?.winners).toHaveLength(1);
  });
});

describe("1위 정리·지급", () => {
  it("한 번만 지급한다 (여러 번·동시에 불러도) — 꾸미기 대여 + 1,000P, 주간 랭킹엔 안 들어간다", async () => {
    const a = await user("alpha");
    const b = await user("bravo");
    await earn(a, WEEK, 0, 300);
    await earn(b, WEEK, 1, 200);
    const now = at(NEXT, 0, 1);
    const before = await getAccounts().get(a, dayOf(NEXT, 0), now);
    const [r1, r2] = await Promise.all([settleChamps(WEEK, now), settleChamps(WEEK, now)]);
    const r3 = await settleChamps(WEEK, now + 1000);
    expect([...r1.paidNow, ...r2.paidNow, ...r3.paidNow]).toEqual(["points"]);
    expect(r3.paid).toEqual(["points"]);
    const after = await getAccounts().get(a, dayOf(NEXT, 0), now);
    expect(after.points - before.points).toBe(CHAMP_POINTS);
    expect(after.stash).toContainEqual({ itemId: CHAMP_HAT.points, until: champUntil(WEEK) });
    // 보상 포인트는 다음 주 주간 랭킹에 넣지 않는다 (1위가 굴러가며 쌓이지 않게)
    expect((await getAccounts().pointRank(10, null, NEXT)).rows).toEqual([]);
    // 본인 소식 한 줄 + 마을 확성기 줄 한 줄
    const act = await getAccounts().activity(a);
    expect(act.items.filter((i) => i.kind === "champ")).toHaveLength(1);
    const mega = await getMegaphone().recent(20, now);
    expect(mega.filter((m) => m.accountId === "system:champ")).toHaveLength(1);
    expect(mega[0].text).toContain("alpha");
  });

  it("동점이면 먼저 달성한 사람 (포인트·사냥 처치·낚시)", async () => {
    const a = await user("alpha");
    const b = await user("bravo");
    // bravo가 먼저 300에 닿고, alpha는 나중에 300
    await earn(b, WEEK, 0, 300);
    await earn(a, WEEK, 1, 300);
    await getAccounts().recordHunt(a, "easy", { kills: 40, clearMs: null }, WEEK);
    await getAccounts().recordHunt(b, "easy", { kills: 40, clearMs: null }, WEEK);
    await getFishRank().record(a, "f_carp", 610, WEEK);
    await getFishRank().record(b, "f_carp", 610, WEEK);
    const { rec } = await settleChamps(WEEK, at(NEXT, 0));
    expect(Object.fromEntries(rec!.winners.map((w) => [w.board, w.accountId]))).toEqual({ points: b, huntKills: a, fish: a });
  });

  it("Redis 점수의 동점 소수부: 이른 시각이 크고, 화면 값은 정수", () => {
    const t = Date.UTC(2026, 10, 16);
    expect(weekTieFrac(t)).toBeGreaterThan(weekTieFrac(t + 1));
    expect(weekTieFrac(t)).toBeGreaterThan(0);
    expect(weekTieFrac(t)).toBeLessThan(1);
    expect(300 + weekTieFrac(t) - (300 + weekTieFrac(t + 1))).toBeGreaterThan(0); // 1ms 차이도 구분
    expect(rankValue(String(300 + weekTieFrac(t)))).toBe(300);
  });

  it("운영자는 1위가 되지 않는다 (그다음 사람이 1위)", async () => {
    const op = await user("staffer");
    const a = await user("alpha");
    await setStaff(op);
    await earn(op, WEEK, 0, 600);
    await earn(a, WEEK, 0, 100);
    const { rec } = await settleChamps(WEEK, at(NEXT, 0));
    expect(rec!.winners.map((w) => [w.board, w.accountId])).toEqual([["points", a]]);
  });

  it("처음 정한 1위는 바뀌지 않는다 (마감 뒤 기록이 바뀌어도)", async () => {
    const a = await user("alpha");
    const b = await user("bravo");
    await earn(a, WEEK, 0, 300);
    await settleChamps(WEEK, at(NEXT, 0));
    await earn(b, WEEK, 6, 600);
    const r = await settleChamps(WEEK, at(NEXT, 1));
    expect(r.rec!.winners[0].accountId).toBe(a);
  });

  it("다관왕: 랭킹 수만큼 보상, 배지·오라 값은 비트 묶음 하나", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 300);
    await getAccounts().recordHunt(a, "easy", { kills: 9, clearMs: null }, WEEK);
    await getFishRank().record(a, "f_carp", 500, WEEK);
    const now = at(NEXT, 0);
    const before = (await getAccounts().get(a, dayOf(NEXT, 0), now)).points;
    const r = await settleChamps(WEEK, now);
    expect(r.paidNow).toEqual(["points", "huntKills", "fish"]);
    const acc = await getAccounts().get(a, dayOf(NEXT, 0), now);
    expect(acc.points - before).toBe(CHAMP_POINTS * 3);
    expect(acc.stash.map((s) => s.itemId).sort()).toEqual(Object.values(CHAMP_HAT).sort());
    expect(await champBitsFor(a, now)).toBe(7);
    // 알림은 사람마다 한 줄로 합친다
    expect((await getAccounts().activity(a)).items.filter((i) => i.kind === "champ")).toEqual([expect.objectContaining({ targetName: "3관왕(포인트왕·사냥왕·낚시왕)" })]);
  });

  it("연속 1위면 대여가 이어지고, 입고 있으면 입은 채로 늘어난다", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 300);
    const now1 = at(NEXT, 0);
    await settleChamps(WEEK, now1);
    // 받은 왕관을 입는다
    expect(await getAccounts().wear(a, CHAMP_HAT.points, "head", now1)).toBe(true);
    await earn(a, NEXT, 2, 300);
    const AFTER = "20261130";
    const now2 = at(AFTER, 0, 0) + 60_000;
    await settleChamps(NEXT, now2);
    const acc = await getAccounts().get(a, dayOf(AFTER, 0), now2);
    expect(acc.equipped).toContainEqual({ itemId: CHAMP_HAT.points, until: champUntil(NEXT) });
    expect(acc.stash.find((s) => s.itemId === CHAMP_HAT.points)).toBeUndefined();
  });

  it("자격은 지난주 1위에만: 다음 주가 되면 저절로 끝난다. 오라 끔 표시는 1위일 때만 붙는다", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 300);
    await settleChamps(WEEK, at(NEXT, 0));
    expect(await champBitsFor(a, at(NEXT, 3))).toBe(1);
    await getChamp().setAuraOff(a, true);
    expect(await champBitsFor(a, at(NEXT, 3) + 60_000)).toBe(1 | CHAMP_AURA_OFF);
    // 그다음 주(NEXT 마감 뒤)는 NEXT의 1위 기록을 본다 → 1위 아님
    expect(await champBitsFor(a, at("20261130", 1))).toBe(0);
    const me = await loadMe(getAccounts(), a, at("20261130", 1));
    expect(me.champ).toBeUndefined();
  });

  it("내 정보·착용 증서에 1위 값이 실린다 (0 = 아님)", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 300);
    const now = at(NEXT, 0);
    await settleChamps(WEEK, now);
    const me = await loadMe(getAccounts(), a, now + 31_000);
    expect(me.champ).toBe(1);
    const grant = await verifyGrant("s", await lookGrant("s", a, [], now, me), Math.floor(now / 1000));
    expect(grant).toMatchObject({ kind: "look", champ: 1 });
    const none = await verifyGrant("s", await lookGrant("s", a, [], now, {}), Math.floor(now / 1000));
    expect(none).toMatchObject({ champ: 0 });
  });

  it("ensureChampSettled는 지난주를 한 번 정리하고 기억한다", async () => {
    const a = await user("alpha");
    await earn(a, WEEK, 0, 300);
    const spy = vi.spyOn(getChamp(), "get");
    await ensureChampSettled(at(NEXT, 0));
    const n = spy.mock.calls.length;
    await ensureChampSettled(at(NEXT, 1));
    expect(spy.mock.calls.length).toBe(n);
    expect((await getChamp().get(WEEK))?.winners[0].accountId).toBe(a);
  });
});

describe("레이스 1위 바뀜 공지", () => {
  it("처음 본 1위는 알리지 않고, 바뀌면 알리되 같은 랭킹은 간격 안에 한 번까지", async () => {
    const lead = (accountId: string, name: string) => [{ board: "fish" as const, accountId, name }];
    const notices = async () => (await getMegaphone().recent(50)).filter((m) => m.accountId === "system:champ").map((m) => m.text);
    await noteLeaders(WEEK, lead("a", "alpha"));
    expect(await notices()).toEqual([]);
    await noteLeaders(WEEK, lead("b", "bravo"));
    expect(await notices()).toEqual(["bravo님이 이번 주 낚시 1위로 올라섰어요!"]);
    await noteLeaders(WEEK, lead("a", "alpha"));
    expect(await notices()).toHaveLength(1);
    // 다른 랭킹은 따로 센다
    await noteLeaders(WEEK, [{ board: "points", accountId: "a", name: "alpha" }]);
    await noteLeaders(WEEK, [{ board: "points", accountId: "c", name: "charlie" }]);
    expect(await notices()).toHaveLength(2);
  });
});
