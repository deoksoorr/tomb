import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listMembers } from "@/lib/adminMembers";
import { banIpHash } from "@/lib/ban";
import { addDays, gameDay } from "@/lib/gameDay";
import { assessPair, DEVICE_COOKIE, ipNet, memberLinks } from "@/lib/sameUser";
import { levelOfReasons, mergeReasons, parseReason, sameLevel, sameScore } from "@/lib/sameUserRules";
import { setStaff } from "@/lib/staff";
import { getBanStore } from "@/lib/store/bans";
import { getReferrals } from "@/lib/store/referrals";
import { getActivity } from "@/lib/store/userActivity";
import * as attend from "./me/attend/route";
import * as logout from "./me/logout/route";
import * as referral from "./referral/route";
import * as session from "./session/route";

// 같은 사람(여러 계정) 판정: 신호마다 · 점수 단계 · 「새로 시작」에도 남는 기기 표시 · 추천 무리 · 회원 목록의 같은 IP·같은 기기 계정 (메모리 저장소만)
const T0 = Date.UTC(2026, 10, 12, 3, 0);
const HOUR = 3_600_000;
const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "REALTIME_HTTP_URL"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Who = { id: string; vid: string; dev: string | null; ip: string };
type Opts = { ip: string; fp?: string; devHeader?: string; tdev?: string; fresh?: boolean; vid?: string };

function req(path: string, o: { ip: string; cookie?: string; headers?: Record<string, string>; body?: unknown }) {
  const headers: Record<string, string> = { "x-forwarded-for": o.ip, ...o.headers };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}
const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;

/** 세션을 받고(기기·브라우저 환경·대역이 남는다) 이름을 정하고, 입장처럼 접속 IP를 남긴다 */
async function visit(name: string, o: Opts): Promise<Who> {
  const cookie = [o.vid ? `vid=${o.vid}` : "", o.tdev ? `${DEVICE_COOKIE}=${o.tdev}` : ""].filter(Boolean).join("; ");
  const headers: Record<string, string> = { ...(o.fp ? { "x-tomb-fp": o.fp } : {}), ...(o.devHeader ? { "x-tomb-dev": o.devHeader } : {}) };
  const res = await session.POST(req("/api/session", { ip: o.ip, cookie, headers, body: o.fresh ? { fresh: true } : undefined }));
  const id = (await res.json()).visitorId as string;
  const vid = cookieOf(res, "vid")!;
  await attend.POST(req("/api/me/attend", { ip: o.ip, cookie: `vid=${vid}`, body: { name } }));
  await getBanStore().seen(id, banIpHash(o.ip)!, Date.now(), false);
  return { id, vid, dev: cookieOf(res, DEVICE_COOKIE), ip: o.ip };
}
let seq = 0;
/** 겹치지 않는 대역의 IP */
const freshIp = () => `172.${16 + (++seq % 15)}.${seq}.9`;

describe("점수와 단계", () => {
  it("30점부터 확인 필요, 70점부터 같은 사람 같음", () => {
    expect(sameLevel(29)).toBe("clear");
    expect(sameLevel(30)).toBe("review");
    expect(sameLevel(69)).toBe("review");
    expect(sameLevel(70)).toBe("same");
    expect(levelOfReasons(["dev"])).toBe("same");
    expect(levelOfReasons(["ipSignup"])).toBe("review");
    expect(levelOfReasons(["ipSignup", "time"])).toBe("review");
    expect(levelOfReasons(["ipSignup", "fpNet"])).toBe("same");
    expect(levelOfReasons(["net"])).toBe("clear");
    expect(levelOfReasons(["fp"])).toBe("clear");
    expect(levelOfReasons(["net", "fpNet"])).toBe("review");
    expect(sameScore(["dev", "ip", "fpNet", "cluster:a.b"])).toBe(100);
  });

  it("이유를 합친다: 같은 IP가 있으면 대역은 빼고, 무리 계정은 모은다", () => {
    expect(mergeReasons(["ip", "net"], ["ipSignup"])).toEqual(["ipSignup"]);
    expect(mergeReasons(["fp"], ["fpNet"])).toEqual(["fpNet"]);
    expect(mergeReasons(["cluster:b.a"], ["cluster:c", "nope"])).toEqual(["cluster:a.b.c"]);
    expect(parseReason("cluster:a.b")).toMatchObject({ code: "cluster", accounts: ["a", "b"] });
  });

  it("IP 대역은 IPv4 /24, IPv6 /48", () => {
    expect(ipNet("10.1.2.3")).toBe(ipNet("10.1.2.250"));
    expect(ipNet("10.1.2.3")).not.toBe(ipNet("10.1.3.3"));
    expect(ipNet("2001:db8:1:aaaa::1")).toBe(ipNet("2001:db8:1:bbbb::2"));
    expect(ipNet("2001:db8:1::1")).not.toBe(ipNet("2001:db8:2::1"));
  });
});

