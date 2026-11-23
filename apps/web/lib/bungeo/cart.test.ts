import { describe, expect, it } from "vitest";
import { isShopListed, ITEMS, itemById, permanentPrice, seasonSetsOfLook, ALLEY_SETS, ALLEY_BODIES, isAvatarBody } from "@tomb/protocol";
import { readFileSync } from "node:fs";
import { BUNGEO_BUY_RADIUS, BUNGEO_CALLS, BUNGEO_GOODS, BUNGEO_LAST_DAY, BUNGEO_SPOTS, bungeoCalls, bungeoCallsDue, bungeoDays, bungeoLastSpot, bungeoNear, bungeoOpen, bungeoOpenSpot, bungeoSpotOf, bungeoUpcoming, isBungeoDay } from "./cart";
import { SUNKEN_POOL } from "../forage/sunken";
import { CHEST_COSMETICS } from "../rpg/setGearRoll";
import { COSMETIC_DROPS } from "../rpg/catalog";
import { SEASON_DROPS } from "../seasonShop/schedule";
import { XMAS_BOX_TABLE } from "../xmas/box";
import { isGiftItem } from "../gifts";
import { ghostStock } from "../sea/ghostShip";
import { addDays } from "../gameDay";

// 11/22 골목 붕어빵 수레: 일정 순수 함수 · 판매 목록 · 다른 판매처에 안 섞이는지

/** 한국 시각 → ms */
const kst = (y: number, mo: number, d: number, h: number, mi = 0, sec = 0) => Date.UTC(y, mo - 1, d, h - 9, mi, sec);
const ALLEY_IDS = ITEMS.filter((i) => i.alley).map((i) => i.id);

describe("일정 (게임 날짜 기준 사흘에 한 번, 밤 10시 ~ 새벽 2시)", () => {
  it("첫날 20261122: 21:59 닫힘 · 22:00 열림 · 다음날 01:59 열림 · 02:00 닫힘", () => {
    expect(bungeoOpen(kst(2026, 11, 22, 21, 59))).toBe(false);
    expect(bungeoOpen(kst(2026, 11, 22, 22, 0))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 23, 1, 59))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 23, 2, 0))).toBe(false);
    // 같은 날 낮은 닫힘
    expect(bungeoOpen(kst(2026, 11, 22, 12, 0))).toBe(false);
  });
  it("11/22 운영자: 따로 여는 날 20261121 (11/21 22:00 ~ 11/22 02:00)", () => {
    expect(isBungeoDay("20261121")).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 21, 21, 59))).toBe(false);
    expect(bungeoOpen(kst(2026, 11, 22, 0, 10))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 22, 1, 59))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 22, 2, 0))).toBe(false);
    expect(isBungeoDay("20261118")).toBe(false);
  });
  it("20261123·24 닫힘, 20261125 열림, 첫날 전(11/19) 닫힘", () => {
    expect(bungeoOpen(kst(2026, 11, 23, 22, 30))).toBe(false);
    expect(bungeoOpen(kst(2026, 11, 24, 23, 0))).toBe(false);
    expect(bungeoOpen(kst(2026, 11, 25, 22, 0))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 26, 0, 30))).toBe(true);
    expect(bungeoOpen(kst(2026, 11, 19, 23, 0))).toBe(false);
    expect(isBungeoDay("20261128")).toBe(true);
    expect(isBungeoDay("20261127")).toBe(false);
  });
  it("마지막은 2027-02-28 게임 날짜까지, 2027-03-01 이후엔 없음", () => {
    // 20261122부터 3일 간격 → 20270227이 마지막 여는 날 (98일 = 3×32 + 2 → 2/28은 아님)
    let last = "";
    for (let d = "20261122"; d <= "20270310"; d = addDays(d, 1)) if (isBungeoDay(d)) last = d;
    expect(last <= BUNGEO_LAST_DAY).toBe(true);
    expect(last >= "20270226").toBe(true);
    for (let d = "20270301"; d <= "20271231"; d = addDays(d, 1)) expect(isBungeoDay(d), d).toBe(false);
    expect(bungeoUpcoming(kst(2027, 3, 1, 12, 0))).toEqual([]);
  });
  it("다음 출현 목록: 지금 열려 있으면 이번 것부터, 5번 · 3일 간격 · 22:00~02:00", () => {
    const now = kst(2026, 11, 21, 12, 0);
    const next = bungeoUpcoming(now, 5);
    expect(next.map((s) => s.day)).toEqual(["20261121", "20261122", "20261125", "20261128", "20261201"]);
    expect(next[1].opensAt).toBe(kst(2026, 11, 22, 22, 0));
    expect(next[1].closesAt).toBe(kst(2026, 11, 23, 2, 0));
    // 11/23 자리 이름은 회차마다 그 회차 자리 (bungeoSpotOf)
    expect(next.map((s) => s.spot)).toEqual(next.map((s) => bungeoSpotOf(s.day).name));
    expect(bungeoUpcoming(kst(2026, 11, 22, 0, 10), 2).map((s) => s.day)).toEqual(["20261121", "20261122"]);
    expect(bungeoUpcoming(kst(2026, 11, 22, 3, 0), 1)[0].day).toBe("20261122");
    expect(bungeoUpcoming(kst(2026, 11, 23, 1, 0), 1)[0].day).toBe("20261122");
    expect(bungeoUpcoming(kst(2026, 11, 23, 3, 0), 1)[0].day).toBe("20261125");
  });
});

