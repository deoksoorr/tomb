import { inAppOf } from "@tomb/protocol";
import { z } from "zod";
import { cleanUtm } from "./analytics";

// 11/26 가입 유입 경로 (순수 함수). 첫 방문 때 브라우저가 리퍼러 호스트만 + utm 세 값을 localStorage에 두었다가(lib/signupSourceClient)
// 입장 기록(/api/me/attend)에 같이 보낸다 → 계정이 이번에 처음 만들어졌을 때만 저장 (lib/store/signupSrc). 전체 주소·검색어는 남기지 않는다.
// 카카오톡·인스타그램 같은 앱 안 브라우저는 리퍼러가 비는 일이 많아, 서버가 User-Agent로 앱 이름만 붙인다.
// 「이번 접속 유입」은 같은 모양을 그 탭 세션 것으로 /api/join 첫 요청에 실어 보낸다 (옛 회원도 보인다).

/** 브라우저가 보내는 모양 (리퍼러 호스트·utm). 저장할 때 다시 다듬는다 */
export const SrcInputSchema = z
  .object({
    r: z.string().max(60).regex(/^[a-z0-9.-]+$/).optional(),
    us: z.string().max(60).optional(),
    um: z.string().max(60).optional(),
    uc: z.string().max(60).optional(),
  })
  .optional();
export type SrcInput = z.infer<typeof SrcInputSchema>;

/** 저장하는 모양: r = 리퍼러 호스트, us·um·uc = utm source·medium·campaign, app = 앱 안 브라우저 이름, at = 시각 */
export type SignupSrc = { r?: string; us?: string; um?: string; uc?: string; app?: string; at: number };

/** 받은 값 + User-Agent → 저장할 값 (빈 칸은 뺀다) */
export function signupSrcOf(input: SrcInput | null | undefined, ua: string | null | undefined, now: number): SignupSrc {
  const r = input?.r && /^[a-z0-9.-]{1,60}$/.test(input.r) ? input.r.replace(/^(www|m|mobile)\./, "") : null;
  const us = cleanUtm(input?.us);
  const um = cleanUtm(input?.um);
  const uc = cleanUtm(input?.uc);
  const app = inAppOf(ua);
  return { ...(r ? { r } : {}), ...(us ? { us } : {}), ...(um ? { um } : {}), ...(uc ? { uc } : {}), ...(app ? { app } : {}), at: now };
}

// 리퍼러 호스트 → 사람이 읽는 이름 (모르는 곳은 호스트 그대로)
const HOSTS: [RegExp, string][] = [
  [/(^|\.)google\./, "구글"],
  [/^(m\.)?search\.naver\.com$/, "네이버 검색"],
  [/(^|\.)blog\.naver\.com$/, "네이버 블로그"],
  [/(^|\.)cafe\.naver\.com$/, "네이버 카페"],
  [/(^|\.)naver\.com$/, "네이버"],
  [/(^|\.)daum\.net$/, "다음"],
  [/(^|\.)kakao\.com$|^kakaotalk\./, "카카오"],
  [/(^|\.)instagram\.com$/, "인스타그램"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "유튜브"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "페이스북"],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/, "X(트위터)"],
  [/(^|\.)threads\.(net|com)$/, "스레드"],
  [/(^|\.)dcinside\.com$/, "디시인사이드"],
  [/(^|\.)tistory\.com$/, "티스토리"],
  [/(^|\.)bing\.com$/, "빙"],
];
export function hostLabel(host: string): string {
  for (const [re, name] of HOSTS) if (re.test(host)) return name;
  return host;
}

/** 유입 묶음 이름 (관리자 「유입」 칸·유입별 가입 수). utm → 리퍼러 → 앱 → 직접 순 */
export function srcLabel(s: Pick<SignupSrc, "r" | "us" | "um" | "app"> | null | undefined): string {
  if (!s) return "기록 없음";
  if (s.us) return `utm ${s.us}${s.um ? `/${s.um}` : ""}`;
  if (s.r) return hostLabel(s.r);
  if (s.app) return `${s.app} 앱`;
  return "직접·알 수 없음";
}

/** 모르는 사이트를 묶는 이름 (유입별 가입 수) */
export const OTHER_SITE_LABEL = "기타 사이트";
/** 하루 유입 이름 칸 상한을 넘으면 이 이름으로 센다 */
export const OVERFLOW_LABEL = "기타";
/** 하루에 따로 세는 유입 이름 수 상한 (넘으면 OVERFLOW_LABEL) */
export const SIGNUP_DAY_LABEL_MAX = 50;

/**
 * 유입별 가입 수에 쓰는 이름: srcLabel과 같되 모르는 리퍼러 호스트는 「기타 사이트」로 묶는다
 * (호스트 문자열을 그대로 이름으로 쓰면 이름 칸이 끝없이 늘 수 있다 — 계정 칸에는 호스트가 그대로 남는다)
 */
export function signupDayLabel(s: Pick<SignupSrc, "r" | "us" | "um" | "app"> | null | undefined): string {
  if (s && !s.us && s.r) {
    const name = hostLabel(s.r);
    return name === s.r ? OTHER_SITE_LABEL : name;
  }
  return srcLabel(s);
}

/** 칸에 보일 한 줄: 묶음 이름 + (리퍼러·utm이 있는데 앱 안이면) 앱 이름 */
export function srcText(s: SignupSrc | null | undefined): string {
  const base = srcLabel(s);
  return s?.app && (s.us || s.r) ? `${base} · ${s.app}` : base;
}
