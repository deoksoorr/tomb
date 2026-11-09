import { ACT_KINDS, CLOSE, isPhraseId, ROOM_ID_RE, type ActKind, type PeerInfo, type PhraseId, type Sid } from "@tomb/protocol";

// 방(room) 연결의 순수 규칙: 접속 URL, 닫힘 코드 → 다음 행동, 받은 JSON 검증. Phaser·WebSocket 없이 테스트한다.

export function isRoomId(room: unknown): room is string {
  return typeof room === "string" && ROOM_ID_RE.test(room);
}

/** 서버가 준 wsUrl에 스폰 위치를 붙인다 (채널과 같은 규칙) */
export function roomSocketUrl(wsUrl: string, x: number, y: number): string {
  const sep = wsUrl.includes("?") ? "&" : "?";
  return `${wsUrl}${sep}x=${Math.round(x)}&y=${Math.round(y)}`;
}

/**
 * 소켓이 닫힌 뒤 할 일.
 *  - leave: 내가 나감(1000) → 아무것도 안 함
 *  - replaced: 다른 탭에서 같은 방문자로 들어옴 → 자동 재접속 안 함
 *  - refetch: 토큰 만료·잘못된 요청 → 토큰을 새로 받아 곧바로 (연달아 3번째부터는 백오프)
 *  - full: 방이 가득 참 → 토큰을 버리고 천천히 다시
 *  - rate: 너무 많이 보냄 → 최소 2초 쉬고
 *  - retry: 그 밖(네트워크 끊김·서버 재시작) → 같은 토큰으로 백오프 재접속
 */
export type RoomCloseAction = "leave" | "replaced" | "refetch" | "full" | "rate" | "retry";

export function roomCloseAction(code: number, intentional: boolean): RoomCloseAction {
  if (intentional) return "leave";
  switch (code) {
    case CLOSE.REPLACED:
      return "replaced";
    case CLOSE.INVALID_TOKEN:
    case CLOSE.BAD_REQUEST:
      return "refetch";
    case CLOSE.CHANNEL_FULL:
      return "full";
    case CLOSE.RATE_LIMITED:
      return "rate";
    default:
      return "retry";
  }
}

/** 방 안에서 쓰는 서버 메시지 (좌석·묘비·폭죽 등은 방에 없다) */
export type RoomWelcome = { sid: Sid; cap: number; peers: PeerInfo[]; resumed: boolean };
export type RoomEvent =
  | { t: "welcome"; m: RoomWelcome }
  | { t: "join"; p: PeerInfo }
  | { t: "leave"; sid: Sid }
  | { t: "look"; sid: Sid; look: string[] }
  | { t: "act"; sid: Sid; kind: ActKind; x: number; y: number }
  | { t: "say"; sid: Sid; id: PhraseId }
  | { t: "peers"; peers: PeerInfo[] };

const isSid = (v: unknown): v is Sid => typeof v === "number" && Number.isInteger(v) && v >= 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function peerOk(p: unknown): p is PeerInfo {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return isSid(o.sid) && num(o.x) && num(o.y) && typeof o.name === "string" && typeof o.color === "string";
}

function cleanPeer(p: PeerInfo): PeerInfo {
  return { ...p, look: Array.isArray(p.look) ? p.look.filter((x): x is string => typeof x === "string") : [], body: typeof p.body === "string" ? p.body : "hood" };
}

/** 텍스트 프레임 → 방 이벤트 (모르는·잘못된 메시지는 null). 내 sid가 보낸 act/say/join은 걸러 낸다 */
export function parseRoomMessage(text: string, mySid: Sid | null): RoomEvent | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!m || typeof m !== "object" || typeof m.t !== "string") return null;
  switch (m.t) {
    case "welcome": {
      if (!isSid(m.sid) || !Array.isArray(m.peers)) return null;
      const sid = m.sid;
      const peers = (m.peers as unknown[]).filter(peerOk).filter((p) => p.sid !== sid).map(cleanPeer);
      return { t: "welcome", m: { sid, cap: num(m.cap) ? m.cap : 0, peers, resumed: m.resumed === true } };
    }
    case "join":
      return peerOk(m) && m.sid !== mySid ? { t: "join", p: cleanPeer(m as unknown as PeerInfo) } : null;
    case "leave":
      return isSid(m.sid) ? { t: "leave", sid: m.sid } : null;
    case "look":
      return isSid(m.sid) && m.sid !== mySid && Array.isArray(m.look)
        ? { t: "look", sid: m.sid, look: (m.look as unknown[]).filter((x): x is string => typeof x === "string") }
        : null;
    case "act":
      return isSid(m.sid) && m.sid !== mySid && typeof m.kind === "string" && (ACT_KINDS as readonly string[]).includes(m.kind) && num(m.x) && num(m.y)
        ? { t: "act", sid: m.sid, kind: m.kind as ActKind, x: m.x, y: m.y }
        : null;
    case "say":
      return isSid(m.sid) && m.sid !== mySid && isPhraseId(m.id) ? { t: "say", sid: m.sid, id: m.id } : null;
    case "peers":
      return Array.isArray(m.peers) ? { t: "peers", peers: (m.peers as unknown[]).filter(peerOk).filter((p) => p.sid !== mySid).map(cleanPeer) } : null;
    default:
      return null;
  }
}