describe("11/23 회차마다 무작위 자리 (씨앗 = 게임 날짜)", () => {
  const days = bungeoDays();
  const SEQ = ["fence", "seaRocks", "fence", "alley", "fence", "seaLot1"];
  it("출현 날짜 목록: 따로 여는 날 + 3일 간격, 오름차순·중복 없음", () => {
    expect(days[0]).toBe("20261121");
    expect(days[1]).toBe("20261122");
    expect(days[days.length - 1] <= BUNGEO_LAST_DAY).toBe(true);
    expect([...days].sort()).toEqual([...days]);
    expect(new Set(days).size).toBe(days.length);
    for (const d of days) expect(isBungeoDay(d), d).toBe(true);
  });
  it("결정적: 같은 날짜는 언제 물어도 같은 자리 (순서·캐시와 상관없이)", () => {
    const a = days.map((d) => bungeoSpotOf(d).id);
    const b = [...days].reverse().map((d) => bungeoSpotOf(d).id).reverse();
    expect(b).toEqual(a);
    // 고정값 (씨앗·뽑기 규칙이 바뀌면 운영자 일정이 바뀐다 — 일부러 바꿀 때만 고친다)
    expect(a.slice(0, 6)).toEqual(SEQ);
  });
  it("바로 앞 회차와 같은 자리는 안 나온다", () => {
    for (let i = 1; i < days.length; i++) expect(bungeoSpotOf(days[i]).id, `${days[i - 1]} → ${days[i]}`).not.toBe(bungeoSpotOf(days[i - 1]).id);
  });
  it("시즌 전체로 다섯 자리가 고루 (자리마다 3번 이상, 한 자리가 40%를 넘지 않음) · 바닷가도 나온다", () => {
    const count = new Map<string, number>();
    for (const d of days) count.set(bungeoSpotOf(d).id, (count.get(bungeoSpotOf(d).id) ?? 0) + 1);
    for (const s of BUNGEO_SPOTS) expect(count.get(s.id) ?? 0, s.id).toBeGreaterThanOrEqual(3);
    for (const [id, n] of count) expect(n / days.length, id).toBeLessThanOrEqual(0.4);
    expect(days.some((d) => bungeoSpotOf(d).map === "sea")).toBe(true);
    expect(days.some((d) => bungeoSpotOf(d).map === "village")).toBe(true);
  });
  it("운영자 일정: 회차마다 그 회차 자리 이름, 다섯 회차에 두 곳 이상", () => {
    const next = bungeoUpcoming(kst(2026, 11, 23, 12, 0), 5);
    expect(next.map((s) => s.spot)).toEqual(next.map((s) => bungeoSpotOf(s.day).name));
    expect(new Set(next.map((s) => s.spot)).size).toBeGreaterThanOrEqual(2);
  });
  it("열린 동안만 지금 자리, 닫히면 null · 바퀴 자국은 가장 최근 회차 자리", () => {
    const d = "20261125";
    expect(bungeoOpenSpot(kst(2026, 11, 25, 22, 30))).toBe(bungeoSpotOf(d));
    expect(bungeoOpenSpot(kst(2026, 11, 25, 21, 0))).toBeNull();
    expect(bungeoLastSpot(kst(2026, 11, 25, 21, 0))).toBe(bungeoSpotOf("20261122"));
    expect(bungeoLastSpot(kst(2026, 11, 26, 3, 0))).toBe(bungeoSpotOf(d));
    expect(bungeoLastSpot(kst(2026, 11, 20, 12, 0))).toBeNull();
  });
  it("자리를 새로 더해도(from) 그 전 회차 자리는 그대로 — from 이전 날짜는 뽑기에 안 들어간다", () => {
    const late = BUNGEO_SPOTS.filter((s) => s.from);
    for (const s of late) for (const d of days) if (d < s.from!) expect(bungeoSpotOf(d).id).not.toBe(s.id);
  });
});

