import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { anyFishingWaterOf, FISHING_SPOTS, SEA_DIG_CLOSED_MSG, seaDigOpen, SEA_FISHING_SPOTS } from "@tomb/protocol";
import { kstDay } from "../store/accounts";
import * as session from "@/app/api/session/route";
import {
  DEX_TITLES,
  dexCatOf,
  dexIdsOf,
  dexRewardOf,
  dexTitleNeed,
  DEX_NEW_REWARD,
  gatherNodeById,
  isSeasideSpecies,
  buyerOf,
  NPCS,
  npcBuys,
  npcBuysAll,
  npcById,
  SEA_GATHER_NODES,
  SPECIES,
  speciesById,
  speciesOf,
} from "./catalog";
import { titlesOf } from "./dexReward";
import { BOX_FISH } from "./quests/urgent";
import { dailyQuests } from "./quests/gen";
import { candidates, conditionsAt, nodeActive, nodeWindow, withHighTide } from "./rules";
import { castLine, finishGather, reelIn, sellSourceOf, sellTo, startGather } from "./service";
import { getAccounts } from "../store";
import { setPointEvent } from "../store/pointEvent";
import { getForageStore } from "./store";
import { GatherStartSchema, SellSchema } from "./schemas";

// 11/16 바닷가 2차: 바닷물고기(물고기 칸)·갯벌 캐기(발굴품 칸)·포구 시장 판매. 로컬 메모리 저장소, 시각은 now 인자로 흘려요.

vi.mock("./sunken", async (orig) => ({ ...(await orig<typeof import("./sunken")>()), SUNKEN_CHANCE: 0 }));

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const HIGH = Date.UTC(2026, 10, 15, 15, 0); // 11/16 0시 KST = 만조
const LOW = HIGH + 90 * MIN; // 간조 한가운데 (갯벌 구멍이 모두 열려요)
const ROCK = "f_1324_528"; // 방파제 쪽 바위 곶 (만조에 물속)
const LAKE = "f_1172_932"; // 마을 호수 잔교 끝
const SEA_FISH = speciesOf("fish").filter((s) => s.where.includes("sea"));
const FLAT = speciesOf("dig").filter((s) => s.where.includes("flat"));

/** 이 구멍이 그 창에 피어 있는 계정 (사람마다 다르게 피어요) */
function acctWith(nodeId: string, now: number): string {
  const n = gatherNodeById(nodeId)!;
  for (;;) {
    const a = `t-seaside-${nanoid(8)}`;
    if (nodeActive(a, n, nodeWindow(now))) return a;
  }
}

async function newAccount(): Promise<string> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  return ((await res.json()) as { visitorId: string }).visitorId;
}

