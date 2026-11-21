import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dayStartMs, weekEndMs, weekStartMs } from "../gameDay";
import { maxDealPerSec } from "../rpg/dealCap";
import { approveReview, listReviews } from "../rpg/service";
import { getRpgStore } from "../rpg/store";
import { setStaff } from "../staff";
import { getAccounts, getMegaphone } from "../store";
import { kstDay } from "../store/accounts";
import { champUntil } from "../store/champ";
import { CHAIR_REWARD } from "./rewards";
import { CHAIR_UNFAIR_TEXT, type ChairMode } from "./rules";
import { abortChair, chairRank, finishChair, resetChairRankCache, startChair, chairStatus } from "./service";
import { chairHolders, ensureChairSettled, resetChairMemo, settleChair } from "./settle";
import { getChairStore } from "./store";

// 회장님 독대 서비스 (메모리 저장소): 자격 · 하루 판 수 · 연습 판 · 새벽 5시 초기화 · 피해 상한 거절 · 주간 정리 시뮬레이션

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
const W0 = "20261116"; // 배포 주 (11/22 일요일 배포 — 첫 순위 주 W1에 들어간다)
const W1 = "20261123"; // 월요일
const W2 = "20261130";
const W3 = "20261207";
const at = (week: string, days: number, hours = 12) => weekStartMs(week) + days * 86_400_000 + hours * 3_600_000;

/** 야근 빌딩 floor층까지 오른 캐릭터 · 이름 있는 계정. 최대 초당 피해(dealCap)를 돌려준다 */
async function player(name: string, floor = 120): Promise<{ id: string; dm: number }> {
  const id = `${name}${"_".repeat(21 - name.length)}`;
  await getAccounts().enter(id, { name, color: "#9fc5a8", body: "hood" }, Date.now());
  const { state } = await getRpgStore().update(id, (s) => ({ state: { ...s, level: 50, fBest: floor }, result: null }));
  return { id, dm: maxDealPerSec(state.level, state.stats, state.equip, state.skills, state.tSkills) };
}

/** 한 판: 시작 → durationMs 뒤 끝 (피해 = 최대 초당 피해 × ratio × 판 초) */
async function run(p: { id: string; dm: number }, mode: ChairMode, now: number, ratio: number, durationMs = 5 * MIN, practice = false) {
  const s = await startChair(p.id, mode, practice, now);
  return finishChair(p.id, s.ticket, p.dm * ratio * (durationMs / 1000), durationMs, now + durationMs);
}

const wallet = async (id: string, now: number) => {
  const a = await getAccounts().get(id, kstDay(now), now);
  return { points: a.points, lifetime: a.lifetimePoints, look: [...a.equipped, ...a.stash] };
};

