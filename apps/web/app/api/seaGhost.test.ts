import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentUntil } from "@tomb/protocol";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { prevWeek } from "@/lib/gameDay";
import { primeChampCache } from "@/lib/store/champ";
import { getAccounts } from "@/lib/store";
import { setStaff } from "@/lib/staff";
import { ghostStock, ghostWeek } from "@/lib/sea/ghostShip";
import type { GhostBuyResult, GhostStatus } from "@/lib/sea/ghostService";
import * as ghost from "./sea/ghost/route";
import * as ghostCall from "./sea/ghost/call/route";
import * as session from "./session/route";

// 11/17 유령선 특가 장터 서버 흐름: 정박 시간 밖 거절 · 운영자 시험 부르기 · 1인 1개 · 큰 할인 하나 · 가구는 집이 있어야

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.useRealTimers();
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const req = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(points = 20_000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.91.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
/** 한국 시각 → epoch ms (2026-11-21은 토요일) */
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
const at = (t: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(t);
};

describe("11/17 유령선 특가 장터 — 서버 흐름", () => {
  it("정박 시간 밖엔 거절하고, 토요일 밤 9시~11시엔 30% 싸게 팔아요 · 같은 물건은 한 사람 1개", async () => {
    at(kst(2026, 11, 18, 21, 30)); // 수요일
    const v = await newVisitor();
    const week = ghostWeek(Date.now());
    const cos = ghostStock(week).find((s) => s.kind === "cosmetic" && s.tag === "sale")!;
    const closed = await ghost.POST(req("/api/sea/ghost", v, { key: cos.key }));
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as { error: { code: string } }).error.code).toBe("GHOST_CLOSED");

    at(kst(2026, 11, 21, 21, 30)); // 토요일 밤
    const st = (await (await ghost.GET(req("/api/sea/ghost", v))).json()) as GhostStatus;
    expect(st.open).toBe(true);
    expect(st.items).toHaveLength(8);
    expect(st.staff).toBeUndefined();
    const row = st.items.find((r) => r.key === cos.key)!;
    expect(row.cost).toBe(Math.floor(cos.base * 0.7));
    const before = await pts(v.id);
    const ok = await ghost.POST(req("/api/sea/ghost", v, { key: cos.key }));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as GhostBuyResult;
    expect(before - (await pts(v.id))).toBe(row.cost);
    expect(body.items.find((r) => r.key === cos.key)!.bought).toBe(true);
    expect(body.me.stash.some((e) => e.itemId === cos.id && isPermanentUntil(e.until)) || body.me.equipped.some((e) => e.itemId === cos.id && isPermanentUntil(e.until))).toBe(true);
    expect(body.lookGrant).toBeTruthy();
    const again = await ghost.POST(req("/api/sea/ghost", v, { key: cos.key }));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe("ALREADY_BOUGHT");
    // 떠난 뒤엔 다시 거절
    at(kst(2026, 11, 21, 23, 1));
    const late = ghostStock(week).find((s) => s.kind === "cosmetic" && s.key !== cos.key)!;
    expect((await ghost.POST(req("/api/sea/ghost", v, { key: late.key }))).status).toBe(409);
  });

  it("포인트왕 20%와 겹치면 큰 할인 하나만 (한정은 유령선 할인 0 → 포인트왕 20%)", async () => {
    at(kst(2026, 11, 21, 22, 0));
    const v = await newVisitor();
    const now = Date.now();
    primeChampCache({ week: prevWeek(kstWeek(now)), winners: [{ board: "points", accountId: v.id, name: "1위", value: 1 }], settledAt: now }, now);
    const st = (await (await ghost.GET(req("/api/sea/ghost", v))).json()) as GhostStatus;
    const sale = st.items.find((r) => r.tag === "sale")!;
    const lim = st.items.find((r) => r.tag === "limited")!;
    const deal = st.items.find((r) => r.tag === "deal")!;
    expect(sale.rate).toBe(0.3);
    expect(deal.rate).toBe(0.5);
    expect(lim.rate).toBe(0.2);
    expect(lim.cost).toBe(Math.floor(lim.base * 0.8));
  });

  it("가구는 집이 있어야 사요 (없으면 NO_HOUSE, 자리는 풀려서 집을 산 뒤 다시 살 수 있어요)", async () => {
    at(kst(2026, 11, 21, 21, 10));
    const v = await newVisitor();
    const fur = ghostStock(ghostWeek(Date.now())).find((s) => s.kind === "furniture" && s.tag === "sale")!;
    const r = await ghost.POST(req("/api/sea/ghost", v, { key: fur.key }));
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("NO_HOUSE");
    const st = (await (await ghost.GET(req("/api/sea/ghost", v))).json()) as GhostStatus;
    expect(st.house).toBe(false);
    expect(st.items.find((x) => x.key === fur.key)!.bought).toBe(false);
  });

  it("운영자만 아무 때나 부르고 보내요 (일반 계정은 403, 부른 동안 운영자는 살 수 있어요)", async () => {
    at(kst(2026, 11, 18, 14, 0)); // 수요일 낮
    const plain = await newVisitor();
    expect((await ghostCall.POST(req("/api/sea/ghost/call", plain, { call: "on" }))).status).toBe(403);
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      const on = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "on" }))).json()) as GhostStatus;
      expect(on).toMatchObject({ open: true, phase: "docked", staff: true, call: "on" });
      // 일반 계정은 그대로 닫혀 있어요 (운영자 시험은 그 운영자에게만)
      expect(((await (await ghost.GET(req("/api/sea/ghost", plain))).json()) as GhostStatus).open).toBe(false);
      const key = on.items.find((r) => r.kind === "cosmetic")!.key;
      expect((await ghost.POST(req("/api/sea/ghost", op, { key }))).status).toBe(200);
      const off = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "off" }))).json()) as GhostStatus;
      expect(off).toMatchObject({ open: false, phase: "away", call: "off" });
      const back = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: null }))).json()) as GhostStatus;
      expect(back.call).toBeNull();
    } finally {
      await setStaff(null);
    }
  });
});
