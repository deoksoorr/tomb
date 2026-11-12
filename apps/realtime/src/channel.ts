import {
  CLOSE,
  DIR,
  GOBLIN_GRANT_TTL_SEC,
  MAX_MESSAGE_BYTES,
  SEAT_SERVER_RADIUS,
  SNAPSHOT_MAX_ENTRIES,
  SPAWN,
  STATE,
  decodeMove,
  encodeEvent,
  encodeSnapshot,
  inServerBounds,
  parseC2S,
  seatSlot,
  spotKindOfState,
  spotSeatId,
  isIndoorSpot,
  isSeatMood,
  ridePetOfLook,
  USE_INTERVAL_MS,
  hasDye,
  sameDye,
  type AvatarDye,
  type C2S,
  type DirId,
  type Grant,
  type MoveMsg,
  type PeerInfo,
  type PeerState,
  type SeatSlot,
  type S2C,
  type StateId,
} from "@tomb/protocol";
import { MoveBudget, RateLimiter, allocSid, dist, stepToward, type Point } from "./logic";
import { GoblinCore, type GoblinState } from "./goblin";

// 채널 하나의 상태 머신. ChannelDO는 소켓·스토리지·타이머만 이어 주고 판정은 전부 여기서 동기적으로 한다.
// Workers API를 쓰지 않으므로 Node에서 그대로 단위 테스트하고(channel.test.ts) 부하 테스트의 틱 벤치마크에도 쓴다.
// 접속자 위치·상태·좌석은 메모리에 두고, 영구 저장은 재연결 유예 예약과 "접속자 스냅샷"(liveRecords) 둘이다.
// 스냅샷은 실시간 서버 재배포(DO 재시작)로 소켓이 모두 끊겨도 같은 sid·좌석으로 돌아오게 하는 용도라
// 좌석·입퇴장은 곧바로, 위치만 바뀐 것은 드물게 저장한다(저장 시점은 DO가 정한다: liveChanged).

/** 소켓 attachment와 유예 예약에 저장하는 형태 (hibernation 뒤 복원용) */
export type PeerRecord = {
  sid: number;
  visitorId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  state: StateId;
  dir: DirId;
  seatId: string | null;
  /** 착용 중인 꾸미기 (입장 토큰 → look 증서로 바뀜) */
  look: string[];
  /** 아바타 몸 모양 (AVATAR_BODIES id, 입장 토큰 → 25번 외형 바꾸기면 look 증서로 바뀜) */
  body: string;
  /** 46번 염색한 부위 색 (입장 토큰 → look 증서로 바뀜). 없으면 color 하나 */
  dye?: AvatarDye;
  /** 24번 벤치 상태 (SEAT_MOODS id). 의자·벤치에 앉아 있는 동안만 있다 */
  mood?: string;
  /** 동물원 타는 펫에 올라타 있다 (착용 펫이 타는 펫이고 자리에 앉아 있지 않은 동안만) */
  ride?: true;
  /** 31번 운영자 계정 (입장 토큰에 Vercel이 넣은 것만) */
  staff?: true;
  /** 이 연결로 자리를 잡은 시각. 로비의 채널 간 중복 정리(kick)가 더 새 연결을 내보내지 않게 비교한다 */
  joinedAt: number;
};

/** 재연결 유예 예약. until(ms)까지 sid·좌석·위치를 지킨다 */
export type Reservation = PeerRecord & { until: number };

/** Worker가 토큰을 검증한 뒤 DO에 넘기는 입장 정보 */
export type JoinTicket = {
  visitorId: string;
  name: string;
  color: string;
  /** 채널 번호 (방이면 0) */
  channel: number;
  /** 방(room) 입장이면 방 id ("village" | "house:…" | "hunt:…") */
  room?: string;
  /** 클라이언트가 붙인 ?x=&y=. 없으면 새 입장은 SPAWN, 복귀는 기존 위치 */
  spawn?: Point;
  /** 입장 시점의 꾸미기 (JoinClaims.look) */
  look: string[];
  /** 아바타 몸 모양 (JoinClaims.body) */
  body: string;
  /** 46번 염색 (JoinClaims.dye) */
  dye?: AvatarDye;
  /** 31번 운영자 계정 (JoinClaims.staff) */
  staff?: true;
};

/** ChannelCore가 바깥(DO)에 맡기는 부수 효과 */
export interface ChannelHost<C> {
  send(conn: C, data: string | ArrayBuffer): void;
  close(conn: C, code: number, reason: string): void;
  /** 소켓 attachment 갱신. null이면 이 소켓은 더 이상 피어가 아니다(교체·추방) */
  persist(conn: C, rec: PeerRecord | null): void;
  saveReservation(r: Reservation): void;
  dropReservation(sid: number): void;
  /** 바뀐 사람이 생겼다 → 틱 루프를 깨운다 (이미 돌고 있으면 무시) */
  requestTick(): void;
  /** 인원(접속 중 + 유예 예약)이 바뀌었다 → 로비 보고 */
  countChanged(count: number): void;
  /**
   * 접속자 스냅샷(liveRecords)이 바뀌었다. urgent = 입장·퇴장·좌석·꾸미기처럼 재시작 뒤 꼭 맞아야 하는 변화,
   * 아니면 위치·상태만 바뀐 것(드물게 저장해도 된다 — 복귀하는 클라이언트가 자기 좌표를 다시 알려 준다)
   */
  liveChanged?(urgent: boolean): void;
  /** 이 소켓에 런타임이 마지막으로 pong을 자동 응답한 시각(ms, 없으면 0) */
  lastPing(conn: C): number;
  /** 방문자가 이 채널에 자리를 잡았다(신규·복귀·교체) / 최종 퇴장했다 → 로비의 채널 간 중복 방지 레지스트리 */
  visitorJoined(visitorId: string, at: number): void;
  visitorLeft(visitorId: string): void;
  /** Vercel이 서명한 증서(look/firework) 검증. 비동기(HMAC) */
  verifyGrant(token: string): Promise<Grant | null>;
  /** 폭죽 nonce를 until(ms)까지 "사용됨"으로 기록. 이미 쓴 nonce면 false */
  claimNonce(nonce: string, until: number): boolean;
  // ── 22번 황금 고블린 (없으면 고블린 기능이 꺼진다: 방·테스트) ──
  /** 보상 증서 서명 (JOIN_SECRET). 비동기(HMAC) */
  signGrant?(g: Grant): Promise<string | null>;
  /** 고블린 일정·상태가 바뀌었다 → 저장하고 알람을 다시 잡는다 */
  goblinChanged?(s: GoblinState): void;
  // ── 23번 확성기 ──
  /** 이 DO의 채널 번호 (확성기 증서의 ch와 맞춰 본다). 없으면(테스트) 채널 검사를 건너뛴다 */
  channelNo?(): number;
  /** 모든 채널 확성기: 이 채널에 방송한 메시지를 다른 열린 채널들에도 전한다 (nonce로 채널마다 한 번만) */
  relayMegaphone?(nonce: string, until: number, data: string): void;
  /** 난수 (테스트에서 고정) */
  random?(): number;
}

/**
 * room = 방(마을·집·사냥터) 모드. 같은 Channel DO 코드로 돌리되:
 * - 위치·상태·look·body·act·say·sync·warp만 다룬다. 좌석(sit/stand)·graveEvent·emote·firework는 무시
 * - 방 크기를 모르므로 좌표는 u16 범위만 본다(MOVE 형식이 이미 보장)
 * - 로비 보고·대기열·채널 간 중복 정리는 DO(호스트) 쪽에서 하지 않는다
 */
