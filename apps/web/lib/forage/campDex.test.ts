import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BOAT_FISHING_SPOTS, CAMP_TRADER, type FishWater } from "@tomb/protocol";
import * as session from "@/app/api/session/route";
import { SEASONS, TIME_PHASES, WEATHERS } from "../ambience";
import { CHAMP_FISH_SELL } from "../champPerks";
import { kstDay } from "../store/accounts";
import {
  CAMP_GATHER_NODES,
  CAMP_SPECIES_IDS,
  CAMP_WHERES,
  DEX_EXPANSION_IDS,
  DEX_MAP_REWARD,
  DEX_MAPS,
  dexMapClaimKey,
  dexMapIds,
  dexMapOf,
  GATHER_NODES,
  gradedPrice,
  isAwaySpecies,
  isCampSpecies,
  LIFE_CATS,
  nearestSeller,
  nodeWheres,
  npcBuys,
  npcBuysAll,
  npcById,
  npcsOn,
  NPCS,
  SPECIES,
  speciesById,
  WATER_LABEL,
  WATER_WHERES,
  WHERE_LABEL,
  type Species,
} from "./catalog";
import { autoCandidates, pickAuto, rollAutoCatch } from "./auto";
import { payMapBadges } from "./dexReward";
import { recordKingCatch, resetKingFishForTest } from "./kingFish";
import { dailyQuests } from "./quests/gen";
import { BOX_FISH } from "./quests/urgent";
import { candidates, fits, type Cond } from "./rules";
import { SellSchema } from "./schemas";
import { forageState, sellSourceOf, sellTo } from "./service";
import { getForageStore } from "./store";
import { sunkenFallbackFish } from "./sunken";

// 11/26 캠핑장 개편 도감 36종 · 캠핑장 물 · 낚시터 사장님 · 맵별 도감 완성 배지. 로컬 메모리 저장소

vi.mock("../store/champ", async (orig) => ({ ...(await orig<typeof import("../store/champ")>()), champBoardsSafe: async () => champ.boards }));
const champ = vi.hoisted(() => ({ boards: [] as string[] }));

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  champ.boards = [];
  resetKingFishForTest();
});

async function newAccount(): Promise<string> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  return ((await res.json()) as { visitorId: string }).visitorId;
}

const ALL: Cond[] = TIME_PHASES.flatMap((phase) => WEATHERS.flatMap((weather) => SEASONS.map((season) => ({ phase, weather, season }))));
const CAMP = SPECIES.filter((s) => CAMP_SPECIES_IDS.includes(s.id));
const CAMP_WATERS: FishWater[] = ["valley", "pool", "reservoir", "rowboat"];
const winterOk = (s: Species) => !s.season || s.season.includes("winter");

