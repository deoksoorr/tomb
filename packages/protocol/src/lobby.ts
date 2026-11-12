import { DEFAULT_AUTO_OPEN_THRESHOLD } from "./constants";

export type ChannelInfo = {
  id: number; // 1부터
  count: number;
  cap: number;
  /** 목록에 표시되는 채널인지. 1채널은 항상 true */
  open: boolean;
};

/** GET /lobby 응답 */
export type LobbyInfo = {
  channels: ChannelInfo[];
  total: number;
  totalCap: number;
  maxChannels: number;
  threshold: number;
};

export type ChannelStatus = "ok" | "busy" | "full";

/**
 * 대기열 (전체 상한 도달 시). 실시간 서버 로비가 순서를 관리한다(먼저 온 순서대로).
 * 클라이언트는 QUEUE_POLL_MS마다 자기 자리를 확인하고, admitted가 오면 그 채널로 바로 입장한다
 * (자리는 QUEUE_HOLD_MS 동안 그 사람 몫으로 잡아 둔다). 기다리는 동안은 혼자 걷기(관람) 모드.
 */
export type QueueStatus =
  | { state: "waiting"; position: number; size: number }
  | { state: "admitted"; channel: number; holdUntil: number }
  | { state: "none" };
export const QUEUE_POLL_MS = 5_000;
export const QUEUE_HOLD_MS = 30_000;

/** 여유=초록(ok), 혼잡(threshold 이상)=노랑(busy), 만석=회색(full) */
export function channelStatus(ch: ChannelInfo, threshold = DEFAULT_AUTO_OPEN_THRESHOLD): ChannelStatus {
  if (ch.count >= ch.cap) return "full";
  if (ch.count >= ch.cap * threshold) return "busy";
  return "ok";
}

/**
 * 자동 배정. null이면 전체 만석 → 관람 모드.
 * 1) 혼잡하지 않은 열린 채널 중 가장 사람이 많은 곳 (너무 썰렁하지 않게). 동률이면 낮은 번호.
 * 2) 없으면 아직 열리지 않은 다음 채널.
 * 3) 그것도 없으면 만석이 아닌 채널 중 가장 한산한 곳.
 */
export function pickChannel(lobby: LobbyInfo, exclude: ReadonlySet<number> = new Set()): number | null {
  const threshold = lobby.threshold ?? DEFAULT_AUTO_OPEN_THRESHOLD;
  const usable = lobby.channels.filter((c) => !exclude.has(c.id) && c.count < c.cap);
  const calm = usable
    .filter((c) => c.open && channelStatus(c, threshold) === "ok")
    .sort((a, b) => b.count - a.count || a.id - b.id);
  if (calm.length) return calm[0].id;

  const known = new Set(lobby.channels.map((c) => c.id));
  for (let id = 1; id <= lobby.maxChannels; id++) {
    if (exclude.has(id)) continue;
    const c = lobby.channels.find((x) => x.id === id);
    if ((!c && !known.has(id)) || (c && !c.open && c.count < c.cap)) return id;
  }

  const rest = usable.sort((a, b) => a.count - b.count || a.id - b.id);
  return rest.length ? rest[0].id : null;
}

// ── 11/12 사냥터별 지금 사냥 중인 인원 (GET /hunt-rooms) ──

/** 사냥터 방 id: "hunt:{zone}:{difficulty}" (ROOM_ID_RE의 사냥터 형식) */
export const HUNT_ROOM_RE = /^hunt:[a-z0-9_-]{1,24}:[a-z]{1,10}$/;
export const isHuntRoom = (id: string | null | undefined): id is string => typeof id === "string" && HUNT_ROOM_RE.test(id);
/** 엣지·메모리 캐시 (사냥터 고르는 화면이 가끔 묻는다 — 가볍게) */
export const HUNT_ROOMS_CACHE_SEC = 10;
/**
 * 방 DO가 보고한 지 이보다 오래된 기록은 비었다고 본다. 사람이 있는 방은 5분마다(유령 연결 정리 알람) 다시 보고하므로
 * 그 두 배 + 여유
 */
export const HUNT_ROOM_STALE_MS = 11 * 60_000;
/** 한 번에 기억하는 사냥터 방 수 상한 (이상한 방 id가 쌓이지 않게) */
export const HUNT_ROOMS_MAX = 200;

/** GET /hunt-rooms 응답: 사람이 있는 사냥터 방만 (방 id → 인원). at = 만든 시각 */
export type HuntRoomsInfo = { rooms: Record<string, number>; at: number };
