import { describe, expect, it } from "vitest";
import { inAppLabel, inAppOf } from "@tomb/protocol";
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
    expect(parseUa(IPHONE)).toEqual({ device: "mobile", browser: "사파리", inApp: null, app: null });
    expect(parseUa(KAKAO)).toEqual({ device: "mobile", browser: "카카오톡 인앱", inApp: "messenger", app: "카카오톡" });
    expect(parseUa(MAC_CHROME)).toEqual({ device: "desktop", browser: "크롬", inApp: null, app: null });
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

// 11/27 앱 안 브라우저 (리퍼러를 비우는 앱이 많아 「어느 앱에서 열었나」라도 남긴다). 실제 앱 UA 모양
const APP_UAS: [string, string | null, string][] = [
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.6", "카카오톡", "카카오톡 인앱"],
  [
    "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.193 Mobile Safari/537.36 Instagram 312.0.0.32.112 Android (34/14; 450dpi; 1080x2115; samsung; SM-S918N; dm3q; qcom; ko_KR; 548323743)",
    "인스타그램",
    "인스타그램 인앱",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/442.0.0.38.109;FBBV/541452520;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.1.2;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5]",
    "페이스북",
    "페이스북 인앱",
  ],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.1.2; 15ProMax)", "네이버 앱", "네이버 앱"],
  [
    "Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 DaumApps/5.3.4 DaumDevice/mobile",
    "다음 앱",
    "다음 앱",
  ],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.20.0", "라인", "라인 인앱"],
  [
    "Mozilla/5.0 (Linux; Android 13; SM-N986N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 BAND/14.5.3 (ko-KR)",
    "밴드",
    "밴드 인앱",
  ],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9173 Chrome/120.0.6099.291 Electron/28.2.10 Safari/537.36", "디스코드", "디스코드 인앱"],
  [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240305.019; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.105 Mobile Safari/537.36 Telegram-Android/10.9.1 (Google Pixel 8; Android 14; SDK 34; HIGH)",
    "텔레그램",
    "텔레그램 인앱",
  ],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.24", "X(트위터)", "X(트위터) 인앱"],
  [
    "Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.5304.105 Mobile Safari/537.36 trill_2022708050 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/27.8.5 ByteLocale/ko BytedanceWebview/d8a21c6",
    "틱톡",
    "틱톡 인앱",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 289.0.0.18.109 (iPhone14,5; iOS 17_0; ko_KR; ko; scale=3.00; 1170x2532; 488797637)",
    "스레드",
    "스레드 인앱",
  ],
  // 앱이 아닌 보통 브라우저
  ["Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36", null, "삼성 인터넷"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Whale/3.28.266.14 Safari/537.36", null, "웨일"],
  [IPHONE, null, "사파리"],
  [MAC_CHROME, null, "크롬"],
];

describe("11/27 앱 안 브라우저", () => {
  it.each(APP_UAS)("%s", (ua, app, browser) => {
    expect(inAppOf(ua)).toBe(app);
    expect(parseUa(ua).app).toBe(app);
    expect(parseUa(ua).browser).toBe(browser);
  });
  it("앱 이름 → 「○○ 앱」 (이미 앱이면 그대로)", () => {
    expect(inAppLabel("카카오톡")).toBe("카카오톡 앱");
    expect(inAppLabel("네이버 앱")).toBe("네이버 앱");
  });
  it("리퍼러가 비어도 메신저·SNS 앱이면 그 분류, 리퍼러가 있으면 리퍼러가 먼저", () => {
    const tg = parseUa(APP_UAS[8][0]);
    expect(classifyReferrer(null, "myproject.rip", null, tg.inApp)).toEqual({ cat: "messenger", domain: null });
    const x = parseUa(APP_UAS[9][0]);
    expect(classifyReferrer("", "myproject.rip", null, x.inApp)).toEqual({ cat: "sns", domain: null });
    expect(classifyReferrer("https://forum.example.com/t/1", "myproject.rip", null, x.inApp)).toEqual({ cat: "other", domain: "forum.example.com" });
    // 네이버 앱은 분류는 안 하지만 앱 이름은 남는다
    expect(parseUa(APP_UAS[3][0]).inApp).toBeNull();
  });
});
