import { describe, expect, it } from "vitest";
import { campLotByNo } from "@tomb/protocol";
import { campPrices, campRoom, campYardPrice, serverYardPrice, villaPrice } from "@/game/camp/campSaleApi";
import { fullSaleChannels } from "@/lib/housing/catalog";
import { campKindOf, campLotTag, campOfficeTitle, kindIntro, openChannelsLine, openSaleChannels, soldOutLine, yardChangeLine, yardHint } from "./campOfficeText";

// 11/26 분양 사무소 창(OfficeDialog zone "camp"): 값 정리(서버 prices가 없을 때의 규칙 값)·앞마당 안내 한 줄

describe("campPrices", () => {
  it("서버 값이 없으면 규칙대로: 무주택 = 기본 값, 별장 = 4/3 (10P 올림)", () => {
    const p = campPrices(undefined, false);
    expect(p.villa).toBe(false);
    expect([p.lots[1], p.lots[2], p.lots[8], p.lots[13], p.lots[15]]).toEqual([13_500, 11_250, 9_000, 9_000, 9_000]);
    expect("wide" in p).toBe(false);
    const v = campPrices(undefined, true);
    expect([v.lots[1], v.lots[2], v.lots[8], v.lots[13], v.lots[15]]).toEqual([18_000, 15_000, 12_000, 12_000, 12_000]);
    expect(villaPrice(9_000)).toBe(12_000);
  });
  it("11/26 값표 전체 (서버 catalog와 같다): 펜션·촌캉스·숲 쪽 45,000/60,000 · 강가 56,260/75,020 · 폭포 앞 67,500/90,000", () => {
    const p = campPrices(undefined, false);
    const v = campPrices(undefined, true);
    const row = (c: typeof p, lot: number) => [c.lots[lot], c.yard[lot][2], c.yard[lot][3]];
    for (const lot of [13, 14, 15, 16, 8]) {
      expect(row(p, lot), `${lot}`).toEqual([9_000, 13_500, 22_500]);
      expect(row(v, lot), `${lot}`).toEqual([12_000, 18_000, 30_000]);
    }
    expect(row(p, 2)).toEqual([11_250, 16_880, 28_130]);
    expect(row(v, 2)).toEqual([15_000, 22_510, 37_510]);
    expect(row(p, 1)).toEqual([13_500, 20_250, 33_750]);
    expect(row(v, 1)).toEqual([18_000, 27_000, 45_000]);
    const sum = (r: number[]) => r.reduce((a, b) => a + b, 0);
    expect([sum(row(p, 13)), sum(row(v, 13)), sum(row(p, 2)), sum(row(v, 2)), sum(row(p, 1)), sum(row(v, 1))]).toEqual([45_000, 60_000, 56_260, 75_020, 67_500, 90_000]);
    expect(campYardPrice(campLotByNo(8)!, 2)).toBe(13_500);
    expect(campYardPrice(campLotByNo(8)!, 2, true)).toBe(18_000);
    expect(yardHint(v.yard[2])).toBe("분양받은 뒤 앞마당으로 넓힐 수 있어요 (+22,510P · +37,510P)");
    expect(yardHint(p.yard[13])).toBe("분양받은 뒤 앞마당으로 넓힐 수 있어요 (+13,500P · +22,500P)");
  });
  it("11/26 방은 앞마당 단계로 커진다 (펜션·촌캉스 10×8 → 14×10 → 18×12, 카라반 10×6 → 12×7 → 14×8)", () => {
    expect([1, 2, 3].map((y) => campRoom("pension", y as 1 | 2 | 3))).toEqual([
      { w: 10, h: 8, maxItems: 30 },
      { w: 14, h: 10, maxItems: 50 },
      { w: 18, h: 12, maxItems: 80 },
    ]);
    expect(campRoom("rural", 3)).toEqual(campRoom("pension", 3));
    expect(campRoom("caravan", 2)).toEqual({ w: 12, h: 7, maxItems: 30 });
  });
  it("서버 값이 오면 그 값 그대로 (모양 두 가지 · villa는 서버가 먼저)", () => {
    const a = campPrices({ villa: true, lots: { 1: 111, 2: 222 }, yard: { 1: { 2: 5, 3: 6 } } }, false);
    expect(a.villa).toBe(true);
    expect([a.lots[1], a.lots[2]]).toEqual([111, 222]);
    expect(a.lots[3]).toBe(campPrices(undefined, true).lots[3]); // 빈 곳은 규칙 (별장)
    expect(a.yard[3]).toEqual(campPrices(undefined, true).yard[3]);
    expect(a.yard[1]).toEqual({ 2: 5, 3: 6 });
    const b = campPrices({ lots: [{ lot: 13, price: 999, yard2: 1, yard3: 2 }] }, false);
    expect(b.lots[13]).toBe(999);
    expect(b.yard[13]).toEqual({ 2: 1, 3: 2 });
  });
  it("서버 HousePrices 모양 (villa 구역별 · camp 터 배열 · upgrade·yard = 내 집 다음 값)", () => {
    const raw = {
      villa: { village: false, sea: false, camp: true },
      camp: [{ lot: 2, kind: "caravan", grade: "river", buy: 12_000, yard2: 2_700, yard3: 4_500 }],
      upgrade: null,
      yard: { to: 2, price: 2_700 },
    };
    const p = campPrices(raw, false);
    expect(p.villa).toBe(true);
    expect(p.lots[2]).toBe(12_000);
    expect(p.yard[2]).toEqual({ 2: 2_700, 3: 4_500 });
    expect(serverYardPrice(raw)).toBe(2_700);
    expect(serverYardPrice({ yard: null })).toBeNull();
  });
});