describe("카탈로그 (바닷가)", () => {
  it("바닷물고기 10종은 물고기 칸, 갯벌 10종은 발굴품 칸 (새 도감 칸은 없다)", () => {
    expect(SEA_FISH).toHaveLength(10);
    expect(FLAT).toHaveLength(10);
    expect(dexIdsOf("fish")).toHaveLength(50);
    expect(dexIdsOf("dig")).toHaveLength(36); // 11/17 갈매기 깃털 둘
    for (const s of [...SEA_FISH, ...FLAT]) {
      expect(dexCatOf(s.id), s.id).toBe(s.cat);
      expect(dexRewardOf(s.id), s.id).toBe(DEX_NEW_REWARD[s.rarity]);
      expect(isSeasideSpecies(s), s.id).toBe(true);
      expect(s.where, s.id).toHaveLength(1);
    }
    // 희귀도 고루: 흔함 2~3 · 보통 3 · 희귀 2~3 · 아주 희귀 1 · 전설 1
    for (const list of [SEA_FISH, FLAT]) {
      const by = (r: number) => list.filter((s) => s.rarity === r).length;
      expect([by(4), by(5)]).toEqual([1, 1]);
      expect(by(1) + by(2) + by(3)).toBe(8);
    }
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });

  it("칭호 기준은 늘어난 칸 수로 (물고기 25·50종, 발굴품 18·36종 — 11/17 갈매기 깃털 둘)", () => {
    expect([dexTitleNeed("fish", 50), dexTitleNeed("fish", 100)]).toEqual([25, 50]);
    expect([dexTitleNeed("dig", 50), dexTitleNeed("dig", 100)]).toEqual([18, 36]);
  });

  it("이미 붙은 칭호(붙은 표시·예전 단계 보상)는 칸이 늘어도 그대로 남는다", () => {
    const old40 = Object.fromEntries(speciesOf("fish").filter((s) => !isSeasideSpecies(s)).map((s) => [s.id, { n: 1 }]));
    // 예전 40종을 다 채운 사람: 붙은 표시가 있으면 「호수의 전설」 유지
    expect(titlesOf(old40, {}, ["fish:50", "fish:100"])).toEqual(expect.arrayContaining([DEX_TITLES.fish[50], DEX_TITLES.fish[100]]));
    // 예전 단계 보상으로 받은 칭호도 유지
    expect(titlesOf({}, { "dig:100": "2026-11-01" }, [])).toContain(DEX_TITLES.dig[100]);
    // 표시가 없으면 지금 기준 (40/50 → 절반만)
    const now = titlesOf(old40, {}, []);
    expect(now).toContain(DEX_TITLES.fish[50]);
    expect(now).not.toContain(DEX_TITLES.fish[100]);
  });

  it("수집 의뢰·긴급 의뢰 상자엔 바닷가 것을 내지 않는다 (예전 의뢰 그대로)", () => {
    expect(BOX_FISH.some(isSeasideSpecies)).toBe(false);
    for (const day of ["2026-11-16", "2026-11-17", "2026-12-24"])
      for (let i = 0; i < 20; i++) for (const q of dailyQuests(`acct-${i}`, day, null)) expect(q.sp ? isSeasideSpecies(speciesById(q.sp)!) : false, q.text).toBe(false);
  });

  it("갯벌 구멍 12곳은 바닷가 지점 (입력 검증을 통과)", () => {
    expect(SEA_GATHER_NODES).toHaveLength(12);
    for (const n of SEA_GATHER_NODES) {
      expect([n.kind, n.where, n.map]).toEqual(["clam", "flat", "sea"]);
      expect(GatherStartSchema.safeParse({ node: n.id }).success).toBe(true);
    }
  });
});

describe("바다 낚시", () => {
  it("바닷가 자리는 바다, 마을 자리는 그대로 호수·강", () => {
    for (const s of SEA_FISHING_SPOTS) expect(anyFishingWaterOf(s.id)).toBe("sea");
    for (const s of FISHING_SPOTS) expect(anyFishingWaterOf(s.id)).not.toBe("sea");
    const c = conditionsAt(LOW);
    expect(candidates("fish", "sea", c).every((s) => s.where.includes("sea"))).toBe(true);
    expect(candidates("fish", "lake", c).some(isSeasideSpecies)).toBe(false);
  });

  it("갯바위에서 낚으면 바닷물고기, 호수에선 호수 물고기", async () => {
    for (const [spot, sea] of [
      [ROCK, true],
      [LAKE, false],
    ] as const) {
      for (let i = 0; i < 3; i++) {
        const a = `t-seafish-${nanoid(8)}`;
        const t0 = HIGH + 5 * MIN;
        const c = await castLine(a, spot, t0);
        const r = await reelIn(a, c.ticket, true, t0 + c.biteInMs + c.reelMs);
        expect(r.result, spot).not.toBeNull();
        expect(isSeasideSpecies(speciesById(r.result!.id)!), `${spot} ${r.result!.id}`).toBe(sea);
      }
    }
  });

  it("만조 앞뒤엔 큰 놈 확률을 더 얹는다 (그 밖엔 그대로)", () => {
    expect(withHighTide(0, 1)).toBeCloseTo(0.3);
    expect(withHighTide(0.2, 0.9)).toBeCloseTo(1 - 0.8 * 0.7);
    expect(withHighTide(0.2, 0.5)).toBe(0.2);
  });
});

