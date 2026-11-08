import { AVATAR_COLORS, NAME_MAX, isAvatarColor, normalizeName, verifyJoinToken } from "@tomb/protocol";
import type { JoinTicket } from "./channel";
import type { Point } from "./logic";

// Origin 허용 목록, CORS, 입장 토큰 검증·거절, Worker → Channel DO 내부 헤더.

/** 브라우저가 보내는 Origin과 비교할 수 있게 정규화 (공백·끝 슬래시 제거, 소문자) */
export function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, "").toLowerCase();
}

/** ALLOWED_ORIGINS="https://a.com,https://www.a.com" → Set */
export function parseOrigins(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? "").split(",").map(normalizeOrigin).filter(Boolean));
}

export function isAllowedOrigin(origin: string | null, allowed: ReadonlySet<string>): origin is string {
  return origin !== null && allowed.has(normalizeOrigin(origin));
}

/** 허용된 Origin이면 그 Origin만 되돌려 준다(와일드카드 없음). 응답이 Origin마다 다르므로 Vary: Origin. */
export function corsHeaders(origin: string | null, allowed: ReadonlySet<string>): Record<string, string> {
  return isAllowedOrigin(origin, allowed) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { Vary: "Origin" };
}

const VISITOR_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FALLBACK_NAME = "무명";

/**
 * 입장 토큰을 검증하고 DO에 넘길 입장 정보를 만든다. 서명이 틀렸거나, 만료됐거나, 다른 채널용이면 null.
 * 이름·색은 Vercel이 이미 검증해 서명했지만, 여기서도 길이와 색 프리셋만큼은 한 번 더 맞춘다.
 */
export async function admit(
  secret: string | undefined,
  token: string | null,
  channel: number,
  spawn: Point | undefined,
): Promise<JoinTicket | null> {
  if (!secret || !token) return null;
  const claims = await verifyJoinToken(secret, token).catch(() => null);
  // 토큰은 발급받은 채널에서만 쓸 수 있다(토큰 하나로 여러 채널 자리를 차지하지 못하게)
  if (!claims || claims.channel !== channel || !VISITOR_ID_RE.test(claims.visitorId)) return null;
  const name = [...normalizeName(claims.name)].slice(0, NAME_MAX).join("") || FALLBACK_NAME;
  const color = isAvatarColor(claims.color) ? claims.color : AVATAR_COLORS[0];
  return { visitorId: claims.visitorId, name, color, channel, spawn };
}

/**
 * 업그레이드를 끝낸 뒤 close code로 거절한다(4001/4003/4004). HTTP 오류로 거절하면 브라우저는 이유를 읽을 수 없다.
 * hibernation 소켓이 아닌 일반 소켓이라 close 프레임이 바로 나가고 핸드셰이크도 바로 끝난다.
 */
export function rejectSocket(code: number, reason: string): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

// Channel DO는 공개 경로가 없고 이 Worker만 부를 수 있으므로, 검증을 끝낸 입장 정보를 내부 헤더로 넘긴다.
// 헤더 값은 ByteString이어야 해서(한글 이름) URI 인코딩한다. 클라이언트가 같은 헤더를 보내도 Worker가 덮어쓴다.
export const TICKET_HEADER = "X-Tomb-Ticket";

export function encodeTicket(t: JoinTicket): string {
  return encodeURIComponent(JSON.stringify(t));
}

export function decodeTicket(raw: string | null): JoinTicket | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(decodeURIComponent(raw)) as JoinTicket;
    return t && typeof t.visitorId === "string" && Number.isInteger(t.channel) ? t : null;
  } catch {
    return null;
  }
}