describe("캠핑장 72종 (개편 36 + 11/26 도감 확장 36)", () => {
  it("물고기 20(계곡 10·소 4·낚시터 4·나룻배 2) · 곤충 15 · 약초·버섯 15 · 돌 12 · 발굴품 10, 모두 캠핑장 전용", () => {
    expect(CAMP).toHaveLength(72);
    const n = (cat: string, w?: string) => CAMP.filter((s) => s.cat === cat && (!w || s.where.includes(w as never))).length;
    expect([n("fish"), n("bug"), n("herb"), n("ore"), n("dig")]).toEqual([20, 15, 15, 12, 10]);
    expect([n("fish", "valley"), n("fish", "pool"), n("fish", "reservoir"), n("fish", "rowboat")]).toEqual([10, 4, 4, 2]);
    for (const s of CAMP) {
      expect(isCampSpecies(s), s.id).toBe(true);
      expect(isAwaySpecies(s), s.id).toBe(true);
      expect(s.where.every((w) => CAMP_WHERES.includes(w)), s.id).toBe(true);
      expect(dexMapOf(s), s.id).toBe("camp");
    }
    // 원래 종은 캠핑장 전용이 아니다 (기존 id·값 그대로)
    expect(SPECIES.filter(isCampSpecies).map((s) => s.id).sort()).toEqual([...CAMP_SPECIES_IDS].sort());
    for (const w of CAMP_WHERES) expect(WHERE_LABEL[w]).toBeTruthy();
  });

  it("80% 넘게 겨울에도 나온다 (지금 실서버는 겨울)", () => {
    const winter = CAMP.filter(winterOk).length;
    expect(winter / CAMP.length).toBeGreaterThanOrEqual(0.8);
    expect(winter).toBe(61);
    // 겨울에 정말 뽑히는 조건이 있다 (계절만 맞고 시간·날씨가 겨울에 불가능하지 않게)
    const winterConds = ALL.filter((c) => c.season === "winter");
    for (const s of CAMP.filter(winterOk)) expect(winterConds.some((c) => fits(s, s.where, c)), s.id).toBe(true);
  });

  it("희귀(★3) 이상 새 물고기는 직접 낚시 전용, 흔함·보통은 아니다", () => {
    for (const s of CAMP.filter((x) => x.cat === "fish")) expect(!!s.directOnly, s.id).toBe(s.rarity >= 3);
    // 원래 종에는 직접 낚시 전용이 없다 (11/26 도감 확장 바닷물고기 ★3 이상 넷만 — 감성돔·농어·돌돔·달빛 은갈치)
    const seaNew = SPECIES.filter((x) => !isCampSpecies(x) && DEX_EXPANSION_IDS.includes(x.id) && x.cat === "fish");
    for (const s of seaNew) expect(!!s.directOnly, s.id).toBe(s.rarity >= 3);
    expect(seaNew.filter((s) => s.directOnly).map((s) => s.id)).toEqual(["f_blackbream", "f_seabass", "f_knifejaw", "f_moonhair"]);
    for (const s of SPECIES.filter((x) => !isCampSpecies(x) && !DEX_EXPANSION_IDS.includes(x.id))) expect(s.directOnly, s.id).toBeUndefined();
  });

  it("값은 같은 등급 기존 종과 같은 줄 (물고기 ×1.3 반영 뒤 — 흔함 3~4 · 보통 8~9 · 희귀 18~21 · 아주 희귀 44~47 · 전설 104)", () => {
    const range = (cat: string, r: number) => {
      const old = SPECIES.filter((s) => !isCampSpecies(s) && s.cat === cat && s.rarity === r && !s.junk).map((s) => s.price);
      return [Math.min(...old), Math.max(...old)];
    };
    for (const s of CAMP) {
      const [lo, hi] = range(s.cat, s.rarity);
      expect(s.price, s.id).toBeGreaterThanOrEqual(lo);
      expect(s.price, s.id).toBeLessThanOrEqual(hi);
    }
  });
});

