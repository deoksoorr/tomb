import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { burnoutZone, TRANSCEND_EXP_MUL } from "@/lib/rpg/endgame";
import { huntPlan } from "@/lib/rpg/plan";
import { evaluate } from "@/lib/rpg/rewards";
import { forgetEndgameLaunch } from "@/lib/rpg/service";
import { getRpgStore } from "@/lib/rpg/store";
import type { CharacterState, RpgView, RunFinishResponse, RunStartResponse } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import { kstDay } from "@/lib/store/accounts";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";
import * as rpg from "./route";

// 11/15 사냥 끝판 1단계 API: 번아웃 단계 시작 검사(레벨·열린 단계·하루 도전)·초월 판 구간·초월 EXP·단계 해금·개척자 번호.
// 로컬 구성(MemoryRpgStore)으로 라우트를 직접 부른다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  forgetEndgameLaunch();
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown) {
  const headers: Record<string, string> = {};
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function newVisitor(patch: Partial<CharacterState> = { level: 50 }): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.15.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getRpgStore().update(v.id, (s) => ({ state: { ...s, runs: 1, ...patch }, result: null }));
  return v;
}

const errCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const startBody = (burnout?: number, zone?: string) => ({ game: "hunt", difficulty: "hell", ...(zone ? { zone } : {}), ...(burnout ? { burnout } : {}) });

async function begin(v: Visitor, burnout?: number, zone?: string): Promise<RunStartResponse> {
  const res = await start.POST(call("/api/rpg/run/start", v, startBody(burnout, zone)));
  expect(res.status).toBe(200);
  return (await res.json()) as RunStartResponse;
}

/** 계획대로 모든 웨이브를 깬 결과 */
function clearAll(s: RunStartResponse, extra: { died?: boolean; potionsUsed?: Record<string, number> } = {}) {
  const plan = huntPlan(s.seed, "hell", s.zone);
  const kills: Record<string, number> = {};
  for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt" as const, durationMs: 150_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {}, ...extra };
}

async function end(v: Visitor, s: RunStartResponse, result = clearAll(s)): Promise<RunFinishResponse> {
  const real = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(real + 151_000);
  const res = await finish.POST(call("/api/rpg/run/finish", v, { ticket: s.ticket, result }));
  vi.restoreAllMocks();
  expect(res.status).toBe(200);
  return (await res.json()) as RunFinishResponse;
}

describe("번아웃 단계 시작 검사 (서버)", () => {
  it("레벨 50이 아니면 거절", async () => {
    const v = await newVisitor({ level: 49 });
    const res = await start.POST(call("/api/rpg/run/start", v, startBody(1)));
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("LEVEL_LOW");
  });

  it("열리지 않은 단계(깬 단계 + 1 초과)는 거절, 지옥이 아니면 거절", async () => {
    const v = await newVisitor({ level: 50, bBest: 1 });
    const res = await start.POST(call("/api/rpg/run/start", v, startBody(3)));
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("BURNOUT_LOCKED");
    const hard = await start.POST(call("/api/rpg/run/start", v, { game: "hunt", difficulty: "hard", burnout: 1 }));
    expect(hard.status).toBe(400);
    // 2단계는 열려 있다 — 사냥터는 화면이 보낸 것과 상관없이 단계마다 정해진다 (2단계 = 축제장)
    const ok = await begin(v, 2, "layoff-day");
    expect(ok.zone).toBe("new-year-eve");
    expect(ok.burnout).toBe(2);
  });

  it("하루 도전 5번을 다 쓰면 거절 (시작만 해도 한 번)", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 5; i++) await begin(v, 1);
    const view = (await (await rpg.GET(call("/api/rpg", v))).json()) as RpgView;
    expect(view.endgame?.burnout.triesLeft).toBe(0);
    expect(view.endgame?.day.runs).toBe(5);
    const res = await start.POST(call("/api/rpg/run/start", v, startBody(1)));
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("BURNOUT_TRIES");
    // 보통 지옥 판은 도전과 상관없이 된다
    expect((await begin(v, undefined, "layoff-day")).burnout).toBeUndefined();
  });

  it("어제 기록은 새벽 5시 뒤 첫 판에 넘어간다 (도전 다시 5번, 남은 100% 판은 적립)", async () => {
    const v = await newVisitor({ level: 50, tDay: "20200101", tRuns: 5, tBank: 0, bTries: 5 });
    const s = await begin(v, 1);
    expect(s.tier).toBe("full");
    const c = await getRpgStore().get(v.id);
    expect(c.tDay).toBe(kstDay());
    expect(c.tRuns).toBe(1);
    expect(c.bTries).toBe(1);
    expect(c.tBank).toBe(40);
  });

  it("레벨 50 미만 지옥 판은 초월 판이 아니다 (티켓에 구간 없음, EXP는 보통 레벨로)", async () => {
    const v = await newVisitor({ level: 45 });
    const s = await begin(v, undefined, "quarter-close");
    expect(s.tier).toBeUndefined();
    const r = await end(v, s);
    expect(r.reward.transcend).toBeUndefined();
    expect(r.view.endgame).toBeUndefined();
    expect(r.reward.newLevel).toBeGreaterThan(45);
  });
});

