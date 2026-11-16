import { nanoid } from "nanoid";
import { MAX_VALID_SPEED, RUN_SPEED, TITLE_IDS, ZOO_PETS, type TitleId } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { dayStartMs } from "@/lib/gameDay";
import { SPECIES, STACK_MAX, dexRewardOf, type Species } from "@/lib/forage/catalog";
import { dexBonusOf, ensureDexSettled, payNewDex } from "@/lib/forage/dexReward";
import { defaultPick, matches, type QuestSpec } from "@/lib/forage/quests/gen";
import { deliverQuest, questBoard, questBonus } from "@/lib/forage/quests/service";
import * as rules from "@/lib/forage/rules";
import { castLine, startGather } from "@/lib/forage/service";
import { getForageStore } from "@/lib/forage/store";
import { FURNITURE } from "@/lib/housing/catalog";
import { buyFurniture, buyPlot, getHouseStore } from "@/lib/housing/service";
import type { RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { huntPlan } from "@/lib/rpg/plan";
import { STAY_BONUS_AMOUNTS, STAY_BONUS_DAILY_MAX, stayBonusAmounts, stayBonusState, stayBonusSum } from "@/lib/stayBonus";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { PRESENCE_MIN_GAP_MS } from "@/lib/store/types";
import { discountedPrice, GRADE_SPEED, perkShort, perkText, PERK_VALUES, TITLE_PERK_GROUP, TITLES, titleDef, titlePerk, type PerkGroup } from "@/lib/titles";
import { forgetTitles, wornPerk } from "@/lib/titlesServer";
import type { StayBonusResponse } from "@/lib/types";
import * as houseBuy from "./housing/me/buy/route";
import * as stayBonus from "./me/stay-bonus/route";
import * as finish from "./rpg/run/finish/route";
import * as start from "./rpg/run/start/route";
import * as session from "./session/route";

// 11/16 칭호 능력 개편: 등급 = 세기(공통 마을 이동 속도), 칭호 갈래 = 무슨 능력. 갈래 표·값·문구와 서버가 정하는 효과를 확인한다.
// 낚시·채집 굴림은 규칙 함수(lib/forage/rules)에 칭호 확률이 실려 가는지 엿본다 (원래 함수 그대로 돌고 부른 값만 남긴다)

vi.mock("@/lib/forage/rules", async (orig) => {
  const m = await orig<typeof import("@/lib/forage/rules")>();
  return { ...m, rollFishSize10: vi.fn(m.rollFishSize10), pickGather: vi.fn(m.pickGather) };
});

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const call = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.77.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}

/** 시험이라 얻었는지 확인 없이 바로 단다 (칭호 확인은 titles.test) — 단 칭호 기억도 지운다 */
async function wear(id: string, title: TitleId | null): Promise<void> {
  await getAccounts().setTitle(id, title);
  forgetTitles(id);
}

const GROUPS: readonly PerkGroup[] = ["hunt", "tower", "fish", "forage", "stay", "look", "quest", "dex", "house", "champ", "none"];

