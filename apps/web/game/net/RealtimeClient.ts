import {
  ACT_KINDS,
  CLIENT_VERSION,
  isPhraseId,
  CHAT_MAX,
  isEmoId,
  isSeatMood,
  CLOSE,
  MAX_JOIN_RETRIES,
  MOVE_STEADY_MS,
  QUEUE_POLL_MS,
  STATE,
  PING,
  PONG,
  SPECTATOR_POLL_MS,
  WARP_COOLDOWN_MS,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  parseS2C,
  parseMegaPinMsg,
  type MegaPinMsg,
  pickChannel,
  type ActKind,
  type AwayPlace,
  type C2S,
  type PhraseId,
  type EmoId,
  type SeatMood,
  type EmoteKind,
  type GraveEventKind,
  type GoblinInfo,
  type MapId,
  type ChatPlace,
  chatTagOf,
  mapOf,
  type BbqItemId,
  isBbqId,
  type PeerInfo,
  type PeerState,
  type QueueStatus,
  type Sid,
  type WelcomeMsg,
  type WhisperMsg,
  WHO_ON_MAX,
} from "@tomb/protocol";
import type { AppearanceChange } from "../sprites/avatar";
import { readChatLog, type IncomingChatLine } from "../logic/chatLog";
import { fetchLobby } from "@/lib/realtime";
import type { ApiError, JoinRequest, JoinResponse } from "@/lib/types";
import { bridge, type NetMode } from "../bridge";
import { backoffDelay, retryDelay, retrySoonOnVisible } from "./backoff";
import { LookPacer } from "./lookPacer";
import { isPermanentJoinError, JoinLimiter, reusableToken, utf8Bytes, type CachedToken } from "./joinPolicy";
import { MoveThrottle, type NetPose } from "./sendThrottle";
import { bodyFromWsUrl, SYNC_EVERY_MS, SyncPolicy } from "./syncPolicy";
import { deviceHeaders } from "@/lib/deviceMark";
import { CHANNEL_FULL_MSG, lobbyChannelFull } from "./switchPolicy";

// 실시간 연결 (명세 3-2, 4-1).
//  - (재)연결마다 POST /api/join 으로 새 토큰을 받는다 (토큰 60초 유효). 같은 채널로 돌아가면 서버 유예(20초) 안에서 sid·좌석 유지
//  - wsUrl + &x=..&y=..(현재 위치)&v=CLIENT_VERSION 으로 접속 → welcome → join/leave/seat/emote/graveEvent JSON + 100ms 델타 SNAPSHOT
//  - MOVE: 움직이는 동안 ≤10Hz, 상태가 바뀌면 즉시 1회, 정지·앉기 중엔 0회, 탭이 숨으면 멈추고 돌아오면 1회
//  - 끊기면 0.5→1→2→4→8s(지터) 백오프. 실시간 서버가 없어도 게임은 혼자 그대로 돌아간다 (mode "offline")
//  - 4001 만석: 로비를 보고 다른 채널로 최대 3회 → 그래도 안 되면 관람 모드(30초마다 로비 확인 후 합류).
//    단 일부러 옮기는 채널 이동(switchChannel)은 꽉 찬 채널로 절대 가지 않는다: 떠나기 전에 로비를 보고 만석이면 그대로 있고,
//    들어가는 순간 만석(경합)이면 다른 채널·관람 모드가 아니라 온 채널로 돌아온다 (switchPolicy)
//  - 4002 다른 탭에서 접속: "replaced", 재접속하지 않음 / 4003 토큰 만료: 새 토큰으로 바로 재접속 / 4008 과다 전송
//  - 4004 잘못된 요청: 자동 배정으로 다시 / /api/join 400: 재시도해도 소용없으니 offline + 안내 1회
//  - 4010 옛 버전(큰 패치): 재접속하지 않고 app:outdated → UI가 업데이트 창을 띄워 새로고침한다
//  - 4011 운영자 강퇴: 재접속하지 않고 안내만 / 4012 이용 제한: 재접속하지 않고 app:banned → UI가 새로고침(제한 화면)
//  - 클라이언트가 끊는 경우: 의도적 퇴장(stop)만 1000, 채널 이동·타임아웃 등은 4000
//    (서버는 1000을 "떠남"으로 보고 재연결 유예 없이 자리를 비운다. 채널 이동은 옛 자리를 유예로 남겨 두었다가
//     새 채널에 들어가면 로비가 바로 정리하고(claim → kick), 새 채널이 꽉 차 거절되면 그 자리로 돌아온다)
//  - 대기열(/api/join → queue): 혼자 걸으며 queueUrl을 QUEUE_POLL_MS마다 확인, admitted면 그 채널로 입장
//  - 자가 복구: 탭이 보이는 동안 3분마다(PEER_SYNC_MS×3), 탭이 다시 보일 때, 이상 징후(모르는 sid의 스냅샷·인원 불일치)일 때만
//    sync → peers로 원격 아바타 목록을 서버 기준으로 맞춘다 (가만히 있으면 서버를 깨우지 않는다. 숨은 탭은 핑만)

