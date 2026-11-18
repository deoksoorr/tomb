import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { banIpHash } from "@/lib/ban";
import { decisionText, kstMonth, normalizeRefCode, REF_GRAND_MONTH_CAP, type RefDecision, randomRefCode, REF_GIFT_FROM, REF_MONTH_CAP, type RefCheckResponse, type ReferralView } from "@/lib/referralRules";
import { ensureReferralCode, referralOnPresence } from "@/lib/referralService";
import { recordSignals } from "@/lib/sameUser";
import { setStaff } from "@/lib/staff";
import { getAccounts, getGifts } from "@/lib/store";
import { addDays, gameDay } from "@/lib/gameDay";
import { getBanStore } from "@/lib/store/bans";
import { getReferrals, MemoryReferrals } from "@/lib/store/referrals";
import { getActivity, MemoryActivity } from "@/lib/store/userActivity";
import * as presence from "./me/presence/route";
import { forgetTitles, titleStatus } from "@/lib/titlesServer";
import { earnedTitleIds } from "@/lib/titles";
import type { ApiError } from "@/lib/types";
import * as adminRefs from "./admin/referrals/route";
import * as attend from "./me/attend/route";
import * as referral from "./referral/route";
import * as check from "./referral/check/route";
import * as session from "./session/route";