describe("자격 · 하루 판 수 · 연습", () => {
  it("야근 빌딩 100층 아래면 403과 안내 문구", async () => {
    const p = await player("low", 87);
    await expect(startChair(p.id, "normal", false, at(W1, 0))).rejects.toMatchObject({ status: 403, code: "NOT_ELIGIBLE", message: "잼민이는 회장실에 못 들어가요. 주니어는 주니어답게, 야근 빌딩 100층부터 찍고 오세요. 지금 87층이에요." });
    expect((await chairStatus(p.id, at(W1, 0))).eligible).toBe(false);
  });

  it("11/21 무적(시험) 판(god)은 개발 서버에서 연습 판 — 포인트·기록 없음 (운영 빌드는 NODE_ENV로 무시)", async () => {
    const p = await player("godrun");
    const t = at(W1, 2, 10);
    const s = await startChair(p.id, "normal", false, t);
    const before = await wallet(p.id, t);
    const r = await finishChair(p.id, s.ticket, p.dm * 0.2 * 300, 5 * MIN, t + 5 * MIN, { god: true });
    expect(r).toMatchObject({ points: 0, newBest: false });
    expect((await wallet(p.id, t)).points).toBe(before.points);
    expect((await chairStatus(p.id, t + 6 * MIN)).best.normal).toBe(0);
  });

  it("모드마다 하루 2판 → NO_RUNS, 연습 판은 되고 포인트·기록 0, 새벽 5시에 다시 2판", async () => {
    const p = await player("daily");
    const t = at(W1, 1, 10);
    const r1 = await run(p, "normal", t, 0.2);
    expect(r1.remaining).toEqual({ normal: 1, hell: 2 });
    expect(r1.points).toBe(200);
    const r2 = await run(p, "normal", t + 10 * MIN, 0.1);
    expect(r2.remaining.normal).toBe(0);
    await expect(startChair(p.id, "normal", false, t + 20 * MIN)).rejects.toMatchObject({ status: 409, code: "NO_RUNS" });
    // 지옥은 따로 센다
    expect((await startChair(p.id, "hell", false, t + 21 * MIN)).remaining).toEqual({ normal: 0, hell: 1 });
    // 연습: 포인트·기록 없음 (최고 기록보다 커도)
    const before = await wallet(p.id, t);
    const pr = await run(p, "normal", t + 30 * MIN, 2.5, 10 * MIN, true);
    expect(pr).toMatchObject({ points: 0, newBest: false, weekRank: null });
    expect(pr.pointsReason).toBeTruthy();
    expect((await wallet(p.id, t)).points).toBe(before.points);
    const st = await chairStatus(p.id, t + 50 * MIN);
    expect(st.best.normal).toBe(Math.floor(p.dm * 0.2 * 300));
    expect(st.week.normal).toMatchObject({ rank: 1, damage: Math.floor(p.dm * 0.2 * 300) });
    // 다음 날 새벽 4:59는 그대로, 5시에 다시 2판
    const reset = dayStartMs(kstDay(t)) + 86_400_000;
    expect((await chairStatus(p.id, reset - 1)).remaining.normal).toBe(0);
    expect((await chairStatus(p.id, reset)).remaining).toEqual({ normal: 2, hell: 2 });
    expect((await startChair(p.id, "normal", false, reset)).remaining.normal).toBe(1);
  });

  it("30% 아래 평균 초당 피해는 0P + 사유, 기록은 남는다", async () => {
    const p = await player("lazy");
    // 11/20 기준에 회장님 방어·명중 몫(chairEff)이 곱해져 낮아졌다 → 아주 적게
    const r = await run(p, "hell", at(W1, 2), 0.00001);
    expect(r).toMatchObject({ points: 0, pointsReason: CHAIR_UNFAIR_TEXT, newBest: true, weekRank: 1 });
  });

  it("버틴 시간(ms)은 최고 기록이 오를 때만 같이 바뀐다 (상태·순위)", async () => {
    const p = await player("lasted");
    const t = at(W1, 2);
    await run(p, "normal", t, 0.2, 6 * MIN);
    // 더 오래 버텼지만 피해가 낮다 → 그대로
    await run(p, "normal", t + 20 * MIN, 0.05, 9 * MIN);
    let st = await chairStatus(p.id, t + 40 * MIN);
    expect(st.bestMs).toEqual({ normal: 6 * MIN, hell: null });
    expect(st.week.normal).toMatchObject({ rank: 1, ms: 6 * MIN });
    expect(st.top.normal[0].ms).toBe(6 * MIN);
    // 다음 날 더 큰 피해 → 같이 바뀐다
    resetChairRankCache();
    await run(p, "normal", t + 86_400_000, 0.3, 7 * MIN);
    st = await chairStatus(p.id, t + 86_400_000 + 10 * MIN);
    expect(st.bestMs.normal).toBe(7 * MIN);
    expect(st.week.normal?.ms).toBe(7 * MIN);
    const rk = await chairRank("normal", p.id, t + 86_400_000 + 10 * MIN);
    expect(rk.rows[0]).toMatchObject({ me: true, ms: 7 * MIN });
    expect(rk.mine).toMatchObject({ rank: 1, ms: 7 * MIN });
    // 연습 판은 바꾸지 않는다
    await run(p, "normal", t + 86_400_000 + 20 * MIN, 2, 3 * MIN, true);
    expect((await chairStatus(p.id, t + 86_400_000 + 30 * MIN)).bestMs.normal).toBe(7 * MIN);
  });

  it("크런치(5분 뒤)는 분당 두 배, 판 상한", async () => {
    const p = await player("long");
    // 11/21 분당 두 배: 5분 200 + 크런치 80×4 = 520 → 상한 400 · 6분이면 280
    expect((await run(p, "normal", at(W1, 2), 0.2, 6 * MIN)).points).toBe(280);
    expect((await run(p, "hell", at(W1, 2, 14), 0.2, 20 * MIN)).points).toBe(700);
  });

  it("피해 상한(최대 초당 피해 × 3)·판 시간을 넘으면 422, 기록·포인트 없이 티켓만 쓴다", async () => {
    const p = await player("cheat");
    const t = at(W1, 3);
    const before = await wallet(p.id, t);
    const s = await startChair(p.id, "normal", false, t);
    await expect(finishChair(p.id, s.ticket, p.dm * 3.01 * 300, 5 * MIN, t + 5 * MIN)).rejects.toMatchObject({ status: 422 });
    // 같은 티켓은 다시 낼 수 없다
    await expect(finishChair(p.id, s.ticket, 1, 5 * MIN, t + 5 * MIN)).rejects.toMatchObject({ status: 410 });
    // 판 시간이 티켓 나이보다 길다
    const s2 = await startChair(p.id, "normal", false, t + 10 * MIN);
    await expect(finishChair(p.id, s2.ticket, 1, 5 * MIN, t + 11 * MIN)).rejects.toMatchObject({ status: 422 });
    const st = await chairStatus(p.id, t + 12 * MIN);
    expect(st.best.normal).toBe(0);
    expect(st.week.normal).toBeNull();
    expect((await wallet(p.id, t)).points).toBe(before.points);
  });

  it("새로 시작하면 예전 티켓은 끝낼 수 없다 · 지옥은 시드로 봉인 순서", async () => {
    const p = await player("twice");
    const a = await startChair(p.id, "hell", true, at(W1, 4));
    const b = await startChair(p.id, "hell", true, at(W1, 4) + 1000);
    expect(Array.isArray(b.sealPool)).toBe(true);
    await expect(finishChair(p.id, a.ticket, 1, 1000, at(W1, 4) + 2000)).rejects.toMatchObject({ status: 410 });
    expect((await startChair(p.id, "normal", true, at(W1, 4) + 3000)).sealPool).toBeUndefined();
  });
});

