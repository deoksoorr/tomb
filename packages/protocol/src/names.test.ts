import { describe, expect, it } from "vitest";
import { checkName, checkNewName } from "./names";

describe("11/16 새로 짓거나 바꾸는 이름은 8자까지", () => {
  it("새 이름은 2~8자, 지금 내 이름 그대로는 예전 길이(12자)까지", () => {
    expect(checkNewName("여덟글자이름이요").ok).toBe(true);
    expect(checkNewName("아홉글자의긴이름이요")).toEqual({ ok: false, reason: "이름은 2~8자로 지어 주세요." });
    expect(checkNewName("아홉글자의긴이름이요", "아홉글자의 긴이름이요").ok).toBe(true);
    expect(checkName("아홉글자의긴이름이요").ok).toBe(true);
  });
});
