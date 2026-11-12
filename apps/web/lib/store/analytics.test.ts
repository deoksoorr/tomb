import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { buildReport } from "../analyticsReport";
import { env } from "../env";
import { FIELD_CAP, MemoryAnalytics, RedisAnalytics, type AnalyticsStore, type HitRecord } from "./analytics";

// 47번 방문 분석 저장소 계약. 메모리는 늘 돌고, 실제 Redis(일회용 DB 환경변수)가 있으면 같은 계약을 Redis Lua로도 돌린다.
// 날짜는 테스트마다 먼 미래의 무작위 날짜를 써서 실제 Redis에서도 다른 데이터와 섞이지 않게 한다.

function hit(over: Partial<HitRecord> = {}): HitRecord {
  return {
    day: "20991231",
    hour: 14,
    visitor: "v1",
    isNew: true,
    ref: "search",
    domain: "google.com",
    utm: null,
    landing: "/",
    device: "mobile",
    browser: "크롬",
    country: "KR",
    ...over,
  };
}

/** 2100년대 아무 날 (실제 Redis에서 겹치지 않게) */
function freshDay(): string {
  const n = Math.floor(Math.random() * 300);
  return new Date(Date.UTC(2100 + Math.floor(n / 100), n % 12, 1 + (n % 27))).toISOString().slice(0, 10).replaceAll("-", "") + "";
}

function contract(name: string, make: () => AnalyticsStore) {
  describe(name, () => {
    it("방문: 세션 수·신규/재방문·분류 카운터, 고유 방문자는 겹치지 않게", async () => {
      const s = make();
      const day = freshDay();
      const p = nanoid(6);
      await s.hit(hit({ day, visitor: `${p}a` }));
      await s.hit(hit({ day, visitor: `${p}a`, isNew: false, ref: "direct", domain: null }));
      await s.hit(hit({ day, visitor: `${p}b`, hour: 15, ref: "messenger", domain: "discord.com", utm: "discord / chat / launch", device: "desktop", browser: "사파리", country: "JP", landing: "/privacy" }));
      const [d] = await s.days([day]);
      expect(d.uniques).toBe(2);
      expect(d.fields.v).toBe(3);
      expect(d.fields["v:new"]).toBe(2);
      expect(d.fields["v:ret"]).toBe(1);
      expect(d.fields["h:14:v"]).toBe(2);
      expect(d.fields["h:15:v"]).toBe(1);
      expect(d.fields["ref:search"]).toBe(1);
      expect(d.fields["ref:messenger"]).toBe(1);
      expect(d.fields["dom:google.com"]).toBe(1);
      expect(d.fields["dom:discord.com"]).toBe(1);
      expect(d.fields["utm:discord / chat / launch"]).toBe(1);
      expect(d.fields["land:/privacy"]).toBe(1);
      expect(d.fields["dev:mobile"]).toBe(2);
      expect(d.fields["br:사파리"]).toBe(1);
      expect(d.fields["cc:JP"]).toBe(1);
      expect(await s.hourUniques([[day, 14], [day, 15], [day, 16]])).toEqual([1, 1, 0]);
    });

    it("여러 날 고유 방문자는 합집합으로 센다 (주·월)", async () => {
      const s = make();
      const a = freshDay();
      let b = freshDay();
      while (b === a) b = freshDay();
      const p = nanoid(6);
      await s.hit(hit({ day: a, visitor: `${p}1` }));
      await s.hit(hit({ day: a, visitor: `${p}2` }));
      await s.hit(hit({ day: b, visitor: `${p}2` }));
      await s.hit(hit({ day: b, visitor: `${p}3` }));
      expect(await s.uniqueOver([[a], [b], [a, b], []])).toEqual([2, 2, 3, 0]);
    });

    it("사건·체류·동시 접속 최고값", async () => {
      const s = make();
      const day = freshDay();
      await s.bump(day, 9, "signup");
      await s.bump(day, 9, "signup");
      await s.bump(day, 10, "grave");
      await s.bump(day, 10, "hunt");
      await s.stay(day, 9, 120);
      await s.stay(day, 9, 30);
      await s.concurrent(day, 9, 4);
      await s.concurrent(day, 9, 2);
      await s.concurrent(day, 9, 7);
      await s.concurrent(day, 10, 0);
      const [d] = await s.days([day]);
      expect(d.fields.signup).toBe(2);
      expect(d.fields["h:09:signup"]).toBe(2);
      expect(d.fields.grave).toBe(1);
      expect(d.fields["h:10:hunt"]).toBe(1);
      expect(d.fields.stay).toBe(150);
      expect(d.fields["h:09:stay"]).toBe(150);
      expect(d.peaks).toEqual({ "09": 7, "10": 0 });
    });

    it("값이 열린 필드는 하루 상한을 넘으면 새 이름을 만들지 않는다 (있던 이름은 계속 센다)", async () => {
      const s = make();
      const day = freshDay();
      // 고정 필드 몇 개 + 도메인 이름을 상한 가까이 채운다
      for (let i = 0; i < FIELD_CAP; i++) await s.hit(hit({ day, visitor: "x", domain: `d${i}.example` }));
      const before = (await s.days([day]))[0].fields;
      expect(Object.keys(before).length).toBeLessThanOrEqual(FIELD_CAP + 2);
      await s.hit(hit({ day, visitor: "x", domain: "brand-new.example" }));
      await s.hit(hit({ day, visitor: "x", domain: "d0.example" }));
      const after = (await s.days([day]))[0].fields;
      expect(after["dom:brand-new.example"]).toBeUndefined();
      expect(after["dom:d0.example"]).toBe(2);
      expect(after.v).toBe(FIELD_CAP + 2);
    }, 120_000);

    it("표본 잠금은 간격 안에서 한 번만", async () => {
      const s = make();
      const now = Date.now();
      const first = await s.lockSample(1500, now);
      const second = await s.lockSample(1500, now + 10);
      expect([first, second]).toEqual([true, false]);
    });
  });
}