describe("11/23 서버 구매 자리 확인 (그 회차 맵 · 수레에서 64px 안)", () => {
  // 바닷가 회차 하나 · 마을 회차 하나
  const days = bungeoDays();
  const seaDay = days.find((d) => d >= "20261125" && bungeoSpotOf(d).map === "sea")!;
  const vilDay = days.find((d) => d >= "20261125" && bungeoSpotOf(d).map === "village")!;
  const openAt = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), 22 - 9, 30);
  it("가까우면 된다, 멀거나 다른 맵·자리 없음·닫힌 시간이면 안 된다", () => {
    for (const d of [seaDay, vilDay]) {
      const s = bungeoSpotOf(d);
      const now = openAt(d);
      expect(bungeoNear(now, { map: s.map, x: s.x + 10, y: s.y + 40 }), d).toBe(true);
      expect(bungeoNear(now, { map: s.map, x: s.x, y: s.y + BUNGEO_BUY_RADIUS })).toBe(true);
      expect(bungeoNear(now, { map: s.map, x: s.x, y: s.y + BUNGEO_BUY_RADIUS + 1 })).toBe(false);
      expect(bungeoNear(now, { map: s.map === "sea" ? "village" : "sea", x: s.x, y: s.y })).toBe(false);
      expect(bungeoNear(now, { map: "camp", x: s.x, y: s.y })).toBe(false);
      expect(bungeoNear(now, null)).toBe(false);
      expect(bungeoNear(now, { map: s.map })).toBe(false);
      expect(bungeoNear(now - 2 * 3600_000, { map: s.map, x: s.x, y: s.y })).toBe(false);
      // 다른 자리 (같은 맵이어도) 는 안 된다
      for (const o of BUNGEO_SPOTS) if (o.id !== s.id) expect(bungeoNear(now, { map: o.map, x: o.x, y: o.y + 30 }), o.id).toBe(false);
    }
  });
});

