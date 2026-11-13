import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import MembersPanel from "@/components/admin/MembersPanel";
import { relativeTime } from "@/components/admin/memberFormat";
import { memberCursor, pageMembers, type AdminMembersResponse, type CodeReissueLogResponse, type CodeReissueResponse } from "@/lib/adminMembers";
import { createBan } from "@/lib/banAdmin";
import { getHuntLevelStore, levelScore } from "@/lib/huntLevelRank";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { DORMANT_MS, type AccountSummary } from "@/lib/store/types";
import type { ApiError, CodeLoginResponse, CodeResponse } from "@/lib/types";
import * as adminCode from "./admin/accounts/code/route";
import * as adminList from "./admin/accounts/list/route";
import * as myCode from "./me/code/route";
import * as login from "./me/login/route";
import * as session from "./session/route";

// 관리자 '회원 제재' 탭: 회원 전체 목록(최근 접속 순·커서·검색) · 접속 코드 재발급 (메모리 구성으로 라우트를 직접 부른다)

const ADMIN = { "x-admin-key": "dev-admin" };

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  // 실시간 서버(강퇴 알림)는 무응답
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no realtime"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let seq = 0;
function call(
  path: string,
  opts: {
    method?: string;
    visitor?: Visitor;
    body?: unknown;
    headers?: Record<string, string>;
    ip?: string;
  } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie });
  headers["x-forwarded-for"] = opts.ip ?? opts.visitor?.ip ?? "10.77.0.1";
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });
}
const bodyOf = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  seq++;
  const res = await session.POST(call("/api/session", { method: "POST" }));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.77.${Math.floor(seq / 250)}.${seq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
}
const list = (q: Record<string, string> = {}) =>
  bodyOf<AdminMembersResponse>(adminList.GET(call(`/api/admin/accounts/list?${new URLSearchParams({ fresh: "1", ...q })}`, { headers: ADMIN })));

describe("회원 목록 자르기 (pageMembers)", () => {
  const rows: AccountSummary[] = Array.from({ length: 120 }, (_, i) => ({
    accountId: `a${String(i).padStart(3, "0")}`,
    name: i % 2 ? `홀수 ${i}` : `짝수_${i}`,
    createdAt: 1000,
    // 같은 시각이 섞여 있어도 계정 id로 순서가 정해진다
    lastSeenAt: 1_000_000 - Math.floor(i / 3) * 10,
    points: i,
    renameRequired: false,
    hasCode: false,
  }));

  it("최근 접속 순 50명씩, 커서로 이어 보면 겹치거나 빠지지 않는다", () => {
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    const p1 = pageMembers(shuffled);
    expect(p1.rows).toHaveLength(50);
    expect(p1.total).toBe(120);
    expect(p1.rows[0].accountId).toBe("a000");
    const p2 = pageMembers(shuffled, { cursor: p1.next });
    const p3 = pageMembers(shuffled, { cursor: p2.next });
    expect(p2.rows).toHaveLength(50);
    expect(p3.rows).toHaveLength(20);
    expect(p3.next).toBeNull();
    const ids = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.accountId);
    expect(ids).toEqual(rows.map((r) => r.accountId));
    for (let i = 1; i < ids.length; i++) expect(Number(ids[i].slice(1))).toBeGreaterThan(Number(ids[i - 1].slice(1)));
  });

  it("커서 뒤에 새로 접속한 회원이 생겨도 다음 페이지가 밀리지 않는다", () => {
    const p1 = pageMembers(rows);
    const moved = rows.map((r) => (r.accountId === "a110" ? { ...r, lastSeenAt: 9_999_999 } : r));
    const p2 = pageMembers(moved, { cursor: p1.next });
    expect(p2.rows[0].accountId).toBe("a050");
    expect(p2.rows.map((r) => r.accountId)).not.toContain("a110");
  });

  it("이름 검색은 공백·_·대소문자를 무시하고, 계정 id 앞부분도 찾는다", () => {
    expect(pageMembers(rows, { q: "홀수1" }).total).toBe(pageMembers(rows, { q: "홀 수 1" }).total);
    expect(pageMembers(rows, { q: "짝수 10" }).rows.map((r) => r.name)).toEqual(["짝수_10", "짝수_100", "짝수_102", "짝수_104", "짝수_106", "짝수_108"]);
    expect(pageMembers(rows, { q: "a11" }).rows.map((r) => r.accountId)).toEqual([
      "a110",
      "a111",
      "a112",
      "a113",
      "a114",
      "a115",
      "a116",
      "a117",
      "a118",
      "a119",
    ]);
    expect(pageMembers(rows, { q: "없는사람" })).toEqual({
      rows: [],
      next: null,
      total: 0,
    });
  });

  it("커서 형식이 틀리면 400", () => {
    expect(() => pageMembers(rows, { cursor: "엉터리" })).toThrow(/커서/);
    expect(memberCursor(rows[0])).toBe("1000000~a000");
  });

  it("상대 시간", () => {
    const now = 10 * 365 * 86_400_000;
    expect(relativeTime(0, now)).toBe("기록 없음");
    expect(relativeTime(now - 5_000, now)).toBe("방금");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5분 전");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3시간 전");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2일 전");
    expect(relativeTime(now - 65 * 86_400_000, now)).toBe("2달 전");
    expect(relativeTime(now - 800 * 86_400_000, now)).toBe("2년 전");
  });
});