contract("47번 방문 분석 저장소 (메모리)", () => new MemoryAnalytics());
const conn = env.redis();
if (conn) contract("47번 방문 분석 저장소 (실제 Redis)", () => new RedisAnalytics(conn));

describe("47번 보고서", () => {
  it("오늘 요약·기간 차트·유입 순위", async () => {
    const s = new MemoryAnalytics();
    const now = Date.UTC(2026, 10, 12, 3); // KST 11/12 12시
    const day = "20261112";
    await s.hit(hit({ day, hour: 12, visitor: "a" }));
    await s.hit(hit({ day, hour: 12, visitor: "b", isNew: false, ref: "direct", domain: null, device: "desktop" }));
    await s.hit(hit({ day, hour: 11, visitor: "a", isNew: false, ref: "sns", domain: "t.co" }));
    await s.hit(hit({ day: "20261111", hour: 20, visitor: "c" }));
    await s.stay(day, 12, 300);
    await s.concurrent(day, 12, 5);
    await s.concurrent("20261111", 20, 9);
    await s.bump(day, 12, "signup");

    const r = await buildReport(s, "day", now);
    expect(r.today).toMatchObject({ visitors: 2, visits: 3, newVisits: 1, returningVisits: 2, peak: 5, signups: 1, avgStaySec: 100 });
    expect(r.series).toHaveLength(30);
    expect(r.series[29]).toMatchObject({ label: "11/12", visitors: 2, visits: 3, peak: 5 });
    expect(r.series[28]).toMatchObject({ label: "11/11", visitors: 1, peak: 9 });
    expect(r.referrers.find((x) => x.cat === "search")?.count).toBe(2);
    expect(r.referrers.map((x) => x.cat)).toEqual(["direct", "search", "sns", "messenger", "other"]);
    expect(r.domains[0]).toEqual({ key: "google.com", count: 2 });
    expect(r.devices).toEqual([{ key: "mobile", count: 3 }, { key: "desktop", count: 1 }]);

    const h = await buildReport(s, "hour", now);
    expect(h.series).toHaveLength(24);
    expect(h.series[23]).toMatchObject({ label: "12시", visitors: 2, visits: 2, peak: 5, avgStaySec: 150 });
    expect(h.series[22]).toMatchObject({ label: "11시", visitors: 1, visits: 1 });
    expect(h.series[15]).toMatchObject({ label: "4시" });
    expect(h.breakdownLabel).toBe("오늘");

    const w = await buildReport(s, "week", now);
    expect(w.series[11]).toMatchObject({ visitors: 3, visits: 4, peak: 9 });
    const m = await buildReport(s, "month", now);
    expect(m.series[2]).toMatchObject({ label: "2026.11", visitors: 3 });
  });
});