describe("갯벌 캐기", () => {
  it("11/18 보안: 바닷가가 닫힌 서버(운영, SEA_ENABLED 없음)에서는 바닷가 지점을 API로도 못 캐요", async () => {
    const prev = { v: process.env.VERCEL_ENV, s: process.env.SEA_ENABLED };
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SEA_ENABLED", "");
    try {
      await expect(startGather(`t-seaside-${nanoid(8)}`, SEA_GATHER_NODES[0].id, LOW)).rejects.toMatchObject({ status: 409, code: "MAP_CLOSED" });
    } finally {
      // 이 파일의 다른 환경 값(Redis 비움 등)은 그대로 두고 둘만 되돌린다
      vi.stubEnv("VERCEL_ENV", prev.v);
      vi.stubEnv("SEA_ENABLED", prev.s);
    }
  });

  it("물이 덮은 때엔 서버가 막아요 (TIDE_IN), 간조엔 게이지로 캐서 갯벌 것이 나와요", async () => {
    const hole = SEA_GATHER_NODES[0];
    await expect(startGather(`t-seaside-${nanoid(8)}`, hole.id, HIGH + 10 * MIN)).rejects.toMatchObject({ status: 409, code: "TIDE_IN", message: SEA_DIG_CLOSED_MSG });
    const a = acctWith(hole.id, LOW);
    const s = await startGather(a, hole.id, LOW);
    expect(s.mode).toBe("gauge");
    if (s.mode !== "gauge") return;
    expect(s.kind).toBe("clam");
    const f = await finishGather(a, s.ticket, undefined, LOW + s.durationMs);
    expect(f.items.length).toBeGreaterThan(0);
    for (const it of f.items) expect(speciesById(it.id)!.where, it.id).toEqual(["flat"]);
    // 같은 창에 다시 캐면 비어 있어요 (마을 지점과 같은 규칙)
    await expect(startGather(a, hole.id, LOW + 10_000)).rejects.toMatchObject({ code: "NODE_EMPTY" });
  });

  it("갯벌이 열리기 직전(59분)엔 닫혀 있고, 열린 뒤엔 화면과 같은 계산으로 열려요", async () => {
    const deep = [...SEA_GATHER_NODES].sort((a, b) => b.y - a.y)[0];
    await expect(startGather(acctWith(deep.id, HIGH + 59 * MIN), deep.id, HIGH + 59 * MIN)).rejects.toMatchObject({ code: "TIDE_IN" });
    const t = HIGH + 75 * MIN;
    const r = startGather(acctWith(deep.id, t), deep.id, t);
    if (seaDigOpen(deep, t)) await expect(r).resolves.toMatchObject({ mode: "gauge", kind: "clam" });
    else await expect(r).rejects.toMatchObject({ code: "TIDE_IN" });
  });
});

// 11/16 r11 사용자: 포구 시장을 뺐어요 → 바닷가에서 잡은 것은 마을 어부 영감·수집가 유령이 사요 (같은 판매 API·같은 하루 한도)
// 11/20 바닷가에 해녀 할망 좌판 하나 (물고기·채집물 전부, 값은 마을과 같아요)
describe("바닷가 것 판매 (마을 NPC)", () => {
  it("어부 영감은 바다 고기도, 수집가 유령은 갯벌에서 캔 것도 산다. 바닷가 NPC는 해녀 할망 하나", () => {
    expect(NPCS.filter((n) => n.map === "sea").map((n) => n.id)).toEqual(["haenyeo"]);
    expect(npcBuys(npcById("collector")!, speciesById("d_goldclam")!)).toBe(true);
    expect(npcBuys(npcById("collector")!, speciesById("d_clam")!)).toBe(true);
    expect(npcBuys(npcById("fishmonger")!, speciesById("f_yellowtail")!)).toBe(true);
    expect(npcBuys(npcById("fishmonger")!, speciesById("f_mackerel")!)).toBe(true);
    expect(SellSchema.safeParse({ npc: "harborFlat", items: { d_clam: 1 } }).success).toBe(false);
  });

  it("같은 판매 API로 한 번에 다 판다 (11/19 하루 한도 없음)", async () => {
    const a = await newAccount();
    const now = Date.now();
    const store = getForageStore();
    const day = kstDay(now);
    await store.grant(a, day, "gather", Array.from({ length: 60 }, () => ({ id: "d_goldclam", size: 0 })), 99);
    await store.grant(a, day, "fish", [{ id: "f_mackerel", size: 300 }], 99);
    await expect(sellTo(a, "collector", { f_mackerel: 1 }, "ip-sea", now)).rejects.toMatchObject({ status: 400 });
    const r = await sellTo(a, "collector", { d_goldclam: 60 }, "ip-sea", now);
    // 예전 채집 판매 한도(300P)를 넘는 값도 다 받는다
    expect(r.sold).toEqual({ d_goldclam: 60 });
    expect(r.earned).toBe(60 * speciesById("d_goldclam")!.price);
    expect(r.earned).toBeGreaterThan(300);
    expect(r.capped).toBe(false);
    expect(r.state.bag.d_goldclam ?? 0).toBe(0);
    const f = await sellTo(a, "fishmonger", { f_mackerel: 1 }, "ip-sea", now);
    expect(f.sold).toEqual({ f_mackerel: 1 });
    expect(f.earned).toBe(speciesById("f_mackerel")!.price);
  });
});