describe("신호마다", () => {
  it("기기 표시: 「새로 시작」·로그아웃에도 쿠키가 남아 두 계정이 같은 기기로 이어진다", async () => {
    const ip = freshIp();
    const a = await visit("새로시작전", { ip });
    expect(a.dev).toBeTruthy();
    const b = await visit("새로시작뒤", { ip: freshIp(), vid: a.vid, tdev: a.dev!, fresh: true });
    expect(b.id).not.toBe(a.id);
    expect(b.dev).toBe(a.dev);
    expect(await assessPair(b.id, a.id, Date.now())).toContain("dev");
    // 로그아웃은 계정 쿠키만 지운다
    const out = await logout.POST(req("/api/me/logout", { ip, cookie: `vid=${a.vid}; ${DEVICE_COOKIE}=${a.dev}` }));
    expect(cookieOf(out, DEVICE_COOKIE)).toBeNull();
    expect(cookieOf(out, "vid")).toBe("");
  });

  it("기기 표시: 쿠키가 지워져도 localStorage 값(머리글)이 같으면 이어지고, 그 값으로 쿠키를 다시 붙인다", async () => {
    const a = await visit("저장소기기하나", { ip: freshIp(), devHeader: "ls-device-0000000042" });
    const b = await visit("저장소기기둘", { ip: freshIp(), devHeader: "ls-device-0000000042" });
    expect(b.dev).toBe("ls-device-0000000042");
    expect(await assessPair(b.id, a.id, Date.now())).toEqual(["dev"]);
  });

  it("같은 대역만이면 의심 없음, 추천인이 3시간 안에 그 대역에 있었으면 시간 신호가 붙는다", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    const a = await visit("대역추천인", { ip: "10.60.1.5" });
    now.mockReturnValue(T0 + 5 * HOUR);
    const late = await visit("대역늦은이", { ip: "10.60.1.77" });
    expect(await assessPair(late.id, a.id, Date.now(), { createdAt: T0 + 5 * HOUR })).toEqual(["net"]);
    now.mockReturnValue(T0 + HOUR);
    const soon = await visit("대역이른이", { ip: "10.60.1.78" });
    const r = await assessPair(soon.id, a.id, Date.now(), { createdAt: T0 + HOUR });
    expect(r).toEqual(["net", "time"]);
    expect(levelOfReasons(r)).toBe("review");
  });

  it("브라우저 환경: 혼자면 약하고, 같은 대역과 함께면 강하다", async () => {
    const a = await visit("환경추천인", { ip: "10.61.1.5", fp: FP_A });
    const far = await visit("환경먼이", { ip: freshIp(), fp: FP_A });
    expect(await assessPair(far.id, a.id, Date.now())).toEqual(["fp"]);
    const near = await visit("환경가까운이", { ip: "10.61.1.6", fp: FP_A });
    expect(await assessPair(near.id, a.id, Date.now())).toEqual(["net", "fpNet"]);
    const other = await visit("환경다른이", { ip: freshIp(), fp: FP_B });
    expect(await assessPair(other.id, a.id, Date.now())).toEqual([]);
  });

  it("같은 IP: 가입 IP가 추천인 최근 IP와 같으면 ipSignup, 나중에 겹치면 ip", async () => {
    const a = await visit("아이피추천인", { ip: "10.62.0.1" });
    const b = await visit("아이피새이웃", { ip: freshIp() });
    expect(await assessPair(b.id, a.id, Date.now(), { signup: { ip: banIpHash("10.62.0.1"), net: null } })).toEqual(["ipSignup"]);
    await getBanStore().seen(b.id, banIpHash("10.62.0.1")!, Date.now(), false);
    expect(await assessPair(b.id, a.id, Date.now())).toEqual(["ip"]);
  });

  it("활동한 날: 새 이웃이 추천인이 접속한 날에만 들어왔으면 days", async () => {
    const a = await visit("날추천인", { ip: freshIp() });
    const b = await visit("날새이웃", { ip: freshIp() });
    const c = await visit("날혼자", { ip: freshIp() });
    const today = gameDay(Date.now());
    const d = (n: number) => addDays(today, -n);
    await getActivity().record([0, 1, 2, 3, 4].map((n) => [a.id, d(n)] as const));
    await getActivity().record([0, 1, 2].map((n) => [b.id, d(n)] as const));
    await getActivity().record([0, 1, 5].map((n) => [c.id, d(n)] as const));
    expect(await assessPair(b.id, a.id, Date.now(), { days: true })).toEqual(["days"]);
    expect(await assessPair(c.id, a.id, Date.now(), { days: true })).toEqual([]);
  });
});

