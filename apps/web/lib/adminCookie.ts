import { hmacVerify } from "@tomb/protocol";
import { env } from "./env";

// 관리자 쿠키 확인만 (저장소 없이). lib/admin과 11/26 점검 모드 미들웨어(proxy.ts — 관리자는 점검 중에도 사이트를 본다)가 같이 쓴다.

export const ADMIN_COOKIE = "tomb_admin";

/** 쿠키 값 = `${만료 unix초}.${HMAC(ADMIN_KEY, "admin:" + 만료)}` */
export async function verifyAdminCookie(value: string | undefined): Promise<boolean> {
  const [exp, sig] = value?.split(".") ?? [];
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return hmacVerify(env.adminKey(), `admin:${exp}`, sig);
}