describe("앞마당 안내", () => {
  it("모든 종류가 방 크기 + 집마다 소품 (카라반 앉을 자리는 2 · 4 · 6)", () => {
    expect(yardChangeLine(campLotByNo(3)!, 1)).toBe("앉을 자리 2 → 4 · 방 10×6 → 12×7 · 옆 확장 칸·차양·바퀴 2쌍·접이식 탁자");
    expect(yardChangeLine(campLotByNo(3)!, 2)).toBe("앉을 자리 4 → 6 · 방 12×7 → 14×8 · 확장 칸 2개·긴 차양·줄전구·피크닉 탁자");
    expect(yardChangeLine(campLotByNo(13)!, 2)).toBe("앉을 자리 6 → 8 · 방 14×10 → 18×12 · 온수 스파·선베드·줄조명");
    expect(yardChangeLine(campLotByNo(15)!, 1)).toBe("앉을 자리 4 → 6 · 방 10×8 → 14×10 · 울타리 내어 치기·장독대·소반");
    expect(kindIntro("pension")).toContain("10×8칸");
    expect(kindIntro("pension")).toContain("14×10 → 18×12칸(가구 50 → 80개)");
    expect(kindIntro("rural")).not.toContain("넓히");
    expect(kindIntro("caravan")).toContain("10×6칸");
  });
});

describe("분양 NPC마다 자기 종류만", () => {
  it("창이 파는 종류: 말을 건 NPC(camp) → 카라반 (빈 터 E는 창을 열지 않는다)", () => {
    expect(campKindOf({ camp: "pension" })).toBe("pension");
    expect(campKindOf({ camp: "rural" })).toBe("rural");
    expect(campKindOf(null)).toBe("caravan");
  });
  it("창 제목은 NPC · 종류 하나, 터 카드의 자리 이름", () => {
    expect(campOfficeTitle("caravan")).toBe("언젠가 씨 · 카라반 분양");
    expect(campOfficeTitle("pension")).toBe("소슬댁 · 펜션 분양");
    expect(campOfficeTitle("rural")).toBe("순이 할머니 · 촌캉스 분양");
    expect(campLotTag(campLotByNo(1)!)).toBe("폭포 앞");
    expect(campLotTag(campLotByNo(5)!)).toBe("강가");
    expect(campLotTag(campLotByNo(8)!)).toBe("숲 쪽");
    expect(campLotTag(campLotByNo(13)!)).toBe("스파·테라스형");
    expect(campLotTag(campLotByNo(15)!)).toBe("싸리 울타리·장독대");
  });
});