describe("11/23 외침은 맵을 가리지 않는다 (마을·바닷가·캠핑장)", () => {
  it("bungeoCallsDue는 시각만 보고, 외침 줄에는 자리 이름·맵 이름이 없다", () => {
    const at = kst(2026, 11, 25, 22, 0, 30);
    expect(bungeoCallsDue(at).map((c) => c.text)).toEqual([BUNGEO_CALLS[0]]);
    expect(bungeoCallsDue(kst(2026, 11, 25, 22, 2))).toEqual([]);
    const words = ["마을", "바닷가", "포구", "캠핑", "묘역", "연못", "빌딩", "등대", "터", "갯바위", "골목", "철책", "단풍"];
    for (const t of BUNGEO_CALLS) for (const w of words) expect(t.includes(w), `${t} ${w}`).toBe(false);
  });
  it("화면 컴포넌트(BungeoCalls)가 맵으로 거르지 않는다", () => {
    const src = readFileSync(new URL("../../components/bungeo/BungeoCalls.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/map:changed|=== "village"|!== "village"/);
    expect(src).toContain("bungeoCallsDue");
  });
});

describe("11/22 마을 채팅 외침 (2시간마다)", () => {
  it("여는 날 22:00 · 00:00 두 번, 두 말을 차례로, 닫힌 날은 없음", () => {
    const c = bungeoCalls("20261122");
    expect(c.map((x) => x.at)).toEqual([kst(2026, 11, 22, 22, 0), kst(2026, 11, 23, 0, 0)]);
    expect(c.map((x) => x.text)).toEqual([...BUNGEO_CALLS]);
    expect(new Set(c.map((x) => x.key)).size).toBe(2);
    expect(bungeoCalls("20261123")).toEqual([]);
    expect(bungeoCalls("20261121").map((x) => x.at)).toEqual([kst(2026, 11, 21, 22, 0), kst(2026, 11, 22, 0, 0)]);
  });
});

describe("판매 목록 · 값 고정 · 영구만", () => {
  it("13가지: 외형 1 + 꾸미기 12, 값은 운영자 결정 그대로", () => {
    expect(BUNGEO_GOODS).toHaveLength(13);
    expect(Object.fromEntries(BUNGEO_GOODS.map((g) => [g.id, g.price]))).toEqual({
      vendor: 15000,
      kc_cap: 6000,
      kc_hoodie: 10000,
      kc_phones: 5000,
      kc_icecoffee: 8000,
      kc_sneaker: 5000,
      kd_beanie: 6000,
      kd_coat: 10000,
      kd_muffler: 5000,
      kd_bungeo: 8000,
      kd_lights: 8000,
      kn_cable: 10000,
      kn_fleece: 10000,
    });
    expect(ALLEY_IDS.sort()).toEqual(BUNGEO_GOODS.filter((g) => g.kind === "cosmetic").map((g) => g.id).sort());
    // 꾸미기 점수용 price × 4 = 판매 값
    for (const g of BUNGEO_GOODS) if (g.kind === "cosmetic") expect(itemById(g.id)!.price * 4, g.id).toBe(g.price);
    expect(isAvatarBody("vendor")).toBe(true);
    expect(ALLEY_BODIES.map((b) => b.id)).toEqual(["vendor"]);
  });
  it("세트 덤 칭호: 캠퍼스 후드핏 → 얼죽아(t_ssCampus) · 겨울 데이트룩 → t_ssDate", () => {
    expect(ALLEY_SETS.map((s) => [s.id, s.title])).toEqual([
      ["campus-hoodie", "t_ssCampus"],
      ["winter-date", "t_ssDate"],
    ]);
    expect(seasonSetsOfLook([...ALLEY_SETS[0].items]).map((s) => s.id)).toEqual(["campus-hoodie"]);
    expect(seasonSetsOfLook(ALLEY_SETS[1].items.slice(0, 4))).toEqual([]);
  });
});

describe("수레에서만 — 잡화점·계절 보따리상·상자·선물 목록에 안 나온다", () => {
  it("잡화점 목록·영구 값 표에 없음", () => {
    for (const id of ALLEY_IDS) {
      expect(isShopListed(itemById(id)!), id).toBe(false);
      expect(permanentPrice(id), id).toBeNull();
    }
  });
  it("낚시 보물·사냥 상자·드롭·유령선 장터·계절 보따리상·크리스마스 상자·관리자 선물에 없음", () => {
    const pools = [SUNKEN_POOL.map((i) => i.id), CHEST_COSMETICS.map((i) => i.id), COSMETIC_DROPS, SEASON_DROPS.flatMap((d) => [...d.items]), XMAS_BOX_TABLE.map((r) => r.id)];
    for (let w = 0; w < 30; w++) pools.push(ghostStock(addDays("20261116", w * 7)).map((s) => s.id));
    for (const id of ALLEY_IDS) {
      for (const p of pools) expect(p.includes(id), id).toBe(false);
      expect(isGiftItem(id), id).toBe(false);
    }
  });
});
