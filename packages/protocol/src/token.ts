import { JOIN_TOKEN_TTL_SEC, ROOM_ID_RE, isAvatarBody, isDexBadge, staffGateBody } from "./constants";
import { sanitizeLook, staffGateLook } from "./items";
import { hasDye, packDye, unpackDye, type AvatarDye } from "./dye";

// 입장 토큰: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, JOIN_SECRET))
// Web Crypto만 사용하므로 Node(>=20, Vercel)와 Cloudflare Workers 양쪽에서 같은 코드가 돈다.
// 같은 hmacSign/hmacVerify를 web의 세션 쿠키 서명(SESSION_SECRET)에도 쓴다.

export type JoinClaims = {
  visitorId: string;
  name: string;
  color: string;
  /** 이 토큰으로 들어갈 수 있는 채널. 토큰 하나로 여러 채널 자리를 차지하지 못하게 한다 */
  channel: number;
  /** 입장 시점에 착용 중인 꾸미기 (없으면 빈 배열) */
  look?: string[];
  /** 아바타 몸 모양 (AVATAR_BODIES, 없으면 hood) */
  body?: string;
  /** 방 입장 토큰이면 방 id (이때 channel은 0). 채널 토큰엔 없다 */
  room?: string;
  /** 46번 염색한 부위 색 (토큰 안에서는 짧은 형식 문자열, 염색 안 했으면 없음) */
  dye?: AvatarDye;
  /** 31번 운영자 계정 (Vercel이 확인한 뒤에만 넣는다 → 저승사자 차림·"운영자" 배지). 일반 계정엔 없다 */
  staff?: true;
  /** 도감 100% 달성 종류 (DEX_BADGE_BITS 비트 묶음, 1~31). Vercel이 도감 기록을 확인한 뒤에만 넣는다. 없으면 0 */
  dex?: number;
  /** 만료 시각 (unix seconds) */
  exp: number;
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    keyCache.set(secret, k);
  }
  return k;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) return null;
  try {
    const b = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** data에 대한 HMAC-SHA256 서명 (base64url) */
export async function hmacSign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await getKey(secret), enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

/** 상수 시간 검증 (crypto.subtle.verify) */
export async function hmacVerify(secret: string, data: string, sigB64url: string): Promise<boolean> {
  const sig = b64urlDecode(sigB64url);
  if (!sig) return false;
  return crypto.subtle.verify("HMAC", await getKey(secret), sig as BufferSource, enc.encode(data));
}

export async function signJoinToken(
  secret: string,
  claims: Omit<JoinClaims, "exp">,
  ttlSec = JOIN_TOKEN_TTL_SEC,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const { dye, ...rest } = claims;
  const payload = { ...rest, ...(hasDye(dye) ? { dye: packDye(dye) } : {}), exp: nowSec + ttlSec };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

/** 서명이 틀리거나 만료됐거나 형식이 맞지 않으면 null */
export async function verifyJoinToken(
  secret: string,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<JoinClaims | null> {
  if (typeof token !== "string" || token.length > 600) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(secret, body, sig))) return null;
  const raw = b64urlDecode(body);
  if (!raw) return null;
  let c: unknown;
  try {
    c = JSON.parse(dec.decode(raw));
  } catch {
    return null;
  }
  if (!c || typeof c !== "object") return null;
  const { visitorId, name, color, channel, exp, look, body: rawBody, room, dye, staff, dex } = c as Record<string, unknown>;
  if (
    typeof visitorId !== "string" ||
    typeof name !== "string" ||
    typeof color !== "string" ||
    typeof channel !== "number" ||
    !Number.isInteger(channel) ||
    typeof exp !== "number"
  )
    return null;
  if (exp < nowSec) return null;
  // 운영자 전용 몸·꾸미기는 토큰에 운영자 표시(staff)가 있을 때만 (없으면 후드 유령·빼고)
  const isStaff = staff === true;
  return { visitorId, name, color, channel, exp, look: staffGateLook(sanitizeLook(look), isStaff), body: staffGateBody(isAvatarBody(rawBody) ? rawBody : "hood", isStaff), ...(typeof room === "string" && ROOM_ID_RE.test(room) ? { room } : {}), ...(typeof dye === "string" && dye ? { dye: unpackDye(dye) } : {}), ...(staff === true ? { staff: true as const } : {}), ...(isDexBadge(dex) ? { dex } : {}) };
}
