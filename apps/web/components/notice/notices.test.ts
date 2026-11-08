import { describe, expect, it } from "vitest";
import type { Notice } from "@/lib/types";
import { hasUnread, latestNotice, sortNotices, validateInquiry } from "./notices";

const n = (id: string, createdAt: number, pinned = false): Notice => ({ id, title: id, body: "", createdAt, pinned });

describe("공지", () => {
  const list = [n("old", 1), n("pin", 2, true), n("new", 3)];

  it("고정 먼저, 그다음 최신 순", () => {
    expect(sortNotices(list).map((x) => x.id)).toEqual(["pin", "new", "old"]);
  });

  it("가장 최근 공지를 봤으면 새 공지 없음", () => {
    expect(latestNotice(list)?.id).toBe("new");
    expect(hasUnread(list, null)).toBe(true);
    expect(hasUnread(list, "pin")).toBe(true);
    expect(hasUnread(list, "new")).toBe(false);
    expect(hasUnread([], null)).toBe(false);
  });
});

describe("validateInquiry", () => {
  it("종류 필수, 내용 10~1000자, 연락처 100자", () => {
    expect(validateInquiry({ category: "bug", message: "열 글자가 넘는 문의 내용", contact: "" })).toEqual({});
    expect(Object.keys(validateInquiry({ category: null, message: "짧다", contact: "x".repeat(101) })).sort()).toEqual([
      "category",
      "contact",
      "message",
    ]);
    expect(validateInquiry({ category: "idea", message: "가".repeat(1001), contact: "" }).message).toBeDefined();
  });
});
