import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "./token";
import { sanitizeLook, isFireworkId, MEGAPHONE_MAX, type Look, type MegaphoneScope } from "./items";
import { isAvatarBody } from "./constants";
import { packDye, unpackDye, type AvatarDye } from "./dye";

// Vercel(포인트·가방의 원천)이 서명하고 실시간 서버가 검증하는 짧은 증서. 비밀키는 JOIN_SECRET.
//  - look: 지금 착용 중인 꾸미기. 실시간 서버는 검증 후 채널에 브로드캐스트한다.
//  - firework: 폭죽 1발 사용권. nonce는 한 번만 쓸 수 있다(서버가 기억해 재사용을 막는다).
//  - goblin(22번): 방향이 반대 — 실시간 서버가 "황금 고블린을 가장 먼저 잡은 사람"에게 서명해 주고 Vercel(/api/goblin)이 검증해
//    포인트를 준다. nonce = 고블린 id (한 마리당 한 번만 지급, 웹이 기억한다).
//  - megaphone(23번): 확성기 1번. Vercel이 금칙어·도배를 거르고 확성기를 소모한 뒤 닉네임·문장을 그대로 서명한다.
//    실시간 서버는 검증 후 그 문장만 방송한다(내용을 바꿀 수 없다). nonce = 확성기 기록 id (한 번만 방송).

export type Grant =
  /** 46·25번: dye·body가 있으면 염색·몸 모양도 같이 바꾼다 (옛 웹이 낸 증서엔 없다 → 실시간 서버는 그대로 둔다) */
  | { kind: "look"; visitorId: string; look: Look; exp: number; dye?: AvatarDye; body?: string }
  | { kind: "firework"; visitorId: string; item: string; nonce: string; exp: number }
  | { kind: "goblin"; visitorId: string; points: number; nonce: string; exp: number }
  /** ch = 외친 채널 (scope가 channel이면 그 채널 DO만 받아 준다) */
  | { kind: "megaphone"; visitorId: string; nonce: string; name: string; text: string; scope: MegaphoneScope; ch: number; exp: number };

export const GRANT_TTL_SEC = 60;
/** 증서 최대 길이. 확성기 증서는 닉네임·문장(한글 60자)을 품어 다른 증서보다 길다 */
export const MAX_GRANT_LEN = 1200;

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signGrant(secret: string, g: Grant): Promise<string> {
  // look 증서의 염색은 짧은 형식("aabbcc..f4a7b9", 기본색이면 "")으로 싣는다
  const wire = g.kind === "look" && g.dye !== undefined ? { ...g, dye: packDye(g.dye) } : g;
  const body = b64urlEncode(enc.encode(JSON.stringify(wire)));
  return `${body}.${await hmacSign(secret, "grant:" + body)}`;
}

export async function verifyGrant(
  secret: string,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<Grant | null> {
  if (typeof token !== "string" || token.length > MAX_GRANT_LEN) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  if (!(await hmacVerify(secret, "grant:" + body, token.slice(dot + 1)))) return null;
  const raw = b64urlDecode(body);
  if (!raw) return null;
  let g: Record<string, unknown>;
  try {
    g = JSON.parse(dec.decode(raw));
  } catch {
    return null;
  }
  if (typeof g.visitorId !== "string" || typeof g.exp !== "number" || g.exp < nowSec) return null;
  if (g.kind === "look")
    return {
      kind: "look",
      visitorId: g.visitorId,
      look: sanitizeLook(g.look),
      exp: g.exp,
      ...(typeof g.dye === "string" ? { dye: unpackDye(g.dye) } : {}),
      ...(isAvatarBody(g.body) ? { body: g.body } : {}),
    };
  if (g.kind === "firework" && isFireworkId(g.item) && typeof g.nonce === "string" && g.nonce.length <= 32)
    return { kind: "firework", visitorId: g.visitorId, item: g.item, nonce: g.nonce, exp: g.exp };
  if (g.kind === "goblin" && typeof g.points === "number" && Number.isInteger(g.points) && g.points > 0 && g.points <= 1000 && typeof g.nonce === "string" && g.nonce.length <= 32)
    return { kind: "goblin", visitorId: g.visitorId, points: g.points, nonce: g.nonce, exp: g.exp };
  if (
    g.kind === "megaphone" &&
    typeof g.nonce === "string" &&
    g.nonce.length <= 32 &&
    typeof g.name === "string" &&
    [...g.name].length <= 20 &&
    typeof g.text === "string" &&
    [...g.text].length >= 1 &&
    [...g.text].length <= MEGAPHONE_MAX &&
    (g.scope === "channel" || g.scope === "all") &&
    typeof g.ch === "number" &&
    Number.isInteger(g.ch) &&
    g.ch >= 1 &&
    g.ch <= 100
  )
    return { kind: "megaphone", visitorId: g.visitorId, nonce: g.nonce, name: g.name, text: g.text, scope: g.scope, ch: g.ch, exp: g.exp };
  return null;
}
