import { MANAGER_TITLE_ID, titleOfLook, verifyGrant, verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetManagers, getManagerStore, isManager } from "@/lib/managers";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { lookOf } from "@/lib/store/accounts";
import { headTitle, MANAGER_TITLE, titleDef, titlePerk, TITLES } from "@/lib/titles";
import { forgetTitles, titleStatus } from "@/lib/titlesServer";
import { readChatLog } from "@/game/logic/chatLog";
import type { JoinResponse, LookGrantResponse, Me, MegaphoneEntry, TitlesResponse, WearResponse } from "@/lib/types";
import type { AdminManagersResponse } from "./admin/managers/route";
import * as adminManagers from "./admin/managers/route";
import * as join from "./join/route";
import * as myLook from "./me/look/route";
import * as me from "./me/route";
import * as megaphone from "./megaphone/route";
import * as titles from "./me/titles/route";
import * as session from "./session/route";

// 11/16 매니저 임명 (관리자 API · 서명된 매니저 표시 · 매니저 전용 칭호) — 메모리 구성으로 라우트를 직접 부른다

const ADMIN = { "x-admin-key": "dev-admin" };
const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  // 로비·실시간 서버(/internal/me)는 무응답
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no realtime"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
  for (const m of await getManagerStore().list()) await getManagerStore().remove(m.accountId);
  forgetManagers();
  forgetTitles();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Chrome/130.0.0.0", ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const ip = `10.16.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const v = { cookie: res.headers.get("set-cookie")!.split(";")[0], ip, visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await getAccounts().enter(v.visitorId, { name: `반장${ipSeq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return v;
}
const setMgr = (accountId: string, on: boolean, headers: Record<string, string> = ADMIN) => adminManagers.POST(call("/api/admin/managers", { body: { accountId, on }, headers }));
const tokenOf = async (v: Visitor) => {
  const r = await bodyOf<JoinResponse>(join.POST(call("/api/join", { visitor: v, body: { channel: 1, name: "검수", color: "#9fc5a8" } })));
  if (r.mode !== "channel") throw new Error("채널 입장이 아님");
  return verifyJoinToken(SECRET, r.token);
};
const titlesOf = (v: Visitor) => bodyOf<TitlesResponse>(titles.GET(call("/api/me/titles", { visitor: v })));
const wear = (v: Visitor, id: string | null) => titles.POST(call("/api/me/titles", { visitor: v, body: { id } }));

describe("11/16 매니저 임명 (관리자 API)", () => {
  it("관리자만, 한 번이라도 들어온 계정만 임명한다. 여러 명을 임명하고 목록에 임명 날짜가 남는다", async () => {
    const a = await newVisitor();
    const b = await newVisitor();
    expect((await setMgr(a.visitorId, true, {})).status).toBe(401);
    expect((await adminManagers.GET(call("/api/admin/managers"))).status).toBe(401);
    expect((await setMgr("없는계정", true)).status).toBe(400);
    expect((await setMgr("nobody-here", true)).status).toBe(404);

    const before = Date.now();
    const r1 = await bodyOf<AdminManagersResponse>(setMgr(a.visitorId, true));
    const r2 = await bodyOf<AdminManagersResponse>(setMgr(b.visitorId, true));
    expect(r1.managers.map((m) => m.accountId)).toEqual([a.visitorId]);
    expect(r2.managers.map((m) => m.accountId).sort()).toEqual([a.visitorId, b.visitorId].sort());
    expect(r2.managers.every((m) => m.setAt >= before && m.name?.startsWith("반장"))).toBe(true);
    // 다시 임명해도 한 줄, 임명 날짜는 처음 그대로
    const again = await bodyOf<AdminManagersResponse>(setMgr(a.visitorId, true));
    expect(again.managers).toHaveLength(2);
    expect(again.managers.find((m) => m.accountId === a.visitorId)?.setAt).toBe(r1.managers[0].setAt);
    expect((await bodyOf<AdminManagersResponse>(adminManagers.GET(call("/api/admin/managers", { headers: ADMIN })))).managers).toHaveLength(2);

    // 해제하면 목록에서 빠진다 (매니저가 아니던 계정 해제도 오류 없이)
    const off = await bodyOf<AdminManagersResponse>(setMgr(a.visitorId, false));
    expect(off.managers.map((m) => m.accountId)).toEqual([b.visitorId]);
    expect((await setMgr(a.visitorId, false)).status).toBe(200);
    expect(await isManager(a.visitorId)).toBe(false);
    expect(await isManager(b.visitorId)).toBe(true);
  });

  it("임명·해제하면 접속 중인 화면에 '내 정보 새로 받기'를 보낸다 (/internal/me)", async () => {
    const a = await newVisitor();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ sent: 1 }));
    await setMgr(a.visitorId, true);
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("/internal/me"))).toBe(true));
  });
});