describe("11/20 해녀 할망 (바닷가 좌판 — 물고기·채집물 전부)", () => {
  const H = () => npcById("haenyeo")!;
  it("모든 물고기·채집물을 산다 (호수·강·바다 물고기, 곤충·약초·광석·발굴품, 갯벌 조개·게·모래 파기·갈매기 깃털) — 값은 그대로", () => {
    expect(npcBuysAll(H())).toBe(true);
    expect(npcBuysAll(npcById("fishmonger")!)).toBe(false);
    expect(npcBuysAll(npcById("collector")!)).toBe(false);
    expect(H().where).toBeUndefined();
    for (const s of SPECIES) expect(npcBuys(H(), s), s.id).toBe(true);
    for (const id of ["f_crucian", "f_minnow", "f_mackerel", "b_cabbage", "d_clam", "d_goldclam", "d_gullfeather"]) expect(npcBuys(H(), speciesById(id)!), id).toBe(true);
    // 가방·도감에 적는 상인 이름은 마을 상인 그대로
    expect(buyerOf("fish").id).toBe("fishmonger");
    for (const c of ["bug", "herb", "ore", "dig"] as const) expect(buyerOf(c).id).toBe("collector");
    expect(SellSchema.safeParse({ npc: "haenyeo", items: { d_clam: 1, f_mackerel: 2 } }).success).toBe(true);
    // 포인트 항목: 물고기 = 낚시 판매, 나머지 = 채집 판매 (마을 상인은 상인마다 하나)
    expect(sellSourceOf("haenyeo", speciesById("f_mackerel")!)).toBe("fish");
    expect(sellSourceOf("haenyeo", speciesById("f_shoe")!)).toBe("fish");
    for (const id of ["d_clam", "b_cabbage", "d_gullfeather"]) expect(sellSourceOf("haenyeo", speciesById(id)!), id).toBe("gather");
    expect(sellSourceOf("collector", speciesById("d_clam")!)).toBe("gather");
    expect(sellSourceOf("fishmonger", speciesById("f_mackerel")!)).toBe("fish");
  });

  it("물고기와 채집물을 한 번에 팔면 각각 낚시 판매·채집 판매로 쌓여요 (포인트 배수 이벤트는 고른 항목만)", async () => {
    const a = await newAccount();
    const now = Date.now();
    const store = getForageStore();
    const day = kstDay(now);
    await store.grant(a, day, "gather", Array.from({ length: 6 }, () => ({ id: "d_clam", size: 0 })), 99);
    await store.grant(a, day, "fish", [{ id: "f_redbream", size: 300 }, { id: "f_redbream", size: 310 }, { id: "f_mackerel", size: 200 }], 99);
    const fish = 2 * speciesById("f_redbream")!.price + speciesById("f_mackerel")!.price;
    const clam = 6 * speciesById("d_clam")!.price;
    await setPointEvent({ startAt: now - 1000, endAt: null, sources: ["fish"], mult: 2 }, now);
    try {
      const before = (await getAccounts().get(a, day, now)).points;
      const r = await sellTo(a, "haenyeo", { f_redbream: 2, f_mackerel: 1, d_clam: 6 }, "ip-sea", now);
      expect(r.sold).toEqual({ f_redbream: 2, f_mackerel: 1, d_clam: 6 });
      expect(r.earned).toBe(fish * 2 + clam);
      expect(r.capped).toBe(false);
      expect(r.me.points - before).toBe(fish * 2 + clam);
      expect(r.state.bag.d_clam ?? 0).toBe(0);
      expect(r.state.bag.f_redbream ?? 0).toBe(0);
    } finally {
      await setPointEvent(null, now);
    }
    // 이벤트가 꺼지면 마을 상인과 같은 값
    await store.grant(a, day, "gather", [{ id: "d_clam", size: 0 }], 99);
    await store.grant(a, day, "fish", [{ id: "f_mackerel", size: 200 }], 99);
    const r2 = await sellTo(a, "haenyeo", { f_mackerel: 1, d_clam: 1 }, "ip-sea", now + 1);
    expect(r2.earned).toBe(speciesById("f_mackerel")!.price + speciesById("d_clam")!.price);
  });
});
