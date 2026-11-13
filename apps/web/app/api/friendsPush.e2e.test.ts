import { NextRequest } from "next/server";
import { CLIENT_VERSION } from "@tomb/protocol";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { friendKeyFor } from "@/lib/friends";
import type { FriendPresenceResponse } from "@/lib/friendTypes";
import { getAccounts, getFriends } from "@/lib/store";
import type { JoinResponse } from "@/lib/types";
import * as presence from "./friends/presence/route";
import * as join from "./join/route";
import * as session from "./session/route";

// 친구 들고 남 밀어 주기, 끝에서 끝까지: 웹 /api/join(→ 실시간 /internal/hello) → 로비 → 이미 와 있는 친구의 채널 소켓.
// 로컬 실시간 서버(wrangler dev, ALLOWED_ORIGINS에 http://localhost:3456)가 떠 있을 때만:
//   REALTIME_E2E=http://localhost:8787 npx vitest run app/api/friendsPush.e2e.test.ts
const RT = process.env.REALTIME_E2E;

type Visitor = { cookie: string; id: string };
type Sock = { ws: WebSocket; events: { at: number; m: { t: string; [k: string]: unknown } }[] };

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  if (RT) vi.stubEnv("REALTIME_INTERNAL_URL", RT);
  vi.stubEnv("MOCK_GRAVES", "0");
});

let seq = 0;
const req = (path: string, v?: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(v ? { cookie: v.cookie } : {}), "x-forwarded-for": `10.77.${++seq}.1`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function visitor(name: string): Promise<Visitor> {
  const res = await session.POST(req("/api/session", undefined, {}));
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  await getAccounts().enter(id, { name, color: "#e8d9b0", body: "hood" }, Date.now());
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], id };
}
/** 브라우저처럼: /api/join으로 토큰을 받아 그 채널 소켓에 붙는다 */
async function enter(v: Visitor, name: string, channel: number): Promise<Sock> {
  const r = (await (await join.POST(req("/api/join", v, { channel, name, color: "#e8d9b0" }))).json()) as JoinResponse;
  if (r.mode !== "channel") throw new Error("join " + JSON.stringify(r));
  const ws = new WebSocket(`${RT!.replace(/^http/, "ws")}/ch/${r.channel}?t=${encodeURIComponent(r.token)}&v=${CLIENT_VERSION}`, { headers: { Origin: "http://localhost:3456" } } as unknown as string[]);
  const s: Sock = { ws, events: [] };
  await new Promise<void>((ok, bad) => {
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      const m = JSON.parse(e.data) as Sock["events"][number]["m"];
      s.events.push({ at: Date.now(), m });
      if (m.t === "welcome") ok();
    };
    ws.onclose = (e) => bad(new Error("closed " + e.code));
  });
  return s;
}
const friendMsgs = (s: Sock, since: number) => s.events.filter((e) => e.m.t === "friend" && e.at >= since);
async function until<T>(f: () => T | undefined, ms: number): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  return f();
}

describe.skipIf(!RT)("친구 들고 남 밀어 주기 (웹 + 로컬 실시간 서버)", () => {
  it("이미 와 있던 친구 화면에만 들어옴이 바로, 다른 채널에도, 새로고침은 조용히, 끊긴 뒤 5초에 나감", async () => {
    const [a, b] = [await visitor("가람"), await visitor("보리")];
    const store = getFriends();
    await store.request(a.id, b.id, Date.now());
    await store.accept(b.id, a.id, Date.now());

    const sa = await enter(a, "가람", 2); // 이미 와 있는 쪽 (다른 채널)
    await new Promise((r) => setTimeout(r, 1500)); // 로비가 2채널 인원을 알게
    let t = Date.now();
    const sb = await enter(b, "보리", 1);
    const got = await until(() => friendMsgs(sa, t)[0], 3000);
    expect(got?.m).toEqual({ t: "friend", key: friendKeyFor(b.id), name: "보리", on: true });
    expect(got!.at - t).toBeLessThan(1500);
    // 새로 들어온 쪽에는 아무것도 오지 않는다
    expect(friendMsgs(sb, t)).toEqual([]);
    // 이미 와 있는 쪽의 친구 목록 키와 같은 값이라 화면이 그 친구로 알아본다
    const p = (await (await presence.GET(req("/api/friends/presence", a))).json()) as FriendPresenceResponse;
    expect(p.friends.map((f) => f.key)).toContain(got!.m.key);

    // 새로고침: 끊고(비정상 종료와 같은 유예) 다시 입장 → 알림 없음
    t = Date.now();
    sb.ws.close(4000, "refresh");
    await new Promise((r) => setTimeout(r, 800));
    const sb2 = await enter(b, "보리", 1);
    await new Promise((r) => setTimeout(r, 6500));
    expect(friendMsgs(sa, t)).toEqual([]);

    // 나감: 끊긴 뒤 돌아오지 않으면 5초 남짓에 남아 있는 친구에게
    t = Date.now();
    sb2.ws.close(4000, "gone");
    const left = await until(() => friendMsgs(sa, t)[0], 9000);
    expect(left?.m).toMatchObject({ key: friendKeyFor(b.id), name: "보리", on: false });
    expect(left!.at - t).toBeGreaterThanOrEqual(4900);
    expect(left!.at - t).toBeLessThan(7000);
    sa.ws.close(1000);
  }, 40_000);
});