describe("11/26 터가 다 찼을 때 (마을·포구·캠핑장 분양 창 모두 같은 안내)", () => {
  it("안내 문구: 받침에 맞게, 모든 창이 「지금 N채널에는 남은 ○○이 없어요. 다른 채널에서 찾아보세요.」", () => {
    expect(soldOutLine("village", 2)).toBe("지금 2채널에는 남은 마을 집이 없어요. 다른 채널에서 찾아보세요.");
    expect(soldOutLine("sea", 1)).toBe("지금 1채널에는 남은 오두막이 없어요. 다른 채널에서 찾아보세요.");
    expect(soldOutLine("pension", 3)).toBe("지금 3채널에는 남은 펜션이 없어요. 다른 채널에서 찾아보세요.");
    expect(soldOutLine("rural", 1)).toBe("지금 1채널에는 남은 촌캉스가 없어요. 다른 채널에서 찾아보세요.");
    expect(soldOutLine("caravan", 2)).toBe("지금 2채널에는 남은 카라반이 없어요. 다른 채널에서 찾아보세요.");
  });
  it("남은 채널: 보이는 채널 중 지금 채널·다 찬 채널을 뺀다 (모르면 null — 안 보여 준다)", () => {
    expect(openSaleChannels([1, 2, 3, 4], [1, 3], 3)).toEqual([2, 4]);
    expect(openSaleChannels([3, 1], [1], 3)).toEqual([]);
    expect(openSaleChannels(null, [1], 3)).toBeNull();
    expect(openSaleChannels([1, 2], null, 1)).toBeNull();
    expect(openChannelsLine("pension", [2, 4])).toBe("남은 펜션이 있는 채널: 2채널 · 4채널");
    expect(openChannelsLine("village", [5])).toBe("남은 마을 집이 있는 채널: 5채널");
    expect(openChannelsLine("rural", [])).toBe("다른 채널에도 남은 촌캉스가 없어요.");
  });
  it("서버 fullSaleChannels: 그 종류 터가 모두 찬 채널만 (2단지 번지·필지 대기 0번지·모르는 터는 세지 않는다)", () => {
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const houses = [
      ...[13, 14].map((lot) => ({ zone: "camp" as const, ch: 2, lot })),
      { zone: "camp" as const, ch: 3, lot: 13 },
      ...[15, 16].map((lot) => ({ zone: "camp" as const, ch: 1, lot })),
      ...range(1, 12).map((lot) => ({ zone: "camp" as const, ch: 5, lot })),
      { zone: "camp" as const, ch: 7, lot: 99 },
      // 포구 11터 다 참 (4채널), 6채널은 하나 빔
      ...range(1, 11).map((lot) => ({ zone: "sea" as const, ch: 4, lot })),
      ...range(1, 10).map((lot) => ({ zone: "sea" as const, ch: 6, lot })),
      // 마을 15번지 다 참 (8채널), 9채널은 2단지·0번지라 안 찬다
      ...range(1, 15).map((lot) => ({ ch: 8, lot })),
      ...range(1, 14).map((lot) => ({ zone: "village" as const, ch: 9, lot })),
      { ch: 9, lot: 0 },
      { ch: 9, lot: 40 },
    ];
    expect(fullSaleChannels(houses)).toEqual({ village: [8], sea: [4], caravan: [5], pension: [2], rural: [1] });
    expect(fullSaleChannels([])).toEqual({ village: [], sea: [], caravan: [], pension: [], rural: [] });
  });
});