describe("11/22 시작 전 나가기 (판 돌려받기 하루 한 번)", () => {
  const SEC = 1000;

  it("유료 판: 90초 안·싸움 0이면 돌려준다 → 두 모드 합쳐 하루 한 번, 티켓은 다시 못 쓴다", async () => {
    const p = await player("refund");
    const t = at(W1, 1, 10);
    const s1 = await startChair(p.id, "normal", false, t);
    expect(s1).toMatchObject({ remaining: { normal: 1, hell: 2 }, refundLeft: 1 });
    expect((await chairStatus(p.id, t + 5 * SEC)).refundLeft).toBe(1);
    const a1 = await abortChair(p.id, s1.ticket, 0, t + 30 * SEC);
    expect(a1).toEqual({ ok: true, refunded: true, remaining: { normal: 2, hell: 2 }, refundLeft: 0 });
    expect((await chairStatus(p.id, t + 40 * SEC)).remaining).toEqual({ normal: 2, hell: 2 });
    expect((await chairStatus(p.id, t + 40 * SEC)).refundLeft).toBe(0);
    // 버린 티켓은 끝낼 수도, 다시 나갈 수도 없다
    await expect(finishChair(p.id, s1.ticket, 1, 1000, t + 60 * SEC)).rejects.toMatchObject({ status: 410 });
    await expect(abortChair(p.id, s1.ticket, 0, t + 60 * SEC)).rejects.toMatchObject({ status: 410 });
    // 지옥에서 또 나가면 이번엔 판을 쓴 것으로 친다 (하루 한 번, 두 모드 합쳐)
    const s2 = await startChair(p.id, "hell", false, t + 2 * MIN);
    expect(s2).toMatchObject({ remaining: { normal: 2, hell: 1 }, refundLeft: 0 });
    expect(await abortChair(p.id, s2.ticket, 0, t + 2 * MIN + 10 * SEC)).toEqual({ ok: true, refunded: false, remaining: { normal: 2, hell: 1 }, refundLeft: 0 });
    // 노멀도 두 번째는 안 된다
    const s3 = await startChair(p.id, "normal", false, t + 3 * MIN);
    expect((await abortChair(p.id, s3.ticket, 0, t + 3 * MIN + 5 * SEC)).refunded).toBe(false);
    expect((await chairStatus(p.id, t + 4 * MIN)).remaining).toEqual({ normal: 1, hell: 1 });
  });

  it("끝난 판 · 시간이 지난 티켓은 410, 90초 넘김 · 싸운 시간이 있으면 돌려주지 않고 티켓만 버린다", async () => {
    const p = await player("late");
    const t = at(W1, 2, 10);
    // 끝난 판
    const s1 = await startChair(p.id, "normal", false, t);
    await finishChair(p.id, s1.ticket, 1, 1000, t + 5 * SEC);
    await expect(abortChair(p.id, s1.ticket, 0, t + 6 * SEC)).rejects.toMatchObject({ status: 410, code: "RUN_GONE" });
    // 90초 넘김
    const s2 = await startChair(p.id, "normal", false, t + MIN);
    expect(await abortChair(p.id, s2.ticket, 0, t + MIN + 91 * SEC)).toMatchObject({ refunded: false, remaining: { normal: 0 }, refundLeft: 1 });
    await expect(finishChair(p.id, s2.ticket, 1, 1000, t + 3 * MIN)).rejects.toMatchObject({ status: 410 });
    // 싸운 시간이 있다
    const s3 = await startChair(p.id, "hell", false, t + 4 * MIN);
    expect(await abortChair(p.id, s3.ticket, 1500, t + 4 * MIN + 10 * SEC)).toMatchObject({ refunded: false, remaining: { hell: 1 }, refundLeft: 1 });
    // 시간이 지난 티켓 (저장소 티켓 수명 25분)
    const s4 = await startChair(p.id, "hell", false, t + 5 * MIN);
    const real = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(real + 26 * MIN);
    try {
      await expect(abortChair(p.id, s4.ticket, 0, t + 5 * MIN + 10 * SEC)).rejects.toMatchObject({ status: 410 });
    } finally {
      spy.mockRestore();
    }
    // 다른 사람 티켓
    const q = await player("other");
    const s5 = await startChair(q.id, "normal", false, t);
    await expect(abortChair(p.id, s5.ticket, 0, t + SEC)).rejects.toMatchObject({ status: 400, code: "BAD_TICKET" });
    // 돌려받기는 아직 남았다
    expect((await chairStatus(p.id, t + 30 * MIN)).refundLeft).toBe(1);
  });

  it("연습 판은 티켓만 버린다 (돌려받기 안 씀) · 새벽 5시에 돌려받기가 다시 생긴다", async () => {
    const p = await player("practice");
    const t = at(W1, 3, 10);
    const s1 = await startChair(p.id, "normal", true, t);
    expect(await abortChair(p.id, s1.ticket, 0, t + 5 * SEC)).toEqual({ ok: true, refunded: false, remaining: { normal: 2, hell: 2 }, refundLeft: 1 });
    await expect(finishChair(p.id, s1.ticket, 1, 1000, t + 10 * SEC)).rejects.toMatchObject({ status: 410 });
    // 오늘 돌려받기를 쓴다
    const s2 = await startChair(p.id, "normal", false, t + MIN);
    expect((await abortChair(p.id, s2.ticket, 0, t + MIN + 5 * SEC)).refunded).toBe(true);
    const reset = dayStartMs(kstDay(t)) + 86_400_000;
    expect((await chairStatus(p.id, reset - 1)).refundLeft).toBe(0);
    expect((await chairStatus(p.id, reset)).refundLeft).toBe(1);
    // 다음 날: 다시 한 번
    const s3 = await startChair(p.id, "hell", false, reset + MIN);
    expect(s3.refundLeft).toBe(1);
    expect(await abortChair(p.id, s3.ticket, 0, reset + MIN + 20 * SEC)).toEqual({ ok: true, refunded: true, remaining: { normal: 2, hell: 2 }, refundLeft: 0 });
  });

  it("새벽 5시를 넘겨 나가면 (어제 센 판) 돌려주지 않는다", async () => {
    const p = await player("edge");
    const reset = dayStartMs(kstDay(at(W1, 4, 10))) + 86_400_000;
    const s1 = await startChair(p.id, "normal", false, reset - 30 * SEC);
    expect(await abortChair(p.id, s1.ticket, 0, reset + 10 * SEC)).toEqual({ ok: true, refunded: false, remaining: { normal: 2, hell: 2 }, refundLeft: 1 });
  });
});

