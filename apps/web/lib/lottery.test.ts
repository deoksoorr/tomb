import { afterEach, describe, expect, it, vi } from "vitest";
import {
  drawAtMs,
  LOTTERY_BASE_PRIZE,
  LOTTERY_CAP,
  LOTTERY_GIFT_FROM,
  LOTTERY_PRICE,
  lotteryCarryOut,
  lotteryGiftNote,
  lotteryNoticeText,
  lotteryPool,
  lotteryPrizes,
  nextRound,
  roundOf,
} from "./lottery";
import { buyTicket, drawWinners, ensureLotterySettled, lotteryGiftId, lotteryStatus, resetLotteryMemo, settleLottery, type LotteryDeps } from "./lotteryService";
import { MemoryAccounts } from "./store/accounts-memory";
import { MemoryGifts } from "./store/gifts";
import { MemoryLottery } from "./store/lottery";
import { MemoryStore } from "./store/memory";

// 주간 행운권: 회차 시각, 상금 계산(상한·이월·기본 상금·지원금), 사기 한도·운영자, 추첨(서로 다른 당첨자·셋보다 적을 때 이월),
// 동시에 불러도 한 번만 뽑고 한 번만 주기, 선물함 지급, 공지 문구 (메모리 저장소만)

const HOUR = 3_600_000;
/** 11/16(월) 낮 12시 KST → 11/21(토) 회차 */
const MON = Date.UTC(2026, 10, 16, 3);
const R1 = "20261121";
const R2 = "20261128";
const AFTER_R1 = drawAtMs(R1) + 60_000;

function kit() {
  const graves = new MemoryStore();
  const accounts = new MemoryAccounts(() => graves);
  const gifts = new MemoryGifts(() => accounts);
  const store = new MemoryLottery();
  const notices: string[] = [];
  const state = { staff: null as string | null };
  const notify = vi.fn();
  const deps: LotteryDeps = {
    store,
    accounts,
    gifts,
    rand: () => 0,
    staffId: async () => state.staff,
    nameOf: async (id) => `유령${id}`,
    announce: async (text) => {
      notices.push(text);
    },
    notify,
  };
  const fund = (id: string, n = 1_000) => accounts.refund(id, n, "test", MON);
  const points = async (id: string) => (await accounts.get(id, "20261116", MON)).points;
  const lotteryGifts = async (id: string, now: number) => (await gifts.inbox(id, 1, now)).filter((g) => g.from === LOTTERY_GIFT_FROM);
  /** 여러 계정이 R1 행운권을 산다 */
  const buyAll = async (ids: string[], now = MON) => {
    for (const id of ids) {
      await fund(id);
      await buyTicket(deps, id, now);
    }
  };
  return { deps, store, accounts, gifts, notices, state, notify, fund, points, lotteryGifts, buyAll };
}

afterEach(() => resetLotteryMemo());

describe("회차 시각", () => {
  it("토요일 저녁 8시(한국 시간)가 경계다. 정확히 8시면 다음 회차", () => {
    expect(roundOf(MON)).toBe(R1);
    expect(drawAtMs(R1)).toBe(Date.UTC(2026, 10, 21, 11));
    expect(roundOf(drawAtMs(R1) - 1)).toBe(R1);
    expect(roundOf(drawAtMs(R1))).toBe(R2);
    // 토요일 새벽 0시 30분 (KST) = 금요일 15:30 UTC → 그날 저녁 회차
    expect(roundOf(Date.UTC(2026, 10, 20, 15, 30))).toBe(R1);
    // 지난 토요일 저녁 9시 → 이번 토요일
    expect(roundOf(Date.UTC(2026, 10, 14, 12))).toBe(R1);
    expect(nextRound(R1)).toBe(R2);
  });
});

