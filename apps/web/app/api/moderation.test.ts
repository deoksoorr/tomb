import { CLOSE, verifyInternal } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { banIpHash, canonicalIp } from "@/lib/ban";
import type { AdminBan, BanLookup } from "@/lib/banAdmin";
import { getHouseStore } from "@/lib/housing/service";
import { getMegaphone, getStore } from "@/lib/store";
import type { ApiError } from "@/lib/types";
import * as banById from "./admin/bans/[id]/route";
import * as bans from "./admin/bans/route";
import * as banLookup from "./admin/bans/lookup/route";
import * as kick from "./admin/kick/route";
import * as adminReports from "./admin/reports/route";
import * as join from "./join/route";
import * as me from "./me/route";
import * as reports from "./reports/route";
import * as session from "./session/route";

// 47번 정지·IP 차단·강퇴·신고. 로컬 구성(Memory*)으로 라우트를 직접 부르고, 실시간 서버 내부 요청은 fetch를 가로채 흉내 낸다
const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "3");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; id: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; ip?: string; body?: unknown; admin?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.ip ?? opts.visitor.ip });
  if (opts.admin) Object.assign(headers, { "x-admin-key": "dev-admin", "x-forwarded-for": "127.0.0.1" });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errOf = async (res: Response | Promise<Response>) => ((await (await res).json()) as ApiError).error;
async function newVisitor(ip?: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  ipSeq++;
  return { cookie, ip: ip ?? `10.47.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`, id: (await bodyOf<{ visitorId: string }>(res)).visitorId };
}
const joinAs = (v: Visitor, ip?: string) => join.POST(call("/api/join", { visitor: v, ip, body: { channel: 1, name: "검수", color: "#9fc5a8" } }));
const meAs = (v: Visitor, ip?: string) => me.GET(call("/api/me", { visitor: v, ip }));
const createBan = (body: Record<string, unknown>) => bans.POST(call("/api/admin/bans", { admin: true, body }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** 실시간 서버 흉내: 내부 요청 서명을 검증하고 기록한다. peers = 채널 1의 sid → 방문자 */
function fakeRealtime(peers: Record<number, { visitorId: string; name: string }> = {}) {
  const calls: { op: string; body: Record<string, unknown> }[] = [];
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/internal/")) return real(input, init);
    const body = String(init?.body ?? "");
    const sig = new Headers(init?.headers).get("X-Tomb-Internal");
    const r = await verifyInternal(SECRET, body, sig);
    if (!r) return new Response("not found", { status: 404 });
    calls.push({ op: r.op, body: JSON.parse(body) as Record<string, unknown> });
    if (r.op === "kick") return Response.json({ expelled: r.visitorIds.length });
    return Response.json({ peer: r.ch === 1 ? (peers[r.sid] ?? null) : null });
  });
  return calls;
}

