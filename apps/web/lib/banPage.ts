import { cookies, headers } from "next/headers";
import { findBan, toNotice, type BanNotice } from "./ban";
import { SESSION_COOKIE, verifySession } from "./session";

/**
 * 47번 첫 화면 판정 (app/page.tsx, 서버 렌더). 원래 요청마다 서버에서 그리는 페이지라 판정 비용은 Redis HMGET 한 번.
 * 쿠키가 없거나 판정이 실패하면 막지 않는다 (게임 입장·API에서 한 번 더 막힌다)
 */
export async function pageBan(): Promise<BanNotice | null> {
  try {
    const [c, h] = await Promise.all([cookies(), headers()]);
    const visitorId = await verifySession(c.get(SESSION_COOKIE)?.value);
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    const ban = await findBan(visitorId, ip, { fresh: true });
    return ban ? toNotice(ban) : null;
  } catch (e) {
    console.error("[ban] 첫 화면 판정 실패", e);
    return null;
  }
}
