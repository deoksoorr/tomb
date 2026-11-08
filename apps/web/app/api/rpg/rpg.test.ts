import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { huntPlan } from "@/lib/rpg/plan";
import { signTicket } from "@/lib/rpg/ticket";
import type { RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { getAccounts } from "@/lib/store";
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

async function startRun(v: Visitor, game = "hunt", difficulty = "easy") {
  const res = await start.POST(call("/api/rpg/run/start", v, { game, difficulty }));
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
    expect(body.view.character.potions.p_coffee).toBe(2);
    expect(body.view.today.huntPoints).toBe(20);
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

  it("사냥 포인트는 하루 300까지만 (earnPoints 한도)", async () => {
    const v = await newVisitor();
    let total = 0;
    for (let i = 0; i < 17; i++) {
      const s = await startRun(v);
      later(101_000);
      const res = await finish.POST(call("/x", v, { ticket: s.ticket, result: clearAll(s.seed) }));
      vi.restoreAllMocks();
      const body = (await res.json()) as RunFinishResponse;
      total += body.reward.points;
      if (i === 16) {
        expect(body.reward.capped).toBe(true);
        expect(body.view.today.huntPoints).toBe(300);
      }
    }
    expect(total).toBe(300);
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
    await getAccounts().attend(v.id, "ip", { name: "사냥꾼" }, "20260101", "20251231");
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
    const l = (await (await character.POST(call("/x", v, { type: "learn", skill: "refactor" }))).json()) as RpgView;
    expect(l.character.skills.refactor).toBe(1);
    const bad = await character.POST(call("/x", v, { type: "learn", skill: "deploy" }));
    expect(bad.status).toBe(409);
  });
});