// 추천 코드: 코드 만들기 · 추천인 정하기 규칙 · 조건 달성(한 번만) · 한 달 상한 · 칭호 · 같은 곳 가입 · 자동 보상 끄기 (메모리 저장소만)
/** 2026-11-12 12:00 KST */
const NOON = Date.UTC(2026, 10, 12, 3, 0);
const DAY = 86_400_000;

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "REALTIME_HTTP_URL"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
// 아래 시험 대부분은 「자동」 방식의 규칙을 본다 (「모두 확인」·「끔」은 따로)
beforeEach(async () => {
  await getReferrals().setMode("auto");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Visitor = { cookie: string; ip: string; id: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; admin?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.admin) Object.assign(headers, { "x-admin-key": "dev-admin", "x-forwarded-for": "127.0.0.1" });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errOf = async (res: Response | Promise<Response>) => {
  const r = await res;
  return { status: r.status, code: ((await r.json()) as ApiError).error.code };
};
async function newVisitor(name: string, ip?: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  ipSeq++;
  // 계정마다 다른 대역 (같은 대역·무리 신호가 우연히 걸리지 않게)
  const v = { cookie, ip: ip ?? `10.${10 + Math.floor(ipSeq / 250)}.${ipSeq % 250}.1`, id: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
  // 입장(/api/join)처럼 접속 IP(해시)를 남긴다 (같은 곳 가입 판정)
  await getBanStore().seen(v.id, banIpHash(v.ip)!, Date.now(), false);
  return v;
}
const view = (v: Visitor) => bodyOf<ReferralView>(referral.GET(call("/api/referral", { visitor: v })));
const codeOf = async (v: Visitor) => (await view(v)).code!;
const enter = (v: Visitor, code: string) => referral.POST(call("/api/referral", { visitor: v, body: { code, via: "signup" } }));
/** 조건(11/18 하루 1시간 넘게 머문 날 3일)을 채운다. minutes = 총 머문 분(표시용) */
async function fill(v: Visitor, minutes = 180, days = 3) {
  (getAccounts() as unknown as { accts: Map<string, { stayMin?: number }> }).accts.get(v.id)!.stayMin = minutes;
  const today = gameDay(Date.now());
  const list = Array.from({ length: days }, (_, i) => [v.id, addDays(today, -i)] as const);
  await getActivity().record(list);
  await getActivity().recordHour(list);
}
const refGifts = async (v: Visitor) =>
  (await getGifts().inbox(v.id, 0, Date.now())).filter((g) => g.from === REF_GIFT_FROM);

describe("추천 코드 만들기", () => {
  it("계정마다 하나, 다시 불러도 같고, 다른 계정과 겹치지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const a = await newVisitor("코드하나");
    const b = await newVisitor("코드둘");
    const ca = await codeOf(a);
    expect(normalizeRefCode(ca)).toBe(ca);
    expect(await codeOf(a)).toBe(ca);
    expect(await codeOf(b)).not.toBe(ca);
    expect(await getReferrals().ownerOf(ca)).toBe(a.id);
  });

  it("후보가 이미 다른 계정 것이면 다른 후보로 다시 정한다", async () => {
    const a = await newVisitor("겹침하나");
    const taken = await codeOf(a);
    // 첫 후보 = 이미 있는 코드, 그다음 후보 = 새 코드
    const fresh = randomRefCode(() => 0.5);
    const seq = [...taken, ...fresh].map((ch) => ("ABCDEFGHJKMNPQRSTUVWXYZ23456789".indexOf(ch) + 0.5) / 31);
    vi.spyOn(Math, "random").mockImplementation(() => seq.shift() ?? 0.1);
    const b = await newVisitor("겹침둘");
    const cb = await ensureReferralCode(b.id);
    expect(cb).toBe(fresh);
    expect(cb).not.toBe(taken);
    const mem = new MemoryReferrals();
    expect(await mem.ensureCode("x", "AAAAAA")).toBe("AAAAAA");
    expect(await mem.ensureCode("y", "AAAAAA")).toBeNull();
    expect(await mem.ensureCode("x", "BBBBBB")).toBe("AAAAAA");
  });

  it("운영자 계정은 코드가 없다", async () => {
    const op = await newVisitor("추천운영자");
    await setStaff(op.id);
    expect((await view(op)).code).toBeNull();
  });
});

describe("추천인 정하기 규칙", () => {
  it("미리 확인: 있는 코드면 추천인 이름, 내 코드·없는 코드·형식이 틀리면 이유", async () => {
    const a = await newVisitor("확인추천인");
    const b = await newVisitor("확인새이웃");
    const code = await codeOf(a);
    const ask = (v: Visitor, c: string) => bodyOf<RefCheckResponse>(check.GET(call(`/api/referral/check?code=${encodeURIComponent(c)}`, { visitor: v })));
    expect(await ask(b, code.toLowerCase())).toEqual({ ok: true, code, name: "확인추천인" });
    expect(await ask(a, code)).toMatchObject({ ok: false, reason: "내 코드는 넣을 수 없어요." });
    expect(await ask(b, "ZZZZZZ")).toMatchObject({ ok: false });
    expect(await ask(b, "abc")).toMatchObject({ ok: false });
  });

  it("한 번만 정하고 바꿀 수 없다, 내 코드는 안 된다", async () => {
    const a = await newVisitor("한번추천인");
    const a2 = await newVisitor("두번추천인");
    const b = await newVisitor("한번새이웃");
    expect(await errOf(enter(a, await codeOf(a)))).toEqual({ status: 409, code: "SELF" });
    const ok = await bodyOf<ReferralView>(enter(b, await codeOf(a)));
    expect(ok.mine).toMatchObject({ referrerName: "한번추천인", qualified: false });
    expect(ok.enterUntil).toBeNull();
    expect(await errOf(enter(b, await codeOf(a2)))).toEqual({ status: 409, code: "ALREADY" });
    expect((await view(a)).joined).toBe(1);
  });

  it("내가 데려온 이웃의 코드는 넣을 수 없다 (둘이 서로 추천 금지)", async () => {
    const a = await newVisitor("순환추천인");
    const b = await newVisitor("순환새이웃");
    await enter(b, await codeOf(a));
    expect(await errOf(enter(a, await codeOf(b)))).toEqual({ status: 409, code: "CYCLE" });
  });

  it("운영자는 추천인도 새 이웃도 될 수 없다", async () => {
    const a = await newVisitor("운영추천인");
    const code = await codeOf(a);
    const op = await newVisitor("운영새이웃");
    await setStaff(op.id);
    expect(await errOf(enter(op, code))).toEqual({ status: 403, code: "STAFF" });
    await setStaff(a.id);
    const b = await newVisitor("운영코드받는이");
    expect(await errOf(enter(b, code))).toEqual({ status: 404, code: "NO_CODE" });
  });

  it("가입하고 3일 안에만 정할 수 있다", async () => {
    const t0 = NOON + 10 * DAY;
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    const a = await newVisitor("기한추천인");
    const late = await newVisitor("늦은새이웃");
    const early = await newVisitor("이른새이웃");
    const code = await codeOf(a);
    now.mockReturnValue(t0 + 2 * DAY);
    expect((await view(early)).enterUntil).toBe(t0 + 3 * DAY);
    expect((await enter(early, code)).status).toBe(200);
    now.mockReturnValue(t0 + 3 * DAY + 1);
    expect((await view(late)).enterUntil).toBeNull();
    expect(await errOf(enter(late, code))).toEqual({ status: 409, code: "TOO_LATE" });
  });
});

describe("조건 달성과 보상", () => {
  it("조건을 넘기면 한 번만 달성하고 둘 다 300P 선물을 받는다", async () => {
    const a = await newVisitor("달성추천인");
    const b = await newVisitor("달성새이웃");
    await enter(b, await codeOf(a));
    // 조건 전: 진행만
    await fill(b, 80, 2);
    await referralOnPresence(b.id);
    const before = await view(b);
    expect(before.mine).toMatchObject({ stayMinutes: 80, days: 2, qualified: false });
    expect(await refGifts(b)).toHaveLength(0);
    // 조건을 넘긴 뒤 동시에 여러 번 불러도 한 번만
    await fill(b);
    await Promise.all([referralOnPresence(b.id), referralOnPresence(b.id), view(b), view(a)]);
    await referralOnPresence(b.id);
    expect(await refGifts(b)).toHaveLength(1);
    expect(await refGifts(a)).toHaveLength(1);
    expect((await refGifts(b))[0]).toMatchObject({ points: 300, note: "추천으로 온 이웃 환영 선물이에요." });
    const va = await view(a);
    expect(va).toMatchObject({ joined: 1, qualified: 1, rewarded: 1, pointsEarned: 300 });
    expect((await view(b)).mine).toMatchObject({ qualified: true, rewarded: true });
    expect((await view(b)).pointsEarned).toBe(300);
  });

  it("추천인 포인트는 한 달에 5명까지, 다음 달에는 다시 받는다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(NOON);
    const a = await newVisitor("상한추천인");
    const code = await codeOf(a);
    const kids: Visitor[] = [];
    for (let i = 0; i < REF_MONTH_CAP + 2; i++) {
      const k = await newVisitor(`상한이웃${i}`);
      await enter(k, code);
      kids.push(k);
    }
    for (const k of kids.slice(0, REF_MONTH_CAP + 1)) {
      await fill(k);
      await referralOnPresence(k.id);
    }
    expect(await refGifts(a)).toHaveLength(REF_MONTH_CAP);
    // 새 이웃은 상한과 상관없이 모두 받는다
    for (const k of kids.slice(0, REF_MONTH_CAP + 1)) expect(await refGifts(k)).toHaveLength(1);
    expect(await view(a)).toMatchObject({ qualified: REF_MONTH_CAP + 1, rewarded: REF_MONTH_CAP, monthRewarded: REF_MONTH_CAP });
    // 다음 달 (한국 시간 달력)
    now.mockReturnValue(Date.UTC(2026, 11, 1, 0, 0));
    expect(kstMonth(Date.now())).toBe("202612");
    const last = kids[REF_MONTH_CAP + 1];
    await fill(last);
    await referralOnPresence(last.id);
    expect(await refGifts(a)).toHaveLength(REF_MONTH_CAP + 1);
    expect(await view(a)).toMatchObject({ rewarded: REF_MONTH_CAP + 1, monthRewarded: 1 });
  });

  it("조건을 넘긴 이웃 3명이면 「마을 안내인」, 10명이면 「마을의 마당발」", async () => {
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { refs: 3 } })).toContain("t_ref3");
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { refs: 9 } })).not.toContain("t_ref10");
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { refs: 10 } })).toEqual(expect.arrayContaining(["t_ref3", "t_ref10"]));
    const a = await newVisitor("칭호추천인");
    const code = await codeOf(a);
    expect((await view(a)).next).toEqual({ title: "마을 안내인", need: 3, count: 0 });
    for (let i = 0; i < 3; i++) {
      const k = await newVisitor(`칭호이웃${i}`);
      await enter(k, code);
      await fill(k);
      await referralOnPresence(k.id);
    }
    forgetTitles(a.id);
    const st = await titleStatus(a.id);
    expect(st.earned).toContain("t_ref3");
    expect(st.earned).not.toContain("t_ref10");
    expect(st.progress.refs).toBe(3);
    expect((await view(a)).next).toEqual({ title: "마을의 마당발", need: 10, count: 3 });
  });

  it("확인 필요(같은 IP)면 보상을 보류하고, 관리자가 승인하면 양쪽에 보내고 칭호에 센다", async () => {
    const a = await newVisitor("같은곳추천인", "10.77.0.1");
    const b = await newVisitor("같은곳새이웃", "10.77.0.1");
    await enter(b, await codeOf(a));
    const linked = await getReferrals().get(b.id);
    expect(linked?.reasons).toContain("ipSignup");
    expect(linked?.same).toBe(false);
    await fill(b);
    await referralOnPresence(b.id);
    expect(await getReferrals().get(b.id)).toMatchObject({ hold: 1 });
    expect((await getReferrals().get(b.id))?.qualifiedAt).toBeGreaterThan(0);
    expect(await refGifts(a)).toHaveLength(0);
    expect(await refGifts(b)).toHaveLength(0);
    expect((await view(b)).mine).toMatchObject({ qualified: true, rewarded: false, held: true });
    expect(await getReferrals().credited(a.id)).toBe(0);
    const before = await bodyOf<{ totals: { held: number }; recent: { refereeId: string; level: string; score: number; hold: number }[] }>(
      adminRefs.GET(call("/api/admin/referrals", { admin: true })),
    );
    expect(before.recent.find((r) => r.refereeId === b.id)).toMatchObject({ level: "review", score: 50, hold: 1 });
    const held = before.totals.held;
    await adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeId: b.id, approve: true } }));
    expect(await refGifts(a)).toHaveLength(1);
    expect(await refGifts(b)).toHaveLength(1);
    expect(await getReferrals().credited(a.id)).toBe(1);
    expect(await getReferrals().get(b.id)).toMatchObject({ hold: 2, refereePaid: true, referrerPaid: true });
    // 두 번 승인할 수 없다
    expect(await errOf(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeId: b.id, approve: true } })))).toEqual({ status: 409, code: "NOT_HELD" });
    expect((await getReferrals().totals()).held).toBe(held - 1);
  });

  it("가입 뒤에 같은 IP로 들어와도 달성 때 다시 보고, 거절하면 보상 없이 끝난다", async () => {
    const c = await newVisitor("나중같은곳추천인", "10.78.0.1");
    const d = await newVisitor("나중같은곳새이웃", "10.78.1.2");
    await enter(d, await codeOf(c));
    expect((await getReferrals().get(d.id))?.reasons).toEqual([]);
    await getBanStore().seen(d.id, banIpHash("10.78.0.1")!, Date.now(), false);
    await fill(d);
    await referralOnPresence(d.id);
    expect(await getReferrals().get(d.id)).toMatchObject({ hold: 1, reasons: ["ip"] });
    const denied = (await getReferrals().totals()).denied;
    await adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeId: d.id, approve: false } }));
    expect(await getReferrals().get(d.id)).toMatchObject({ hold: 3, refereePaid: false, referrerPaid: false });
    expect(await refGifts(c)).toHaveLength(0);
    expect(await refGifts(d)).toHaveLength(0);
    expect(await getReferrals().credited(c.id)).toBe(0);
    expect((await getReferrals().totals()).denied).toBe(denied + 1);
  });

  it("같은 사람 같음(같은 기기)이면 보상·칭호 수 없이 달성만 남는다", async () => {
    const a = await newVisitor("같은기기추천인");
    const b = await newVisitor("같은기기새이웃");
    // 같은 기기 표시 쿠키로 두 계정이 세션을 받았다 (「새로 시작」)
    for (const v of [a, b]) await recordSignals(call("/api/session", { visitor: { ...v, cookie: `${v.cookie}; tdev=shared-device-0001` } }), v.id);
    await enter(b, await codeOf(a));
    expect(await getReferrals().get(b.id)).toMatchObject({ same: true, reasons: ["dev"] });
    await fill(b);
    await referralOnPresence(b.id);
    expect(await getReferrals().get(b.id)).toMatchObject({ hold: 0, refereePaid: false });
    expect((await getReferrals().get(b.id))?.qualifiedAt).toBeGreaterThan(0);
    expect(await refGifts(a)).toHaveLength(0);
    expect(await getReferrals().credited(a.id)).toBe(0);
  });

  it("「끔」이면 달성만 기록하고 선물은 보내지 않는다 (관리자 목록에 보인다)", async () => {
    const off = await bodyOf<{ mode: string }>(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { mode: "off" } })));
    expect(off.mode).toBe("off");
    {
      const a = await newVisitor("끔추천인");
      const b = await newVisitor("끔새이웃");
      await enter(b, await codeOf(a));
      await fill(b);
      await referralOnPresence(b.id);
      expect(await refGifts(a)).toHaveLength(0);
      expect(await refGifts(b)).toHaveLength(0);
      expect(await view(a)).toMatchObject({ qualified: 1, rewarded: 0 });
      // 칭호 수는 자동 보상과 상관없이 센다
      expect(await getReferrals().credited(a.id)).toBe(1);
      const admin = await bodyOf<{ recent: { refereeId: string; qualifiedAt: number; refereePaid: boolean }[] }>(
        adminRefs.GET(call("/api/admin/referrals", { admin: true })),
      );
      expect(admin.recent.find((r) => r.refereeId === b.id)).toMatchObject({ refereePaid: false });
      expect(admin.recent.find((r) => r.refereeId === b.id)?.qualifiedAt).toBeGreaterThan(0);
      expect(await getReferrals().get(b.id)).toMatchObject({ hold: 0 });
    }
  });

  it("「모두 확인」(기본)이면 점수와 상관없이 모두 기다리고, 오래된 것 먼저 보이고, 고른 것을 한꺼번에 승인한다", async () => {
    // 처음 상태(설정 없음)는 「모두 확인」
    expect(await new MemoryReferrals().mode()).toBe("review");
    await adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { mode: "review" } }));
    const now = vi.spyOn(Date, "now").mockReturnValue(NOON);
    const a = await newVisitor("확인추천인2");
    const kids: Visitor[] = [];
    for (let i = 0; i < 3; i++) {
      const k = await newVisitor(`확인이웃${i}`);
      await enter(k, await codeOf(a));
      kids.push(k);
    }
    // 의심 없음인데도 기다린다 (조건 달성 순서: 2 → 0 → 1)
    for (const [i, k] of [kids[2], kids[0], kids[1]].entries()) {
      now.mockReturnValue(NOON + (i + 1) * 60_000);
      await fill(k);
      await referralOnPresence(k.id);
    }
    for (const k of kids) expect(await getReferrals().get(k.id)).toMatchObject({ hold: 1, reasons: [] });
    expect(await refGifts(a)).toHaveLength(0);
    expect(await getReferrals().credited(a.id)).toBe(0);
    expect((await view(kids[0])).mine).toMatchObject({ qualified: true, held: true, rewarded: false });
    type Admin = { mode: string; decision?: RefDecision; held: { refereeId: string; level: string }[] };
    const before = await bodyOf<Admin>(adminRefs.GET(call("/api/admin/referrals", { admin: true })));
    expect(before.mode).toBe("review");
    const mine = before.held.filter((r) => kids.some((k) => k.id === r.refereeId)).map((r) => r.refereeId);
    expect(mine).toEqual([kids[2].id, kids[0].id, kids[1].id]);
    expect(before.held.find((r) => r.refereeId === kids[0].id)?.level).toBe("clear");
    // 고른 둘을 한꺼번에 승인, 이미 처리한 것·없는 것은 건너뛴다
    const done = await bodyOf<Admin>(
      adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeIds: [kids[2].id, kids[0].id, "nobody-here"], approve: true } })),
    );
    expect(done.decision).toMatchObject({ decided: 2, both: 2, refereeOnly: 0, denied: 0 });
    expect(decisionText(done.decision)).toBe("2건을 승인했어요. 2건은 두 사람에게 300P씩 보냈어요.");
    expect(done.held.some((r) => r.refereeId === kids[0].id)).toBe(false);
    expect(await refGifts(kids[0])).toHaveLength(1);
    expect(await refGifts(kids[2])).toHaveLength(1);
    expect(await refGifts(a)).toHaveLength(2);
    expect(await getReferrals().credited(a.id)).toBe(2);
    const denied = await bodyOf<Admin>(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeIds: [kids[1].id], approve: false } })));
    expect(denied.decision).toMatchObject({ decided: 1, denied: 1 });
    expect(decisionText(denied.decision)).toBe("보상을 거절했어요.");
    expect(await refGifts(kids[1])).toHaveLength(0);
    expect(await getReferrals().get(kids[1].id)).toMatchObject({ hold: 3 });
    expect(await getReferrals().credited(a.id)).toBe(2);
  });

  it("추천인이 이번 달 보상을 다 받았으면 기다림 줄에 표시하고, 승인하면 새 이웃만 받는다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(NOON);
    const a = await newVisitor("상한확인추천인");
    const code = await codeOf(a);
    // 「자동」으로 이번 달 5명을 채운다
    for (let i = 0; i < REF_MONTH_CAP; i++) {
      const k = await newVisitor(`상한확인이웃${i}`);
      await enter(k, code);
      await fill(k);
      await referralOnPresence(k.id);
    }
    expect(await refGifts(a)).toHaveLength(REF_MONTH_CAP);
    await getReferrals().setMode("review");
    const late = await newVisitor("상한확인늦은이");
    const other = await newVisitor("상한아님새이웃");
    const freshRef = await newVisitor("상한아님추천인");
    await enter(late, code);
    await enter(other, await codeOf(freshRef));
    for (const k of [late, other]) {
      await fill(k);
      await referralOnPresence(k.id);
    }
    type Row = { refereeId: string; referrerCapped: boolean };
    const v = await bodyOf<{ held: Row[] }>(adminRefs.GET(call("/api/admin/referrals", { admin: true })));
    expect(v.held.find((r) => r.refereeId === late.id)?.referrerCapped).toBe(true);
    expect(v.held.find((r) => r.refereeId === other.id)?.referrerCapped).toBe(false);
    const one = await bodyOf<{ decision: RefDecision }>(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeId: late.id, approve: true } })));
    expect(one.decision).toMatchObject({ decided: 1, both: 0, refereeOnly: 1 });
    expect(decisionText(one.decision)).toBe("새 이웃에게만 300P를 보냈어요. 추천인은 이번 달 보상을 다 받았어요.");
    expect(await refGifts(late)).toHaveLength(1);
    expect(await refGifts(a)).toHaveLength(REF_MONTH_CAP);
    const two = await bodyOf<{ decision: RefDecision }>(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeIds: [other.id], approve: true } })));
    expect(decisionText(two.decision)).toBe("두 사람에게 300P씩 보냈어요.");
    expect(decisionText({ decided: 3, both: 2, refereeOnly: 1, denied: 0, points: 300, grand: 0, grandPoints: 100 })).toBe("3건을 승인했어요. 2건은 두 사람에게 300P씩, 1건은 새 이웃에게만 300P를 보냈어요.");
    now.mockRestore();
  });

  it("「모두 확인」이면 같은 사람 같음도 기다림에 올라 관리자가 정한다", async () => {
    await getReferrals().setMode("review");
    const a = await newVisitor("확인같은기기추천인");
    const b = await newVisitor("확인같은기기새이웃");
    for (const v of [a, b]) await recordSignals(call("/api/session", { visitor: { ...v, cookie: `${v.cookie}; tdev=shared-device-0002` } }), v.id);
    await enter(b, await codeOf(a));
    await fill(b);
    await referralOnPresence(b.id);
    expect(await getReferrals().get(b.id)).toMatchObject({ hold: 1, same: true });
    expect(await refGifts(b)).toHaveLength(0);
  });

  it("관리자 목록을 보면서 조건을 넘긴 이웃도 달성 처리한다", async () => {
    const a = await newVisitor("관리추천인");
    const b = await newVisitor("관리새이웃");
    await enter(b, await codeOf(a));
    await fill(b);
    const r = await bodyOf<{ recent: { refereeId: string; qualifiedAt: number; referrerName: string }[]; top: { accountId: string }[] }>(
      adminRefs.GET(call("/api/admin/referrals", { admin: true })),
    );
    expect(r.recent.find((x) => x.refereeId === b.id)).toMatchObject({ referrerName: "관리추천인" });
    expect(r.recent.find((x) => x.refereeId === b.id)?.qualifiedAt).toBeGreaterThan(0);
    expect(r.top.some((x) => x.accountId === a.id)).toBe(true);
    expect(await refGifts(b)).toHaveLength(1);
  });
});