describe("캠핑장 물 — 물별 뽑기", () => {
  const day: Cond = { phase: "day", weather: "clear", season: "winter" };
  it("옛길 계곡 = 계곡 + 강, 달그늘 소 = 소 + 계곡, 윤슬 낚시터 = 낚시터 + 호수, 나룻배 = 나룻배 전용 + 낚시터 + 호수", () => {
    // 그곳에서만 사는 종이 그 물에서 나오는지 (호수·강 둘 다 사는 붕어 같은 종은 보지 않는다)
    const has = (w: FishWater, where: string) => candidates("fish", WATER_WHERES[w], day).some((s) => s.where.every((x) => x === where));
    expect([has("valley", "valley"), has("valley", "river"), has("valley", "pool"), has("valley", "lake")]).toEqual([true, true, false, false]);
    expect([has("pool", "pool"), has("pool", "valley"), has("pool", "river")]).toEqual([true, true, false]);
    expect([has("reservoir", "reservoir"), has("reservoir", "lake"), has("reservoir", "rowboat")]).toEqual([true, true, false]);
    expect([has("rowboat", "rowboat"), has("rowboat", "reservoir"), has("rowboat", "lake")]).toEqual([true, true, true]);
    // 마을 강·호수에서는 캠핑장 종이 안 나온다
    for (const c of ALL) for (const w of ["lake", "river", "sea"] as const) expect(candidates("fish", WATER_WHERES[w], c).some(isCampSpecies), `${w}`).toBe(false);
    // 나룻배는 배 위 가상 자리 boat:reservoir
    expect(BOAT_FISHING_SPOTS["boat:reservoir"]).toBe("rowboat");
    expect(WATER_LABEL.valley).toBe("옛길 계곡");
  });

  it("자동 낚시: 어떤 조건에서도 캠핑장 물마다 걸릴 게 있고, 직접 낚시 전용은 절대 안 나온다", () => {
    for (const w of CAMP_WATERS)
      for (const c of ALL) {
        const list = autoCandidates(w, c);
        expect(list.length, `${w} ${JSON.stringify(c)}`).toBeGreaterThan(0);
        expect(list.some((s) => s.directOnly), `${w} ${JSON.stringify(c)}`).toBe(false);
        // 결정적 굴림 몇 번도 같은 규칙
        for (let k = 1; k <= 20; k++) {
          const r = rollAutoCatch(7, k, w, 0, c);
          if (r) expect(speciesById(r.id)!.directOnly, r.id).toBeUndefined();
        }
        // 자동 낚시의 꾸미기 대신 물고기도 직접 낚시 전용은 빼요 (직접 낚시면 나올 수 있어요)
        const orig = list[0];
        for (const rand of [0, 0.4, 0.8, 0.999]) expect(sunkenFallbackFish(w, c, rand, orig, true).directOnly, `${w}`).toBeUndefined();
      }
    // 직접 낚시로는 나온다 (안개 낀 밤 달그늘 소의 전설)
    const fogNight: Cond = { phase: "night", weather: "fog", season: "winter" };
    expect(candidates("fish", WATER_WHERES.pool, fogNight).map((s) => s.id)).toContain("f_imugi");
    expect(autoCandidates("pool", fogNight).map((s) => s.id)).not.toContain("f_imugi");
    expect(pickAuto(autoCandidates("pool", fogNight), 0.999)?.directOnly).toBeUndefined();
  });

  it("캠핑장 채집 지점은 원래 종 + 캠핑장 숲·바위 종 (광석 지점 = 바위, 나머지 = 숲, 11/26 계곡 둑 = 계곡 물가)", () => {
    for (const n of CAMP_GATHER_NODES) {
      const bank = n.also === "campbank";
      expect(nodeWheres(n), n.id).toEqual([n.where, bank ? "campbank" : n.kind === "ore" ? "camprock" : "campwood"]);
      if (bank) expect(n.where, n.id).toBe("lakeside");
    }
    expect(CAMP_GATHER_NODES.filter((n) => n.also === "campbank")).toHaveLength(8);
    for (const n of GATHER_NODES.filter((x) => !x.map)) expect(nodeWheres(n)).toEqual([n.where]);
    const herbNode = CAMP_GATHER_NODES.find((n) => n.kind === "herb")!;
    const list = candidates("herb", nodeWheres(herbNode), day);
    expect(list.some(isCampSpecies)).toBe(true);
    expect(list.some((s) => !isCampSpecies(s))).toBe(true);
    // 마을 지점에서는 캠핑장 종이 안 나온다
    for (const n of GATHER_NODES.filter((x) => !x.map)) for (const c of ALL) expect(candidates("herb", nodeWheres(n), c).some(isCampSpecies)).toBe(false);
  });

  it("수집 의뢰·긴급 의뢰 상자엔 캠핑장 전용 종을 내지 않는다 (예전 판 그대로)", () => {
    expect(BOX_FISH.some(isCampSpecies)).toBe(false);
    for (const day of ["2026-11-26", "2026-11-27", "2026-12-24"])
      for (let i = 0; i < 20; i++) for (const q of dailyQuests(`acct-${i}`, day, null)) expect(q.sp ? isCampSpecies(speciesById(q.sp)!) : false, q.text).toBe(false);
  });
});