export type ChannelConfig = { capacity: number; graceMs: number; room?: boolean };

/** 클라이언트가 채널 이동·나가기로 직접 닫을 때 쓰는 코드. 유예 없이 바로 퇴장시킨다. 그 밖의 코드는 모두 유예. */
export const CLOSE_NORMAL = 1000;
/** 서버가 응답 없는(유령) 연결을 닫을 때. 1000이 아니므로 재연결 유예가 적용된다 */
export const CLOSE_STALE = 4000;
/**
 * 이 시간 넘게 ping도 메시지도 없으면 유령 연결로 본다. 클라이언트는 2초마다 ping하지만, 숨겨진 탭은 브라우저가
 * 타이머를 1분 단위로 묶어(Chrome intensive throttling) 60초 넘게 비기도 한다 → 그 두 배 이상 여유.
 */
export const STALE_AFTER_MS = 150_000;

// 이벤트는 받은 사람 모두가 반응한다(graveEvent는 각자 Vercel 상세 API를 다시 부른다). 레이트리밋(20/s)과 별개로
// 브로드캐스트 증폭(× 인원수)을 막는다.
/** emote: 연결당 최소 간격 */
export const EMOTE_INTERVAL_MS = 250;
/** emote: 채널 안에서 같은 (sid, graveId) 연타는 이 간격에 한 번만 중계 */
export const EMOTE_DEDUPE_MS = 1_000;
/** graveEvent: 연결당 최소 간격이자, 채널 안에서 같은 graveId를 중계하는 최소 간격 */
export const GRAVE_EVENT_INTERVAL_MS = 5_000;
/** look 증서 연결당 최소 간격 */
export const LOOK_INTERVAL_MS = 10_000;
/** firework 증서 연결당 최소 간격 */
export const FIREWORK_INTERVAL_MS = 3_000;
/** megaphone 증서 연결당 최소 간격 (주된 도배 제한은 Vercel이 계정 단위로 한다) */
export const MEGAPHONE_INTERVAL_MS = 3_000;
/** sync(접속자 목록 다시 받기) 연결당 최소 간격. 클라이언트는 PEER_SYNC_MS(60초)마다 보낸다 */
export const SYNC_INTERVAL_MS = 20_000;
/** act(종 치기·손 흔들기 등) 연결당 최소 간격 */
export const ACT_INTERVAL_MS = 2_000;
/** say(정해진 문장 말풍선) 연결당 최소 간격 */
export const SAY_INTERVAL_MS = 3_000;
/** 5번 이모티콘(emo) 연결당 최소 간격 — 도배 제한 (클라이언트 쿨다운과 같다) */
export const EMO_INTERVAL_MS = 1_000;
/** 타는 펫 올라타기·내리기(ride) 연결당 최소 간격 */
export const RIDE_INTERVAL_MS = 400;
/** 24번 벤치 상태(mood) 연결당 최소 간격 */
export const MOOD_INTERVAL_MS = 800;
/** warp 서버 쿨다운. 클라이언트(WARP_COOLDOWN_MS 1초)보다 짧게 둬서 네트워크 지터로 정상 요청이 버려지지 않게 한다 */
export const SERVER_WARP_COOLDOWN_MS = 800;
/** 입장·복귀 좌표가 다른 사람이 앉은 좌석 앵커에서 이 거리 안이면 그 좌석 앞(내려설 자리)으로 옮긴다 — 한 자리에 한 명 */
export const SEAT_CLEAR_RADIUS = 6;
/** 좌석 앞 내려설 자리 (클라이언트 standPoint의 STAND_OFFSET_Y와 같다) */
export const SEAT_STAND_DY = 9;

type Peer<C> = PeerRecord & {
  /** null = 연결이 끊겨 재연결 유예 중. 다른 사람에게는 멈춘 아바타로 계속 보인다 */
  conn: C | null;
  until: number;
  /** 클라이언트가 마지막으로 보고한 위치. 서버 위치(x,y)는 속도 예산 안에서 이 지점을 따라간다 */
  tx: number;
  ty: number;
  // 연결 단위 일시 상태 — hibernation 뒤 초기화돼도 무방하다
  rate: RateLimiter;
  budget: MoveBudget;
  lastWarpAt: number;
  lastEmoteAt: number;
  lastGraveEventAt: number;
  lastLookAt: number;
  lastFireworkAt: number;
  lastSyncAt: number;
  lastActAt: number;
  lastSayAt: number;
  /** 23번 확성기 (없으면 아직 안 씀) */
  lastMegaphoneAt?: number;
  /** 3번 집 안 가구 쓰기 (없으면 아직 안 씀) */
  lastUseAt?: number;
  /** 5번 이모티콘·24번 벤치 상태 (없으면 아직 안 씀) */
  lastEmoAt?: number;
  lastMoodAt?: number;
  /** 타는 펫 올라타기·내리기 (없으면 아직 안 씀) */
  lastRideAt?: number;
  /** 마지막으로 메시지를 받은 시각 (입장·복원 시각으로 시작). 유령 연결 판정에 ping 시각과 함께 쓴다 */
  lastSeenAt: number;
  /** attachment가 최신인지 */
  saved: boolean;
};

export class ChannelCore<C extends object> {
  private readonly peers = new Map<number, Peer<C>>();
  private readonly bySocket = new Map<C, number>();
  private readonly byVisitor = new Map<string, number>();
  /** seatId → sid */
  private readonly seats = new Map<string, number>();
  /** 다음 틱 SNAPSHOT에 실을 sid ("바뀐 사람" 집합) */
  private readonly dirty = new Set<number>();
  /** 속도 예산 때문에 아직 보고된 위치에 닿지 못한 sid */
  private readonly chasing = new Set<number>();
  /** 채널 단위 이벤트 중복 제거: 키 → 마지막 중계 시각 */
  private readonly recentEvents = new Map<string, number>();
  private tickNo = 0;
  /** 22번 황금 고블린 (등장·주인 판정) */
  private readonly goblin = new GoblinCore(() => (this.host.random ? this.host.random() : Math.random()));

  constructor(
    private readonly cfg: ChannelConfig,
    private readonly host: ChannelHost<C>,
  ) {}

  /** 접속 중 + 유예 예약. 상한 판정과 로비 보고에 쓴다 */
  get count(): number {
    return this.peers.size;
  }

  /** 소켓이 붙어 있는 인원 (유예 중 제외) */
  get online(): number {
    return this.bySocket.size;
  }

  /** 이 방문자가 이미 자리를 갖고 있는지 (접속 중이거나 유예 중) */
  has(visitorId: string): boolean {
    return this.byVisitor.has(visitorId);
  }

  /** 이 visitorId를 받을 수 있는지: 이미 자리가 있거나(복귀·중복 접속) 상한 미만 */
  admits(visitorId: string): boolean {
    return this.byVisitor.has(visitorId) || this.peers.size < this.cfg.capacity;
  }

  /** 테스트·디버그용 읽기 전용 사본 */
  peer(sid: number): (PeerRecord & { online: boolean }) | undefined {
    const p = this.peers.get(sid);
    return p && { ...this.record(p), online: p.conn !== null };
  }

  /** 접속 중인 사람 전체의 저장 형태 (DO 재시작 복원용 스냅샷). 유예 중인 사람은 따로 예약으로 저장돼 있어 뺀다 */
  liveRecords(): PeerRecord[] {
    const out: PeerRecord[] = [];
    for (const p of this.peers.values()) if (p.conn) out.push(this.record(p));
    return out;
  }

