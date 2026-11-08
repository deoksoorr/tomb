import { assertAdminKey, clearAdminCookie, setAdminCookie } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { AdminLoginSchema, readBody } from "@/lib/validate";

/** 관리자 로그인: `{ key }`가 맞으면 12시간짜리 httpOnly 쿠키(SameSite=Strict)를 준다 */
export const POST = handler(async (req) => {
  const { key } = await readBody(req, AdminLoginSchema);
  await assertAdminKey(req, key);
  const res = json({ ok: true });
  await setAdminCookie(res);
  return res;
});

/** 로그아웃 */
export const DELETE = handler(async () => {
  const res = json({ ok: true });
  clearAdminCookie(res);
  return res;
});
