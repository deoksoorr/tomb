import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentUntil } from "@tomb/protocol";
import { starGroups, starsPlan, STARS_PLAN_VER } from "@/lib/rpg/plan";
import { METEOR_ITEM_ID, METEOR_PITY } from "@/lib/rpg/meteorDrop";
import { meteorForced, setMeteorForced } from "@/lib/rpg/meteorDev";
import { getRpgStore } from "@/lib/rpg/store";
import type { RunFinishResponse, RunStartResponse, StarsResult } from "@/lib/rpg/types";
import { setStaff } from "@/lib/staff";
import { starryNight } from "@/lib/stargaze";
import { getAccounts, getMegaphone } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import * as devMeteor from "../dev/meteor/route";
import * as session from "../session/route";
import * as finish from "./run/finish/route";
import * as start from "./run/start/route";

// 11/20 유성우 오라: 별자리 잇기 판 끝 굴림 → 영구 지급 → 마을 알림 (로컬 메모리 저장소로 라우트를 직접 부른다)

const grantFail = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/forage/sunkenGrant", async (orig) => {
  const real = await orig<typeof import("@/lib/forage/sunkenGrant")>();
  return { ...real, grantSunkenCosmetic: async (acct: string, id: string) => (grantFail.on ? false : real.grantSunkenCosmetic(acct, id)) };
});

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
  grantFail.on = false;
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
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  // 마을에 들어온 계정 (영구 지급은 있는 계정에만)
  await getAccounts().enter(id, { name: `별지기${seq + 1}`, color: "#9fb8d8", body: "hood" }, Date.now());
  return { cookie, ip: `10.9.${++seq}.1`, id };
}

/** 맑은 밤(또는 아닌) 시각 — 지금부터 30분씩 넘기며 찾는다 (판 하나 동안 그대로인 곳) */
function timeWhere(starry: boolean): number {
  const base = Math.floor(Date.now() / 1_800_000) * 1_800_000 + 60_000;
  for (let t = base; t < base + 30 * 86_400_000; t += 1_800_000) if (starryNight(t) === starry && starryNight(t + 120_000) === starry) return t;
  throw new Error("시각 없음");
}

/** 그 시각에 판을 시작해 76초 뒤에 끝낸다. groups = 완성으로 낼 무리 수 */
async function playStars(v: Visitor, at: number, groups: number): Promise<RunFinishResponse> {
  vi.spyOn(Date, "now").mockReturnValue(at);
  const res = await start.POST(call("/api/rpg/run/start", v, { game: "stars", difficulty: "easy", planVer: STARS_PLAN_VER }));
  expect(res.status).toBe(200);
  const s = (await res.json()) as RunStartResponse;
  const plan = starsPlan(s.seed, "easy", s.timeLimitSec, s.sky);
  const done = starGroups(plan)
    .filter((g) => g.full)
    .slice(0, groups)
    .map((g) => g.group);
  const result: StarsResult = {
    game: "stars",
    durationMs: 75_000,
    perfect: plan.length,
    good: 0,
    miss: 0,
    maxCombo: plan.length,
    score: plan.length * 300,
    ...(done.length ? { groups: done, perfectGroups: done } : {}),
  };
  vi.spyOn(Date, "now").mockReturnValue(at + 76_000);
  const fin = await finish.POST(call("/x", v, { ticket: s.ticket, result }));
  expect(fin.status).toBe(200);
  vi.restoreAllMocks();
  return (await fin.json()) as RunFinishResponse;
}

const permanentMeteor = async (id: string) => {
  const a = await getAccounts().get(id, kstDay(Date.now()), Date.now());
  return [...a.equipped, ...a.stash].some((e) => e.itemId === METEOR_ITEM_ID && isPermanentUntil(e.until));
};
// 판 시각(시험 시계)으로도 읽는다: 판 시각이 30분 단위로 내려 잡혀 확성기 보관 시간(지금 기준)을 넘길 수 있다
const notices = async (now = Date.now()) => JSON.stringify(await getMegaphone().recent(50, now));

