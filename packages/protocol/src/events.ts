import { ACT_KINDS, MAX_MESSAGE_BYTES, isPhraseId, type ActKind, type PhraseId } from "./constants";
import type { PeerInfo, Sid } from "./types";

// 드문 이벤트는 짧은 JSON text 프레임. 이름과 색은 입장 때(welcome/join) 한 번만 보낸다.

export type EmoteKind = "flower" | "revive";
export type GraveEventKind = "buried" | "updated" | "removed";

// ── 클라이언트 → 서버 ──
export type C2S =
  /** 1인 자리 점유 요청: 의자/벤치 좌석 또는 소품 자리(world.ts seatSlot). 결과는 seat 브로드캐스트 또는 seatDenied */
  | { t: "sit"; seatId: string }
  /** 좌석에서 일어남 (sitChair가 아닌 MOVE를 보내도 자동 해제된다) */
  | { t: "stand" }
  /** 헌화/살려주세요 저장 성공 후 같은 채널에 연출을 알린다 */
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
  | { t: "say"; id: PhraseId };

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
};

export type S2C =
  | WelcomeMsg
  | ({ t: "join" } & PeerInfo)
  | { t: "leave"; sid: Sid }
  | { t: "seat"; seatId: string; sid: Sid | null }
  | { t: "seatDenied"; seatId: string }
  | { t: "emote"; sid: Sid; kind: EmoteKind; graveId: string }
  | { t: "graveEvent"; sid: Sid; kind: GraveEventKind; graveId: string }
  | { t: "look"; sid: Sid; look: string[] }
  | { t: "firework"; sid: Sid; item: string; x: number; y: number }
  /** sync 응답: 나를 제외한 현재 접속자 전체와 좌석. 클라이언트는 이걸로 원격 아바타를 맞춘다 */
  | { t: "peers"; peers: PeerInfo[]; seats: Record<string, Sid> }
  | { t: "act"; sid: Sid; kind: ActKind; x: number; y: number }
  | { t: "say"; sid: Sid; id: PhraseId };

export function encodeEvent(msg: C2S | S2C): string {
  return JSON.stringify(msg);
}

const GRAVE_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SEAT_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** 서버가 받는 JSON 이벤트 검증. 형식이 맞지 않거나 512바이트를 넘으면 null. */
export function parseC2S(text: string): C2S | null {
  if (text.length > MAX_MESSAGE_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const m = o as Record<string, unknown>;
  switch (m.t) {
    case "sit":
      return typeof m.seatId === "string" && SEAT_ID_RE.test(m.seatId) ? { t: "sit", seatId: m.seatId } : null;
    case "stand":
      return { t: "stand" };
    case "emote":
      return (m.kind === "flower" || m.kind === "revive") && typeof m.graveId === "string" && GRAVE_ID_RE.test(m.graveId)
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
    case "act":
      return typeof m.kind === "string" && (ACT_KINDS as readonly string[]).includes(m.kind) ? { t: "act", kind: m.kind as ActKind } : null;
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

