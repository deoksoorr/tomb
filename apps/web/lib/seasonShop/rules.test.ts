import { describe, expect, it } from "vitest";
import { itemById, seasonSetDef } from "@tomb/protocol";
import { furnitureById } from "../housing/catalog";
import { daysUntil, dropState, endText, itemSale, nextStart, saleRefusal, setBonusText, shopView, soonText } from "./rules";
import { COS_RELEASES, kstMs, SEASON_DROPS, SEASON_SALE_DAYS, type SeasonDrop } from "./schedule";

// 11/19 기간 한정 노점 일정 판정: 토요일(코디)·화요일(가구) 새벽 5시 경계 · 한 주 전 판매 예정 · 판매 끝 · 거절 규칙 · 문구

const DAY = 86_400_000;
const sat = kstMs(2026, 11, 21);
const fake: SeasonDrop[] = [
  { start: sat, kind: "cos", set: "a", setName: "가 세트", items: ["x1", "x2"], saleEnd: sat + 14 * DAY },
  { start: sat + 7 * DAY, kind: "cos", set: "a", setName: "가 세트", items: ["x3"], saleEnd: sat + 14 * DAY },
  { start: sat + 7 * DAY, kind: "cos", set: "b", setName: "나 세트", items: ["y1"], saleEnd: sat + 30 * DAY },
  { start: sat + 3 * DAY, kind: "furn", set: "f", setName: "가구 묶음", items: ["f1"], saleEnd: sat + 30 * DAY },
];

describe("판매 상태 (새벽 5시 경계)", () => {
  it("한 주 전부터 판매 예정, 토요일 05:00부터 판매 중, 판매 끝 시각부터 끝", () => {
    const d = fake[0];
    expect(dropState(d, sat - 7 * DAY - 1)).toBe("hidden");
    expect(dropState(d, sat - 7 * DAY)).toBe("soon");
    expect(dropState(d, sat - 1)).toBe("soon");
    expect(dropState(d, sat)).toBe("on");
    expect(dropState(d, d.saleEnd - 1)).toBe("on");
    expect(dropState(d, d.saleEnd)).toBe("ended");
  });

  it("실제 일정: 코디는 토요일, 가구는 화요일 새벽 5시 (한국 시각)", () => {
    for (const d of SEASON_DROPS) {
      const k = new Date(d.start + 9 * 3_600_000);
      expect(k.getUTCHours(), d.set).toBe(5);
      expect(k.getUTCMinutes()).toBe(0);
      expect(k.getUTCDay(), d.set).toBe(d.kind === "cos" ? 6 : 2);
      expect(d.saleEnd).toBeGreaterThan(d.start);
    }
    expect(SEASON_DROPS.find((d) => d.kind === "cos")!.start).toBe(Date.UTC(2026, 10, 20, 20)); // 11/21 05:00 KST
    // 11/20 세트마다 한 번에 풀고 딱 2주: 산타 견습 요정은 12/5부터 판매 예정 · 12/12부터 판매 · 12/25 판매일까지
    const santa = SEASON_DROPS.find((d) => d.set === "santa-intern")!;
    expect(dropState(santa, kstMs(2026, 12, 5) - 1)).toBe("hidden");
    expect(dropState(santa, kstMs(2026, 12, 5))).toBe("soon");
    expect(dropState(santa, kstMs(2026, 12, 12))).toBe("on");
    expect(dropState(santa, kstMs(2026, 12, 26) - 1)).toBe("on");
    expect(dropState(santa, kstMs(2026, 12, 26))).toBe("ended");
  });

  it("물건별 상태 (일정에 없으면 null, 종류가 다르면 null)", () => {
    expect(itemSale("cos", "x3", sat)?.state).toBeUndefined();
    expect(itemSale("cos", "x3", sat, fake)?.state).toBe("soon");
    expect(itemSale("furn", "x1", sat, fake)).toBeNull();
    expect(itemSale("furn", "f1", sat + 3 * DAY, fake)?.state).toBe("on");
  });
});

