import { NextRequest } from "next/server";
import type { InternalPerson } from "@tomb/protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/admin/dashboard/route";
import { campKinds, housingOf, housingRowsOf, loadDashboard, onlineOf, type AdminDashboardResponse } from "./adminDashboard";
import { onlineView } from "./adminOnlineView";
import { getHouseStore } from "./housing/service";
import { rememberMaint } from "./maintenance";
import { kstDay } from "./store/accounts";
import { getSignupSrc } from "./store/signupSrc";

// 11/26 관리자 대시보드 한 번에 (맵별 인원·분양 현황·가입 유입…)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_KEY", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  rememberMaint(null);
});

const person = (id: string, ch: number, extra: Partial<InternalPerson> = {}): InternalPerson => ({ visitorId: id, ch, sid: 1, name: id, x: 0, y: 0, ...extra });

describe("campKinds — 터 번호 → 종류별 수", () => {
  it("1~12 카라반, 13·14 펜션, 15·16 촌캉스, 모르는 번호는 뺀다", () => {
    expect(campKinds([1, "12", 13, 15, 16, 99, "x"])).toEqual({ caravan: 2, pension: 1, rural: 2 });
    expect(campKinds([])).toEqual({ caravan: 0, pension: 0, rural: 0 });
  });
});

describe("housingOf — 채널별 줄 → 합계", () => {
  it("빈 채널은 빼고 합계와 채널당 터 수를 낸다", () => {
    const h = housingOf(
      [
        { ch: 1, camp: { caravan: 3, pension: 1, rural: 0 }, sea: 2, village: 7 },
        { ch: 2, camp: { caravan: 0, pension: 0, rural: 0 }, sea: 0, village: 0 },
        { ch: 3, camp: { caravan: 1, pension: 0, rural: 2 }, sea: 0, village: 1 },
      ],
      5,
    );
    expect(h.rows.map((r) => r.ch)).toEqual([1, 3]);
    expect(h.total).toEqual({ camp: { caravan: 4, pension: 1, rural: 2 }, sea: 2, village: 8 });
    expect(h.cap).toEqual({ camp: { caravan: 12, pension: 2, rural: 2 }, sea: 11 });
  });
});

describe("housingRowsOf — 집 기록 → 채널별 줄", () => {
  it("구역별로 나누고, 번지 없는 집·없는 채널은 뺀다", () => {
    const rows = housingRowsOf(
      [
        { ch: 1, lot: 3 },
        { ch: 1, lot: 0 }, // 필지 대기 (번지 없음)
        { ch: 1, lot: 2, zone: "camp" },
        { ch: 1, lot: 14, zone: "camp" },
        { ch: 1, lot: 5, zone: "sea" },
        { ch: 3, lot: 1 },
        { ch: 99, lot: 1 },
      ],
      3,
    );
    expect(rows).toEqual([
      { ch: 1, camp: { caravan: 1, pension: 1, rural: 0 }, sea: 1, village: 1 },
      { ch: 2, camp: { caravan: 0, pension: 0, rural: 0 }, sea: 0, village: 0 },
      { ch: 3, camp: { caravan: 0, pension: 0, rural: 0 }, sea: 0, village: 1 },
    ]);
    expect(housingOf(rows, 0).rows.map((r) => r.ch)).toEqual([1, 3]);
  });
});

describe("onlineOf — 지금 명단 → 맵별·채널별", () => {
  it("실내는 「맵 · 곳」, 같은 계정은 한 번만, 많은 순", () => {
    const o = onlineOf([
      person("a", 1),
      person("b", 1, { map: "camp" }),
      person("c", 2, { map: "camp" }),
      person("d", 2, { map: "camp", inside: true, place: "hunt" }),
      person("a", 1),
    ]);
    expect(o.total).toBe(4);
    expect(o.byMap).toEqual([
      { label: "캠핑장", n: 2 },
      { label: "마을", n: 1 },
      { label: "캠핑장 · 사냥터", n: 1 },
    ]);
    expect(o.byCh).toEqual([
      { ch: 1, n: 2 },
      { ch: 2, n: 2 },
    ]);
  });
});

