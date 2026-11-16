"use client";

import { useSyncExternalStore } from "react";
import { channelStatus, LOBBY_POLL_MS, type ChannelInfo, type LobbyInfo } from "@tomb/protocol";
import { fetchLobby } from "@/lib/realtime";
import { isBackground, onBackgroundChange } from "@/lib/background";

/** 연속으로 이만큼 실패해야 "연결할 수 없어요"라고 말한다 (한 번의 일시적 실패로 깜빡이지 않게) */
export const LOBBY_FAILURES_TO_GIVE_UP = 2;

export type LobbyState = {
  status: "loading" | "ok" | "unreachable";
  /** 마지막으로 받은 정상 응답 (실패해도 유지) */
  lobby: LobbyInfo | null;
  failures: number;
};

export const INITIAL_LOBBY: LobbyState = { status: "loading", lobby: null, failures: 0 };

export function nextLobbyState(prev: LobbyState, result: LobbyInfo | null): LobbyState {
  if (result) return { status: "ok", lobby: result, failures: 0 };
  const failures = prev.failures + 1;
  return { ...prev, failures, status: failures >= LOBBY_FAILURES_TO_GIVE_UP ? "unreachable" : prev.status };
}

/** 11/16 집이 하나라도 있는 채널 (GET /api/housing/channels, LobbyPoller가 2분마다 채운다). 이 채널들은 비어도 목록에서 숨지 않는다 */
let houseChannels: readonly number[] = [];
const HOUSE_CHANNELS_POLL_MS = 120_000;

/**
 * 목록에 보일 채널: 열린 채널(평소 몇 개 + 붐비면 자동으로 더) + 집이 있는 채널(누구에게나) + 나와 관계있는 채널(내 집·내 묘비·지금 채널).
 * 채널마다 주거 구역이 따로라, 누가 집을 산 채널은 비어 있어도 늘 고를 수 있게 한다 (자동 배정은 여전히 열린 채널만)
 */
export function visibleChannels(lobby: LobbyInfo | null, mine: Iterable<number | null | undefined> = []): ChannelInfo[] {
  if (!lobby) return [];
  const keep = new Set<number>(houseChannels);
  for (const id of mine) if (typeof id === "number") keep.add(id);
  return lobby.channels.filter((c) => c.open || keep.has(c.id));
}

/** 목록에 보이고 만석이 아닌 채널인지 (mine = visibleChannels와 같은, 닫혀 있어도 보여 줄 내 채널들) */
export function isChannelSelectable(lobby: LobbyInfo | null, channel: number, mine: Iterable<number | null | undefined> = []): boolean {
  const ch = visibleChannels(lobby, mine).find((c) => c.id === channel);
  return !!ch && channelStatus(ch, lobby?.threshold) !== "full";
}

/** 폴러가 쓰는 바깥 세계 (시험에서 바꿔 끼운다) */
export type LobbyPollerDeps = {
  fetchLobby(signal: AbortSignal): Promise<LobbyInfo | null>;
  /** 집이 있는 채널 목록. 실패하면 null (지난 목록 그대로) */
  fetchHouses(signal: AbortSignal): Promise<number[] | null>;
  /** 뒤로 간 상태인지 (숨긴 탭·다른 창을 보는 중 — lib/background) */
  background(): boolean;
  /** 뒤로 감·돌아옴을 듣는다. 해제 함수를 돌려준다 */
  onBackground(fn: (bg: boolean) => void): () => void;
  now(): number;
};

/**
 * 11/17 채널 목록 폴링을 화면 전체에서 하나로 묶는다. 예전에는 useLobby를 쓰는 곳(입장 화면의 인원 줄·채널 고르기,
 * 채널 창·친구 창·내 집 줄)마다 따로 5초마다 GET /lobby를 불러, 입장 화면 하나가 5초에 두 번씩 로비 DO를 깨웠다.
 *  - 구독자가 있는 동안만 LOBBY_POLL_MS마다 한 번 (첫 구독 때 바로 한 번)
 *  - 뒤로 가면(숨긴 탭·다른 창) 멈추고, 돌아오면 바로 한 번 받고 다시 돈다 — 열어 둔 채 잊은 탭이 밤새 서버를 깨우지 않게
 *  - 집이 있는 채널(웹 API)은 HOUSE_CHANNELS_POLL_MS마다, 돌아왔을 때는 그만큼 지났을 때만
 */