describe("판매 창 칸 (세트별)", () => {
  it("판매 중 칸과 판매 예정 칸, 정의 없는 id는 빠진다", () => {
    const v = shopView("cos", sat + DAY, (id) => id !== "x2", fake);
    expect(v.on).toEqual([{ set: "a", setName: "가 세트", state: "on", start: sat, saleEnd: sat + 14 * DAY, items: [{ id: "x1", start: sat, saleEnd: sat + 14 * DAY }] }]);
    expect(v.soon.map((g) => [g.set, g.items.map((i) => i.id)])).toEqual([
      ["a", ["x3"]],
      ["b", ["y1"]],
    ]);
    // 다음 주가 되면 같은 세트로 합쳐 판매 중
    const w = shopView("cos", sat + 7 * DAY, () => true, fake);
    expect(w.on.map((g) => [g.set, g.items.map((i) => i.id)])).toEqual([
      ["a", ["x1", "x2", "x3"]],
      ["b", ["y1"]],
    ]);
    expect(w.soon).toEqual([]);
    // 판매 끝난 세트는 사라진다
    expect(shopView("cos", sat + 14 * DAY, () => true, fake).on.map((g) => g.set)).toEqual(["b"]);
  });

  it("다음 묶음 시작", () => {
    expect(nextStart("cos", sat, fake)).toBe(sat + 7 * DAY);
    expect(nextStart("furn", sat + 4 * DAY, fake)).toBeNull();
  });
});

describe("문구", () => {
  it("남은 날은 게임 날짜(새벽 5시) 차이, 최소 1일", () => {
    const now = kstMs(2026, 11, 19, 22); // 목요일 밤
    expect(soonText(sat, now)).toBe("2일 뒤 가격 공개와 판매");
    expect(soonText(sat, sat - 60_000)).toBe("1일 뒤 가격 공개와 판매");
    expect(daysUntil(sat, kstMs(2026, 11, 21, 4))).toBe(1);
    expect(endText(kstMs(2027, 3, 1), kstMs(2027, 2, 28, 12))).toBe("판매 종료까지 1일");
    expect(endText(kstMs(2027, 3, 1), kstMs(2027, 2, 27, 3))).toBe("판매 종료까지 3일");
  });

  it("한 벌 덤 안내 (세트 정의가 있을 때만)", () => {
    expect(setBonusText("none")).toBe("");
    if (seasonSetDef("snow-commute")) {
      const t = setBonusText("snow-commute");
      expect(t).toMatch(/^한 벌을 다 입으면 /);
      expect(t).toContain("꾸미기 점수 +");
      expect(t).not.toMatch(/: /);
    }
  });
});

describe("서버 거절 규칙", () => {
  it("판매 예정·판매 끝·일정에 없음은 거절, 판매 중만 통과", () => {
    expect(saleRefusal("cos", "x1", sat, fake)).toBeNull();
    expect(saleRefusal("cos", "x3", sat, fake)).toMatchObject({ status: 409, code: "SEASON_SOON" });
    expect(saleRefusal("cos", "x3", sat, fake)!.message).toContain("7일 뒤");
    expect(saleRefusal("cos", "x1", sat + 14 * DAY, fake)).toMatchObject({ status: 409, code: "SEASON_ENDED" });
    // 11/20 한 주보다 이르더라도 다음 두 차례 안이면 판매 예정 (사기는 막는다)
    expect(saleRefusal("cos", "x1", sat - 8 * DAY, fake)).toMatchObject({ status: 409, code: "SEASON_SOON" });
    expect(saleRefusal("cos", "zz", sat, fake)).toMatchObject({ status: 400, code: "NOT_SOLD" });
    expect(saleRefusal("furn", "x1", sat, fake)).toMatchObject({ code: "NOT_SOLD" });
  });
});