describe("초월 판 보상", () => {
  it("레벨 50 지옥 판: 판 EXP × 배율 → 초월 EXP (100% 구간), 일반 EXP는 그대로 0", async () => {
    const v = await newVisitor();
    const s = await begin(v, undefined, "layoff-day");
    expect(s.tier).toBe("full");
    const r = await end(v, s);
    const t = r.reward.transcend!;
    expect(t.tier).toBe("full");
    expect(t.exp).toBe(Math.round(r.reward.exp * TRANSCEND_EXP_MUL));
    expect(t.exp).toBeGreaterThan(900);
    expect(r.view.character.tExp).toBe(t.exp);
    expect(r.view.character.exp).toBe(0);
    expect(r.view.character.level).toBe(50);
  });

  it("구간 비율은 서버가 판 시작 때 센 순번으로: 61번째 판은 연습 (초월 EXP·드롭 없음, 포인트는 그대로)", async () => {
    const v = await newVisitor({ level: 50, tDay: kstDay(), tRuns: 60, tBank: 0 });
    const s = await begin(v, undefined, "layoff-day");
    expect(s.tier).toBe("practice");
    const r = await end(v, s);
    expect(r.reward.transcend).toMatchObject({ exp: 0, tier: "practice" });
    expect(r.reward.drops).toEqual([]);
    expect(r.reward.points).toBeGreaterThan(0);
    const mid = await newVisitor({ level: 50, tDay: kstDay(), tRuns: 20, tBank: 0 });
    const ms = await begin(mid, undefined, "layoff-day");
    expect(ms.tier).toBe("mid");
    const mr = await end(mid, ms);
    expect(mr.reward.transcend!.exp).toBe(Math.round(mr.reward.exp * TRANSCEND_EXP_MUL * 0.3));
  });

  it("초월 레벨이 오르면 5레벨마다 능력치 포인트", async () => {
    const v = await newVisitor({ level: 50, tLevel: 4, tExp: 21_000, statPoints: 0 });
    const r = await end(v, await begin(v, undefined, "layoff-day"));
    expect(r.reward.transcend!.levelsGained).toBe(1);
    expect(r.view.character.tLevel).toBe(5);
    expect(r.view.character.statPoints).toBe(1);
  });
});

describe("번아웃 해금·개척자", () => {
  it("쓰러지거나 부활 쿠키를 먹으면 안 열리고, 깔끔하게 깨면 다음 단계가 열린다", async () => {
    const v = await newVisitor({ level: 50, potions: { p_cookie: 2 } });
    // 1단계를 깔끔하게 → 2단계가 열린다
    const first = await end(v, await begin(v, 1));
    expect(first.reward.burnout).toEqual({ tier: 1, clean: true, unlocked: 1 });
    expect(first.view.endgame?.burnout.open).toBe(2);
    // 2단계에서 쓰러지면 그대로
    const s2 = await begin(v, 2);
    const fell = await end(v, s2, clearAll(s2, { died: true }));
    expect(fell.reward.burnout).toEqual({ tier: 2, clean: false });
    expect((await getRpgStore().get(v.id)).bBest).toBe(1);
    const s3 = await begin(v, 2);
    const cookie = await end(v, s3, clearAll(s3, { potionsUsed: { p_cookie: 1 } }));
    expect(cookie.reward.burnout!.clean).toBe(false);
    expect((await getRpgStore().get(v.id)).bBest).toBe(1);
    // 번아웃 EXP: 레벨 50 감소 없이 단계 보너스 (2단계 = 축제장 × 1.2)
    const plain = evaluate(
      { game: "hunt", difficulty: "hell", seed: s3.seed, level: 50, st: { agi: 1, dex: 1, luk: 1 }, zone: burnoutZone(2).id },
      clearAll(s3),
      150_000,
    );
    if (!plain.ok) throw new Error(plain.message);
    expect(Math.abs(cookie.reward.exp - plain.score * 1.2)).toBeLessThan(2);
  });

  it("개척자: 번아웃 1단계 첫 클리어·★51에 차례대로 번호, 운영자(슈퍼)는 번호를 받지도 쓰지도 않는다", async () => {
    const a = await newVisitor();
    const ra = await end(a, await begin(a, 1));
    const n = ra.reward.pioneer!;
    expect(n).toBeGreaterThan(0);
    expect((await getRpgStore().get(a.id)).pioneer?.n).toBe(n);
    // 같은 사람은 다시 받지 않는다
    const again = await end(a, await begin(a, 1));
    expect(again.reward.pioneer).toBeUndefined();

    // 운영자(테스트 서버 슈퍼 계정): 아무 단계나 고를 수 있지만 번호는 없다
    const op = await newVisitor({ level: 1 });
    await setStaff(op.id);
    try {
      const sv = (await (await rpg.GET(call("/api/rpg", op))).json()) as RpgView;
      expect(sv.endgame?.burnout.open).toBe(10);
      const s = await begin(op, 5);
      expect(s.zone).toBe("burnout-abyss");
      const r = await end(op, s);
      expect(r.reward.pioneer).toBeUndefined();
      // 건너뛴 단계는 기록하지 않는다 (1단계부터 차례로)
      expect((await getRpgStore().get(op.id)).bBest).toBe(0);
      const s1 = await begin(op, 1);
      expect((await end(op, s1)).reward.pioneer).toBeUndefined();
      expect((await getRpgStore().get(op.id)).pioneer).toBeUndefined();
    } finally {
      await setStaff(null);
    }

    // ★51 (초월 EXP로)
    const b = await newVisitor({ level: 50, tExp: 14_900 });
    const rb = await end(b, await begin(b, undefined, "layoff-day"));
    expect(rb.view.character.tLevel).toBe(1);
    expect(rb.reward.pioneer).toBe(n + 1);
  });
});
