// 47번 방문 분석: 서버가 받은 값을 집계용 짧은 이름으로 바꾸는 순수 함수 모음 (테스트: analytics.test.ts).
// 원본 IP·리퍼러 전체 주소·User-Agent 문자열은 저장하지 않는다. 남는 것은 분류 이름·도메인·경로 모양뿐이다.

/** 유입 분류: 직접 입력 / 검색 / SNS·커뮤니티 / 메신저 / 기타 */
export type RefCategory = "direct" | "search" | "sns" | "messenger" | "other";
export const REF_CATEGORIES: readonly RefCategory[] = ["direct", "search", "sns", "messenger", "other"];
export const REF_LABELS: Record<RefCategory, string> = {
  direct: "직접 입력·북마크",
  search: "검색",
  sns: "SNS·커뮤니티",
  messenger: "메신저",
  other: "기타 사이트",
};

export type Device = "mobile" | "tablet" | "desktop";
export const DEVICE_LABELS: Record<Device, string> = { mobile: "모바일", tablet: "태블릿", desktop: "데스크톱" };

// 도메인 끝부분으로 분류한다 (www.·m. 같은 앞부분은 떼고 본다)
const SEARCH = [
  "google.", "bing.com", "search.naver.com", "m.search.naver.com", "search.daum.net", "daum.net", "duckduckgo.com",
  "search.yahoo.", "yahoo.", "baidu.com", "yandex.", "ecosia.org", "zum.com", "search.zum.com", "naver.com", "nate.com",
];
const SNS = [
  "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "t.co", "threads.net", "threads.com", "reddit.com",
  "youtube.com", "youtu.be", "tiktok.com", "linkedin.com", "lnkd.in", "pinterest.", "tumblr.com", "mastodon.",
  "blog.naver.com", "cafe.naver.com", "post.naver.com", "tistory.com", "brunch.co.kr", "velog.io", "dcinside.com",
  "theqoo.net", "clien.net", "ruliweb.com", "fmkorea.com", "instiz.net", "ppomppu.co.kr", "inven.co.kr", "arca.live",
  "everytime.kr", "bsky.app", "news.ycombinator.com", "okky.kr", "disquiet.io",
];
const MESSENGER = [
  "kakao.com", "kakaotalk.com", "talk.kakao", "open.kakao.com", "discord.com", "discord.gg", "discordapp.com", "slack.com",
  "t.me", "telegram.org", "telegram.me", "line.me", "messenger.com", "whatsapp.com", "wa.me", "band.us", "teams.microsoft.com",
];

/** utm_source 같은 짧은 이름으로도 분류할 수 있게 (예: utm_source=kakao) */
const SOURCE_WORDS: [RegExp, RefCategory][] = [
  [/^(google|naver|daum|bing|yahoo|zum|duckduckgo|baidu|search)/, "search"],
  [/^(kakao|ktalk|discord|slack|telegram|line|band|messenger|whatsapp|sms|email|mail)/, "messenger"],
  [/^(facebook|fb|instagram|ig|twitter|x|threads|reddit|youtube|yt|tiktok|blog|cafe|dc|insta|linkedin|community)/, "sns"],
];

function matchHost(host: string, list: readonly string[]): boolean {
  return list.some((d) => (d.endsWith(".") ? host.startsWith(d) || host.includes(`.${d}`) : host === d || host.endsWith(`.${d}`)));
}

/** 리퍼러 주소 → 도메인 (www.·m. 제거, 소문자, 60자). 주소가 아니면 null */
export function refDomain(ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "android-app:") return null;
    const host = (u.hostname || "").toLowerCase().replace(/^(www|m|mobile)\./, "");
    return host && /^[a-z0-9.-]+$/.test(host) ? host.slice(0, 60) : null;
  } catch {
    return null;
  }
}

export function categoryOfHost(host: string): RefCategory {
  if (matchHost(host, MESSENGER)) return "messenger";
  // 네이버 블로그·카페는 검색보다 커뮤니티로 본다 (naver.com 전체보다 먼저)
  if (matchHost(host, SNS)) return "sns";
  if (matchHost(host, SEARCH)) return "search";
  return "other";
}

export function categoryOfSource(source: string): RefCategory | null {
  for (const [re, cat] of SOURCE_WORDS) if (re.test(source)) return cat;
  return null;
}