describe("47번 IP 해시", () => {
  it("IPv4는 그대로·IPv4-mapped도 같게, IPv6는 /64로 묶고, 원본 IP는 해시에 보이지 않는다", () => {
    expect(canonicalIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(banIpHash("203.0.113.7")).toBe(banIpHash("::ffff:203.0.113.7"));
    expect(banIpHash("2001:db8:1:2::5")).toBe(banIpHash("2001:db8:1:2:aaaa::9"));
    expect(banIpHash("2001:db8:1:3::5")).not.toBe(banIpHash("2001:db8:1:2::5"));
    expect(banIpHash("203.0.113.7")).toMatch(/^[0-9a-f]{32}$/);
    expect(banIpHash("203.0.113.7")).not.toContain("203");
    expect(banIpHash("아무거나")).toBeNull();
  });
});

describe("47번 정지·IP 차단", () => {
  it("계정 정지: 사유 둘 다 필수 → 걸면 접속 중이면 4012로 내보내고, API·입장·첫 화면 판정이 막힌다 → 조기 해제하면 다시 된다", async () => {
    const calls = fakeRealtime();
    const a = await newVisitor();
    expect((await joinAs(a)).status).toBe(200);

    expect((await errOf(createBan({ kind: "account", accountId: a.id, days: 3, reason: "욕설", memo: "" }))).message).toContain("관리자 메모");
    expect((await errOf(createBan({ kind: "account", accountId: a.id, days: 3, reason: " ", memo: "증거 있음" }))).message).toContain("사유");

    const res = await createBan({ kind: "account", accountId: a.id, days: 3, reason: "욕설을 반복했어요", memo: "신고 3건" });
    expect(res.status).toBe(200);
    const { ban, expelled } = await bodyOf<{ ban: AdminBan; expelled: number }>(res);
    expect(ban).toMatchObject({ kind: "account", accountId: a.id, status: "active", by: "관리자", reason: "욕설을 반복했어요" });
    expect(ban.until! - ban.startAt).toBe(3 * 86_400_000);
    expect(expelled).toBe(1);
    expect(calls.at(-1)).toMatchObject({ op: "kick", body: { visitorIds: [a.id], code: CLOSE.BANNED } });

    const blocked = await errOf(meAs(a));
    expect(blocked.code).toBe("BANNED");
    expect(blocked.message).toContain("욕설을 반복했어요");
    expect((await errOf(joinAs(a))).code).toBe("BANNED");
    // 계정 정지는 다른 IP로 와도 막힌다. 다른 계정은 같은 IP여도 된다
    expect((await meAs(a, "198.51.100.9")).status).toBe(403);
    const b = await newVisitor(a.ip);
    expect((await meAs(b)).status).toBe(200);

    const lifted = await banById.PATCH(call(`/api/admin/bans/${ban.id}`, { admin: true, method: "PATCH", body: { action: "lift", note: "오해" } }), ctx(ban.id));
    expect((await bodyOf<{ ban: AdminBan }>(lifted)).ban).toMatchObject({ status: "lifted", liftedBy: "관리자" });
    expect((await meAs(a)).status).toBe(200);
    expect((await joinAs(a)).status).toBe(200);

    // 기록은 남는다 (만든 것 + 해제)
    const list = (await bodyOf<{ bans: AdminBan[] }>(bans.GET(call("/api/admin/bans", { admin: true })))).bans;
    expect(list.find((x) => x.id === ban.id)?.history.map((h) => h.action)).toEqual(["create", "lift"]);
  });

  it("IP 차단: 계정의 최근 IP를 미리 보고(계정 N명) 막으면 그 IP에서는 새 계정도 막히고, 다른 IP의 같은 계정은 된다", async () => {
    fakeRealtime();
    const ip = "203.0.113.50";
    const a = await newVisitor(ip);
    const b = await newVisitor(ip);
    await joinAs(a);
    await joinAs(b);
    const look = await bodyOf<BanLookup>(banLookup.POST(call("/api/admin/bans/lookup", { admin: true, body: { accountId: a.id } })));
    expect(look.account?.ips).toHaveLength(1);
    expect(look.account?.ips[0]).toMatchObject({ accounts: 2, operator: false });
    const ipHash = look.account!.ips[0].ipHash;
    // 직접 입력한 IP도 같은 해시로 비교한다
    expect((await bodyOf<BanLookup>(banLookup.POST(call("/x", { admin: true, body: { ip } })))).ip?.ipHash).toBe(ipHash);

    const { ban, expelled } = await bodyOf<{ ban: AdminBan; expelled: number }>(createBan({ kind: "ip", accountId: a.id, ipHash, days: null, reason: "도배", memo: "같은 IP 여러 계정" }));
    expect(ban).toMatchObject({ kind: "ip", ipHash, ipSource: "account", ipAccounts: 2, until: null });
    expect(expelled).toBe(2); // 그 IP로 최근 들어온 두 계정 모두
    const fresh = await newVisitor(ip);
    expect((await meAs(fresh)).status).toBe(403);
    expect((await errOf(joinAs(fresh))).code).toBe("BANNED");
    expect((await meAs(a, "198.51.100.10")).status).toBe(200);

    // 기간 수정: 지금부터 1일로
    const edited = await bodyOf<{ ban: AdminBan }>(
      banById.PATCH(call(`/api/admin/bans/${ban.id}`, { admin: true, method: "PATCH", body: { action: "edit", days: 1 } }), ctx(ban.id)),
    );
    expect(edited.ban.until).not.toBeNull();
    expect(edited.ban.history.at(-1)).toMatchObject({ action: "edit" });
    // 기간이 지나면 저절로 풀린다
    const later = Date.now() + 2 * 86_400_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    expect((await meAs(fresh)).status).toBe(200);
    const after = (await bodyOf<{ bans: AdminBan[] }>(bans.GET(call("/api/admin/bans", { admin: true })))).bans.find((x) => x.id === ban.id);
    expect(after?.status).toBe("expired");
  });

  it("운영자 IP는 직접 입력해도, 운영자 IP에서 쓰인 해시를 골라도 차단할 수 없다", async () => {
    fakeRealtime();
    expect((await errOf(createBan({ kind: "ip", ip: "127.0.0.1", days: 1, reason: "시험", memo: "시험" }))).message).toContain("운영자");
    const op = await newVisitor("127.0.0.1");
    await joinAs(op);
    const look = await bodyOf<BanLookup>(banLookup.POST(call("/x", { admin: true, body: { accountId: op.id } })));
    expect(look.account?.ips[0].operator).toBe(true);
    const r = await createBan({ kind: "both", accountId: op.id, ipHash: look.account!.ips[0].ipHash, days: 1, reason: "시험", memo: "시험" });
    expect((await errOf(r)).message).toContain("운영자");
    // 계정만 정지하는 것은 된다
    expect((await createBan({ kind: "account", accountId: op.id, days: 1, reason: "시험", memo: "시험" })).status).toBe(200);
    expect((await meAs(op)).status).toBe(403);
    // 계정에 없는 IP 해시는 고를 수 없다
    const other = await newVisitor();
    expect((await errOf(createBan({ kind: "ip", accountId: other.id, ipHash: "0".repeat(32), days: 1, reason: "x", memo: "x" }))).code).toBe("INVALID_INPUT");
  });

  it("새 정지는 같은 대상의 이전 정지를 대신한다 (계정+IP 위에 계정+IP 다시)", async () => {
    fakeRealtime();
    const a = await newVisitor("203.0.113.77");
    await joinAs(a);
    const first = (await bodyOf<{ ban: AdminBan }>(createBan({ kind: "both", accountId: a.id, days: 7, reason: "1차", memo: "1차" }))).ban;
    const second = (await bodyOf<{ ban: AdminBan }>(createBan({ kind: "both", accountId: a.id, days: 30, reason: "2차", memo: "2차" }))).ban;
    const list = (await bodyOf<{ bans: AdminBan[] }>(bans.GET(call("/x", { admin: true })))).bans;
    expect(list.find((x) => x.id === first.id)).toMatchObject({ status: "lifted" });
    expect(list.find((x) => x.id === first.id)?.history.at(-1)?.action).toBe("replaced");
    expect((await errOf(meAs(a))).message).toContain("2차");
    await banById.PATCH(call("/x", { admin: true, method: "PATCH", body: { action: "lift" } }), ctx(second.id));
    expect((await meAs(a)).status).toBe(200);
  });

  it("지금 내보내기: 정지 없이 4011로 끊고, 실시간 서버에 닿지 못하면 null", async () => {
    const calls = fakeRealtime();
    const a = await newVisitor();
    expect(await bodyOf(kick.POST(call("/x", { admin: true, body: { accountId: a.id } })))).toEqual({ expelled: 1 });
    expect(calls.at(-1)).toMatchObject({ op: "kick", body: { code: CLOSE.KICKED } });
    expect((await meAs(a)).status).toBe(200);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await bodyOf(kick.POST(call("/x", { admin: true, body: { accountId: a.id } })))).toEqual({ expelled: null });
  });
});

