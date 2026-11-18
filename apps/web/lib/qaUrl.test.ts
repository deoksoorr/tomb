import { describe, expect, it } from "vitest";
import { parseAmbienceOverride } from "./ambience";
import { onProdHost, qaSearch, qaUrlAllowed } from "./qaUrl";

describe("주소 시험 값은 실서버에서 막힌다", () => {
  it("실서버 빌드(\"0\")면 빈 주소, 그 밖(테스트서버·로컬)이면 그대로", () => {
    expect(qaUrlAllowed("0")).toBe(false);
    expect(qaUrlAllowed("1")).toBe(true);
    expect(qaUrlAllowed(undefined)).toBe(true);
    expect(qaSearch("?weather=rain&tide=90", "0")).toBe("");
    expect(qaSearch("?weather=rain&tide=90", "1")).toBe("?weather=rain&tide=90");
  });

  it("실서버면 날씨·시간·계절 덮어쓰기가 하나도 안 붙는다", () => {
    expect(parseAmbienceOverride("?weather=rain&time=night&season=winter", "0")).toEqual({});
    expect(parseAmbienceOverride("?weather=rain&time=night", "1")).toEqual({ weather: "rain", hour: 23 });
  });

  it("11/18 빌드 값이 켜져 있어도 실서버 주소에서 돌면 막힌다 (미리보기 빌드를 실서버로 올린 경우)", () => {
    expect(qaUrlAllowed("1", "myproject.rip")).toBe(false);
    expect(qaUrlAllowed("1", "www.myproject.rip")).toBe(false);
    expect(qaSearch("?weather=rain", "1", "myproject.rip")).toBe("");
    expect(qaUrlAllowed("1", "localhost")).toBe(true);
    expect(qaUrlAllowed("1", "tomb-git-staging-deoksoorr.vercel.app")).toBe(true);
    expect(onProdHost("notmyproject.rip")).toBe(false);
  });
});
