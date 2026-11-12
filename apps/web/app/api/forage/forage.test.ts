import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { earnRule } from "@/lib/economy";
import { GATHER_NODES, gatherNodeById, speciesById, speciesOf } from "@/lib/forage/catalog";
import { BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS, reelMinMs } from "@/lib/forage/rules";
import { getForageStore } from "@/lib/forage/store";
import { signForageTicket } from "@/lib/forage/ticket";
import type {
  CastResponse,
  DexClaimResponse,
  GatherFinishResponse,
  GatherStartResponse,
  ForageState,
  PublicDex,
  ReelResponse,
  SellResponse,
} from "@/lib/forage/types";
import { bugsCount, bugsPlan } from "@/lib/rpg/plan";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import * as session from "../session/route";
import * as dexClaim from "./dex/claim/route";
import * as dexOf from "./dex/[id]/route";
import * as cast from "./fish/cast/route";
import * as reel from "./fish/reel/route";
import * as gFinish from "./gather/finish/route";
import * as gStart from "./gather/start/route";
import * as forage from "./route";
import * as sell from "./sell/route";

// 로컬 구성(MemoryStore·MemoryForageStore)으로 낚시·채집·판매·도감 라우트를 직접 부른다. 시간은 Date.now를 바꿔 흐르게 한다.

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown) {
  const headers: Record<string, string> = {};
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.8.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const body = async <T>(res: Response) => (await res.json()) as T;

/** 지금부터 ms 뒤로 시계를 옮긴다 (처음 부른 시각 기준으로 쌓이지 않게 진짜 시계에서) */
const realNow = Date.now.bind(Date);
const later = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(realNow() + ms);

const PIER = "f_1172_932"; // 호수 낚시 잔교 끝

async function state(v: Visitor) {
  const res = await forage.GET(call("/api/forage", v));
  expect(res.status).toBe(200);
  return body<ForageState>(res);
}

describe("낚시", () => {
  it("세션이 없으면 401, 모르는 자리는 400", async () => {
    expect((await forage.GET(call("/api/forage"))).status).toBe(401);
    const v = await newVisitor();
    expect((await cast.POST(call("/x", v, { spot: "f_1_1" }))).status).toBe(400);
  });

  it("던지기 → 입질 → 감기: 가방·도감에 들어가고, 같은 티켓은 다시 못 낸다", async () => {
    const v = await newVisitor();
    const res = await cast.POST(call("/x", v, { spot: PIER }));
    expect(res.status).toBe(200);
    const c = await body<CastResponse>(res);
    expect(c.biteInMs).toBeGreaterThanOrEqual(2_800);
    expect(c.power).toBeGreaterThanOrEqual(1);
    // 티켓에는 무엇이 걸렸는지 없다
    const claims = JSON.parse(Buffer.from(c.ticket.split(".")[0], "base64url").toString());
    expect(Object.keys(claims).sort()).toEqual(["a", "b", "k", "n", "p", "t", "x"]);
    later(c.biteInMs + reelMinMs(c.power) + 50);
    const r = await reel.POST(call("/x", v, { ticket: c.ticket, ok: true }));
    expect(r.status).toBe(200);
    const got = await body<ReelResponse>(r);
    expect(got.result).not.toBeNull();
    const sp = speciesById(got.result!.id)!;
    expect(sp.cat).toBe("fish");
    expect(got.result).toMatchObject({ kept: true, isNew: true });
    expect(got.state.bag[sp.id]).toBe(1);
    expect(got.state.dex[sp.id]).toMatchObject({ n: 1, first: kstDay(realNow()) });
    expect(got.state.today.fish).toBe(1);
    const again = await reel.POST(call("/x", v, { ticket: c.ticket, ok: true }));
    expect(again.status).toBe(409);
    expect(await errCode(again)).toBe("TICKET_USED");
  });

  it("배 위 낚시: boat:lake·boat:river 가상 자리로 던지면 그 물의 물고기가 잡힌다 (모르는 배 자리는 400)", async () => {
    const v = await newVisitor();
    expect((await cast.POST(call("/x", v, { spot: "boat:sea" }))).status).toBe(400);
    for (const [spot, water] of [["boat:lake", "lake"], ["boat:river", "river"]] as const) {
      vi.restoreAllMocks();
      const c = await body<CastResponse>(await cast.POST(call("/x", v, { spot })));
      later(c.biteInMs + reelMinMs(c.power) + 50);
      const got = await body<ReelResponse>(await reel.POST(call("/x", v, { ticket: c.ticket, ok: true })));
      const sp = speciesById(got.result!.id)!;
      expect(sp.cat).toBe("fish");
      expect(sp.where).toContain(water);
    }
  });

  it("입질 전·너무 빠른 감기·위조·남의 티켓·새로 던진 뒤 옛 티켓은 거절", async () => {
    const v = await newVisitor();
    const w = await newVisitor();
    const c1 = await body<CastResponse>(await cast.POST(call("/x", v, { spot: PIER })));
    // 남의 티켓
    expect((await reel.POST(call("/x", w, { ticket: c1.ticket, ok: true }))).status).toBe(403);
    // 위조 서명
    const forged = await signForageTicket("not-the-secret", { n: "x", a: v.id, k: "fish", x: PIER, t: realNow(), b: realNow(), p: 1 });
    expect(await errCode(await reel.POST(call("/x", v, { ticket: forged, ok: true })))).toBe("BAD_TICKET");
    // 입질 전에 "잡았다"
    const early = await reel.POST(call("/x", v, { ticket: c1.ticket, ok: true }));
    expect(early.status).toBe(422);
    expect(await errCode(early)).toBe("TOO_FAST");
    expect((await state(v)).bag).toEqual({});
    // 새로 던지면 이전 것은 끝난다
    const c2 = await body<CastResponse>(await cast.POST(call("/x", v, { spot: PIER })));
    await cast.POST(call("/x", v, { spot: PIER }));
    later(c2.biteInMs + reelMinMs(c2.power) + 50);
    expect(await errCode(await reel.POST(call("/x", v, { ticket: c2.ticket, ok: true })))).toBe("TICKET_STALE");
    vi.restoreAllMocks();
    // 놓침 (ok=false): 결과 없이 끝
    const c3 = await body<CastResponse>(await cast.POST(call("/x", v, { spot: "f_420_675" })));
    const miss = await body<ReelResponse>(await reel.POST(call("/x", v, { ticket: c3.ticket, ok: false })));
    expect(miss.result).toBeNull();
    // 너무 오래
    const c4 = await body<CastResponse>(await cast.POST(call("/x", v, { spot: PIER })));
    later(c4.biteInMs + 120_000);
    expect((await reel.POST(call("/x", v, { ticket: c4.ticket, ok: true }))).status).toBeGreaterThanOrEqual(409);
  });
});

describe("채집", () => {
  async function visitorWith(kind: "gauge" | "bug") {
    for (let i = 0; i < 8; i++) {
      const v = await newVisitor();
      const s = await state(v);
      const id = s.nodes.ids.find((x) => (kind === "bug" ? gatherNodeById(x)!.kind === "bug" : gatherNodeById(x)!.kind !== "bug"));
      if (id) return { v, node: id, s };
    }
    throw new Error("피어 있는 지점이 없음");
  }

  it("지금 피어 있는 지점만, 게이지가 다 차야 캐고, 캔 자리는 이번 창 동안 빈다", async () => {
    const { v, node, s } = await visitorWith("gauge");
    expect(s.nodes.refreshAt).toBeGreaterThan(realNow());
    const off = GATHER_NODES.find((n) => !s.nodes.ids.includes(n.id));
    if (off) expect(await errCode(await gStart.POST(call("/x", v, { node: off.id })))).toBe("NODE_EMPTY");
    const st = await body<GatherStartResponse>(await gStart.POST(call("/x", v, { node })));
    expect(st.mode).toBe("gauge");
    // 게이지보다 빠르다
    expect(await errCode(await gFinish.POST(call("/x", v, { ticket: st.ticket })))).toBe("TOO_FAST");
    const st2 = await body<GatherStartResponse>(await gStart.POST(call("/x", v, { node })));
    if (st2.mode !== "gauge") throw new Error("gauge");
    later(st2.durationMs + 10);
    const fin = await gFinish.POST(call("/x", v, { ticket: st2.ticket }));
    expect(fin.status).toBe(200);
    const f = await body<GatherFinishResponse>(fin);
    expect(f.items.length).toBeGreaterThanOrEqual(1);
    expect(speciesById(f.items[0].id)!.cat).toBe(st2.kind);
    expect(f.state.bag[f.items[0].id]).toBe(f.items.length);
    expect(f.state.nodes.ids).not.toContain(node);
    expect(await errCode(await gStart.POST(call("/x", v, { node })))).toBe("NODE_EMPTY");
  });

  it("곤충 수풀: 미니게임 결과를 시드로 검사해 마릿수만큼, 부풀린 결과는 빈손", async () => {
    const { v, node } = await visitorWith("bug");
    const st = await body<GatherStartResponse>(await gStart.POST(call("/x", v, { node })));
    if (st.mode !== "bugs") throw new Error("bugs");
    expect(st.timeLimitSec).toBe(BUG_ROUND_SEC);
    const all = bugsCount(bugsPlan(st.seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
    const result = { game: "bugs", durationMs: 30_000, caught: all.bug, golden: all.golden, wrong: 0, decoy: 0, maxCombo: 8, score: 300 };
    later(31_000);
    // 부풀린 결과
    const bad = await gFinish.POST(call("/x", v, { ticket: st.ticket, result: { ...result, caught: all.bug + 5 } }));
    expect(bad.status).toBe(422);
    vi.restoreAllMocks();
    const st2 = await body<GatherStartResponse>(await gStart.POST(call("/x", v, { node })));
    if (st2.mode !== "bugs") throw new Error("bugs");
    const all2 = bugsCount(bugsPlan(st2.seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
    later(31_000);
    const f = await body<GatherFinishResponse>(await gFinish.POST(call("/x", v, { ticket: st2.ticket, result: { ...result, caught: all2.bug, golden: all2.golden } })));
    expect(f.items.length).toBeGreaterThanOrEqual(1);
    for (const it of f.items) expect(speciesById(it.id)!.cat).toBe("bug");
  });
});

describe("NPC 판매", () => {
  it("물고기는 어부만, 값만큼 포인트, 가방에서 빠진다", async () => {
    const v = await newVisitor();
    const day = kstDay(realNow());
    await getForageStore().grant(v.id, day, "fish", [{ id: "f_carp", size: 400 }, { id: "f_carp", size: 410 }, { id: "f_koi", size: 500 }], 99);
    await getForageStore().grant(v.id, day, "gather", [{ id: "h_mugwort", size: 0 }], 99);
    expect((await sell.POST(call("/x", v, { npc: "collector", items: { f_carp: 1 } }))).status).toBe(400);
    expect((await sell.POST(call("/x", v, { npc: "fishmonger", items: { h_mugwort: 1 } }))).status).toBe(400);
    const res = await sell.POST(call("/x", v, { npc: "fishmonger", items: { f_carp: 2, f_koi: 5 } }));
    expect(res.status).toBe(200);
    const s = await body<SellResponse>(res);
    const value = speciesById("f_carp")!.price * 2 + speciesById("f_koi")!.price;
    expect(s).toMatchObject({ sold: { f_carp: 2, f_koi: 1 }, earned: value, capped: false });
    expect(s.state.bag).toEqual({ h_mugwort: 1 });
    expect(s.state.today.fishP).toBe(value);
    expect(s.me.points).toBe(value);
    expect(await errCode(await sell.POST(call("/x", v, { npc: "fishmonger", items: { f_carp: 1 } })))).toBe("NOTHING_TO_SELL");
  });

  it("오늘 한도까지만 팔고(비싼 것부터), 나머지는 가방에 남는다. 그 사이 한도가 줄면 못 받은 만큼 되돌린다", async () => {
    const v = await newVisitor();
    const day = kstDay(realNow());
    const cap = earnRule("fish").dailyMax;
    const store = getForageStore();
    await store.grant(v.id, day, "fish", [{ id: "f_koi", size: 500 }, { id: "f_carp", size: 1 }, { id: "f_carp", size: 1 }], 99);
    // 낚시 판매 기록상 한도까지 10P 남음 → 금잉어(32)는 못 팔고 잉어(6) 1마리만
    await store.addDay(v.id, day, "fishP", cap - 10);
    const s1 = await body<SellResponse>(await sell.POST(call("/x", v, { npc: "fishmonger", items: { f_koi: 1, f_carp: 2 } })));
    expect(s1).toMatchObject({ sold: { f_carp: 1 }, earned: 6, capped: true });
    expect(s1.state.bag).toEqual({ f_koi: 1, f_carp: 1 });

    // 계정 쪽 적립 한도가 먼저 찼다 (다른 탭에서 판 경우 등): 판매 기록은 비어 있지만 earnPoints가 덜 준다 → 못 받은 만큼 되돌림
    const w = await newVisitor();
    await store.grant(w.id, day, "fish", [{ id: "f_carp", size: 1 }, { id: "f_carp", size: 1 }, { id: "f_carp", size: 1 }], 99);
    await getAccounts().earn(w.id, "fish", day, { amount: cap - 7 });
    const s2 = await body<SellResponse>(await sell.POST(call("/x", w, { npc: "fishmonger", items: { f_carp: 3 } })));
    expect(s2.earned).toBe(7);
    expect(s2.sold).toEqual({ f_carp: 1 });
    expect(s2.capped).toBe(true);
    expect(s2.state.bag).toEqual({ f_carp: 2 });
  });
});

describe("도감", () => {
  it("25%를 채우면 보상 한 번, 50%는 칭호도. 다른 사람 도감을 볼 수 있다", async () => {
    const v = await newVisitor();
    const day = kstDay(realNow());
    const fish = speciesOf("fish");
    const need = (pct: number) => Math.ceil((fish.length * pct) / 100);
    await getForageStore().grant(v.id, day, "fish", fish.slice(0, need(25)).map((s) => ({ id: s.id, size: 100 })), 99);
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "fish", tier: 50 })))).toBe("NOT_YET");
    const c = await body<DexClaimResponse>(await dexClaim.POST(call("/x", v, { cat: "fish", tier: 25 })));
    expect(c).toMatchObject({ earned: 20, title: null });
    expect(c.me.points).toBe(20);
    expect(c.state.claims["fish:25"]).toBe(day);
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "fish", tier: 25 })))).toBe("ALREADY");
    await getForageStore().grant(v.id, day, "fish", fish.slice(need(25), need(50)).map((s) => ({ id: s.id, size: 100 })), 99);
    const c50 = await body<DexClaimResponse>(await dexClaim.POST(call("/x", v, { cat: "fish", tier: 50 })));
    expect(c50.title).toBe("주말 낚시꾼");
    expect(c50.state.titles).toContain("주말 낚시꾼");
    expect((await dexClaim.POST(call("/x", v, { cat: "fish", tier: 33 }))).status).toBe(400);

    const w = await newVisitor();
    const pub = await body<PublicDex>(await dexOf.GET(call(`/api/forage/dex/${v.id}`, w), { params: Promise.resolve({ id: v.id }) }));
    expect(Object.keys(pub.dex)).toHaveLength(need(50));
    expect(pub.titles).toEqual(["주말 낚시꾼"]);
    expect(pub).not.toHaveProperty("bag");
  });
});
