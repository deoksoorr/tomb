import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as session from "@/app/api/session/route";
import { SEASONS, TIME_PHASES, WEATHERS } from "../ambience";
import {
  CAMP_GATHER_NODES,
  CAMP_WHERES,
  DEX_EXPANSION_IDS,
  DEX_TITLES,
  dexBadgeBits,
  dexMapOf,
  GATHER_NODES,
  isAwaySpecies,
  isCampSpecies,
  isSeasideSpecies,
  LIFE_CATS,
  NODE_CAT,
  nodeWheres,
  npcById,
  npcBuys,
  npcsOn,
  SEA_WHERES,
  SPECIES,
  speciesById,
  speciesOf,
  WATER_WHERES,
  WHERE_LABEL,
} from "./catalog";
import { autoCandidates } from "./auto";
import { reachedTitleKeys, titlesOf } from "./dexReward";
import { BOX_FISH } from "./quests/urgent";
import { candidates, type Cond } from "./rules";
import { dexBadgeOf, forageState } from "./service";
import { SEA_LAND_NODES } from "./seaNodes";
import { getForageStore } from "./store";

// 11/26 도감 확장 (바닷가 48 · 캠핑장 36): 새 곳(Where)·새 지점·직접 낚시 전용 바닷물고기·한 번 붙으면 남는 100% 배지. 로컬 메모리 저장소

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

async function newAccount(): Promise<string> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  return ((await res.json()) as { visitorId: string }).visitorId;
}

const ALL: Cond[] = TIME_PHASES.flatMap((phase) => WEATHERS.flatMap((weather) => SEASONS.map((season) => ({ phase, weather, season }))));
const NEW = SPECIES.filter((s) => DEX_EXPANSION_IDS.includes(s.id));
const NEW_WHERES = ["dune", "searock", "tidepool", "beach", "campbank"] as const;

describe("새 종 84 · 새 곳 5", () => {
  it("바닷가 48 · 캠핑장 36, 칸별 숫자는 초안대로", () => {
    expect(NEW).toHaveLength(84);
    const sea = NEW.filter(isSeasideSpecies);
    const camp = NEW.filter(isCampSpecies);
    expect([sea.length, camp.length]).toEqual([48, 36]);
    const by = (list: typeof NEW) => LIFE_CATS.map((c) => list.filter((s) => s.cat === c).length);
    expect(by(sea)).toEqual([10, 12, 12, 10, 4]);
    expect(by(camp)).toEqual([0, 9, 9, 8, 10]);
    for (const s of sea) expect(dexMapOf(s), s.id).toBe("sea");
    for (const s of camp) expect(dexMapOf(s), s.id).toBe("camp");
  });

  it("새 곳은 이름이 있고 맵 전용 곳에 든다 (바닷가 넷 · 캠핑장 계곡 물가)", () => {
    for (const w of NEW_WHERES) expect(WHERE_LABEL[w], w).toBeTruthy();
    expect(SEA_WHERES).toEqual(expect.arrayContaining(["sea", "flat", "dune", "searock", "tidepool", "beach"]));
    expect(CAMP_WHERES).toContain("campbank");
    expect(SEA_WHERES.some((w) => CAMP_WHERES.includes(w))).toBe(false);
    // 마을 종은 그대로 마을 (새 곳을 쓰지 않는다)
    for (const s of SPECIES.filter((x) => !isAwaySpecies(x))) expect(s.where.some((w) => (NEW_WHERES as readonly string[]).includes(w)), s.id).toBe(false);
  });

  it("수집 의뢰·긴급 의뢰 상자에는 새 종이 안 나온다", () => {
    for (const s of NEW) expect(isAwaySpecies(s), s.id).toBe(true);
    expect(BOX_FISH.some((s) => DEX_EXPANSION_IDS.includes(s.id))).toBe(false);
  });

  it("새 종마다 그 곳을 뽑는 지점(또는 바다 낚시)이 있다", () => {
    const pulls = new Set(GATHER_NODES.flatMap((n) => nodeWheres(n).map((w) => `${NODE_CAT[n.kind]}:${w}`)));
    for (const s of NEW) {
      if (s.cat === "fish") expect(s.where, s.id).toEqual(["sea"]);
      else expect(s.where.some((w) => pulls.has(`${s.cat}:${w}`)), s.id).toBe(true);
    }
  });

  it("상인: 해녀 할망·낚시터 사장님이 새 종을 다 사고, 마을 상인도 칸대로 산다", () => {
    const [haenyeo] = npcsOn("sea");
    const [trader] = npcsOn("camp");
    for (const s of NEW) {
      expect(npcBuys(haenyeo, s), s.id).toBe(true);
      expect(npcBuys(trader, s), s.id).toBe(true);
      expect(npcBuys(npcById(s.cat === "fish" ? "fishmonger" : "collector")!, s), s.id).toBe(true);
      expect(s.price, s.id).toBeGreaterThan(0);
    }
  });
});