  /** 가장 이른 유예 만료 시각 (없으면 null) */
  nextExpiry(): number | null {
    let t: number | null = null;
    for (const p of this.peers.values()) if (!p.conn && (t === null || p.until < t)) t = p.until;
    return t;
  }

  /**
   * hibernation에서 깨어났을 때·재시작했을 때: 소켓 attachment → 저장된 유예 예약 → 접속자 스냅샷 순으로 상태를 다시 세운다.
   * 스냅샷에만 있는 사람(= 소켓이 사라졌다: 실시간 서버 재배포로 DO가 재시작했거나, hibernate 중에 끊겼다)은
   * now + liveGraceMs까지의 유예 예약으로 바꾼다 → 다시 붙으면 기존 takeOver 경로로 같은 sid·좌석을 이어받는다.
   * 스냅샷에서 예약으로 옮긴 인원 수를 돌려준다.
   */
  restore(
    active: Iterable<[C, PeerRecord]>,
    reserved: Iterable<Reservation>,
    now: number,
    live: Iterable<PeerRecord> = [],
    liveGraceMs: number = this.cfg.graceMs,
  ): number {
    for (const [conn, rec] of active) {
      if (!this.adopt(rec, conn, 0, now)) {
        this.host.persist(conn, null);
        this.host.close(conn, CLOSE.REPLACED, "replaced");
      }
    }
    for (const r of reserved) if (!this.adopt(r, null, r.until, now)) this.host.dropReservation(r.sid);
    let revived = 0;
    if (liveGraceMs > 0) {
      for (const rec of live) {
        if (!rec || typeof rec.sid !== "number" || typeof rec.visitorId !== "string") continue;
        const until = now + liveGraceMs;
        if (!this.adopt(rec, null, until, now)) continue; // 소켓이 살아 있거나(hibernate 복귀) 이미 예약이 있다
        const p = this.peers.get(rec.sid)!;
        if (p.state === STATE.walk || p.state === STATE.run) p.state = STATE.idle;
        this.host.saveReservation({ ...this.record(p), until });
        revived++;
      }
    }
    if (revived > 0) this.host.liveChanged?.(true);
    return revived;
  }

  // ── 입장 ──

  join(conn: C, t: JoinTicket, now: number): void {
    const sid = this.byVisitor.get(t.visitorId);
    const prev = sid === undefined ? undefined : this.peers.get(sid);
    if (prev) return this.takeOver(prev, conn, t, now);

    // 상한은 접속 중 + 유예 예약으로 센다. 이 DO가 채널의 유일한 인스턴스이므로 경쟁 조건이 없다.
    // (DO는 admits()로 먼저 거르지만, 여기서도 한 번 더 지킨다)
    const newSid = this.admits(t.visitorId) ? allocSid(this.peers) : null;
    if (newSid === null) return this.host.close(conn, CLOSE.CHANNEL_FULL, "channel full");

    const pos = this.clearOfSeats(t.spawn ?? SPAWN);
    const rec: PeerRecord = {
      sid: newSid,
      visitorId: t.visitorId,
      name: t.name,
      color: t.color,
      x: pos.x,
      y: pos.y,
      state: STATE.idle,
      dir: DIR.down,
      seatId: null,
      look: t.look,
      body: t.body,
      ...(hasDye(t.dye) ? { dye: t.dye } : {}),
      ...(t.staff ? { staff: true as const } : {}),
      joinedAt: now,
    };
    const p = this.adoptNew(rec, conn, now);
    this.save(p);
    this.welcome(p, t.channel, false, now);
    this.broadcast(encodeEvent({ t: "join", ...this.info(p) }), p.sid);
    this.host.countChanged(this.peers.size);
    this.host.visitorJoined(p.visitorId, p.joinedAt);
    this.host.liveChanged?.(true);
  }

  /**
   * 같은 visitorId가 이미 있다. 상한 검사 없이 같은 sid·좌석을 넘겨받는다.
   * - 유예 중이면 복귀(재연결)
   * - 접속 중이면 기존 소켓을 4002로 닫는다 (탭 여러 개로 자리 차지 방지. 죽은 연결의 재접속도 여기로 온다)
   */
  private takeOver(p: Peer<C>, conn: C, t: JoinTicket, now: number): void {
    if (p.conn) {
      this.bySocket.delete(p.conn);
      this.host.persist(p.conn, null);
      this.host.close(p.conn, CLOSE.REPLACED, "replaced");
      p.conn = null;
    } else {
      this.host.dropReservation(p.sid);
    }
    const renamed =
      p.name !== t.name || p.color !== t.color || p.body !== t.body || p.look.join() !== t.look.join() || !sameDye(p.dye, t.dye) || !!p.staff !== !!t.staff;
    p.name = t.name;
    p.color = t.color;
    p.look = t.look;
    p.body = t.body;
    p.dye = hasDye(t.dye) ? t.dye : undefined;
    p.staff = t.staff ? true : undefined;
    p.joinedAt = now;
    // 새 소켓을 붙이기 전에 옮긴다: 좌석 해제 알림은 다른 사람에게만 가고, 본인은 결과가 반영된 welcome을 처음으로 받는다
    if (t.spawn) this.relocate(p, t.spawn);

    p.conn = conn;
    p.until = 0;
    this.bySocket.set(conn, p.sid);
    this.resetConnState(p, now);
    this.save(p);
    this.welcome(p, t.channel, true, now);
    // 이름·색·몸·꾸미기는 입장 때 한 번만 보낸다. 바뀌었을 때만 join을 다시 보낸다(클라이언트는 같은 sid의 join을 덮어쓰기로 처리).
    if (renamed) this.broadcast(encodeEvent({ t: "join", ...this.info(p) }), p.sid);
    this.host.visitorJoined(p.visitorId, p.joinedAt);
    this.host.liveChanged?.(true);
  }

  /** 복귀한 클라이언트가 알려 준 위치로 옮긴다(위치의 원천은 클라이언트). 앉아 있던 좌석 근처면 좌석을 유지한다. */
  private relocate(p: Peer<C>, want: Point): void {
    const seat = p.seatId ? seatSlot(p.seatId) : undefined;
    // 움직이는 자리(조각배, 50번): 자리는 그대로 두고 위치만 클라이언트가 알려 준 물 위로 (앵커와 멀어도 된다)
    if (seat?.mobile) return this.moveSeated(p, want);
    if (seat && dist(seat, want) <= SEAT_SERVER_RADIUS) return;
    if (p.seatId) this.releaseSeat(p);
    // 그 사이 다른 사람이 앉은 좌석 위로 돌아오지 않는다 (클라이언트는 seatDenied를 받고 가까운 빈자리로 옮긴다)
    const to = this.clearOfSeats(want, p.sid);
    if (p.x === to.x && p.y === to.y) return;
    p.x = p.tx = to.x;
    p.y = p.ty = to.y;
    p.state = STATE.idle; // 좌석을 놓았거나 자리를 옮겼다. 실제 상태는 클라이언트의 다음 MOVE가 알려 준다.
    this.chasing.delete(p.sid);
    this.markDirty(p);
  }

  /** 움직이는 자리(조각배)에 앉은 채 복귀: 자리는 유지하고 위치만 옮긴다 */
  private moveSeated(p: Peer<C>, to: Point): void {
    if (p.x === to.x && p.y === to.y) return;
    p.x = p.tx = to.x;
    p.y = p.ty = to.y;
    this.chasing.delete(p.sid);
    this.markDirty(p);
  }

