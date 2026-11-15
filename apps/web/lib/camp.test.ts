import { describe, expect, it } from "vitest";
import { campOpen } from "./camp";

// 11/15 운영 스위치: 캠핑장 버스는 테스트 서버에서만, 운영은 CAMP_ENABLED=1일 때만
describe("campOpen (캠핑장을 여는 서버)", () => {
  it("운영(VERCEL_ENV=production)은 닫혀 있다", () => {
    expect(campOpen({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(campOpen({ NODE_ENV: "production" })).toBe(false);
  });
  it("운영에서 CAMP_ENABLED=1이면 연다 (다른 값은 닫힘)", () => {
    expect(campOpen({ VERCEL_ENV: "production", CAMP_ENABLED: "1" })).toBe(true);
    expect(campOpen({ VERCEL_ENV: "production", CAMP_ENABLED: " 1 " })).toBe(true);
    expect(campOpen({ VERCEL_ENV: "production", CAMP_ENABLED: "true" })).toBe(false);
    expect(campOpen({ VERCEL_ENV: "production", CAMP_ENABLED: "0" })).toBe(false);
  });
  it("테스트 서버(미리 보기·개발)·로컬은 늘 열려 있다", () => {
    expect(campOpen({ VERCEL_ENV: "preview" })).toBe(true);
    expect(campOpen({ VERCEL_ENV: "development" })).toBe(true);
    expect(campOpen({ NODE_ENV: "development" })).toBe(true);
  });
});