describe("47번 신고", () => {
  it("유저 신고: 실시간 서버로 sid를 확인해 받고, 같은 사람은 하루 한 번, 자기 자신은 안 된다", async () => {
    const reporter = await newVisitor();
    const target = await newVisitor();
    const calls = fakeRealtime({ 3: { visitorId: target.id, name: "나쁜유령" }, 4: { visitorId: reporter.id, name: "나" } });
    const send = (body: unknown, v = reporter) => reports.POST(call("/api/reports", { visitor: v, body }));
    expect((await send({ type: "user", ch: 1, sid: 3, reason: "abuse", memo: "계속 따라다니며 욕해요" })).status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ op: "peer", body: { ch: 1, sid: 3 } });
    expect((await errOf(send({ type: "user", ch: 1, sid: 3, reason: "nickname" }))).code).toBe("ALREADY_REPORTED");
    expect((await errOf(send({ type: "user", ch: 1, sid: 4, reason: "spam" }))).message).toContain("자기 자신");
    expect((await errOf(send({ type: "user", ch: 1, sid: 9, reason: "spam" }))).code).toBe("NOT_FOUND");
    expect((await errOf(send({ type: "user", ch: 1, sid: 3, reason: "abuse", memo: "가".repeat(101) }))).code).toBe("INVALID_INPUT");
    expect((await errOf(send({ type: "user", sid: 3, reason: "abuse" }))).code).toBe("INVALID_INPUT");
    // 다른 사람이 같은 대상을 신고하면 신고자 수가 는다
    const other = await newVisitor();
    expect((await send({ type: "user", ch: 1, sid: 3, reason: "nickname" }, other)).status).toBe(200);

    const open = await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/api/admin/reports", { admin: true })));
    const c = open.reports.find((r) => r.key === `user:${target.id}`)!;
    expect(c).toMatchObject({ type: "user", accountId: target.id, count: 2, reporters: 2, status: "open", actions: ["kick", "dismiss"] });
    expect(c.notes[1]).toMatchObject({ reason: "abuse", memo: "계속 따라다니며 욕해요" });
    expect(open.openCount).toBeGreaterThanOrEqual(1);

    // 기각 → 처리됨으로 (처리 기록과 함께)
    const res = await adminReports.POST(call("/x", { admin: true, body: { key: c.key, action: "dismiss" } }));
    expect((await bodyOf<adminReports.AdminReportActionResponse>(res)).resolution).toMatchObject({ action: "기각", by: "관리자" });
    const done = await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/api/admin/reports?status=done", { admin: true })));
    expect(done.reports.find((r) => r.key === c.key)?.resolution?.action).toBe("기각");
    const open2 = await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/api/admin/reports", { admin: true })));
    expect(open2.reports.some((r) => r.key === c.key)).toBe(false);
  });

  it("확성기 신고 → 숨김 처리가 확성기 숨김과 이어진다. 강퇴는 글쓴이를 4011로", async () => {
    const calls = fakeRealtime();
    const author = await newVisitor();
    const reporter = await newVisitor();
    const id = `m-${Date.now()}`;
    await getMegaphone().push({ id, name: "외침이", text: "광고합니다 www", scope: "all", ch: 1, at: Date.now(), accountId: author.id });
    expect((await errOf(reports.POST(call("/x", { visitor: author, body: { type: "megaphone", id, reason: "spam" } })))).code).toBe("INVALID_INPUT");
    expect((await reports.POST(call("/x", { visitor: reporter, body: { type: "megaphone", id, reason: "spam", memo: "광고" } }))).status).toBe(200);
    const list = await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })));
    const c = list.reports.find((r) => r.key === `megaphone:${id}`)!;
    expect(c).toMatchObject({ preview: "광고합니다 www", accountId: author.id, hidden: false, actions: ["hide", "kick", "dismiss"] });
    await adminReports.POST(call("/x", { admin: true, body: { key: c.key, action: "hide" } }));
    expect((await getMegaphone().recent(100)).find((r) => r.id === id)?.hidden).toBe(true);
    // 처리된 사건도 다시 신고되면 대기로 돌아온다
    const third = await newVisitor();
    await reports.POST(call("/x", { visitor: third, body: { type: "megaphone", id, reason: "abuse" } }));
    const again = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })))).reports.find((r) => r.key === c.key)!;
    expect(again).toMatchObject({ status: "open", count: 2, hidden: true });
    const k = await bodyOf<adminReports.AdminReportActionResponse>(adminReports.POST(call("/x", { admin: true, body: { key: c.key, action: "kick" } })));
    expect(k.expelled).toBe(1);
    expect(calls.at(-1)).toMatchObject({ op: "kick", body: { visitorIds: [author.id], code: CLOSE.KICKED } });
  });

  it("묘비·방명록 신고도 같은 목록에. 처리하면 처리됨으로 가고, 신고가 더 들어오면 다시 대기", async () => {
    fakeRealtime();
    const store = getStore();
    const [grave] = (await store.listAll()).filter((g) => !g.hidden);
    await store.report(grave.id, "v-r1", "ip-r1", "abuse");
    let list = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })))).reports;
    const g = list.find((r) => r.key === `grave:${grave.id}`)!;
    expect(g).toMatchObject({ type: "grave", name: grave.name, count: 1, reasonSummary: "욕설·혐오 1", actions: ["hide", "delete", "kick", "dismiss"] });
    expect(g.preview).toContain(grave.epitaph);
    await adminReports.POST(call("/x", { admin: true, body: { key: g.key, action: "hide" } }));
    expect((await store.get(grave.id))?.hidden).toBe(true);
    list = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })))).reports;
    expect(list.some((r) => r.key === g.key)).toBe(false);
    const done = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x?status=done", { admin: true })))).reports;
    expect(done.find((r) => r.key === g.key)).toMatchObject({ resolution: { action: "숨김" }, count: 1 });
    await store.report(grave.id, "v-r2", "ip-r2", "spam");
    list = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })))).reports;
    expect(list.find((r) => r.key === g.key)?.count).toBe(2);

    // 방명록
    const houses = getHouseStore();
    const hid = `hmod${Date.now() % 1e8}`;
    expect(await houses.create({ id: hid, owner: "owner-x", name: "검수의 집", intro: "", ownerName: "집주인", tier: "small", lot: null, now: Date.now() })).toHaveProperty("lot");
    const house = (await houses.listAll()).find((h) => h.id === hid);
    expect(house).toBeTruthy();
    if (house) {
      const entryId = `gtest${Date.now()}`.slice(0, 16);
      await houses.addGuest(house.id, { id: entryId, name: "손님", text: "나쁜 말", at: Date.now(), author: "author-x" } as never, "20991231");
      await houses.reportGuest(house.id, entryId, "ip-g1");
      list = (await bodyOf<adminReports.AdminReportsResponse>(adminReports.GET(call("/x", { admin: true })))).reports;
      const gb = list.find((r) => r.key === `guestbook:${house.id}/${entryId}`);
      expect(gb).toMatchObject({ type: "guestbook", accountId: "author-x", count: 1 });
      await adminReports.POST(call("/x", { admin: true, body: { key: gb!.key, action: "delete" } }));
      expect((await houses.guestbook(house.id, true)).some((e) => e.id === entryId)).toBe(false);
    }
  });
});
