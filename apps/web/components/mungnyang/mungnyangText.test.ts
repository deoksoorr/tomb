import { describe, expect, it } from "vitest";
import {
  boughtText,
  footHint,
  haveText,
  MUNGNYANG_SHOP_SUB,
  MUNGNYANG_SHOP_TITLE,
  MUNGNYANG_TABS,
  mungnyangHello,
  petStateText,
  viewName,
} from "./mungnyangText";

// 11/19 분양사 보리 창 문구: 짧은 해요체, 「라벨: 설명」 콜론 나열·「A · B · C」 나열 없이

const all = () => [
  MUNGNYANG_SHOP_TITLE,
  MUNGNYANG_SHOP_SUB,
  ...MUNGNYANG_TABS.map((t) => t.label),
  mungnyangHello("pet"),
  mungnyangHello("furn"),
  viewName("front"),
  viewName("right"),
  viewName("back"),
  petStateText({ forever: true, where: "worn" }, 0),
  petStateText({ forever: true, where: "home" }, 0),
  petStateText({ forever: false, where: "worn" }, 0),
  petStateText({ forever: false, where: "home" }, 0),
  petStateText(null, 2),
  petStateText(null, 0),
  haveText(3),
  boughtText("월요병 시바", "pet"),
  boughtText("듬직한 큰 개", "pet", true),
  boughtText("듬직한 큰 개", "pet", true, true),
  boughtText("퇴근 후 웰시코기", "furn"),
  footHint("pet"),
  footHint("furn"),
];

describe("분양사 보리 창 문구", () => {
  it("이름표와 탭", () => {
    expect(MUNGNYANG_SHOP_TITLE).toBe("분양사 보리");
    expect(MUNGNYANG_SHOP_SUB).toBe("강아지·고양이 분양");
    expect(MUNGNYANG_TABS.map((t) => t.label)).toEqual(["펫", "집 가구"]);
  });

  it("상태·산 뒤 안내", () => {
    expect(petStateText(null, 0)).toBe("아직 가족이 아니에요.");
    expect(boughtText("듬직한 큰 개", "pet", true)).toContain("R 키");
    expect(boughtText("듬직한 큰 개", "pet", true, true)).toContain("[타기]");
    expect(boughtText("월요병 시바", "pet")).not.toContain("올라탈");
    expect(boughtText("퇴근 후 웰시코기", "furn")).toBe("퇴근 후 웰시코기를 가구 가방에 넣었어요. 집에서 꾸미기를 열면 놓을 수 있어요.");
    expect(boughtText("고양이 쿠션", "furn")).toMatch(/^고양이 쿠션을 /);
  });

  it("콜론 나열·가운뎃점 나열이 없고, 문장은 해요체로 끝난다", () => {
    for (const t of all()) {
      expect(t, t).not.toMatch(/: /);
      expect(t, t).not.toMatch(/ · /);
    }
    const sentences = all().filter((t) => /[.!]$/.test(t));
    expect(sentences.length).toBeGreaterThan(10);
    for (const t of sentences) expect(t, t).toMatch(/요[.!]$/);
  });
});
