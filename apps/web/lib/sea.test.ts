import { describe, expect, it } from "vitest";
import { seaOpen } from "./sea";

// 11/16 운영 스위치: 바닷가 버스는 테스트 서버에서만, 운영은 SEA_ENABLED=1일 때만 (캠핑장과 따로)
describe("seaOpen (바닷가를 여는 서버)", () => {
  it("운영은 닫혀 있고 SEA_ENABLED=1이면 열어요", () => {
    expect(seaOpen({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(seaOpen({ VERCEL_ENV: "production", SEA_ENABLED: "1" })).toBe(true);
    expect(seaOpen({ VERCEL_ENV: "production", SEA_ENABLED: "true" })).toBe(false);
  });
  it("테스트 서버·로컬은 늘 열려 있어요", () => {
    expect(seaOpen({ VERCEL_ENV: "preview" })).toBe(true);
    expect(seaOpen({ NODE_ENV: "development" })).toBe(true);
  });
});
