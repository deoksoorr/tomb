import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { huntPlan } from "@/lib/rpg/plan";
import type { RunStartResponse } from "@/lib/rpg/types";
import { getOpsLog, type HuntLogEntry } from "@/lib/store/opsLog";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";

// 11/26 사냥터 기록: 입장·튕김(앞 판을 끝내지 못함)·보상 지급·쓰러짐·서버 판정 거절

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

type Visitor = { cookie: string; id: string };
let seq = 0;
const call = (path: string, v?: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(v ? { cookie: v.cookie } : {}), "x-forwarded-for": `10.77.${++seq}.1`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], id: ((await res.json()) as { visitorId: string }).visitorId };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const kinds = async (id: string) => (await getOpsLog().ofAccount("hunt", id)).map((e) => (e as HuntLogEntry).k);

function clearAll(seed: number, died = false) {
  const kills: Record<string, number> = {};
  const plan = huntPlan(seed, "easy");
  for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt", durationMs: 100_000, kills, wavesCleared: plan.length, died, potionsUsed: {} };
}

describe("사냥터 기록", () => {
  it("입장 → 앞 판을 끝내지 않고 다시 입장하면 튕김 → 보상 지급, 같은 티켓 다시 내면 서버 판정 거절", async () => {
    const v = await newVisitor();
    const a = (await (await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy" }))).json()) as RunStartResponse;
    expect(a.ticket).toBeTruthy();
    const b = (await (await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "easy" }))).json()) as RunStartResponse;
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 101_000);
    const ok = await finish.POST(call("/api/rpg/run/finish", v, { ticket: b.ticket, result: clearAll(b.seed) }));
    expect(ok.status).toBe(200);
    const again = await finish.POST(call("/api/rpg/run/finish", v, { ticket: b.ticket, result: clearAll(b.seed) }));
    expect(again.status).toBe(409);
    vi.restoreAllMocks();
    await settle();
    expect(await kinds(v.id)).toEqual(["reject", "reward", "start", "drop", "start"]);
    const [rej, reward] = await getOpsLog().ofAccount("hunt", v.id);
    expect(rej).toMatchObject({ code: "TICKET_USED", d: "easy" });
    expect((reward as HuntLogEntry).exp).toBeGreaterThan(0);
  });
});
