import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@/lib/types";
import { activityText, isHouseActivity, relativeTime } from "./activity";

describe("relativeTime", () => {
  it("초·분·시간·일", () => {
    expect(relativeTime(0, 30_000)).toBe("방금");
    expect(relativeTime(0, 5 * 60_000)).toBe("5분 전");
    expect(relativeTime(0, 3 * 3_600_000)).toBe("3시간 전");
    expect(relativeTime(0, 2 * 86_400_000)).toBe("2일 전");
  });
});

describe("activityText", () => {
  const item = (kind: ActivityItem["kind"]): ActivityItem => ({ id: "1", kind, at: 0, who: "유령", targetId: "g", targetName: "할 일 앱" });
  it("종류별 문장", () => {
    expect(activityText(item("flower"))).toBe("유령님이 '할 일 앱'에 헌화했어요");
    expect(activityText(item("guestbook"))).toMatch("방명록");
    expect(isHouseActivity(item("houseLike"))).toBe(true);
    expect(isHouseActivity(item("revive"))).toBe(false);
  });
});
