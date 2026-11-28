import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RAFT_TICKET_MS } from "@tomb/protocol";
import { describeLog } from "@/lib/logText";
import type { MoveLogEntry } from "@/lib/moveLog";
import { getAccounts } from "@/lib/store";
import { getOpsLog } from "@/lib/store/opsLog";
import * as session from "../session/route";
import * as raft from "./raft/route";

// 11/28 관리자 접속 기록: 좌대 입장권 구매·연장 (산 뒤에만 한 줄 — 못 사면 남기지 않는다)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "RAFT_ENABLED", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("CAMP_ENABLED", "1");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

let ipSeq = 0;
const call = (path: string, cookie: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { cookie, "content-type": "application/json", "x-forwarded-for": `10.128.0.${++ipSeq}` }, body: JSON.stringify(body) });
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("좌대 입장권 기록", () => {
  it("구매·연장마다 한 줄 (채널·좌대·분·포인트·끝 시각), 실패는 남기지 않는다", async () => {
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.128.1.1" }, body: "{}" }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const id = ((await res.json()) as { visitorId: string }).visitorId;
    await getAccounts().enter(id, { name: "좌대손님", color: "#9fc5a8", body: "hood" }, Date.now());
    await getAccounts().adjustPoints(id, 5000);
    const t0 = Date.now();
    const buy = await raft.POST(call("/api/camp/raft", cookie, { op: "buy", ch: 9, n: 2 }));
    expect(buy.status, await buy.clone().text()).toBe(200);
    expect((await raft.POST(call("/api/camp/raft", cookie, { op: "renew" }))).status).toBe(409); // 아직 연장할 때가 아니다
    vi.spyOn(Date, "now").mockReturnValue(t0 + RAFT_TICKET_MS - 30_000);
    const rn = await raft.POST(call("/api/camp/raft", cookie, { op: "renew" }));
    expect(rn.status, await rn.clone().text()).toBe(200);
    vi.restoreAllMocks();
    await settle();
    const rows = (await getOpsLog().ofAccount("conn", id)).filter((e): e is MoveLogEntry => e.k === "mv");
    expect(rows.map((r) => r.m)).toEqual(["raftRenew", "raftBuy"]);
    expect(rows[1]).toEqual(expect.objectContaining({ ch: 9, n: 2, min: 120, pts: expect.any(Number), until: expect.any(Number), src: "s" }));
    expect(describeLog("conn", rows[1]).text).toMatch(/^좌대 입장권 구매 \(9채널 2번 좌대 · 120분 · [\d,]+P · \d\d:\d\d까지\)$/);
    expect(describeLog("conn", rows[0]).text).toMatch(/^좌대 입장권 연장 \(9채널 2번 좌대 · \+[\d,]+분 · [\d,]+P · \d\d:\d\d까지\)$/);
  });
});