describe("2단계 추천 (추천인의 추천인)", () => {
  /** g가 r을, r이 새 이웃들을 데려온다 */
  async function chain(tag: string, kids = 1) {
    const g = await newVisitor(`${tag}할머니`);
    const r = await newVisitor(`${tag}엄마`);
    await enter(r, await codeOf(g));
    const code = await codeOf(r);
    const es: Visitor[] = [];
    for (let i = 0; i < kids; i++) {
      const e = await newVisitor(`${tag}아이${i}`);
      await enter(e, code);
      es.push(e);
    }
    return { g, r, es };
  }
  const qualify = async (v: Visitor) => {
    await fill(v);
    await referralOnPresence(v.id);
  };
  const approve = (ids: string[]) =>
    bodyOf<{ decision: RefDecision }>(adminRefs.POST(call("/api/admin/referrals", { admin: true, body: { refereeIds: ids, approve: true } })));

  it("「모두 확인」이면 승인할 때 추천인의 추천인도 100P를 받고, 칭호에는 세지 않는다", async () => {
    await getReferrals().setMode("review");
    const { g, r, es } = await chain("승인2단");
    const [e] = es;
    expect((await getReferrals().get(e.id))?.grandId).toBe(g.id);
    await qualify(e);
    expect(await refGifts(g)).toHaveLength(0);
    const d = await approve([e.id]);
    expect(d.decision).toMatchObject({ decided: 1, both: 1, grand: 1, grandPoints: 100 });
    expect(decisionText(d.decision)).toBe("두 사람에게 300P씩 보냈어요. 추천인의 추천인에게도 100P를 보냈어요.");
    const [gift] = await refGifts(g);
    expect(gift).toMatchObject({ points: 100, note: "승인2단엄마님이 데려온 이웃 승인2단아이0님이 마을에 자리를 잡았어요." });
    expect(await getReferrals().get(e.id)).toMatchObject({ grand: "paid" });
    expect(await getReferrals().credited(g.id)).toBe(0);
    expect(await getReferrals().credited(r.id)).toBe(1);
    expect(await view(g)).toMatchObject({ second: { joined: 1, points: 100 }, pointsEarned: 100, qualified: 0 });
  });

  it("「자동」은 점수 관문을 따르고, 「끔」은 기록만 한다", async () => {
    const auto = await chain("자동2단");
    await qualify(auto.es[0]);
    expect(await refGifts(auto.g)).toHaveLength(1);
    await getReferrals().setMode("off");
    const off = await chain("끔2단");
    await qualify(off.es[0]);
    expect(await refGifts(off.g)).toHaveLength(0);
    expect(await getReferrals().get(off.es[0].id)).toMatchObject({ grand: "", hold: 0 });
    // 「자동」에서 확인 필요(같은 IP)면 기다리고, 승인 때 함께 보낸다
    await getReferrals().setMode("auto");
    const g = await newVisitor("관문2단할머니");
    const r = await newVisitor("관문2단엄마", "10.90.0.1");
    await enter(r, await codeOf(g));
    const e = await newVisitor("관문2단아이", "10.90.0.1");
    await enter(e, await codeOf(r));
    await qualify(e);
    expect(await getReferrals().get(e.id)).toMatchObject({ hold: 1, grand: "" });
    expect(await refGifts(g)).toHaveLength(0);
    expect((await approve([e.id])).decision).toMatchObject({ grand: 1 });
    expect(await refGifts(g)).toHaveLength(1);
  });

  it("추천인의 추천인은 한 달에 10번까지 (2단계 상한은 추천인 상한과 따로)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const { g, es } = await chain("상한2단", REF_GRAND_MONTH_CAP + 1);
    for (const e of es) await qualify(e);
    expect(await refGifts(g)).toHaveLength(REF_GRAND_MONTH_CAP);
    expect(await getReferrals().get(es[REF_GRAND_MONTH_CAP].id)).toMatchObject({ grand: "cap" });
    expect(await view(g)).toMatchObject({ second: { joined: REF_GRAND_MONTH_CAP + 1, points: REF_GRAND_MONTH_CAP * 100 } });
  });

  it("3단계는 없다: 새 이웃의 추천인의 추천인까지만 받는다", async () => {
    const { g, r, es } = await chain("세대2단");
    const e = es[0];
    const f = await newVisitor("세대2단손주");
    await enter(f, await codeOf(e));
    expect((await getReferrals().get(f.id))?.grandId).toBe(r.id);
    await qualify(e);
    const before = (await refGifts(g)).length;
    await qualify(f);
    expect(await refGifts(g)).toHaveLength(before);
    expect((await refGifts(r)).filter((x) => x.points === 100)).toHaveLength(1);
    expect(await view(g)).toMatchObject({ second: { joined: 1 } });
  });

  it("운영자이거나 같은 사람 같으면 건너뛰고 이유를 남긴다", async () => {
    const st = await chain("운영2단");
    await setStaff(st.g.id);
    await qualify(st.es[0]);
    expect(await getReferrals().get(st.es[0].id)).toMatchObject({ grand: "skip:staff", refereePaid: true });
    expect(await refGifts(st.g)).toHaveLength(0);
    await setStaff(null);
    const same = await chain("기기2단");
    // 할머니와 아이가 같은 기기
    for (const v of [same.g, same.es[0]]) await recordSignals(call("/api/session", { visitor: { ...v, cookie: `${v.cookie}; tdev=grand-device-000001` } }), v.id);
    await qualify(same.es[0]);
    expect(await getReferrals().get(same.es[0].id)).toMatchObject({ grand: "skip:sameReferee", refereePaid: true, referrerPaid: true });
    expect(await refGifts(same.g)).toHaveLength(0);
    const admin = await bodyOf<{ recent: { refereeId: string; grandName: string; grand: string }[] }>(adminRefs.GET(call("/api/admin/referrals", { admin: true })));
    expect(admin.recent.find((x) => x.refereeId === same.es[0].id)).toMatchObject({ grandName: "기기2단할머니", grand: "skip:sameReferee" });
  });
});