describe("11/16 서명된 매니저 표시", () => {
  it("입장 토큰·내 정보·착용 증서에 매니저 표시는 서버가 확인한 계정에만, 해제하면 바로 빠진다", async () => {
    const mgr = await newVisitor();
    const user = await newVisitor();
    await setMgr(mgr.visitorId, true);
    expect((await tokenOf(mgr))?.mgr).toBe(true);
    expect((await tokenOf(user))?.mgr).toBeUndefined();
    expect((await bodyOf<Me>(me.GET(call("/api/me", { visitor: mgr })))).manager).toBe(true);
    expect((await bodyOf<Me>(me.GET(call("/api/me", { visitor: user })))).manager).toBeUndefined();
    // 운영자 권한은 하나도 없다
    expect((await bodyOf<Me>(me.GET(call("/api/me", { visitor: mgr })))).staff).toBeUndefined();
    expect((await tokenOf(mgr))?.staff).toBeUndefined();

    const lookOn = await bodyOf<LookGrantResponse>(myLook.GET(call("/api/me/look", { visitor: mgr })));
    expect(lookOn.mgr).toBe(1);
    expect(await verifyGrant(SECRET, lookOn.lookGrant)).toMatchObject({ kind: "look", mgr: 1 });

    await setMgr(mgr.visitorId, false);
    expect((await tokenOf(mgr))?.mgr).toBeUndefined();
    const lookOff = await bodyOf<LookGrantResponse>(myLook.GET(call("/api/me/look", { visitor: mgr })));
    expect(lookOff.mgr).toBe(0);
    expect(await verifyGrant(SECRET, lookOff.lookGrant)).toMatchObject({ kind: "look", mgr: 0 });
  });
});

describe("11/16 매니저 전용 칭호", () => {
  it("이름·등급: 운영자 칭호와 다른 특별 등급, 칭호 능력 없음, 매니저 표시 없이는 머리 위에 뜨지 않는다", () => {
    const t = titleDef(MANAGER_TITLE_ID)!;
    expect(t).toMatchObject({ name: MANAGER_TITLE.name, grade: "manager", manager: true, transient: true });
    expect(titlePerk(MANAGER_TITLE_ID)).toEqual({ speed: 1, discount: 0 });
    expect(headTitle(MANAGER_TITLE_ID, false, true)).toBe(t);
    expect(headTitle(MANAGER_TITLE_ID, false, false)).toBeNull();
    expect(headTitle(MANAGER_TITLE_ID, true, true)).toBe("staff");
    expect(TITLES.filter((x) => x.manager)).toHaveLength(1);
  });

  it("매니저만 얻은 칭호로 보이고 낄 수 있다. 해제하면 끼고 있던 칭호도 빠지고 착용 증서에서도 사라진다", async () => {
    const mgr = await newVisitor();
    const user = await newVisitor();
    expect((await titlesOf(user)).earned).not.toContain(MANAGER_TITLE_ID);
    expect((await wear(user, MANAGER_TITLE_ID)).status).toBe(403);

    await setMgr(mgr.visitorId, true);
    expect((await titlesOf(mgr)).earned).toContain(MANAGER_TITLE_ID);
    const on = await bodyOf<WearResponse>(wear(mgr, MANAGER_TITLE_ID));
    expect(titleOfLook(lookOf(on.me))).toBe(MANAGER_TITLE_ID);
    expect(await verifyGrant(SECRET, on.lookGrant!)).toMatchObject({ look: [MANAGER_TITLE_ID], mgr: 1 });
    expect(titleOfLook((await tokenOf(mgr))?.look)).toBe(MANAGER_TITLE_ID);

    await setMgr(mgr.visitorId, false);
    const after = await bodyOf<Me>(me.GET(call("/api/me", { visitor: mgr })));
    expect(titleOfLook(lookOf(after))).toBeNull();
    expect((await titlesOf(mgr)).earned).not.toContain(MANAGER_TITLE_ID);
    expect((await wear(mgr, MANAGER_TITLE_ID)).status).toBe(403);
    expect(titleOfLook((await tokenOf(mgr))?.look)).toBeNull();
  });

  it("다른 인스턴스가 해제해 칭호가 남아 있어도: 칭호 상태를 볼 때 매니저가 아니면 뺀다 (신화 칭호 주인 확인과 같은 방식)", async () => {
    const mgr = await newVisitor();
    await setMgr(mgr.visitorId, true);
    await wear(mgr, MANAGER_TITLE_ID);
    // 관리자 API를 거치지 않고 저장소에서만 해제 (다른 서버 인스턴스가 해제한 것과 같다)
    await getManagerStore().remove(mgr.visitorId);
    forgetManagers();
    forgetTitles(mgr.visitorId);
    const st = await titleStatus(mgr.visitorId);
    expect(st.earned).not.toContain(MANAGER_TITLE_ID);
    expect(st.equipped).toBeNull();
    expect(titleOfLook(lookOf(await getAccounts().get(mgr.visitorId, "20000101", Date.now())))).toBeNull();
    // 입장 토큰도 매니저 표시가 없으니 실시간 서버가 칭호를 받지 않는다
    expect(titleOfLook((await tokenOf(mgr))?.look)).toBeNull();
  });

  it("운영자도 매니저로 임명되지 않았으면 매니저 칭호는 없다", async () => {
    const op = await newVisitor();
    await setStaff(op.visitorId);
    expect((await titlesOf(op)).earned).not.toContain(MANAGER_TITLE_ID);
    await setMgr(op.visitorId, true);
    expect((await titlesOf(op)).earned).toContain(MANAGER_TITLE_ID);
  });
});