  /** 다른 사람이 앉아 있는 좌석 앵커 바로 위면 그 좌석 앞(내려설 자리)으로. 아니면 그대로 */
  private clearOfSeats(pos: Point, self?: number): Point {
    if (this.cfg.room) return pos;
    for (const [seatId, sid] of this.seats) {
      if (sid === self) continue;
      const s = seatSlot(seatId);
      // 움직이는 자리(조각배)는 앵커에 사람이 있지 않다 (배가 물 위에 나가 있다)
      if (s && !s.mobile && dist(s, pos) < SEAT_CLEAR_RADIUS) return { x: s.x, y: s.y + SEAT_STAND_DY };
    }
    return pos;
  }

  private welcome(p: Peer<C>, channel: number, resumed: boolean, now = Date.now()): void {
    const goblin = this.goblinOn ? this.goblin.visible(now) : undefined;
    this.sendTo(p, {
      t: "welcome",
      sid: p.sid,
      channel,
      cap: this.cfg.capacity,
      peers: this.othersOf(p),
      seats: Object.fromEntries(this.seats),
      resumed,
      // 나무·그네도 좌석처럼 판정한다 (이 값이 없는 이전 서버에는 클라이언트가 소품 자리를 요청하지 않는다)
      // 방(집)도 3번 집 안 가구 자리를 같은 체계로 판정한다
      spots: true,
      // 22번: 서버 시계(고양이·유령·고블린을 모두가 같은 시각으로) + 지금 나와 있는 고블린
      ...(this.cfg.room ? {} : { now }),
      ...(goblin ? { goblin } : {}),
    });
    // 고블린을 잡았는데 증서를 받기 전에 끊겼다 → 다시 보낸다 (웹은 같은 고블린을 한 번만 지급한다)
    const owed = this.goblinOn ? this.goblin.grantFor(p.visitorId, now) : null;
    if (owed) this.sendTo(p, { t: "goblinGrant", ...owed });
  }

  /** 나를 뺀 현재 접속자 전체 (유예 중인 사람 포함 — 다른 사람에게는 멈춘 아바타로 보인다) */
  private othersOf(p: Peer<C>): PeerInfo[] {
    const out: PeerInfo[] = [];
    for (const o of this.peers.values()) if (o !== p) out.push(this.info(o));
    return out;
  }

  // ── 수신 ──

  message(conn: C, data: string | ArrayBuffer, now: number): void {
    const sid = this.bySocket.get(conn);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p) return;
    p.lastSeenAt = now;
    this.goblinCheck(now);
    const verdict = p.rate.hit(now);
    if (verdict === "kick") return this.kick(p, CLOSE.RATE_LIMITED, "rate limited");
    if (verdict === "drop") return;