export type NetCallbacks = {
  getPose(out: NetPose): NetPose;
  getFps(): number;
  onWelcome(msg: WelcomeMsg): void;
  onJoin(p: PeerInfo): void;
  onLeave(sid: Sid): void;
  onSnapshot(entries: readonly PeerState[], t: number): void;
  onSeat(seatId: string, sid: Sid | null): void;
  onSeatDenied(seatId: string): void;
  onEmote(sid: Sid, kind: EmoteKind, graveId: string): void;
  onGraveEvent(sid: Sid, kind: GraveEventKind, graveId: string): void;
  /** 연결이 끊김/채널 이동/관람 모드: 원격 아바타와 좌석 점유표를 비운다 */
  onReset(): void;
  /** sync 응답: 서버가 아는 접속자 전체 (나 제외) */
  onPeers(peers: PeerInfo[], seats: Record<string, Sid>): void;
  /** extra = 46·25번 염색·몸 모양 변경 (새 서버만 보낸다) */
  onLook(sid: Sid, look: string[], extra?: AppearanceChange): void;
  onFirework(sid: Sid, item: string, x: number, y: number): void;
  /** 한 번 하는 동작 (종 치기·물 튀기기·손 흔들기·환호). 내 것은 오지 않는다 */
  onAct(sid: Sid, kind: ActKind, x: number, y: number): void;
  /** 정해진 문장 말풍선 (PHRASES id). 내 것은 오지 않는다 */
  onSay(sid: Sid, id: PhraseId): void;
  /** 5번 이모티콘 (EMOS id). 내 것은 오지 않는다 */
  onEmo?(sid: Sid, id: EmoId): void;
  /** 말풍선 자유 채팅 (서버가 가린 글). 내 것은 오지 않는다. id = 서버 줄 id (옛 서버는 없음) */
  /** 11/16 meta = 실시간 서버가 실은 이름·딱지·맵 (다른 맵 사람은 화면에 없어 이름을 여기서 안다) */
  onChat?(sid: Sid, text: string, id?: string, meta?: ChatMeta): void;
  /** 입장·재접속·실내에서 복귀 때 이 채널의 최근 1분 채팅 (이 기기 시계로 옮긴 줄, 내 줄은 mine) */
  onChatLog?(lines: IncomingChatLine[]): void;
  /** 24번 벤치 상태 (SEAT_MOODS id, "" = 풀림). 서버가 받아들인 내 것도 온다 */
  onMood?(sid: Sid, mood: SeatMood | ""): void;
  /** 동물원 타는 펫에 올라탐·내림. 서버가 받아들인 내 것도 온다 (자리에 앉거나 물에 들어가면 서버가 내리기도 한다) */
  onRide?(sid: Sid, on: boolean): void;
  /** 4번 배 위 낚싯대를 드리움·거둠. 서버가 받아들인 내 것도 온다 (배에서 내리면 서버가 거두기도 한다) */
  onRod?(sid: Sid, on: boolean): void;
  /** 다른 사람이 실내(상점·집·사냥터 등)에 들어감·나옴. 내 것은 오지 않는다 (늦게 온 사람 것은 PeerInfo.away) */
  onAway?(sid: Sid, on: boolean): void;
  /** 입장 토큰에 든 내 아바타 몸 모양 (계정에 저장된 값) */
  onSelfBody?(body: string): void;
  // ── 22번 황금 고블린 ──
  /** 나타났다 (welcome에 실려 온 것도 이걸로) */
  onGoblin?(g: GoblinInfo): void;
  /** 아무도 못 잡고 사라졌다 */
  onGoblinGone?(id: string): void;
  /** 누가 잡았다 (나 포함) */
  onGoblinCaught?(id: string, sid: Sid, name: string, points: number): void;
  /** 내가 잡았다: 보상 증서 */
  onGoblinGrant?(id: string, grant: string, points: number): void;
  /** 23번 확성기 한마디 (내 것 포함, 서버가 서명된 문장만 보낸다) */
  /** 서버에서 내 계정(포인트·선물함)이 바뀌었다 → UI가 /api/me를 다시 받는다 */
  onMeStale?(): void;
  /** 친구가 들어왔다·나갔다 (실시간 서버가 밀어 준다) */
  onFriend?(m: { key: string; name: string; on: boolean }): void;
  /** 11/16 이스터에그: 채널 누군가 「다람쥐를 뿌려라」 → 다람쥐가 쏟아진다 (맵 상관없이, 내 것 포함) */
  onSquirrels?(m: { by: string; seed: number; at: number }): void;
  /** 11/17 운영자만: 쿨다운 중에 주문을 쳤다 → 남은 시간 (ms) */
  onSquirrelsWait?(left: number): void;
  onMegaphone?(m: { id: string; name: string; text: string; scope: "channel" | "all"; ch: number; at: number; staff?: true; system?: true; replaces?: string; mgr?: true }): void;
  /** 11/17 확성기 창 고정 공지가 바뀌었다 (운영자가 쓰거나 지움) */
  onMegaPin?(m: MegaPinMsg): void;
  /**
   * 11/15 맵을 옮겼다 (switchMap의 답). map = 서버가 정한 지금 맵 (허락이 없으면 옮기기 전 맵 그대로),
   * peers·seats = 그 맵 사람(나 빼고)과 그 사람들이 앉은 자리
   */
  onMapped?(map: MapId, peers: PeerInfo[], seats: Record<string, Sid>): void;
  /** 11/15 캠핑장 바베큐: sid가 먹고 until(epoch ms)까지 커졌다 (서버가 증서를 확인한 것만, 내 것도 온다) */
  /** 11/15 바베큐 한 접시·한 잔 (같은 맵, 내 것 포함). 마실 거리면 lv·at = 취기 */
  onBbq?(sid: Sid, item: BbqItemId, until: number, lv?: number, at?: number): void;
};

/** 11/16 채팅에 실려 오는 보낸 사람 정보 (맵이 달라 화면에 없는 사람도 채팅창에 쓰게) */
export type ChatMeta = { name?: string; staff?: true; mgr?: true; /** 11/17 사냥 중이면 "hunt" */ m?: ChatPlace };

/** 맵이 바뀌어도 늘 처음 콜백(월드)이 받는 것: 계정·친구·확성기·내 몸 모양·고블린 보상 */
const GLOBAL_CALLBACKS = ["onMegaphone", "onMegaPin", "onMeStale", "onFriend", "onSelfBody", "onGoblinGrant", "onSquirrels", "onSquirrelsWait"] as const;
/** 맵 옮기기 답을 기다리는 시간 */
const MAP_REPLY_MS = 4000;
/** 맵 옮기기 답이 없을 때 다시 보내는 횟수 (서버는 맵 요청을 1초에 한 번만 받는다 — MAP_REPLY_MS 간격이면 넉넉하다) */
const MAP_RETRIES = 2;
/** 맵을 옮기는 중에 버리는 옛 맵 소식 (사람·자리·몸짓·말풍선) */
const OLD_MAP_EVENTS = new Set(["join", "leave", "seat", "emote", "graveEvent", "look", "act", "say", "emo", "chat", "mood", "ride", "rod", "away", "firework", "peers", "goblin", "goblinGone", "goblinCaught", "chatLog", "bbq"]);

export type NetOptions = { name: string; color: string; channel: number | "auto"; debug?: boolean; body?: string };

class JoinError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 서버 오류 코드 (47번: BANNED = 이용 제한) */
    readonly code?: string,
  ) {
    super(message);
  }
}

// 핑 주기. 수신 메시지 수가 곧 DO 요청 수(20건=1요청)라서, 평소엔 생존 확인용으로 드물게 보내고
// ?debug=1 HUD에서 RTT를 볼 때만 자주 보낸다. 서버는 60초 넘게 조용한 소켓을 유령으로 보고 닫는다.
const PING_MS = 15_000;
const DEBUG_PING_MS = 2_000;
/** 핑 주기 + 이만큼 퐁이 없으면 죽은 연결로 본다 */
const PONG_GRACE_MS = 10_000;
/** 소켓을 만든 순간부터 welcome까지 */
const CONNECT_TIMEOUT_MS = 8_000;
/** 클라이언트가 연결을 버릴 때 (타임아웃·교체). 서버가 재연결 유예를 적용한다 */
const CLOSE_CLIENT_DROP = 4000;
const STATS_MS = 1000;
/** 이만큼 재시도해도 안 되면 "reconnecting" 대신 "offline"으로 표시 (유예 20초를 넘김) */
const RECONNECTING_ATTEMPTS = 5;