describe("loadDashboard — 한 칸이 실패해도 나머지는", () => {
  it("실시간 서버가 꺼져 있으면 online만 null, 가입 유입은 오늘·7일로 나눈다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const now = Date.now();
    const src = getSignupSrc();
    await src.save("acc-dash-1", { r: "google.com", at: now }, kstDay(now));
    await src.save("acc-dash-2", { r: "google.com", at: now - 3 * 86_400_000 }, kstDay(now - 3 * 86_400_000));
    const d = await loadDashboard(now);
    expect(d.online).toBeNull();
    expect(d.maint?.on).toBe(false);
    expect(d.concept).toBe("default");
    expect(d.conn).not.toBeNull();
    const sum = (rows: { n: number }[] = []) => rows.reduce((a, r) => a + r.n, 0);
    expect(sum(d.signups?.today)).toBeGreaterThanOrEqual(1);
    expect(sum(d.signups?.week)).toBeGreaterThanOrEqual(sum(d.signups?.today) + 1);
    expect(d.housing?.cap.camp).toEqual({ caravan: 12, pension: 2, rural: 2 });
  });

  it("로컬 저장소의 캠핑장 집을 종류별로 센다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const store = getHouseStore();
    const now = Date.now();
    const mk = (n: number, lot: number, zone?: "camp" | "sea") =>
      store.create({ id: `dash-h${n}`, owner: `dash-o${n}`, name: "집", intro: "", ownerName: "주인", tier: "small", ch: 4, lot, now, zone, ...(zone === "camp" ? { camp: { kind: lot > 12 ? "pension" : "caravan", yard: 1 } as const } : {}) });
    await mk(1, 2, "camp");
    await mk(2, 13, "camp");
    await mk(3, 1, "sea");
    const d = await loadDashboard(now + 120_000); // 1분 기억 밖
    const ch4 = d.housing?.rows.find((r) => r.ch === 4);
    expect(ch4).toEqual({ ch: 4, camp: { caravan: 1, pension: 1, rural: 0 }, sea: 1, village: 0 });
  });
});

describe("GET /api/admin/dashboard", () => {
  const call = (headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/admin/dashboard", { headers });
  it("관리자 키 없으면 401", async () => {
    expect((await route.GET(call(), { params: Promise.resolve({}) })).status).toBe(401);
  });
  it("관리자면 모든 칸이 실린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const res = await route.GET(call({ "x-admin-key": "dev-admin" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminDashboardResponse;
    expect(Object.keys(body).sort()).toEqual(["at", "concept", "conn", "housing", "maint", "online", "signups"]);
  });
});

describe("onlineView — 「지금 접속」 큰 수·맵별·채널별은 같은 명단 하나에서", () => {
  const lobby = (total: number, chs: [number, number, boolean][]) => ({
    channels: chs.map(([id, count, open]) => ({ id, count, cap: 60, open })),
    total,
    totalCap: 300,
    maxChannels: 5,
    threshold: 50,
  });

  it("로비 수가 명단과 1명 달라도(들고 나는 사이) 큰 수 = 맵별 합 = 채널별 합", () => {
    const online = onlineOf([person("a", 1), person("b", 1, { map: "camp" }), person("c", 2), person("a", 1)]);
    // 로비는 한 명 더 들어온 뒤에 읽혔다
    const v = onlineView(online, lobby(4, [[1, 3, true], [2, 1, true], [3, 0, false]]));
    const mapSum = online.byMap.reduce((n, r) => n + r.n, 0);
    const chSum = v.channels.reduce((n, c) => n + c.n, 0);
    expect(v.total).toBe(3);
    expect(mapSum).toBe(3);
    expect(chSum).toBe(3);
    expect(v.channels).toEqual([
      { id: 1, n: 2, cap: 60 },
      { id: 2, n: 1, cap: 60 },
    ]);
    expect(v.cap).toBe(300);
  });

  it("열린 채널은 0명이어도, 로비에 아직 없는 채널은 명단에 있으면 보인다", () => {
    const v = onlineView(onlineOf([person("a", 4)]), lobby(0, [[1, 0, true], [2, 0, false]]));
    expect(v.channels).toEqual([
      { id: 1, n: 0, cap: 60 },
      { id: 4, n: 1, cap: null },
    ]);
  });

  it("받는 중이면 큰 수를 비워 두고(로비 수를 먼저 보였다가 바뀌지 않게), 명단을 못 읽었을 때만 로비 수", () => {
    expect(onlineView(undefined, lobby(7, [[1, 7, true]]))).toEqual({ total: null, cap: 300, channels: [] });
    expect(onlineView(null, lobby(7, [[1, 7, true], [2, 0, false]]))).toEqual({ total: 7, cap: 300, channels: [{ id: 1, n: 7, cap: 60 }] });
    expect(onlineView(null, null)).toEqual({ total: null, cap: null, channels: [] });
    expect(onlineView(onlineOf([]), null)).toEqual({ total: 0, cap: null, channels: [] });
  });
});