describe("11/18 자리 잡기 = 하루 1시간 넘게 머문 날 3일", () => {
  const g = globalThis as typeof globalThis & { __tombActivity?: unknown };
  let saved: unknown;
  const today = () => gameDay(Date.now());
  beforeEach(async () => {
    // 이 묶음은 활동 기록을 새로 (1시간 기록 시작일을 오래전으로 두어 옛 기준 날이 끼지 않게)
    saved = g.__tombActivity;
    g.__tombActivity = new MemoryActivity();
    await getActivity().recordHour([["__seed", addDays(today(), -30)]]);
  });
  afterEach(() => {
    g.__tombActivity = saved;
  });

  it("머무르기 기록이 오늘 1시간을 넘기는 순간에만 그날을 센다 (59분은 아니다)", async () => {
    const v = await newVisitor("한시간이웃");
    // 머무르기 요청 한도를 넘지 않게 기록마다 10분씩 시계를 옮긴다
    let t0 = NOON;
    vi.useFakeTimers({ toFake: ["Date"] });
    const step = () => vi.setSystemTime((t0 += 10 * 60_000));
    const tick = (stayTicks: number) =>
      vi.spyOn(getAccounts(), "presenceTick").mockResolvedValueOnce({ earned: 0, ticks: 1, points: 0, lifetimePoints: 0, todayEarned: 0, stayTicks });
    for (const t of [4, 5]) {
      step();
      tick(t);
      await presence.POST(call("/api/me/presence", { method: "POST", visitor: v }));
    }
    expect((await getActivity().hourDays([v.id]))[0]).toBe(0);
    for (const t of [6, 7, 8]) {
      step();
      tick(t);
      const r = await presence.POST(call("/api/me/presence", { method: "POST", visitor: v }));
      expect(r.status).toBe(200);
    }
    expect((await getActivity().hourDays([v.id]))[0]).toBe(1);
    vi.useRealTimers();
  });

  it("59분씩 5일은 미달, 1시간 넘긴 날이 띄엄띄엄 3일이면 달성", async () => {
    const a = await newVisitor("띄엄추천인");
    const b = await newVisitor("띄엄새이웃");
    await enter(b, await codeOf(a));
    // 59분씩 5일: 들어온 날만 있고 1시간 넘긴 날은 없다
    await getActivity().record(Array.from({ length: 5 }, (_, i) => [b.id, addDays(today(), -i)] as const));
    await referralOnPresence(b.id);
    expect((await view(b)).mine).toMatchObject({ days: 0, qualified: false });
    // 1시간 넘긴 날 오늘·사흘 전·엿새 전
    await getActivity().recordHour([0, 3, 6].map((n) => [b.id, addDays(today(), -n)] as const));
    await referralOnPresence(b.id, Date.now() + 3_600_000);
    expect((await view(b)).mine).toMatchObject({ days: 3, qualified: true });
    expect(await refGifts(b)).toHaveLength(1);
  });

  it("하루 3시간을 한 번 머문 건 1일로만 센다", async () => {
    const a = await newVisitor("하루추천인");
    const b = await newVisitor("하루새이웃");
    await enter(b, await codeOf(a));
    // 같은 날 여러 번 넘겨도 한 번
    await getActivity().recordHour([[b.id, today()], [b.id, today()]]);
    await getActivity().recordHour([[b.id, today()]]);
    await referralOnPresence(b.id);
    expect((await view(b)).mine).toMatchObject({ days: 1, qualified: false });
  });

  it("옛 기록: 1시간 기록이 시작되기 전에 들어온 날은 너그럽게 세고, 하루 기록이 남은 어제는 실제 머문 시간으로 본다", async () => {
    const a = await newVisitor("옛추천인");
    const b = await newVisitor("옛새이웃");
    await enter(b, await codeOf(a));
    // 닷새 전에 추천인을 정했고, 1시간 기록은 어제부터 시작했다
    const rec = (getReferrals() as unknown as { recs: Map<string, { at: number }> }).recs.get(b.id)!;
    rec.at = Date.now() - 5 * DAY;
    g.__tombActivity = new MemoryActivity();
    await getActivity().recordHour([["__seed", addDays(today(), -1)]]);
    // 옛 기준으로 들어온 날: 나흘 전·이틀 전 (하루 기록이 없다 → 너그럽게), 어제 (하루 기록 0분 → 안 센다)
    await getActivity().record([-4, -2, -1].map((n) => [b.id, addDays(today(), n)] as const));
    await referralOnPresence(b.id);
    expect((await view(b)).mine).toMatchObject({ days: 2, qualified: false });
    // 오늘 1시간 넘김 → 2 + 1 = 3일
    await getActivity().recordHour([[b.id, today()]]);
    await referralOnPresence(b.id, Date.now() + 3_600_000);
    expect((await view(b)).mine).toMatchObject({ days: 3, qualified: true });
    // 관리자 목록에 옛 기준 날과 어제·오늘 머문 분이 보인다
    const list = await bodyOf<{ recent: { refereeId: string; days: number; legacyDays: number; hourDays: number; recent: { day: string; min: number }[]; meetsRule: boolean }[] }>(
      adminRefs.GET(call("/api/admin/referrals", { admin: true })),
    );
    const row = list.recent.find((r) => r.refereeId === b.id)!;
    expect(row).toMatchObject({ days: 3, legacyDays: 2, hourDays: 1, meetsRule: true });
    expect(row.recent.map((x) => x.day)).toEqual([addDays(today(), -1), today()]);
  });
});
