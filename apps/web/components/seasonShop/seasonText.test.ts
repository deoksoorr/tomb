import { describe, expect, it } from "vitest";
import { kstMs } from "@/lib/seasonShop/schedule";
import { boughtText, emptyText, SEASON_SHOP_SUB, SEASON_SHOP_TITLE, SEASON_TABS, seasonHint, soonNote } from "./seasonText";

// 11/19 기간 한정 노점 창 문구: 짧은 해요체, 「라벨: 설명」 콜론 나열·「A · B · C」 나열 없이

const now = kstMs(2026, 11, 19, 22);
const all = () => [
  ...Object.values(SEASON_SHOP_TITLE),
  ...Object.values(SEASON_SHOP_SUB),
  ...SEASON_TABS.map((t) => t.label),
  seasonHint("cos"),
  seasonHint("furn"),
  emptyText("on", kstMs(2026, 11, 21), now),
  emptyText("on", null, now),
  emptyText("soon", null, now),
  soonNote("cos", kstMs(2026, 11, 21), now),
  soonNote("furn", kstMs(2026, 11, 24), now),
  boughtText("귀달이 털모자", "day"),
  boughtText("귀달이 털모자", "perm"),
  boughtText("벽난로", "furn"),
];

describe("계절 보따리상 창 문구", () => {
  it("이름표와 탭", () => {
    expect(SEASON_SHOP_TITLE.cos).toBe("계절 보따리상");
    expect(SEASON_SHOP_SUB.cos).toBe("기간 한정 코디");
    expect(SEASON_TABS.map((t) => t.label)).toEqual(["판매 중", "판매 예정"]);
  });

  it("남은 날이 들어간 안내", () => {
    expect(emptyText("on", kstMs(2026, 11, 21), now)).toBe("다음 묶음은 2일 뒤에 풀려요.");
    expect(soonNote("cos", kstMs(2026, 11, 21), now)).toBe("지금은 입어 보기만 돼요. 값은 2일 뒤 판매를 시작할 때 공개해요.");
    expect(soonNote("furn", kstMs(2026, 11, 24), now)).toBe("지금은 둘러보기만 돼요. 값은 5일 뒤 판매를 시작할 때 공개해요.");
  });

  it("콜론 나열·가운뎃점 나열이 없고 해요체로 끝난다", () => {
    for (const t of all()) {
      expect(t, t).not.toMatch(/: /);
      expect(t, t).not.toMatch(/ · /);
    }
    for (const t of [seasonHint("cos"), emptyText("soon", null, now), boughtText("가", "day")]) expect(t).toMatch(/요\.?$/);
  });
});