describe("상금 계산", () => {
  it("판매액 70% + 매주 기본 상금 1,000P, 1등 70%·2등 20%·3등 10%", () => {
    const p = lotteryPool({ carry: 0, tickets: 10, subsidy: 0 });
    expect(p).toEqual({ carry: 0, sales: 2_000, salesShare: 1_400, base: LOTTERY_BASE_PRIZE, subsidy: 0, total: 2_400 });
    expect(lotteryPrizes(p.total)).toEqual([1_680, 480, 240]);
    expect(lotteryCarryOut(p.total, 3)).toBe(0);
    // 버림으로 남는 1~2P는 다음 회차로
    expect(lotteryPrizes(2_401)).toEqual([1_680, 480, 240]);
    expect(lotteryCarryOut(2_401, 3)).toBe(1);
  });

  it("판매 몫 + 이월은 10,000P까지. 기본 상금·지원금은 그 위에 더한다", () => {
    expect(lotteryPool({ carry: 9_000, tickets: 20, subsidy: 0 })).toMatchObject({ salesShare: 1_000, total: 11_000 });
    expect(lotteryPool({ carry: 10_000, tickets: 50, subsidy: 0 })).toMatchObject({ salesShare: 0, total: 11_000 });
    expect(lotteryPool({ carry: 10_000, tickets: 0, subsidy: 30_000 })).toMatchObject({ total: 41_000 });
    // 판매 몫만으로도 상한
    expect(lotteryPool({ carry: 0, tickets: 200, subsidy: 0 }).salesShare).toBe(LOTTERY_CAP);
  });

  it("당첨자가 셋보다 적으면 남은 몫이 넘어가고, 이월은 10,000P까지", () => {
    expect(lotteryCarryOut(1_280, 2)).toBe(128);
    expect(lotteryCarryOut(1_280, 1)).toBe(384);
    expect(lotteryCarryOut(1_000, 0)).toBe(1_000);
    expect(lotteryCarryOut(41_000, 0)).toBe(LOTTERY_CAP);
  });

  it("공지 문구", () => {
    const w = (rank: 1 | 2 | 3, name: string, points: number) => ({ rank, accountId: name, name, points });
    expect(lotteryNoticeText({ winners: [w(1, "가", 5_000), w(2, "나", 1_000), w(3, "다", 500)], carryOut: 0 })).toBe(
      "🍀 이번 주 행운권 추첨 1등은 가님, 5,000P예요! 2등 나님, 3등 다님도 축하해요.",
    );
    expect(lotteryNoticeText({ winners: [w(1, "가", 896), w(2, "나", 256)], carryOut: 128 })).toBe("🍀 이번 주 행운권 추첨 1등은 가님, 896P예요! 2등 나님도 축하해요.");
    expect(lotteryNoticeText({ winners: [w(1, "가", 700)], carryOut: 300 })).toBe("🍀 이번 주 행운권 추첨 1등은 가님, 700P예요! 축하해요.");
    expect(lotteryNoticeText({ winners: [], carryOut: 1_000 })).toBe("🍀 이번 주 행운권은 산 사람이 없어서 상금 1,000P가 다음 주로 넘어가요.");
    expect(lotteryNoticeText({ winners: [], carryOut: 1_000, test: true }).startsWith("[시험] ")).toBe(true);
  });

  it("당첨자는 사람마다 한 번 (산 사람이 셋보다 적으면 그만큼만)", () => {
    const seq = [2, 0, 0];
    let i = 0;
    expect(drawWinners(["e", "a", "c", "b", "d"], () => seq[i++])).toEqual(["c", "a", "b"]);
    expect(drawWinners(["b", "a"], () => 0)).toEqual(["a", "b"]);
    expect(drawWinners([], () => 0)).toEqual([]);
    for (let t = 0; t < 50; t++) expect(new Set(drawWinners(["a", "b", "c", "d"], (n) => Math.floor(Math.random() * n))).size).toBe(3);
  });
});

