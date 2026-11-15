import { nanoid } from "nanoid";
import { isPermanentUntil, isShopListed, itemById, ITEMS, PERMANENT_UNTIL, permanentPrice, questGrantKind, QUEST_BODIES } from "@tomb/protocol";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, dayStartMs, weekOfDay } from "../../gameDay";
import { getAccounts } from "../../store";
import { getStyleStore } from "../../store/style";
import { getTitleStats } from "../../store/titleStats";
import { earnedTitleIds, titleDef } from "../../titles";
import { LIFE_CATS, SPECIES, STACK_MAX, speciesById } from "../catalog";
import { getForageStore } from "../store";
import { QUEST_DAILY, QUEST_REWARDS, QUEST_STAMPS, QUEST_TITLE_STEPS, questRewardById, slotStamps } from "./catalog";
import { dailyQuests, dayAvailability, defaultPick, matches, pickError, questText, weekAvailability, weeklyQuest, type Quest, type QuestSpec } from "./gen";
import { deliverQuest, exchangeQuest, questBoard, questStore, rerollQuest } from "./service";
import { MemoryQuestStore, questView, rowOf } from "./store";

// 11/15 수집 의뢰: 만들기(결정적·그날 잡히는 것만)·납품(원자적, 고른 것)·바꾸기(하루 한 번)·이번 주 큰 의뢰·도장·교환소·칭호 구간.
// 서버 흐름은 로컬 메모리 저장소로 (Redis Lua는 같은 계약 — lib/forage/quests/store.ts 주석)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

const DAY = "20261115";
const T0 = dayStartMs(DAY) + 6 * 3_600_000; // 그날 KST 11:00
const acct = () => `t-quest-${nanoid(8)}`;

/** 의뢰를 채울 만큼 가방에 넣는다 (그 의뢰에 맞는 종 중 값이 싼 것부터, 서로 다른 종 의뢰면 종마다 1개) */
async function fill(a: string, q: QuestSpec, extra = 0) {
  const pool = SPECIES.filter((s) => matches(q, s.id)).sort((x, y) => x.price - y.price);
  const items = q.distinct ? pool.slice(0, q.count + extra).map((s) => ({ id: s.id, size: 0 })) : Array.from({ length: q.count + extra }, () => ({ id: pool[0].id, size: 0 }));
  await getForageStore().grant(a, DAY, "fish", items, STACK_MAX);
}

