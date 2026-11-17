import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "./token";
import { sanitizeLook, isFireworkId, MEGAPHONE_MAX, type Look, type MegaphoneScope } from "./items";
import { CHAMP_ALL, CHAMP_AURA_OFF, isAvatarBody } from "./constants";
import { packDye, unpackDye, type AvatarDye } from "./dye";
import { bbqItem, DRUNK_MAX, DRUNK_STEP_MS, isBbqId, type BbqItemId } from "./bbq";

// Vercel(포인트·가방의 원천)이 서명하고 실시간 서버가 검증하는 짧은 증서. 비밀키는 JOIN_SECRET.
//  - look: 지금 착용 중인 꾸미기. 실시간 서버는 검증 후 채널에 브로드캐스트한다.
//  - firework: 폭죽 1발 사용권. nonce는 한 번만 쓸 수 있다(서버가 기억해 재사용을 막는다).
//  - goblin(22번): 방향이 반대 — 실시간 서버가 "황금 고블린을 가장 먼저 잡은 사람"에게 서명해 주고 Vercel(/api/goblin)이 검증해
//    포인트를 준다. nonce = 고블린 id (한 마리당 한 번만 지급, 웹이 기억한다).
//  - megaphone(23번): 확성기 1번. Vercel이 금칙어·도배를 거르고 확성기를 소모한 뒤 닉네임·문장을 그대로 서명한다.
//    실시간 서버는 검증 후 그 문장만 방송한다(내용을 바꿀 수 없다). nonce = 확성기 기록 id (한 번만 방송).

export type Grant =
  /** 46·25번: dye·body가 있으면 염색·몸 모양도 같이 바꾼다 (옛 웹이 낸 증서엔 없다 → 실시간 서버는 그대로 둔다) */
  /** 주간 1위: champ = 지금 1위 비트(+ 오라 끔 표시, 0 = 1위 아님)가 있으면 실시간 서버가 다른 사람 화면의 배지·오라도 바꾼다 */
  /** 11/16 mgr = 매니저 표시 (1 = 매니저, 0 = 아님 — 해제되면 실시간 서버가 칭호를 바로 뗀다). 옛 웹이 낸 증서엔 없다 → 그대로 */
  | { kind: "look"; visitorId: string; look: Look; exp: number; dye?: AvatarDye; body?: string; champ?: number; mgr?: 0 | 1 }
  | { kind: "firework"; visitorId: string; item: string; nonce: string; exp: number }
  | { kind: "goblin"; visitorId: string; points: number; nonce: string; exp: number }
  /** ch = 외친 채널 (scope가 channel이면 그 채널 DO만 받아 준다) */
  | { kind: "megaphone"; visitorId: string; nonce: string; name: string; text: string; scope: MegaphoneScope; ch: number; exp: number; /** 운영자 계정 (이름 금색 표시용) */ staff?: true; /** 11/16 매니저 계정 ("매니저" 딱지) */ mgr?: true }
  /**
   * 11/15 캠핑장 바베큐 한 접시·한 잔: until(epoch ms)까지 효과 (bbq.ts). nonce는 한 번만.
   * 마실 거리(취기)면 lv = 마신 뒤 취기 단계, at = 마신 시각 (until = 다 깨는 시각)
   */
  | { kind: "bbq"; visitorId: string; item: BbqItemId; until: number; nonce: string; exp: number; lv?: number; at?: number };

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
      ...(isChampField(g.champ) ? { champ: g.champ } : {}),
      ...(g.mgr === 0 || g.mgr === 1 ? { mgr: g.mgr } : {}),
    };
  // 폭죽 id: 아는 폭죽이거나, 실시간 서버보다 웹이 먼저 배포돼 아직 모르는 새 폭죽(fw_ + 영소문자·숫자). 증서는 Vercel 서명이라 믿고 중계만 한다
  // (받는 옛 클라이언트는 모르는 폭죽을 기본 금빛 폭죽으로 터뜨린다)
  if (g.kind === "firework" && (isFireworkId(g.item) || isNewFireworkId(g.item)) && typeof g.nonce === "string" && g.nonce.length <= 32)
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
    return { kind: "megaphone", visitorId: g.visitorId, nonce: g.nonce, name: g.name, text: g.text, scope: g.scope, ch: g.ch, exp: g.exp, ...(g.staff === true ? { staff: true as const } : {}), ...(g.mgr === true ? { mgr: true as const } : {}) };
  // 11/15 바베큐: 끝나는 시각은 그 메뉴 길이(+여유) 안이어야 한다 (터무니없이 오래 커지지 않게).
  // 마실 거리(취기)는 단계 1~DRUNK_MAX와 마신 시각이 있어야 하고, 끝나는 시각 = 다 깨는 시각
  if (
    g.kind === "bbq" &&
    isBbqId(g.item) &&
    typeof g.until === "number" &&
    Number.isFinite(g.until) &&
    typeof g.nonce === "string" &&
    g.nonce.length <= 32
  ) {
    const item = bbqItem(g.item)!;
    if (item.kind === "drunk") {
      const lv = g.lv;
      const at = g.at;
      if (typeof lv !== "number" || !Number.isInteger(lv) || lv < 1 || lv > DRUNK_MAX || typeof at !== "number" || !Number.isFinite(at)) return null;
      if (at > nowSec * 1000 + GRANT_TTL_SEC * 1000 || g.until !== at + lv * DRUNK_STEP_MS) return null;
      return { kind: "bbq", visitorId: g.visitorId, item: g.item, until: g.until, nonce: g.nonce, exp: g.exp, lv, at };
    }
    // 컨디숑(술 깨기): 내린 뒤 단계 0~DRUNK_MAX-1 (0 = 다 깼다), 끝나는 시각 = 다 깨는 시각
    if (item.kind === "sober") {
      const lv = g.lv;
      const at = g.at;
      if (typeof lv !== "number" || !Number.isInteger(lv) || lv < 0 || lv >= DRUNK_MAX || typeof at !== "number" || !Number.isFinite(at)) return null;
      if (at > nowSec * 1000 + GRANT_TTL_SEC * 1000 || g.until !== at + lv * DRUNK_STEP_MS) return null;
      return { kind: "bbq", visitorId: g.visitorId, item: g.item, until: g.until, nonce: g.nonce, exp: g.exp, lv, at };
    }
    if (g.until > nowSec * 1000 + (item.ms + GRANT_TTL_SEC * 1000)) return null;
    return { kind: "bbq", visitorId: g.visitorId, item: g.item, until: g.until, nonce: g.nonce, exp: g.exp };
  }
  return null;
}

/** 착용 증서의 주간 1위 값: 0(1위 아님), 1위 비트(+ 오라 끔 표시), 또는 오라 끔 표시만(운영자 오라를 끈 운영자) */
function isChampField(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= (CHAMP_ALL | CHAMP_AURA_OFF);
}

/** 아직 카탈로그에 없는 새 폭죽 id 모양 (fw_ + 영소문자·숫자 1~20자) */
function isNewFireworkId(id: unknown): id is string {
  return typeof id === "string" && /^fw_[a-z0-9]{1,20}$/.test(id);
}
