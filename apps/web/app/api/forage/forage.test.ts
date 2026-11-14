import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { earnRule } from "@/lib/economy";
import { DEX_REWARD, dexRewardOf, dexTitleNeed, GATHER_NODES, gatherNodeById, speciesById, speciesOf } from "@/lib/forage/catalog";
import { BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS, reelMinMs } from "@/lib/forage/rules";
import { payNewDex } from "@/lib/forage/dexReward";
import { getForageStore } from "@/lib/forage/store";
import { signForageTicket } from "@/lib/forage/ticket";
import type {
  CastResponse,
  DexPayResponse,
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
import * as dexPay from "./dex/reward/route";
import * as cast from "./fish/cast/route";
import * as reel from "./fish/reel/route";
import * as gFinish from "./gather/finish/route";
import * as gStart from "./gather/start/route";
import * as forage from "./route";
import * as sell from "./sell/route";

// 물에 빠진 꾸미기(아주 드문 확률)는 lib/forage/sunken.test.ts가 따로 본다 → 여기서는 늘 물고기가 걸리게
vi.mock("@/lib/forage/sunken", async (orig) => ({ ...(await orig<typeof import("@/lib/forage/sunken")>()), SUNKEN_CHANCE: 0 }));

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
  const pointsOf = async (id: string) => (await getAccounts().get(id, kstDay(Date.now()), Date.now())).points;

  /** 던지고 감기까지 한 번 (시계는 그대로 둔다 — 부른 쪽이 되돌린다) */
  async function catchOne(v: Visitor) {
    const c = await body<CastResponse>(await cast.POST(call("/x", v, { spot: PIER })));
    later(c.biteInMs + reelMinMs(c.power) + 50);
    const r = await body<ReelResponse>(await reel.POST(call("/x", v, { ticket: c.ticket, ok: true })));
    vi.restoreAllMocks();
    return r;
  }

  it("새 종을 처음 낚는 순간 희귀도별 보상이 지갑에 (결과에 도감 +N P), 같은 종 두 번째는 없다", async () => {
    const v = await newVisitor();
    await state(v);
    const r = await catchOne(v);
    const id = r.result!.id;
    const pts = dexRewardOf(id);
    expect(pts).toBeGreaterThan(0);
    expect(r.dex).toMatchObject({ points: pts, earned: pts, pending: 0, titles: [] });
    expect(r.dex!.me!.points).toBe(pts);
    expect(await pointsOf(v.id)).toBe(pts);
    expect(r.state.reward).toEqual({ pending: {}, got: { fish: pts } });
    expect(r.state.today.dexP).toBe(pts);
    // 같은 종을 또 잡으면 보상 없음 (같은 종이 나올 때까지 몇 번)
    for (let i = 0; i < 40; i++) {
      const again = await catchOne(v);
      if (again.result?.id !== id) continue;
      expect(again.result.isNew).toBe(false);
      expect(again.dex).toBeUndefined();
      break;
    }
  });

  it("오늘 도감 한도에 걸린 만큼은 받을 보상으로 쌓이고, 다음 날 [도감 보상 받기]로 한도 안에서 — 동시에 눌러도 한 번만", async () => {
    const v = await newVisitor();
    const cap = earnRule("dex").dailyMax;
    await state(v);
    await getAccounts().earn(v.id, "dex", kstDay(realNow()), { amount: cap });
    const before = await pointsOf(v.id);
    const r = await catchOne(v);
    const pts = dexRewardOf(r.result!.id);
    expect(r.dex).toMatchObject({ points: pts, earned: 0, pending: pts });
    expect(r.dex!.me).toBeUndefined();
    expect(await pointsOf(v.id)).toBe(before);
    expect(r.state.reward.pending).toEqual({ fish: pts });
    // 오늘은 받아도 한도라 그대로 남는다
    expect(await errCode(await dexPay.POST(call("/x", v, { cat: "fish" })))).toBe("DAILY_CAP");
    expect((await state(v)).reward.pending).toEqual({ fish: pts });
    expect(await errCode(await dexPay.POST(call("/x", v, { cat: "bug" })))).toBe("NOTHING_TO_CLAIM");
    expect((await dexPay.POST(call("/x", v, { cat: "nope" }))).status).toBe(400);

    // 다음 날: 1P만 남은 상태에서 동시에 다섯 번 → 한 번만 1P, 나머지는 남는다
    later(86_400_000);
    const day2 = kstDay(Date.now());
    await getAccounts().earn(v.id, "dex", day2, { amount: cap - 1 });
    const mid = await pointsOf(v.id);
    const res = await Promise.all(Array.from({ length: 5 }, () => dexPay.POST(call("/x", v, { cat: "fish" }))));
    const ok = res.filter((x) => x.status === 200);
    expect(ok).toHaveLength(1);
    const paid = await body<DexPayResponse>(ok[0]);
    expect(paid).toMatchObject({ earned: 1, left: pts - 1 });
    expect(await pointsOf(v.id)).toBe(mid + 1);
    expect((await state(v)).reward).toEqual({ pending: { fish: pts - 1 }, got: { fish: 1 } });
    vi.restoreAllMocks();

    // 그다음 날: 남은 것을 모두 (동시에 눌러도 합은 한 번)
    later(2 * 86_400_000);
    const end = await pointsOf(v.id);
    const res3 = await Promise.all(Array.from({ length: 4 }, () => dexPay.POST(call("/x", v, { cat: "fish" }))));
    const ok3 = res3.filter((x) => x.status === 200);
    expect(ok3).toHaveLength(1);
    expect(await body<DexPayResponse>(ok3[0])).toMatchObject({ earned: pts - 1, left: 0 });
    expect(await pointsOf(v.id)).toBe(end + pts - 1);
    expect((await state(v)).reward).toEqual({ pending: {}, got: { fish: pts } });
  });

  it("전환 정산: 예전에 단계 보상을 받은 계정은 (등록한 종 보상 합 − 받은 단계 보상)만큼 받을 보상에, 음수는 0, 한 번만. 받은 칭호는 유지", async () => {
    const v = await newVisitor();
    const store = getForageStore();
    const day = kstDay(realNow());
    const fish = speciesOf("fish").slice(0, 20);
    const sum = fish.reduce((n, s) => n + dexRewardOf(s.id), 0);
    // 개편 전 기록: 물고기 20종 등록 + 25·50% 받음, 곤충은 하나도 없는데 25·50% 받음(종이 늘기 전 기록), 별자리 25%
    await store.grant(v.id, day, "fish", fish.map((s) => ({ id: s.id, size: 100 })), 99);
    for (const k of ["fish:25", "fish:50", "bug:25", "bug:50", "star:25"]) await store.claimDex(v.id, k, "20261101");
    const before = await pointsOf(v.id);

    const s1 = await state(v);
    const owed = sum - DEX_REWARD[25] - DEX_REWARD[50];
    expect(owed).toBeGreaterThan(0);
    expect(s1.reward.pending).toEqual({ fish: owed });
    expect(s1.reward.got).toEqual({ fish: 60, bug: 60, star: 20 });
    // 받은 50% 칭호는 그대로 (곤충은 지금 등록 0이어도), 물고기는 20/40 = 절반 등록이라 어차피 붙는다
    expect(s1.titles).toEqual(["주말 낚시꾼", "곤충 채집단"]);
    // 예전 기록은 지우지 않는다
    expect(s1.claims).toMatchObject({ "fish:25": "20261101", "bug:50": "20261101" });
    // 정산은 한 번만 (다시 읽어도, 동시에 읽어도 그대로)
    await Promise.all([state(v), state(v), state(v)]);
    expect((await state(v)).reward.pending).toEqual({ fish: owed });
    expect(await pointsOf(v.id)).toBe(before);

    // 정산 뒤 새로 등록하면 그 종만 더 쌓이거나 바로 받는다 (두 번 세지 않는다)
    const extra = speciesOf("fish")[25];
    const g = await store.grant(v.id, day, "fish", [{ id: extra.id, size: 100 }], 99);
    expect(g![0].isNew).toBe(true);
    expect((await state(v)).reward.pending).toEqual({ fish: owed + dexRewardOf(extra.id) });

    // 받기: 오늘 한도(300) 안에서
    const cap = earnRule("dex").dailyMax;
    const p = await body<DexPayResponse>(await dexPay.POST(call("/x", v, { cat: "fish" })));
    const all = owed + dexRewardOf(extra.id);
    expect(p.earned).toBe(Math.min(all, cap));
    expect(p.left).toBe(all - Math.min(all, cap));
    expect(p.me.points).toBe(before + p.earned);
    expect(p.state.reward.got.fish).toBe(60 + p.earned);

    // 정산할 게 없는 계정(받은 단계 보상이 등록 보상보다 큼)은 0 — 빼앗지 않는다
    const w = await newVisitor();
    await store.grant(w.id, day, "gather", [{ id: speciesOf("ore")[0].id, size: 0 }], 99);
    for (const k of ["ore:25", "ore:50", "ore:75"]) await store.claimDex(w.id, k, "20261101");
    const sw = await state(w);
    expect(sw.reward.pending).toEqual({});
    expect(sw.reward.got).toEqual({ ore: 140 });
    expect(sw.titles).toEqual(["초보 광부"]);
  });

  it("칭호는 그 칸의 절반·전부를 등록하면 저절로 (등록 결과에 새 칭호), 한 번 붙으면 남는다. 옛 단계 받기는 409, 다른 사람 도감에도 보인다", async () => {
    const v = await newVisitor();
    const store = getForageStore();
    const day = kstDay(realNow());
    await state(v);
    const herbs = speciesOf("herb");
    const half = dexTitleNeed("herb", 50);
    await store.grant(v.id, day, "gather", herbs.slice(0, half - 1).map((s) => ({ id: s.id, size: 0 })), 99);
    expect((await state(v)).titles).toEqual([]);
    // 마지막 한 종은 채집 경로로 (지급·칭호가 결과에 실린다)
    const g = await store.grant(v.id, day, "gather", [{ id: herbs[half - 1].id, size: 0 }], 99);
    const gain = await payNewDex(store, v.id, g!, "ip", Date.now());
    expect(gain).toMatchObject({ points: dexRewardOf(herbs[half - 1].id), titles: ["약초꾼"] });
    const s1 = await state(v);
    expect(s1.titles).toEqual(["약초꾼"]);
    expect((await store.dexPay(v.id)).marks).toContain("herb:50");
    // 이미 등록된 종을 또 넣으면 아무것도 없다
    expect(await payNewDex(store, v.id, (await store.grant(v.id, day, "gather", [{ id: herbs[0].id, size: 0 }], 99))!, "ip", Date.now())).toBeUndefined();

    // 옛 화면이 단계 보상을 부르면 포인트 없이 409
    const before = await pointsOf(v.id);
    const old = await dexClaim.POST(call("/x", v, { cat: "herb", tier: 50 }));
    expect(old.status).toBe(409);
    expect(await errCode(old)).toBe("DEX_CHANGED");
    expect(await errCode(await dexClaim.POST(call("/x", v, { cat: "fish", tier: 33 })))).toBe("DEX_CHANGED");
    expect((await dexClaim.POST(call("/x", undefined, { cat: "fish", tier: 25 }))).status).toBe(401);
    expect(await pointsOf(v.id)).toBe(before);

    const w = await newVisitor();
    const pub = await body<PublicDex>(await dexOf.GET(call(`/api/forage/dex/${v.id}`, w), { params: Promise.resolve({ id: v.id }) }));
    expect(Object.keys(pub.dex)).toHaveLength(half);
    expect(pub.titles).toEqual(["약초꾼"]);
    expect(pub).not.toHaveProperty("bag");
    expect(pub).not.toHaveProperty("reward");
  });
});
