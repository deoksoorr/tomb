import { describe, expect, it } from "vitest";
import { classifyReferrer, cleanUtm, countryOf, isBot, kstHour, landingOf, parseUa, refDomain, utmKey } from "./analytics";
import { groupsFor, kstDayAgo } from "./analyticsReport";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const KAKAO = "Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 KAKAOTALK 10.4.5";
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("47번 유입 분류", () => {
  it("리퍼러 도메인만 남긴다 (www.·m. 제거, 경로·쿼리 버림)", () => {
    expect(refDomain("https://www.google.com/search?q=%ED%95%9C%EB%95%8C")).toBe("google.com");
    expect(refDomain("https://m.blog.naver.com/abc/123")).toBe("blog.naver.com");
    expect(refDomain("javascript:alert(1)")).toBeNull();
    expect(refDomain("")).toBeNull();
    expect(refDomain("아무말")).toBeNull();
  });

  it("검색·SNS·메신저·기타·직접 입력", () => {
    expect(classifyReferrer("https://www.google.co.kr/", "tomb.example").cat).toBe("search");
    expect(classifyReferrer("https://search.naver.com/search.naver?q=x", "tomb.example").cat).toBe("search");
    expect(classifyReferrer("https://blog.naver.com/x/1", "tomb.example")).toEqual({ cat: "sns", domain: "blog.naver.com" });
    expect(classifyReferrer("https://t.co/abc", "tomb.example").cat).toBe("sns");
    expect(classifyReferrer("https://www.instagram.com/", "tomb.example").cat).toBe("sns");
    expect(classifyReferrer("https://discord.com/channels/1", "tomb.example").cat).toBe("messenger");
    expect(classifyReferrer("https://open.kakao.com/o/abc", "tomb.example").cat).toBe("messenger");
    expect(classifyReferrer("https://someblog.dev/post", "tomb.example")).toEqual({ cat: "other", domain: "someblog.dev" });
    expect(classifyReferrer(null, "tomb.example")).toEqual({ cat: "direct", domain: null });
  });

  it("우리 사이트 안에서 넘어온 것은 직접 입력, 리퍼러가 없으면 utm·인앱 브라우저로", () => {
    expect(classifyReferrer("https://tomb.example/privacy", "tomb.example")).toEqual({ cat: "direct", domain: null });
    expect(classifyReferrer("http://localhost:3456/", "localhost:3456").cat).toBe("direct");
    expect(classifyReferrer(null, "tomb.example", "kakao").cat).toBe("messenger");
    expect(classifyReferrer(null, "tomb.example", "naver").cat).toBe("search");
    expect(classifyReferrer(null, "tomb.example", "newsletter").cat).toBe("other");
    expect(classifyReferrer(null, "tomb.example", null, "messenger").cat).toBe("messenger");
    // 다른 사이트 리퍼러가 utm보다 먼저
    expect(classifyReferrer("https://www.facebook.com/", "tomb.example", "kakao").cat).toBe("sns");
  });

  it("utm 값은 짧고 안전한 이름으로", () => {
    expect(cleanUtm("  Kakao Talk!! ")).toBe("kakao-talk");
    expect(cleanUtm("가을_이벤트")).toBe("가을_이벤트");
    expect(cleanUtm("<script>")).toBe("script");
    expect(cleanUtm("")).toBeNull();
    expect(cleanUtm("x".repeat(80))?.length).toBe(30);
    expect(utmKey("kakao", null, "open")).toBe("kakao / - / open");
    expect(utmKey(null, "cpc", "x")).toBeNull();
  });

  it("첫 랜딩 경로는 모양만 (개별 id는 지운다)", () => {
    expect(landingOf("/")).toBe("/");
    expect(landingOf("/", true)).toBe("/ (묘비 공유 링크)");
    expect(landingOf("/grave/AbC123xyz")).toBe("/grave/*");
    expect(landingOf("/privacy?x=1")).toBe("/privacy");
    expect(landingOf("/%EC%95%85")).toBe("기타");
    expect(landingOf("https://evil")).toBe("기타");
    expect(landingOf(null)).toBe("기타");
  });

  it("기기·브라우저·인앱·로봇", () => {
    expect(parseUa(IPHONE)).toEqual({ device: "mobile", browser: "사파리", inApp: null });
    expect(parseUa(KAKAO)).toEqual({ device: "mobile", browser: "카카오톡 인앱", inApp: "messenger" });
    expect(parseUa(MAC_CHROME)).toEqual({ device: "desktop", browser: "크롬", inApp: null });
    expect(parseUa(IPAD).device).toBe("tablet");
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(MAC_CHROME)).toBe(false);
  });

  it("국가 헤더와 KST 시각", () => {
    expect(countryOf("kr")).toBe("KR");
    expect(countryOf(null)).toBe("??");
    expect(countryOf("KOR")).toBe("??");
    expect(kstHour(Date.UTC(2026, 10, 12, 15, 30))).toBe(0); // UTC 15:30 = KST 00:30
  });
});

describe("47번 보고서 기간 묶음", () => {
  const now = Date.UTC(2026, 10, 12, 3); // KST 2026-11-12(목) 12시

  it("일: 30칸, 마지막이 오늘", () => {
    const g = groupsFor("day", now);
    expect(g).toHaveLength(30);
    expect(g[29]).toEqual({ label: "11/12", days: ["20261112"] });
    expect(kstDayAgo(now, 29)).toBe(g[0].days[0]);
  });

  it("주: 12칸, 월요일 시작, 이번 주는 오늘까지", () => {
    const g = groupsFor("week", now);
    expect(g).toHaveLength(12);
    expect(g[11].days).toEqual(["20261109", "20261110", "20261111", "20261112"]);
    expect(g[10].days).toHaveLength(7);
    expect(g[10].days[0]).toBe("20261102");
    expect(g[11].label).toBe("11/9주");
  });

  it("월: 이번 달과 앞의 두 달", () => {
    const g = groupsFor("month", now);
    expect(g.map((x) => x.label)).toEqual(["2026.09", "2026.10", "2026.11"]);
    expect(g[1].days).toHaveLength(31);
    expect(g[2].days.at(-1)).toBe("20261112");
    expect(g[0].days[0]).toBe("20260901");
  });
});
