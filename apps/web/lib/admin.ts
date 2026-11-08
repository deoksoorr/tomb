import type { NextRequest } from "next/server";
import { env } from "./env";
import { HttpError } from "./http";
import { assertAdminNotLocked, recordAdminFailure } from "./ratelimit";
import { safeEqual } from "./session";
import type { PublicGrave } from "./types";

/** 관리자 목록 항목: 공개 형태 + 숨김 여부 */
export type AdminGrave = PublicGrave & { hidden: boolean };

/** `x-admin-key: <키>` 또는 `Authorization: Bearer <키>`. IP당 분당 실패 10회를 넘으면 429 */
export async function requireAdmin(req: NextRequest): Promise<void> {
  await assertAdminNotLocked(req);
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = req.headers.get("x-admin-key") ?? bearer;
  if (given && safeEqual(given.trim(), env.adminKey())) return;
  await recordAdminFailure(req);
  throw new HttpError(401, "UNAUTHORIZED", "관리자 키가 올바르지 않아요.");
}