describe("새 바닷물고기 ★3 이상은 직접 낚시만", () => {
  it("감성돔·농어·돌돔·달빛 은갈치는 직접 낚시 후보엔 들고 자동 낚시 후보엔 없다, ★1·★2는 자동에도", () => {
    const fish = NEW.filter((s) => s.cat === "fish");
    expect(fish.filter((s) => s.directOnly).map((s) => s.name)).toEqual(["감성돔", "농어", "돌돔", "달빛 은갈치"]);
    for (const s of fish) {
      const conds = ALL.filter((c) => candidates("fish", WATER_WHERES.sea, c).includes(s));
      expect(conds.length, s.id).toBeGreaterThan(0);
      expect(conds.some((c) => autoCandidates("sea", c).includes(s)), s.id).toBe(!s.directOnly);
    }
    // 예전 바닷물고기 10종은 그대로 자동 낚시에도
    for (const s of speciesOf("fish").filter((x) => x.where.includes("sea") && !DEX_EXPANSION_IDS.includes(x.id))) expect(s.directOnly, s.id).toBeUndefined();
  });
});

describe("새 지점", () => {
  it("바닷가 새 16곳은 바닷가 곳만, 예전 21곳은 also로 바닷가 곳을 더한다 (id 그대로)", () => {
    const fresh = SEA_LAND_NODES.filter((n) => n.kind !== "clam" && !n.also);
    expect(fresh).toHaveLength(16);
    for (const n of fresh) expect(SEA_WHERES.includes(n.where), n.id).toBe(true);
    const old = SEA_LAND_NODES.filter((n) => n.also);
    expect(old.map((n) => n.id)).toEqual(expect.arrayContaining(["sb416_150", "sh900_212", "sd714_392", "so250_494"]));
    for (const n of old) expect(SEA_WHERES.includes(n.also!), n.id).toBe(true);
    expect(fresh.map((n) => n.where).sort()).toEqual(["beach", "beach", "beach", "beach", "dune", "dune", "dune", "searock", "searock", "searock", "searock", "searock", "tidepool", "tidepool", "tidepool", "tidepool"]);
  });

  it("어떤 조건에서도 새 지점마다 나올 것이 있다 (지금은 비어 있어요가 안 뜬다)", () => {
    const fresh = [...SEA_LAND_NODES.filter((n) => n.kind !== "clam" && !n.also), ...CAMP_GATHER_NODES.filter((n) => n.also === "campbank" || /^qo(604_420|720_470)$/.test(n.id))];
    expect(fresh).toHaveLength(26);
    for (const n of fresh) for (const c of ALL) expect(candidates(NODE_CAT[n.kind], nodeWheres(n), c).length, `${n.id} ${JSON.stringify(c)}`).toBeGreaterThan(0);
  });

  it("캠핑장 계곡 둑: 호숫가 마을 종 + 계곡 물가 전용 종이 섞여 나온다", () => {
    const bank = CAMP_GATHER_NODES.filter((n) => n.also === "campbank");
    expect(bank.map((n) => n.id).sort()).toEqual(["qb600_500", "qb716_560", "qd590_740", "qd608_554", "qd690_746", "qd700_700", "qh610_590", "qh714_624"]);
    const summerDay: Cond = { phase: "day", weather: "clear", season: "summer" };
    for (const n of bank) {
      const list = candidates(NODE_CAT[n.kind], nodeWheres(n), summerDay);
      expect(list.some(isCampSpecies), n.id).toBe(true);
      expect(list.some((s) => !isCampSpecies(s)), n.id).toBe(true);
    }
  });
});