describe("의뢰 만들기", () => {
  it("(계정, 날짜)가 같으면 늘 같은 7개, 계정·날짜가 다르면 다르다", () => {
    const a = dailyQuests("acct-1", DAY, null);
    expect(dailyQuests("acct-1", DAY, null)).toEqual(a);
    expect(a).toHaveLength(QUEST_DAILY);
    expect(dailyQuests("acct-2", DAY, null)).not.toEqual(a);
    expect(dailyQuests("acct-1", addDays(DAY, 1), null)).not.toEqual(a);
  });

  it("쉬운 5칸은 도장 1에 다섯 갈래 하나씩, 어려운 2칸은 도장 2에 서로 다른 갈래 → 하루 9개", () => {
    for (let i = 0; i < 40; i++) {
      const qs = dailyQuests(`acct-${i}`, addDays(DAY, i), null);
      expect(qs.map((q) => q.stamps)).toEqual([1, 1, 1, 1, 1, 2, 2]);
      expect(new Set(qs.slice(0, 5).map((q) => q.cat)).size).toBe(5);
      expect(qs[5].cat).not.toBe(qs[6].cat);
      expect(qs.reduce((n, q) => n + q.stamps, 0)).toBe(5 * QUEST_STAMPS.easy + 2 * QUEST_STAMPS.hard);
      expect(qs.map((q) => q.key)).toEqual(["d0", "d1", "d2", "d3", "d4", "d5", "d6"]);
    }
    expect(slotStamps(4)).toBe(1);
    expect(slotStamps(5)).toBe(2);
  });

  it("그날 잡을 수 있는 것만: 특정 종은 그날 6시간 이상, 희귀도·종류 의뢰는 2시간 이상 나오는 종으로 채울 수 있다 (1년치)", () => {
    for (let i = 0; i < 365; i++) {
      const day = addDays("20260101", i);
      const avail = dayAvailability(day);
      for (const q of dailyQuests(`acct-${i % 7}`, day, i % 3 === 0 ? i % 7 : null)) {
        const pool = SPECIES.filter((s) => matches(q, s.id) && (avail.get(s.id) ?? 0) >= (q.sp ? 12 : 4));
        expect(pool.length, `${day} ${q.text}`).toBeGreaterThanOrEqual(q.distinct ? q.count : 1);
        if (q.sp) expect(speciesById(q.sp)!.rarity).toBeLessThanOrEqual(2);
        expect(SPECIES.filter((s) => matches(q, s.id)).every((s) => !s.junk)).toBe(true);
      }
    }
  });

  it("바꾸기: 그 칸만 다른 갈래·종류로, 다른 칸은 그대로", () => {
    for (let i = 0; i < 30; i++) {
      const day = addDays(DAY, i);
      const base = dailyQuests(`acct-${i}`, day, null);
      const slot = i % QUEST_DAILY;
      const rr = dailyQuests(`acct-${i}`, day, slot);
      rr.forEach((q, j) => (j === slot ? expect(q.cat).not.toBe(base[j].cat) : expect(q).toEqual(base[j])));
      expect(rr[slot].stamps).toBe(base[slot].stamps);
    }
  });

  it("이번 주 큰 의뢰: 도장 8, 주가 같으면 같고, 그 주에 나오는 것으로 채울 수 있다", () => {
    for (let i = 0; i < 52; i++) {
      const week = weekOfDay(addDays("20260105", i * 7));
      const q = weeklyQuest(`acct-${i}`, week, "winter");
      expect(q).toEqual(weeklyQuest(`acct-${i}`, week, "winter"));
      expect(q.stamps).toBe(QUEST_STAMPS.weekly);
      expect(q.key).toBe("w");
      expect(q.title).toMatch(/주간$/);
      const avail = weekAvailability(week);
      const pool = SPECIES.filter((s) => matches(q, s.id) && (avail.get(s.id) ?? 0) >= 4);
      expect(pool.length).toBeGreaterThanOrEqual(q.distinct ? q.count : 1);
      expect(q.distinct ? q.count >= 3 : q.count >= 10).toBe(true);
    }
  });

  it("문구", () => {
    expect(questText({ cat: "fish", count: 3, minRar: 2, distinct: false })).toBe("★2 이상 물고기 3마리");
    expect(questText({ cat: "ore", count: 5, minRar: 1, distinct: false })).toBe("광석 아무거나 5개");
    expect(questText({ cat: "bug", count: 3, minRar: 1, distinct: true })).toBe("곤충 서로 다른 3종");
    expect(questText({ cat: "fish", count: 2, minRar: 1, distinct: false, sp: "f_crucian" })).toBe("월요병 붕어 2마리");
  });
});

describe("납품할 것 고르기", () => {
  const rar2: QuestSpec = { cat: "fish", count: 3, minRar: 2, distinct: false };
  const kinds: QuestSpec = { cat: "herb", count: 2, minRar: 1, distinct: true };
  it("기본은 값이 가장 싼 맞는 것부터 (잡동사니·다른 갈래·낮은 희귀도는 빼고)", () => {
    const bag = { f_crucian: 5, f_shoe: 3, f_carp: 2, f_catfish: 4, f_koi: 1, h_mugwort: 2 };
    // 잉어 6P 2마리 + 야근 메기 7P 1마리 (붕어 ★1·구두 잡동사니·금잉어 32P는 뒤로)
    expect(defaultPick(rar2, bag)).toEqual({ f_carp: 2, f_catfish: 1 });
    expect(defaultPick(rar2, { f_carp: 2 })).toBeNull();
    expect(defaultPick(kinds, { h_mugwort: 5, h_clover: 1, h_fourleaf: 1 })).toEqual({ h_mugwort: 1, h_clover: 1 });
  });
  it("고른 것 검사: 맞지 않는 것·개수·서로 다른 종", () => {
    expect(pickError(rar2, { f_carp: 3 })).toBeNull();
    expect(pickError(rar2, { f_carp: 2, f_crucian: 1 })).toMatch(/맞지 않는/);
    expect(pickError(rar2, { f_carp: 2 })).toMatch(/3마리/);
    expect(pickError(kinds, { h_mugwort: 2 })).toMatch(/하나씩/);
    expect(pickError(kinds, { h_mugwort: 1, h_clover: 1 })).toBeNull();
    expect(pickError(kinds, { h_mugwort: 1 })).toMatch(/2종/);
  });
});