describe("캠핑장 낚시터 사장님 (trader)", () => {
  const T = () => npcById("trader")!;
  it("캠핑장에 서서 물고기·채집물을 다 산다 — 값은 마을과 같다", () => {
    expect(T()).toMatchObject({ name: "낚시터 사장님", map: "camp", x: CAMP_TRADER.x, y: CAMP_TRADER.y });
    expect(npcBuysAll(T())).toBe(true);
    expect(T().buys).toEqual(LIFE_CATS);
    for (const s of SPECIES) expect(npcBuys(T(), s), s.id).toBe(true);
    expect(SellSchema.safeParse({ npc: "trader", items: { f_kumgang: 1, h_enoki: 2 } }).success).toBe(true);
    // 포인트 항목: 물고기 = 낚시 판매(낚시왕 보너스 대상), 나머지 = 채집 판매
    expect(sellSourceOf("trader", speciesById("f_kumgang")!)).toBe("fish");
    expect(sellSourceOf("trader", speciesById("f_shoe")!)).toBe("fish");
    for (const id of ["h_enoki", "b_springtail", "o_skipstone", "d_coin"]) expect(sellSourceOf("trader", speciesById(id)!), id).toBe("gather");
  });

  it("팔기 길 안내: 지금 맵에서 가장 가까운 상인 (마을 = 어부 영감·수집가, 바닷가 = 해녀 할망, 캠핑장 = 낚시터 사장님)", () => {
    expect(npcsOn("camp").map((n) => n.id)).toEqual(["trader"]);
    expect(npcsOn("sea").map((n) => n.id)).toEqual(["haenyeo"]);
    expect(npcsOn("village").map((n) => n.id).sort()).toEqual(["collector", "fishmonger"]);
    expect(nearestSeller("camp", 100, 700)?.id).toBe("trader");
    expect(nearestSeller("sea", 0, 0)?.id).toBe("haenyeo");
    const fm = npcById("fishmonger")!;
    const co = npcById("collector")!;
    expect(nearestSeller("village", fm.x + 5, fm.y)?.id).toBe("fishmonger");
    expect(nearestSeller("village", co.x, co.y + 5)?.id).toBe("collector");
    expect(NPCS.filter((n) => n.map === "camp")).toHaveLength(1);
  });

  it("물고기·채집물을 한 번에 판다 · 낚시왕이면 그 주에 낚은 물고기 값 +15%", async () => {
    const a = await newAccount();
    const now = Date.now();
    const store = getForageStore();
    const day = kstDay(now);
    await store.grant(a, day, "fish", [{ id: "f_hyangeo", size: 400 }, { id: "f_hyangeo", size: 410 }, { id: "f_hyangeo", size: 690, grade: 2 }], 99);
    await store.grant(a, day, "gather", Array.from({ length: 5 }, () => ({ id: "h_enoki", size: 0 })), 99);
    const H = speciesById("f_hyangeo")!;
    const E = speciesById("h_enoki")!;
    // 낚시왕 아님: 값 그대로 (월척 2.5배)
    const plain = await sellTo(a, "trader", { f_hyangeo: 1, h_enoki: 5 }, "ip-camp", now);
    expect(plain.sold).toEqual({ f_hyangeo: 1, h_enoki: 5 });
    expect(plain.earned).toBe(H.price + 5 * E.price);
    // 낚시왕: 이번 주에 낚은 것(기록된 것)만 +15%
    champ.boards = ["fish"];
    await recordKingCatch(a, ["f_hyangeo", "f_hyangeo~2"], now);
    const king = await sellTo(a, "trader", { f_hyangeo: 1, "f_hyangeo~2": 1 }, "ip-camp", now);
    const value = H.price + gradedPrice(H, 2);
    expect(king.sold).toEqual({ f_hyangeo: 1, "f_hyangeo~2": 1 });
    expect(king.earned).toBe(value + Math.floor(value * CHAMP_FISH_SELL));
  });
});

describe("맵별 도감 완성 배지", () => {
  it("마을·바닷가·캠핑장으로 모든 종이 한 맵에 들고, 별자리·몬스터는 넣지 않는다", () => {
    const all = DEX_MAPS.flatMap((m) => [...dexMapIds(m)]);
    expect(all.sort()).toEqual(SPECIES.map((s) => s.id).sort());
    expect(dexMapIds("camp")).toHaveLength(72);
    expect(dexMapIds("sea")).toHaveLength(70);
    expect(DEX_MAP_REWARD).toEqual({ village: 200, sea: 150, camp: 150 });
    expect(all.some((id) => id.startsWith("c_"))).toBe(false);
    for (const m of DEX_MAPS) expect(DEX_MAP_REWARD[m]).toBeGreaterThan(0);
  });

  it("다 채우면 한 번만 보상 (다시 불러도·동시에 불러도 한 번), 덜 채우면 없음", async () => {
    const a = await newAccount();
    const store = getForageStore();
    const now = Date.now();
    const half = Object.fromEntries(dexMapIds("camp").slice(1).map((id) => [id, { n: 1 }]));
    expect((await payMapBadges(store, a, half, {}, undefined, now)).badges).toEqual([]);
    const full = Object.fromEntries(dexMapIds("camp").map((id) => [id, { n: 1 }]));
    const [x, y] = await Promise.all([payMapBadges(store, a, full, {}, undefined, now), payMapBadges(store, a, full, {}, undefined, now)]);
    const got = [...x.badges, ...y.badges];
    expect(got).toEqual([{ map: "camp", name: "캠핑장 도감 완성", points: DEX_MAP_REWARD.camp }]);
    expect((await payMapBadges(store, a, full, null, undefined, now)).badges).toEqual([]);
    // 받은 기록은 도감 상태의 claims에 (화면 배지)
    expect((await forageState(a, now)).claims[dexMapClaimKey("camp")]).toBeTruthy();
  });

  it("이미 다 채운 맵(바닷가 등)은 도감을 읽을 때 한 번 받는다", async () => {
    const a = await newAccount();
    const store = getForageStore();
    const now = Date.now();
    const day = kstDay(now);
    await store.grant(a, day, "gather", dexMapIds("sea").map((id) => ({ id, size: 0 })), 99);
    const s1 = await forageState(a, now);
    expect(s1.claims[dexMapClaimKey("sea")]).toBeTruthy();
    expect(s1.claims[dexMapClaimKey("camp")]).toBeUndefined();
  });
});