/**
 * 유입 분류. 우선순위: 다른 사이트 리퍼러 → utm_source → 인앱 브라우저(카카오톡·라인은 리퍼러를 비우는 일이 많다) → 직접 입력.
 * 우리 사이트 안에서 넘어온 것(selfHost)은 직접 입력으로 센다
 */
export function classifyReferrer(
  ref: string | null | undefined,
  selfHost: string | null,
  utmSource?: string | null,
  inApp?: "messenger" | "sns" | null,
): { cat: RefCategory; domain: string | null } {
  const host = refDomain(ref);
  const self = selfHost?.toLowerCase().replace(/^(www|m)\./, "").replace(/:\d+$/, "") ?? null;
  if (host && host !== self && !host.endsWith(".vercel.app") && host !== "localhost") return { cat: categoryOfHost(host), domain: host };
  const bySource = utmSource ? categoryOfSource(utmSource) : null;
  if (bySource) return { cat: bySource, domain: null };
  if (utmSource) return { cat: "other", domain: null };
  if (inApp) return { cat: inApp, domain: null };
  return { cat: "direct", domain: null };
}

const BOT_RE = /bot|crawl|spider|slurp|scrap|preview|headless|lighthouse|pingdom|monitor|curl\/|wget|python|httpclient|java\/|go-http|facebookexternalhit|embedly|vercel-screenshot/i;
export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT_RE.test(ua);
}

/** User-Agent → 기기·브라우저 이름 (문자열 자체는 저장하지 않는다) */
export function parseUa(ua: string): { device: Device; browser: string; inApp: "messenger" | "sns" | null } {
  const device: Device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)
    ? "tablet"
    : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)
      ? "mobile"
      : "desktop";
  const rules: [RegExp, string, ("messenger" | "sns" | null)?][] = [
    [/KAKAOTALK/i, "카카오톡 인앱", "messenger"],
    [/\bLine\//, "라인 인앱", "messenger"],
    [/DiscordBot|Discord\//i, "디스코드 인앱", "messenger"],
    [/Instagram/i, "인스타그램 인앱", "sns"],
    [/FBAN|FBAV|FB_IAB/i, "페이스북 인앱", "sns"],
    [/NAVER\(inapp|NAVER\//i, "네이버 앱"],
    [/DaumApps/i, "다음 앱"],
    [/SamsungBrowser/i, "삼성 인터넷"],
    [/Whale\//i, "웨일"],
    [/Edg(e|A|iOS)?\//, "엣지"],
    [/OPR\/|Opera/i, "오페라"],
    [/Firefox|FxiOS/i, "파이어폭스"],
    [/CriOS|Chrome\//, "크롬"],
    [/Safari\//, "사파리"],
  ];
  for (const [re, name, inApp] of rules) if (re.test(ua)) return { device, browser: name, inApp: inApp ?? null };
  return { device, browser: "기타", inApp: null };
}

/** utm 값: 소문자, 글자·숫자·._-만, 30자. 비면 null */
export function cleanUtm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return s || null;
}

/** utm 세 값 → 집계 이름 "source / medium / campaign" (source가 없으면 null) */
export function utmKey(source: string | null, medium: string | null, campaign: string | null): string | null {
  return source ? `${source} / ${medium ?? "-"} / ${campaign ?? "-"}` : null;
}

/**
 * 첫 랜딩 경로의 모양 (개별 id는 지운다): "/", "/?grave" → "/ (묘비 공유 링크)", "/grave/abc" → "/grave/*", "/privacy".
 * 이상한 값은 "기타"
 */
export function landingOf(path: string | null | undefined, sharedGrave = false): string {
  if (typeof path !== "string" || !path.startsWith("/")) return "기타";
  const segs = path.split(/[?#]/)[0].split("/").filter(Boolean);
  if (!segs.length) return sharedGrave ? "/ (묘비 공유 링크)" : "/";
  const first = segs[0].toLowerCase();
  if (!/^[a-z0-9_-]{1,24}$/.test(first)) return "기타";
  return segs.length > 1 ? `/${first}/*` : `/${first}`;
}

/** Vercel 국가 헤더 (ISO 2글자) → 집계 이름. 없으면 "??" */
export function countryOf(header: string | null | undefined): string {
  return header && /^[A-Za-z]{2}$/.test(header) ? header.toUpperCase() : "??";
}

/** KST 시각 (0~23) */
export const kstHour = (now = Date.now()) => new Date(now + 9 * 3_600_000).getUTCHours();
export const hh = (h: number) => String(h).padStart(2, "0");
