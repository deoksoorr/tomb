import { describe, expect, it } from "vitest";
import type { PublicGrave } from "@/lib/types";
import { addDays, nearestLifespan, toEditInput, toQuickInput, validateQuick, type QuickValues } from "./quickRules";

const base: QuickValues = { name: "할 일 앱", lived: "week", cause: null, epitaph: "" };

describe("validateQuick", () => {
  it("이름과 생존 기간만 필수", () => {
    expect(validateQuick(base)).toEqual({});
    expect(Object.keys(validateQuick({ ...base, name: " ", lived: null })).sort()).toEqual(["lived", "name"]);
  });

  it("글자 수는 코드포인트 기준", () => {
    expect(validateQuick({ ...base, name: "가".repeat(40) }).name).toBeUndefined();
    expect(validateQuick({ ...base, name: "가".repeat(41) }).name).toBeDefined();
    expect(validateQuick({ ...base, epitaph: "🪦".repeat(30) }).epitaph).toBeUndefined();
    expect(validateQuick({ ...base, epitaph: "가".repeat(31) }).epitaph).toBeDefined();
  });
});

describe("toQuickInput", () => {
  it("고르지 않은 사인·빈 묘비명은 빼고 보낸다 (서버가 기본값을 넣는다)", () => {
    expect(toQuickInput({ ...base, lived: "week", name: " 앱 " }, "유령")).toEqual({ name: "앱", lived: "week", mourner: "유령" });
    expect(toQuickInput({ ...base, lived: "day", cause: "time", epitaph: " 잘 가 " }, "유령")).toEqual({
      name: "할 일 앱",
      lived: "day",
      mourner: "유령",
      cause: "time",
      epitaph: "잘 가",
    });
  });
});

describe("nearestLifespan / addDays", () => {
  it("향년에 가장 가까운 선택지", () => {
    expect(nearestLifespan(1)).toBe("day");
    expect(nearestLifespan(10)).toBe("week");
    expect(nearestLifespan(100)).toBe("season");
    expect(nearestLifespan(2000)).toBe("years");
  });

  it("날짜 더하기 (달·해 넘김)", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-01-01", -6)).toBe("2025-12-26");
  });
});

describe("toEditInput", () => {
  const grave: PublicGrave = {
    id: "g1",
    name: "옛 이름",
    epitaph: "옛 묘비명",
    bornAt: "2026-10-01",
    diedAt: "2026-10-09",
    ageDays: 9,
    lastTask: "로그인",
    causes: ["time", "interest"],
    links: ["https://a.dev"],
    imageUrl: "https://x.public.blob.vercel-storage.com/a.webp",
    mourner: "원래 상주",
    createdAt: 1,
    flowers: 3,
    revives: 1,
  };

  it("손대지 않은 값(날짜·여러 사인·링크·사진·상주)은 그대로", () => {
    const input = toEditInput(grave, { name: "새 이름", lived: "week", cause: "time", epitaph: "옛 묘비명" });
    expect(input).toEqual({
      name: "새 이름",
      epitaph: "옛 묘비명",
      bornAt: "2026-10-01",
      diedAt: "2026-10-09",
      causes: ["time", "interest"],
      mourner: "원래 상주",
      lastTask: "로그인",
      links: ["https://a.dev"],
      imageUrl: "https://x.public.blob.vercel-storage.com/a.webp",
    });
  });

  it("생존 기간을 바꾸면 사망일 기준으로 탄생일을 다시 셈하고, 사인을 바꾸면 그 하나로", () => {
    const input = toEditInput(grave, { name: "앱", lived: "month", cause: "server_cost", epitaph: "" });
    expect(input.bornAt).toBe("2026-09-10");
    expect(input.diedAt).toBe("2026-10-09");
    expect(input.causes).toEqual(["server_cost"]);
    expect(input.epitaph).toBe("향년 30일, 로그인 중 별세");
  });
});