describe("추천 무리", () => {
  it("추천인이 데려온 이웃 셋이 서로 같은 대역이면 무리로 보고, 앞선 이웃 기록에도 남긴다", async () => {
    const x = await visit("무리추천인", { ip: "10.70.0.1" });
    const code = (await (await referral.GET(req("/api/referral", { ip: x.ip, cookie: `vid=${x.vid}` }))).json()).code as string;
    const kids: Who[] = [];
    for (let i = 0; i < 3; i++) {
      const k = await visit(`무리이웃${i}`, { ip: `10.71.0.${i + 2}` });
      await referral.POST(req("/api/referral", { ip: k.ip, cookie: `vid=${k.vid}`, body: { code, via: "signup" } }));
      kids.push(k);
    }
    const [r0, r1, r2] = await getReferrals().getMany(kids.map((k) => k.id));
    const cl = parseReason(r2!.reasons.find((r) => r.startsWith("cluster"))!);
    expect(cl?.accounts.sort()).toEqual([kids[0].id, kids[1].id].sort());
    expect(levelOfReasons(r2!.reasons)).toBe("review");
    expect(parseReason(r0!.reasons.find((r) => r.startsWith("cluster"))!)?.accounts).toEqual(expect.arrayContaining([kids[1].id, kids[2].id]));
    expect(r1!.reasons.some((r) => r.startsWith("cluster"))).toBe(true);
  });
});

describe("회원 목록의 같은 IP·같은 기기 계정", () => {
  it("한 페이지를 한 번에 읽어 전부 이름으로 주고, 운영자도 표시한다. 겹치는 계정이 없으면 빈 목록", async () => {
    const ip = "10.80.0.1";
    const a = await visit("목록첫째", { ip, tdev: "member-device-00000001" });
    await visit("목록둘째", { ip });
    const c = await visit("목록셋째", { ip });
    const d = await visit("목록기기만", { ip: freshIp(), tdev: "member-device-00000001" });
    const lone = await visit("목록혼자", { ip: freshIp() });
    await setStaff(c.id);
    const links = await memberLinks([a.id, d.id, lone.id], Date.now());
    expect(links.get(a.id)!.ip.map((x) => x.name).sort()).toEqual(["목록둘째", "목록셋째"]);
    expect(links.get(a.id)!.ip.find((x) => x.accountId === c.id)?.staff).toBe(true);
    expect(links.get(a.id)!.device).toEqual([{ accountId: d.id, name: "목록기기만" }]);
    expect(links.get(d.id)!.device.map((x) => x.accountId)).toEqual([a.id]);
    expect(links.get(lone.id)).toEqual({ ip: [], device: [] });
    const page = await listMembers({ q: "목록", fresh: true });
    const row = page.members.find((m) => m.accountId === a.id)!;
    expect(row.links.ip).toHaveLength(2);
    expect(row.links.device).toHaveLength(1);
    expect(page.members.find((m) => m.accountId === lone.id)!.links).toEqual({ ip: [], device: [] });
  });
});