describe("11/16 칭호 능력 갈래 표", () => {
  it("모든 칭호 id가 갈래 하나에 빠짐없이 (남는 id도 없다)", () => {
    expect(Object.keys(TITLE_PERK_GROUP).sort()).toEqual([...TITLE_IDS].sort());
    for (const id of TITLE_IDS) expect(GROUPS).toContain(TITLE_PERK_GROUP[id]);
  });

  it("칭호 무리마다 정한 갈래", () => {
    const want: [RegExp, PerkGroup][] = [
      [/^t_(lv\d+|kill\w+|hard|hell)$/, "hunt"],
      [/^t_(floor\d+|tlv\d+|enh15|sg\w+)$/, "tower"],
      [/^t_(fishn\w+|big\d+|fish(50|100))$/, "fish"],
      [/^t_(gath\w+|(herb|bug|ore|dig)(50|100))$/, "forage"],
      [/^t_(att|stay)\d+$/, "stay"],
      [/^t_look\d+$/, "look"],
      [/^t_(quest\w+|qking|urg\w+)$/, "quest"],
      [/^t_(star|mob)(50|100)$/, "dex"],
      [/^t_house\d+$/, "house"],
      [/^t_(champ\w+|pioneer|ref\d+)$/, "champ"],
    ];
    for (const id of TITLE_IDS) {
      const hit = want.find(([re]) => re.test(id));
      if (hit) expect([id, TITLE_PERK_GROUP[id]]).toEqual([id, hit[1]]);
    }
    // 신화(서버에 한 사람)는 모두 야근 빌딩 끝판 기록 → 야근 빌딩 갈래 신화 값
    const mythic = TITLES.filter((t) => t.grade === "mythic");
    expect(mythic.map((t) => t.id).sort()).toEqual(["t_first100", "t_first30", "t_first50", "t_firstEnh15", "t_firstStar100", "t_topFloor", "t_weekFloor"]);
    for (const t of mythic) expect(titlePerk(t.id)).toMatchObject({ group: "tower", towerSec: 9, speed: GRADE_SPEED.mythic });
    expect(TITLE_PERK_GROUP.t_mgr).toBe("none");
  });

  it("값: 은 < 금 < 전설, 신화 = 전설 × 1.5 (알맞게 반올림), 동·매니저는 없다", () => {
    for (const [g, v] of Object.entries(PERK_VALUES)) {
      if (g === "champ") {
        // 1위·명예는 등급과 상관없이 +2% (속도 상한)
        expect(new Set(Object.values(v))).toEqual(new Set([0.02]));
        continue;
      }
      expect(v.silver).toBeLessThan(v.gold);
      expect(v.gold).toBeLessThan(v.legend);
      expect(Math.abs(v.mythic - v.legend * 1.5)).toBeLessThanOrEqual(0.0051);
    }
    expect(PERK_VALUES).toMatchObject({
      hunt: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
      tower: { silver: 2, gold: 4, legend: 6, mythic: 9 },
      fish: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
      forage: { silver: 0.03, gold: 0.06, legend: 0.1, mythic: 0.15 },
      stay: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
      look: { silver: 0.03, gold: 0.05, legend: 0.08, mythic: 0.12 },
      quest: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
      dex: { silver: 0.05, gold: 0.1, legend: 0.15, mythic: 0.22 },
      house: { silver: 0.03, gold: 0.05, legend: 0.08, mythic: 0.12 },
    });
    // 동 칭호는 속도도 갈래 능력도 없다
    for (const t of TITLES.filter((x) => x.grade === "bronze")) expect(titlePerk(t.id)).toMatchObject({ group: "none", speed: 1 });
    expect(titlePerk("t_mgr")).toMatchObject({ group: "none", speed: 1 });
    // 칭호마다 한 갈래 능력만 (나머지 칸은 0)
    expect(titlePerk("t_fishn300")).toEqual({ group: "fish", speed: 1.02, bigFish: 0.03, discount: 0, houseDiscount: 0, huntExp: 0, towerSec: 0, rareGather: 0, stayBonus: 0, questStamp: 0, dexBonus: 0, sparkle: false });
    expect(titlePerk("t_gath2k")).toMatchObject({ speed: 1.03, rareGather: 0.06 });
    expect(titlePerk("t_att365")).toMatchObject({ speed: 1.04, stayBonus: 0.15 });
    expect(titlePerk("t_look3000")).toMatchObject({ discount: 0.08 });
    expect(titlePerk("t_qking")).toMatchObject({ questStamp: 0.1 });
    expect(titlePerk("t_urgLast")).toMatchObject({ questStamp: 0.05 });
    expect(titlePerk("t_star100")).toMatchObject({ dexBonus: 0.15 });
    expect(titlePerk("t_house900")).toMatchObject({ houseDiscount: 0.08 });
    expect(titlePerk("t_floor50")).toMatchObject({ towerSec: 4 });
    expect(titlePerk("t_lv50")).toMatchObject({ huntExp: 0.1 });
    // 1위·명예: 공통 속도 + 2%, 반짝이는 발자국
    expect(titlePerk("t_champ10")).toMatchObject({ group: "champ", speed: 1.06, sparkle: true });
    expect(titlePerk("t_champ_fish")).toMatchObject({ speed: 1.05, sparkle: true });
  });

  it("문구: 긴 줄(알림·지금 칭호) · 짧은 줄(칭호 카드)", () => {
    expect(perkText(titleDef("t_fishn1k"))).toBe("마을에서 3% 더 빨리 걸어요. 직접 낚시할 때 큰 물고기가 6% 더 잘 걸려요.");
    expect(perkShort(titleDef("t_fishn1k"))).toBe("이동 +3% · 큰 물고기 확률 +6%");
    expect(perkText(titleDef("t_floor100"))).toBe("마을에서 4% 더 빨리 걸어요. 야근 빌딩에서 층마다 제한 시간이 6초 늘어나요.");
    expect(perkShort(titleDef("t_floor100"))).toBe("이동 +4% · 야근 빌딩 층마다 6초 더");
    expect(perkText(titleDef("t_first100"))).toBe("마을에서 6% 더 빨리 걸어요. 야근 빌딩에서 층마다 제한 시간이 9초 늘어나요.");
    expect(perkText(titleDef("t_look600"))).toBe("마을에서 2% 더 빨리 걸어요. 상점 물건과 염색권을 3% 싸게 사요.");
    expect(perkText(titleDef("t_champ_points"))).toBe("마을에서 5% 더 빨리 걸어요. 걸으면 발밑에 반짝이는 별가루가 남아요. 발자국 아이템을 끼면 그 아이템이 먼저 보여요.");
    expect(perkShort(titleDef("t_champ_points"))).toBe("이동 +5% · 걸으면 별가루");
    expect(perkShort(titleDef("t_quest300"))).toBe("이동 +2% · 5% 확률로 도장 +1");
    expect(perkShort(titleDef("t_stay50"))).toBe("이동 +2% · 접속 보너스 +5%");
    expect(perkText(titleDef("t_att7"))).toBe("");
    expect(perkShort(null)).toBe("");
    // 능력이 있는 칭호는 모두 문구가 있다 (콜론 이름표 없이)
    for (const t of TITLES) if (titlePerk(t.id).speed > 1) expect(perkText(t)).not.toContain(":");
  });

  it("실시간 서버 속도 검증 여유: 가장 빠른 칭호 × 가장 빠른 타는 펫으로 달려도 달리기 × 1.5 안", () => {
    const fastestPet = Math.max(...ZOO_PETS.map((p) => p.ride?.speed ?? 1));
    const fastestTitle = Math.max(...TITLE_IDS.map((id) => titlePerk(id).speed));
    expect(fastestTitle).toBe(1.06);
    expect(RUN_SPEED * fastestPet * fastestTitle).toBeLessThan(MAX_VALID_SPEED);
    // 갈래가 바뀌어도(신화 1위·명예가 생겨도) 공통 신화 + 1위 덧붙임까지 여유
    expect(RUN_SPEED * fastestPet * (GRADE_SPEED.mythic + PERK_VALUES.champ.mythic)).toBeLessThan(MAX_VALID_SPEED);
  });
});

