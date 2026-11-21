import { ROOM_ID_RE } from "./constants";
import { MEGA_PIN_MAX } from "./events";
import { FRIEND_KEY_RE, FRIEND_MAX, WHERE_MAX_IDS } from "./friends";
import { hmacSign, hmacVerify } from "./token";

// 47번: Vercel(웹 서버) → 실시간 서버 내부 요청 서명. 브라우저를 거치지 않는 서버끼리의 호출이라
// 본문 JSON 전체를 JOIN_SECRET으로 서명하고(헤더), 본문 안의 exp(unix초)가 지나면 받지 않는다.
//  - POST /internal/kick  { visitorIds, code, exp }       → 열린 채널에서 그 방문자들을 code로 내보낸다
//  - POST /internal/peer  { ch | room, sid, exp }        → 그 채널·방의 sid가 누구인지 (유저 신고 대상 확인)
//  - POST /internal/me    { visitorIds, exp }              → 접속 중인 그 방문자들에게 "내 정보 새로 받기"(관리자 포인트 지급 등)
//  - POST /internal/where { visitorIds, fresh?, exp }      → 친구: 그 방문자들이 지금 어느 채널·자리에 있는지 (접속 안 했으면 빠진다)
//  - POST /internal/hello { visitorId, name, key, friends, exp } → 친구: 입장 직전 "이 사람이 들어오면·나가면 이 친구들에게 알려 달라"
//  - POST /internal/say   { id, name, text, at, replaces?, exp } → 11/15 마을 공지 한 줄을 열린 채널 모두의 확성기 줄에 지금 띄운다
//                          (긴급 의뢰 시작·끝, 최고층 기록 등 — 웹이 확성기 기록에 남긴 것과 같은 id. replaces = 이 줄로 바꿔 끼울 앞 공지 id)
//  - POST /internal/pin   { scope, ch, pin, exp }          → 11/17 확성기 창 고정 공지가 바뀌었다 (channel이면 그 채널만, all이면 사람이 있는 채널 모두. pin null = 지움)
//  - POST /internal/online { exp }                         → 11/17 관리자 선물: 지금 접속 중인 방문자 id 전부 (채널·맵·방 상관없이, 한 번씩)
//  - POST /internal/people { exp }                         → 11/20 운영자 순간이동: 접속 중인 사람 전부 (채널·sid·이름·자리·맵·실내)

export const INTERNAL_SIG_HEADER = "X-Tomb-Internal";
/** 내부 요청 유효 시간 (초). 서버끼리라 짧게 */
export const INTERNAL_TTL_SEC = 30;
/** 한 번에 내보낼 수 있는 방문자 수 (IP 차단 때 그 IP의 최근 계정들) */
export const INTERNAL_KICK_MAX = 50;