describe("의뢰판·납품·바꾸기 (메모리 저장소)", () => {
  it("빈 계정: 도장 0, 7개 모두 아직, 바꾸기 1번", async () => {
    const b = await questBoard(acct(), T0);
    expect(b).toMatchObject({ day: DAY, stamps: 0, total: 0, rerollLeft: 1, owned: [] });
    expect(b.daily.every((d) => !d.done)).toBe(true);
    expect(b.weekly.done).toBe(false);
  });

  it("납품: 고른 것만 빠지고 도장·끝낸 수가 오른다, 같은 의뢰는 한 번만", async () => {
    const a = acct();
    const q = (await questBoard(a, T0)).daily[5];
    await fill(a, q, 1);
    const before = (await getForageStore().snapshot(a, DAY, 0)).bag;
    const pick = defaultPick(q, before)!;
    const r = await deliverQuest(a, q.key, pick, T0);
    expect(r.earned).toBe(2);
    expect(r.used).toEqual(pick);
    expect(r.board).toMatchObject({ stamps: 2, total: 1 });
    expect(r.board.daily[5].done).toBe(true);
    const after = (await getForageStore().snapshot(a, DAY, 0)).bag;
    for (const [id, n] of Object.entries(pick)) expect(after[id] ?? 0).toBe((before[id] ?? 0) - n);
    await expect(deliverQuest(a, q.key, pick, T0)).rejects.toMatchObject({ code: "QUEST_DONE" });
    expect((await questBoard(a, T0)).stamps).toBe(2);
    expect((await getTitleStats().get(a)).quests).toBe(1);
  });

  it("가방에 모자라면 아무것도 바뀌지 않는다 (원자적)", async () => {
    const a = acct();
    const q = (await questBoard(a, T0)).daily[0];
    await fill(a, q);
    const bag = (await getForageStore().snapshot(a, DAY, 0)).bag;
    const pick = defaultPick(q, bag)!;
    // 하나를 미리 팔아 버린 것처럼 빼 둔다
    const [id] = Object.keys(pick);
    await getForageStore().remove(a, { [id]: 1 });
    await expect(deliverQuest(a, q.key, pick, T0)).rejects.toMatchObject({ code: "BAG_CHANGED" });
    expect((await questBoard(a, T0)).stamps).toBe(0);
    expect((await questBoard(a, T0)).daily[0].done).toBe(false);
    expect((await getForageStore().snapshot(a, DAY, 0)).bag[id] ?? 0).toBe((bag[id] ?? 0) - 1);
  });

  it("맞지 않는 것을 고르면 거절", async () => {
    const a = acct();
    const q = (await questBoard(a, T0)).daily[0];
    const wrong = SPECIES.find((s) => s.cat !== q.cat)!;
    await expect(deliverQuest(a, q.key, { [wrong.id]: q.count }, T0)).rejects.toMatchObject({ code: "QUEST_PICK" });
  });

  it("바꾸기: 하루 한 번, 끝낸 칸은 못 바꾸고, 다음 날 다시 한 번", async () => {
    const a = acct();
    const b0 = await questBoard(a, T0);
    const r = await rerollQuest(a, "d2", T0);
    expect(r.board.rerollLeft).toBe(0);
    expect(r.board.daily[2]).not.toEqual(b0.daily[2]);
    expect(r.board.daily.filter((_, i) => i !== 2)).toEqual(b0.daily.filter((_, i) => i !== 2));
    await expect(rerollQuest(a, "d3", T0)).rejects.toMatchObject({ code: "REROLL_USED" });
    await expect(rerollQuest(a, "w", T0)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    // 바꾼 의뢰로 납품
    const q = r.board.daily[2];
    await fill(a, q);
    const pick = defaultPick(q, (await getForageStore().snapshot(a, DAY, 0)).bag)!;
    expect((await deliverQuest(a, "d2", pick, T0)).board.daily[2].done).toBe(true);
    // 다음 날: 새 7개, 바꾸기 다시 1번
    const T1 = T0 + 86_400_000;
    const b1 = await questBoard(a, T1);
    expect(b1.rerollLeft).toBe(1);
    expect(b1.daily.every((d) => !d.done)).toBe(true);
    // 끝낸 칸은 못 바꾼다
    const q1 = b1.daily[0];
    await getForageStore().grant(a, addDays(DAY, 1), "gather", SPECIES.filter((s) => matches(q1, s.id)).slice(0, q1.count + 1).flatMap((s) => Array(q1.count).fill({ id: s.id, size: 0 })), STACK_MAX);
    await deliverQuest(a, "d0", defaultPick(q1, (await getForageStore().snapshot(a, DAY, 0)).bag)!, T1);
    await expect(rerollQuest(a, "d0", T1)).rejects.toMatchObject({ code: "QUEST_DONE" });
    expect((await rerollQuest(a, "d1", T1)).board.rerollLeft).toBe(0);
  });

  it("다른 탭에서 바꾼 뒤 옛 의뢰로 납품하면 거절 (저장소: 본 바꾼 칸이 다르면 changed)", async () => {
    const s = new MemoryQuestStore(() => ({
      takeBag: () => true,
      hasAccount: () => true,
      giveInv: () => {},
      ownsPermanent: () => false,
      grantPermanent: () => {},
      giveBody: () => {},
      bumpStat: () => {},
    }));
    expect(await s.reroll("x", DAY, 1)).toBe("ok");
    expect(await s.deliver("x", DAY, "20261109", { kind: "day", slot: 3, reroll: null }, 1, 99, { f_carp: 1 })).toEqual({ status: "changed" });
    expect(await s.deliver("x", DAY, "20261109", { kind: "day", slot: 3, reroll: 1 }, 1, 99, { f_carp: 1 })).toEqual({ status: "ok", stamps: 1, total: 1 });
    // 상한
    expect(await s.deliver("x", DAY, "20261109", { kind: "week" }, 8, 5, { f_carp: 1 })).toEqual({ status: "ok", stamps: 5, total: 2 });
    expect(questView(await s.get("x"), DAY, "20261109", 7)).toEqual({ done: [false, false, false, true, false, false, false], reroll: 1, weekDone: true });
    expect(questView(await s.get("x"), addDays(DAY, 1), "20261116", 7)).toEqual({ done: Array(7).fill(false), reroll: null, weekDone: false });
  });

  it("이번 주 큰 의뢰: 주에 한 번, 다음 주에 새로", async () => {
    const a = acct();
    const q = (await questBoard(a, T0)).weekly;
    await fill(a, q, 2);
    const pick = defaultPick(q, (await getForageStore().snapshot(a, DAY, 0)).bag)!;
    const r = await deliverQuest(a, "w", pick, T0);
    expect(r).toMatchObject({ earned: 8, board: { stamps: 8, weekly: { done: true } } });
    await expect(deliverQuest(a, "w", pick, T0 + 3_600_000)).rejects.toMatchObject({ code: "QUEST_DONE" });
    const next = await questBoard(a, T0 + 7 * 86_400_000);
    expect(next.weekly.done).toBe(false);
    expect(next.week).not.toBe(r.board.week);
  });

  it("저장 형식: HGETALL → 기록", () => {
    expect(rowOf({ st: "12", n: "3", day: DAY, dd: "0100000", rr: "4", wk: "20261109", wd: "1", "got:q_hat_angler": DAY, "buy:q_dye_pick": "2" })).toEqual({
      stamps: 12,
      total: 3,
      day: DAY,
      done: "0100000",
      reroll: 4,
      week: "20261109",
      weekDone: true,
      got: { q_hat_angler: DAY },
      bought: { q_dye_pick: 2 },
    });
    expect(rowOf({}).reroll).toBeNull();
  });
});

describe("도장 교환소", () => {
  /** 도장을 n개 쥐여 준다 (이번 주 큰 의뢰 상한 없이 저장소에 바로) */
  async function stamps(a: string, n: number) {
    const s = questStore();
    await getForageStore().grant(a, DAY, "fish", [{ id: "f_crucian", size: 0 }], STACK_MAX);
    await s.deliver(a, "20200101", "20200101", { kind: "week" }, n, 9_999, { f_crucian: 1 });
  }
  async function newAcct() {
    const a = acct();
    await getAccounts().enter(a, { name: `의뢰${a.slice(-4)}` }, T0);
    return a;
  }

  it("도장이 모자라면 거절하고 아무것도 바뀌지 않는다", async () => {
    const a = await newAcct();
    await stamps(a, 10);
    await expect(exchangeQuest(a, "q_hat_angler", T0)).rejects.toMatchObject({ code: "NOT_ENOUGH_STAMPS" });
    expect((await questBoard(a, T0)).stamps).toBe(10);
    const acc = await getAccounts().get(a, DAY, T0);
    expect(acc.stash.some((e) => e.itemId === "q_hat_angler")).toBe(false);
  });

  it("꾸미기는 영구 소장 한 번만, 염색권은 몇 번이든 가방에 1장씩", async () => {
    const a = await newAcct();
    await stamps(a, 100);
    const r = await exchangeQuest(a, "q_hat_angler", T0);
    expect(r.board.stamps).toBe(75);
    expect(r.board.owned).toEqual(["q_hat_angler"]);
    const acc = await getAccounts().get(a, DAY, T0);
    expect(acc.stash.find((e) => e.itemId === "q_hat_angler")?.until).toSatisfy(isPermanentUntil);
    await expect(exchangeQuest(a, "q_hat_angler", T0)).rejects.toMatchObject({ code: "OWNED" });
    await exchangeQuest(a, "q_dye_pick", T0);
    const r2 = await exchangeQuest(a, "q_dye_pick", T0);
    expect(r2.me.inventory?.q_dye_pick ?? (await getAccounts().get(a, DAY, T0)).inventory.q_dye_pick).toBe(2);
    expect(r2.board).toMatchObject({ stamps: 25, bought: { q_dye_pick: 2 } });
  });

  it("이모티콘 묶음은 가방에 1개 (한 번만), 이미 영구로 가진 꾸미기는 도장을 받지 않는다", async () => {
    const a = await newAcct();
    await stamps(a, 200);
    await exchangeQuest(a, "qe_pack", T0);
    await expect(exchangeQuest(a, "qe_pack", T0)).rejects.toMatchObject({ code: "OWNED" });
    expect((await getAccounts().get(a, DAY, T0)).inventory.qe_pack).toBe(1);
    const { getStaffStore } = await import("../../staff");
    await getStaffStore().grant(getAccounts(), a, [{ itemId: "q_hand_net", slot: "hand" }], PERMANENT_UNTIL);
    await expect(exchangeQuest(a, "q_hand_net", T0)).rejects.toMatchObject({ code: "OWNED" });
    expect((await questBoard(a, T0)).stamps).toBe(180);
  });

  it("수집가 유령 외형: 외형 해금 + 칭호 「수집왕」, 받은 뒤 외형을 바꿀 수 있다", async () => {
    const a = await newAcct();
    await stamps(a, 200);
    await exchangeQuest(a, "q_body_collector", T0);
    const body = QUEST_BODIES[0].id;
    expect((await getStyleStore(getAccounts()).get(a)).bodies).toContain(body);
    expect((await getTitleStats().get(a)).qking).toBe(1);
    expect((await questBoard(a, T0)).stamps).toBe(0);
    const { reshape } = await import("../../dye/service");
    await expect(reshape(a, body, T0)).resolves.toBeTruthy();
    const b = await newAcct();
    await expect(reshape(b, body, T0)).rejects.toMatchObject({ status: 403 });
  });

  it("교환소 표: 기획 값·한 번짜리·염색권", () => {
    expect(QUEST_REWARDS.map((r) => [r.id, r.price])).toEqual([
      ["qe_pack", 20],
      ["q_dye_pick", 25],
      ["q_hat_angler", 25],
      ["q_hand_net", 25],
      ["q_hat_miner", 25],
      ["q_hand_brush", 25],
      ["q_name_wave", 30],
      ["q_name_leaf", 30],
      ["q_aura_firefly", 45],
      ["q_dye_special", 60],
      ["q_pet_goldfish", 80],
      ["q_aura_nightfish", 100],
      ["q_back_cape", 120],
      ["q_ride_carp", 150],
      ["q_body_collector", 200],
    ]);
    expect(QUEST_REWARDS.filter((r) => r.tier === "legend").map((r) => r.id)).toEqual(["q_body_collector"]);
    expect(questRewardById("nope")).toBeUndefined();
  });

  it("교환소 id가 모두 아이템 표에 있고(같은 지급 방식·부위), 상점·영구 구매·사육사에서는 살 수 없다", () => {
    const kindOf = { flag: "own", ticket: "count", cosmetic: "permanent", body: "body" } as const;
    for (const r of QUEST_REWARDS) {
      const it = itemById(r.id);
      expect(it, r.id).toBeDefined();
      expect(questGrantKind(r.id), r.id).toBe(kindOf[r.kind]);
      if (r.kind === "cosmetic") expect(it!.slot, r.id).toBe(r.slot);
      expect(isShopListed(it!), r.id).toBe(false);
      expect(permanentPrice(r.id), r.id).toBeNull();
    }
    // 아이템 표의 의뢰 보상은 모두 교환소에 있다
    expect(ITEMS.filter((i) => (i as { quest?: true }).quest).map((i) => i.id).sort()).toEqual(QUEST_REWARDS.map((r) => r.id).sort());
  });
});

describe("의뢰 칭호", () => {
  it("끝낸 수 50·300·1000·2500 (동·은·금·전설), 수집왕(금)", () => {
    expect(QUEST_TITLE_STEPS).toEqual([50, 300, 1000, 2500]);
    const ids = ["t_quest50", "t_quest300", "t_quest1k", "t_quest2500"];
    expect(ids.map((id) => titleDef(id)?.grade)).toEqual(["bronze", "silver", "gold", "legend"]);
    expect(ids.map((id) => titleDef(id)?.need)).toEqual([...QUEST_TITLE_STEPS]);
    expect(titleDef("t_quest50")?.name).toBe("단골 납품업자");
    expect(titleDef("t_qking")).toMatchObject({ name: "수집왕", grade: "gold" });
    const at = (quests: number, qking = 0) => earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { quests, qking } }).filter((id) => id.startsWith("t_q"));
    expect(at(49)).toEqual([]);
    expect(at(50)).toEqual(["t_quest50"]);
    expect(at(999)).toEqual(["t_quest50", "t_quest300"]);
    expect(at(2500, 1)).toEqual([...ids, "t_qking"]);
  });

  it("갈래마다 하루 의뢰가 나온다 (모든 갈래)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) for (const q of dailyQuests(`c-${i}`, addDays(DAY, i), null) as Quest[]) seen.add(q.cat);
    expect([...seen].sort()).toEqual([...LIFE_CATS].sort());
  });
});
