import { describe, expect, it } from "vitest";
import { isShopListed, ITEMS, itemById, permanentPrice, seasonSetsOfLook, ALLEY_SETS, ALLEY_BODIES, isAvatarBody } from "@tomb/protocol";
import { BUNGEO_GOODS, BUNGEO_LAST_DAY, bungeoOpen, bungeoUpcoming, isBungeoDay } from "./cart";
import { SUNKEN_POOL } from "../forage/sunken";
import { CHEST_COSMETICS } from "../rpg/setGearRoll";
import { COSMETIC_DROPS } from "../rpg/catalog";
import { SEASON_DROPS } from "../seasonShop/schedule";
import { XMAS_BOX_TABLE } from "../xmas/box";
import { isGiftItem } from "../gifts";
import { ghostStock } from "../sea/ghostShip";
import { addDays } from "../gameDay";
import { BUNGEO_HINTS, pickFortune } from "../wish";

// 11/22 골목 붕어빵 수레: 일정 순수 함수 · 판매 목록 · 다른 판매처에 안 섞이는지 · 운세 실마리

/** 한국 시각 → ms */
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);
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
    expect(bungeoUpcoming(kst(2026, 11, 22, 0, 10), 2).map((s) => s.day)).toEqual(["20261121", "20261122"]);
    expect(bungeoUpcoming(kst(2026, 11, 22, 3, 0), 1)[0].day).toBe("20261122");
    expect(bungeoUpcoming(kst(2026, 11, 23, 1, 0), 1)[0].day).toBe("20261122");
    expect(bungeoUpcoming(kst(2026, 11, 23, 3, 0), 1)[0].day).toBe("20261125");
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

describe("소원 분수 운세 실마리 (여는 게임 날짜에만)", () => {
  it("실마리 난수가 없으면(다른 날) 절대 안 붙고, 여는 날엔 확률 안에서만 붙는다", () => {
    const has = (t: string) => BUNGEO_HINTS.some((h) => t.includes(h));
    for (let i = 0; i < 50; i++) expect(has(pickFortune(i / 50, (i * 7) % 50 / 50, null).text)).toBe(false);
    expect(has(pickFortune(0.5, 0.5, 0.1).text)).toBe(true);
    expect(has(pickFortune(0.5, 0.5, 0.39).text)).toBe(true);
    expect(has(pickFortune(0.5, 0.5, 0.4).text)).toBe(false);
    expect(has(pickFortune(0.5, 0.5, 0.99).text)).toBe(false);
  });
});