describe("11/16 서버가 정하는 칭호 효과", () => {
  it("단 칭호는 기억에서 (loadMe가 적어 둔다), 바꾸면 바로 새 칭호", async () => {
    const a = `perk-${nanoid(8)}`;
    await wear(a, "t_gath5k");
    expect((await wornPerk(a)).rareGather).toBe(0.1);
    await wear(a, null);
    expect((await wornPerk(a)).group).toBe("none");
  });

  it("사냥 경험치: 사냥 갈래 칭호면 판 EXP가 그만큼 더 (초월 EXP도 이 값에서)", async () => {
    const clearAll = (seed: number) => {
      const kills: Record<string, number> = {};
      const plan = huntPlan(seed, "easy");
      for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      return { game: "hunt", durationMs: 100_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
    };
    const run = async (title: TitleId | null) => {
      const v = await newVisitor();
      await wear(v.id, title);
      const s = (await (await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy" }))).json()) as RunStartResponse;
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 101_000);
      try {
        const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: clearAll(s.seed) }));
        expect(res.status).toBe(200);
        return ((await res.json()) as RunFinishResponse).reward;
      } finally {
        clock.mockRestore();
      }
    };
    const plain = await run(null);
    expect(plain.titleExp).toBeUndefined();
    const lv50 = await run("t_lv50");
    expect(lv50.titleExp).toBeGreaterThan(0);
    expect(lv50.exp).toBe(Math.round((lv50.exp - lv50.titleExp!) * 1.1));
    // 다른 갈래 칭호는 EXP 그대로
    expect((await run("t_fishn3k")).titleExp).toBeUndefined();
  });

  it("야근 빌딩: 층마다 더하는 초 (층 제한 시간은 화면이 재고 서버는 최소 시간만 본다 — HuntLobby → HuntScene)", () => {
    expect(titlePerk("t_floor10").towerSec).toBe(0);
    expect(titlePerk("t_floor20").towerSec).toBe(2);
    expect(titlePerk("t_tlv90").towerSec).toBe(4);
    expect(titlePerk("t_enh15").towerSec).toBe(6);
    expect(titlePerk("t_topFloor").towerSec).toBe(9);
  });

  it("큰 물고기: 크기를 한 번 더 굴려 큰 쪽 (확률이 없으면 예전처럼 한 번만), 낚시 갈래 칭호면 던질 때 그 확률로", async () => {
    const fish = SPECIES.find((s) => s.cat === "fish" && s.size) as Species;
    const seq = (...xs: number[]) => {
      let i = 0;
      return () => xs[i++] ?? 0.5;
    };
    // 확률 0: 난수 하나만 쓴다
    const r0 = seq(0.2, 0.9);
    expect(rules.rollFishSize10(fish, r0, 0)).toBe(rules.rollSize10(fish, 0.2));
    expect(r0()).toBe(0.9);
    // 확률에 걸리면 두 번 굴린 것 중 큰 쪽, 안 걸리면 첫 번째 그대로
    expect(rules.rollFishSize10(fish, seq(0.2, 0.01, 0.95), 0.06)).toBe(rules.rollSize10(fish, 0.95));
    expect(rules.rollFishSize10(fish, seq(0.95, 0.01, 0.2), 0.06)).toBe(rules.rollSize10(fish, 0.95));
    expect(rules.rollFishSize10(fish, seq(0.2, 0.5, 0.95), 0.06)).toBe(rules.rollSize10(fish, 0.2));
    // 서버: 던질 때 단 칭호의 확률이 실려 간다
    const spy = vi.mocked(rules.rollFishSize10);
    const cast = async (title: TitleId | null) => {
      const a = `perk-fish-${nanoid(8)}`;
      await wear(a, title);
      spy.mockClear();
      await castLine(a, "boat:lake", Date.now());
      return spy.mock.calls.at(-1)?.[2];
    };
    expect(await cast("t_fishn1k")).toBe(0.06);
    expect(await cast("t_big150")).toBe(0.1);
    expect(await cast("t_gath2k")).toBe(0);
  });

  it("희귀 채집물: 그 확률로 희귀 이상에서만 뽑는다, 채집 갈래 칭호면 캘 때 그 확률로", async () => {
    const herbs = SPECIES.filter((s) => s.cat === "herb");
    expect(herbs.some((s) => s.rarity >= rules.RARE_MIN)).toBe(true);
    expect(rules.pickGather(herbs, () => 0, undefined, 1)!.rarity).toBeGreaterThanOrEqual(rules.RARE_MIN);
    // 확률 0이면 예전 pickWeighted 그대로
    expect(rules.pickGather(herbs, () => 0.3)).toBe(rules.pickWeighted(herbs, 0.3));
    const spy = vi.mocked(rules.pickGather);
    const gather = async (title: TitleId | null) => {
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        const a = `perk-gath-${nanoid(8)}`;
        const node = rules.activeNodes(a, now, new Set()).find((n) => n.kind !== "bug");
        if (!node) continue;
        await wear(a, title);
        spy.mockClear();
        await startGather(a, node.id, now);
        return spy.mock.calls.at(-1)?.[3];
      }
      throw new Error("피어 있는 지점이 없어요");
    };
    expect(await gather("t_gath2k")).toBe(0.06);
    expect(await gather("t_ore100")).toBe(0.06);
    expect(await gather(null)).toBe(0);
  });

  it("머무르기 보상: 구간 값만 커지고 하루 상한(145P)은 그대로", async () => {
    expect(stayBonusAmounts(0)).toEqual([...STAY_BONUS_AMOUNTS]);
    expect(stayBonusAmounts(0.1)).toEqual([11, 17, 22, 28, 28, 28, 28]);
    for (const b of [0, 0.05, 0.1, 0.15, 0.22]) {
      expect(stayBonusSum(0, STAY_BONUS_AMOUNTS.length, b)).toBe(STAY_BONUS_DAILY_MAX);
      let sum = 0;
      for (let k = 0; k < STAY_BONUS_AMOUNTS.length; k++) sum += stayBonusSum(k, k + 1, b);
      expect(sum).toBe(STAY_BONUS_DAILY_MAX);
    }
    // 칭호로 상한에 먼저 닿으면 남은 구간은 받을 게 없다 (창도 닫힌다)
    expect(stayBonusState(21, 6, 0.22)).toMatchObject({ count: 0, points: 0, done: true });
    // 저장소: 한꺼번에 받아도 145P에서 자른다
    const accounts = getAccounts();
    const day = "20261116";
    const id = `perk-stay-${nanoid(8)}`;
    for (let i = 0; i < 21; i++) await accounts.presence(id, day, 1_000_000_000 + i * PRESENCE_MIN_GAP_MS);
    expect(await accounts.claimStayBonus(id, day, 0.22)).toEqual({ earned: STAY_BONUS_DAILY_MAX, count: 7 });
    // 라우트: 출석·접속 갈래 금 칭호(10%)면 첫 구간 10P → 11P
    const v = await newVisitor();
    await wear(v.id, "t_att100");
    const today = kstDay(Date.now());
    for (let i = 0; i < 3; i++) await accounts.presence(v.id, today, Date.now() - (3 - i) * PRESENCE_MIN_GAP_MS);
    const res = await stayBonus.POST(call("/api/me/stay-bonus", v, {}));
    expect(res.status).toBe(200);
    expect(((await res.json()) as StayBonusResponse).earned).toBe(11);
  });

  it("가구 할인: 집 갈래 칭호만 (되팔기 값은 원가 기준 그대로)", async () => {
    const accounts = getAccounts();
    const store = getHouseStore();
    const f = FURNITURE.find((x) => x.price >= 100 && !x.skin && !x.ext)!;
    const v = await newVisitor();
    await accounts.earn(v.id, "flower", kstDay());
    await accounts.adjustPoints(v.id, 50_000);
    await buyPlot(store, v.id, "칭호 집", "", "a");
    const pts = async () => (await accounts.get(v.id, kstDay(), Date.now())).points;
    // 서비스: 넘겨 준 할인율로 깎는다
    let before = await pts();
    await buyFurniture(store, v.id, f.id, 0.08);
    expect(before - (await pts())).toBe(discountedPrice(f.price, 0.08));
    // 라우트: 집 갈래 금 칭호(5%)
    await wear(v.id, "t_house400");
    before = await pts();
    expect((await houseBuy.POST(call("/api/housing/me/buy", v, { itemId: f.id }))).status).toBe(200);
    expect(before - (await pts())).toBe(discountedPrice(f.price, PERK_VALUES.house.gold));
    // 다른 갈래 칭호는 원가
    await wear(v.id, "t_look3000");
    before = await pts();
    expect((await houseBuy.POST(call("/api/housing/me/buy", v, { itemId: f.id }))).status).toBe(200);
    expect(before - (await pts())).toBe(f.price);
  });

  it("의뢰 도장: 수집 의뢰 갈래 칭호면 그 확률로 하나 더 (도장 상한은 그대로)", async () => {
    expect(questBonus(0.1, 0.05)).toBe(1);
    expect(questBonus(0.1, 0.1)).toBe(0);
    expect(questBonus(0, 0)).toBe(0);
    const DAY = "20261115";
    const T0 = dayStartMs(DAY) + 6 * 3_600_000;
    const fill = async (a: string, q: QuestSpec) => {
      const pool = SPECIES.filter((s) => matches(q, s.id)).sort((x, y) => x.price - y.price);
      const items = q.distinct ? pool.slice(0, q.count).map((s) => ({ id: s.id, size: 0 })) : Array.from({ length: q.count }, () => ({ id: pool[0].id, size: 0 }));
      await getForageStore().grant(a, DAY, "fish", items, STACK_MAX);
    };
    const deliver = async (title: TitleId | null, r: number) => {
      const a = `perk-quest-${nanoid(8)}`;
      await wear(a, title);
      const q = (await questBoard(a, T0)).daily[0];
      await fill(a, q);
      const pick = defaultPick(q, (await getForageStore().snapshot(a, DAY, 0)).bag)!;
      const rnd = vi.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint32Array) => {
        arr.fill(Math.floor(r * 2 ** 32));
        return arr;
      }) as typeof crypto.getRandomValues);
      try {
        return { q, res: await deliverQuest(a, q.key, pick, T0) };
      } finally {
        rnd.mockRestore();
      }
    };
    const hit = await deliver("t_quest1k", 0.01);
    expect(hit.res).toMatchObject({ earned: hit.q.stamps + 1, bonus: 1 });
    expect(hit.res.board.stamps).toBe(hit.q.stamps + 1);
    const miss = await deliver("t_quest1k", 0.5);
    expect(miss.res.earned).toBe(miss.q.stamps);
    expect(miss.res.bonus).toBeUndefined();
    expect((await deliver(null, 0)).res.bonus).toBeUndefined();
  });

  it("도감 새 칸 보상: 도감 갈래 칭호면 같은 적립에 얹고, 도감 하루 한도는 그대로 (원래 보상부터 채운다)", async () => {
    const store = getForageStore();
    const fish = SPECIES.filter((s) => s.cat === "fish" && !s.junk).sort((x, y) => dexRewardOf(y.id) - dexRewardOf(x.id))[0];
    const n = dexRewardOf(fish.id);
    expect(n).toBeGreaterThanOrEqual(20);
    expect(dexBonusOf(n, 0.15)).toBe(Math.round(n * 0.15));
    expect(dexBonusOf(3, 0.05)).toBe(1);
    const now = Date.now();
    const day = kstDay(now);
    const register = async (a: string) => {
      await ensureDexSettled(store, a, null, now);
      return (await store.grant(a, day, "fish", [{ id: fish.id, size: 0 }], STACK_MAX))!;
    };
    const a = `perk-dex-${nanoid(8)}`;
    const gain = await payNewDex(store, a, await register(a), undefined, now, async () => 0.15);
    expect(gain).toMatchObject({ points: n, earned: n + dexBonusOf(n, 0.15), pending: 0 });
    const b = `perk-dex-${nanoid(8)}`;
    expect(await payNewDex(store, b, await register(b), undefined, now)).toMatchObject({ points: n, earned: n, pending: 0 });
    // 도감 한도가 원래 보상만큼만 남았으면 덧붙임은 못 받고 (쌓이지도 않는다) 원래 보상은 다 받는다
    const c = `perk-dex-${nanoid(8)}`;
    const accounts = getAccounts();
    await accounts.earn(c, "dex", day, { amount: 300 - n });
    const capped = await payNewDex(store, c, await register(c), undefined, now, async () => 0.15);
    expect(capped).toMatchObject({ points: n, earned: n, pending: 0 });
    expect((await store.dexPay(c)).pending.fish ?? 0).toBe(0);
  });
});
