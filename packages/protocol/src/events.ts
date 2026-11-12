import { ACT_KINDS, MAX_MESSAGE_BYTES, isPhraseId, type ActKind, type PhraseId } from "./constants";
import { MAX_GRANT_LEN } from "./grants";
import type { MegaphoneScope } from "./items";
import { GOBLIN_ID_RE, type GoblinInfo } from "./npc";
import type { AvatarDye } from "./dye";
import type { PeerInfo, Sid } from "./types";

// 드문 이벤트는 짧은 JSON text 프레임. 이름과 색은 입장 때(welcome/join) 한 번만 보낸다.

/** 묘비 반응 연출. 살려주세요(revive)는 49번에서 없어졌다 (옛 클라이언트가 보내도 버린다) */
export type EmoteKind = "flower";
export type GraveEventKind = "buried" | "updated" | "removed";

// ── 클라이언트 → 서버 ──
export type C2S =
  /** 1인 자리 점유 요청: 의자/벤치 좌석 또는 소품 자리(world.ts seatSlot). 결과는 seat 브로드캐스트 또는 seatDenied */
  | { t: "sit"; seatId: string }
  /** 좌석에서 일어남 (sitChair가 아닌 MOVE를 보내도 자동 해제된다) */
  | { t: "stand" }
  /** 헌화 저장 성공 후 같은 채널에 연출을 알린다 */
  | { t: "emote"; kind: EmoteKind; graveId: string }
  /** 묘비 생성/수정/삭제 후 같은 채널에 알린다 */
  | { t: "graveEvent"; kind: GraveEventKind; graveId: string }
  /** 랭킹 클릭 등 의도된 순간이동. 속도 검증을 건너뛰고 범위만 검증한다(쿨다운 있음). */
  | { t: "warp"; x: number; y: number }
  /** 꾸미기 변경: Vercel이 서명한 look 증서(grants.ts) */
  | { t: "look"; grant: string }
  /** 폭죽 1발: Vercel이 서명한 firework 증서. 현재 위치에서 터진다 */
  | { t: "firework"; grant: string }
  /** 접속자 목록 다시 받기 (자가 복구용, 1분에 한 번 정도) → 서버가 peers로 답한다 */
  | { t: "sync" }
  /** 한 번 하는 동작 (종 치기 등). 서버가 같은 채널에 중계한다 */
  | { t: "act"; kind: ActKind }
  /** 정해진 문장 말풍선 (PHRASES id) */
  | { t: "say"; id: PhraseId }
  /** 22번: 황금 고블린에 닿았다 (서버가 거리·먼저 온 순서를 판정한다) */
  | { t: "goblin"; id: string }
  /** 23번: 확성기 1번. Vercel이 서명한 megaphone 증서 (닉네임·문장이 들어 있다) */
  | { t: "megaphone"; grant: string }
  /**
   * 3번 집 안 가구 쓰기 (방 전용): u = 가구 배치 id(또는 창문 "w0"…), a = 동작 값 0..255 (피아노 음·불 켜짐·간식 번호 …).
   * 서버는 같은 방 다른 사람에게 그대로 중계한다 (USE_INTERVAL_MS 간격). 뜻은 클라이언트(game/housing/interact.ts)가 정한다
   */
  | { t: "use"; u: string; a: number };

// ── 서버 → 클라이언트 ──
export type WelcomeMsg = {
  t: "welcome";
  sid: Sid;
  channel: number;
  cap: number;
  /** 나를 제외한 현재 접속자 */
  peers: PeerInfo[];
  /** 점유 중인 좌석: seatId → sid */
  seats: Record<string, Sid>;
  /** 재연결 유예 안에 돌아와서 자리를 되찾았으면 true */
  resumed: boolean;
  /**
   * 서버가 소품 자리(나무 매달리기·그네 등, world.ts SPOT_KINDS)도 좌석처럼 판정한다.
   * 없으면(이전 서버) 클라이언트는 소품 자리를 요청하지 않고 예전처럼 혼자 붙는다.
   */
  spots?: boolean;
  /** 22번: 서버 시계(ms). 고양이·유령·고블린 움직임을 모두가 같은 시각으로 계산한다 (없으면 이전 서버 → 내 시계) */
  now?: number;
  /** 22번: 지금 나와 있는(아직 아무도 못 잡은) 황금 고블린 */
  goblin?: GoblinInfo;
};