describe("11/20 다음 두 차례 미리보기", () => {
  it("한 주보다 이른 묶음도 앞으로 두 차례 안이면 판매 예정, 세 번째 차례부터는 안 보인다", () => {
    const t = kstMs(2026, 11, 20);
    const cos = shopView("cos", t);
    expect(cos.on).toEqual([]);
    // 11/21 첫눈 출근길 다섯 점 + 11/28 야근 요정 다섯 점, 12/5 안개 묘지기는 아직
    expect(cos.soon.map((g) => g.set)).toEqual(["snow-commute", "overtime-fairy"]);
    expect(cos.soon.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(
      ["sc_breath", "sc_earflap", "sc_goguma", "sc_padding", "sc_snowduck", "of_a4wings", "of_antenna", "of_blueglow", "of_drink", "of_postit"].sort(),
    );
    const furn = shopView("furn", t);
    expect(furn.soon.map((g) => g.start)).toEqual([kstMs(2026, 11, 24), kstMs(2026, 12, 1)]);
  });
});

describe("일정의 물건이 카탈로그와 맞물린다 (정의가 들어온 것만 확인)", () => {
  it("코디는 계절 한정 꾸미기, 가구는 가구 카탈로그", () => {
    for (const d of SEASON_DROPS)
      for (const id of d.items) {
        if (d.kind === "cos") {
          const it = itemById(id);
          if (!it) continue;
          expect(it.kind, id).toBe("cosmetic");
          expect(it.seasonSet, id).toBe(d.set);
        } else if (furnitureById(id)) expect(furnitureById(id)!.price, id).toBeGreaterThan(0);
      }
  });
});

describe("11/20 계절 보따리상 코디 일정 (세트마다 한 번에, 2주씩)", () => {
  const DAY = 86_400_000;
  const cos = SEASON_DROPS.filter((d) => d.kind === "cos");
  it("열세 벌을 한 번씩, 출시 토요일 새벽 5시부터 딱 2주 (11/20 새 다섯 벌로 1월 빈 주를 채워 11/21 ~ 2/13 매주 한 벌)", () => {
    expect(cos.map((d) => d.set)).toEqual(COS_RELEASES.map((r) => r[0]));
    expect(new Set(cos.map((d) => d.set)).size).toBe(13);
    // 매주 끊김 없이 한 벌씩 (출시 간격 = 정확히 7일)
    for (let i = 1; i < cos.length; i++) expect(cos[i].start - cos[i - 1].start, cos[i].set).toBe(7 * DAY);
    for (const d of cos) {
      expect(d.saleEnd - d.start, d.set).toBe(SEASON_SALE_DAYS * DAY);
      const def = seasonSetDef(d.set);
      if (def) expect([...d.items].sort(), d.set).toEqual([...def.items].sort());
    }
    expect(cos.map((d) => [d.set, new Date(d.start + 9 * 3_600_000).toISOString().slice(0, 10), new Date(d.saleEnd + 9 * 3_600_000).toISOString().slice(0, 10)])).toEqual([
      ["snow-commute", "2026-11-21", "2026-12-05"],
      ["overtime-fairy", "2026-11-28", "2026-12-12"],
      ["fog-keeper", "2026-12-05", "2026-12-19"],
      ["santa-intern", "2026-12-12", "2026-12-26"],
      ["sports-day", "2026-12-19", "2027-01-02"],
      ["year-end", "2026-12-26", "2027-01-09"],
      ["sunrise-hike", "2027-01-02", "2027-01-16"],
      ["resolution", "2027-01-09", "2027-01-23"],
      ["smelt-fest", "2027-01-16", "2027-01-30"],
      ["frost-yard", "2027-01-23", "2027-02-06"],
      ["seollal-magpie", "2027-01-30", "2027-02-13"],
      ["giri-choco", "2027-02-06", "2027-02-20"],
      ["spring-picnic", "2027-02-13", "2027-02-27"],
    ]);
  });

  it("차례마다 판매 중 · 판매 예정 (토요일 새벽 5시 기준)", () => {
    const at = (y: number, m: number, d: number, h = 5) => {
      const v = shopView("cos", kstMs(y, m, d, h));
      return { on: v.on.map((g) => g.set), soon: v.soon.map((g) => g.set) };
    };
    expect(at(2026, 11, 21)).toEqual({ on: ["snow-commute"], soon: ["overtime-fairy", "fog-keeper"] });
    expect(at(2026, 11, 28)).toEqual({ on: ["snow-commute", "overtime-fairy"], soon: ["fog-keeper", "santa-intern"] });
    expect(at(2026, 12, 5)).toEqual({ on: ["overtime-fairy", "fog-keeper"], soon: ["santa-intern", "sports-day"] });
    expect(at(2026, 12, 12)).toEqual({ on: ["fog-keeper", "santa-intern"], soon: ["sports-day", "year-end"] });
    expect(at(2026, 12, 19)).toEqual({ on: ["santa-intern", "sports-day"], soon: ["year-end", "sunrise-hike"] });
    // 11/20 새 다섯 벌: 1월에도 늘 두 벌 판매 중 + 다음 두 벌 미리
    expect(at(2026, 12, 26)).toEqual({ on: ["sports-day", "year-end"], soon: ["sunrise-hike", "resolution"] });
    expect(at(2027, 1, 2)).toEqual({ on: ["year-end", "sunrise-hike"], soon: ["resolution", "smelt-fest"] });
    expect(at(2027, 1, 9)).toEqual({ on: ["sunrise-hike", "resolution"], soon: ["smelt-fest", "frost-yard"] });
    expect(at(2027, 1, 16)).toEqual({ on: ["resolution", "smelt-fest"], soon: ["frost-yard", "seollal-magpie"] });
    expect(at(2027, 1, 23)).toEqual({ on: ["smelt-fest", "frost-yard"], soon: ["seollal-magpie", "giri-choco"] });
    expect(at(2027, 1, 30)).toEqual({ on: ["frost-yard", "seollal-magpie"], soon: ["giri-choco", "spring-picnic"] });
    // 판매 시작 전날 밤은 판매 예정, 새벽 5시부터 판매 중 · 2주 뒤 새벽 5시부터 끝
    expect(at(2026, 12, 26, 4)).toEqual({ on: ["santa-intern", "sports-day"], soon: ["year-end", "sunrise-hike"] });
    expect(at(2027, 1, 9, 4).on).toContain("year-end");
    expect(at(2027, 1, 9).on).not.toContain("year-end");
    expect(saleRefusal("cos", "ye_raccoon", kstMs(2026, 12, 26, 4))).toMatchObject({ code: "SEASON_SOON" });
    expect(saleRefusal("cos", "ye_raccoon", kstMs(2026, 12, 26))).toBeNull();
    expect(saleRefusal("cos", "fr_cloak", kstMs(2027, 2, 6))).toMatchObject({ code: "SEASON_ENDED" });
    expect(at(2027, 2, 6)).toEqual({ on: ["seollal-magpie", "giri-choco"], soon: ["spring-picnic"] });
    expect(at(2027, 2, 13)).toEqual({ on: ["giri-choco", "spring-picnic"], soon: [] });
    expect(at(2027, 2, 20)).toEqual({ on: ["spring-picnic"], soon: [] });
    expect(at(2027, 2, 27)).toEqual({ on: [], soon: [] });
    // 판매 끝 전날 밤까지는 판매 중 (끝 = 2주 뒤 토요일 새벽 5시)
    expect(at(2026, 12, 5, 4).on).toContain("snow-commute");
    expect(saleRefusal("cos", "sc_earflap", kstMs(2026, 12, 5))).toMatchObject({ code: "SEASON_ENDED" });
    expect(endText(kstMs(2026, 12, 5), kstMs(2026, 11, 21))).toBe("판매 종료까지 14일");
  });
});