describe("사기", () => {
  it("한 회차에 한 장, 200P", async () => {
    const k = kit();
    await k.fund("a");
    expect(await buyTicket(k.deps, "a", MON)).toEqual({ round: R1 });
    expect(await k.points("a")).toBe(1_000 - LOTTERY_PRICE);
    await expect(buyTicket(k.deps, "a", MON)).rejects.toMatchObject({ status: 409, code: "ALREADY" });
    expect(await k.points("a")).toBe(1_000 - LOTTERY_PRICE);
    expect(await k.store.count(R1)).toBe(1);
    // 다음 회차에는 또 살 수 있다
    expect((await buyTicket(k.deps, "a", AFTER_R1)).round).toBe(R2);
  });

  it("동시에 두 번 눌러도 한 장만, 두 번째 차감은 돌려준다", async () => {
    const k = kit();
    await k.fund("a", 400);
    const res = await Promise.allSettled([buyTicket(k.deps, "a", MON), buyTicket(k.deps, "a", MON)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await k.store.count(R1)).toBe(1);
    expect(await k.points("a")).toBe(200);
  });

  it("포인트가 모자라면 409, 운영자 계정은 403", async () => {
    const k = kit();
    await k.fund("a", 199);
    await expect(buyTicket(k.deps, "a", MON)).rejects.toMatchObject({ status: 409, code: "NOT_ENOUGH_POINTS" });
    k.state.staff = "boss";
    await k.fund("boss");
    await expect(buyTicket(k.deps, "boss", MON)).rejects.toMatchObject({ status: 403, message: "운영자 계정은 행운권을 살 수 없어요." });
    expect(await k.points("boss")).toBe(1_000);
    expect((await lotteryStatus(k.deps, "boss", MON)).staff).toBe(true);
  });

  it("추첨이 마감을 건 뒤에 들어온 사기는 거절하고 돌려준다", async () => {
    const k = kit();
    await k.fund("a");
    await k.store.close(R1);
    await expect(buyTicket(k.deps, "a", MON)).rejects.toMatchObject({ status: 409, code: "CLOSED" });
    expect(await k.points("a")).toBe(1_000);
  });
});

describe("추첨", () => {
  it("서로 다른 세 명에게 선물함으로 보내고, 모든 채널에 한 번 알린다", async () => {
    const k = kit();
    await k.buyAll(["a", "b", "c", "d", "e"]);
    const s = await lotteryStatus(k.deps, "a", MON);
    // 5장 → 판매 1,000P의 70% = 700P + 기본 1,000P
    expect(s).toMatchObject({ tickets: 5, mine: true, pool: { total: 1_700 }, prizes: [1_190, 340, 170] });
    const { result } = await settleLottery(k.deps, R1, AFTER_R1);
    expect(result?.winners.map((w) => [w.rank, w.accountId, w.points])).toEqual([
      [1, "a", 1_190],
      [2, "b", 340],
      [3, "c", 170],
    ]);
    expect(result?.carryOut).toBe(0);
    expect(k.notices).toEqual(["🍀 이번 주 행운권 추첨 1등은 유령a님, 1,190P예요! 2등 유령b님, 3등 유령c님도 축하해요."]);
    expect(k.notify).toHaveBeenCalledWith(["a", "b", "c"]);
    const [g] = await k.lotteryGifts("a", AFTER_R1);
    expect(g).toMatchObject({ id: lotteryGiftId(R1, 1), points: 1_190, note: lotteryGiftNote(1) });
    expect(await k.lotteryGifts("d", AFTER_R1)).toEqual([]);
    // 선물을 받으면 지갑에만 들어간다 (모은 포인트·오늘 적립은 그대로)
    const before = await k.accounts.get("a", "20261121", AFTER_R1);
    expect((await k.gifts.claim("a", g.id, 1, AFTER_R1)).ok).toBe(true);
    const after = await k.accounts.get("a", "20261121", AFTER_R1);
    expect(after.points - before.points).toBe(1_190);
    expect(after.lifetimePoints).toBe(before.lifetimePoints);
    expect(after.todayEarned).toBe(before.todayEarned);
    // 다음 회차 화면에 지난 추첨이 보인다 (계정 id 없이)
    const next = await lotteryStatus(k.deps, "b", AFTER_R1);
    expect(next).toMatchObject({ round: R2, tickets: 0, mine: false, lastRank: 2 });
    expect(next.last?.winners[0]).toEqual({ rank: 1, name: "유령a", points: 1_190 });
  });

  it("추첨 시각 전에는 뽑지 않는다", async () => {
    const k = kit();
    await k.buyAll(["a"]);
    expect(await settleLottery(k.deps, R1, drawAtMs(R1) - 1)).toEqual({ result: null });
    expect(await k.store.result(R1)).toBeNull();
  });

  it("셋보다 적게 샀으면 남은 몫이 다음 회차로 넘어간다", async () => {
    const k = kit();
    await k.buyAll(["a", "b"]);
    const { result } = await settleLottery(k.deps, R1, AFTER_R1);
    // 2장 → 280P + 1,000P = 1,280P → 1등 896P, 2등 256P, 3등 몫 128P는 이월
    expect(result).toMatchObject({ pool: 1_280, carryOut: 128 });
    expect(result?.winners).toHaveLength(2);
    expect(k.notices[0]).toBe("🍀 이번 주 행운권 추첨 1등은 유령a님, 896P예요! 2등 유령b님도 축하해요.");
    expect((await lotteryStatus(k.deps, null, AFTER_R1)).pool).toMatchObject({ carry: 128, total: 1_128 });
  });

  it("아무도 안 사면 전부 넘어가고, 매주 기본 상금이 쌓여도 이월은 10,000P까지", async () => {
    const k = kit();
    let now = AFTER_R1;
    for (let i = 0; i < 12; i++, now += 7 * 24 * HOUR) await ensureLotterySettled(now, k.deps);
    const recent = await k.store.recent(12);
    expect(recent).toHaveLength(12);
    expect(recent.at(-1)).toMatchObject({ round: R1, winners: [], pool: 1_000, carryOut: 1_000 });
    expect(recent.map((r) => r.carryOut).reverse()).toEqual([1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 10_000, 10_000]);
    expect(await k.store.carry()).toBe(LOTTERY_CAP);
    expect(k.notices[0]).toBe("🍀 이번 주 행운권은 산 사람이 없어서 상금 1,000P가 다음 주로 넘어가요.");
  });

  it("이월이 상한에 닿으면 판매 몫은 사라지고, 지원금은 상한과 따로 더해진다", async () => {
    const k = kit();
    await k.store.commit({ id: "20261114", round: "20261114", drawnAt: 0, tickets: 0, carryIn: 0, salesShare: 0, base: 1_000, subsidy: 0, pool: 9_500, winners: [], carryOut: 9_500 }, true);
    await k.buyAll(["a", "b", "c", "d", "e"]);
    expect(await k.store.addSubsidy(R1, 3_000)).toBe(3_000);
    const s = await lotteryStatus(k.deps, null, MON);
    // 판매 몫 700P 중 500P만 (9,500 + 500 = 10,000), 기본 1,000P + 지원금 3,000P
    expect(s.pool).toMatchObject({ carry: 9_500, salesShare: 500, base: 1_000, subsidy: 3_000, total: 14_000 });
    const { result } = await settleLottery(k.deps, R1, AFTER_R1);
    expect(result).toMatchObject({ pool: 14_000, subsidy: 3_000 });
    expect(result?.winners.map((w) => w.points)).toEqual([9_800, 2_800, 1_400]);
    // 마감된 회차에는 지원금을 더할 수 없다
    expect(await k.store.addSubsidy(R1, 100)).toBeNull();
  });

  it("회차 순서대로 정리해 이월이 이어진다", async () => {
    const k = kit();
    await k.buyAll(["a", "b"]);
    for (const id of ["c", "d"]) {
      await k.fund(id);
      await buyTicket(k.deps, id, AFTER_R1);
    }
    await ensureLotterySettled(drawAtMs(R2) + 1, k.deps);
    const r2 = await k.store.result(R2);
    // R1에서 넘어온 128P + 판매 280P + 기본 1,000P
    expect(r2).toMatchObject({ carryIn: 128, pool: 1_408 });
    expect(await k.store.last()).toBe(R2);
  });

  it("운영자 계정 표는 추첨에서 빠진다", async () => {
    const k = kit();
    await k.buyAll(["a", "boss"]);
    k.state.staff = "boss";
    const { result } = await settleLottery(k.deps, R1, AFTER_R1);
    expect(result?.winners.map((w) => w.accountId)).toEqual(["a"]);
    expect(result?.tickets).toBe(1);
  });

  it("동시에 여러 요청이 와도 한 번만 뽑고 한 번만 준다", async () => {
    const k = kit();
    await k.buyAll(["a", "b", "c", "d"]);
    let calls = 0;
    k.deps.rand = (n) => (calls++, Math.floor(Math.random() * n));
    const runs = await Promise.all([
      ...Array.from({ length: 6 }, () => settleLottery(k.deps, R1, AFTER_R1)),
      ensureLotterySettled(AFTER_R1, k.deps),
      ensureLotterySettled(AFTER_R1 + 5, k.deps),
    ]);
    const results = runs.filter((r): r is { result: NonNullable<Awaited<ReturnType<typeof settleLottery>>["result"]> } => !!r && !!r.result);
    expect(calls).toBe(3); // 한 번 뽑았다 (세 명)
    const winners = (await k.store.result(R1))!.winners.map((w) => w.accountId);
    for (const r of results) expect(r.result.winners.map((w) => w.accountId)).toEqual(winners);
    for (const id of ["a", "b", "c", "d"]) expect(await k.lotteryGifts(id, AFTER_R1)).toHaveLength(winners.includes(id) ? 1 : 0);
    expect(k.notices).toHaveLength(1);
    // 다 끝난 뒤 다시 불러도 그대로
    await settleLottery(k.deps, R1, AFTER_R1 + HOUR);
    expect(k.notices).toHaveLength(1);
    expect(await k.store.recent(10)).toHaveLength(1);
  });

  it("결과 저장 뒤 지급이 끊기면 다음 요청이 마저 준다 (같은 선물 id라 두 번 받지 않는다)", async () => {
    const k = kit();
    await k.buyAll(["a", "b", "c"]);
    const send = vi.spyOn(k.gifts, "send");
    send.mockRejectedValueOnce(new Error("down"));
    await expect(settleLottery(k.deps, R1, AFTER_R1)).rejects.toThrow("down");
    const saved = await k.store.result(R1);
    expect(saved).not.toBeNull();
    expect(k.notices).toHaveLength(0);
    const { result } = await settleLottery(k.deps, R1, AFTER_R1 + 1_000);
    expect(result).toEqual(saved);
    for (const id of ["a", "b", "c"]) expect(await k.lotteryGifts(id, AFTER_R1 + 1_000)).toHaveLength(1);
    expect(k.notices).toHaveLength(1);
  });

  it("테스트 서버 지금 추첨하기: 시각과 상관없이 뽑고 시험 기록으로 남긴 뒤 회차를 비운다", async () => {
    const k = kit();
    await k.buyAll(["a", "b", "c"]);
    await k.store.addSubsidy(R1, 500);
    const { result } = await settleLottery(k.deps, R1, MON, { test: true });
    expect(result).toMatchObject({ id: `${R1}t${MON}`, test: true, tickets: 3, pool: 420 + 1_000 + 500 });
    expect(k.notices[0].startsWith("[시험] 🍀 이번 주 행운권 추첨 1등은")).toBe(true);
    expect(await k.lotteryGifts("a", MON)).toHaveLength(1);
    expect(await k.store.count(R1)).toBe(0);
    expect(await k.store.subsidy(R1)).toBe(0);
    expect(await k.store.last()).toBeNull();
    // 다시 살 수 있고, 정식 추첨은 그대로 토요일에
    await buyTicket(k.deps, "a", MON);
    expect((await settleLottery(k.deps, R1, AFTER_R1)).result?.id).toBe(R1);
  });
});