export type InternalKick = { op: "kick"; visitorIds: string[]; code: number; exp: number };
export type InternalPeer = { op: "peer"; ch?: number; room?: string; sid: number; exp: number };
export type InternalMe = { op: "me"; visitorIds: string[]; exp: number };
/** fresh = 실시간 서버의 위치 기억(WHERE_CACHE_MS)을 건너뛰고 지금 채널들에 묻는다 (친구한테 가기) */
export type InternalWhere = { op: "where"; visitorIds: string[]; fresh?: boolean; exp: number };
/** 친구 들고 남 알림 등록 (웹 /api/join이 입장 토큰을 주기 직전). friends = 알릴 친구 방문자 id, key = 이 사람의 친구 키 */
export type InternalHello = { op: "hello"; visitorId: string; name: string; key: string; friends: string[]; exp: number };
/** 마을 공지 방송 (웹이 남긴 시스템 확성기 줄). at = 남긴 시각(ms) */
export type InternalSay = { op: "say"; id: string; name: string; text: string; at: number; replaces?: string; exp: number };
/** 11/17 고정 공지 바뀜 (웹이 저장한 뒤). scope all이면 ch 0. pin = 새 공지 글·쓴 사람·쓴 시각, null = 지움 */
export type InternalPin = { op: "pin"; scope: "channel" | "all"; ch: number; pin: { text: string; name: string; at: number } | null; exp: number };
/** 11/17 지금 접속 중인 방문자 id 전부 (관리자 선물 「지금 접속 중인 사람 모두」). 응답 { visitorIds: string[] } */
export type InternalOnline = { op: "online"; exp: number };
/** 11/20 운영자 「접속 중인 사람」. 응답 { people: InternalPerson[] } (staffTp.ts) */
export type InternalPeople = { op: "people"; exp: number };
export type InternalRequest = InternalKick | InternalPeer | InternalMe | InternalWhere | InternalHello | InternalSay | InternalPin | InternalOnline | InternalPeople;
/** 마을 공지 한 줄 최대 길이 (확성기 60자보다 넉넉히 — 시스템이 만든 문장이라 서명만 확인한다) */
export const INTERNAL_SAY_MAX = 200;
const SAY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

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
  if (r.op === "hello") {
    const ids = r.friends;
    if (typeof r.visitorId !== "string" || !VISITOR_RE.test(r.visitorId)) return null;
    if (typeof r.name !== "string" || !r.name || r.name.length > 40) return null;
    if (typeof r.key !== "string" || !FRIEND_KEY_RE.test(r.key)) return null;
    if (!Array.isArray(ids) || ids.length > FRIEND_MAX || !ids.every((v) => typeof v === "string" && VISITOR_RE.test(v))) return null;
    return { op: "hello", visitorId: r.visitorId, name: r.name, key: r.key, friends: ids as string[], exp: r.exp };
  }
  if (r.op === "say") {
    if (typeof r.id !== "string" || !SAY_ID_RE.test(r.id)) return null;
    if (typeof r.name !== "string" || !r.name || r.name.length > 20) return null;
    if (typeof r.text !== "string" || !r.text || [...r.text].length > INTERNAL_SAY_MAX) return null;
    if (typeof r.at !== "number" || !Number.isFinite(r.at) || r.at <= 0) return null;
    if (r.replaces !== undefined && (typeof r.replaces !== "string" || !SAY_ID_RE.test(r.replaces))) return null;
    return { op: "say", id: r.id, name: r.name, text: r.text, at: r.at, ...(r.replaces !== undefined ? { replaces: r.replaces } : {}), exp: r.exp };
  }
  if (r.op === "pin") {
    if (r.scope !== "channel" && r.scope !== "all") return null;
    const ch = r.ch;
    if (typeof ch !== "number" || !Number.isInteger(ch) || (r.scope === "all" ? ch !== 0 : ch < 1)) return null;
    if (r.pin === null) return { op: "pin", scope: r.scope, ch, pin: null, exp: r.exp };
    const p = r.pin as Record<string, unknown> | undefined;
    if (!p || typeof p !== "object") return null;
    if (typeof p.text !== "string" || !p.text || [...p.text].length > MEGA_PIN_MAX) return null;
    if (typeof p.name !== "string" || p.name.length > 40) return null;
    if (typeof p.at !== "number" || !Number.isFinite(p.at) || p.at <= 0) return null;
    return { op: "pin", scope: r.scope, ch, pin: { text: p.text, name: p.name, at: p.at }, exp: r.exp };
  }
  if (r.op === "where") {
    const ids = r.visitorIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > WHERE_MAX_IDS) return null;
    if (!ids.every((v) => typeof v === "string" && VISITOR_RE.test(v))) return null;
    return { op: "where", visitorIds: ids as string[], ...(r.fresh === true ? { fresh: true } : {}), exp: r.exp };
  }
  if (r.op === "online") return { op: "online", exp: r.exp };
  if (r.op === "people") return { op: "people", exp: r.exp };
  if (r.op === "peer") {
    if (typeof r.sid !== "number" || !Number.isInteger(r.sid) || r.sid < 0) return null;
    const hasCh = typeof r.ch === "number" && Number.isInteger(r.ch) && r.ch >= 1;
    const hasRoom = typeof r.room === "string" && ROOM_ID_RE.test(r.room);
    if (hasCh === hasRoom) return null; // 둘 중 정확히 하나
    return hasCh ? { op: "peer", ch: r.ch as number, sid: r.sid, exp: r.exp } : { op: "peer", room: r.room as string, sid: r.sid, exp: r.exp };
  }
  return null;
}
