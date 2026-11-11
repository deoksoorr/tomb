import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@tomb/protocol";

// 낚시·채집 티켓: 던질 때(채집을 시작할 때) 서버가 서명해 주고, 끝낼 때 그대로 돌려받는다.
// `${base64url(JSON)}.${HMAC(SESSION_SECRET, "forage:" + payload)}` — 서명이 맞아도 한 번만 쓸 수 있다 (저장소의 claim).
// 무엇이 걸렸는지(물고기 종류·크기, 채집물)는 티켓에 넣지 않는다 → 저장소의 진행 기록에만 있어 미리 엿보고 골라 낚을 수 없다.

export type ForageTicket = {
  /** 한 번만 쓰기 판정 */
  n: string;
  /** 계정 id */
  a: string;
  k: "fish" | "gather";
  /** 낚시 자리 id 또는 채집 지점 id */
  x: string;
  /** 시작 시각 ms (서버 시계) */
  t: number;
  /** 낚시: 입질 시각 ms (서버 시계) */
  b?: number;
  /** 낚시: 손맛 1~5 */
  p?: number;
  /** 채집: 지점 창 번호 (이 창에 캔 것으로 기록) */
  w?: number;
  /** 채집: 게이지 시간 ms (곤충은 0) */
  m?: number;
  /** 곤충: 미니게임 시드 */
  s?: number;
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const DOMAIN = "forage:";

export async function signForageTicket(secret: string, claims: ForageTicket): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify(claims)));
  return `${payload}.${await hmacSign(secret, DOMAIN + payload)}`;
}

const int = (v: unknown) => v === undefined || Number.isInteger(v);

/** 서명이 맞고 형식이 온전하면 claims, 아니면 null */
export async function verifyForageTicket(secret: string, token: string): Promise<ForageTicket | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 1000) return null;
  const payload = token.slice(0, dot);
  if (!(await hmacVerify(secret, DOMAIN + payload, token.slice(dot + 1)))) return null;
  const bytes = b64urlDecode(payload);
  if (!bytes) return null;
  try {
    const c = JSON.parse(dec.decode(bytes)) as ForageTicket;
    const ok =
      typeof c.n === "string" &&
      typeof c.a === "string" &&
      (c.k === "fish" || c.k === "gather") &&
      typeof c.x === "string" &&
      Number.isFinite(c.t) &&
      int(c.b) &&
      int(c.p) &&
      int(c.w) &&
      int(c.m) &&
      int(c.s);
    return ok ? c : null;
  } catch {
    return null;
  }
}