export class RealtimeClient {
  mode: NetMode = "connecting";
  channel: number | null = null;
  /** 11/15 지금 맵 (서버 기준 — welcome·mapped로 맞춘다). 다시 접속할 때 이 맵으로 들어간다 */
  map: MapId = "village";
  /** 11/15 이 서버는 캠핑장 버스가 다닌다 (입장 응답 campOpen) */
  campOpen = false;
  /** 11/16 이 서버는 바닷가 버스가 다닌다 (입장 응답 seaOpen) */
  seaOpen = false;
  /** 11/15 맵을 옮기는 중 (mapped를 기다린다 — 그 전에 온 옛 맵 소식은 버린다) */
  private mapPending: MapId | null = null;
  private mapTimer: ReturnType<typeof setTimeout> | null = null;
  /** 11/15 다른 맵 장면(캠핑장)이 받는 콜백. 없으면 처음 콜백(월드) */
  private alt: NetCallbacks | null = null;
  /** 11/15 채널 전체 인원 (마을·캠핑장 합계, 서버 welcome.n·count). 옛 서버면 null → 같은 맵 사람 수 */
  private total: number | null = null;
  cap = 0;
  mySid: Sid | null = null;
  private readonly peers = new Set<Sid>();
  private ws: WebSocket | null = null;
  /** 비동기 흐름(join fetch 등)이 낡았는지 판단하는 세대 번호 */
  private gen = 0;
  private attempt = 0;
  private everOnline = false;
  private stopped = true;
  private target: number | "auto";
  private connectingTo: number | null = null;
  private readonly triedFull = new Set<number>();
  private fullRetries = 0;
  private redirected = false;
  /** 일부러 채널을 옮기는 중: 돌아갈 채널 (새 채널이 꽉 차 거절되면 다른 채널로 가지 않고 여기로). welcome까지 */
  private switchBack: number | null = null;
  /** 그때 띄울 안내 (친구한테 가기면 친구 이름이 든 문장) */
  private switchFullMsg = CHANNEL_FULL_MSG;
  /** 채널 이동 전 로비 확인 순번 (늦게 온 확인이 새 요청을 덮지 않게) */
  private switchSeq = 0;
  /** 실내(하위 장면)에 들어가 있다 (setAway) */
  private away = false;
  /** 친구 위치용: 어느 실내인지·집 안이면 그 집 id (setAway) */
  private awayPlace: AwayPlace | undefined;
  private awayHouse: string | undefined;
  private consecutiveInvalid = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** 11/17 예약된 재접속 시각 (Date.now 기준, 없으면 null) — 탭이 다시 보이면 긴 대기를 줄인다 */
  private retryDueAt: number | null = null;
  private spectatorTimer: ReturnType<typeof setInterval> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private readonly throttle = new MoveThrottle(MOVE_STEADY_MS);
  private hidden = false;
  /** 휴식 중 (다른 창을 보는 중이라 게임 루프를 재움 — game/backgroundLoop). 탭 숨김과 똑같이 다룬다 */
  private resting = false;
  private pendingWarp: { x: number; y: number } | null = null;
  private readonly joinLimiter = new JoinLimiter();
  private token: CachedToken<Extract<JoinResponse, { mode: "channel" }>> | null = null;
  private hiddenIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private queueUrl: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private readonly syncPolicy = new SyncPolicy();
  /** 대기열에서 들어온 채널 (welcome 때 안내) */
  private admittedTo: number | null = null;
  /** 마지막 꾸미기 증서. 다시 접속하면 한 번 더 보낸다 (만료됐으면 서버가 무시) */
  private lookGrant: string | null = null;
  /** 서버가 10초 안에 다시 온 look을 버리므로 마지막 착용이 꼭 가도록 간격을 맞춰 보낸다 */
  private readonly lookPacer = new LookPacer((grant) => {
    if (!this.online) return false;
    this.ws!.send(encodeEvent({ t: "look", grant }));
    return true;
  });
  private lastWarpAt = -Infinity;
  private lastToast = "";
  // 통계
  private pingSentAt = 0;
  private lastPongAt = 0;
  private rtt: number | null = null;
  private bytesIn = 0;
  private snapshots = 0;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };

  constructor(
    private readonly opts: NetOptions,
    private readonly cb: NetCallbacks,
  ) {
    this.target = opts.channel;
  }

  get online(): boolean {
    return this.mode === "online" && !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** 지금 소식을 받는 콜백 (캠핑장 장면이 가져갔으면 그쪽) */
  private get h(): NetCallbacks {
    return this.alt ?? this.cb;
  }

  /** 처음 콜백 (월드 장면) — 캠핑장 장면이 계정·친구 같은 공통 처리를 빌려 쓴다 */
  get base(): NetCallbacks {
    return this.cb;
  }

  /**
   * 11/15 다른 맵 장면이 소식을 받아 간다 (null이면 월드로 돌려준다). 계정·친구·확성기 같은 공통 소식은 늘 월드가 받는다.
   * 내 위치(getPose)도 이 콜백에서 읽는다
   */
  divert(cb: NetCallbacks | null): void {
    if (!cb) {
      this.alt = null;
      return;
    }
    const merged = { ...cb } as NetCallbacks;
    for (const k of GLOBAL_CALLBACKS) (merged as Record<string, unknown>)[k] = this.cb[k];
    this.alt = merged;
  }

  /**
   * 11/15 맵 옮기기 (버스). 접속 중이면 연결 그대로 서버에 알리고 mapped를 기다린다. 아니면 다음 접속을 그 맵으로.
   * 돌려주는 값: 서버에 보냈는지 (false면 접속이 없어 다음 접속 때 반영)
   */
  switchMap(map: MapId, x: number, y: number): boolean {
    const from = this.map;
    this.map = map;
    this.pendingWarp = null;
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    if (!this.online) return false;
    this.mapPending = map;
    this.peers.clear();
    this.throttle.reset();
    const msg = { t: "map", m: map, x: Math.round(x), y: Math.round(y) } as const;
    this.send(msg);
    // 답이 없으면 MAP_RETRIES번 다시 보낸다 (11/16 운영: 사람이 많은 채널에서 캠핑장에 내리자마자 마을로 돌아온 문의 — 서버는 같은 맵 요청을 자리 옮기기로만 받는다).
    // 그래도 없으면 (맵을 모르는 옛 서버) 옮기지 못한 것으로 — 처음 맵 그대로, 목록은 다시 받는다
    let tries = 0;
    const wait = (): void => {
      this.mapTimer = setTimeout(() => {
        this.mapTimer = null;
        if (this.mapPending !== map) return;
        if (tries++ < MAP_RETRIES && this.online) {
          this.send(msg);
          return wait();
        }
        this.onMapped(from, [], {});
        this.requestSync();
      }, MAP_REPLY_MS);
    };
    wait();
    this.emitStatus();
    return true;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.hidden = typeof document !== "undefined" && document.hidden;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.statsTimer = setInterval(() => this.emitStats(), STATS_MS);
    this.setMode("connecting");
    void this.connect(this.target);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.gen++;
    this.lookPacer.destroy();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.clearTimers();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.closeSocket(1000, "bye");
  }

  /**
   * 게임 안 채널 이동 (채널 메뉴·친구한테 가기·내 집 가기·내 묘비 가기). 꽉 찬 채널로는 절대 옮기지 않는다:
   *  1) 떠나기 전에 로비를 다시 받아 만석이면 지금 채널·자리 그대로 두고 안내 (channel:refused, back=false).
   *     로비를 못 받으면 그냥 가 본다 — 서버가 막으면 2)로 돌아온다
   *  2) 통과하면 channel:leave(장면이 지금 자리를 기억하고 처음 자리 SPAWN으로) → 연결을 닫고 새 채널에 입장.
   *     위치는 지금 캐릭터 위치. 들어가는 순간 꽉 찼으면(경합) 온 채널로 돌아간다 (returnBack)
   * fullMsg = 꽉 찼을 때 안내 (기본 CHANNEL_FULL_MSG)
   */
  async switchChannel(channel: number, fullMsg = CHANNEL_FULL_MSG): Promise<void> {
    if (this.stopped) return;
    if (channel === this.channel && this.online) return;
    const seq = ++this.switchSeq;
    const lobby = await fetchLobby();
    if (seq !== this.switchSeq || this.stopped) return;
    if (channel === this.channel && this.online) return;
    if (lobbyChannelFull(lobby, channel)) {
      this.refuse(channel, fullMsg, false);
      return;
    }
    // 돌아갈 채널: 지금 채널 (접속이 끊겨 다시 붙는 중이면 붙으려던 채널, 관람·대기열이면 없음 → 예전 규칙)
    const back = this.channel !== null && this.channel !== channel ? this.channel : null;
    bridge.emit("channel:leave", { channel });
    this.pendingWarp = null; // 옛 채널에 보내려던 순간이동은 새 채널에 의미가 없다 (접속 좌표가 곧 위치)
    // 1000이 아니라 4000: 옛 채널 자리를 유예로 남겨 둔다 (새 채널에 들어가면 로비가 바로 정리, 거절되면 그 자리로 돌아온다)
    this.closeSocket(CLOSE_CLIENT_DROP, "switch");
    this.h.onReset();
    this.peers.clear();
    this.clearTimers();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.redirected = false;
    this.attempt = 0;
    this.switchBack = back;
    this.switchFullMsg = fullMsg;
    this.target = channel;
    this.channel = channel;
    this.setMode("connecting");
    void this.connect(channel);
  }

  /** 꽉 찬 채널이라 옮기지 않았다: 장면에 알리고(back이면 떠나기 전 자리로) 안내. 같은 안내도 누를 때마다 띄운다 */
  private refuse(channel: number, message: string, back: boolean): void {
    bridge.emit("channel:refused", { channel, message, back });
    bridge.emit("toast", { message });
  }

  /** 일부러 옮기던 채널이 들어가는 순간 꽉 찼다: 다른 채널·관람 모드로 가지 않고 온 채널(유예로 남긴 자리)로 돌아간다 */
  private returnBack(back: number): void {
    const to = this.connectingTo ?? this.channel ?? back;
    this.switchBack = null;
    this.refuse(to, this.switchFullMsg, true);
    this.triedFull.clear();
    this.fullRetries = 0;
    this.redirected = false;
    this.attempt = 0;
    this.target = back;
    this.channel = back;
    this.setMode(this.everOnline ? "reconnecting" : "connecting");
    void this.connect(back);
  }

  /** "여기서 다시 접속": replaced/offline/대기 상태에서 처음부터 다시 */
  reconnect(): void {
    if (this.stopped) return;
    this.closeSocket(4000, "reconnect");
    this.h.onReset();
    this.peers.clear();
    this.clearTimers();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.redirected = false;
    this.switchBack = null;
    this.attempt = 0;
    this.token = null;
    this.setMode("connecting");
    void this.connect(this.channel ?? this.target);
  }

  // ── 송신 ──

  /** 매 프레임 호출. 보낼 때가 아니면 아무것도 하지 않는다 */
  tick(now: number): void {
    if (!this.online) return;
    if (this.pendingWarp) {
      // 서버 warp 쿨다운(1초) 안이면 기다린다. 그동안 MOVE도 보내지 않아야 속도 검증에 걸리지 않는다
      if (now - this.lastWarpAt < WARP_COOLDOWN_MS || this.hidden) return;
      this.send({ t: "warp", x: Math.round(this.pendingWarp.x), y: Math.round(this.pendingWarp.y) });
      this.lastWarpAt = now;
      this.pendingWarp = null;
      this.throttle.reset();
    }
    const pose = this.h.getPose(this.pose);
    if (!this.throttle.shouldSend(now, pose, this.hidden)) return;
    const seq = this.throttle.markSent(now, pose);
    this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
  }

  /**
   * 11/17 서버가 "마지막으로 보고한 위치"로 판정하는 요청(앉기·고블린 잡기) 직전: 꾸준한 걷기 간격(MOVE_STEADY_MS) 때문에
   * 밀려 있던 지금 위치를 먼저 보낸다 (100ms 간격은 지킨다 → 서버 위치는 예전처럼 최대 100ms 전 것)
   */
  private flushPose(): void {
    if (!this.online || this.pendingWarp) return;
    const now = performance.now();
    const pose = this.h.getPose(this.pose);
    if (!this.throttle.flushDue(now, pose, this.hidden)) return;
    const seq = this.throttle.markSent(now, pose);
    this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
  }

  warp(x: number, y: number): void {
    this.pendingWarp = { x, y };
  }

  sit(seatId: string): void {
    this.flushPose();
    this.send({ t: "sit", seatId });
  }

  stand(): void {
    this.send({ t: "stand" });
  }

  emote(kind: EmoteKind, graveId: string): void {
    this.send({ t: "emote", kind, graveId });
  }

  graveEvent(kind: GraveEventKind, graveId: string): void {
    this.send({ t: "graveEvent", kind, graveId });
  }

  /** 꾸미기 변경 증서 (Vercel 서명). 접속 중이 아니면 다음 welcome 때 보낸다 */
  look(grant: string): void {
    this.lookGrant = grant;
    this.lookPacer.push(grant);
  }

  firework(grant: string): void {
    this.send({ t: "firework", grant });
  }

  /** 23번 확성기 증서 (Vercel 서명). 접속 중이 아니면 버려진다 (증서는 60초짜리라 다시 보내지 않는다) */
  megaphone(grant: string): void {
    this.send({ t: "megaphone", grant });
  }

  /** 한 번 하는 동작 (종 치기 등). 서버가 같은 채널에 중계한다 */
  act(kind: ActKind): void {
    this.send({ t: "act", kind });
  }

  /** 11/15 캠핑장 바베큐 한 접시 증서 (웹이 서명). 서버가 검증해 같은 맵에 알린다 */
  bbq(grant: string): void {
    this.send({ t: "bbq", grant });
  }

  /** 22번: 황금 고블린에 닿았다 (판정은 서버) */
  claimGoblin(id: string): void {
    this.flushPose();
    this.send({ t: "goblin", id });
  }

  /**
   * 22번: 서버 시계 (ms). welcome.now로 맞춘 차이를 더한다 — 고양이·유령·고블린을 같은 채널 모두가 같은 시각으로 계산한다.
   * 이전 서버(welcome.now 없음)나 접속 전에는 내 시계
   */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }
  private clockOffset = 0;

  /** 정해진 문장 말풍선 */
  say(id: PhraseId): void {
    this.send({ t: "say", id });
  }

  /** 5번 이모티콘 (서버가 도배 제한을 지켜 같은 채널에 중계한다) */
  emo(id: EmoId): void {
    this.send({ t: "emo", id });
  }

  /** 말풍선 자유 채팅 (정리된 글. 도배 제한·가리기는 서버가 한 번 더 한다) */
  chat(text: string): void {
    this.send({ t: "chat", text });
  }

  /** 11/17 운영자만: 다람쥐 쿨다운 초기화 (운영자가 아니면 서버가 무시) */
  squirrelsReset(): void {
    if (this.online) this.send({ t: "squirrelsReset" });
  }

  /** 11/16 귓속말 (정리된 글). 서버가 받는 사람을 다시 맞추고 받는 사람과 나에게 whisper로 돌려준다 → 그때 채팅창에 */
  whisper(to: string, text: string): void {
    if (this.online) this.send({ t: "whisper", to, text });
    else bridge.emit("chat:line", { name: "", text: "지금은 귓속말을 보낼 수 없어요.", mine: true, w: "fail" });
  }

  /** 11/16 최근 귓속말 상대가 지금 이 채널에 있는지 묻기 (서버가 whoOn으로 답한다 → whisper:online) */
  whoOn(names: string[]): void {
    const asked = names.slice(0, WHO_ON_MAX);
    if (asked.length) this.send({ t: "whoOn", names: asked });
  }

  /** 24번 벤치 상태 ("" = 풀기). 앉아 있을 때만 서버가 받는다 */
  mood(m: SeatMood | ""): void {
    this.send({ t: "mood", m });
  }

  /** 동물원 타는 펫에 올라타기·내리기 (착용한 펫이 타는 펫이고 서 있을 때만 서버가 받는다) */
  ride(on: boolean): void {
    this.send({ t: "ride", on });
  }

  /** 4번 배 위 낚싯대 드리우기·거두기 (조각배 자리에 앉아 있을 때만 서버가 받는다) */
  rod(on: boolean): void {
    this.send({ t: "rod", on });
  }

  /**
   * 휴식 중(다른 창을 보는 중이라 게임 루프를 재움)을 알린다. 탭 숨김과 똑같이 다룬다:
   * 걷던 중이면 다른 사람 화면에서 멈춰 서게 1회 알리고, 돌아오면 놓친 입장·퇴장을 다시 맞춘다
   */
  setResting(on: boolean): void {
    if (this.resting === on) return;
    this.resting = on;
    this.onVisibility();
  }

  /**
   * 실내(하위 장면)에 들어감·나옴. 연결이 바뀌어도 이어 가도록 기억해 두고 welcome 때 다시 알린다.
   * 옛 서버는 모르는 메시지라 버린다 (그러면 예전처럼 문 앞에 보인다)
   */
  setAway(on: boolean, place?: AwayPlace, house?: string): void {
    const p = on ? place : undefined;
    const h = on && place === "house" ? house : undefined;
    if (this.away === on && this.awayPlace === p && this.awayHouse === h) return;
    this.away = on;
    this.awayPlace = p;
    this.awayHouse = h;
    this.send(this.awayMsg());
  }

  /** 실내 알림 (친구 위치용 장소 p는 실내일 때만. 옛 서버는 p를 버리고 on만 본다) */
  private awayMsg(): C2S {
    return { t: "away", on: this.away, ...(this.away && this.awayPlace ? { p: this.awayPlace } : {}), ...(this.away && this.awayHouse ? { h: this.awayHouse } : {}) };
  }

  /** 접속자 목록 다시 받기 (자가 복구) */
  sync(): void {
    this.syncPolicy.mark(performance.now());
    this.send({ t: "sync" });
  }

  /** 이상 징후(인원 불일치 등): 최소 간격을 지켜 바로 sync */
  requestSync(): void {
    if (this.online && this.syncPolicy.urgent(performance.now(), this.hidden)) this.sync();
  }

  private send(msg: C2S): void {
    if (this.online) this.ws!.send(encodeEvent(msg));
  }

  // ── 연결 ──

  private async connect(channel: number | "auto"): Promise<void> {
    const gen = ++this.gen;
    this.clearRetry();
    let res: JoinResponse | null;
    try {
      res = await this.join(channel, gen);
    } catch (e) {
      if (gen !== this.gen || this.stopped) return;
      this.onJoinFailed(e);
      return;
    }
    if (!res || gen !== this.gen || this.stopped) return;
    if (res.mode === "spectator") {
      this.enterSpectator();
      return;
    }
    if (res.mode === "queue") {
      this.enterQueue(res.queueUrl);
      return;
    }
    this.openSocket(res, gen);
  }

  /** 토큰을 얻는다. 기다리는 사이 흐름이 낡으면 null */
  private async join(channel: number | "auto", gen: number): Promise<JoinResponse | null> {
    const reuse = reusableToken(this.token, channel, Date.now());
    if (reuse) return reuse;
    const wait = this.joinLimiter.delay(Date.now());
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
      if (gen !== this.gen || this.stopped) return null;
    }
    this.joinLimiter.record(Date.now());
    const body: JoinRequest = { channel, name: this.opts.name, color: this.opts.color };
    if (this.opts.body) body.body = this.opts.body;
    // 같은 사람 판정용 기기 표시·브라우저 환경 머리글 (lib/deviceMark)
    const dev = await deviceHeaders();
    const post = () =>
      fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json", ...dev },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
      });
    let r = await post();
    if (r.status === 401) {
      // 방문자 쿠키가 없거나 만료 → 세션을 받고 한 번 더
      await fetch("/api/session", { method: "POST", credentials: "same-origin", headers: dev }).catch(() => null);
      this.joinLimiter.record(Date.now());
      r = await post();
    }
    if (!r.ok) {
      const err = (await r.json().catch(() => null)) as ApiError | null;
      throw new JoinError(r.status, err?.error?.message ?? `join failed (${r.status})`, err?.error?.code);
    }
    const res = (await r.json()) as JoinResponse;
    if (res.mode === "channel") this.token = { channel: res.channel, at: Date.now(), res };
    return res;
  }

  private onJoinFailed(e: unknown): void {
    if (e instanceof JoinError && isPermanentJoinError(e.status)) {
      // 이름·색 검증 실패 등: 몇 번을 다시 해도 같다 → 혼자 걷기(offline)로 두고 한 번만 알린다
      this.toast(e.message || "실시간 접속 정보를 확인할 수 없어 혼자 걷는 중이에요.");
      this.clearRetry();
      this.setMode("offline");
      // 47번 이용 제한: UI가 새로고침해 제한 화면을 띄운다
      if (e.code === "BANNED") bridge.emit("app:banned");
      return;
    }
    if (e instanceof JoinError && e.status >= 400 && e.status < 500 && e.status !== 408) {
      // 이름 검증 실패·레이트리밋 등: 사용자에게 알리고 천천히 다시 시도
      this.toast(e.message);
      this.scheduleReconnect(e.status === 429 ? 15_000 : undefined);
      return;
    }
    this.scheduleReconnect();
  }

  private openSocket(res: Extract<JoinResponse, { mode: "channel" }>, gen: number): void {
    // 남아 있는 소켓(관람 모드 폴링·재시도가 겹친 경우)을 먼저 정리한다
    if (this.ws) this.closeSocket(CLOSE_CLIENT_DROP, "superseded");
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    const mine = bodyFromWsUrl(res.wsUrl);
    if (mine) this.cb.onSelfBody?.(mine);
    const p = this.h.getPose(this.pose);
    const sep = res.wsUrl.includes("?") ? "&" : "?";
    this.campOpen = res.campOpen === true;
    this.seaOpen = res.seaOpen === true;
    // 11/15 캠핑장에 있으면 처음부터 캠핑장으로 (새로고침·채널 이동·재접속). 허락이 없는 토큰이면 서버가 마을로 받는다 (11/16 바닷가도 같다)
    const mapQ = this.map !== "village" ? `&m=${this.map}` : "";
    const url = `${res.wsUrl}${sep}x=${Math.round(p.x)}&y=${Math.round(p.y)}${mapQ}&v=${CLIENT_VERSION}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.connectingTo = res.channel;
    // 소켓을 만든 순간부터: 열리지도, welcome이 오지도 않으면 버린다
    this.welcomeTimer = setTimeout(() => this.drop(ws, CLOSE_CLIENT_DROP), CONNECT_TIMEOUT_MS);
    ws.onmessage = (ev) => {
      if (this.ws === ws && gen === this.gen) this.onMessage(ev.data);
    };
    ws.onclose = (ev) => this.drop(ws, ev.code);
    ws.onerror = () => {
      // close가 뒤따라 온다
    };
  }

  /** 11/16 귓속말 한 줄 → 채팅창 (내가 보낸 것이면 받는 사람 이름, 받은 것이면 보낸 사람 이름) */
  private onWhisper(m: WhisperMsg): void {
    if (typeof m.text !== "string" || typeof m.id !== "string") return;
    const out = m.from === this.mySid;
    if (!out && m.to !== this.mySid) return;
    const name = String((out ? m.toName : m.fromName) ?? "").slice(0, 40);
    const staff = out ? m.toStaff : m.staff;
    const mgr = out ? m.toMgr : m.mgr;
    bridge.emit("chat:line", {
      name,
      text: m.text.slice(0, CHAT_MAX * 2),
      mine: out,
      key: m.id,
      w: out ? "out" : "in",
      ...(staff === true ? { staff: true as const } : {}),
      ...(mgr === true ? { mgr: true as const } : {}),
    });
  }

  private onMessage(data: unknown): void {
    if (typeof data === "string") {
      this.bytesIn += utf8Bytes(data);
      if (data === PONG) {
        const now = performance.now();
        this.lastPongAt = now;
        const sample = now - this.pingSentAt;
        this.rtt = this.rtt === null ? sample : this.rtt * 0.7 + sample * 0.3;
        return;
      }
      const m = parseS2C(data);
      if (!m) return;
      // 11/15 맵을 옮기는 중: 서버가 옮기기 전에 보낸 옛 맵 소식은 버린다 (mapped 다음부터가 새 맵 소식)
      if (this.mapPending !== null && OLD_MAP_EVENTS.has(m.t)) return;
      switch (m.t) {
        case "mapped":
          this.onMapped(m.m, m.peers ?? [], m.seats ?? {});
          break;
        case "bbq":
          if (isBbqId(m.i) && typeof m.u === "number" && Number.isFinite(m.u))
            this.h.onBbq?.(m.sid, m.i, m.u, typeof m.lv === "number" ? m.lv : undefined, typeof m.at === "number" ? m.at : undefined);
          break;
        case "count":
          if (typeof m.n === "number" && Number.isFinite(m.n)) {
            this.total = m.n;
            this.emitStatus();
          }
          break;
        case "welcome":
          this.onWelcome(m);
          break;
        case "join":
          if (m.sid === this.mySid) break;
          this.peers.add(m.sid);
          this.h.onJoin(m);
          this.emitStatus();
          break;
        case "leave":
          this.peers.delete(m.sid);
          this.h.onLeave(m.sid);
          this.emitStatus();
          break;
        case "seat":
          this.h.onSeat(m.seatId, m.sid);
          break;
        case "seatDenied":
          this.h.onSeatDenied(m.seatId);
          break;
        case "emote":
          if (m.sid !== this.mySid) this.h.onEmote(m.sid, m.kind, m.graveId);
          break;
        case "graveEvent":
          if (m.sid !== this.mySid) this.h.onGraveEvent(m.sid, m.kind, m.graveId);
          break;
        case "look":
          if (m.sid !== this.mySid) this.h.onLook(m.sid, m.look, { dye: m.dye, body: m.body, ...(typeof m.champ === "number" ? { champ: m.champ } : {}), ...(m.mgr === 0 || m.mgr === 1 ? { mgr: m.mgr } : {}) });
          break;
        case "act":
          if (m.sid !== this.mySid && (ACT_KINDS as readonly string[]).includes(m.kind) && Number.isFinite(m.x) && Number.isFinite(m.y))
            this.h.onAct(m.sid, m.kind, m.x, m.y);
          break;
        case "say":
          if (m.sid !== this.mySid && isPhraseId(m.id)) this.h.onSay(m.sid, m.id);
          break;
        case "emo":
          if (m.sid !== this.mySid && isEmoId(m.id)) this.h.onEmo?.(m.sid, m.id);
          break;
        case "chat":
          if (m.sid !== this.mySid && typeof m.text === "string")
            this.h.onChat?.(m.sid, m.text.slice(0, CHAT_MAX * 2), typeof m.id === "string" ? m.id : undefined, {
              ...(typeof m.name === "string" && m.name ? { name: m.name.slice(0, 40) } : {}),
              ...(m.staff === true ? { staff: true as const } : {}),
              ...(m.mgr === true ? { mgr: true as const } : {}),
              ...chatTagOf(m.m),
            });
          break;
        case "chatLog":
          this.h.onChatLog?.(readChatLog(m.now, m.lines, Date.now()));
          break;
        // ── 11/16 귓속말: 맵 상관없이 채팅창에만 (말풍선 없음, 이 화면 기록에만) ──
        case "whisper":
          this.onWhisper(m);
          break;
        case "whoOn":
          if (Array.isArray(m.on) && Array.isArray(m.off)) bridge.emit("whisper:online", { on: m.on.filter((n) => typeof n === "string"), off: m.off.filter((n) => typeof n === "string") });
          break;
        case "whisperFail":
          bridge.emit("chat:line", {
            name: "",
            text: m.why === "self" ? "나에게는 귓속말을 보낼 수 없어요." : `${String(m.to ?? "").slice(0, 40)}님은 이 채널에 없어요.`,
            mine: true,
            w: "fail",
          });
          break;
        case "mood":
          if (m.m === "" || isSeatMood(m.m)) this.h.onMood?.(m.sid, m.m);
          break;
        case "ride":
          if (typeof m.on === "boolean") this.h.onRide?.(m.sid, m.on);
          break;
        case "rod":
          if (typeof m.on === "boolean") this.h.onRod?.(m.sid, m.on);
          break;
        case "away":
          if (m.sid !== this.mySid && typeof m.on === "boolean") this.h.onAway?.(m.sid, m.on);
          break;
        case "firework":
          // 내 폭죽은 누른 순간 이미 터뜨렸다 → 중복 재생하지 않는다
          if (m.sid !== this.mySid) this.h.onFirework(m.sid, m.item, m.x, m.y);
          break;
        // ── 22번 황금 고블린 (판정은 서버, 여기서는 전달만) ──
        case "goblin":
          if (m.g && typeof m.g.id === "string") this.h.onGoblin?.(m.g);
          break;
        case "goblinGone":
          this.h.onGoblinGone?.(m.id);
          break;
        case "goblinCaught":
          this.h.onGoblinCaught?.(m.id, m.sid, String(m.name ?? ""), Number(m.points) || 0);
          break;
        case "goblinGrant":
          if (typeof m.grant === "string") this.cb.onGoblinGrant?.(m.id, m.grant, Number(m.points) || 0);
          break;
        // ── 23번 확성기 ──
        case "megaphone":
          if (typeof m.id === "string" && typeof m.text === "string" && typeof m.name === "string")
            this.cb.onMegaphone?.({
              id: m.id,
              name: m.name,
              text: m.text,
              scope: m.scope === "all" ? "all" : "channel",
              ch: Number(m.ch) || 0,
              at: Number(m.at) || Date.now(),
              ...(m.staff === true ? { staff: true as const } : {}),
              // 11/16 매니저 계정이 외친 것
              ...(m.mgr === true ? { mgr: true as const } : {}),
              // 11/15 마을 공지 줄 (실시간 서버가 /internal/say로 띄운 것)
              ...(m.system === true ? { system: true as const } : {}),
              ...(typeof m.replaces === "string" ? { replaces: m.replaces } : {}),
            });
          break;
        // 11/17 확성기 창 고정 공지 (모양이 틀리면 버린다)
        case "megaPin": {
          const pin = parseMegaPinMsg(m as unknown as Record<string, unknown>);
          if (pin) this.cb.onMegaPin?.(pin);
          break;
        }
        case "me":
          this.cb.onMeStale?.();
          break;
        case "friend":
          if (typeof m.key === "string" && typeof m.name === "string") this.cb.onFriend?.({ key: m.key, name: m.name, on: m.on === true });
          break;
        case "squirrels":
          this.cb.onSquirrels?.({ by: typeof m.by === "string" ? m.by : "", seed: Number(m.seed) >>> 0, at: Number(m.at) || Date.now() });
          break;
        case "squirrelsWait":
          this.cb.onSquirrelsWait?.(Math.max(0, Number(m.left) || 0));
          break;
        case "peers": {
          this.peers.clear();
          this.syncPolicy.mark(performance.now());
          for (const p of m.peers) if (p.sid !== this.mySid) this.peers.add(p.sid);
          // 내 항목도 넘긴다 (받는 쪽이 내 벤치 상태를 서버 기억에 맞추고, 원격 목록에서는 건너뛴다)
          this.h.onPeers(
            m.peers,
            m.seats,
          );
          this.emitStatus();
          break;
        }
      }
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.bytesIn += data.byteLength;
      const snap = decodeSnapshot(data);
      if (!snap || this.mapPending !== null) return;
      this.snapshots++;
      // 모르는 사람의 스냅샷 = 입장 소식을 놓쳤다 → 목록을 다시 받는다 (최소 간격 유지)
      for (let i = 0; i < snap.entries.length; i++) {
        const sid = snap.entries[i].sid;
        if (sid !== this.mySid && !this.peers.has(sid)) {
          this.requestSync();
          break;
        }
      }
      this.h.onSnapshot(snap.entries, performance.now());
    }
  }

  /** 11/15 맵 옮기기 답: 그 맵 접속자로 목록을 새로 */
  private onMapped(map: MapId, peers: PeerInfo[], seats: Record<string, Sid>): void {
    this.mapPending = null;
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    this.map = mapOf(map);
    this.peers.clear();
    for (const p of peers) if (p.sid !== this.mySid) this.peers.add(p.sid);
    this.syncPolicy.mark(performance.now());
    this.h.onMapped?.(this.map, peers.filter((p) => p.sid !== this.mySid), seats);
    this.emitStatus();
  }

  private onWelcome(m: WelcomeMsg): void {
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.mySid = m.sid;
    this.channel = m.channel;
    // 11/15 서버가 아는 내 맵 (없으면 마을 — 허락이 없거나 옛 서버)
    this.map = mapOf(m.m);
    this.mapPending = null;
    this.total = typeof m.n === "number" && Number.isFinite(m.n) ? m.n : null;
    // 22번: 서버 시계 맞추기 (왕복 절반만큼 늦게 도착했다고 본다)
    if (typeof m.now === "number" && Number.isFinite(m.now)) this.clockOffset = m.now + (this.rtt ?? 60) / 2 - Date.now();
    this.target = m.channel;
    this.cap = m.cap;
    this.peers.clear();
    for (const p of m.peers) if (p.sid !== m.sid) this.peers.add(p.sid);
    if (this.admittedTo !== null) this.toast(`자리가 나서 ${m.channel}채널로 들어왔어요`);
    else if (this.redirected) this.toast(`채널이 가득 차서 ${m.channel}채널로 들어왔어요`);
    this.redirected = false;
    this.switchBack = null;
    this.admittedTo = null;
    this.stopQueue();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.attempt = 0;
    this.consecutiveInvalid = 0;
    this.everOnline = true;
    this.stopSpectatorPoll();
    this.throttle.reset();
    this.lastPongAt = performance.now();
    this.startPing();
    this.syncPolicy.mark(performance.now());
    this.startSync();
    this.setMode("online");
    this.h.onWelcome({ ...m, peers: m.peers.filter((p) => p.sid !== m.sid) });
    // 실내 표시: 들어가 있으면 새 연결에 다시 알린다. 유예 안에 자리를 되찾았으면 서버가 옛 값을 들고 있을 수 있어 나와 있어도 알린다
    if (this.away || m.resumed) this.send(this.awayMsg());
    // 새 연결: 서버 간격이 처음부터라 지금 착용 증서를 바로 보낸다 (기다리던 것도 함께 정리)
    if (this.lookGrant) this.lookPacer.push(this.lookGrant);
    this.lookPacer.reset();
  }

  // ── 대기열 ──

  private enterQueue(queueUrl: string): void {
    this.channel = null;
    this.h.onReset();
    this.peers.clear();
    this.queueUrl = queueUrl;
    this.setMode("queue");
    this.stopQueue();
    this.queueTimer = setTimeout(() => void this.pollQueue(), 0);
  }

  private stopQueue(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = null;
  }

  private async pollQueue(): Promise<void> {
    this.queueTimer = null;
    const url = this.queueUrl;
    if (this.stopped || this.mode !== "queue" || !url) return;
    const gen = this.gen;
    let status: QueueStatus | null = null;
    let expired = false;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 410) expired = true;
      else if (r.ok) status = (await r.json()) as QueueStatus;
    } catch {
      // 네트워크 오류: 다음 주기에 다시
    }
    if (gen !== this.gen || this.stopped || this.mode !== "queue") return;
    if (status) bridge.emit("queue:status", status);
    if (expired || status?.state === "none") {
      // 대기 증서가 만료됐거나 줄에서 빠졌다 → /api/join부터 다시 (또 대기열일 수 있다)
      void this.connect("auto");
      return;
    }
    if (status?.state === "admitted") {
      this.admittedTo = status.channel;
      this.target = status.channel;
      void this.connect(status.channel);
      return;
    }
    this.queueTimer = setTimeout(() => void this.pollQueue(), QUEUE_POLL_MS);
  }

  // ── 자가 복구 ──

  private startSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    // 타이머는 클라이언트 안에서만 돈다. 보내는 건 보이는 탭에서 3분이 지났을 때뿐
    this.syncTimer = setInterval(() => {
      if (this.online && this.syncPolicy.periodic(performance.now(), this.hidden)) this.sync();
    }, Math.min(SYNC_EVERY_MS, 30_000));
  }

  private stopSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  /** 소켓이 닫혔거나 죽은 것으로 판단됨 */
  private drop(ws: WebSocket, code: number): void {
    if (this.ws !== ws) return;
    this.ws = null;
    try {
      ws.onclose = null;
      ws.onmessage = null;
      // 1000으로 닫으면 서버가 의도적 퇴장으로 보고 유예 없이 자리를 비운다 → 4000
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(CLOSE_CLIENT_DROP);
    } catch {
      // 무시
    }
    this.stopPing();
    this.stopSync();
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    this.mapPending = null;
    this.peers.clear();
    this.h.onReset();
    if (this.stopped) return;

    switch (code) {
      case CLOSE.CHANNEL_FULL:
        // 일부러 옮기던 중이면 온 채널로, 처음 입장·재접속이면 다른 채널 → 관람 모드
        if (this.switchBack !== null) this.returnBack(this.switchBack);
        else void this.handleFull();
        return;
      case CLOSE.REPLACED:
        this.channel = null;
        this.setMode("replaced");
        return;
      case CLOSE.OUTDATED:
        // 새로고침해야만 풀린다. 다시 붙어 봐야 또 거절이라 재시도하지 않는다 (혼자 걷기 + 업데이트 창)
        this.clearRetry();
        this.setMode("offline");
        bridge.emit("app:outdated", { source: "channel" });
        return;
      case CLOSE.KICKED:
        // 47번 운영자가 내보냄 (정지 아님): 자동으로 다시 붙지 않는다. "여기서 다시 접속"으로 직접 돌아올 수 있다
        this.clearRetry();
        this.channel = null;
        this.setMode("offline");
        this.toast("운영자가 연결을 끊었어요.");
        return;
      case CLOSE.BANNED:
        // 47번 이용 제한: 다시 붙어도 입장 토큰에서 막힌다 → 재시도하지 않고 제한 화면으로
        this.clearRetry();
        this.channel = null;
        this.setMode("offline");
        bridge.emit("app:banned");
        return;
      case CLOSE.BAD_REQUEST:
        this.token = null;
        this.setMode(this.everOnline ? "reconnecting" : "connecting");
        void this.connect("auto");
        return;
      case CLOSE.INVALID_TOKEN:
        // 토큰 만료: 새 토큰으로 곧바로 (반복되면 백오프)
        this.token = null;
        this.consecutiveInvalid++;
        if (this.consecutiveInvalid <= 2) {
          this.setMode(this.everOnline ? "reconnecting" : "connecting");
          void this.connect(this.channel ?? this.target);
          return;
        }
        this.scheduleReconnect();
        return;
      case CLOSE.RATE_LIMITED:
        this.toast("신호가 너무 많아서 잠깐 연결이 끊겼어요. 곧 다시 이어져요.");
        this.scheduleReconnect(Math.max(2000, backoffDelay(this.attempt++)));
        return;
      default:
        this.scheduleReconnect();
    }
  }

  private async handleFull(): Promise<void> {
    const gen = this.gen;
    if (this.connectingTo !== null) this.triedFull.add(this.connectingTo);
    this.fullRetries++;
    if (this.fullRetries > MAX_JOIN_RETRIES) {
      this.enterSpectator();
      return;
    }
    const lobby = await fetchLobby();
    if (gen !== this.gen || this.stopped) return;
    if (!lobby) {
      this.scheduleReconnect();
      return;
    }
    if (lobby.total >= lobby.totalCap) {
      this.enterSpectator();
      return;
    }
    const next = pickChannel(lobby, this.triedFull);
    if (next === null) {
      this.enterSpectator();
      return;
    }
    this.redirected = true;
    this.target = next;
    void this.connect(next);
  }

  private enterSpectator(): void {
    this.channel = null;
    this.h.onReset();
    this.peers.clear();
    this.setMode("spectator");
    if (this.spectatorTimer) return;
    this.spectatorTimer = setInterval(() => void this.pollLobby(), SPECTATOR_POLL_MS);
  }

  private async pollLobby(): Promise<void> {
    if (this.stopped || this.mode !== "spectator") return;
    const gen = this.gen;
    const lobby = await fetchLobby();
    if (gen !== this.gen || this.stopped || this.mode !== "spectator") return;
    if (lobby && lobby.total < lobby.totalCap) {
      this.triedFull.clear();
      this.fullRetries = 0;
      this.redirected = false;
      void this.connect("auto");
    }
  }

  private stopSpectatorPoll(): void {
    if (this.spectatorTimer) clearInterval(this.spectatorTimer);
    this.spectatorTimer = null;
  }

  private scheduleReconnect(delay?: number): void {
    if (this.stopped || this.mode === "replaced") return;
    this.clearRetry();
    // 11/17 연달아 오래 실패하면 30초, 숨은 탭이면 60초 간격 (backoff.ts retryDelay)
    const d = delay ?? retryDelay(this.attempt, this.hidden);
    this.attempt++;
    // 한 번도 붙지 못했으면 서버가 없는 것 → offline (혼자 계속 플레이), 붙어 있다 끊긴 거면 잠시 reconnecting
    const mode: NetMode = this.everOnline && this.attempt <= RECONNECTING_ATTEMPTS ? "reconnecting" : "offline";
    if (this.mode !== "spectator") this.setMode(mode);
    const channel = this.channel ?? this.target;
    this.retryDueAt = Date.now() + d;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryDueAt = null;
      if (this.mode === "spectator") return;
      void this.connect(channel);
    }, d);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDueAt = null;
  }

  private clearTimers(): void {
    this.clearRetry();
    this.stopQueue();
    this.stopSync();
    if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
    this.hiddenIdleTimer = null;
    this.stopSpectatorPoll();
    this.stopPing();
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    // 맵 옮기기 답을 기다리던 중이면 그만 (다시 접속하면 this.map으로 들어간다)
    if (this.mapTimer) clearTimeout(this.mapTimer);
    this.mapTimer = null;
    this.mapPending = null;
  }

  private closeSocket(code: number, reason: string): void {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    this.stopSync();
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = null;
    try {
      ws.close(code, reason);
    } catch {
      // 무시
    }
  }

  // ── 핑 / 통계 / 상태 ──

  private startPing(): void {
    this.stopPing();
    const every = this.opts.debug ? DEBUG_PING_MS : PING_MS;
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = performance.now();
      if (now - this.lastPongAt > every + PONG_GRACE_MS && !this.hidden) {
        // 응답이 없다 → 죽은 연결로 보고 재접속
        this.drop(ws, 1006);
        return;
      }
      this.pingSentAt = now;
      ws.send(PING);
    }, every);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private emitStats(): void {
    bridge.emit("net:stats", {
      rttMs: this.online && this.rtt !== null ? Math.round(this.rtt) : null,
      snapshotHz: this.snapshots,
      peers: this.peers.size,
      fps: Math.round(this.h.getFps()),
      inKBps: Math.round((this.bytesIn / 1024) * 100) / 100,
    });
    this.snapshots = 0;
    this.bytesIn = 0;
  }

  private setMode(mode: NetMode): void {
    this.mode = mode;
    if (mode !== "online") this.mySid = mode === "reconnecting" ? this.mySid : null;
    this.emitStatus();
  }

  private emitStatus(): void {
    const online = this.mode === "online";
    const pending = this.mode === "reconnecting" || this.mode === "connecting";
    const channel = online || pending ? (this.channel ?? (typeof this.target === "number" ? this.target : null)) : null;
    // 나를 포함한 인원. 혼자 걷는 동안(관람·오프라인)은 나 하나
    // 11/15 HUD는 맵이 달라도 채널 전체 인원 (서버가 알려 준 값, 옛 서버면 같은 맵 사람 수)
    const status = { mode: this.mode, channel, count: online ? (this.total ?? this.peers.size + 1) : 1, cap: this.cap, ...(this.map !== "village" ? { map: this.map } : {}) };
    const prev = bridge.last("net:status");
    // 재시도마다 같은 상태를 다시 보내지 않는다
    if (prev && prev.mode === status.mode && prev.channel === status.channel && prev.count === status.count && prev.cap === status.cap && prev.map === status.map) return;
    bridge.emit("net:status", status);
  }

  private toast(message: string): void {
    // 같은 안내가 재시도마다 반복되지 않게
    if (message === this.lastToast) return;
    this.lastToast = message;
    setTimeout(() => {
      if (this.lastToast === message) this.lastToast = "";
    }, 30_000);
    bridge.emit("toast", { message });
  }

  private readonly onVisibility = (): void => {
    const hidden = document.hidden || this.resting;
    if (this.hidden && !hidden) this.throttle.reset(); // 돌아오면 현재 상태 1회
    this.hidden = hidden;
    if (!hidden) {
      this.lastPongAt = performance.now();
      if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
      this.hiddenIdleTimer = null;
      // 11/17 숨어 있는 동안 늘려 둔 재접속 대기(30·60초)가 남았으면 곧바로 다시 시도한다
      if (retrySoonOnVisible(this.retryDueAt, Date.now())) this.scheduleReconnect(backoffDelay(0));
      // 숨어 있는 동안 놓친 입장·퇴장을 서버 기준으로 다시 맞춘다 (1회, 최소 간격 유지)
      this.requestSync();
      return;
    }
    // 걷던 중에 탭이 숨으면 게임 루프가 멈춘다 → 다른 사람 화면에서 계속 걷지 않도록 멈춤(idle)을 1회 알리고 쉰다
    if (this.online && this.throttle.lastWasMoving) {
      const wait = this.throttle.waitMs(performance.now());
      this.hiddenIdleTimer = setTimeout(() => {
        this.hiddenIdleTimer = null;
        if (!this.hidden || !this.online) return;
        const pose = this.h.getPose(this.pose);
        pose.state = STATE.idle;
        const now = performance.now();
        if (this.throttle.waitMs(now) > 0) return;
        const seq = this.throttle.markSent(now, pose);
        this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
      }, wait);
    }
  };
}
