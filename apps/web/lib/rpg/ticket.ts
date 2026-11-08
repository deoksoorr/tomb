import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@tomb/protocol";
import { DIFFICULTIES, GAME_KINDS, type Difficulty, type GameKind } from "./catalog";

// 런 티켓: 서버가 판을 시작할 때 서명해 주고, 끝낼 때 그대로 돌려받는다.
// `${base64url(JSON)}.${HMAC(SESSION_SECRET, "rpg:" + payload)}` — 서명이 맞아도 한 번만 쓸 수 있다 (저장소의 claimRun).

export type TicketClaims = {
  /** 판 고유값 (한 번만 쓰기 판정) */
  n: string;
  /** 계정 id */
  a: string;
  g: GameKind;
  d: Difficulty;
  /** 시작 시각 ms (서버 시계) */
  t: number;
  s: number;
  lv: number;
  /** 시작할 때의 능력치 (미니게임 출현 계획이 DEX·LUK에 따라 달라진다) */
  st: { agi: number; dex: number; luk: number };
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const DOMAIN = "rpg:";

export async function signTicket(secret: string, claims: TicketClaims): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify(claims)));
  return `${payload}.${await hmacSign(secret, DOMAIN + payload)}`;
}

/** 서명이 맞고 형식이 온전하면 claims, 아니면 null */
export async function verifyTicket(secret: string, token: string): Promise<TicketClaims | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 2000) return null;
  const payload = token.slice(0, dot);
  if (!(await hmacVerify(secret, DOMAIN + payload, token.slice(dot + 1)))) return null;
  const bytes = b64urlDecode(payload);
  if (!bytes) return null;
  try {
    const c = JSON.parse(dec.decode(bytes)) as TicketClaims;
    const ok =
      typeof c.n === "string" &&
      typeof c.a === "string" &&
      GAME_KINDS.includes(c.g) &&
      DIFFICULTIES.includes(c.d) &&
      Number.isFinite(c.t) &&
      Number.isInteger(c.s) &&
      Number.isInteger(c.lv) &&
      typeof c.st === "object" &&
      c.st !== null;
    return ok ? c : null;
  } catch {
    return null;
  }
}
