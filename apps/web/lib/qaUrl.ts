/**
 * 11/16 주소 시험 값(?time·?tod·?weather·?season·?tide·?thunder·?debug)은 테스트서버와 로컬에서만 먹는다.
 * 실서버 빌드(VERCEL_ENV=production)는 next.config가 NEXT_PUBLIC_QA_URL="0"을 박아 두어 빈 주소로 본다.
 */
export const qaUrlAllowed = (flag: string | undefined = process.env.NEXT_PUBLIC_QA_URL): boolean => flag !== "0";

/** 시험 값을 읽을 주소: 실서버면 "" (아무 시험 값도 없는 것처럼) */
export const qaSearch = (search: string, flag?: string): string => (qaUrlAllowed(flag) ? search : "");
