import { JOIN_TOKEN_TTL_SEC, ROOM_ID_RE, isAvatarBody, isChampValue, isDexBadge, staffGateBody } from "./constants";
import { mgrGateLook, sanitizeLook, staffGateLook } from "./items";
import { isSproutLeft } from "./sprout";
import { packDye, packItemDye, sanitizeItemDye, unpackWireDye, type AvatarDye } from "./dye";

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
  /** 지난주 랭킹 1위 (CHAMP_BOARDS 비트 묶음, 1~7). Vercel이 주간 1위 기록을 확인한 뒤에만 넣는다. 없으면 0 */
  champ?: number;
  /** 11/16 매니저 (관리자가 임명, Vercel이 확인한 뒤에만 넣는다 → 매니저 전용 칭호·채팅 딱지). 일반 계정엔 없다 */
  mgr?: true;
  /** 11/22 새싹 (총 접속 3시간 미만 새 이웃, 운영자·매니저 빼고): 새싹으로 남은 분 1~180. Vercel이 계정 기록을 확인한 뒤에만 넣는다 */
  nb?: number;
  /** 11/15 캠핑장에 갈 수 있다 (테스트 서버이거나 운영 CAMP_ENABLED=1일 때 Vercel이 넣는다). 없으면 버스를 타도 마을에 그대로 */
  camp?: true;
  /** 11/16 바닷가(달물결 포구)에 갈 수 있다 (테스트 서버이거나 운영 SEA_ENABLED=1일 때 Vercel이 넣는다). 없으면 바닷가행 버스를 타도 마을에 그대로 */
  sea?: true;
  /** 11/27 좌대 입장권 막기를 켠다 (웹이 좌대 입장권을 파는 서버일 때 넣는다 — 실시간 서버만 먼저 배포돼도 좌대가 막히지 않게). 없으면 막지 않는다 */
  rafts?: true;
  /** 11/27 이 채널 좌대 입장권 (n번, u = 끝나는 시각 epoch ms). 웹이 확인한 것만 */
  raft?: { n: number; u: number };
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
  // 11/22 염색은 캐릭터 3부위(dye, 옛 형식)와 입은 아이템 색(idye "아이템id:rrggbb,…")을 나눠 싣는다 — 옛 실시간 서버는 idye를 모르고 지나간다
  const charDye = packDye(dye);
  const itemDye = packItemDye(sanitizeItemDye(dye?.items, claims.look ?? []));
  const payload = { ...rest, ...(charDye ? { dye: charDye } : {}), ...(itemDye ? { idye: itemDye } : {}), exp: nowSec + ttlSec };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

/** 서명이 틀리거나 만료됐거나 형식이 맞지 않으면 null */
/** 입장 토큰 최대 길이 (서명 검증 전에 거른다) */
// 11/22 입은 아이템 색(idye — 입은 칸 수 × (아이템 id + 색), 많아야 130자 남짓)이 실려 넉넉하게 (예전 900).
// 옛 실시간 서버는 900 그대로라, 웹(lib/joinToken)이 900을 넘는 토큰은 idye를 빼고 다시 만든다 (색은 바로 뒤 착용 증서로 간다)
export const JOIN_TOKEN_MAX_LEN = 1100;
/** 옛 실시간 서버가 받던 입장 토큰 최대 길이 */
export const LEGACY_JOIN_TOKEN_MAX_LEN = 900;

export async function verifyJoinToken(
  secret: string,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<JoinClaims | null> {
  // 11/15 캠핑장 허락(camp)이 실리며 16자 늘었다 — 꾸미기를 가득 입은 계정도 넉넉하게 (예전 600)
  // 11/16 매니저 표시(mgr)까지 실린 사냥터 방 토큰(사냥 장비 3개 + 방 id)은 720을 넘을 수 있어 넉넉하게 (예전 720)
  if (typeof token !== "string" || token.length > JOIN_TOKEN_MAX_LEN) return null;
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
  const { visitorId, name, color, channel, exp, look, body: rawBody, room, dye, idye, staff, dex, champ, camp, sea, mgr, nb, rafts, raft } = c as Record<string, unknown>;
  // 방 id가 있는데 형식이 틀리면 토큰째 버린다 (방 없는 채널 0 토큰 = 대기열 토큰으로 바뀌지 않게)
  if (room !== undefined && !(typeof room === "string" && ROOM_ID_RE.test(room))) return null;
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
  // 11/16 매니저 전용 칭호는 매니저 표시(mgr)가 있을 때만
  const lk = mgrGateLook(staffGateLook(sanitizeLook(look), isStaff), mgr === true);
  // 염색: 캐릭터 3부위 + 입은 아이템 색 (착용 목록에 없는 아이템 색은 버린다)
  const wireDye = unpackWireDye(dye, idye, lk);
  return { visitorId, name, color, channel, exp, look: lk, body: staffGateBody(isAvatarBody(rawBody) ? rawBody : "hood", isStaff), ...(typeof room === "string" && ROOM_ID_RE.test(room) ? { room } : {}), ...(Object.keys(wireDye).length ? { dye: wireDye } : {}), ...(staff === true ? { staff: true as const } : {}), ...(isDexBadge(dex) ? { dex } : {}), ...(isChampValue(champ) ? { champ } : {}), ...(camp === true ? { camp: true as const } : {}), ...(sea === true ? { sea: true as const } : {}), ...(mgr === true ? { mgr: true as const } : {}), ...(isSproutLeft(nb) && staff !== true && mgr !== true ? { nb } : {}), ...(rafts === true ? { rafts: true as const } : {}), ...(isRaftClaim(raft) ? { raft: { n: raft.n, u: raft.u } } : {}) };
}

/** 11/27 입장 토큰의 좌대 입장권 (번호 1~6, 끝나는 시각) */
function isRaftClaim(v: unknown): v is { n: number; u: number } {
  const r = v as { n?: unknown; u?: unknown } | null;
  return !!r && typeof r === "object" && typeof r.n === "number" && Number.isInteger(r.n) && r.n >= 1 && r.n <= 6 && typeof r.u === "number" && Number.isFinite(r.u);
}