describe("유성우 오라 (별자리 잇기 판 끝)", () => {
  it("맑은 밤이 아닌 판은 굴리지 않는다 (진행 그대로)", async () => {
    const v = await newVisitor();
    const r = await playStars(v, timeWhere(false), 2);
    expect(r.reward.meteor).toBeUndefined();
    expect(r.view.character.mt).toBeUndefined();
  });

  it("맑은 밤 판: 완성 별자리가 있어야 굴리고 (하루 수·천장 진행이 판 끝 저장에 같이), 없으면 안 굴린다", async () => {
    const v = await newVisitor();
    const night = timeWhere(true);
    const none = await playStars(v, night, 0);
    expect(none.reward.nightBonus).toBe(true);
    expect(none.view.character.mt).toBeUndefined();
    const r = await playStars(v, night + 200_000, 1);
    expect(r.view.character.mt).toMatchObject({ d: kstDay(night + 276_000), n: 1, p: 1 });
    expect((await getRpgStore().get(v.id))?.mt).toMatchObject({ n: 1, p: 1 });
  });

  it("떨어지면 영구로 받고 마을 알림 한 번, 받은 뒤에는 더 굴리지 않는다", async () => {
    const v = await newVisitor();
    setMeteorForced(v.id, true);
    try {
      const at = timeWhere(false);
      const r = await playStars(v, at, 1);
      expect(r.reward.meteor).toBe(true);
      expect(r.view.character.mt?.got).toBeGreaterThan(0);
      expect(await permanentMeteor(v.id)).toBe(true);
      const name = (await getAccounts().get(v.id, kstDay(Date.now()), Date.now())).name ?? "누군가";
      expect(await notices(at + 76_000)).toContain(`${name}님이 별자리 잇기에서 「유성우 오라」를 주웠어요!`);
      const again = await playStars(v, timeWhere(false) + 300_000, 1);
      expect(again.reward.meteor).toBeUndefined();
      expect(again.view.character.mt).toEqual(r.view.character.mt);
    } finally {
      setMeteorForced(v.id, false);
    }
  });

  it("지급이 실패하면 알림 없이 받은 표시를 지우고 다음 굴림을 확정으로 둔다", async () => {
    const v = await newVisitor();
    setMeteorForced(v.id, true);
    grantFail.on = true;
    const before = await notices();
    try {
      const r = await playStars(v, timeWhere(false), 1);
      expect(r.reward.meteor).toBeUndefined();
      expect(r.view.character.mt?.got).toBeUndefined();
      expect(r.view.character.mt?.p).toBe(METEOR_PITY - 1);
      expect(await permanentMeteor(v.id)).toBe(false);
      expect((await notices()).split("유성우 오라").length).toBe(before.split("유성우 오라").length);
    } finally {
      setMeteorForced(v.id, false);
    }
  });

  it("운영자 계정은 받아도 알림 없이 조용히", async () => {
    const op = await newVisitor();
    await setStaff(op.id);
    setMeteorForced(op.id, true);
    const before = await notices();
    try {
      const r = await playStars(op, timeWhere(false), 1);
      expect(r.reward.meteor).toBe(true);
      expect(await permanentMeteor(op.id)).toBe(true);
      expect((await notices()).split("유성우 오라").length).toBe(before.split("유성우 오라").length);
    } finally {
      setMeteorForced(op.id, false);
      await setStaff(null);
    }
  });

  it("개발용 경로는 운영에서 404, 운영에서는 켜 둔 값도 무시한다", async () => {
    const v = await newVisitor();
    const ok = await devMeteor.POST(call("/api/dev/meteor", v, { force: true }));
    expect(ok.status).toBe(200);
    expect(meteorForced(v.id)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(meteorForced(v.id)).toBe(false);
      const res = await devMeteor.POST(call("/api/dev/meteor", v, { force: true }));
      expect(res.status).toBe(404);
    } finally {
      vi.stubEnv("NODE_ENV", "test");
      setMeteorForced(v.id, false);
    }
  });
});