export type S2C =
  | WelcomeMsg
  | ({ t: "join" } & PeerInfo)
  | { t: "leave"; sid: Sid }
  | { t: "seat"; seatId: string; sid: Sid | null }
  | { t: "seatDenied"; seatId: string }
  | { t: "emote"; sid: Sid; kind: EmoteKind; graveId: string }
  | { t: "graveEvent"; sid: Sid; kind: GraveEventKind; graveId: string }
  /** 꾸미기 변경. 46·25번: dye·body가 있으면 염색·몸 모양도 바뀐 것 (옛 클라이언트는 look만 본다) */
  | { t: "look"; sid: Sid; look: string[]; dye?: AvatarDye; body?: string }
  | { t: "firework"; sid: Sid; item: string; x: number; y: number }
  /** sync 응답: 나를 제외한 현재 접속자 전체와 좌석. 클라이언트는 이걸로 원격 아바타를 맞춘다 */
  | { t: "peers"; peers: PeerInfo[]; seats: Record<string, Sid> }
  | { t: "act"; sid: Sid; kind: ActKind; x: number; y: number }
  | { t: "say"; sid: Sid; id: PhraseId }
  // ── 22번 황금 고블린 (옛 클라이언트는 모르는 t라 그냥 버린다) ──
  /** 나타났다 */
  | { t: "goblin"; g: GoblinInfo }
  /** 아무도 못 잡고 사라졌다 */
  | { t: "goblinGone"; id: string }
  /** sid가 잡았다 (모두에게). name = 잡은 사람 이름 */
  | { t: "goblinCaught"; id: string; sid: Sid; name: string; points: number }
  /** 잡은 사람에게만: 보상 증서 (웹 /api/goblin이 검증해 포인트를 준다) */
  | { t: "goblinGrant"; id: string; grant: string; points: number }
  // ── 23번 확성기 (옛 클라이언트는 모르는 t라 그냥 버린다) ──
  /** 확성기 한마디. id = 확성기 기록 id(중복 표시 방지), ch = 외친 채널, scope = all이면 모든 채널에 퍼졌다 */
  | MegaphoneMsg
  /** 3번: 같은 방 사람이 집 안 가구를 썼다 (옛 클라이언트는 모르는 t라 버린다) */
  | { t: "use"; sid: Sid; u: string; a: number };

/** 23번 확성기 방송 (보낸 사람에게도 간다) */
export type MegaphoneMsg = { t: "megaphone"; id: string; name: string; text: string; scope: MegaphoneScope; ch: number; at: number };

export function encodeEvent(msg: C2S | S2C): string {
  return JSON.stringify(msg);
}

const GRAVE_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SEAT_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
/** 3번 use 이벤트의 대상 id (가구 배치 id는 [a-z0-9]{1,8}, 창문은 "w0"…) */
export const USE_ID_RE = /^[a-z0-9]{1,8}$/;
/** 3번 use 이벤트: 연결당 최소 간격 (피아노를 빠르게 쳐도 들리게 짧게) */
export const USE_INTERVAL_MS = 80;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** 확성기 이벤트만 증서가 길어 이만큼까지 받는다 (나머지는 MAX_MESSAGE_BYTES) */
export const MAX_MEGAPHONE_MESSAGE_BYTES = MAX_GRANT_LEN + 64;

/** 서버가 받는 JSON 이벤트 검증. 형식이 맞지 않거나 512바이트(확성기는 MAX_MEGAPHONE_MESSAGE_BYTES)를 넘으면 null. */
export function parseC2S(text: string): C2S | null {
  if (text.length > MAX_MEGAPHONE_MESSAGE_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const m = o as Record<string, unknown>;
  if (text.length > MAX_MESSAGE_BYTES && m.t !== "megaphone") return null;
  switch (m.t) {
    case "sit":
      return typeof m.seatId === "string" && SEAT_ID_RE.test(m.seatId) ? { t: "sit", seatId: m.seatId } : null;
    case "stand":
      return { t: "stand" };
    case "emote":
      return m.kind === "flower" && typeof m.graveId === "string" && GRAVE_ID_RE.test(m.graveId)
        ? { t: "emote", kind: m.kind, graveId: m.graveId }
        : null;
    case "graveEvent":
      return (m.kind === "buried" || m.kind === "updated" || m.kind === "removed") &&
        typeof m.graveId === "string" &&
        GRAVE_ID_RE.test(m.graveId)
        ? { t: "graveEvent", kind: m.kind, graveId: m.graveId }
        : null;
    case "warp":
      return isNum(m.x) && isNum(m.y) ? { t: "warp", x: Math.round(m.x), y: Math.round(m.y) } : null;
    case "look":
    case "firework":
      return typeof m.grant === "string" && m.grant.length <= 400 ? { t: m.t, grant: m.grant } : null;
    case "sync":
      return { t: "sync" };
    case "say":
      return isPhraseId(m.id) ? { t: "say", id: m.id } : null;
    case "goblin":
      return typeof m.id === "string" && GOBLIN_ID_RE.test(m.id) ? { t: "goblin", id: m.id } : null;
    case "megaphone":
      return typeof m.grant === "string" && m.grant.length <= MAX_GRANT_LEN ? { t: "megaphone", grant: m.grant } : null;
    case "act":
      return typeof m.kind === "string" && (ACT_KINDS as readonly string[]).includes(m.kind) ? { t: "act", kind: m.kind as ActKind } : null;
    case "use":
      return typeof m.u === "string" && USE_ID_RE.test(m.u) && typeof m.a === "number" && Number.isInteger(m.a) && m.a >= 0 && m.a <= 255
        ? { t: "use", u: m.u, a: m.a }
        : null;
    default:
      return null;
  }
}

/** 클라이언트가 받는 JSON 이벤트 파싱 (서버를 신뢰하므로 최소 검증) */
export function parseS2C(text: string): S2C | null {
  try {
    const o = JSON.parse(text) as S2C;
    return o && typeof o === "object" && typeof o.t === "string" ? o : null;
  } catch {
    return null;
  }
}