describe("100% 배지는 칭호처럼 한 번 붙으면 남는다", () => {
  const bugsFull = DEX_TITLES.bug[100]!;
  const preBugs = speciesOf("bug").filter((s) => !DEX_EXPANSION_IDS.includes(s.id) && !isCampSpecies(s));

  it("「전부」 칭호가 있으면 종이 늘어 덜 채웠어도 비트가 켜진다", () => {
    const dex = Object.fromEntries(preBugs.map((s) => [s.id, { n: 1 }]));
    expect(dexBadgeBits(dex) & 2).toBe(0);
    expect(dexBadgeBits(dex, [bugsFull]) & 2).toBe(2);
    // 다른 칸 칭호로는 안 켜진다
    expect(dexBadgeBits(dex, [DEX_TITLES.fish[100]!]) & 2).toBe(0);
    // 다 채우면 칭호 없이도
    expect(dexBadgeBits(Object.fromEntries(speciesOf("bug").map((s) => [s.id, { n: 1 }]))) & 2).toBe(2);
  });

  it("붙은 표시(t:bug:100)가 있는 계정은 입장 배지가 남는다", async () => {
    const a = await newAccount();
    const store = getForageStore();
    await store.grant(a, "20261120", "gather", preBugs.map((s) => ({ id: s.id, size: 0 })), 99);
    expect((await dexBadgeOf(a)) & 2).toBe(0);
    await store.markDexTitles(a, ["bug:100"], "20261120");
    expect((await dexBadgeOf(a)) & 2).toBe(2);
    expect((await forageState(a)).titles).toContain(bugsFull);
  });

  it("예전 단계 보상(claims bug:100)을 받은 계정도 남는다", async () => {
    const a = await newAccount();
    expect(await getForageStore().claimDex(a, "bug:100", "20261101")).toBe(true);
    expect((await dexBadgeOf(a)) & 2).toBe(2);
  });

  it("표시가 생기기 전(11/14까지) 확장 전 곤충을 다 채운 사람은 처음 읽을 때 칭호·배지가 붙는다 — 그 뒤 채운 것으로는 안 붙는다", async () => {
    const old = await newAccount();
    const store = getForageStore();
    await store.grant(old, "20261110", "gather", preBugs.map((s) => ({ id: s.id, size: 0 })), 99);
    expect(reachedTitleKeys((await store.dex(old)).dex)).toContain("bug:100");
    expect((await dexBadgeOf(old)) & 2).toBe(2);
    await forageState(old);
    expect((await store.dex(old)).pay.marks).toContain("bug:100");

    const late = await newAccount();
    await store.grant(late, "20261127", "gather", preBugs.map((s) => ({ id: s.id, size: 0 })), 99);
    expect(reachedTitleKeys((await store.dex(late)).dex)).not.toContain("bug:100");
    expect((await dexBadgeOf(late)) & 2).toBe(0);
    expect((await forageState(late)).titles).not.toContain(bugsFull);
    // 절반 칭호는 지금 기준으로 닿는다 (36/57 ≥ 29)
    expect((await forageState(late)).titles).toContain(DEX_TITLES.bug[50]);
  });

  it("titlesOf: 표시 · 예전 단계 보상 · 지금 도감 어느 것으로도 「전부」 칭호가 붙는다", () => {
    expect(titlesOf({}, {}, ["bug:100"])).toContain(bugsFull);
    expect(titlesOf({}, { "bug:100": "20261101" }, [])).toContain(bugsFull);
    expect(titlesOf({}, {}, [])).not.toContain(bugsFull);
    expect(speciesById("b_seaslater")?.cat).toBe("bug");
  });
});
