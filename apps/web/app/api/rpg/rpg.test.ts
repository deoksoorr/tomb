import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { huntPlan, huntSpawnable } from "@/lib/rpg/plan";
import { getRpgStore } from "@/lib/rpg/store";
import { signTicket } from "@/lib/rpg/ticket";
import type { RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { earnRule } from "@/lib/economy";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import type { RankResponse } from "@/lib/types";
import * as rank from "../rank/route";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";
import * as rpg from "./route";
import * as shop from "./shop/route";
import * as character from "./character/route";

// 로컬 구성(MemoryStore·MemoryRpgStore)으로 사냥터 라우트를 직접 부른다. 시간은 Date.now를 바꿔 흐르게 한다.

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

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
  return { cookie, ip: `10.9.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
}

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

async function startRun(v: Visitor, game = "hunt", difficulty = "easy", zone?: string) {
  const res = await start.POST(call("/api/rpg/run/start", v, { game, difficulty, ...(zone ? { zone } : {}) }));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}

function clearAll(seed: number, durationMs = 100_000) {
  const kills: Record<string, number> = {};
  const plan = huntPlan(seed, "easy");
  for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt", durationMs, kills, wavesCleared: plan.length, died: false, potionsUsed: { p_coffee: 1 } };
}

/** 지금부터 ms 뒤로 시계를 옮긴다 */
const later = (ms: number) => {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + ms);
};

describe("사냥터 API", () => {
  it("세션이 없으면 401", async () => {
    const res = await rpg.GET(call("/api/rpg"));
    expect(res.status).toBe(401);
  });

  it("정상 판: 티켓 → 결과 → EXP·포인트·드롭, 같은 티켓은 다시 못 낸다", async () => {
    const v = await newVisitor();
    const s = await startRun(v);
    expect(s.ticket).toContain(".");
    later(101_000);
    const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: clearAll(s.seed) }));
    const body = (await res.json()) as RunFinishResponse;
    expect(res.status).toBe(200);
    expect(body.reward.points).toBe(20);
    expect(body.reward.exp).toBeGreaterThan(50);
    expect(body.view.character.level).toBeGreaterThan(1);
    // 마신 1개를 빼고, 드롭(시드가 무작위라 가끔)으로 들어온 만큼 더한다
    const coffeeDrops = body.reward.drops.filter((d) => d.id === "p_coffee").reduce((n, d) => n + d.qty, 0);
    expect(body.view.character.potions.p_coffee).toBe(2 + coffeeDrops);
    expect(body.view.today.huntPoints).toBe(20);
    // 49번 랭킹: 그 사냥터의 최단 클리어(서버가 잰 시간과 결과 중 짧은 쪽)와 처치 수
    const board = async (q: string) => (await (await rank.GET(call(`/api/rank?${q}&me=1`, v))).json()) as RankResponse;
    const kills = Object.values(clearAll(s.seed).kills).reduce((n, k) => n + k, 0);
    expect((await board("board=huntBest&zone=easy&period=week")).mine).toMatchObject({ value: 100_000, me: true });
    expect((await board("board=huntBest&zone=easy&period=all")).mine?.value).toBe(100_000);
    expect((await board("board=huntBest&zone=hard")).mine).toBeNull();
    expect((await board("board=huntKills&period=week")).mine?.value).toBe(kills);
    expect((await board("board=points&period=week")).mine?.value).toBe(20);
    const again = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: clearAll(s.seed) }));
    expect(again.status).toBe(409);
    expect(await errCode(again)).toBe("TICKET_USED");
    vi.restoreAllMocks();
  });

  it("꾸민 티켓·남의 티켓·오래된 티켓·너무 빠른 결과·너무 높은 결과는 거절", async () => {
    const v = await newVisitor();
    const w = await newVisitor();
    const s = await startRun(v);
    // 서명 위조
    const forged = await signTicket("not-the-secret", { n: "x", a: v.id, g: "hunt", d: "easy", t: Date.now(), s: 1, lv: 1, st: { agi: 1, dex: 1, luk: 1 } });
    expect(await errCode(await finish.POST(call("/x", v, { ticket: forged, result: clearAll(1) })))).toBe("BAD_TICKET");
    // 남의 티켓
    expect((await finish.POST(call("/x", w, { ticket: s.ticket, result: clearAll(s.seed) }))).status).toBe(403);
    // 너무 빠름: 서버로는 5초밖에 안 지났는데 100초 했다고 함
    later(5_000);
    expect(await errCode(await finish.POST(call("/x", v, { ticket: s.ticket, result: clearAll(s.seed) })))).toBe("TOO_FAST");
    vi.restoreAllMocks();
    // 너무 높음: 15초 만에 모든 웨이브
    const s2 = await startRun(v);
    later(15_000);
    const high = await finish.POST(call("/x", v, { ticket: s2.ticket, result: clearAll(s2.seed, 15_000) }));
    expect(high.status).toBe(422);
    vi.restoreAllMocks();
    // 오래됨
    const s3 = await startRun(v);
    later(60 * 60_000);
    expect(await errCode(await finish.POST(call("/x", v, { ticket: s3.ticket, result: clearAll(s3.seed) })))).toBe("TICKET_EXPIRED");
    vi.restoreAllMocks();
    // 새 판을 시작하면 이전 판은 끝난다
    const s4 = await startRun(v);
    await startRun(v);
    later(101_000);
    expect(await errCode(await finish.POST(call("/x", v, { ticket: s4.ticket, result: clearAll(s4.seed) })))).toBe("TICKET_STALE");
    vi.restoreAllMocks();
  });

  it("사냥 포인트는 하루 한도까지만 (earnPoints 한도)", async () => {
    const v = await newVisitor();
    const cap = earnRule("hunt").dailyMax;
    // 한 시간에 30판 제한이 있어 한도 바로 아래까지는 미리 채워 둔다
    await getAccounts().earn(v.id, "hunt", kstDay(), { amount: cap - 30 });
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const s = await startRun(v);
      later(101_000);
      const res = await finish.POST(call("/x", v, { ticket: s.ticket, result: clearAll(s.seed) }));
      vi.restoreAllMocks();
      const body = (await res.json()) as RunFinishResponse;
      total += body.reward.points;
      if (i === 2) expect(body.reward.capped).toBe(true);
    }
    expect(total).toBe(30);
  });

  it("한 시간에 30판까지", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 30; i++) await startRun(v, "bugs");
    const res = await start.POST(call("/x", v, { game: "bugs", difficulty: "easy" }));
    expect(res.status).toBe(429);
  });

  it("상점: 포인트로 사고, 장착하고, 되팔면 50% 환불", async () => {
    const v = await newVisitor();
    const short = await shop.POST(call("/x", v, { type: "buy", itemId: "w_keyboard" }));
    expect(await errCode(short)).toBe("NOT_ENOUGH_POINTS");
    await getAccounts().adjustPoints(v.id, 0); // 계정이 없으면 adjust가 무시되므로 먼저 만든다
    await getAccounts().enter(v.id, { name: "사냥꾼" }, Date.now());
    await getAccounts().adjustPoints(v.id, 300);
    const before = ((await (await rpg.GET(call("/api/rpg", v))).json()) as RpgView).points;
    const bought = (await (await shop.POST(call("/x", v, { type: "buy", itemId: "w_keyboard" }))).json()) as RpgView;
    expect(bought.points).toBe(before - 120);
    expect(bought.character.inv.w_keyboard).toBe(1);
    // 레벨 5 무기라 아직 못 낀다
    const eq = await character.POST(call("/x", v, { type: "equip", slot: "weapon", itemId: "w_keyboard" }));
    expect(await errCode(eq)).toBe("LEVEL_LOW");
    const potions = (await (await shop.POST(call("/x", v, { type: "buy", itemId: "p_energy", qty: 3 }))).json()) as RpgView;
    expect(potions.character.potions.p_energy).toBe(3);
    const sold = (await (await shop.POST(call("/x", v, { type: "sell", itemId: "w_keyboard" }))).json()) as RpgView;
    expect(sold.points).toBe(before - 120 - 30 + 60);
    expect(sold.character.inv.w_keyboard).toBeUndefined();
    // 동시에 두 번 사도 잔액이 음수가 되지 않는다
    await getAccounts().adjustPoints(v.id, -10_000);
    await getAccounts().adjustPoints(v.id, 130);
    const both = await Promise.all([1, 2].map(() => shop.POST(call("/x", v, { type: "buy", itemId: "w_keyboard" }))));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("캐릭터: 능력치 올리기·스킬 배우기", async () => {
    const v = await newVisitor();
    const a = (await (await character.POST(call("/x", v, { type: "alloc", stats: { str: 2, dex: 3 } }))).json()) as RpgView;
    expect(a.character.statPoints).toBe(0);
    expect(a.derived.stats.str).toBe(3);
    const l = (await (await character.POST(call("/x", v, { type: "learn", skill: "em_kindle" }))).json()) as RpgView;
    expect(l.character.skills.em_kindle).toBe(1);
    expect(l.respecCost).toBe(0);
    expect(l.superHunter).toBeUndefined();
    // 서버가 잘못된 배분을 거절한다: 선행 없음·단 잠김·포인트 없음·모르는 스킬
    const bad = await character.POST(call("/x", v, { type: "learn", skill: "em_fan" }));
    expect(bad.status).toBe(409);
    const unknown = await character.POST(call("/x", v, { type: "learn", skill: "refactor" }));
    expect(unknown.status).toBe(400);
    const passiveKey = await character.POST(call("/x", v, { type: "hotbar", slots: ["em_hearth", null, null, null, null, null] }));
    expect(passiveKey.status).toBe(409);
  });

  it("스킬 초기화: 첫 1회 무료, 그 뒤로는 지갑 포인트 (보인 비용과 다르면 거절)", async () => {
    const v = await newVisitor();
    await getRpgStore().update(v.id, (s) => ({ state: { ...s, level: 10 }, result: null }));
    await character.POST(call("/x", v, { type: "learn", skill: "em_kindle" }));
    const r1 = (await (await character.POST(call("/x", v, { type: "respec", cost: 0 }))).json()) as RpgView;
    expect(r1.character.skills).toEqual({});
    expect(r1.character.skillPoints).toBe(11);
    expect(r1.respecCost).toBe(50);
    await character.POST(call("/x", v, { type: "learn", skill: "em_kindle" }));
    const stale = await character.POST(call("/x", v, { type: "respec", cost: 0 }));
    expect(stale.status).toBe(409);
    expect(await errCode(stale)).toBe("COST_CHANGED");
    // 지갑이 모자라면 돈도 상태도 그대로
    const poor = await character.POST(call("/x", v, { type: "respec", cost: 50 }));
    if (poor.status === 200) expect(((await poor.json()) as RpgView).character.skills).toEqual({});
    else expect((await getRpgStore().get(v.id)).skills.em_kindle).toBe(1);
  });

  it("테스트 서버 슈퍼 계정: 운영자만, 운영 서버(VERCEL_ENV=production)에서는 꺼진다", async () => {
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      const view = (await (await rpg.GET(call("/api/rpg", op))).json()) as RpgView;
      expect(view.superHunter).toBe(true);
      expect(view.character.level).toBe(50);
      expect(view.respecCost).toBe(0);
      expect(view.character.skillPoints).toBeGreaterThan(100);
      // Lv.1인데도 지옥 사냥터가 열린다
      const hell = await start.POST(call("/api/rpg/run/start", op, { game: "hunt", difficulty: "hell" }));
      expect(hell.status).toBe(200);
      // 스킬을 레벨 예산 너머까지 찍을 수 있다
      for (let i = 0; i < 5; i++) expect((await character.POST(call("/x", op, { type: "learn", skill: "em_kindle" }))).status).toBe(200);
      expect((await character.POST(call("/x", op, { type: "learn", skill: "em_hearth" }))).status).toBe(200);
      expect((await getRpgStore().get(op.id)).level).toBe(1);

      // 운영 서버에서는 같은 운영자 계정이라도 보통 계정 — 예산을 넘은 배분은 비우고 포인트를 돌려준다
      vi.stubEnv("VERCEL_ENV", "production");
      const prod = (await (await rpg.GET(call("/api/rpg", op))).json()) as RpgView;
      expect(prod.superHunter).toBeUndefined();
      expect(prod.character.level).toBe(1);
      expect(prod.character.skills).toEqual({});
      expect(prod.character.skillPoints).toBe(1);
      const locked = await start.POST(call("/api/rpg/run/start", op, { game: "hunt", difficulty: "hell" }));
      expect(await errCode(locked)).toBe("ZONE_LOCKED");
    } finally {
      vi.stubEnv("VERCEL_ENV", "");
      await setStaff(null);
    }
  });
});

describe("운영자 계정은 순위에 들지 않는다", () => {
  it("사냥을 깨도 사냥 순위에 기록되지 않고, 포인트 순위에서도 걸러진다 (순번 연속)", async () => {
    const [op, a] = [await newVisitor(), await newVisitor()];
    await getAccounts().recordHunt(a.id, "easy", { kills: 1, clearMs: null }, kstWeek());
    await setStaff(op.id);
    try {
      const s = await startRun(op);
      later(101_000);
      const res = await finish.POST(call("/api/rpg/run/finish", op, { ticket: s.ticket, result: clearAll(s.seed) }));
      vi.restoreAllMocks();
      expect(res.status).toBe(200);
      expect((await getAccounts().huntRank("kills", 1, op.id, {})).mine).toBeNull();
      expect((await getAccounts().huntRank("best", 1, op.id, { zone: "easy" })).mine).toBeNull();
      // 포인트는 기록 쪽(지급)에서 막지 않으므로 읽을 때 거른다
      expect((await getAccounts().pointRank(500, op.id, kstWeek())).mine).not.toBeNull();
      const board = async (q: string, v: Visitor) => (await (await rank.GET(call(`/api/rank?${q}&me=1`, v))).json()) as RankResponse;
      for (const q of ["board=points&period=week", "board=points", "board=huntKills", "board=huntBest&zone=easy"]) {
        const r = await board(q, op);
        expect(r).toMatchObject({ mine: null, staff: true });
        expect(r.rows.some((x) => x.me)).toBe(false);
        expect(r.rows.map((x) => x.rank)).toEqual(r.rows.map((_, i) => i + 1));
      }
      const other = await board("board=points&period=week", a);
      expect(other.staff).toBeUndefined();
      expect(other.rows.map((x) => x.rank)).toEqual(other.rows.map((_, i) => i + 1));
    } finally {
      await setStaff(null);
    }
  });
});

describe("40번 테마 사냥터 API", () => {
  it("사냥터는 레벨로 열리고, 고른 사냥터가 티켓에 실려 결과 검증까지 이어진다", async () => {
    const v = await newVisitor();
    // Lv.1: 헬스장(Lv.5)은 아직 잠김, 난이도와 안 맞는 사냥터는 거절
    const locked = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy", zone: "gym" }));
    expect(locked.status).toBe(403);
    expect(await errCode(locked)).toBe("ZONE_LOCKED");
    const wrong = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy", zone: "library" }));
    expect(wrong.status).toBe(400);
    const unknown = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy", zone: "nowhere" }));
    expect(unknown.status).toBe(400);
    // 지옥 기본 사냥터(회식 3차)도 Lv.30부터
    const hell = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "hell" }));
    expect(await errCode(hell)).toBe("ZONE_LOCKED");

    // Lv.5가 되면 헬스장 → 헬스장 계획대로 다 잡으면 통과
    await getRpgStore().update(v.id, (s) => ({ state: { ...s, level: 5 }, result: null }));
    const s = await startRun(v, "hunt", "easy", "gym");
    expect(s.zone).toBe("gym");
    const plan = huntPlan(s.seed, "easy", "gym");
    const kills = huntSpawnable(plan, Infinity) as Record<string, number>;
    later(101_000);
    const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result: { game: "hunt", durationMs: 100_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RunFinishResponse;
    // 헬스장은 쉬움 중 세 번째 곳: 기본(20P)보다 조금 더
    expect(body.reward.points).toBe(23);
    vi.restoreAllMocks();
  });
});

describe("11/12 기간제 코디 드롭", () => {
  it("계정 가방에 0P로 넣고, 이미 가진(가방·착용) 코디면 다음 후보를 준다", async () => {
    const { COSMETIC_DROPS } = await import("@/lib/rpg/catalog");
    const { grantCosmetics } = await import("@/lib/rpg/service");
    const v = await newVisitor();
    const accounts = getAccounts();
    const now = Date.now();
    const before = (await accounts.get(v.id, kstDay(now), now)).points;
    const [first, second] = COSMETIC_DROPS;
    const got = await grantCosmetics(v.id, [{ kind: "potion", id: "p_coffee", qty: 1 }, { kind: "cosmetic", id: first, qty: 1 }], now);
    expect(got).toEqual([{ kind: "potion", id: "p_coffee", qty: 1 }, { kind: "cosmetic", id: first, qty: 1 }]);
    // 같은 걸 또 받으면 (가방에 있다) 다음 후보
    const again = await grantCosmetics(v.id, [{ kind: "cosmetic", id: first, qty: 1 }], now);
    expect(again).toEqual([{ kind: "cosmetic", id: second, qty: 1 }]);
    const me = await accounts.get(v.id, kstDay(now), now);
    expect(me.inventory[first]).toBe(1);
    expect(me.inventory[second]).toBe(1);
    expect(me.points).toBe(before);
  });
});
