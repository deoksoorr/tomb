import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@tomb/protocol";
import { DIFFICULTIES, GAME_KINDS, HUNT_ZONES, isTowerZoneId, isZoneId, type Difficulty, type GameKind, type ZoneId } from "./catalog";
import { RUN_TIERS, type RunTier } from "./endgame";
import { isCheckpoint } from "./tower";
import type { Drop } from "./types";

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
  /** 사냥터 id (40번, 사냥만). 없으면 그 난이도의 기본 사냥터 */
  z?: ZoneId;
  /** 별자리 잇기 계획 판 번호 (판 시작 때 화면이 알려 준 판). 없으면 판 번호가 생기기 전 티켓 */
  sv?: number;
  /** 테스트 서버 운영자 시험 드롭 (lib/rpg/testDrops). 있으면 판 끝에 굴림 대신 이것을 준다 — 운영 서버는 싣지도 읽지도 않는다 */
  td?: Drop[];
  /** 11/15 야근 빌딩 시작 층 (지옥 사냥만, 체크포인트 1·11·21 …). 서버가 판 시작 때 레벨·최고 기록으로 연 체크포인트인지 확인했다. 시드는 s */
  tw?: number;
  /** 11/15 초월 판 구간 (레벨 50 지옥 판만). 서버가 판 시작 때 그날 판 수로 정했다 — 결과에서 클라이언트 말을 믿지 않는다 */
  tt?: RunTier;
  /** 11/15 장비 힘 배율 (세트 장비·강화·옵션 — 서버가 저장된 장착 칸으로 쟀다, 1..40). 처치 속도 상한에 곱한다 */
  gp?: number;
};

/** 시험 드롭 형식 (한 판 최대 6개, 하나씩) */
const okDrops = (v: unknown): v is Drop[] =>
  Array.isArray(v) &&
  v.length <= 6 &&
  v.every((d: Partial<Drop> | null) => !!d && (d.kind === "gear" || d.kind === "potion" || d.kind === "cosmetic") && typeof d.id === "string" && d.id.length <= 64 && d.qty === 1);

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
      c.st !== null &&
      // 11/15 야근 빌딩 판은 시작 층의 전용 테마(지하 서버실 …)가 실린다
      (c.z === undefined || ((isZoneId(c.z) || (isTowerZoneId(c.z) && c.tw !== undefined)) && HUNT_ZONES[c.z].difficulty === c.d)) &&
      (c.sv === undefined || Number.isInteger(c.sv)) &&
      (c.td === undefined || okDrops(c.td)) &&
      (c.tw === undefined || (isCheckpoint(c.tw) && c.tw <= 10_000 && c.g === "hunt" && c.d === "hell" && c.tt === undefined)) &&
      (c.tt === undefined || Object.hasOwn(RUN_TIERS, c.tt)) &&
      (c.gp === undefined || (typeof c.gp === "number" && c.gp >= 1 && c.gp <= 40));
    return ok ? c : null;
  } catch {
    return null;
  }
}