describe("11/22 첫 순위 주 (배포 주 기록은 다음 주로, 첫 정산 11/30 05:00)", () => {
  it("11/22 기록은 11/23 주 순위에 · 11/23 05:00엔 정산 없음 · 11/30 05:00 첫 정산 · 그다음 12/7", async () => {
    const [a, b] = await Promise.all(["first", "second"].map((n) => player(n)));
    const sun = at(W0, 6, 12); // 11/22(일) 17시
    await run(a, "normal", sun, 0.4);
    await run(b, "normal", sun + 20 * MIN, 0.2);
    const rk = await chairRank("normal", a.id, sun + 40 * MIN);
    expect(rk.week).toBe(W1);
    expect(rk.rows.map((r) => r.me)).toEqual([true, false]);
    // 11/16 주는 정산하지 않는다
    expect((await settleChair(W0, weekEndMs(W0) + 1000)).rec).toBeNull();
    await ensureChairSettled(weekEndMs(W0) + 3_600_000);
    expect(await getChairStore().getSettle(W0)).toBeNull();
    expect(await getChairStore().getSettle(W1)).toBeNull();
    // 11/23 주에도 기록이 쌓인다
    resetChairRankCache();
    await run(b, "normal", at(W1, 2), 0.6);
    // 11/30 05:00 첫 정산: 11/22 기록 + 그 주 기록 함께
    resetChairMemo();
    await ensureChairSettled(weekEndMs(W1) + 1000);
    const rec = await getChairStore().getSettle(W1);
    expect(rec?.ranks.normal.map((w) => w.accountId)).toEqual([b.id, a.id]);
    // 그다음 12/7
    await run(a, "normal", at(W2, 1), 0.5);
    resetChairMemo();
    await ensureChairSettled(weekEndMs(W2) - 1000);
    expect(await getChairStore().getSettle(W2)).toBeNull();
    resetChairMemo();
    await ensureChairSettled(weekEndMs(W2) + 1000);
    expect((await getChairStore().getSettle(W2))?.ranks.normal[0]?.accountId).toBe(a.id);
  });
});

