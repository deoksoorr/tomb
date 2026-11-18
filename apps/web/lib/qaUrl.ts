/**
 * 11/16 주소 시험 값(?time·?tod·?weather·?season·?tide·?thunder·?debug)은 테스트서버와 로컬에서만 먹는다.
 * 실서버 빌드(VERCEL_ENV=production)는 next.config가 NEXT_PUBLIC_QA_URL="0"을 박아 두어 빈 주소로 본다.
 * 11/18 빌드 값만 믿지 않는다: 미리보기 빌드를 다시 빌드하지 않고 실서버로 올려도 막히게, 실행할 때도 본다 —
 * 서버는 VERCEL_ENV=production, 브라우저는 실서버 주소(myproject.rip와 그 하위 주소)면 막는다
 */

/** 실서버 주소 (lib/googleAuth PROD_ORIGIN과 같은 도메인) */
const PROD_HOST_RE = /(^|\.)myproject\.rip$/i;

/** 지금 실행 중인 곳이 실서버인지 (서버는 환경 변수, 브라우저는 주소) */
export function onProdHost(host: string | undefined = typeof window === "undefined" ? undefined : window.location?.hostname): boolean {
  if (host !== undefined) return PROD_HOST_RE.test(host);
  return process.env.VERCEL_ENV === "production";
}

export const qaUrlAllowed = (flag: string | undefined = process.env.NEXT_PUBLIC_QA_URL, host?: string): boolean => flag !== "0" && !onProdHost(host);

/** 시험 값을 읽을 주소: 실서버면 "" (아무 시험 값도 없는 것처럼) */
export const qaSearch = (search: string, flag?: string, host?: string): string => (qaUrlAllowed(flag, host) ? search : "");
