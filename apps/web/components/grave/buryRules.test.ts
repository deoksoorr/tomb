import { describe, expect, it } from "vitest";
import { normalizeTag, toGraveInput, validateBury, type BuryValues } from "./buryRules";

const TODAY = "2026-11-08";
const valid: BuryValues = {
  name: "할 일 앱",
  bornAt: "2026-10-01",
  diedAt: "2026-10-04",
  lastTask: "로그인 구현",
  causes: ["time"],
  causeDetail: "",
  epitaph: "향년 4일, 로그인 구현 중 별세",
  links: [""],
  stack: [],
};

describe("validateBury", () => {
  it("올바른 입력은 오류가 없다", () => {
    expect(validateBury(valid, TODAY)).toEqual({});
  });

  it("필수 항목", () => {
    const e = validateBury({ ...valid, name: "  ", causes: [], epitaph: "", bornAt: "", diedAt: "" }, TODAY);
    expect(Object.keys(e).sort()).toEqual(["bornAt", "causes", "diedAt", "epitaph", "name"]);
  });

  it("사망일은 탄생일 이후, 미래 불가", () => {
    expect(validateBury({ ...valid, diedAt: "2026-09-30" }, TODAY).diedAt).toMatch("탄생일보다");
    expect(validateBury({ ...valid, diedAt: "2026-11-09" }, TODAY).diedAt).toMatch("미래");
    expect(validateBury({ ...valid, bornAt: "2027-01-01", diedAt: "2027-01-02" }, TODAY).bornAt).toMatch("미래");
    expect(validateBury({ ...valid, bornAt: TODAY, diedAt: TODAY }, TODAY)).toEqual({});
  });

  it("글자 수는 코드포인트 기준", () => {
    expect(validateBury({ ...valid, epitaph: "가".repeat(30) }, TODAY).epitaph).toBeUndefined();
    expect(validateBury({ ...valid, epitaph: "가".repeat(31) }, TODAY).epitaph).toBeDefined();
    expect(validateBury({ ...valid, lastTask: "🪦".repeat(20) }, TODAY).lastTask).toBeUndefined();
    expect(validateBury({ ...valid, lastTask: "가".repeat(21) }, TODAY).lastTask).toBeDefined();
  });

  it("링크는 http(s)만, 3개까지, 빈 칸은 무시", () => {
    expect(validateBury({ ...valid, links: ["https://example.com", " "] }, TODAY).links).toBeUndefined();
    expect(validateBury({ ...valid, links: ["https://a.dev", "javascript:alert(1)"] }, TODAY).links).toBeDefined();
    expect(validateBury({ ...valid, links: ["example.com"] }, TODAY).links).toBeDefined();
    const four = ["https://a.dev", "https://b.dev", "https://c.dev", "https://d.dev"];
    expect(validateBury({ ...valid, links: four }, TODAY).links).toMatch("3개");
  });
});

describe("normalizeTag", () => {
  it("다듬고 중복·초과를 거른다", () => {
    expect(normalizeTag(" #Next.js ", [])).toBe("Next.js");
    expect(normalizeTag("react", ["React"])).toBeNull();
    expect(normalizeTag("x", ["a", "b", "c", "d", "e"])).toBeNull();
    expect(normalizeTag("가".repeat(21), [])).toBeNull();
    expect(normalizeTag("   ", [])).toBeNull();
  });
});

describe("toGraveInput", () => {
  it("빈 선택 항목은 빼고 보낸다", () => {
    const input = toGraveInput({ ...valid, lastTask: " ", links: [" https://a.dev ", ""] }, "유령", undefined);
    expect(input).toEqual({
      name: "할 일 앱",
      epitaph: "향년 4일, 로그인 구현 중 별세",
      bornAt: "2026-10-01",
      diedAt: "2026-10-04",
      causes: ["time"],
      mourner: "유령",
      links: ["https://a.dev"],
    });
  });
});