export class LobbyPoller {
  state: LobbyState = INITIAL_LOBBY;
  private readonly subs = new Set<(s: LobbyState) => void>();
  private ctrl: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offBg: (() => void) | null = null;
  private housesAt = -Infinity;

  constructor(
    private readonly deps: LobbyPollerDeps,
    private readonly every = LOBBY_POLL_MS,
    private readonly houseEvery = HOUSE_CHANNELS_POLL_MS,
  ) {}

  /** 상태가 바뀔 때마다 fn. 해제 함수를 돌려준다 (마지막 구독자가 빠지면 폴링을 멈춘다) */
  subscribe(fn: (s: LobbyState) => void): () => void {
    this.subs.add(fn);
    if (this.subs.size === 1) this.start();
    return () => {
      if (!this.subs.delete(fn) || this.subs.size > 0) return;
      this.stop();
    };
  }

  /** useSyncExternalStore용 (같은 함수를 계속 넘기게 화살표 필드로) */
  readonly listen = (cb: () => void): (() => void) => this.subscribe(cb);
  readonly snapshot = (): LobbyState => this.state;

  /** 지금 돌고 있는지 (시험용) */
  get running(): boolean {
    return this.timer !== null;
  }

  private start(): void {
    this.ctrl = new AbortController();
    this.offBg = this.deps.onBackground((bg) => (bg ? this.pause() : this.resume()));
    if (!this.deps.background()) this.resume();
  }

  private stop(): void {
    this.pause();
    this.offBg?.();
    this.offBg = null;
    this.ctrl?.abort();
    this.ctrl = null;
  }

  private resume(): void {
    if (this.timer !== null || !this.ctrl) return;
    this.timer = setInterval(() => this.tick(), this.every);
    this.tick();
  }

  private pause(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    void this.poll();
    if (this.deps.now() - this.housesAt >= this.houseEvery) void this.pollHouses();
  }

  private emit(next: LobbyState): void {
    this.state = next;
    for (const fn of this.subs) fn(next);
  }

  private async poll(): Promise<void> {
    const ctrl = this.ctrl;
    if (!ctrl) return;
    const lobby = await this.deps.fetchLobby(ctrl.signal);
    if (!ctrl.signal.aborted) this.emit(nextLobbyState(this.state, lobby));
  }

  /** 집이 있는 채널: 바뀌면 다시 그린다 (실패하면 지난 목록 그대로) */
  private async pollHouses(): Promise<void> {
    const ctrl = this.ctrl;
    if (!ctrl) return;
    this.housesAt = this.deps.now();
    const next = await this.deps.fetchHouses(ctrl.signal).catch(() => null);
    if (ctrl.signal.aborted || !next || next.join() === houseChannels.join()) return;
    houseChannels = next;
    this.emit({ ...this.state });
  }
}

const browserDeps: LobbyPollerDeps = {
  fetchLobby,
  fetchHouses: async (signal) => {
    const res = await fetch("/api/housing/channels", { signal });
    if (!res.ok) return null;
    const { channels } = (await res.json()) as { channels?: unknown };
    return Array.isArray(channels) ? channels.filter((c): c is number => Number.isInteger(c)) : [];
  },
  background: isBackground,
  onBackground: onBackgroundChange,
  now: () => Date.now(),
};

let shared: LobbyPoller | null = null;

/** 채널 목록 (LOBBY_POLL_MS마다 HTTP, 화면 전체에서 폴러 하나 — 입장 화면은 웹소켓을 쓰지 않는다) */
export function useLobby(): LobbyState {
  shared ??= new LobbyPoller(browserDeps);
  return useSyncExternalStore(shared.listen, shared.snapshot, serverSnapshot);
}

const serverSnapshot = () => INITIAL_LOBBY;
