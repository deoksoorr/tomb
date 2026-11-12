import { ROOM_ID_RE } from "./constants";
import { hmacSign, hmacVerify } from "./token";

// 47번: Vercel(웹 서버) → 실시간 서버 내부 요청 서명. 브라우저를 거치지 않는 서버끼리의 호출이라
// 본문 JSON 전체를 JOIN_SECRET으로 서명하고(헤더), 본문 안의 exp(unix초)가 지나면 받지 않는다.
//  - POST /internal/kick  { visitorIds, code, exp }       → 열린 채널에서 그 방문자들을 code로 내보낸다
//  - POST /internal/peer  { ch | room, sid, exp }        → 그 채널·방의 sid가 누구인지 (유저 신고 대상 확인)
//  - POST /internal/me    { visitorIds, exp }              → 접속 중인 그 방문자들에게 "내 정보 새로 받기"(관리자 포인트 지급 등)

export const INTERNAL_SIG_HEADER = "X-Tomb-Internal";
/** 내부 요청 유효 시간 (초). 서버끼리라 짧게 */
export const INTERNAL_TTL_SEC = 30;
/** 한 번에 내보낼 수 있는 방문자 수 (IP 차단 때 그 IP의 최근 계정들) */
export const INTERNAL_KICK_MAX = 50;

export type InternalKick = { op: "kick"; visitorIds: string[]; code: number; exp: number };
export type InternalPeer = { op: "peer"; ch?: number; room?: string; sid: number; exp: number };
export type InternalMe = { op: "me"; visitorIds: string[]; exp: number };
export type InternalRequest = InternalKick | InternalPeer | InternalMe;

const sigData = (body: string) => "internal:" + body;

/** 본문 문자열과 서명을 함께 만든다 (fetch에 그대로 싣는다) */
export async function signInternal(secret: string, req: InternalRequest): Promise<{ body: string; sig: string }> {
  const body = JSON.stringify(req);
  return { body, sig: await hmacSign(secret, sigData(body)) };
}

const VISITOR_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 서명·만료·모양이 맞으면 요청, 아니면 null */
export async function verifyInternal(
  secret: string | undefined,
  body: string,
  sig: string | null,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<InternalRequest | null> {
  if (!secret || !sig || body.length > 8_000) return null;
  if (!(await hmacVerify(secret, sigData(body), sig))) return null;
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!r || typeof r.exp !== "number" || r.exp < nowSec || r.exp > nowSec + INTERNAL_TTL_SEC * 2) return null;
  if (r.op === "kick") {
    const ids = r.visitorIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > INTERNAL_KICK_MAX) return null;
    if (!ids.every((v) => typeof v === "string" && VISITOR_RE.test(v))) return null;
    if (typeof r.code !== "number" || !Number.isInteger(r.code) || r.code < 4000 || r.code > 4999) return null;
    return { op: "kick", visitorIds: ids as string[], code: r.code, exp: r.exp };
  }
  if (r.op === "me") {
    const ids = r.visitorIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > INTERNAL_KICK_MAX) return null;
    if (!ids.every((v) => typeof v === "string" && VISITOR_RE.test(v))) return null;
    return { op: "me", visitorIds: ids as string[], exp: r.exp };
  }
  if (r.op === "peer") {
    if (typeof r.sid !== "number" || !Number.isInteger(r.sid) || r.sid < 0) return null;
    const hasCh = typeof r.ch === "number" && Number.isInteger(r.ch) && r.ch >= 1;
    const hasRoom = typeof r.room === "string" && ROOM_ID_RE.test(r.room);
    if (hasCh === hasRoom) return null; // 둘 중 정확히 하나
    return hasCh ? { op: "peer", ch: r.ch as number, sid: r.sid, exp: r.exp } : { op: "peer", room: r.room as string, sid: r.sid, exp: r.exp };
  }
  return null;
}