describe("GET /api/admin/accounts/list", () => {
  it("관리자만", async () => {
    expect((await adminList.GET(call("/api/admin/accounts/list"))).status).toBe(401);
  });

  it("전체 회원을 최근 접속 순 50명씩 · 이름 검색 · 상태(정상/정지/휴면/운영자) · 사냥 레벨", async () => {
    const accounts = getAccounts();
    const base = Date.now() - 60 * 60_000;
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) {
      const v = await newVisitor();
      ids.push(v.visitorId);
      // i가 클수록 최근에 들어왔다
      await accounts.enter(v.visitorId, { name: `명부${i}`, color: "#9fc5a8", body: "hood" }, base + i * 1000);
    }
    const sleeper = await newVisitor();
    await accounts.enter(sleeper.visitorId, { name: "명부잠꾸러기", color: null, body: null }, Date.now() - DORMANT_MS - 86_400_000);

    await setStaff(ids[54]);
    await createBan(
      {
        kind: "account",
        accountId: ids[53],
        days: 3,
        reason: "테스트",
        memo: "테스트",
      },
      "관리자",
    );
    await getHuntLevelStore(accounts).put(ids[52], levelScore(7, 120), null);

    const first = await list({ q: "명부" });
    expect(first.total).toBe(56);
    expect(first.members).toHaveLength(50);
    expect(first.members.slice(0, 3).map((r) => r.name)).toEqual(["명부54", "명부53", "명부52"]);
    expect(first.members[0]).toMatchObject({
      status: "staff",
      accountId: ids[54],
    });
    expect(first.members[1]).toMatchObject({ status: "banned" });
    expect(first.members[1].banUntil).toBeGreaterThan(Date.now());
    expect(first.members[2]).toMatchObject({ status: "normal", huntLevel: 7 });
    expect(first.members[3].huntLevel).toBeNull();
    expect(first.members[2].createdAt).toBe(base + 52_000);
    expect(first.members[2].lastSeenAt).toBe(base + 52_000);
    expect(first.next).toBeTruthy();

    const second = await list({ q: "명부", cursor: first.next! });
    expect(second.members.map((r) => r.name)).toEqual(["명부4", "명부3", "명부2", "명부1", "명부0", "명부잠꾸러기"]);
    expect(second.members.at(-1)!.status).toBe("dormant");
    expect(second.next).toBeNull();

    const one = await list({ q: "명부 잠꾸" });
    expect(one.members.map((r) => r.accountId)).toEqual([sleeper.visitorId]);

    // 검색 없이도 전체가 나온다 (다른 테스트가 만든 계정 포함)
    expect((await list()).total).toBeGreaterThanOrEqual(56);
  });
});

