import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FRIEND_MAX, FRIEND_PENDING_MAX, STAFF_PUBLIC_NAME, verifyInternal, type PeerWhere } from "@tomb/protocol";
import { createBan } from "@/lib/banAdmin";
import { invalidateBanCache } from "@/lib/ban";
import { friendKeyFor, requestFriendById } from "@/lib/friends";
import type { FriendListResponse, FriendPresenceResponse, FriendRequestResponse, FriendWhereResponse } from "@/lib/friendTypes";
import { setStaff } from "@/lib/staff";
import { getAccounts, getFriends } from "@/lib/store";
import type { ApiError } from "@/lib/types";
import * as friendByKey from "./friends/[key]/route";
import * as presence from "./friends/presence/route";
import * as answer from "./friends/requests/[key]/route";
import * as requests from "./friends/requests/route";
import * as friends from "./friends/route";
import * as session from "./session/route";

// 친구: 신청·수락·거절·삭제·중복·상한·정지 계정 / 위치는 친구에게만 / 계정 id는 브라우저에 나가지 않는다

const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

function call(path: string, v?: Visitor, body?: unknown, method?: string) {
  const headers: Record<string, string> = {};
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (key: string) => ({ params: Promise.resolve({ key }) });

async function newVisitor(name?: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", undefined, {}));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  const v = { cookie, ip: `10.31.${++seq}.1`, id };
  await getAccounts().enter(id, { name: name ?? `친구${seq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return v;
}
const body = async <T>(res: Response) => (await res.json()) as T;
const errCode = async (res: Response) => (await body<ApiError>(res)).error.code;

/** 실시간 서버 흉내: 채널 1의 sid → 방문자(/internal/peer), 방문자 → 자리(/internal/where), 알림(/internal/me) */
function fakeRealtime(peers: Record<number, Visitor>, where: Record<string, PeerWhere> = {}) {
  const calls: { op: string; fresh?: boolean; ids?: string[] }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("/internal/")) return new Response("no", { status: 503 });
    const r = await verifyInternal(SECRET, String(init?.body ?? ""), new Headers(init?.headers).get("X-Tomb-Internal"));
    if (!r) return new Response("not found", { status: 404 });
    if (r.op === "peer") {
      calls.push({ op: "peer" });
      const p = r.ch === 1 ? peers[r.sid] : undefined;
      return Response.json({ peer: p ? { visitorId: p.id, name: "누군가" } : null });
    }
    if (r.op === "where") {
      calls.push({ op: "where", fresh: r.fresh, ids: r.visitorIds });
      return Response.json({ where: Object.fromEntries(r.visitorIds.filter((v) => where[v]).map((v) => [v, where[v]])) });
    }
    if (r.op === "me") {
      calls.push({ op: "me", ids: r.visitorIds });
      return Response.json({ sent: r.visitorIds.length });
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

const list = async (v: Visitor) => body<FriendListResponse>(await friends.GET(call("/api/friends", v)));
const ask = (v: Visitor, sid: number) => requests.POST(call("/api/friends/requests", v, { ch: 1, sid }));
const reply = (v: Visitor, key: string, accept: boolean) => answer.POST(call(`/api/friends/requests/${key}`, v, { accept }), params(key));

describe("친구 신청·수락·거절·삭제", () => {
  it("게임 안에서 누른 사람에게 신청 → 상대는 받은 신청(알림) → 수락하면 양쪽 친구. 응답에 계정 id는 없다", async () => {
    const [a, b] = [await newVisitor("가람"), await newVisitor("보리")];
    const calls = fakeRealtime({ 7: b });
    const res = await ask(a, 7);
    expect(res.status).toBe(200);
    expect(await body<FriendRequestResponse>(res)).toEqual({ result: "sent", name: "보리" });
    // 받는 사람 화면에 바로 알린다 (빨간 점)
    expect(calls.some((c) => c.op === "me" && c.ids?.includes(b.id))).toBe(true);

    const la = await list(a);
    expect(la.outgoing.map((r) => r.name)).toEqual(["보리"]);
    const lb = await list(b);
    expect(lb.incoming.map((r) => r.name)).toEqual(["가람"]);
    expect(JSON.stringify(la) + JSON.stringify(lb)).not.toContain(a.id);
    expect(JSON.stringify(la) + JSON.stringify(lb)).not.toContain(b.id);
    const p = await body<FriendPresenceResponse>(await presence.GET(call("/api/friends/presence", b)));
    expect(p.incoming).toBe(1);

    expect((await reply(b, lb.incoming[0].key, true)).status).toBe(200);
    expect((await list(a)).friends.map((f) => f.name)).toEqual(["보리"]);
    expect((await list(b)).friends.map((f) => f.name)).toEqual(["가람"]);
    expect((await list(a)).outgoing).toEqual([]);
    expect((await list(b)).incoming).toEqual([]);
    // 이미 친구면 다시 신청할 수 없다
    expect(await errCode(await ask(a, 7))).toBe("ALREADY");
  });

  it("중복 신청은 409, 상대가 먼저 신청해 뒀으면 바로 친구, 거절·취소", async () => {
    const [a, b, c] = [await newVisitor(), await newVisitor(), await newVisitor()];
    fakeRealtime({ 1: a, 2: b, 3: c });
    expect((await ask(a, 2)).status).toBe(200);
    expect(await errCode(await ask(a, 2))).toBe("PENDING");
    // b가 a에게 신청 → a가 먼저 보내 뒀으니 바로 친구
    expect(await body<FriendRequestResponse>(await ask(b, 1))).toMatchObject({ result: "accepted" });
    expect((await list(a)).friends).toHaveLength(1);
    // 거절: 상대의 보낸 신청에서도 사라진다
    await ask(c, 1);
    const inA = (await list(a)).incoming;
    expect(inA).toHaveLength(1);
    expect((await reply(a, inA[0].key, false)).status).toBe(200);
    expect((await list(a)).incoming).toEqual([]);
    expect((await list(c)).outgoing).toEqual([]);
    expect((await reply(a, inA[0].key, true)).status).toBe(404); // 이미 거절한 신청
    // 취소
    await ask(c, 2);
    const outC = (await list(c)).outgoing;
    expect((await answer.DELETE(call(`/api/friends/requests/${outC[0].key}`, c, undefined, "DELETE"), params(outC[0].key))).status).toBe(200);
    expect((await list(b)).incoming).toEqual([]);
    // 나 자신에게는 안 된다
    expect(await errCode(await ask(a, 1))).toBe("SELF");
  });

  it("삭제하면 양쪽에서 함께 사라진다", async () => {
    const [a, b] = [await newVisitor(), await newVisitor()];
    fakeRealtime({ 2: b });
    await ask(a, 2);
    await reply(b, (await list(b)).incoming[0].key, true);
    const key = (await list(a)).friends[0].key;
    expect((await friendByKey.DELETE(call(`/api/friends/${key}`, a, undefined, "DELETE"), params(key))).status).toBe(200);
    expect((await list(a)).friends).toEqual([]);
    expect((await list(b)).friends).toEqual([]);
    expect((await friendByKey.DELETE(call(`/api/friends/${key}`, a, undefined, "DELETE"), params(key))).status).toBe(404);
  });

  it(`친구는 ${FRIEND_MAX}명까지 (내 쪽·상대 쪽 모두), 보낸 신청도 상한`, async () => {
    const store = getFriends();
    const now = Date.now();
    const a = await newVisitor();
    for (let i = 0; i < FRIEND_MAX; i++) {
      const id = `full-a-${i}`;
      expect(await store.request(a.id, id, now)).toBe("sent");
      expect(await store.accept(id, a.id, now)).toBe("ok");
    }
    expect((await list(a)).friends).toHaveLength(FRIEND_MAX);
    const [b, c] = [await newVisitor(), await newVisitor()];
    fakeRealtime({ 1: a, 2: b });
    expect(await errCode(await ask(a, 2))).toBe("FULL");
    expect(await errCode(await ask(b, 1))).toBe("THEIR_FULL");
    // 가득 차기 전에 받아 둔 신청도 수락할 수 없다
    await store.request(c.id, `free-${seq}`, now);
    expect(await store.request(c.id, a.id, now)).toBe("their_full");
    // 보낸 신청 상한
    for (let i = 0; i < FRIEND_PENDING_MAX - 1; i++) await store.request(c.id, `pend-${seq}-${i}`, now);
    expect(await store.request(c.id, `pend-${seq}-over`, now)).toBe("out_full");
    // 한 명을 정리하면 다시 된다
    const first = (await list(a)).friends[0];
    await friendByKey.DELETE(call(`/api/friends/${first.key}`, a, undefined, "DELETE"), params(first.key));
    expect((await ask(a, 2)).status).toBe(200);
  });

  it("오래된(보관 기간이 지난) 신청은 사라진다", async () => {
    const store = getFriends();
    const now = Date.now();
    const [a, b] = [await newVisitor(), await newVisitor()];
    expect(await store.request(a.id, b.id, now - 15 * 86_400_000)).toBe("sent");
    expect((await store.lists(b.id, now)).incoming).toEqual([]);
    expect(await store.accept(b.id, a.id, now)).toBe("none");
    // 다시 보낼 수 있다
    expect(await store.request(a.id, b.id, now)).toBe("sent");
  });
});

describe("정지 계정·운영자 이름", () => {
  it("정지된 계정에는 신청·수락할 수 없고, 목록에서도 빠진다", async () => {
    const [a, b, c] = [await newVisitor(), await newVisitor(), await newVisitor()];
    fakeRealtime({ 2: b, 3: c });
    await ask(a, 2);
    await reply(b, (await list(b)).incoming[0].key, true);
    await requestFriendById(c.id, a.id); // c가 a에게 신청해 둔다
    await createBan({ kind: "account", accountId: b.id, days: 3, reason: "욕설", memo: "검수" }, "관리자");
    await createBan({ kind: "account", accountId: c.id, days: 3, reason: "욕설", memo: "검수" }, "관리자");
    invalidateBanCache();
    const la = await list(a);
    expect(la.friends).toEqual([]);
    expect(la.incoming).toEqual([]);
    expect(await errCode(await ask(a, 3))).toBe("BANNED_TARGET");
    // 정지된 사람의 신청은 키가 보이지 않으니 받을 수도 없다
    const key = friendKeyFor(c.id);
    expect((await reply(a, key, true)).status).toBe(403);
  });

  it("운영자는 친구 목록에서도 공개 이름(대장)으로", async () => {
    const [a, staff] = [await newVisitor(), await newVisitor("진짜이름")];
    await setStaff(staff.id);
    try {
      fakeRealtime({ 9: staff });
      expect(await body<FriendRequestResponse>(await ask(a, 9))).toEqual({ result: "sent", name: STAFF_PUBLIC_NAME });
      expect((await list(a)).outgoing[0].name).toBe(STAFF_PUBLIC_NAME);
    } finally {
      await setStaff(null);
    }
  });
});

describe("친구 위치", () => {
  it("친구에게만: 같은 채널 마을이면 sid·좌표, 실내면 장소만, 접속 안 했으면 offline. 친구가 아니면 403", async () => {
    const [a, b, c, d] = [await newVisitor(), await newVisitor("나무"), await newVisitor("돌"), await newVisitor("남")];
    const where: Record<string, PeerWhere> = {
      [b.id]: { ch: 2, sid: 5, x: 300, y: 400 },
      [c.id]: { ch: 1, sid: 6, x: 10, y: 10, away: true, place: "house" },
      [d.id]: { ch: 1, sid: 8, x: 1, y: 1 },
    };
    const calls = fakeRealtime({ 2: b, 3: c }, where);
    for (const sid of [2, 3]) await ask(a, sid);
    for (const v of [b, c]) await reply(v, (await list(v)).incoming[0].key, true);

    const la = await list(a);
    const byName = Object.fromEntries(la.friends.map((f) => [f.name, f]));
    expect(byName["나무"].where).toEqual({ at: "world", ch: 2, sid: 5, x: 300, y: 400 });
    // 실내면 좌표는 주지 않는다
    expect(byName["돌"].where).toEqual({ at: "away", ch: 1, sid: 6, place: "house" });
    // 친구가 아닌 d의 위치는 묻지도 않는다
    expect(calls.filter((x) => x.op === "where").every((x) => !x.ids?.includes(d.id))).toBe(true);

    // 한 명 위치 (친구한테 가기): 실시간 서버의 기억을 건너뛰고 지금 묻는다
    const key = byName["나무"].key;
    const one = await friendByKey.GET(call(`/api/friends/${key}`, a), params(key));
    expect(one.status).toBe(200);
    expect((await body<FriendWhereResponse>(one)).where).toMatchObject({ at: "world", ch: 2, sid: 5 });
    expect(calls.at(-1)).toMatchObject({ op: "where", fresh: true });

    // 친구가 아니면 거절 (d의 키를 알아도)
    const dKey = friendKeyFor(d.id);
    expect((await friendByKey.GET(call(`/api/friends/${dKey}`, a), params(dKey))).status).toBe(403);
    expect((await friendByKey.GET(call(`/api/friends/xx`, a), params("xx"))).status).toBe(403);
    // b가 끊으면 a도 b의 위치를 볼 수 없다
    const aKey = (await list(b)).friends[0].key;
    await friendByKey.DELETE(call(`/api/friends/${aKey}`, b, undefined, "DELETE"), params(aKey));
    expect((await friendByKey.GET(call(`/api/friends/${key}`, a), params(key))).status).toBe(403);
  });

  it("접속 안 했으면 offline, 실시간 서버에 닿지 못하면 unknown", async () => {
    const [a, b] = [await newVisitor(), await newVisitor()];
    fakeRealtime({ 2: b });
    await ask(a, 2);
    await reply(b, (await list(b)).incoming[0].key, true);
    expect((await list(a)).friends[0].where).toEqual({ at: "offline" });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("down", { status: 503 }));
    const p = await body<FriendPresenceResponse>(await presence.GET(call("/api/friends/presence", a)));
    expect(p.friends[0].where).toEqual({ at: "unknown" });
  });
});