describe("주간 정리 시뮬레이션", () => {
  it("1·2·3위 지갑 전용 5,000/3,000/2,000 · 1위 대여·칭호 · 1위 포인트는 인정 뒤 · 두 모드는 큰 쪽 · 한 번만 · 연속 1위 절반", async () => {
    const [a, b, c, d, e, staff] = await Promise.all(["alice", "bob", "carol", "dave", "erin", "boss"].map((n) => player(n)));
    await setStaff(staff.id);
    // 1주차: 일반 a > b > c > d, 지옥 b > d > a > e (운영자는 둘 다 가장 세지만 빠진다)
    const plays: [typeof a, ChairMode, number][] = [
      [a, "normal", 0.5],
      [b, "normal", 0.4],
      [c, "normal", 0.3],
      [d, "normal", 0.2],
      [staff, "normal", 0.9],
      [b, "hell", 0.5],
      [d, "hell", 0.4],
      [a, "hell", 0.3],
      [e, "hell", 0.25],
      [staff, "hell", 0.9],
    ];
    for (const [i, [p, mode, ratio]] of plays.entries()) await run(p, mode, at(W1, i % 6, 13), ratio);
    // 하루 두 번째 판은 더 약하게 — 최고 기록만 남는다
    await run(a, "normal", at(W1, 6, 13), 0.1);

    const settleAt = weekEndMs(W1) + 3_600_000;
    const ids = [a, b, c, d, e].map((p) => p.id);
    const before = await Promise.all(ids.map((id) => wallet(id, settleAt)));
    const rankBefore = await getAccounts().pointRank(10, null);

    // 마감 전에는 정리하지 않는다
    expect((await settleChair(W1, weekEndMs(W1) - 1)).rec).toBeNull();
    await ensureChairSettled(settleAt);
    const rec = (await settleChair(W1, settleAt)).rec!;
    expect(rec.ranks.normal.map((w) => w.accountId)).toEqual([a.id, b.id, c.id]);
    expect(rec.ranks.hell.map((w) => w.accountId)).toEqual([b.id, d.id, a.id]);

    const after = await Promise.all(ids.map((id) => wallet(id, settleAt)));
    const delta = after.map((w, i) => w.points - before[i].points);
    // a: 일반 1위(5,000 인정 뒤) + 지옥 3위(2,000 바로) → 바로 2,000 · b: 지옥 1위 + 일반 2위 → 바로 3,000 · c 2,000 · d 3,000 · e 0
    expect(delta).toEqual([2000, 3000, 2000, 3000, 0]);
    // 지갑 전용: 모은 포인트·포인트 랭킹은 그대로
    expect(after.map((w) => w.lifetime)).toEqual(before.map((w) => w.lifetime));
    expect(await getAccounts().pointRank(10, null)).toEqual(rankBefore);

    // 1위 대여 (다음 정리 + 여유까지)
    const until = champUntil(W1);
    expect(after[0].look).toEqual(expect.arrayContaining([{ itemId: CHAIR_REWARD.normal.hat, until }, { itemId: CHAIR_REWARD.normal.aura, until }]));
    expect(after[1].look).toEqual(expect.arrayContaining([{ itemId: CHAIR_REWARD.hell.hat, until }, { itemId: CHAIR_REWARD.hell.aura, until }]));
    expect(after[2].look.some((x) => x.itemId.startsWith("chair_"))).toBe(false);
    // 칭호 주인 (이번 주 동안)
    const holders = await chairHolders(settleAt);
    expect(holders.get(CHAIR_REWARD.normal.title)).toBe(a.id);
    expect(holders.get(CHAIR_REWARD.hell.title)).toBe(b.id);
    // 마을 공지 (모드마다 한 줄)
    const notes = (await getMegaphone().recent(20, settleAt)).filter((m) => m.text.includes("회장님 독대"));
    expect(notes).toHaveLength(2);

    // 1위 포인트는 기록 확인에서 인정 뒤 (큰 쪽 − 바로 받은 몫)
    const reviews = (await listReviews()).filter((r) => r.kind === "chair");
    expect(reviews.map((r) => [r.acct, r.kind === "chair" && r.points]).sort()).toEqual([[a.id, 3000], [b.id, 2000]].sort());

    // 한 번만: 다시 정리해도 그대로
    resetChairMemo();
    await ensureChairSettled(settleAt + 1000);
    await settleChair(W1, settleAt + 2000);
    expect(await Promise.all(ids.map(async (id) => (await wallet(id, settleAt)).points))).toEqual(after.map((w) => w.points));
    expect((await listReviews()).filter((r) => r.kind === "chair")).toHaveLength(2);
    expect((await getMegaphone().recent(20, settleAt + 2000)).filter((m) => m.text.includes("회장님 독대"))).toHaveLength(2);

    // 인정 → a 지갑 +3,000 (모두 합쳐 5,000), 두 번은 안 된다
    const ra = reviews.find((r) => r.acct === a.id)!;
    expect(await approveReview(ra.id, settleAt)).toEqual({ kind: "chair", paid: 3000 });
    await expect(approveReview(ra.id, settleAt)).rejects.toMatchObject({ status: 404 });
    const aNow = await wallet(a.id, settleAt);
    expect(aNow.points - before[0].points).toBe(5000);
    expect(aNow.lifetime).toBe(before[0].lifetime);

    // 2·3주차: a가 일반 1위를 이어 간다 → 3주째 1위 포인트는 절반 (2,500)
    for (const w of [W2, W3]) {
      await run(a, "normal", at(w, 1), 0.5);
      await run(c, "normal", at(w, 1, 14), 0.2);
    }
    await settleChair(W2, weekEndMs(W2) + 1000);
    const r2 = (await listReviews()).find((r) => r.kind === "chair" && r.acct === a.id && r.week === W2);
    expect(r2).toMatchObject({ points: 5000 });
    const s3 = (await settleChair(W3, weekEndMs(W3) + 1000)).rec!;
    expect(s3.ranks.normal[0]).toMatchObject({ accountId: a.id, streak: 3 });
    const r3 = (await listReviews()).find((r) => r.kind === "chair" && r.acct === a.id && r.week === W3);
    expect(r3).toMatchObject({ points: 2500, streak: ["normal"] });
    expect((await getMegaphone().recent(20, weekEndMs(W3) + 1000)).some((m) => m.text.includes("3주 연속"))).toBe(true);
  });
});