    if (typeof data === "string") {
      const m = parseC2S(data); // 512자 초과·형식 오류는 null
      if (m) this.onEvent(p, m, now);
      return;
    }
    if (data.byteLength > MAX_MESSAGE_BYTES) return;
    const mv = decodeMove(data);
    if (mv) this.onMove(p, mv, now);
  }

  /** 연결 종료. 1000(의도적 퇴장)이 아니면 RECONNECT_GRACE 동안 자리를 지킨다. */
  disconnect(conn: C, code: number, now: number): void {
    const sid = this.bySocket.get(conn);
    if (sid === undefined) return; // 이미 교체(4002)·추방(4008)·거절(4001)된 소켓
    this.bySocket.delete(conn);
    // 닫힌 소켓도 TCP 정리 전까지 getWebSockets()에 잠시 남는다. 그 사이 hibernate됐다 깨어나면
    // 옛 attachment로 유령 피어가 되살아나거나(재사용된 sid와 부딪혀 정상 피어가 밀려남) 하지 않도록 지운다.
    this.host.persist(conn, null);
    const p = this.peers.get(sid);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    if (code === CLOSE_NORMAL || this.cfg.graceMs <= 0) return this.remove(p);

    p.until = now + this.cfg.graceMs;
    p.tx = p.x;
    p.ty = p.y;
    this.chasing.delete(sid);
    // 걷던 모습 그대로 제자리걸음을 하지 않도록 서 있는 상태로 멈춘다
    if (p.state === STATE.walk || p.state === STATE.run) {
      p.state = STATE.idle;
      this.markDirty(p);
    }
    this.host.saveReservation({ ...this.record(p), until: p.until });
  }

  /** 만료된 유예 예약을 정리한다 (알람에서 호출) */
  expire(now: number): void {
    for (const p of [...this.peers.values()]) {
      if (p.conn || p.until > now) continue;
      this.host.dropReservation(p.sid);
      this.remove(p);
    }
  }

  /**
   * 다른 채널에 같은 방문자가 들어갔다(로비가 부름): 접속 중이면 4002로 닫고, 유예 예약이면 지운다. 유예 없음.
   * claimedAt(다른 채널에 자리를 잡은 시각)보다 나중에 여기 다시 들어온 연결은 건드리지 않는다
   * (빠르게 채널을 오가면 늦게 도착한 kick이 새 연결을 내보낼 수 있다).
   */
  evict(visitorId: string, claimedAt = Infinity): void {
    const sid = this.byVisitor.get(visitorId);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p || p.joinedAt > claimedAt) return;
    if (!p.conn) this.host.dropReservation(p.sid);
    this.kick(p, CLOSE.REPLACED, "joined another channel");
  }

  /**
   * 47번 운영자 내보내기·이용 제한: 이 방문자의 접속(또는 재연결 유예 예약)을 code로 정리한다. 유예 없음.
   * 이 채널에 없으면 false
   */
  expel(visitorId: string, code: number, reason: string): boolean {
    const sid = this.byVisitor.get(visitorId);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p) return false;
    if (!p.conn) this.host.dropReservation(p.sid);
    this.kick(p, code, reason);
    return true;
  }

  /** 47번 유저 신고: 이 채널·방의 sid가 누구인지 (지금 접속 중이거나 유예 중인 사람만) */
  peerAt(sid: number): { visitorId: string; name: string } | null {
    const p = this.peers.get(sid);
    return p ? { visitorId: p.visitorId, name: p.name } : null;
  }

  /**
   * 유령 연결 정리: STALE_AFTER_MS 넘게 ping(런타임 자동 응답 시각)도 메시지도 없는 소켓을 4000으로 닫고 유예로 넘긴다.
   * DO가 이미 깨어 있을 때(틱 루프가 멈출 때, 알람)만 부른다 — 이것 때문에 DO를 깨우지 않는다.
   */
  reap(now: number): void {
    for (const p of [...this.peers.values()]) {
      const conn = p.conn;
      if (!conn || now - Math.max(p.lastSeenAt, this.host.lastPing(conn)) <= STALE_AFTER_MS) continue;
      this.host.persist(conn, null);
      this.host.close(conn, CLOSE_STALE, "stale");
      this.disconnect(conn, CLOSE_STALE, now);
    }
  }

  private onMove(p: Peer<C>, m: MoveMsg, now: number): void {
    if (!this.inBounds(m.x, m.y)) return;
    // 좌석 판정은 서버가 한다. 자리를 차지한 상태(의자 sitChair, 나무 hang, 그네 swing)가 아닌 MOVE가 오면 자리를 놓는다.
    let held = p.seatId ? seatSlot(p.seatId) : undefined;
    if (p.seatId && (!held || m.state !== held.state)) {
      this.releaseSeat(p);
      held = undefined;
    }
    let state: StateId = m.state;
    if (!held) {
      // 좌석을 얻지 못한 채 보낸 sitChair는 바닥 앉기로 본다.
      // (클라이언트는 요청과 동시에 스냅을 시작하므로 sit보다 MOVE가 먼저 올 수 있다. 승인되면 onSit이 sitChair로 바꾼다)
      if (state === STATE.sitChair) state = STATE.sitGround;
      // 나무·그네 상태인데 자리가 없다: 자리를 요청하지 않는 이전 클라이언트(또는 거절된 뒤 늦게 온 MOVE).
      // 보고된 위치(= 앵커)의 소품 자리가 비어 있으면 대신 잡아 주고, 누가 있으면 그 옆에 서 있는 것으로 본다 → 한 자리에 한 명
      // 3번: 집 안 자세(눕기·읽기·욕조)는 방(집)에서만 같은 규칙으로 잡아 주고, 월드에서는 서 있는 것으로 본다
      else {
        const kind = spotKindOfState(state);
        const indoor = !!kind && isIndoorSpot(kind);
        if (indoor && !this.cfg.room) state = STATE.idle;
        else if (kind && indoor === !!this.cfg.room && !this.claimSpot(p, spotSeatId(kind, m.x, m.y))) state = STATE.idle;
      }
    }
    // 타는 펫: 물에 들어가거나 자리에 앉으면 내린다 (클라이언트도 스스로 내리고 ride off를 보낸다)
    if (p.ride && (state === STATE.swim || state === STATE.dive || held)) this.clearRide(p);
    const changed = state !== p.state || m.dir !== p.dir;
    p.state = state;
    p.dir = m.dir;
    // 앉아 있는 동안 위치는 좌석 앵커에 고정한다 (움직이는 자리 — 조각배 — 는 보고된 위치를 따라간다)
    if (!p.seatId || held?.mobile) {
      p.tx = m.x;
      p.ty = m.y;
    }
    // 즉시 중계하지 않는다. 서버 위치만 갱신하고 "바뀐 사람"에 넣어 다음 틱에 한 번에 보낸다.
    if (this.chase(p, now) || changed) this.markDirty(p);
  }

  /** 속도 예산 안에서 서버 위치를 보고된 위치로 전진시킨다(초과분은 무시 → 다음 틱에 이어서). 움직였으면 true */
  private chase(p: Peer<C>, now: number): boolean {
    const target = { x: p.tx, y: p.ty };
    const want = dist(p, target);
    if (want === 0) {
      this.chasing.delete(p.sid);
      return false;
    }
    const next = stepToward(p, target, p.budget.take(want, now));
    const moved = next.x !== p.x || next.y !== p.y;
    p.x = next.x;
    p.y = next.y;
    if (p.x === p.tx && p.y === p.ty) {
      this.chasing.delete(p.sid);
    } else {
      this.chasing.add(p.sid);
      this.host.requestTick();
    }
    return moved;
  }

  private onEvent(p: Peer<C>, m: C2S, now: number): void {
    // 3번: 방(집)도 1인 자리(집 안 가구)는 좌석처럼 판정한다 → sit/stand는 받는다 (월드 자리 id는 onSit이 거절)
    if (!this.cfg.room && m.t === "use") return;
    if (this.cfg.room && (m.t === "emote" || m.t === "graveEvent" || m.t === "firework" || m.t === "megaphone")) return;
    switch (m.t) {
      case "sit":
        return this.onSit(p, m.seatId);
      case "stand":
        return this.onStand(p);
      case "warp":
        return this.onWarp(p, m, now);
      case "emote":
        if (now - p.lastEmoteAt < EMOTE_INTERVAL_MS) return;
        if (!this.once(`e:${p.sid}:${m.graveId}`, EMOTE_DEDUPE_MS, now)) return;
        p.lastEmoteAt = now;
        return this.broadcast(encodeEvent({ t: "emote", sid: p.sid, kind: m.kind, graveId: m.graveId }), p.sid);
      case "graveEvent":
        if (now - p.lastGraveEventAt < GRAVE_EVENT_INTERVAL_MS) return;
        if (!this.once(`g:${m.graveId}`, GRAVE_EVENT_INTERVAL_MS, now)) return;
        p.lastGraveEventAt = now;
        return this.broadcast(encodeEvent({ t: "graveEvent", sid: p.sid, kind: m.kind, graveId: m.graveId }), p.sid);
      case "look":
        if (now - p.lastLookAt < LOOK_INTERVAL_MS) return;
        p.lastLookAt = now;
        return this.verifyThenApply(p, "look", m.grant);
      case "firework":
        if (now - p.lastFireworkAt < FIREWORK_INTERVAL_MS) return;
        p.lastFireworkAt = now;
        return this.verifyThenApply(p, "firework", m.grant);
      case "sync":
        // 자가 복구: 클라이언트가 놓친 join/leave가 있어도 이걸로 맞춘다
        if (now - p.lastSyncAt < SYNC_INTERVAL_MS) return;
        p.lastSyncAt = now;
        return this.sendTo(p, { t: "peers", peers: this.othersOf(p), seats: Object.fromEntries(this.seats) });
      case "act":
        if (now - p.lastActAt < ACT_INTERVAL_MS) return;
        p.lastActAt = now;
        return this.broadcast(encodeEvent({ t: "act", sid: p.sid, kind: m.kind, x: p.x, y: p.y }));
      case "use":
        // 3번 집 안 가구 쓰기: 뜻은 클라이언트가 정한다 (피아노 음·불 켜기 …). 보낸 사람은 이미 화면에 반영했다
        if (now - (p.lastUseAt ?? -Infinity) < USE_INTERVAL_MS) return;
        p.lastUseAt = now;
        return this.broadcast(encodeEvent({ t: "use", sid: p.sid, u: m.u, a: m.a }), p.sid);
      case "emo":
        // 5번 이모티콘: 보낸 사람은 이미 화면에 띄웠다 → 나머지에게만
        if (now - (p.lastEmoAt ?? -Infinity) < EMO_INTERVAL_MS) return;
        p.lastEmoAt = now;
        return this.broadcast(encodeEvent({ t: "emo", sid: p.sid, id: m.id }), p.sid);
      case "ride":
        if (now - (p.lastRideAt ?? -Infinity) < RIDE_INTERVAL_MS) return;
        p.lastRideAt = now;
        return this.onRide(p, m.on);
      case "mood":
        if (now - (p.lastMoodAt ?? -Infinity) < MOOD_INTERVAL_MS) return;
        p.lastMoodAt = now;
        return this.onMood(p, m.m);
      case "say":
        if (now - p.lastSayAt < SAY_INTERVAL_MS) return;
        p.lastSayAt = now;
        return this.broadcast(encodeEvent({ t: "say", sid: p.sid, id: m.id }));
      case "goblin":
        return this.onGoblinClaim(p, m.id, now);
      case "megaphone":
        if (now - (p.lastMegaphoneAt ?? -Infinity) < MEGAPHONE_INTERVAL_MS) return;
        p.lastMegaphoneAt = now;
        return this.verifyThenApply(p, "megaphone", m.grant);
    }
  }

  /** 월드 채널은 묘지 맵 범위, 방은 크기를 모르므로 u16 범위만 */
  private inBounds(x: number, y: number): boolean {
    return this.cfg.room ? x >= 0 && x <= 0xffff && y >= 0 && y <= 0xffff : inServerBounds(x, y);
  }

  /** 증서 검증(HMAC, 비동기)은 연결당 간격을 통과한 뒤에만 한다 — 검증 CPU를 아끼려고. */
  private verifyThenApply(p: Peer<C>, kind: Grant["kind"], grant: string): void {
    const conn = p.conn;
    if (!conn) return;
    this.host.verifyGrant(grant).then(
      (g) => {
        if (g?.kind === kind) this.applyGrant(conn, g);
      },
      () => {},
    );
  }

  /** 검증된 증서를 반영한다. 다른 사람 앞으로 발급된 증서이거나 그 사이 연결이 바뀌었으면 무시 */
  applyGrant(conn: C, g: Grant): void {
    const sid = this.bySocket.get(conn);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p || g.visitorId !== p.visitorId) return;
    if (g.kind === "look") {
      p.look = g.look;
      // 46·25번: 새 웹이 낸 증서는 염색·몸 모양도 싣는다 (옛 증서엔 없으니 그대로 둔다)
      if (g.dye !== undefined) p.dye = hasDye(g.dye) ? g.dye : undefined;
      if (g.body !== undefined) p.body = g.body;
      this.save(p);
      this.host.liveChanged?.(true);
      const extra = { ...(g.dye !== undefined ? { dye: p.dye ?? {} } : {}), ...(g.body !== undefined ? { body: p.body } : {}) };
      this.broadcast(encodeEvent({ t: "look", sid: p.sid, look: p.look, ...extra }));
      // 타던 펫을 집에 두거나 타지 못하는 펫으로 바꿨으면 내린다
      if (p.ride && !ridePetOfLook(p.look)) this.clearRide(p);
      return;
    }
    if (g.kind === "megaphone") return this.applyMegaphone(g);
    if (g.kind !== "firework") return; // 고블린 증서는 실시간 서버가 내주기만 한다 (받지 않는다)
    if (!this.host.claimNonce(g.nonce, g.exp * 1000)) return; // 이미 쏜 폭죽
    this.broadcast(encodeEvent({ t: "firework", sid: p.sid, item: g.item, x: p.x, y: p.y }));
  }

  /**
   * 23번 확성기: 서명된 닉네임·문장을 그대로 이 채널 모두(보낸 사람 포함)에게 보낸다. nonce는 채널마다 한 번만.
   * scope=channel이면 증서의 채널이 이 채널이어야 하고, all이면 다른 열린 채널에도 전한다(호스트가 nonce로 중복을 막는다)
   */
  private applyMegaphone(g: Extract<Grant, { kind: "megaphone" }>): void {
    const ch = this.host.channelNo?.();
    if (g.scope === "channel" && ch !== undefined && ch !== g.ch) return;
    if (!this.host.claimNonce(`m:${g.nonce}`, g.exp * 1000)) return; // 이미 외친 확성기
    const data = encodeEvent({ t: "megaphone", id: g.nonce, name: g.name, text: g.text, scope: g.scope, ch: g.ch, at: Date.now() });
    this.broadcast(data);
    if (g.scope === "all") this.host.relayMegaphone?.(g.nonce, g.exp * 1000, data);
  }

  /** 다른 채널에서 전해 온 모든 채널 확성기 (RPC). 같은 nonce는 한 번만 방송한다. 방은 받지 않는다 */
  relayedMegaphone(nonce: string, until: number, data: string): boolean {
    if (this.cfg.room || !this.host.claimNonce(`m:${nonce}`, until)) return false;
    this.broadcast(data);
    return true;
  }

  /** 채널 단위 중복 제거: 같은 키는 windowMs에 한 번만 true */
  private once(key: string, windowMs: number, now: number): boolean {
    const last = this.recentEvents.get(key);
    if (last !== undefined && now - last < windowMs) return false;
    this.recentEvents.set(key, now);
    // 키는 레이트리밋으로 묶여 있지만, 오래된 것은 가끔 치워 둔다
    if (this.recentEvents.size > 256) {
      for (const [k, t] of this.recentEvents) if (now - t >= GRAVE_EVENT_INTERVAL_MS) this.recentEvents.delete(k);
    }
    return true;
  }

  // ── 좌석 (서버가 판정) ──

  /**
   * 1인 자리 점유 (의자·벤치 좌석과 나무·그네 같은 소품 자리 공통, world.ts seatSlot).
   * 한 자리에는 한 명: 이미 누가 있거나 멀면 seatDenied.
   */
  private onSit(p: Peer<C>, seatId: string): void {
    const found = seatSlot(seatId);
    // 3번: 집 안 가구 자리는 방(집)에서만, 월드 자리(의자·나무 …)는 월드 채널에서만
    const seat = found && isIndoorSpot(found.kind) === !!this.cfg.room ? found : undefined;
    const holder = this.seats.get(seatId);
    if (seat && holder === p.sid) return this.sendTo(p, { t: "seat", seatId, sid: p.sid }); // 재요청: 이미 내 자리
    // 긴 벤치에서 앉은 채 옆자리로: 같은 가구의 다른 좌석이면 거리와 상관없이 옮겨 앉는다
    const old = p.seatId ? seatSlot(p.seatId) : undefined;
    const slide = !!seat && !!old && old.furnitureId !== null && old.furnitureId === seat.furnitureId;
    // 위치는 클라이언트가 마지막으로 보고한 지점으로 잰다 (서버 위치가 속도 예산 때문에 잠깐 뒤처져 있어도 거절하지 않게)
    const at = { x: p.tx, y: p.ty };
    // 2인승 조각배(F13): 같은 배의 다른 자리에 앉은 사람 곁이면 나루터(앵커)에서 멀어도 같이 탄다 — 배가 물가에 와 있다
    const beside = !!seat && !slide && holder === undefined && this.besideCompanion(seat, at, p.sid);
    if (!seat || holder !== undefined || (!slide && !beside && dist(seat, at) > (seat.radius ?? SEAT_SERVER_RADIUS))) {
      return this.sendTo(p, { t: "seatDenied", seatId });
    }
    this.occupy(p, seat, slide || beside);
  }

  /** 움직이는 자리(조각배)에서: 같은 배(furnitureId)의 다른 자리에 앉은 사람이 at 가까이 있는지 */
  private besideCompanion(seat: SeatSlot, at: Point, self: number): boolean {
    if (!seat.mobile || seat.furnitureId === null) return false;
    const r = seat.radius ?? SEAT_SERVER_RADIUS;
    for (const [id, sid] of this.seats) {
      if (sid === self || id === seat.id) continue;
      if (seatSlot(id)?.furnitureId !== seat.furnitureId) continue;
      const q = this.peers.get(sid);
      if (q && dist(q, at) <= r) return true;
    }
    return false;
  }

  /** MOVE로 들어온 나무·그네 상태의 자리 잡기 (이전 클라이언트용). 잡았으면(이미 내 자리 포함) true. 거절 알림은 보내지 않는다 */
  private claimSpot(p: Peer<C>, seatId: string): boolean {
    const seat = seatSlot(seatId);
    if (!seat) return false;
    const holder = this.seats.get(seatId);
    if (holder === p.sid) return true;
    if (holder !== undefined || dist(seat, { x: p.tx, y: p.ty }) > (seat.radius ?? SEAT_SERVER_RADIUS)) return false;
    this.occupy(p, seat);
    return true;
  }

  /**
   * slide = 같은 배·벤치 안에서 옮겨 앉기, 또는 물가에서 같은 배에 탄 사람 곁으로 타기(F13).
   * 움직이는 자리(조각배)면 위치는 그대로 둔다 (배가 물 위에 있다 — 클라이언트가 다음 MOVE로 알려 준다)
   */
  private occupy(p: Peer<C>, seat: SeatSlot, slide = false): void {
    const seatId = seat.id;
    // 한 사람당 한 자리. DO는 한 번에 한 이벤트만 처리하므로 점유와 해제 사이에 다른 요청이 끼어들 수 없다
    // (같은 빈 자리로 두 명이 동시에 옮기면 먼저 처리된 한 명만 앉고, 다른 한 명은 seatDenied).
    // 새 자리 점유를 먼저 알리고 옛 자리 해제를 바로 이어 보낸다 — 클라이언트에는 같은 틱에 함께 도착한다.
    const prevSeat = p.seatId;
    if (prevSeat) {
      this.seats.delete(prevSeat);
      p.seatId = null;
    }
    this.seats.set(seatId, p.sid);
    p.seatId = seatId;
    if (!(seat.mobile && slide)) {
      p.x = p.tx = seat.x;
      p.y = p.ty = seat.y;
    }
    p.state = seat.state;
    p.dir = seat.facing;
    // 벤치 상태는 의자·벤치에서만 (벤치 안에서 옆자리로 옮기면 그대로, 나무·그네 같은 자리로 옮기면 풀린다)
    if (p.mood && seat.state !== STATE.sitChair) this.clearMood(p);
    // 앉기·낚시·놀이기구·배 — 어떤 자리든 차지하면 타던 펫에서 내린다
    this.clearRide(p);
    this.chasing.delete(p.sid);
    this.markDirty(p);
    this.broadcast(encodeEvent({ t: "seat", seatId, sid: p.sid }));
    if (prevSeat) this.broadcast(encodeEvent({ t: "seat", seatId: prevSeat, sid: null }));
    this.host.liveChanged?.(true);
  }

  private onStand(p: Peer<C>): void {
    if (!p.seatId) return;
    const held = seatSlot(p.seatId);
    this.releaseSeat(p);
    if (p.state === STATE.sitChair || (held && p.state === held.state)) p.state = STATE.idle;
    this.markDirty(p);
  }

  /**
   * 24번 벤치 상태: 의자·벤치(sitChair 자리)에 앉아 있을 때만 받는다. 빈 문자열이면 푼다.
   * 같은 채널 모두(보낸 사람 포함 — 서버가 받아들였다는 확인)에게 알리고, 늦게 온 사람은 PeerInfo.mood로 받는다
   */
  private onMood(p: Peer<C>, m: string): void {
    if (m === "") return this.clearMood(p);
    const seat = p.seatId ? seatSlot(p.seatId) : undefined;
    if (!isSeatMood(m) || !seat || seat.state !== STATE.sitChair || p.mood === m) return;
    p.mood = m;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcast(encodeEvent({ t: "mood", sid: p.sid, m }));
  }

  /**
   * 타는 펫 올라타기(on)·내리기. 월드 채널에서, 착용한 펫이 타는 펫이고 자리에 앉아 있지 않으며 물 밖일 때만 켠다.
   * 같은 채널 모두(보낸 사람 포함 — 서버가 받아들였다는 확인)에게 알리고, 늦게 온 사람은 PeerInfo.ride로 받는다
   */
  private onRide(p: Peer<C>, on: boolean): void {
    if (!on) return this.clearRide(p);
    if (this.cfg.room || p.seatId || !ridePetOfLook(p.look)) return;
    if (p.state === STATE.swim || p.state === STATE.dive) return;
    // 이미 타고 있다 (재접속 복원·다시 보낸 요청): 보낸 사람에게만 다시 확인해 준다
    if (p.ride) return this.sendTo(p, { t: "ride", sid: p.sid, on: true });
    p.ride = true;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcast(encodeEvent({ t: "ride", sid: p.sid, on: true }));
  }

  /** 타는 펫에서 내리고 모두에게 알린다 (타고 있지 않으면 아무것도 안 한다) */
  private clearRide(p: Peer<C>): void {
    if (!p.ride) return;
    p.ride = undefined;
    p.saved = false;
    this.host.liveChanged?.(true);
    this.broadcast(encodeEvent({ t: "ride", sid: p.sid, on: false }));
  }

  /** 벤치 상태를 풀고 모두에게 알린다 (없으면 아무것도 안 한다) */
  private clearMood(p: Peer<C>): void {
    if (!p.mood) return;
    p.mood = undefined;
    p.saved = false;
    this.host.liveChanged?.(true);
    this.broadcast(encodeEvent({ t: "mood", sid: p.sid, m: "" }));
  }

  /** 좌석을 비우고 모두에게 알린다. 상태(state)는 호출한 쪽이 정한다. 벤치 상태도 함께 풀린다 */
  private releaseSeat(p: Peer<C>): void {
    const seatId = p.seatId;
    if (!seatId) return;
    this.seats.delete(seatId);
    p.seatId = null;
    p.saved = false;
    this.clearMood(p);
    this.broadcast(encodeEvent({ t: "seat", seatId, sid: null }));
    this.host.liveChanged?.(true);
  }

  /** 랭킹 클릭 등 의도된 순간이동: 속도 검증 없이 범위만 본다. 쿨다운 안의 요청은 무시. */
  private onWarp(p: Peer<C>, to: Point, now: number): void {
    if (!this.inBounds(to.x, to.y) || now - p.lastWarpAt < SERVER_WARP_COOLDOWN_MS) return;
    p.lastWarpAt = now;
    if (p.seatId) this.releaseSeat(p);
    if (p.state === STATE.sitChair || p.state === STATE.sitGround || spotKindOfState(p.state)) p.state = STATE.idle;
    p.x = p.tx = to.x;
    p.y = p.ty = to.y;
    this.chasing.delete(p.sid);
    this.markDirty(p); // 96px 넘게 떨어지면 클라이언트가 보간 없이 스냅한다
  }

  // ── 22번 황금 고블린(보너스 요정) ── (판정은 goblin.ts GoblinCore, 여기서는 알림·증서만 잇는다)

  /** 고블린 기능: 월드 채널이고 증서를 서명할 수 있을 때만 */
  private get goblinOn(): boolean {
    return !this.cfg.room && !!this.host.signGrant;
  }

  /** 저장해 둔 고블린 상태 (DO 생성자) */
  restoreGoblin(raw: unknown): void {
    if (this.goblinOn) this.goblin.restore(raw);
  }

  /** DO가 고블린 때문에 깨어나야 하는 시각 (없으면 null) */
  goblinDue(): number | null {
    return this.goblinOn ? this.goblin.due(this.online) : null;
  }

  /** 시간이 흘렀다: 사라짐·등장을 알린다. 메시지·입장·알람마다 부른다 (비교 몇 번뿐) */
  goblinCheck(now: number): void {
    if (!this.goblinOn) return;
    const r = this.goblin.check(now, this.online);
    if (r.gone) this.broadcast(encodeEvent({ t: "goblinGone", id: r.gone }));
    if (r.spawned) this.broadcast(encodeEvent({ t: "goblin", g: r.spawned }));
    if (r.changed) this.host.goblinChanged?.(this.goblin.state);
  }

  /** 개발용 훅: 지금 바로 나오게 한다 (이미 나와 있으면 그대로). 접속자가 없으면 null */
  forceGoblin(now: number): GoblinState["cur"] {
    if (!this.goblinOn || this.online === 0) return null;
    this.goblinCheck(now);
    if (!this.goblin.visible(now)) {
      this.broadcast(encodeEvent({ t: "goblin", g: this.goblin.spawn(now) }));
      this.host.goblinChanged?.(this.goblin.state);
    }
    return this.goblin.state.cur;
  }

  /** 잡기 요청: 가장 먼저 닿은 한 명만. 위치는 서버가 아는 값(마지막 보고·서버 추적 위치 중 가까운 쪽)으로 잰다 */
  private onGoblinClaim(p: Peer<C>, id: string, now: number): void {
    if (!this.goblinOn || !p.conn) return;
    this.goblinCheck(now);
    const points = this.goblin.claim(id, p.visitorId, [{ x: p.tx, y: p.ty }, { x: p.x, y: p.y }], now);
    if (points === null) return;
    this.host.goblinChanged?.(this.goblin.state);
    this.broadcast(encodeEvent({ t: "goblinCaught", id, sid: p.sid, name: p.name, points }));
    const conn = p.conn;
    const exp = Math.floor(now / 1000) + GOBLIN_GRANT_TTL_SEC;
    this.host.signGrant!({ kind: "goblin", visitorId: p.visitorId, points, nonce: id, exp }).then(
      (grant) => {
        if (!grant) return;
        this.goblin.setGrant(id, grant);
        this.host.goblinChanged?.(this.goblin.state);
        // 그 사이 다시 접속했으면 새 소켓으로 (welcome이 grantFor로 한 번 더 보내기도 한다 — 웹이 한 번만 지급)
        const cur = this.peers.get(this.byVisitor.get(p.visitorId) ?? -1);
        const to = cur?.conn ?? conn;
        this.host.send(to, encodeEvent({ t: "goblinGrant", id, grant, points }));
      },
      () => {},
    );
  }

  // ── 틱 ──

  /**
   * 100ms마다 호출된다. 바뀐 사람만 담은 델타 SNAPSHOT 1개를 모두에게 보낸다.
   * 보낼 것이 없으면 false → 호출한 쪽이 루프를 멈춘다(그래야 DO가 hibernate된다).
   */
  tick(now: number): boolean {
    for (const sid of this.chasing) {
      const p = this.peers.get(sid);
      if (p && this.chase(p, now)) this.markDirty(p);
    }
    if (this.dirty.size > 0) {
      const entries: PeerState[] = [];
      for (const sid of this.dirty) {
        const p = this.peers.get(sid);
        if (p) entries.push(this.state(p));
      }
      this.dirty.clear();
      // 엔트리 63개(512바이트)를 넘으면 나눠 보낸다. 같은 tick 번호를 쓴다.
      for (let i = 0; i < entries.length; i += SNAPSHOT_MAX_ENTRIES) {
        this.broadcast(encodeSnapshot(this.tickNo, entries.slice(i, i + SNAPSHOT_MAX_ENTRIES)));
      }
      this.tickNo = (this.tickNo + 1) & 0xffff;
      return true;
    }
    if (this.chasing.size > 0) return true;
    // 루프가 멈춘다 = 곧 hibernate될 수 있다. MOVE마다 하지 않고 이때 한 번 attachment를 갱신한다.
    for (const p of this.peers.values()) if (!p.saved) this.save(p);
    return false;
  }

  // ── 내부 ──

  private kick(p: Peer<C>, code: number, reason: string): void {
    if (p.conn) {
      this.host.persist(p.conn, null);
      this.host.close(p.conn, code, reason);
    }
    this.remove(p);
  }

  /** 퇴장: 좌석 해제 → leave 브로드캐스트 → 인원 보고 */
  private remove(p: Peer<C>): void {
    if (p.conn) {
      this.bySocket.delete(p.conn);
      p.conn = null;
    }
    if (p.seatId) this.releaseSeat(p);
    this.peers.delete(p.sid);
    this.byVisitor.delete(p.visitorId);
    this.dirty.delete(p.sid);
    this.chasing.delete(p.sid);
    this.broadcast(encodeEvent({ t: "leave", sid: p.sid }));
    this.host.countChanged(this.peers.size);
    this.host.visitorLeft(p.visitorId);
    this.host.liveChanged?.(true);
  }

  private markDirty(p: Peer<C>): void {
    this.dirty.add(p.sid);
    p.saved = false;
    this.host.requestTick();
    this.host.liveChanged?.(false);
  }

  private save(p: Peer<C>): void {
    if (p.conn) this.host.persist(p.conn, this.record(p));
    p.saved = true;
  }

  private adopt(rec: PeerRecord, conn: C | null, until: number, now: number): boolean {
    if (this.peers.has(rec.sid) || this.byVisitor.has(rec.visitorId)) return false;
    const p = this.adoptNew(rec, conn, now);
    p.until = until;
    if (p.seatId) {
      if (!seatSlot(p.seatId) || this.seats.has(p.seatId)) p.seatId = null;
      else this.seats.set(p.seatId, p.sid);
    }
    if (!p.seatId) p.mood = undefined;
    return true;
  }

  private adoptNew(rec: PeerRecord, conn: C | null, now: number): Peer<C> {
    const p: Peer<C> = {
      ...this.record(rec),
      conn,
      until: 0,
      tx: rec.x,
      ty: rec.y,
      rate: new RateLimiter(),
      budget: new MoveBudget(now),
      lastWarpAt: -Infinity,
      lastEmoteAt: -Infinity,
      lastGraveEventAt: -Infinity,
      lastLookAt: -Infinity,
      lastFireworkAt: -Infinity,
      lastSyncAt: -Infinity,
      lastActAt: -Infinity,
      lastSayAt: -Infinity,
      lastSeenAt: now,
      saved: true,
    };
    this.peers.set(p.sid, p);
    this.byVisitor.set(p.visitorId, p.sid);
    if (conn) this.bySocket.set(conn, p.sid);
    return p;
  }

  private resetConnState(p: Peer<C>, now: number): void {
    p.rate = new RateLimiter();
    p.budget = new MoveBudget(now);
    p.lastWarpAt = -Infinity;
    p.lastEmoteAt = -Infinity;
    p.lastGraveEventAt = -Infinity;
    p.lastLookAt = -Infinity;
    p.lastFireworkAt = -Infinity;
    p.lastSyncAt = -Infinity;
    p.lastActAt = -Infinity;
    p.lastSayAt = -Infinity;
    p.lastSeenAt = now;
  }

  private sendTo(p: Peer<C>, msg: S2C): void {
    if (p.conn) this.host.send(p.conn, encodeEvent(msg));
  }

  /** 접속 중인 모두에게 (except 제외). 유예 중인 피어는 소켓이 없으므로 건너뛴다. */
  private broadcast(data: string | ArrayBuffer, except?: number): void {
    for (const p of this.peers.values()) if (p.conn && p.sid !== except) this.host.send(p.conn, data);
  }

  private state(p: Peer<C>): PeerState {
    return { sid: p.sid, x: p.x, y: p.y, state: p.state, dir: p.dir };
  }

  private info(p: Peer<C>): PeerInfo {
    return {
      ...this.state(p),
      name: p.name,
      color: p.color,
      look: p.look,
      body: p.body,
      ...(hasDye(p.dye) ? { dye: p.dye } : {}),
      ...(p.mood ? { mood: p.mood } : {}),
      ...(p.staff ? { staff: true as const } : {}),
      ...(p.ride ? { ride: true as const } : {}),
    };
  }

  /** 저장 형태로 복사. 이전 버전 attachment·예약에는 look/body/joinedAt이 없을 수 있어 기본값을 채운다 */
  private record(r: PeerRecord): PeerRecord {
    const { sid, visitorId, name, color, x, y, state, dir, seatId } = r;
    const look = Array.isArray(r.look) ? r.look : [];
    // 24번 벤치 상태는 좌석이 있을 때만 이어 간다
    const mood = seatId && isSeatMood(r.mood) ? { mood: r.mood } : {};
    // 타는 펫은 자리에 앉아 있지 않고 타는 펫을 입고 있을 때만 이어 간다
    const ride = r.ride === true && !seatId && ridePetOfLook(look) ? { ride: true as const } : {};
    return { sid, visitorId, name, color, x, y, state, dir, seatId, look, body: r.body ?? "hood", ...(hasDye(r.dye) ? { dye: r.dye } : {}), ...mood, ...ride, ...(r.staff === true ? { staff: true as const } : {}), joinedAt: r.joinedAt ?? 0 };
  }
}
