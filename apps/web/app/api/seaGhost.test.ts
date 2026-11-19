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

  it("11/19 운영자가 부르면 그 채널 모두에게 (보이기·장터) · 다른 채널은 그대로 · 일반 계정은 403 · 3시간 뒤 시간표대로", async () => {
    const t0 = kst(2026, 11, 18, 14, 0); // 수요일 낮 (시간표로는 닫혀 있어요)
    at(t0);
    const plain = await newVisitor();
    expect((await ghostCall.POST(req("/api/sea/ghost/call", plain, { call: "on", ch: 3 }))).status).toBe(403);
    const op = await newVisitor();
    await setStaff(op.id);
    try {
      // 채널을 안 주거나 이상하면 400
      expect((await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "on" }))).status).toBe(400);
      expect((await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "on", ch: 999 }))).status).toBe(400);
      const on = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "on", ch: 3 }))).json()) as GhostStatus;
      expect(on).toMatchObject({ open: true, phase: "docked", staff: true, call: "on" });
      // 같은 채널의 일반 계정도 열려 있고 살 수 있어요
      const mine = (await (await ghost.GET(req("/api/sea/ghost?ch=3", plain))).json()) as GhostStatus;
      expect(mine).toMatchObject({ open: true, phase: "docked", call: "on" });
      expect(mine.staff).toBeUndefined();
      const key = on.items.find((r) => r.kind === "cosmetic")!.key;
      expect((await ghost.POST(req("/api/sea/ghost", plain, { key, ch: 3 }))).status).toBe(200);
      // 가벼운 상태 GET (모두가 바닷가에서 본다)
      expect(await (await ghostCall.GET(req("/api/sea/ghost/call?ch=3", plain))).json()).toEqual({ ch: 3, call: "on" });
      expect((await ghostCall.GET(req("/api/sea/ghost/call?ch=0", plain))).status).toBe(400);
      // 다른 채널·채널 모름은 시간표대로 (닫혀 있어요)
      expect(await (await ghostCall.GET(req("/api/sea/ghost/call?ch=4", plain))).json()).toEqual({ ch: 4, call: null });
      expect(((await (await ghost.GET(req("/api/sea/ghost?ch=4", plain))).json()) as GhostStatus).open).toBe(false);
      expect(((await (await ghost.GET(req("/api/sea/ghost", plain))).json()) as GhostStatus).open).toBe(false);
      const other = on.items.find((r) => r.kind === "cosmetic" && r.key !== key)!.key;
      expect((await ghost.POST(req("/api/sea/ghost", plain, { key: other, ch: 4 }))).status).toBe(409);
      // 보내기는 그 채널 모두에게서 숨겨요
      const off = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "off", ch: 3 }))).json()) as GhostStatus;
      expect(off).toMatchObject({ open: false, phase: "away", call: "off" });
      expect(((await (await ghost.GET(req("/api/sea/ghost?ch=3", plain))).json()) as GhostStatus).phase).toBe("away");
      const back = (await (await ghostCall.POST(req("/api/sea/ghost/call", op, { call: null, ch: 3 }))).json()) as GhostStatus;
      expect(back.call).toBeNull();
      // 다시 부르고 3시간이 지나면 저절로 시간표대로
      await ghostCall.POST(req("/api/sea/ghost/call", op, { call: "on", ch: 3 }));
      at(t0 + 3 * 3_600_000 + 60_000);
      expect(await (await ghostCall.GET(req("/api/sea/ghost/call?ch=3", plain))).json()).toEqual({ ch: 3, call: null });
    } finally {
      await setStaff(null);
    }
  });
});
