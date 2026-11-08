import type { ChannelInfo, LobbyInfo } from "@tomb/protocol";
import type { Config } from "./config";

// 로비 판정 (순수 함수). LobbyDO는 채널 인원을 받아 이 상태를 고치고 저장만 한다. 테스트: lobbyState.test.ts

/** 주기적 재확인 간격. 이 안에 push 보고가 온 채널은 재확인하지 않는다 */
export const LOBBY_REFRESH_MS = 5 * 60_000;

export type ChannelRec = {
  count: number;
  /** 채널 DO가 붙인 단조 증가 번호. 늦게 도착한 재확인 결과가 더 최신 push를 덮지 않게 한다 */
  seq: number;
  /** 마지막 push 보고(report·admit) 시각 */
  pushedAt: number;
  /** 마지막으로 사람이 있던 시각. 최근에 쓰인 채널만 재확인 대상으로 삼는다 */
  lastNonEmptyAt: number;
};

/** 채널 id → 기록. storage에 그대로 스냅샷한다 */
export type LobbyState = { channels: Record<number, ChannelRec> };

export type LobbyConfig = Pick<Config, "capacity" | "maxChannels" | "threshold">;

export const emptyLobby = (): LobbyState => ({ channels: {} });

/**
 * 채널 인원을 반영한다. push = 채널 DO가 알려 온 것(report·admit), 아니면 로비의 재확인(getCount) 결과.
 * seq가 이미 반영한 것보다 오래됐으면 버린다. 인원이 바뀌었으면 true (저장 필요).
 */
export function applyReport(s: LobbyState, id: number, count: number, seq: number, now: number, push: boolean): boolean {
  const prev = s.channels[id];
  if (prev && seq < prev.seq) return false;
  const prevCount = prev?.count ?? 0;
  s.channels[id] = {
    count,
    seq,
    pushedAt: push ? now : (prev?.pushedAt ?? 0),
    lastNonEmptyAt: count > 0 || prevCount > 0 ? now : (prev?.lastNonEmptyAt ?? 0),
  };
  return count !== prevCount;
}

export const countOf = (s: LobbyState, id: number) => s.channels[id]?.count ?? 0;

/**
 * 재확인할 채널: 사람이 있거나 최근(LOBBY_REFRESH_MS 안)에 있었던 채널 중, 그동안 push가 없던 것.
 * 보고가 유실돼 로비가 틀린 인원을 들고 있을 수 있는 채널만 깨운다(오래 빈 채널은 다음 입장 때 보고가 온다).
 */
export function refreshTargets(s: LobbyState, cfg: LobbyConfig, now: number): number[] {
  const ids: number[] = [];
  for (let id = 1; id <= cfg.maxChannels; id++) {
    const r = s.channels[id];
    if (!r || (r.count === 0 && now - r.lastNonEmptyAt >= LOBBY_REFRESH_MS)) continue;
    if (now - r.pushedAt >= LOBBY_REFRESH_MS) ids.push(id);
  }
  return ids;
}

/** 재확인할 거리가 있는지 (알람을 걸지 정할 때) */
export const hasRecentChannels = (s: LobbyState, cfg: LobbyConfig, now: number) =>
  Object.entries(s.channels).some(
    ([id, r]) => Number(id) <= cfg.maxChannels && (r.count > 0 || now - r.lastNonEmptyAt < LOBBY_REFRESH_MS),
  );

/**
 * GET /lobby 응답. 채널 10개는 항상 열려 있다(open=true).
 * 인원에는 대기열이 잡아 둔 자리(held)를 더한다: 그 자리는 새 입장자가 쓸 수 없으므로 자동 배정(pickChannel)이 피하게.
 */
export function computeLobby(s: LobbyState, cfg: LobbyConfig, held: (id: number) => number = () => 0): LobbyInfo {
  const channels: ChannelInfo[] = [];
  let total = 0;
  for (let id = 1; id <= cfg.maxChannels; id++) {
    const count = Math.min(cfg.capacity, countOf(s, id) + held(id));
    channels.push({ id, count, cap: cfg.capacity, open: true });
    total += count;
  }
  return { channels, total, totalCap: cfg.capacity * cfg.maxChannels, maxChannels: cfg.maxChannels, threshold: cfg.threshold };
}

/**
 * 채널 간 중복 방문자 레지스트리 (visitorId → 채널). 메모리에만 두는 최선 노력 장치다(로비가 다시 뜨면 비어서 시작).
 * 한 방문자는 한 채널에만 자리를 가진다: 다른 채널에서 claim이 오면 이전 채널을 돌려줘서 로비가 그쪽을 내보내게 한다.
 */
export class VisitorRegistry {
  private readonly where = new Map<string, number>();

  /** 보고가 유실돼 남은 항목이 끝없이 쌓이지 않게 하는 상한 (전체 정원의 몇 배) */
  constructor(private readonly max: number) {}

  /** 방문자가 channel에 자리를 잡았다. 다른 채널에 등록돼 있었으면 그 채널(내보내야 함), 아니면 null */
  claim(visitorId: string, channel: number): number | null {
    const prev = this.where.get(visitorId);
    this.where.delete(visitorId); // 삽입 순서 = 오래된 순서
    this.where.set(visitorId, channel);
    if (this.where.size > this.max) this.where.delete(this.where.keys().next().value!);
    return prev !== undefined && prev !== channel ? prev : null;
  }

  /**
   * 방문자가 channel에서 최종 퇴장했다. 등록된 채널이 같을 때만 지운다:
   * 채널 이동 중 새 채널의 claim이 옛 채널의 release보다 먼저 와도 새 등록이 지워지지 않는다.
   */
  release(visitorId: string, channel: number): void {
    if (this.where.get(visitorId) === channel) this.where.delete(visitorId);
  }

  channelOf(visitorId: string): number | undefined {
    return this.where.get(visitorId);
  }
}
