import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "./token";
import { sanitizeLook, isFireworkId, type Look } from "./items";

// Vercel(포인트·가방의 원천)이 서명하고 실시간 서버가 검증하는 짧은 증서. 비밀키는 JOIN_SECRET.
//  - look: 지금 착용 중인 꾸미기. 실시간 서버는 검증 후 채널에 브로드캐스트한다.
//  - firework: 폭죽 1발 사용권. nonce는 한 번만 쓸 수 있다(서버가 기억해 재사용을 막는다).

export type Grant =
  | { kind: "look"; visitorId: string; look: Look; exp: number }
  | { kind: "firework"; visitorId: string; item: string; nonce: string; exp: number };

export const GRANT_TTL_SEC = 60;

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function signGrant(secret: string, g: Grant): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(g)));
  return `${body}.${await hmacSign(secret, "grant:" + body)}`;
}

export async function verifyGrant(
  secret: string,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<Grant | null> {
  if (typeof token !== "string" || token.length > 400) return null;
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
  if (g.kind === "look") return { kind: "look", visitorId: g.visitorId, look: sanitizeLook(g.look), exp: g.exp };
  if (g.kind === "firework" && isFireworkId(g.item) && typeof g.nonce === "string" && g.nonce.length <= 32)
    return { kind: "firework", visitorId: g.visitorId, item: g.item, nonce: g.nonce, exp: g.exp };
  return null;
}