describe("11/16 매니저 확성기 딱지", () => {
  const inv = (v: Visitor) => (getAccounts() as unknown as { acct(id: string): { inv: Map<string, number> } }).acct(v.visitorId).inv;
  const shout = (v: Visitor, text: string) => megaphone.POST(call("/api/megaphone", { visitor: v, body: { itemId: "mega_ch", text, channel: 1 } }));

  it("매니저가 외친 확성기는 기록·증서·목록에 매니저 표시. 확성기는 가방에서 꺼낸다 (운영자처럼 무료가 아니다)", async () => {
    const mgr = await newVisitor();
    const user = await newVisitor();
    await setMgr(mgr.visitorId, true);
    expect((await shout(mgr, "반장이 왔어요")).status).toBe(409);
    inv(mgr).set("mega_ch", 1);
    inv(user).set("mega_ch", 1);
    const r = await bodyOf<{ entry: MegaphoneEntry; grant: string }>(shout(mgr, "반장이 왔어요"));
    expect(r.entry).toMatchObject({ mgr: true });
    expect(r.entry.staff).toBeUndefined();
    expect(await verifyGrant(SECRET, r.grant)).toMatchObject({ kind: "megaphone", mgr: true });
    expect(inv(mgr).get("mega_ch") ?? 0).toBe(0);
    const u = await bodyOf<{ entry: MegaphoneEntry; grant: string }>(shout(user, "저는 그냥 주민"));
    expect(u.entry.mgr).toBeUndefined();
    expect(await verifyGrant(SECRET, u.grant)).not.toHaveProperty("mgr");

    const list = async () => (await bodyOf<{ entries: MegaphoneEntry[] }>(megaphone.GET(call("/api/megaphone?channel=1")))).entries;
    expect((await list()).find((e) => e.text === "반장이 왔어요")?.mgr).toBe(true);
    expect((await list()).find((e) => e.text === "저는 그냥 주민")?.mgr).toBeUndefined();
    // 해제하면 지난 기록도 딱지 없이 (운영자처럼 지금 계정으로 다시 판별)
    await setMgr(mgr.visitorId, false);
    expect((await list()).find((e) => e.text === "반장이 왔어요")?.mgr).toBeUndefined();
  });
});

describe("11/16 매니저 딱지 (지난 채팅 기록)", () => {
  it("서버가 붙인 mgr 표시만 남기고 이상한 값은 버린다", () => {
    const got = readChatLog(10_000, [{ id: "a.1", at: 9_000, name: "반장", text: "안녕", mgr: true }, { id: "a.2", at: 9_500, name: "주민", text: "네", mgr: "yes" }], 50_000);
    expect(got.map((l) => l.mgr === true)).toEqual([true, false]);
    expect(got[1]).not.toHaveProperty("mgr");
  });
});