describe("접속 코드 재발급 (POST /api/admin/accounts/code)", () => {
  const loginWith = (code: string, ip: string) => login.POST(call("/api/me/login", { body: { code }, ip }));

  it("새 코드는 한 번만 응답에 · 옛 코드는 실패, 새 코드는 성공 · 감사 기록(코드 원문 없음)", async () => {
    const v = await newVisitor();
    await getAccounts().enter(v.visitorId, { name: "코드분실", color: null, body: null }, Date.now());
    const { code: old } = await bodyOf<CodeResponse>(myCode.POST(call("/api/me/code", { method: "POST", visitor: v })));
    expect((await loginWith(old, "10.88.0.1")).status).toBe(200);

    const res = await adminCode.POST(
      call("/api/admin/accounts/code", {
        headers: { ...ADMIN, "x-forwarded-for": "10.88.0.9" },
        body: { accountId: v.visitorId },
      }),
    );
    expect(res.status).toBe(200);
    const issued = await bodyOf<CodeReissueResponse>(res);
    expect(issued).toMatchObject({ accountId: v.visitorId, name: "코드분실" });
    expect(issued.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(issued.code).not.toBe(old);

    const bad = await loginWith(old, "10.88.0.2");
    expect(bad.status).toBe(404);
    expect(((await bad.json()) as ApiError).error.code).toBe("INVALID_CODE");
    const good = await loginWith(issued.code, "10.88.0.3");
    expect(good.status).toBe(200);
    expect((await bodyOf<CodeLoginResponse>(good)).me.accountId).toBe(v.visitorId);

    const { log } = await bodyOf<CodeReissueLogResponse>(adminCode.GET(call("/api/admin/accounts/code", { headers: ADMIN })));
    expect(log[0]).toMatchObject({
      action: "codeReissue",
      accountId: v.visitorId,
      name: "코드분실",
      by: "관리자",
    });
    expect(log[0].at).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(log)).not.toContain(issued.code);
  });

  it("운영자 계정은 막는다 · 없는 계정은 404 · 관리자만", async () => {
    const v = await newVisitor();
    await getAccounts().enter(v.visitorId, { name: "운영자님", color: null, body: null }, Date.now());
    const { code: old } = await bodyOf<CodeResponse>(myCode.POST(call("/api/me/code", { method: "POST", visitor: v })));
    await setStaff(v.visitorId);
    const res = await adminCode.POST(
      call("/api/admin/accounts/code", {
        headers: ADMIN,
        body: { accountId: v.visitorId },
      }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiError).error.code).toBe("STAFF_ACCOUNT");
    expect((await loginWith(old, "10.88.1.1")).status).toBe(200); // 옛 코드 그대로

    expect(
      (
        await adminCode.POST(
          call("/api/admin/accounts/code", {
            headers: ADMIN,
            body: { accountId: "nobody-here" },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await adminCode.POST(
          call("/api/admin/accounts/code", {
            body: { accountId: v.visitorId },
          }),
        )
      ).status,
    ).toBe(401);
    expect((await adminCode.GET(call("/api/admin/accounts/code"))).status).toBe(401);
  });
});

describe("회원 제재 탭 화면", () => {
  it("포인트 지급 칸이 없고, 회원 목록·차단이 있다", () => {
    const html = renderToStaticMarkup(
      createElement(MembersPanel, {
        toast: () => undefined,
        onAuthLost: () => undefined,
      }),
    );
    expect(html).toContain('aria-label="회원 제재"');
    expect(html).toContain("IP로 바로 차단");
    expect(html).toContain("코드 재발급 기록");
    expect(html).not.toContain("포인트 지급");
    expect(html).not.toContain("+100 / -50");
    expect(html).not.toContain("개인 코드 또는 계정 id");
  });
});
