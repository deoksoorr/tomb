import {
  CAMP_FIRE_USE_RE,
  campFireUseId,
  type HomesZone,
  STAFF_TP_GAP_MS,
  STAFF_TP_NEAR_PX,
  newLookBucket,
  takeLookToken,
  type GoblinInfo,
  type LookBucket,
  type StaffTpDenyWhy,
  fireworkShowMs,
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
  maskChat,
  matchWhisperTarget,
  nameKey,
  WHO_ON_INTERVAL_MS,
  newChatBucket,
  takeChatToken,
  isSquirrelRainChat,
  squirrelRainReady,
  squirrelRainLeftMs,
  type ChatBucket,
  type ChatPlace,
  inMapBounds,
  isAwayMap,
  awayTag,
  mapAllowed,
  mapOf,
  mapHasSpotState,
  mapSpawn,
  parseC2S,
  seatSlotIn,
  spotKindOfState,
  spotSeatId,
  isIndoorSpot,
  isSeatMood,
  ridePetOfLook,
  lookWithPetFallback,
  boatSeatById,
  clampToArea,
  balloonBoarding,
  balloonSeatById,
  BALLOON_BOARD_GRACE_MS,
  USE_INTERVAL_MS,
  HUNT_ACT_INTERVAL_MS,
  hasDye,
  sameDye,
  staffGateBody,
  staffGateLook,
  mgrGateLook,
  isSproutUntil,
  sproutOn,
  isChampValue,
  isDexBadge,
  isAwayPlace,
  isBbqEffect,
  isDrunkState,
  bbqBig,
  drunkNoSea,
  bbqItem,
  isRideSpotKind,
  type DrunkState,
  BBQ_INTERVAL_MS,
  SNOWMAN_BUILD_INTERVAL_MS,
  SNOW_ACT_INTERVAL_MS,
  SNOW_HOLD_INTERVAL_MS,
  parseSnowHold,
  SNOWBALL_HIT_INTERVAL_MS,
  SNOWBALL_HIT_SLACK,
  SNOWBALL_HIT_WINDOW_MS,
  SNOWBALL_KEEP,
  SNOWBALL_PER_MINUTE,
  SNOWBALL_RANGE_MAX,
  SNOWBALL_SERVER_INTERVAL_MS,
  SNOWBALL_START_SLACK,
  snowFightMap,
  snowFightState,
  snowSegDist,
  type SnowBall,
  type SnowHold,
  type SnowAct,
  type SnowmanDenyWhy,
  type BbqEffect,
  type AvatarDye,
  type AwayPlace,
  type C2S,
  type MapId,
  type AwayMapId,
  type DirId,
  type Grant,
  type MoveMsg,
  type PeerInfo,
  type PeerState,
  type SeatSlot,
  type S2C,
  type StateId,
  nameStyleOfLook,
  campRaftAt,
  campRaftExit,
  campRaftOfSpot,
  type RaftOutWhy,
} from "@tomb/protocol";
import { ChatRecent, type RecentChat } from "./chatRecent";
import { MoveBudget, RateLimiter, allocSid, dist, homesEvent, stepToward, type Point } from "./logic";
import { GoblinCore, type GoblinState } from "./goblin";
import { SnowStackYard, SnowmanYard } from "./snowmen";
import { CAMP_FIRE_INTERVAL_MS, CampFires, campFireLotFor } from "./campFire";
import { HomesCoalescer } from "./homesRelay";
import { RaftBoard } from "./rafts";

// 채널 하나의 상태 머신. ChannelDO는 소켓·스토리지·타이머만 이어 주고 판정은 전부 여기서 동기적으로 한다.
// Workers API를 쓰지 않으므로 Node에서 그대로 단위 테스트하고(channel.test.ts) 부하 테스트의 틱 벤치마크에도 쓴다.
// 접속자 위치·상태·좌석은 메모리에 두고, 영구 저장은 재연결 유예 예약과 "접속자 스냅샷"(liveRecords), 맵별 최근 채팅(chatSnapshot)이다.
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
  /** 4번 배 위 낚시: 낚싯대를 드리우고 있다 (조각배 자리에 앉아 있는 동안만) */
  rod?: true;
  /** 11/15 캠핑장 바베큐를 먹고 커져 있다 (u = 끝나는 시각). 늦게 온 사람도 PeerInfo로 본다. 끝난 기록은 그냥 둔다 (클라이언트가 시각으로 거른다) */
  bbq?: BbqEffect;
  /** 11/15 캠핑 커피·꿀호떡: 빨라진 걸음 (끝나는 시각) */
  spd?: BbqEffect;
  /** 11/15 맥주·소주·막걸리: 취기 (at 무렵 lv단계) */
  drunk?: DrunkState;
  /** 실내(상점·집·사냥터 등 하위 장면)에 들어가 있다 → 다른 사람 화면에서 숨긴다 (월드 채널만). 재접속 유예 동안에도 이어 간다 */
  away?: true;
  /** 친구: 실내에 있으면 어디인지 (집 안·사냥터 …). 다른 사람 화면에는 보내지 않고 친구 위치 조회(roster)에만 쓴다 */
  place?: AwayPlace;
  /** 친구: 집 안이면 그 집 id (친구가 따라 들어간다). 위치 조회에만 쓴다 */
  house?: string;
  /** 31번 운영자 계정 (입장 토큰에 Vercel이 넣은 것만) */
  staff?: true;
  /** 도감 100% 배지 (JoinClaims.dex) */
  dex?: number;
  /** 지난주 랭킹 1위 비트 (JoinClaims.champ, 착용 증서로 바뀔 수 있다) */
  champ?: number;
  /** 11/16 매니저 (JoinClaims.mgr, 착용 증서로 바뀔 수 있다) */
  mgr?: true;
  /** 11/22 새싹 표시가 끝나는 시각 (epoch ms, 입장 때 Worker가 토큰의 남은 분으로 정한다). 지나도 그대로 두고 화면이 시각으로 거른다 */
  nb?: number;
  /** 이 연결로 자리를 잡은 시각. 로비의 채널 간 중복 정리(kick)가 더 새 연결을 내보내지 않게 비교한다 */
  joinedAt: number;
  /**
   * 11/15 지금 있는 맵 (캠핑장이면 "camp", 11/16 바닷가면 "sea", 없으면 마을 — 옛 attachment·예약·스냅샷도 마을).
   * 같은 채널 안에서도 위치·말풍선·몸짓은 같은 맵 사람끼리만 주고받는다
   */
  map?: AwayMapId;
  /** 11/15 입장 토큰에 캠핑장 허락(camp)이 있었다 → map 요청을 받아 준다 (재접속 때 새 토큰 값으로 바뀐다) */
  camp?: true;
  /** 11/16 입장 토큰에 바닷가 허락(sea)이 있었다 */
  sea?: true;
  /** 11/18 캠핑장에서 들고 있는 눈덩이 (늦게 온 사람도 PeerInfo로 본다). 캠핑장을 떠나거나 다시 붙으면 지운다 */
  snow?: SnowHold;
  /** 11/27 입장 토큰에 좌대 막기 켬(rafts)이 있었다 → 입장권 없이 좌대 마루에 못 올라간다 (웹이 먼저 배포돼 켜야 막는다) */
  rf?: true;
};

/** 재연결 유예 예약. until(ms)까지 sid·좌석·위치를 지킨다 */
/** code = 11/26 끊길 때 받은 닫힘 코드 (유예 중에 DO가 잠들었다 깨어나도 접속 기록의 「창 닫음」·「연결 끊김」을 잃지 않게) */
export type Reservation = PeerRecord & { until: number; code?: number };

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
  /** 도감 100% 배지 (JoinClaims.dex) */
  dex?: number;
  /** 지난주 랭킹 1위 비트 (JoinClaims.champ, 착용 증서로 바뀔 수 있다) */
  champ?: number;
  /** 11/16 매니저 (JoinClaims.mgr, 착용 증서로 바뀔 수 있다) */
  mgr?: true;
  /** 11/22 새싹 표시가 끝나는 시각 (epoch ms, Worker가 JoinClaims.nb 남은 분으로 계산) */
  nb?: number;
  /** 11/15 캠핑장 허락 (JoinClaims.camp) */
  camp?: true;
  /** 11/16 바닷가 허락 (JoinClaims.sea) */
  sea?: true;
  /** 11/15 처음 들어갈 맵 (URL ?m=camp·?m=sea, 허락이 있을 때만 Worker가 넣는다). 없으면 마을 */
  map?: AwayMapId;
  /** 11/27 좌대 막기 켬 (JoinClaims.rafts) */
  rafts?: true;
  /** 11/27 이 채널 좌대 입장권 (JoinClaims.raft) */
  raft?: { n: number; u: number };
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
  /** code = 11/26 마지막으로 본 닫힘 코드 (접속 기록의 나감 종류, 없으면 모름) */
  visitorLeft(visitorId: string, code?: number): void;
  /** 친구 들고 남: 연결이 끊겨 재연결 유예에 들어갔다 (없으면 알리지 않는다) */
  visitorDropped?(visitorId: string): void;
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
  // ── 최근 채팅 저장 (월드 채널만 — 방·테스트는 없으면 메모리에만) ──
  /** 저장소에 남긴 그 맵의 최근 채팅 (없으면 null). 그 맵 기록을 처음 쓸 때 한 번 읽는다 */
  loadChats?(map: MapId): unknown;
  /** 그 맵의 최근 채팅이 바뀌었다 → 모아서 chatSnapshot()을 저장한다 */
  chatsChanged?(map: MapId): void;
  /** 11/17 캠핑장 눈사람 목록이 바뀌었다 (세움·넘쳐 녹음) → 저장 (DO가 잠들었다 깨면 restoreSnowmen으로 되살린다) */
  snowmenChanged?(list: unknown): void;
  /** 11/18 쌓는 중인 덩이 목록이 바뀌었다 (내려놓기·올리기·다시 들기·사라짐) → 저장 (깨면 restoreSnowStacks) */
  snowStacksChanged?(list: unknown): void;
  /** 11/26 구역별 마지막 집 바뀜 v가 바뀌었다 → 저장 (깨면 restoreHomes — 늦게 들어온 사람에게 입장 때 보낸다) */
  homesChanged?(snap: unknown): void;
  /** 11/27 좌대 주인 표가 바뀌었다 → 저장하고 알람을 다시 잡는다 (끝나는 시각에 내려보내기) */
  raftsChanged?(snap: unknown): void;
}

/**
 * room = 방(마을·집·사냥터) 모드. 같은 Channel DO 코드로 돌리되:
 * - 위치·상태·look·body·act·say·sync·warp만 다룬다. 좌석(sit/stand)·graveEvent·emote·firework는 무시
 * - 방 크기를 모르므로 좌표는 u16 범위만 본다(MOVE 형식이 이미 보장)
 * - 로비 보고·대기열·채널 간 중복 정리는 DO(호스트) 쪽에서 하지 않는다
 */
export type ChannelConfig = {
  capacity: number;
  graceMs: number;
  room?: boolean;
  /** 11/13 사냥터 방("hunt:…"): 공격·스킬 동작(hunt)과 자리 비움(away)을 같은 방 사람에게 중계한다. 마을·집 방은 받지 않는다 */
  hunt?: boolean;
};

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
// look 증서: 11/22부터 연결당 토큰 버킷 (protocol lookQueue.ts — LOOK_BURST개, LOOK_REFILL_MS마다 하나). 예전 10초 간격은 없앴다
/** firework 증서 연결당 최소 간격 */
export const FIREWORK_INTERVAL_MS = 3_000;
/**
 * 11/20 광역 불꽃쇼는 맵마다 한 번에 하나. 돌고 있으면 끝난 뒤로 미뤄(w) 보내되, 이만큼 넘게 기다려야 하면(이미 하나가 기다리는 중) 거절한다.
 * 클라이언트가 먼저 막으니(firework:show) 여기 걸리는 건 거의 동시에 쏜 경우뿐
 */
export const FIREWORK_SHOW_QUEUE_MS = 40_000;
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
/** 배 위 낚싯대 드리우기·거두기(rod) 연결당 최소 간격 */
export const ROD_INTERVAL_MS = 300;
/** 실내 들어가기·나오기(away) 연결당 최소 간격 (상점을 바로 나왔다 들어가도 마지막 상태는 다음 welcome·sync로 맞는다) */
export const AWAY_INTERVAL_MS = 150;
/** 24번 벤치 상태(mood) 연결당 최소 간격 */
export const MOOD_INTERVAL_MS = 800;
/** 11/15 맵 옮기기(버스) 연결당 최소 간격 */
export const MAP_INTERVAL_MS = 1_000;
/** 캠핑장·바닷가 좌석의 내부 키 접두어 (좌석표는 채널 하나라 좌표로 만든 소품 자리 id가 여러 맵에서 겹칠 수 있다). 밖으로는 원래 id */
const SEAT_KEY_PREFIX: Record<AwayMapId, string> = { camp: "@c:", sea: "@s:" };
/** 이 사람이 있는 맵 */
const mapOfPeer = (p: { map?: AwayMapId }): MapId => mapOf(p.map);
/** 11/26 고블린 등장 알림: 마을은 옛 모양(goblin — 옛 클라이언트도 그린다), 바닷가·캠핑장은 goblinMap (옛 클라이언트는 모르는 t라 버린다) */
const goblinSpawnEvent = (g: GoblinInfo): string => encodeEvent(g.m ? { t: "goblinMap", g } : { t: "goblin", g });
/** 11/17 월드 채널에서 사냥터에 들어가 있는 사람(away + 장소 hunt)은 실내여도 채널 채팅을 쓴다 */
const huntChatOk = (room: boolean | undefined, p: { away?: true; place?: AwayPlace }): boolean => !room && p.away === true && p.place === "hunt";
/** 맵 + 와이어 좌석 id → 좌석표 키 */
const seatKey = (map: MapId, id: string): string => (map === "village" ? id : SEAT_KEY_PREFIX[map] + id);
/** 좌석표 키 → 그 맵과 와이어 id */
const seatKeyMap = (key: string): { map: MapId; id: string } => {
  for (const m of ["camp", "sea"] as const) if (key.startsWith(SEAT_KEY_PREFIX[m])) return { map: m, id: key.slice(SEAT_KEY_PREFIX[m].length) };
  return { map: "village", id: key };
};
/** 저장·전송용 맵 표시 (마을이면 없음) */
const mapField = (map: MapId): { map?: AwayMapId } => (map === "village" ? {} : { map });

/** warp 서버 쿨다운. 클라이언트(WARP_COOLDOWN_MS 1초)보다 짧게 둬서 네트워크 지터로 정상 요청이 버려지지 않게 한다 */
export const SERVER_WARP_COOLDOWN_MS = 800;
/** 재접속 반복 제한: 이 시간 안에 REJOIN_MAX번까지만 다시 붙는다 (새로고침·끊김 재시도는 넉넉히 통과) */
export const REJOIN_WINDOW_MS = 10_000;
export const REJOIN_MAX = 6;
/**
 * 11/18 보안: 정상 종료(1000)로 나갔다 새로 들어와도 채팅 버킷·쿨다운·재접속 기록이 처음으로 돌아가지 않게, 나간 사람의
 * 연결 단위 기록을 이 시간 동안 DO 메모리에 남겨 새 입장에 이어 붙인다 (계정 = visitorId 기준. 저장소에는 쓰지 않는다)
 */
export const DEPART_MEMO_MS = 60_000;
/** 11/18 보안: 캠핑장 눈덩이 놓기·올리기·다시 들기를 한 사람이 1분에 이만큼까지 (넘치면 "wait" — 반복 저장·방송 남용 방지) */
export const SNOW_ACTS_PER_MINUTE = 30;
/** 11/18 보안: 앉기 거리를 잴 때 클라이언트가 보고한 목표 지점(tx,ty)을 인정하는 서버 위치와의 거리 (고블린 잡기와 같다) */
export const SEAT_TARGET_SLACK = 64;
/** 11/18 보안: 앉으면서 서버 위치가 이만큼 넘게 옮겨지면 순간이동으로 친다 (고블린 2초 제한) */
export const SEAT_JUMP_PX = 24;
/** 고블린 잡기: 순간이동 뒤 이만큼은 잡지 못한다 */
export const GOBLIN_AFTER_TELEPORT_MS = 2000;
/** 고블린 잡기: 클라이언트 목표 지점(tx,ty)을 인정하는 서버 위치와의 거리 (달리기 0.5초 남짓) */
export const GOBLIN_TARGET_SLACK = 64;
/** 입장·복귀 좌표가 다른 사람이 앉은 좌석 앵커에서 이 거리 안이면 그 좌석 앞(내려설 자리)으로 옮긴다 — 한 자리에 한 명 */
export const SEAT_CLEAR_RADIUS = 6;
/** 좌석 앞 내려설 자리 (클라이언트 standPoint의 STAND_OFFSET_Y와 같다) */
export const SEAT_STAND_DY = 9;

type Peer<C> = PeerRecord & {
  /** null = 연결이 끊겨 재연결 유예 중. 다른 사람에게는 멈춘 아바타로 계속 보인다 */
  conn: C | null;
  /** 11/26 접속 기록: 마지막으로 본 닫힘 코드 (끊김·내보냄). 최종 퇴장 때 나감 종류로 로비에 넘긴다 */
  closeCode?: number;
  until: number;
  /** 클라이언트가 마지막으로 보고한 위치. 서버 위치(x,y)는 속도 예산 안에서 이 지점을 따라간다 */
  tx: number;
  ty: number;
  // 연결 단위 일시 상태 — hibernation 뒤 초기화돼도 무방하다
  rate: RateLimiter;
  budget: MoveBudget;
  lastWarpAt: number;
  /**
   * 11/18 보안: 고블린 잡기만 보는 「순간이동한 시각」 — warp 말고도 입장 스폰·재접속 위치 옮기기·좌석으로 옮겨 앉기를 센다
   * (lastWarpAt은 클라이언트 warp 쿨다운에도 쓰여서, 입장 직후 정상 warp를 막지 않게 따로 둔다)
   */
  lastTeleportAt?: number;
  lastEmoteAt: number;
  lastGraveEventAt: number;
  /** 11/22 look 증서 토큰 버킷 (없으면 가득). 재접속(유예 안)이면 새로, 나갔다 바로 다시 들어오면 이어 붙인다 (DEPART_KEEP) */
  lookBucket?: LookBucket;
  /** 11/22 토큰이 모자라 아직 반영 못 한 마지막 look 증서 (최신 하나만 — 연결 단위, 저장하지 않는다) */
  lookPending?: string;
  lastFireworkAt: number;
  lastSyncAt: number;
  lastActAt: number;
  lastSayAt: number;
  /** 23번 확성기 (없으면 아직 안 씀) */
  lastMegaphoneAt?: number;
  /** 3번 집 안 가구 쓰기 (없으면 아직 안 씀) */
  lastUseAt?: number;
  /** 11/26 촌캉스 아궁이 불 켜기·끄기 (없으면 아직 안 씀 — campFire.ts) */
  lastFireAt?: number;
  /** 5번 이모티콘·24번 벤치 상태 (없으면 아직 안 씀) */
  lastEmoAt?: number;
  lastMoodAt?: number;
  /** 타는 펫 올라타기·내리기 (없으면 아직 안 씀) */
  lastRideAt?: number;
  lastRodAt?: number;
  lastAwayAt?: number;
  /** 11/15 바베큐 증서 (없으면 아직 안 씀) */
  lastBbqAt?: number;
  /** 11/27 마지막 좌대 증서 */
  lastRaftAt?: number;
  /** 11/13 사냥터 공격·스킬 동작 (없으면 아직 안 씀) */
  lastHuntAt?: number;
  /** 11/15 맵 옮기기 (없으면 아직 안 씀) */
  lastMapAt?: number;
  /** 11/20 운영자 순간이동 (없으면 아직 안 씀) */
  lastTpAt?: number;
  /** 11/16 귓속말 상대 접속 확인 (없으면 아직 안 씀) */
  lastWhoOnAt?: number;
  /** 11/17 캠핑장 눈사람 세우기 (없으면 아직 안 씀) */
  lastSnowmanAt?: number;
  /** 11/18 눈덩이 내려놓기·올리기·다시 들기 / 들고 있는 상태 알림 (없으면 아직 안 씀) */
  lastSnowActAt?: number;
  lastSnowHoldAt?: number;
  /** 11/18 눈싸움: 마지막 던지기·맞음 신고 (없으면 아직 안 씀), 마지막 던지기 번호, 최근 던지기 (맞음 확인용 — 연결 단위, 저장하지 않는다) */
  lastSnowballAt?: number;
  lastSnowHitAt?: number;
  snowN?: number;
  throws?: SnowThrow[];
  /** 최근 1분 동안 받은 던지기 메시지 시각 (버린 것 포함 — SNOWBALL_PER_MINUTE 상한) */
  snowRecv?: number[];
  /** 11/18 최근 1분 동안 받아들인 눈덩이 놓기·올리기·다시 들기 시각 (SNOW_ACTS_PER_MINUTE 상한) */
  snowActs?: number[];
  /** 말풍선 채팅 도배 제한 (토큰 버킷). 재접속해도 피어에 남겨 다시 채워지지 않게 한다 */
  chatBucket?: ChatBucket;
  /** 최근 다시 붙은 시각들 (재접속 반복으로 메시지 한도·쿨다운을 초기화하거나 welcome을 거듭 받는 것을 막는다) */
  rejoins?: number[];
  /** 마지막으로 메시지를 받은 시각 (입장·복원 시각으로 시작). 유령 연결 판정에 ping 시각과 함께 쓴다 */
  lastSeenAt: number;
  /** attachment가 최신인지 */
  saved: boolean;
};

/** 11/18 보안: 나간 사람에게서 다음 입장으로 이어 붙이는 연결 단위 기록 (DEPART_MEMO_MS 동안 메모리에만) */
const DEPART_KEEP = [
  "chatBucket",
  "rejoins",
  "lastEmoteAt",
  "lastGraveEventAt",
  "lookBucket",
  "lastFireworkAt",
  "lastActAt",
  "lastSayAt",
  "lastMegaphoneAt",
  "lastEmoAt",
  "lastMoodAt",
  "lastRideAt",
  "lastRodAt",
  "lastAwayAt",
  "lastBbqAt",
  "lastRaftAt",
  "lastWhoOnAt",
  "lastSnowmanAt",
  "lastSnowActAt",
  "snowActs",
  "lastSnowballAt",
  "snowRecv",
] as const;
type Departed = { at: number; rejoins?: number[] } & Record<string, unknown>;

/** 11/18 눈싸움 던지기 하나 (서버가 받은 시각 at, 던진 맵, 이미 누가 맞았는지) */
type SnowThrow = { n: number; at: number; map: MapId; x: number; y: number; tx: number; ty: number; hit: boolean };

export class ChannelCore<C extends object> {
  private readonly peers = new Map<number, Peer<C>>();
  /** 11/20 맵마다 광역 불꽃쇼가 끝나는 시각 (Date.now ms, 메모리에만 — 잠들면 잊어도 그만) */
  private readonly showUntil = new Map<string, number>();
  private readonly bySocket = new Map<C, number>();
  private readonly byVisitor = new Map<string, number>();
  /** 11/18 보안: 방금 나간 방문자의 연결 단위 기록 (visitorId → DEPART_MEMO_MS 동안) */
  private readonly departed = new Map<string, Departed>();
  /** 좌석표 키(seatKey: 마을은 seatId 그대로, 캠핑장은 접두어) → sid */
  private readonly seats = new Map<string, number>();
  /** 다음 틱 SNAPSHOT에 실을 sid ("바뀐 사람" 집합) */
  private readonly dirty = new Set<number>();
  /** 속도 예산 때문에 아직 보고된 위치에 닿지 못한 sid */
  private readonly chasing = new Set<number>();
  /** 11/22 look 토큰을 기다리는 증서가 있는 sid (tick마다 다시 본다) */
  private readonly lookWaiting = new Set<number>();
  /** 채널 단위 이벤트 중복 제거: 키 → 마지막 중계 시각 */
  private readonly recentEvents = new Map<string, number>();
  private tickNo = 0;
  /** 22번 황금 고블린 (등장·주인 판정) */
  private readonly goblin = new GoblinCore(() => (this.host.random ? this.host.random() : Math.random()));
  /**
   * 최근 채팅. 11/16부터 마을·캠핑장이 한 기록이다 (줄마다 쓴 사람의 맵 m — 다른 맵에서 보면 [캠핑장]·[마을]).
   * 처음 쓸 때 만들고, 그때 저장소의 기록(host.loadChats)을 되살린다 — DO가 잠들었다 깨면 메모리가 비므로 새 줄을 넣기 전에
   * 반드시 먼저 읽어야 저장 기록을 덮어쓰지 않는다. 저장은 "village" 키 하나, 맵별로 따로 남기던 옛 "camp" 키는 합친 뒤 지운다
   */
  private chats: ChatRecent | null = null;
  /** 11/16 귓속말 줄 id 번호 (클라이언트가 중복을 거른다) */
  private whisperSeq = 0;
  /** 11/16 「다람쥐를 뿌려라」가 마지막으로 쏟아진 시각 (채널 쿨다운, 메모리에만) */
  private squirrelAt = -Infinity;
  /** 11/17 캠핑장에 서 있는 눈사람 (메모리에만) */
  private readonly snowmen = new SnowmanYard();
  /** 11/18 캠핑장에 쌓는 중인 덩이 (메모리 + 저장소) */
  private readonly stacks = new SnowStackYard();
  /** 11/26 촌캉스 아궁이 불 (메모리에만 — 캠핑장에 새로 들어온 사람에게 보낸다) */
  private readonly campFires = new CampFires();
  /** 11/26 집 바뀜 알림 묶기 (구역마다 HOMES_GAP_MS에 한 번) */
  private readonly homes = new HomesCoalescer();
  /** 11/27 좌대 입장권 주인 표 (월드 채널만) */
  private readonly rafts = new RaftBoard();
  /** 그 방문자가 지금 이 채널 캠핑장에 있나 (유예 중 포함 — 덩이 주인 확인) */
  private readonly inCamp = (visitorId: string): boolean => {
    const sid = this.byVisitor.get(visitorId);
    const q = sid === undefined ? undefined : this.peers.get(sid);
    return !!q && mapOfPeer(q) === "camp";
  };

  private chatLog(now: number): ChatRecent {
    if (!this.chats) {
      const c = (this.chats = new ChatRecent(() => (this.host.random ? this.host.random() : Math.random())));
      const saved = this.host.loadChats?.("village");
      if (saved !== undefined && saved !== null) c.restore(saved, now);
      const camp = this.host.loadChats?.("camp");
      if (camp !== undefined && camp !== null) {
        c.restore(camp, now, "camp");
        this.host.chatsChanged?.("camp");
        this.host.chatsChanged?.("village");
      }
    }
    return this.chats;
  }

  /** 저장할 최근 채팅 (DO가 chatsChanged를 모아 부른다). 11/16 옛 캠핑장 키는 빈 값 → DO가 지운다 */
  chatSnapshot(map: MapId, now: number): RecentChat[] {
    return map !== "village" ? [] : this.chatLog(now).snapshot(now);
  }

  /** 그 방문자의 채팅 기록을 지운다 (강퇴·이용 제한). 지웠으면 저장 예약 */
  purgeChats(visitorId: string, now = Date.now()): boolean {
    if (!this.chatLog(now).purge(visitorId)) return false;
    this.host.chatsChanged?.("village");
    return true;
  }

  /** 그 맵 좌석 (와이어 id → sid) */
  private seatsOf(map: MapId): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, sid] of this.seats) {
      const k = seatKeyMap(key);
      if (k.map === map) out[k.id] = sid;
    }
    return out;
  }

  constructor(
    private readonly cfg: ChannelConfig,
    private readonly host: ChannelHost<C>,
  ) {}

  /**
   * 접속 중 + 유예 예약. 상한 판정·로비 보고·화면 인원에 쓴다.
   * 11/20 월드 채널은 운영자(staff)를 빼고 센다 (정원 밖 — 꽉 찬 채널에도 들어가고, 일반 유저 자리를 막지 않는다). 방은 그대로
   */
  get count(): number {
    return this.cfg.room ? this.peers.size : this.peers.size - this.staffCount;
  }

  /** 11/20 운영자 포함 전체 (방 모드로 굳히기 전 빈 DO 확인용) */
  get size(): number {
    return this.peers.size;
  }

  /** 11/20 월드 채널에 있는 운영자 수 (정원·인원 밖. 로비가 「사람이 있는 채널」로 알게 따로 보고) */
  get staffCount(): number {
    if (this.cfg.room) return 0;
    let n = 0;
    for (const p of this.peers.values()) if (p.staff) n++;
    return n;
  }

  /** 소켓이 붙어 있는 인원 (유예 중 제외) */
  get online(): number {
    return this.bySocket.size;
  }

  /** 이 방문자가 이미 자리를 갖고 있는지 (접속 중이거나 유예 중) */
  has(visitorId: string): boolean {
    return this.byVisitor.has(visitorId);
  }

  /** 이 visitorId를 받을 수 있는지: 이미 자리가 있거나(복귀·중복 접속) 상한 미만. 11/20 월드 채널 운영자는 정원 밖이라 늘 */
  admits(visitorId: string, staff = false): boolean {
    return this.byVisitor.has(visitorId) || (staff && !this.cfg.room) || this.count < this.cfg.capacity;
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
    for (const r of reserved) {
      if (!this.adopt(r, null, r.until, now)) this.host.dropReservation(r.sid);
      else if (typeof r.code === "number") {
        // 11/26 유예 중에 잠들었다 깨어났다: 끊길 때의 닫힘 코드를 되살린다 (없으면 접속 기록이 모두 「연결 끊김」으로 남았다)
        const p = this.peers.get(r.sid);
        if (p && !p.conn) p.closeCode = r.code;
      }
    }
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
    const newSid = this.admits(t.visitorId, !!t.staff) ? allocSid(this.peers) : null;
    if (newSid === null) return this.host.close(conn, CLOSE.CHANNEL_FULL, "channel full");
    // 11/18 보안: 방금 나간 사람이면 재접속 반복 제한을 이어서 센다 (DO가 로비에 묻기 전에 rejoinBlocked로 먼저 거른다)
    if (this.rejoinBlocked(t.visitorId, now)) return this.host.close(conn, CLOSE.RATE_LIMITED, "rejoin too fast");

    const map: MapId = t.map && mapAllowed(t.map, t) ? t.map : "village";
    // 방은 크기를 모른다 (Worker가 u16 범위만 본다). 월드 채널은 그 맵 범위 안일 때만
    const spawn = t.spawn && (this.cfg.room || inMapBounds(map, t.spawn.x, t.spawn.y)) ? t.spawn : mapSpawn(map, SPAWN);
    const pos = this.clearOfSeats(spawn, undefined, map);
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
      ...(t.dex ? { dex: t.dex } : {}),
      ...(t.champ ? { champ: t.champ } : {}),
      ...(t.mgr ? { mgr: true as const } : {}),
      ...(isSproutUntil(t.nb) ? { nb: t.nb } : {}),
      joinedAt: now,
      ...mapField(map),
      ...(t.camp ? { camp: true as const } : {}),
      ...(t.sea ? { sea: true as const } : {}),
      ...(t.rafts ? { rf: true as const } : {}),
    };
    const p = this.adoptNew(rec, conn, now);
    this.carryDeparted(p, now);
    // 입장 스폰도 순간이동으로 친다 (고블린 위치로 바로 들어와 잡기 방지)
    p.lastTeleportAt = now;
    this.save(p);
    this.welcome(p, t.channel, false, now);
    // 11/27 좌대 입장권: 토큰에 실린 이 채널 입장권 → 주인 표, 캠핑장이면 표를 보내고 남의 좌대 위면 내려보낸다
    if (t.raft) this.setRaft(t.visitorId, t.name, t.raft.n, t.raft.u, now);
    this.raftArrive(p, true, now);
    this.broadcastMap(map, encodeEvent({ t: "join", ...this.info(p) }), p.sid);
    this.host.countChanged(this.count);
    this.broadcastCount(p.sid);
    this.host.visitorJoined(p.visitorId, p.joinedAt);
    this.host.liveChanged?.(true);
  }

  /**
   * 11/18 보안: 이 방문자가 지금 다시 붙으면 재접속 반복 제한(REJOIN_WINDOW_MS 안 REJOIN_MAX번)에 걸리는지.
   * 접속·유예 중인 사람은 그 기록으로, 방금 정상 종료(1000)로 나간 사람은 남겨 둔 기록으로 센다.
   * DO는 로비(admit)에 묻기 전에 이걸 먼저 봐서, 들락날락 반복이 로비·입장 방송을 부르지 않게 한다
   */
  rejoinBlocked(visitorId: string, now: number): boolean {
    const sid = this.byVisitor.get(visitorId);
    const live = sid === undefined ? undefined : this.peers.get(sid);
    const memo = live ? undefined : this.departed.get(visitorId);
    const list = live ? live.rejoins : memo && now - memo.at < DEPART_MEMO_MS ? memo.rejoins : undefined;
    return (list ?? []).filter((at) => now - at < REJOIN_WINDOW_MS).length >= REJOIN_MAX;
  }

  /** 11/18 보안: 나가는 사람의 연결 단위 기록을 남긴다 (오래된 것은 같이 정리) */
  private keepDeparted(p: Peer<C>, now: number): void {
    for (const [v, d] of this.departed) if (now - d.at >= DEPART_MEMO_MS) this.departed.delete(v);
    const d: Departed = { at: now };
    const src = p as unknown as Record<string, unknown>;
    const dst = d as Record<string, unknown>;
    for (const k of DEPART_KEEP) if (src[k] !== undefined && src[k] !== -Infinity) dst[k] = src[k];
    this.departed.set(p.visitorId, d);
  }

  /** 11/18 보안: 새 입장에 방금 나간 기록을 이어 붙이고, 이번 입장도 재접속으로 센다 */
  private carryDeparted(p: Peer<C>, now: number): void {
    const d = this.departed.get(p.visitorId);
    if (!d) return;
    this.departed.delete(p.visitorId);
    if (now - d.at >= DEPART_MEMO_MS) return;
    const dst = p as unknown as Record<string, unknown>;
    for (const k of DEPART_KEEP) if (d[k] !== undefined) dst[k] = d[k];
    p.rejoins = [...(d.rejoins ?? []).filter((at) => now - at < REJOIN_WINDOW_MS), now];
  }

  /**
   * 같은 visitorId가 이미 있다. 상한 검사 없이 같은 sid·좌석을 넘겨받는다.
   * - 유예 중이면 복귀(재연결)
   * - 접속 중이면 기존 소켓을 4002로 닫는다 (탭 여러 개로 자리 차지 방지. 죽은 연결의 재접속도 여기로 온다)
   */
  private takeOver(p: Peer<C>, conn: C, t: JoinTicket, now: number): void {
    // 같은 토큰(60초)으로 짧은 시간에 거듭 다시 붙으면 새 소켓만 4008로 끊는다 (기존 연결·자리는 그대로)
    const recent = (p.rejoins ?? []).filter((at) => now - at < REJOIN_WINDOW_MS);
    if (recent.length >= REJOIN_MAX) {
      p.rejoins = recent;
      return this.host.close(conn, CLOSE.RATE_LIMITED, "rejoin too fast");
    }
    recent.push(now);
    p.rejoins = recent;
    if (p.conn) {
      this.bySocket.delete(p.conn);
      this.host.persist(p.conn, null);
      this.host.close(p.conn, CLOSE.REPLACED, "replaced");
      p.conn = null;
    } else {
      this.host.dropReservation(p.sid);
    }
    const staffFlip = !!p.staff !== !!t.staff;
    const renamed =
      p.name !== t.name || p.color !== t.color || p.body !== t.body || p.look.join() !== t.look.join() || !sameDye(p.dye, t.dye) || !!p.staff !== !!t.staff || (p.dex ?? 0) !== (t.dex ?? 0) || (p.champ ?? 0) !== (t.champ ?? 0) || !!p.mgr !== !!t.mgr || sproutMoved(p.nb, t.nb);
    p.name = t.name;
    p.color = t.color;
    p.look = t.look;
    p.body = t.body;
    p.dye = hasDye(t.dye) ? t.dye : undefined;
    p.staff = t.staff ? true : undefined;
    p.dex = t.dex || undefined;
    p.champ = t.champ || undefined;
    p.mgr = t.mgr ? true : undefined;
    p.nb = isSproutUntil(t.nb) ? t.nb : undefined;
    p.camp = t.camp ? true : undefined;
    p.sea = t.sea ? true : undefined;
    p.rf = t.rafts ? true : undefined;
    p.joinedAt = now;
    // 새 소켓을 붙이기 전에 옮긴다: 좌석 해제 알림은 다른 사람에게만 가고, 본인은 결과가 반영된 welcome을 처음으로 받는다
    // 11/15 다른 맵으로 다시 붙었다 (캠핑장에서 새로고침·허락이 없어진 토큰): 맵을 옮긴 뒤 welcome (옛 맵 leave · 새 맵 join)
    const want: MapId = t.map && mapAllowed(t.map, t) ? t.map : "village";
    if (want !== mapOfPeer(p)) {
      const to = t.spawn && inMapBounds(want, t.spawn.x, t.spawn.y) ? t.spawn : mapSpawn(want, SPAWN);
      this.switchMap(p, want, this.clearOfSeats(to, p.sid, want), now);
    } else if (t.spawn) this.relocate(p, t.spawn);

    // 11/18 다시 붙었다 (새로고침이면 빈손): 들고 있던 눈덩이는 지운다. 들고 있으면 웹이 welcome 뒤에 다시 알린다
    if (p.snow) {
      p.snow = undefined;
      this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "snowHold", sid: p.sid, h: null }), p.sid);
    }

    p.conn = conn;
    p.closeCode = undefined;
    p.until = 0;
    this.bySocket.set(conn, p.sid);
    this.resetConnState(p, now);
    this.save(p);
    this.welcome(p, t.channel, true, now);
    // 11/27 좌대 입장권 (새 토큰 값 — 이름이 바뀌었으면 표의 이름도)
    if (t.raft) this.setRaft(t.visitorId, t.name, t.raft.n, t.raft.u, now);
    else if (this.rafts.rename(t.visitorId, t.name)) this.raftsChanged(now);
    this.raftArrive(p, true, now);
    // 이름·색·몸·꾸미기는 입장 때 한 번만 보낸다. 바뀌었을 때만 join을 다시 보낸다(클라이언트는 같은 sid의 join을 덮어쓰기로 처리).
    if (renamed) this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "join", ...this.info(p) }), p.sid);
    // 11/20 운영자 여부가 바뀌었다 → 인원(운영자 빼고 센다)도 바뀐다
    if (staffFlip) {
      this.host.countChanged(this.count);
      this.broadcastCount(p.sid);
    }
    this.host.visitorJoined(p.visitorId, p.joinedAt);
    this.host.liveChanged?.(true);
  }

  /** 복귀한 클라이언트가 알려 준 위치로 옮긴다(위치의 원천은 클라이언트). 앉아 있던 좌석 근처면 좌석을 유지한다. */
  private relocate(p: Peer<C>, want: Point): void {
    const seat = p.seatId ? seatSlotIn(mapOfPeer(p), p.seatId) : undefined;
    // 움직이는 자리(조각배, 50번): 자리는 그대로 두고 위치만 클라이언트가 알려 준 물 위로 (앵커와 멀어도 된다)
    if (seat?.mobile) return this.moveSeated(p, seat.area ? clampToArea(seat.area, want.x, want.y) : want);
    if (seat && dist(seat, want) <= SEAT_SERVER_RADIUS) return;
    if (p.seatId) this.releaseSeat(p);
    // 그 사이 다른 사람이 앉은 좌석 위로 돌아오지 않는다 (클라이언트는 seatDenied를 받고 가까운 빈자리로 옮긴다)
    const to = this.clearOfSeats(want, p.sid, mapOfPeer(p));
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
  private clearOfSeats(pos: Point, self?: number, map: MapId = "village"): Point {
    if (this.cfg.room) return pos;
    for (const [seatId, sid] of Object.entries(this.seatsOf(map))) {
      if (sid === self) continue;
      const s = seatSlotIn(map, seatId);
      // 움직이는 자리(조각배)는 앵커에 사람이 있지 않다 (배가 물 위에 나가 있다)
      if (s && !s.mobile && dist(s, pos) < SEAT_CLEAR_RADIUS) return { x: s.x, y: s.y + SEAT_STAND_DY };
    }
    return pos;
  }

  private welcome(p: Peer<C>, channel: number, resumed: boolean, now = Date.now()): void {
    const map = mapOfPeer(p);
    // 22번 고블린: 옛 모양(goblin)은 마을 고블린 + 내가 마을일 때만 (옛 클라이언트는 맵을 모르고 마을 길로 그린다).
    // 11/26 gob = 어느 맵이든 지금 나와 있는 고블린 (새 클라이언트는 다른 맵이면 정류장 쪽 화살표)
    const gob = this.goblinOn ? this.goblin.visible(now) : undefined;
    const goblin = gob && !gob.m && map === "village" ? gob : undefined;
    this.sendTo(p, {
      t: "welcome",
      sid: p.sid,
      channel,
      cap: this.cfg.capacity,
      peers: this.othersOf(p),
      seats: this.seatsOf(map),
      resumed,
      // 나무·그네도 좌석처럼 판정한다 (이 값이 없는 이전 서버에는 클라이언트가 소품 자리를 요청하지 않는다)
      // 방(집)도 3번 집 안 가구 자리를 같은 체계로 판정한다
      spots: true,
      // 22번: 서버 시계(고양이·유령·고블린을 모두가 같은 시각으로) + 지금 나와 있는 고블린
      ...(this.cfg.room ? {} : { now }),
      ...(goblin ? { goblin } : {}),
      ...(gob ? { gob } : {}),
      // 11/15 캠핑장·11/16 바닷가에 있으면 알린다 (마을이면 없다 — 옛 서버와 같은 모양)
      ...awayTag(map),
      // 11/15 채널 전체 인원 (마을·캠핑장 합계 — HUD "N/40명"). 방에는 없다
      ...(this.cfg.room ? {} : { n: this.count }),
      // 11/22 look 증서를 줄 세운다 → 클라이언트는 기다리지 않고 바로 보낸다 (protocol lookQueue.ts)
      lk: 1,
      // 11/22 내 새싹 표시 끝 시각 (내 머리 위·내 채팅 줄에도 새싹)
      ...(p.nb ? { nb: p.nb } : {}),
    });
    // 11/17 캠핑장이면 지금 서 있는 눈사람
    if (!this.cfg.room && map === "camp") this.sendSnowmen(p, now);
    // 11/26 이 채널 구역별 마지막 집 바뀜 (늦게 들어온 사람도 CDN 옛 목록을 거르게 — 웹 homesRefresh staleHomesV. 옛 웹은 다시 한 번 받을 뿐)
    if (!this.cfg.room) for (const [zone, v] of this.homes.known()) this.sendTo(p, { t: "homes", zone, v });
    // 고블린을 잡았는데 증서를 받기 전에 끊겼다 → 다시 보낸다 (웹은 같은 고블린을 한 번만 지급한다)
    const owed = this.goblinOn ? this.goblin.grantFor(p.visitorId, now) : null;
    if (owed) this.sendTo(p, { t: "goblinGrant", ...owed });
    this.sendChatLog(p, now);
  }

  /** 이 방(채널)의 최근 채팅(하루 안, 최대 CHAT_RECENT_MAX줄)을 p에게 (없으면 보내지 않는다). 입장·재접속·실내에서 복귀·맵 이동 때 */
  private sendChatLog(p: Peer<C>, now: number): void {
    const lines = this.chatLog(now).recent(now, p.visitorId);
    if (lines.length) this.sendTo(p, { t: "chatLog", now, lines });
  }

  /** 나를 뺀 같은 맵 접속자 전체 (유예 중인 사람 포함 — 다른 사람에게는 멈춘 아바타로 보인다) */
  private othersOf(p: Peer<C>): PeerInfo[] {
    const out: PeerInfo[] = [];
    const map = mapOfPeer(p);
    for (const o of this.peers.values()) if (o !== p && mapOfPeer(o) === map) out.push(this.info(o));
    return out;
  }

  // ── 수신 ──

  message(conn: C, data: string | ArrayBuffer, now: number): void {
    const sid = this.bySocket.get(conn);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p) return;
    p.lastSeenAt = now;
    this.goblinCheck(now);
    this.raftCheck(now);
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
    p.closeCode = code;
    if (code === CLOSE_NORMAL || this.cfg.graceMs <= 0) {
      this.keepDeparted(p, now);
      return this.remove(p);
    }

    p.until = now + this.cfg.graceMs;
    p.tx = p.x;
    p.ty = p.y;
    this.chasing.delete(sid);
    // 걷던 모습 그대로 제자리걸음을 하지 않도록 서 있는 상태로 멈춘다
    if (p.state === STATE.walk || p.state === STATE.run) {
      p.state = STATE.idle;
      this.markDirty(p);
    }
    this.host.saveReservation({ ...this.record(p), until: p.until, code });
    this.host.visitorDropped?.(p.visitorId);
  }

  /** 만료된 유예 예약을 정리한다 (알람에서 호출) */
  expire(now: number): void {
    for (const p of [...this.peers.values()]) {
      if (p.conn || p.until > now) continue;
      this.host.dropReservation(p.sid);
      this.remove(p);
    }
    for (const [v, d] of this.departed) if (now - d.at >= DEPART_MEMO_MS) this.departed.delete(v);
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
  expel(visitorId: string, code: number, reason: string, now = Date.now()): boolean {
    // 지금 이 채널에 없어도 남은 채팅 기록(저장된 것 포함)에서 그 사람 줄을 뺀다
    this.purgeChats(visitorId, now);
    const sid = this.byVisitor.get(visitorId);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p) return false;
    if (!p.conn) this.host.dropReservation(p.sid);
    this.kick(p, code, reason);
    return true;
  }

  /**
   * 11/26 점검 시작: 운영자(staff)가 아닌 모든 접속과 재연결 유예 예약을 4013으로 정리한다 (유예 없음). 정리한 수
   */
  expelForMaintenance(): number {
    let n = 0;
    for (const p of [...this.peers.values()]) {
      if (p.staff === true) continue;
      if (!p.conn) this.host.dropReservation(p.sid);
      this.kick(p, CLOSE.MAINTENANCE, "maintenance");
      n++;
    }
    return n;
  }

  /** 관리자 포인트 지급 등: 접속 중인 그 방문자에게만 "내 정보 새로 받기"를 보낸다. 보냈으면 true */
  nudgeMe(visitorId: string): boolean {
    const sid = this.byVisitor.get(visitorId);
    const p = sid === undefined ? undefined : this.peers.get(sid);
    if (!p?.conn) return false;
    this.sendTo(p, { t: "me" });
    return true;
  }

  /**
   * 친구 위치: 이 채널에 자리를 가진 모든 사람(접속 중 + 재연결 유예 중)의 방문자 id·sid·서버 위치·실내 여부.
   * 실시간 서버 안(Worker)에서만 쓰고, 웹 서버는 친구 사이인 계정만 골라 브라우저에 넘긴다
   */
  roster(): { visitorId: string; sid: number; name: string; x: number; y: number; away?: true; place?: AwayPlace; house?: string; map?: AwayMapId }[] {
    return [...this.peers.values()].map((p) => ({
      visitorId: p.visitorId,
      sid: p.sid,
      name: p.name,
      x: Math.round(p.x),
      y: Math.round(p.y),
      ...(p.away ? { away: true as const } : {}),
      ...(p.away && p.place ? { place: p.place } : {}),
      ...(p.away && p.house ? { house: p.house } : {}),
      ...mapField(mapOfPeer(p)),
    }));
  }

  /** 친구 들고 남: 이 채널에 접속 중인 to(친구들)에게만 알린다. 보낸 수 */
  friendNotice(to: readonly string[], key: string, name: string, on: boolean): number {
    let n = 0;
    for (const v of to) {
      const sid = this.byVisitor.get(v);
      const p = sid === undefined ? undefined : this.peers.get(sid);
      if (!p?.conn) continue;
      this.sendTo(p, { t: "friend", key, name, on });
      n++;
    }
    return n;
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
    const map = mapOfPeer(p);
    if (!this.inBounds(m.x, m.y, map)) return;
    // 좌석 판정은 서버가 한다. 자리를 차지한 상태(의자 sitChair, 나무 hang, 그네 swing)가 아닌 MOVE가 오면 자리를 놓는다.
    let held = p.seatId ? seatSlotIn(map, p.seatId) : undefined;
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
        // 11/15 그 맵에 없는 놀이기구·배 자세 (캠핑장엔 배·관람차·열기구가 없다)
        else if (kind && !mapHasSpotState(map, state)) state = STATE.idle;
        else if (kind && indoor === !!this.cfg.room && !this.claimSpot(p, spotSeatId(kind, m.x, m.y), now)) state = STATE.idle;
      }
    }
    // 타는 펫: 물에 들어가거나 자리에 앉으면 내린다 (클라이언트도 스스로 내리고 ride off를 보낸다)
    if (p.ride && (state === STATE.swim || state === STATE.dive || held)) this.clearRide(p);
    const changed = state !== p.state || m.dir !== p.dir;
    p.state = state;
    // 벤치 상태: 자리도 없고 물속도 아니면 푼다
    if (p.mood && !p.seatId && state !== STATE.swim && state !== STATE.dive) this.clearMood(p);
    p.dir = m.dir;
    // 앉아 있는 동안 위치는 좌석 앵커에 고정한다 (움직이는 자리 — 조각배 — 는 보고된 위치를 따라간다)
    if (!p.seatId || held?.mobile) {
      // 11/26 다닐 수 있는 타원이 있는 자리(캠핑장 트램펄린 매트)는 그 밖으로 나가지 않는다
      const to = held?.area ? clampToArea(held.area, m.x, m.y) : m;
      p.tx = to.x;
      p.ty = to.y;
    }
    // 즉시 중계하지 않는다. 서버 위치만 갱신하고 "바뀐 사람"에 넣어 다음 틱에 한 번에 보낸다.
    // 11/27 좌대 입장권: 입장권 없이 좌대 마루로 가려 하면 내려보낸다 (판자 다리·사다리 칸까지는 그대로)
    if (!p.seatId && this.raftBlocked(p, p.tx, p.ty, now)) return;
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
    // 11/26 월드 채널은 캠핑장 촌캉스 아궁이 불(ag{터})만 받는다 — 같은 맵 사람에게만 (저장 없음)
    if (!this.cfg.room && m.t === "use" && !CAMP_FIRE_USE_RE.test(m.u)) return;
    if (this.cfg.room && (m.t === "emote" || m.t === "graveEvent" || m.t === "firework" || m.t === "megaphone" || m.t === "bbq")) return;
    switch (m.t) {
      case "sit":
        return this.onSit(p, m.seatId, now);
      case "stand":
        return this.onStand(p);
      case "warp":
        return this.onWarp(p, m, now);
      case "emote":
        if (now - p.lastEmoteAt < EMOTE_INTERVAL_MS) return;
        if (!this.once(`e:${p.sid}:${m.graveId}`, EMOTE_DEDUPE_MS, now)) return;
        p.lastEmoteAt = now;
        return this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "emote", sid: p.sid, kind: m.kind, graveId: m.graveId }), p.sid);
      case "graveEvent":
        if (now - p.lastGraveEventAt < GRAVE_EVENT_INTERVAL_MS) return;
        if (!this.once(`g:${m.graveId}`, GRAVE_EVENT_INTERVAL_MS, now)) return;
        p.lastGraveEventAt = now;
        return this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "graveEvent", sid: p.sid, kind: m.kind, graveId: m.graveId }), p.sid);
      case "look":
        // 11/22 간격 안이면 버리지 않고 최신 하나를 들고 있다 토큰이 차자마자 반영 (tick)
        p.lookPending = m.grant;
        return this.flushLook(p, now);
      case "raft":
        // 11/27 좌대 입장권 증서 (사기·연장·다시 받기) → 검증 뒤 주인 표에 (applyGrant)
        if (this.cfg.room || now - (p.lastRaftAt ?? -Infinity) < 1_000) return;
        p.lastRaftAt = now;
        return this.verifyThenApply(p, "raft", m.grant);
      case "bbq":
        // 11/15 캠핑장 바베큐: 웹이 서명한 한 접시 증서 → 검증 뒤 같은 맵에 (applyGrant)
        if (now - (p.lastBbqAt ?? -Infinity) < BBQ_INTERVAL_MS) return;
        p.lastBbqAt = now;
        return this.verifyThenApply(p, "bbq", m.grant);
      case "firework":
        if (now - p.lastFireworkAt < FIREWORK_INTERVAL_MS) return;
        p.lastFireworkAt = now;
        return this.verifyThenApply(p, "firework", m.grant);
      case "sync":
        // 자가 복구: 클라이언트가 놓친 join/leave가 있어도 이걸로 맞춘다
        if (now - p.lastSyncAt < SYNC_INTERVAL_MS) return;
        p.lastSyncAt = now;
        return this.sendTo(p, { t: "peers", peers: this.othersOf(p), seats: this.seatsOf(mapOfPeer(p)) });
      case "act":
        if (now - p.lastActAt < ACT_INTERVAL_MS) return;
        p.lastActAt = now;
        return this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "act", sid: p.sid, kind: m.kind, x: p.x, y: p.y }));
      case "use":
        // 11/26 월드 채널은 촌캉스 아궁이 불만 (마당 근처·사람마다 1초에 한 번 — onCampFire)
        if (!this.cfg.room) return this.onCampFire(p, m.u, m.a, now);
        // 3번 집 안 가구 쓰기: 뜻은 클라이언트가 정한다 (피아노 음·불 켜기 …). 보낸 사람은 이미 화면에 반영했다
        if (now - (p.lastUseAt ?? -Infinity) < USE_INTERVAL_MS) return;
        p.lastUseAt = now;
        return this.broadcast(encodeEvent({ t: "use", sid: p.sid, u: m.u, a: m.a }), p.sid);
      case "hunt":
        // 11/13 함께 사냥: 사냥터 방에서만, 보낸 사람 빼고 같은 방에만 (판정·몬스터는 각자 — 서버는 그림용 신호만 넘긴다)
        if (!this.cfg.hunt || this.peers.size < 2) return;
        if (now - (p.lastHuntAt ?? -Infinity) < HUNT_ACT_INTERVAL_MS) return;
        p.lastHuntAt = now;
        return this.broadcast(
          encodeEvent({ t: "hunt", sid: p.sid, k: m.k, a: m.a, ...(m.w ? { w: m.w } : {}), ...(m.s ? { s: m.s } : {}), ...(m.f ? { f: true as const } : {}) }),
          p.sid,
        );
      case "emo":
        // 5번 이모티콘: 보낸 사람은 이미 화면에 띄웠다 → 나머지에게만
        if (now - (p.lastEmoAt ?? -Infinity) < EMO_INTERVAL_MS) return;
        p.lastEmoAt = now;
        return this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "emo", sid: p.sid, id: m.id }), p.sid);
      case "ride":
        if (now - (p.lastRideAt ?? -Infinity) < RIDE_INTERVAL_MS) return;
        p.lastRideAt = now;
        return this.onRide(p, m.on);
      case "rod":
        if (now - (p.lastRodAt ?? -Infinity) < ROD_INTERVAL_MS) return;
        p.lastRodAt = now;
        return this.onRod(p, m.on);
      case "away":
        if (now - (p.lastAwayAt ?? -Infinity) < AWAY_INTERVAL_MS) return;
        p.lastAwayAt = now;
        return this.onAway(p, m.on, now, m.p, m.h);
      case "mood":
        if (now - (p.lastMoodAt ?? -Infinity) < MOOD_INTERVAL_MS) return;
        p.lastMoodAt = now;
        return this.onMood(p, m.m);
      case "say":
        if (now - p.lastSayAt < SAY_INTERVAL_MS) return;
        p.lastSayAt = now;
        return this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "say", sid: p.sid, id: m.id }));
      case "chat": {
        // 말풍선 채팅: 넘치면 조용히 버린다. 가린 글만 같은 채널·방에 중계하고, 늦게 온 사람용으로 기록에 둔다 (월드 채널은 저장소에도 모아 쓴다. 실내에 있으면 안 보이니 버린다)
        // 11/17 사냥터(실내 장소 hunt)는 예외: 사냥 중에도 채널 채팅을 쓴다 (말풍선 없이 채팅창 [사냥터] 줄). 집·상점 등은 그대로 버린다 (집은 집 방 채팅)
        const hunting = huntChatOk(this.cfg.room, p);
        if ((p.away && !hunting) || !takeChatToken((p.chatBucket ??= newChatBucket()), now)) return;
        // 11/16 채팅은 채널 전체(마을·캠핑장)로 — 줄마다 쓴 사람의 맵을 붙이고, 다른 맵 사람도 채팅창에 이름을 쓰게 이름·딱지를 싣는다
        const camp: { m?: ChatPlace } = hunting ? { m: "hunt" } : awayTag(mapOfPeer(p));
        // 11/20 닉네임 꾸미기도 싣는다: 다른 맵 사람(착용을 모름)과 늦게 들어온 사람의 채팅창에도 꾸민 이름이 보이게
        const ns = chatNameStyle(p.look);
        // 11/22 새싹(새 이웃) 줄: 쓴 순간 아직 새싹이면
        const tags = { ...(p.staff ? { staff: true as const } : {}), ...(p.mgr ? { mgr: true as const } : {}), ...(ns ? { ns } : {}), ...(sproutOn(p.nb, now) ? { nb: true as const } : {}) };
        const c = this.chatLog(now).push({ sid: p.sid, visitorId: p.visitorId, name: p.name, text: maskChat(m.text), ...tags, ...camp }, now);
        this.host.chatsChanged?.("village");
        this.broadcast(encodeEvent({ t: "chat", sid: p.sid, text: c.text, id: c.id, at: c.at, name: p.name, ...tags, ...camp }), p.sid);
        return this.maybeSquirrels(p, c.text, now);
      }
      case "squirrelsReset":
        // 11/17 운영자만: 다람쥐 쿨다운을 바로 풀고, 남은 시간 0으로 알려 준다
        if (!p.staff) return;
        this.squirrelAt = -Infinity;
        return this.sendTo(p, { t: "squirrelsWait", left: 0 });
      case "whisper":
        return this.onWhisper(p, m.to, m.text, now);
      case "whoOn": {
        // 11/16 최근 귓속말 상대가 지금 이 채널에 있는지 (물어본 이름만 답한다)
        if (this.cfg.room || now - (p.lastWhoOnAt ?? -Infinity) < WHO_ON_INTERVAL_MS) return;
        p.lastWhoOnAt = now;
        const here = new Set([...this.peers.values()].filter((q) => q.conn).map((q) => nameKey(q.name)));
        return this.sendTo(p, { t: "whoOn", on: m.names.filter((n) => here.has(nameKey(n))), off: m.names.filter((n) => !here.has(nameKey(n))) });
      }
      case "goblin":
        return this.onGoblinClaim(p, m.id, now);
      case "megaphone":
        if (now - (p.lastMegaphoneAt ?? -Infinity) < MEGAPHONE_INTERVAL_MS) return;
        p.lastMegaphoneAt = now;
        return this.verifyThenApply(p, "megaphone", m.grant);
      case "map":
        if (this.cfg.room) return;
        if (now - (p.lastMapAt ?? -Infinity) < MAP_INTERVAL_MS) return;
        p.lastMapAt = now;
        return this.onMap(p, m.m, { x: m.x, y: m.y }, now);
      case "tp":
        if (this.cfg.room || !p.staff) return; // 운영자 연결만
        return this.onStaffTp(p, m.sid, m.m, { x: m.x, y: m.y }, now);
      case "snowHold":
        return this.onSnowHold(p, m.h, now);
      case "snowPut":
      case "snowAdd":
      case "snowTake":
      case "snowBreak":
      case "snowmanBreak":
        return this.onSnowAct(p, m, now);
      case "snowball":
        return this.onSnowball(p, m, now);
      case "snowHit":
        return this.onSnowHit(p, m.by, m.n, m.h, now);
    }
  }

  /**
   * 11/18 눈싸움 던지기: 마을·캠핑장 바깥에서 서 있거나 걷는 사람만 (자리·탈것·물속·실내는 아니다), 1분 상한·3초 간격·출발점·거리를 보고
   * 번호를 붙여 같은 맵 다른 사람에게 중계한다 (던진 사람은 이미 그렸다). 겨울판인지는 웹이 본다. 맞음 확인용으로 최근 몇 개만 기억한다
   */
  private onSnowball(p: Peer<C>, m: Extract<C2S, { t: "snowball" }>, now: number): void {
    // 11/18 1분 상한: 받은 메시지는 다 센다 (넘으면 아무것도 하지 않는다)
    const recv = (p.snowRecv ??= []);
    while (recv.length && now - recv[0] >= 60_000) recv.shift();
    if (recv.length >= SNOWBALL_PER_MINUTE) return;
    recv.push(now);
    const map = mapOfPeer(p);
    if (this.cfg.room || p.away || !snowFightMap(map)) return;
    if (p.seatId || p.ride || !snowFightState(p.state)) return;
    if (now - (p.lastSnowballAt ?? -Infinity) < SNOWBALL_SERVER_INTERVAL_MS) return;
    if (Math.hypot(m.x - p.x, m.y - p.y) > SNOWBALL_START_SLACK) return;
    const d = Math.hypot(m.tx - m.x, m.ty - m.y);
    if (d < 1 || d > SNOWBALL_RANGE_MAX) return;
    p.lastSnowballAt = now;
    const n = (p.snowN = (p.snowN ?? 0) + 1);
    const list = (p.throws ??= []);
    list.push({ n, at: now, map, x: m.x, y: m.y, tx: m.tx, ty: m.ty, hit: false });
    if (list.length > SNOWBALL_KEEP) list.shift();
    this.broadcastMap(map, encodeEvent({ t: "snowball", sid: p.sid, n, x: m.x, y: m.y, tx: m.tx, ty: m.ty }), p.sid);
  }

  /**
   * 11/18 눈싸움 맞음 신고 (판정은 맞은 사람 화면 — 사용자 「모든 사람이 다 맞아야 함」: 앉은 사람·탄 사람도, 실내만 아니면): 던진 사람이 같은 맵에 있고 그 번호가 최근 던지기이며 아직 아무도 안 맞았고,
   * 맞은 사람 서버 위치가 날아간 길 근처면 같은 맵 모두(맞은 사람·던진 사람 포함)에게 알린다. 한 번 던진 눈은 한 사람만 맞는다
   */
  private onSnowHit(p: Peer<C>, by: number, n: number, h: number | undefined, now: number): void {
    const map = mapOfPeer(p);
    if (this.cfg.room || p.away || by === p.sid || !snowFightMap(map)) return;
    if (now - (p.lastSnowHitAt ?? -Infinity) < SNOWBALL_HIT_INTERVAL_MS) return;
    const q = this.peers.get(by);
    if (!q || mapOfPeer(q) !== map) return;
    const th = q.throws?.find((x) => x.n === n);
    if (!th || th.hit || th.map !== map || now - th.at > SNOWBALL_HIT_WINDOW_MS) return;
    if (snowSegDist(p.x, p.y, th.x, th.y, th.tx, th.ty) > SNOWBALL_HIT_SLACK) return;
    p.lastSnowHitAt = now;
    th.hit = true;
    this.broadcastMap(map, encodeEvent({ t: "snowHit", sid: p.sid, by, n, ...(h !== undefined ? { h } : {}) }));
  }

  /** 11/17 캠핑장에 들어왔다: 지금 서 있는 눈사람과 11/18 쌓는 중인 덩이 (+ 11/26 누가 켜고 끈 아궁이 불) */
  private sendSnowmen(p: Peer<C>, now: number): void {
    this.sendTo(p, { t: "snowmen", list: this.snowmen.all(now), stacks: this.stacks.all(now, this.inCamp) });
    this.sendCampFires(p, now);
  }

  /**
   * 11/26 촌캉스 아궁이 불 (월드 채널 use "ag{터}"). 캠핑장에 있고(실내 아님) 그 촌캉스 마당 근처에 서 있는 사람만,
   * 사람마다 CAMP_FIRE_INTERVAL_MS에 한 번. 채널이 터마다 마지막 상태를 기억해 늦게 온 사람에게도 보낸다 (campFire.ts)
   */
  private onCampFire(p: Peer<C>, u: string, a: number, now: number): void {
    if (!this.snowOk(p)) return;
    if (now - (p.lastFireAt ?? -Infinity) < CAMP_FIRE_INTERVAL_MS) return;
    const lot = campFireLotFor(u, p.x, p.y);
    if (lot === null) return;
    p.lastFireAt = now;
    const on = a > 0;
    this.campFires.set(lot, on, now);
    this.broadcastMap("camp", encodeEvent({ t: "use", sid: p.sid, u: campFireUseId(lot), a: on ? 1 : 0 }), p.sid);
  }

  /** 기억하는 아궁이 불을 p에게 (sid 0 = 누가 켰는지 모름 — 화면은 불만 바꾼다) */
  private sendCampFires(p: Peer<C>, now: number): void {
    for (const [lot, on] of this.campFires.fresh(now)) this.sendTo(p, { t: "use", sid: 0, u: campFireUseId(lot), a: on ? 1 : 0 });
  }

  /** 캠핑장에서 눈을 만질 수 있는 사람인지 (월드 채널 캠핑장, 실내 아님) */
  private snowOk(p: Peer<C>): boolean {
    return !this.cfg.room && mapOfPeer(p) === "camp" && !p.away;
  }

  /**
   * 11/18 들고 있는 눈덩이가 바뀌었다 (집기·크기·굴리기·버리기). 같은 캠핑장 다른 사람에게만 알리고, 늦게 온 사람은 PeerInfo.snow로 받는다.
   * 웹은 바뀔 때만 SNOW_HOLD_SEND_MS 넘게 띄워 보낸다 → 이보다 잦으면 버린다 (도배 방지)
   */
  private onSnowHold(p: Peer<C>, h: SnowHold | null, now: number): void {
    if (!this.snowOk(p)) return;
    if (now - (p.lastSnowHoldAt ?? -Infinity) < SNOW_HOLD_INTERVAL_MS) return;
    p.lastSnowHoldAt = now;
    if (sameHold(p.snow, h)) return;
    this.setHold(p, h ?? undefined);
    this.broadcastMap("camp", encodeEvent({ t: "snowHold", sid: p.sid, h }), p.sid);
  }

  /** 들고 있는 눈덩이를 바꿔 적는다 (알림은 부른 쪽이) */
  private setHold(p: Peer<C>, h: SnowHold | undefined): void {
    p.snow = h;
    this.save(p);
  }

  /**
   * 11/18 덩이 내려놓기(snowPut)·올리기(snowAdd)·다시 들기(snowTake)·11/26 허물기(snowBreak·다 세운 눈사람 snowmanBreak). 자리·간격·주인·쌓는 순서를 서버가 보고,
   * 받으면 같은 캠핑장 모두(주인 포함 — 확인)에게 snowStack·snowStackGone, 세 단째를 올리면 그 자리에 눈사람을 세운다 (snowman.st).
   * 거절은 보낸 사람에게만 snowmanDenied (+ 내 덩이면 지금 모양을 다시 — 웹이 미리 바꾼 화면을 맞춘다. 없는 덩이면 snowStackGone,
   * 남의 덩이면 더 보내지 않는다 — 그 모양은 이미 모두가 받았다)
   */
  private onSnowAct(p: Peer<C>, m: Extract<C2S, { t: "snowPut" | "snowAdd" | "snowTake" | "snowBreak" | "snowmanBreak" }>, now: number): void {
    if (!this.snowOk(p)) return;
    const a: SnowAct = m.t === "snowPut" ? "put" : m.t === "snowAdd" ? "add" : m.t === "snowTake" ? "take" : "break";
    const id = m.t === "snowPut" ? undefined : m.id;
    const deny = (why: SnowmanDenyWhy) => {
      this.sendTo(p, { t: "snowmanDenied", why, a, ...(id ? { id } : {}) });
      // 눈사람 허물기는 덩이 모양을 다시 보낼 것이 없다
      if (!id || m.t === "snowmanBreak") return;
      const st = this.stacks.mine(p.visitorId, id);
      if (st) this.sendTo(p, { t: "snowStack", st });
      else if (!this.stacks.has(id)) this.sendTo(p, { t: "snowStackGone", id, sid: p.sid });
    };
    if (now - (p.lastSnowActAt ?? -Infinity) < SNOW_ACT_INTERVAL_MS) return deny("wait");
    // 11/18 보안: 1분에 SNOW_ACTS_PER_MINUTE번까지 (놓고 들기 반복으로 저장·방송을 늘리는 것 방지)
    const acts = (p.snowActs ?? []).filter((at) => now - at < 60_000);
    p.snowActs = acts;
    if (acts.length >= SNOW_ACTS_PER_MINUTE) return deny("wait");
    acts.push(now);
    this.stacks.prune(now, this.inCamp);
    // 11/26 다 세운 내 눈사람 허물기 (웹은 길게 눌러야 보낸다): 세운 사람만, 가까이에서. 저장하고 모두에게 snowmanGone.brk (눈가루)
    if (m.t === "snowmanBreak") {
      const r = this.snowmen.dismantle(p.visitorId, m.id, p.x, p.y, now);
      if (!r.ok) return deny(r.why);
      p.lastSnowActAt = now;
      this.host.snowmenChanged?.(this.snowmen.snapshot());
      return this.broadcastMap("camp", encodeEvent({ t: "snowmanGone", id: m.id, brk: true }));
    }
    // 11/26 허물기: 내 덩이만, 서 있는 자리 가까이에서. 손은 그대로 (들고 있던 것도 그대로) — 모두에게 brk (눈가루)
    if (m.t === "snowBreak") {
      const r = this.stacks.dismantle(p.visitorId, m.id, p.x, p.y);
      if (!r.ok) return deny(r.why);
      p.lastSnowActAt = now;
      this.stacksChanged();
      return this.broadcastMap("camp", encodeEvent({ t: "snowStackGone", id: r.st.id, sid: p.sid, brk: true }));
    }
    if (m.t === "snowTake") {
      const r = this.stacks.take(p.visitorId, m.id, now);
      if (!r.ok) return deny(r.why);
      p.lastSnowActAt = now;
      this.setHold(p, { s: r.s });
      this.stacksChanged();
      if (r.st) return this.broadcastMap("camp", encodeEvent({ t: "snowStack", st: r.st, h: r.s }));
      return this.broadcastMap("camp", encodeEvent({ t: "snowStackGone", id: m.id, sid: p.sid, took: r.s }));
    }
    if (m.t === "snowPut") {
      const r = this.stacks.put(p.visitorId, p.sid, m.x, m.y, m.s, now, this.snowmen.spots(now));
      if (!r.ok) return deny(r.why);
      p.lastSnowActAt = now;
      this.setHold(p, undefined);
      this.stacksChanged();
      for (const g of r.gone) this.broadcastMap("camp", encodeEvent({ t: "snowStackGone", id: g, sid: p.sid }));
      return this.broadcastMap("camp", encodeEvent({ t: "snowStack", st: r.st }));
    }
    const cur = this.stacks.mine(p.visitorId, m.id);
    if (!cur) return deny("lost");
    const sizes: SnowBall[] = [...cur.sizes, m.s];
    // 세 단째: 눈사람을 세울 수 있을 때만 올린다 (못 세우면 두 단 그대로 — 웹은 머리를 다시 든다)
    if (sizes.length === 3) {
      if (now - (p.lastSnowmanAt ?? -Infinity) < SNOWMAN_BUILD_INTERVAL_MS) return deny("wait");
      const st = this.stacks.add(p.visitorId, m.id, m.s, now);
      if (!st.ok) return deny(st.why);
      if (!SnowStackYard.done(st.st)) return; // 크기 순서는 add가 이미 봤다 (세 단이면 언제나 몸통·배·머리)
      const seed = Math.floor((this.host.random ? this.host.random() : Math.random()) * 0x7fffffff);
      // 11/18 사용자 「내 위치에서 멀어도 상관없게」: 서버 위치와의 거리는 보지 않는다 (자리 판정·간격·4초 간격만)
      const r = this.snowmen.build(p.visitorId, p.name, cur.x, cur.y, now, seed);
      if (!r.ok) {
        this.stacks.take(p.visitorId, m.id, now);
        return deny(r.why);
      }
      p.lastSnowActAt = now;
      p.lastSnowmanAt = now;
      this.stacks.remove(m.id);
      this.setHold(p, undefined);
      this.stacksChanged();
      this.host.snowmenChanged?.(this.snowmen.snapshot());
      this.broadcastMap("camp", encodeEvent({ t: "snowman", s: r.s, sid: p.sid, st: m.id }));
      for (const g of r.gone) this.broadcastMap("camp", encodeEvent({ t: "snowmanGone", id: g }));
      return;
    }
    const r = this.stacks.add(p.visitorId, m.id, m.s, now);
    if (!r.ok) return deny(r.why);
    p.lastSnowActAt = now;
    this.setHold(p, undefined);
    this.stacksChanged();
    this.broadcastMap("camp", encodeEvent({ t: "snowStack", st: r.st }));
  }

  private stacksChanged(): void {
    this.host.snowStacksChanged?.(this.stacks.snapshot());
  }

  /** 11/18 캠핑장을 떠났다 (다른 맵·퇴장): 들고 있던 눈덩이를 지우고, 쌓던 덩이를 캠핑장 사람들에게서 지운다 */
  private leaveSnow(p: Peer<C>): void {
    p.snow = undefined;
    const gone = this.stacks.dropOwner(p.visitorId);
    if (!gone.length) return;
    this.stacksChanged();
    for (const st of gone) this.broadcastMap("camp", encodeEvent({ t: "snowStackGone", id: st.id, sid: st.sid }), p.sid);
  }

  /**
   * 11/16 이스터에그 「다람쥐를 뿌려라」: 중계된 (가린) 채팅 줄이 주문이면, 채널 쿨다운이 지났을 때 채널 전체(모든 맵, 실내 포함 — 보낸 사람도)에 squirrels.
   * 쿨다운은 DO 메모리에만 (잠들었다 깨면 처음부터 — 괜찮다). 방(집·사냥터)에서 친 줄은 보지 않는다
   */
  private maybeSquirrels(p: Peer<C>, text: string, now: number): void {
    if (this.cfg.room || !isSquirrelRainChat(text)) return;
    if (!squirrelRainReady(this.squirrelAt, now)) {
      // 11/17 쿨다운 중: 운영자에게만 남은 시간을 알려 준다 (다른 사람에게는 아무 반응 없음)
      if (p.staff) this.sendTo(p, { t: "squirrelsWait", left: squirrelRainLeftMs(this.squirrelAt, now) });
      return;
    }
    this.squirrelAt = now;
    const seed = Math.floor((this.host.random ? this.host.random() : Math.random()) * 0x7fffffff);
    this.broadcast(encodeEvent({ t: "squirrels", by: p.name, seed, at: now }));
  }

  /**
   * 11/16 귓속말: 같은 채널(마을·캠핑장 모두) 접속자 한 사람에게만. 채팅과 같은 토큰 버킷·가리기를 쓰고, 기록(chatLog)·말풍선에는 남기지 않는다.
   * 받는 사람은 "to text"를 접속자 이름으로 다시 맞춰 고른다 (공백 든 이름 — 가장 긴 이름). 실내에 있어도 주고받는다 (말풍선이 아니라 채팅창 줄이라).
   * 재연결 유예 중(소켓 없음)인 사람은 없는 것으로 본다. 보낸 사람에게도 같은 줄을 돌려준다 (가린 글 그대로 채팅창에)
   */
  private onWhisper(p: Peer<C>, to: string, text: string, now: number): void {
    if (this.cfg.room || !takeChatToken((p.chatBucket ??= newChatBucket()), now)) return;
    const online = [...this.peers.values()].filter((q) => q.conn);
    const hit = matchWhisperTarget(`${to} ${text}`, online, (q) => q.name);
    if (!hit) return this.sendTo(p, { t: "whisperFail", to, why: "absent" });
    const q = hit.target;
    if (q.sid === p.sid) return this.sendTo(p, { t: "whisperFail", to, why: "self" });
    const data = encodeEvent({
      t: "whisper",
      id: `w${now.toString(36)}.${(++this.whisperSeq).toString(36)}`,
      at: now,
      from: p.sid,
      fromName: p.name,
      to: q.sid,
      toName: q.name,
      text: maskChat(hit.text),
      ...(p.staff ? { staff: true as const } : {}),
      ...(p.mgr ? { mgr: true as const } : {}),
      ...(q.staff ? { toStaff: true as const } : {}),
      ...(q.mgr ? { toMgr: true as const } : {}),
    });
    if (q.conn) this.host.send(q.conn, data);
    if (p.conn) this.host.send(p.conn, data);
  }

  /**
   * 11/15 맵 옮기기 (버스): 연결은 그대로, 같은 채널 안에서 마을 ↔ 캠핑장.
   * 허락(토큰 camp)이 없거나 그 맵 범위 밖이면 지금 맵 그대로 mapped (클라이언트가 되돌린다).
   * 같은 맵이면 순간이동처럼 자리만 옮기고 mapped. 다른 맵이면 switchMap + mapped + 그 맵 채팅 기록
   */
  private onMap(p: Peer<C>, target: MapId, at: Point, now: number): void {
    const cur = mapOfPeer(p);
    const ok = mapAllowed(target, p) && inMapBounds(target, at.x, at.y);
    if (ok && target === cur) {
      if (p.seatId) this.releaseSeat(p);
      if (p.state === STATE.sitChair || p.state === STATE.sitGround || spotKindOfState(p.state)) p.state = STATE.idle;
      p.x = p.tx = at.x;
      p.y = p.ty = at.y;
      this.chasing.delete(p.sid);
      p.budget = new MoveBudget(now);
      this.markDirty(p);
    } else if (ok) {
      this.switchMap(p, target, this.clearOfSeats(at, p.sid, target), now);
    }
    const map = mapOfPeer(p);
    this.sendTo(p, { t: "mapped", m: map, peers: this.othersOf(p), seats: this.seatsOf(map) });
    if (ok && target !== cur && map === "camp") this.sendSnowmen(p, now);
    if (ok && map === "camp") this.raftArrive(p, target !== cur, now);
    if (ok && target !== cur) this.sendChatLog(p, now);
  }

  /**
   * 11/20 운영자 순간이동 (staffTp.ts): sid 옆 at으로. 친구 여부·쿨다운 없이 (겹친 요청만 STAFF_TP_GAP_MS로 거른다).
   * 상대가 없거나 실내(away)거나 at이 상대 서버 위치에서 STAFF_TP_NEAR_PX보다 멀면 tpNo. 내가 실내여도 받지 않는다.
   * want = 화면이 생각한 상대 맵: 지금 맵과 다르면(맵 옮기기 중) 결과와 상관없이 mapped로 답한다 (onMap과 같은 약속).
   * 떠난 자리·도착한 자리에 tpFx (각 맵 사람들에게, 나 빼고 — 내 화면은 직접 그린다)
   */
  private onStaffTp(p: Peer<C>, sid: number, want: MapId, at: Point, now: number): void {
    const cur = mapOfPeer(p);
    const crossing = want !== cur;
    const deny = (why: StaffTpDenyWhy) => {
      this.sendTo(p, { t: "tpNo", why });
      if (crossing) this.sendTo(p, { t: "mapped", m: cur, peers: this.othersOf(p), seats: this.seatsOf(cur) });
    };
    if (now - (p.lastTpAt ?? -Infinity) < STAFF_TP_GAP_MS) return crossing ? deny("far") : undefined;
    p.lastTpAt = now;
    const q = this.peers.get(sid);
    if (!q || q === p) return deny("gone");
    if (q.away) return deny("inside");
    const target = mapOfPeer(q);
    // 그사이 상대가 다른 맵으로 갔으면 받지 않는다 (화면이 다시 고른다). 버스 안(away)은 맵 옮기기 중일 때만
    if (target !== want || (p.away && !crossing)) return deny("far");
    if (Math.hypot(at.x - q.x, at.y - q.y) > STAFF_TP_NEAR_PX || !inMapBounds(target, at.x, at.y) || !mapAllowed(target, p)) return deny("far");
    const from = { x: Math.round(p.x), y: Math.round(p.y) };
    p.lastTeleportAt = now;
    if (target === cur) {
      if (p.seatId) this.releaseSeat(p);
      if (p.state === STATE.sitChair || p.state === STATE.sitGround || spotKindOfState(p.state)) p.state = STATE.idle;
      p.x = p.tx = at.x;
      p.y = p.ty = at.y;
      this.chasing.delete(p.sid);
      p.budget = new MoveBudget(now);
      this.markDirty(p);
      this.raftBlocked(p, p.x, p.y, now);
    } else {
      p.lastMapAt = now;
      this.switchMap(p, target, this.clearOfSeats(at, p.sid, target), now);
    }
    // 떠난 자리: 맵을 옮기는 중이면 이미 숨어 있지만(버스 안) 사라진 자리 그대로라 거기에
    this.broadcastMap(cur, encodeEvent({ t: "tpFx", sid: p.sid, x: from.x, y: from.y, k: "out" }), p.sid);
    this.broadcastMap(target, encodeEvent({ t: "tpFx", sid: p.sid, x: Math.round(p.x), y: Math.round(p.y), k: "in" }), p.sid);
    if (crossing) {
      this.sendTo(p, { t: "mapped", m: target, peers: this.othersOf(p), seats: this.seatsOf(target) });
      if (target === "camp") this.sendSnowmen(p, now);
      if (target === "camp") this.raftArrive(p, true, now);
      this.sendChatLog(p, now);
    }
  }

  /**
   * 맵을 옮긴다 (본인에게는 보내지 않는다 — 부른 쪽이 mapped·welcome으로 알린다).
   * 좌석(배 낚싯대·벤치 상태 포함)을 놓고 실내 표시를 끄고, 옛 맵 사람들에게 leave, 새 맵 사람들에게 join.
   * 위치는 속도 검증 없이 바로 (순간이동과 같다). 타는 펫은 그대로 탄다
   */
  private switchMap(p: Peer<C>, target: MapId, to: Point, now: number): void {
    const from = mapOfPeer(p);
    if (p.seatId) this.releaseSeat(p);
    if (p.state === STATE.sitChair || p.state === STATE.sitGround || spotKindOfState(p.state)) p.state = STATE.idle;
    if (from === "camp" && !this.cfg.room) this.leaveSnow(p);
    p.away = undefined;
    p.place = undefined;
    p.house = undefined;
    p.x = p.tx = to.x;
    p.y = p.ty = to.y;
    this.chasing.delete(p.sid);
    this.dirty.delete(p.sid); // 새 맵 사람들은 join으로 지금 자리를 받는다
    p.budget = new MoveBudget(now);
    this.broadcastMap(from, encodeEvent({ t: "leave", sid: p.sid }), p.sid);
    p.map = target === "village" ? undefined : target;
    this.broadcastMap(target, encodeEvent({ t: "join", ...this.info(p) }), p.sid);
    this.save(p);
    this.host.liveChanged?.(true);
  }

  /** 월드 채널은 그 사람이 있는 맵 범위, 방은 크기를 모르므로 u16 범위만 */
  private inBounds(x: number, y: number, map: MapId): boolean {
    return this.cfg.room ? x >= 0 && x <= 0xffff && y >= 0 && y <= 0xffff : inMapBounds(map, x, y);
  }

  /**
   * 11/22 기다리는 look 증서를 토큰이 있으면 반영하고, 없으면 tick에서 다시 본다 (검증 CPU·브로드캐스트는 토큰만큼만).
   * 연결이 없으면 버린다 (다시 붙으면 클라이언트가 지금 착용 증서를 다시 보낸다)
   */
  private flushLook(p: Peer<C>, now: number): void {
    const grant = p.lookPending;
    if (grant === undefined || !p.conn) {
      p.lookPending = undefined;
      this.lookWaiting.delete(p.sid);
      return;
    }
    if (!takeLookToken((p.lookBucket ??= newLookBucket()), now)) {
      if (!this.lookWaiting.has(p.sid)) {
        this.lookWaiting.add(p.sid);
        this.host.requestTick();
      }
      return;
    }
    p.lookPending = undefined;
    this.lookWaiting.delete(p.sid);
    this.verifyThenApply(p, "look", grant);
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
      // 31번: 운영자 전용 꾸미기·몸은 입장 토큰이 운영자(staff)인 연결만 (아니면 빼고 후드 유령)
      // 11/16 매니저: 새 웹이 낸 증서는 지금 매니저인지(1·0)도 싣는다 (옛 증서엔 없으니 그대로). 매니저 전용 칭호는 매니저일 때만
      if (g.mgr !== undefined) p.mgr = g.mgr ? true : undefined;
      p.look = mgrGateLook(staffGateLook(g.look, !!p.staff), !!p.mgr);
      // 46·25번: 새 웹이 낸 증서는 염색·몸 모양도 싣는다 (옛 증서엔 없으니 그대로 둔다)
      if (g.dye !== undefined) p.dye = hasDye(g.dye) ? g.dye : undefined;
      if (g.body !== undefined) p.body = staffGateBody(g.body, !!p.staff);
      // 주간 1위: 새 웹이 낸 증서는 지금 1위 값(0 = 1위 아님, 오라 끔 표시 포함)도 싣는다 (옛 증서엔 없으니 그대로 둔다)
      if (g.champ !== undefined) p.champ = g.champ || undefined;
      this.save(p);
      this.host.liveChanged?.(true);
      const extra = { ...(g.dye !== undefined ? { dye: p.dye ?? {} } : {}), ...(g.body !== undefined ? { body: p.body } : {}), ...(g.champ !== undefined ? { champ: p.champ ?? 0 } : {}), ...(g.mgr !== undefined ? { mgr: p.mgr ? (1 as const) : (0 as const) } : {}) };
      // 11/17 새 펫은 옛 화면용 비슷한 펫을 덧붙여 보낸다 (protocol PET_FALLBACK — 저장하는 p.look은 그대로)
      this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "look", sid: p.sid, look: lookWithPetFallback(p.look), ...extra }));
      // 타던 펫을 집에 두거나 타지 못하는 펫으로 바꿨으면 내린다
      if (p.ride && !ridePetOfLook(p.look)) this.clearRide(p);
      return;
    }
    if (g.kind === "megaphone") return this.applyMegaphone(g);
    if (g.kind === "raft") {
      const ch = this.host.channelNo?.();
      if (this.cfg.room || (ch !== undefined && ch !== g.ch)) return;
      return this.setRaft(p.visitorId, p.name, g.n, g.until, Date.now());
    }
    if (g.kind === "bbq") {
      // 한 접시는 한 번만 (같은 증서를 다시 보내도 늘어나지 않는다)
      if (!this.host.claimNonce(`b:${g.nonce}`, Math.max(g.until, g.exp * 1000))) return;
      // 효과는 갈래마다 따로 겹친다 (커지기·빨라지기·취기) — 같은 갈래만 새 것이 덮어쓴다
      const kind = bbqItem(g.item)?.kind;
      const tipsy = kind === "drunk" || kind === "sober";
      if (tipsy && g.lv !== undefined && g.at !== undefined) p.drunk = g.lv > 0 ? { lv: g.lv, at: g.at } : undefined;
      else if (kind === "speed") p.spd = { i: g.item, u: g.until };
      else p.bbq = { i: g.item, u: g.until };
      this.save(p);
      this.host.liveChanged?.(true);
      this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "bbq", sid: p.sid, i: g.item, u: g.until, ...(tipsy && g.lv !== undefined && g.at !== undefined ? { lv: g.lv, at: g.at } : {}) }));
      // 커졌으면 타고 있던 것에서 내린다 (클라이언트는 타는 동안 못 먹게 막지만, 서버도 "커진 채로 타기"가 없게 맞춘다)
      if (kind === "grow" && (bbqItem(g.item)?.scale ?? 1) > 1) {
        this.clearRide(p);
        const seat = p.seatId ? seatSlotIn(mapOfPeer(p), p.seatId) : undefined;
        if (seat && isRideSpotKind(seat.kind)) {
          this.releaseSeat(p);
          if (p.state === seat.state) p.state = STATE.idle;
          this.markDirty(p);
        }
      }
      return;
    }
    if (g.kind !== "firework") return; // 고블린 증서는 실시간 서버가 내주기만 한다 (받지 않는다)
    const map = mapOfPeer(p);
    const showMs = fireworkShowMs(g.item);
    const now = Date.now();
    const wait = showMs > 0 ? Math.max(0, (this.showUntil.get(map) ?? 0) - now) : 0;
    if (wait > FIREWORK_SHOW_QUEUE_MS) return this.sendTo(p, { t: "fireworkBusy", left: wait }); // nonce는 남겨 둔다
    if (!this.host.claimNonce(g.nonce, g.exp * 1000)) return; // 이미 쏜 폭죽
    if (showMs > 0) this.showUntil.set(map, now + wait + showMs);
    this.broadcastMap(map, encodeEvent({ t: "firework", sid: p.sid, item: g.item, x: p.x, y: p.y, ...(wait > 0 ? { w: wait } : {}) }));
  }

  /**
   * 23번 확성기: 서명된 닉네임·문장을 그대로 이 채널 모두(보낸 사람 포함)에게 보낸다. nonce는 채널마다 한 번만.
   * scope=channel이면 증서의 채널이 이 채널이어야 하고, all이면 다른 열린 채널에도 전한다(호스트가 nonce로 중복을 막는다)
   */
  private applyMegaphone(g: Extract<Grant, { kind: "megaphone" }>): void {
    const ch = this.host.channelNo?.();
    if (g.scope === "channel" && ch !== undefined && ch !== g.ch) return;
    if (!this.host.claimNonce(`m:${g.nonce}`, g.exp * 1000)) return; // 이미 외친 확성기
    const data = encodeEvent({ t: "megaphone", id: g.nonce, name: g.name, text: g.text, scope: g.scope, ch: g.ch, at: Date.now(), ...(g.staff ? { staff: true as const } : {}), ...(g.mgr ? { mgr: true as const } : {}) });
    this.broadcast(data);
    if (g.scope === "all") this.host.relayMegaphone?.(g.nonce, g.exp * 1000, data);
  }

  /** 다른 채널에서 전해 온 모든 채널 확성기 (RPC). 같은 nonce는 한 번만 방송한다. 방은 받지 않는다 */
  relayedMegaphone(nonce: string, until: number, data: string): boolean {
    if (this.cfg.room || !this.host.claimNonce(`m:${nonce}`, until)) return false;
    this.broadcast(data);
    return true;
  }

  /**
   * 11/17 확성기 창 고정 공지가 바뀌었다 (Worker의 /internal/pin → RPC). 이 채널 모두에게 그대로 한 번 보낸다.
   * 같은 내용을 두 번 받아도 화면은 같은 칸을 덮어쓸 뿐이라 nonce를 따로 잡지 않는다. 방은 받지 않는다 (월드 채널 소켓이 받는다)
   */
  relayedPin(data: string): boolean {
    if (this.cfg.room) return false;
    this.broadcast(data);
    return true;
  }

  /**
   * 11/26 집 바뀜 알림 (Worker의 /internal/homes → RPC). 구역마다 HOMES_GAP_MS에 한 번만 이 채널 모두에게 homes 한 줄,
   * 그 사이 알림은 가장 새 v로 묶어 둔다 → flushIn ms 뒤 flushHomes를 불러야 한다 (null이면 기다리는 것 없음). 방은 받지 않는다
   */
  relayHomes(zone: HomesZone, v: number, now: number): { ok: boolean; flushIn: number | null } {
    if (this.cfg.room) return { ok: false, flushIn: null };
    const r = this.homes.offer(zone, v, now);
    if (r.send !== null) this.broadcast(homesEvent({ zone, v: r.send }));
    if (this.homes.remember(zone, v)) this.host.homesChanged?.(this.homes.snapshot());
    return { ok: true, flushIn: r.flushIn };
  }

  /** 묶어 둔 집 바뀜 알림 중 간격이 끝난 것을 보낸다. 다음에 부를 때까지 남은 ms (없으면 null) */
  flushHomes(now: number): number | null {
    const r = this.homes.flush(now);
    for (const [zone, v] of r.send) this.broadcast(homesEvent({ zone, v }));
    return r.flushIn;
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
  private onSit(p: Peer<C>, seatId: string, now = Date.now()): void {
    const map = mapOfPeer(p);
    const found = seatSlotIn(map, seatId);
    // 열기구: 출발장에 있을 때(태우는 동안)만 탄다 — 날아가 있는 기구의 자리는 거절 (운항 시간표 = 서버 시계)
    const air = found?.kind === "balloon" ? balloonSeatById(seatId) : undefined;
    if (air && this.seats.get(seatKey(map, seatId)) !== p.sid && !balloonBoarding(air.balloon, now, BALLOON_BOARD_GRACE_MS)) {
      return this.sendTo(p, { t: "seatDenied", seatId });
    }
    // 3번: 집 안 가구 자리는 방(집)에서만, 월드 자리(의자·나무 …)는 월드 채널에서만
    const seat = found && isIndoorSpot(found.kind) === !!this.cfg.room ? found : undefined;
    const holder = this.seats.get(seatKey(map, seatId));
    if (seat && holder === p.sid) return this.sendTo(p, { t: "seat", seatId, sid: p.sid }); // 재요청: 이미 내 자리
    // 11/15 바베큐로 커진 동안에는 타는 자리(그네·배·놀이기구·범퍼카)에 못 앉는다
    if (seat && this.tooBigToRide(p, seat.kind, now)) return this.sendTo(p, { t: "seatDenied", seatId });
    // 11/17 바닷가 놀거리(튜브·제트스키·카약)는 술이 깰 때까지 못 타요 (클라이언트도 「술 마시고 물에…」로 막아요)
    if (seat && map === "sea" && seat.kind === "boat" && drunkNoSea(p.drunk, now)) return this.sendTo(p, { t: "seatDenied", seatId });
    // 긴 벤치에서 앉은 채 옆자리로: 같은 가구의 다른 좌석이면 거리와 상관없이 옮겨 앉는다
    const old = p.seatId ? seatSlotIn(map, p.seatId) : undefined;
    const slide = !!seat && !!old && old.furnitureId !== null && old.furnitureId === seat.furnitureId;
    // 위치는 클라이언트가 마지막으로 보고한 지점으로 잰다 (서버 위치가 속도 예산 때문에 잠깐 뒤처져 있어도 거절하지 않게).
    // 11/18 보안: 다만 그 지점이 서버 위치에서 SEAT_TARGET_SLACK 안일 때만 — 먼 좌석 좌표를 MOVE로 찍고 앉아 순간이동하는 것을 막는다
    this.chase(p, now);
    const at = Math.hypot(p.tx - p.x, p.ty - p.y) <= SEAT_TARGET_SLACK ? { x: p.tx, y: p.ty } : { x: p.x, y: p.y };
    // 2인승 조각배(F13): 같은 배의 다른 자리에 앉은 사람 곁이면 나루터(앵커)에서 멀어도 같이 탄다 — 배가 물가에 와 있다
    const beside = !!seat && !slide && holder === undefined && this.besideCompanion(seat, at, p.sid, map);
    if (!seat || holder !== undefined || (!slide && !beside && dist(seat, at) > (seat.radius ?? SEAT_SERVER_RADIUS))) {
      return this.sendTo(p, { t: "seatDenied", seatId });
    }
    // 11/27 좌대 낚시 자리는 그 좌대 입장권 주인만
    if (this.raftSeatBlocked(p, seatId, now)) return this.sendTo(p, { t: "seatDenied", seatId });
    this.occupy(p, seat, slide || beside);
  }

  /** 움직이는 자리(조각배)에서: 같은 배(furnitureId)의 다른 자리에 앉은 사람이 at 가까이 있는지 */
  private besideCompanion(seat: SeatSlot, at: Point, self: number, map: MapId): boolean {
    if (!seat.mobile || seat.furnitureId === null) return false;
    const r = seat.radius ?? SEAT_SERVER_RADIUS;
    for (const [id, sid] of Object.entries(this.seatsOf(map))) {
      if (sid === self || id === seat.id) continue;
      if (seatSlotIn(map, id)?.furnitureId !== seat.furnitureId) continue;
      const q = this.peers.get(sid);
      if (q && dist(q, at) <= r) return true;
    }
    return false;
  }

  /** MOVE로 들어온 나무·그네 상태의 자리 잡기 (이전 클라이언트용). 잡았으면(이미 내 자리 포함) true. 거절 알림은 보내지 않는다 */
  private claimSpot(p: Peer<C>, seatId: string, now = Date.now()): boolean {
    const map = mapOfPeer(p);
    const seat = seatSlotIn(map, seatId);
    if (!seat) return false;
    const holder = this.seats.get(seatKey(map, seatId));
    if (holder === p.sid) return true;
    // 열기구: 날아가 있는 기구의 자리는 MOVE로도 잡지 않는다 (onSit과 같은 운항 시간표)
    const air = seat.kind === "balloon" ? balloonSeatById(seatId) : undefined;
    if (air && !balloonBoarding(air.balloon, now, BALLOON_BOARD_GRACE_MS)) return false;
    if (this.tooBigToRide(p, seat.kind, now)) return false;
    if (this.raftSeatBlocked(p, seatId, now)) return false;
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
    const map = mapOfPeer(p);
    const prevSeat = p.seatId;
    if (prevSeat) {
      this.seats.delete(seatKey(map, prevSeat));
      p.seatId = null;
    }
    this.seats.set(seatKey(map, seatId), p.sid);
    p.seatId = seatId;
    // 11/16 r13 떠다니는 자리(바닷가 튜브)는 바다 어디서든 올라타요 → 탄 곳 그대로 (앵커로 끌어가지 않아요)
    if (!(seat.mobile && (slide || seat.drift))) {
      // 11/18 보안: 앉으면서 서버 위치가 크게 옮겨지면 순간이동으로 친다 (고블린 2초 제한)
      if (Math.hypot(seat.x - p.x, seat.y - p.y) > SEAT_JUMP_PX) p.lastTeleportAt = Date.now();
      p.x = p.tx = seat.x;
      p.y = p.ty = seat.y;
    }
    p.state = seat.state;
    p.dir = seat.facing;
    // 벤치 상태는 상호작용 중이면 유지 (의자·그네·나무·해먹·배·놀이기구·낚시 등 어떤 자리든)
    // 앉기·낚시·놀이기구·배 — 어떤 자리든 차지하면 타던 펫에서 내린다
    this.clearRide(p);
    // 배 위 낚싯대는 조각배 자리 사이를 옮겨 앉을 때만 이어 간다
    if (!boatSeatById(seatId)) this.clearRod(p);
    this.chasing.delete(p.sid);
    this.markDirty(p);
    this.broadcastMap(map, encodeEvent({ t: "seat", seatId, sid: p.sid }));
    if (prevSeat) this.broadcastMap(map, encodeEvent({ t: "seat", seatId: prevSeat, sid: null }));
    this.host.liveChanged?.(true);
  }

  private onStand(p: Peer<C>): void {
    if (!p.seatId) return;
    const held = seatSlotIn(mapOfPeer(p), p.seatId);
    this.releaseSeat(p);
    if (p.state === STATE.sitChair || (held && p.state === held.state)) p.state = STATE.idle;
    this.markDirty(p);
  }

  /**
   * 24번 벤치 상태: 상호작용 중(어떤 자리든 차지했거나 수영·잠수)일 때만 받는다. 빈 문자열이면 푼다.
   * 같은 채널 모두(보낸 사람 포함 — 서버가 받아들였다는 확인)에게 알리고, 늦게 온 사람은 PeerInfo.mood로 받는다
   */
  private onMood(p: Peer<C>, m: string): void {
    if (m === "") return this.clearMood(p);
    const seat = p.seatId ? seatSlotIn(mapOfPeer(p), p.seatId) : undefined;
    // 상호작용 중이면 받는다: 어떤 자리든 차지했거나 수영·잠수 중
    const engaged = !!seat || p.state === STATE.swim || p.state === STATE.dive;
    if (!isSeatMood(m) || !engaged || p.mood === m) return;
    p.mood = m;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "mood", sid: p.sid, m }));
  }

  /**
   * 타는 펫 올라타기(on)·내리기. 월드 채널에서, 착용한 펫이 타는 펫이고 자리에 앉아 있지 않으며 물 밖일 때만 켠다.
   * 같은 채널 모두(보낸 사람 포함 — 서버가 받아들였다는 확인)에게 알리고, 늦게 온 사람은 PeerInfo.ride로 받는다
   */
  private onRide(p: Peer<C>, on: boolean): void {
    if (!on) return this.clearRide(p);
    if (this.cfg.room || p.seatId || !ridePetOfLook(p.look)) return;
    // 11/15 바베큐로 커진 동안에는 펫에도 못 탄다 → 보낸 사람에게 "안 탔다"를 알려 화면을 되돌린다
    if (bbqBig(p.bbq, Date.now()) > 1) return this.sendTo(p, { t: "ride", sid: p.sid, on: false });
    if (p.state === STATE.swim || p.state === STATE.dive) return;
    // 이미 타고 있다 (재접속 복원·다시 보낸 요청): 보낸 사람에게만 다시 확인해 준다
    if (p.ride) return this.sendTo(p, { t: "ride", sid: p.sid, on: true });
    p.ride = true;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "ride", sid: p.sid, on: true }));
  }

  /**
   * 4번 배 위 낚싯대 드리우기(on)·거두기. 월드 채널에서 조각배 자리에 앉아 있을 때만 켠다 (자리를 놓으면 releaseSeat이 끈다).
   * 같은 채널 모두(보낸 사람 포함 — 받아들였다는 확인)에게 알리고, 늦게 온 사람은 PeerInfo.rod로 받는다
   */
  private onRod(p: Peer<C>, on: boolean): void {
    if (!on) return this.clearRod(p);
    if (this.cfg.room || !p.seatId || !boatSeatById(p.seatId)) return;
    // 이미 드리우고 있다 (재접속 복원·다시 보낸 요청): 보낸 사람에게만 다시 확인해 준다
    if (p.rod) return this.sendTo(p, { t: "rod", sid: p.sid, on: true });
    p.rod = true;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "rod", sid: p.sid, on: true }));
  }

  /** 배 위 낚싯대를 거두고 모두에게 알린다 (드리우고 있지 않으면 아무것도 안 한다) */
  private clearRod(p: Peer<C>): void {
    if (!p.rod) return;
    p.rod = undefined;
    p.saved = false;
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "rod", sid: p.sid, on: false }));
  }

  /**
   * 실내에 들어감(on)·나옴. 월드 채널만 (방은 그 자체가 실내). 같은 채널의 다른 사람에게 알리고, 늦게 온 사람은 PeerInfo.away로 받는다.
   * 옛 클라이언트는 보내지 않으니 언제나 보인다
   */
  private onAway(p: Peer<C>, on: boolean, now = Date.now(), place?: AwayPlace, house?: string): void {
    if (this.cfg.room) {
      // 11/13 사냥터 방: 탭을 숨겼거나 판을 멈춘 사람 = 자리 비움 (늦게 온 사람은 PeerInfo.away로 받는다). 마을·집 방은 쓰지 않는다
      if (!this.cfg.hunt || !!p.away === on) return;
      p.away = on ? true : undefined;
      this.save(p);
      this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "away", sid: p.sid, on }), p.sid);
      return;
    }
    const where = on ? place : undefined;
    const inHouse = on && place === "house" ? house : undefined;
    if (!!p.away === on) {
      // 실내 안에서 장소만 바뀌었다 (분양 마을 → 집, 집 → 다른 집): 다른 사람 화면은 그대로, 친구 위치용으로만 기억한다
      if (on && (p.place !== where || p.house !== inHouse)) {
        p.place = where;
        p.house = inHouse;
        this.save(p);
      }
      return;
    }
    p.away = on ? true : undefined;
    p.place = where;
    p.house = inHouse;
    this.save(p);
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "away", sid: p.sid, on }), p.sid);
    // 마을로 돌아왔다 → 실내에 있던 동안의 마을 채팅을 다시 맞춘다 (클라이언트가 id로 중복을 거른다)
    if (!on) this.sendChatLog(p, now);
  }

  /** 11/15 바베큐로 커진 채로 타는 자리(isRideSpotKind)에 앉으려 한다 */
  private tooBigToRide(p: Peer<C>, kind: string, now: number): boolean {
    return isRideSpotKind(kind) && bbqBig(p.bbq, now) > 1;
  }

  /** 타는 펫에서 내리고 모두에게 알린다 (타고 있지 않으면 아무것도 안 한다) */
  private clearRide(p: Peer<C>): void {
    if (!p.ride) return;
    p.ride = undefined;
    p.saved = false;
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "ride", sid: p.sid, on: false }));
  }

  /** 벤치 상태를 풀고 모두에게 알린다 (없으면 아무것도 안 한다) */
  private clearMood(p: Peer<C>): void {
    if (!p.mood) return;
    p.mood = undefined;
    p.saved = false;
    this.host.liveChanged?.(true);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "mood", sid: p.sid, m: "" }));
  }

  /** 좌석을 비우고 모두에게 알린다. 상태(state)는 호출한 쪽이 정한다. 벤치 상태도 함께 풀린다 */
  private releaseSeat(p: Peer<C>): void {
    const seatId = p.seatId;
    if (!seatId) return;
    this.seats.delete(seatKey(mapOfPeer(p), seatId));
    p.seatId = null;
    p.saved = false;
    this.clearMood(p);
    this.clearRod(p);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "seat", seatId, sid: null }));
    this.host.liveChanged?.(true);
  }

  /** 랭킹 클릭 등 의도된 순간이동: 속도 검증 없이 범위만 본다. 쿨다운 안의 요청은 무시. */
  private onWarp(p: Peer<C>, to: Point, now: number): void {
    if (!this.inBounds(to.x, to.y, mapOfPeer(p)) || now - p.lastWarpAt < SERVER_WARP_COOLDOWN_MS) return;
    p.lastWarpAt = now;
    if (p.seatId) this.releaseSeat(p);
    if (p.state === STATE.sitChair || p.state === STATE.sitGround || spotKindOfState(p.state)) p.state = STATE.idle;
    p.x = p.tx = to.x;
    p.y = p.ty = to.y;
    this.chasing.delete(p.sid);
    this.markDirty(p); // 96px 넘게 떨어지면 클라이언트가 보간 없이 스냅한다
    this.raftBlocked(p, p.x, p.y, now);
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

  /** 11/17 저장해 둔 캠핑장 눈사람 (DO가 잠들었다 깨어날 때) */
  restoreSnowmen(raw: unknown, now = Date.now()): void {
    if (!this.cfg.room) this.snowmen.restore(raw, now);
  }

  /** 11/18 저장해 둔 쌓는 중인 덩이 (DO가 잠들었다 깨어날 때 — 접속자를 되살린 다음에 부른다) */
  restoreSnowStacks(raw: unknown, now = Date.now()): void {
    if (!this.cfg.room) this.stacks.restore(raw, now);
  }

  /** 11/26 저장해 둔 구역별 마지막 집 바뀜 v (DO가 잠들었다 깨어날 때) */
  restoreHomes(raw: unknown): void {
    if (!this.cfg.room) this.homes.restore(raw);
  }

  /** DO가 고블린 때문에 깨어나야 하는 시각 (없으면 null) */
  // ── 11/27 좌대 입장권 (주인 표는 rafts.ts RaftBoard, 규칙은 protocol raft.ts) ──

  restoreRafts(raw: unknown): void {
    this.rafts.restore(raw);
  }

  /** 좌대 입장권이 끝나 내려보낼 다음 시각 (DO 알람). 없으면 null */
  raftDue(): number | null {
    return this.cfg.room ? null : this.rafts.due();
  }

  /** 시간이 흘렀다: 끝난 입장권을 지우고, 그 주인이 아직 좌대 위면 내려보낸다. 메시지·알람마다 (비교 몇 번뿐) */
  raftCheck(now: number): void {
    if (this.cfg.room || this.rafts.size === 0) return;
    const gone = this.rafts.expire(now);
    if (!gone.length) return;
    for (const { n, v } of gone) {
      const sid = this.byVisitor.get(v);
      const p = sid === undefined ? undefined : this.peers.get(sid);
      if (p && this.onRaft(p) === n) this.ejectRaft(p, n, "end", now);
    }
    this.raftsChanged(now);
  }

  /** 그 사람이 서 있거나 앉아 있는 좌대 번호 (캠핑장 아니면 null) */
  private onRaft(p: Peer<C>): number | null {
    if (mapOfPeer(p) !== "camp") return null;
    return (p.seatId ? campRaftOfSpot(p.seatId) : null) ?? campRaftAt(p.x, p.y) ?? campRaftAt(p.tx, p.ty);
  }

  /** 좌대 막기: 막기가 켜진 연결(rf)이 캠핑장에서 (x,y) 좌대 마루로 가려는데 그 좌대 주인이 아니면 내려보내고 true */
  private raftBlocked(p: Peer<C>, x: number, y: number, now: number): boolean {
    if (this.cfg.room || !p.rf || mapOfPeer(p) !== "camp") return false;
    const n = campRaftAt(x, y);
    if (n === null || this.rafts.holds(p.visitorId, n, now)) return false;
    this.ejectRaft(p, n, "ticket", now);
    return true;
  }

  /** 좌대 낚시 자리는 그 좌대 주인만 */
  private raftSeatBlocked(p: Peer<C>, seatId: string, now: number): boolean {
    if (this.cfg.room || !p.rf || mapOfPeer(p) !== "camp") return false;
    const n = campRaftOfSpot(seatId);
    return n !== null && !this.rafts.holds(p.visitorId, n, now);
  }

  /** 좌대에서 내려보낸다: 자리를 놓고 내릴 자리(1~3 판자 다리, 4~6 사다리 밑 물속)로 옮긴 뒤 본인에게 raftOut */
  private ejectRaft(p: Peer<C>, n: number, why: RaftOutWhy, now: number): void {
    const e = campRaftExit(n, { x: p.x, y: p.y });
    if (p.seatId) this.releaseSeat(p);
    if (p.ride && e.swim) this.clearRide(p);
    p.state = e.swim ? STATE.swim : STATE.idle;
    p.x = p.tx = e.x;
    p.y = p.ty = e.y;
    this.chasing.delete(p.sid);
    p.budget = new MoveBudget(now);
    this.markDirty(p);
    this.sendTo(p, { t: "raftOut", n, x: e.x, y: e.y, why });
    this.host.liveChanged?.(true);
  }

  /** 증서·입장 토큰: n번을 그 사람 것으로. 그 좌대에 서 있던 다른 사람은 내려보낸다 */
  private setRaft(visitorId: string, name: string, n: number, u: number, now: number): void {
    if (this.cfg.room || u + 2_000 <= now) return;
    if (!this.rafts.set(visitorId, name, n, u)) return;
    for (const q of this.peers.values()) if (q.visitorId !== visitorId && this.onRaft(q) === n) this.ejectRaft(q, n, "sold", now);
    this.raftsChanged(now);
  }

  private raftsChanged(now: number): void {
    this.broadcastMap("camp", encodeEvent({ t: "rafts", b: this.rafts.list(now) }));
    this.host.raftsChanged?.(this.rafts.snapshot());
  }

  /** 캠핑장에 들어왔다(입장·재접속·맵 옮김·순간이동): 주인 표를 보내고(fresh), 지금 자리가 남의 좌대면 내려보낸다 */
  private raftArrive(p: Peer<C>, fresh: boolean, now: number): void {
    if (this.cfg.room || mapOfPeer(p) !== "camp") return;
    if (fresh) this.sendTo(p, { t: "rafts", b: this.rafts.list(now) });
    this.raftBlocked(p, p.x, p.y, now);
  }

  goblinDue(): number | null {
    return this.goblinOn ? this.goblin.due(this.online) : null;
  }

  /** 시간이 흘렀다: 사라짐·등장을 알린다. 메시지·입장·알람마다 부른다 (비교 몇 번뿐) */
  goblinCheck(now: number): void {
    if (!this.goblinOn) return;
    const r = this.goblin.check(now, this.online, (m) => this.mapOpen(m));
    // 11/26 맵 무작위(마을 50·바닷가 25·캠핑장 25) — 나타남·사라짐은 채널 모두에게 (다른 맵 사람은 「○○에 나타났어요」 + 정류장 쪽 화살표)
    if (r.gone) this.broadcast(encodeEvent({ t: "goblinGone", id: r.gone }));
    if (r.spawned) this.broadcast(goblinSpawnEvent(r.spawned));
    if (r.changed) this.host.goblinChanged?.(this.goblin.state);
  }

  /** 11/26 이 맵에 갈 수 있는 사람이 채널에 있다 (입장 토큰 허락 — 바닷가·캠핑장이 닫힌 서버면 그 몫은 마을로) */
  private mapOpen(m: MapId): boolean {
    if (m === "village") return true;
    for (const p of this.peers.values()) if (mapAllowed(m, p)) return true;
    return false;
  }

  /** 개발용 훅: 지금 바로 나오게 한다 (이미 나와 있으면 그대로). 접속자가 없으면 null. map = 11/26 맵을 정해서 (없으면 확률대로) */
  forceGoblin(now: number, map?: MapId): GoblinState["cur"] {
    if (!this.goblinOn || this.online === 0) return null;
    this.goblinCheck(now);
    if (!this.goblin.visible(now)) {
      this.broadcast(goblinSpawnEvent(this.goblin.spawn(now, (m) => this.mapOpen(m), map)));
      this.host.goblinChanged?.(this.goblin.state);
    }
    return this.goblin.state.cur;
  }

  /** 잡기 요청: 가장 먼저 닿은 한 명만. 위치는 서버가 아는 값(마지막 보고·서버 추적 위치 중 가까운 쪽)으로 잰다 */
  private onGoblinClaim(p: Peer<C>, id: string, now: number): void {
    // 11/18 보안: 실내(away — 다른 사람 화면에 안 보이는 상태)에서는 잡지 못한다
    // 11/26 고블린이 나타난 맵에 있어야 한다 (GoblinCore.claim이 맵을 본다)
    if (!this.goblinOn || !p.conn || p.away) return;
    // 순간이동(warp·같은 맵 옮기기, 11/18 입장 스폰·재접속 위치·좌석으로 옮겨 앉기) 바로 뒤에는 잡지 못한다 — 고블린 위로 순간이동해 먼저 잡는 봇을 막는다
    if (now - Math.max(p.lastWarpAt, p.lastMapAt ?? -Infinity, p.lastTeleportAt ?? -Infinity) < GOBLIN_AFTER_TELEPORT_MS) return;
    this.goblinCheck(now);
    this.chase(p, now); // 그동안 쌓인 속도 예산만큼 서버 위치를 먼저 따라잡는다
    // 클라이언트가 보고한 목표 지점은 서버 위치 가까이일 때만 인정한다 (목표만 고블린 위에 찍는 속임 방지)
    const positions = [{ x: p.x, y: p.y }];
    if (Math.hypot(p.tx - p.x, p.ty - p.y) <= GOBLIN_TARGET_SLACK) positions.push({ x: p.tx, y: p.ty });
    const points = this.goblin.claim(id, p.visitorId, positions, now, mapOfPeer(p));
    if (points === null) return;
    this.host.goblinChanged?.(this.goblin.state);
    // 11/19 "누가 잡았다"는 채널 모두에게 (캠핑장·바닷가 사람도 띠·채팅 알림으로 본다). 한 마리당 한 번, 이름은 입장 토큰 이름(p.name)
    // 옛 클라이언트: 마을은 예전처럼 토스트, 캠핑장·바닷가 장면은 이 소식을 받아도 아무것도 하지 않는다
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
    // 11/22 토큰을 기다리던 look 증서 (차면 반영 — 반영 결과는 바로 브로드캐스트)
    for (const sid of this.lookWaiting) {
      const p = this.peers.get(sid);
      if (p) this.flushLook(p, now);
      else this.lookWaiting.delete(sid);
    }
    for (const sid of this.chasing) {
      const p = this.peers.get(sid);
      if (p && this.chase(p, now)) this.markDirty(p);
    }
    if (this.dirty.size > 0) {
      // 11/15 맵마다 따로 묶어 그 맵 사람에게만 (마을 사람만 있으면 예전과 똑같이 한 번)
      // 11/16 바닷가도 같은 방식으로 따로 묶는다
      const village: PeerState[] = [];
      let camp: PeerState[] | null = null;
      let sea: PeerState[] | null = null;
      for (const sid of this.dirty) {
        const p = this.peers.get(sid);
        if (!p) continue;
        if (p.map === "camp") (camp ??= []).push(this.state(p));
        else if (p.map === "sea") (sea ??= []).push(this.state(p));
        else village.push(this.state(p));
      }
      this.dirty.clear();
      // 엔트리 63개(512바이트)를 넘으면 나눠 보낸다. 같은 tick 번호를 쓴다.
      for (const [map, entries] of [["village", village], ["camp", camp ?? []], ["sea", sea ?? []]] as const) {
        for (let i = 0; i < entries.length; i += SNAPSHOT_MAX_ENTRIES) {
          this.broadcastMap(map, encodeSnapshot(this.tickNo, entries.slice(i, i + SNAPSHOT_MAX_ENTRIES)));
        }
      }
      this.tickNo = (this.tickNo + 1) & 0xffff;
      return true;
    }
    if (this.chasing.size > 0 || this.lookWaiting.size > 0) return true;
    // 루프가 멈춘다 = 곧 hibernate될 수 있다. MOVE마다 하지 않고 이때 한 번 attachment를 갱신한다.
    for (const p of this.peers.values()) if (!p.saved) this.save(p);
    return false;
  }

  // ── 내부 ──

  private kick(p: Peer<C>, code: number, reason: string): void {
    p.closeCode = code;
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
    if (mapOfPeer(p) === "camp" && !this.cfg.room) this.leaveSnow(p);
    this.peers.delete(p.sid);
    this.byVisitor.delete(p.visitorId);
    this.dirty.delete(p.sid);
    this.chasing.delete(p.sid);
    this.lookWaiting.delete(p.sid);
    this.broadcastMap(mapOfPeer(p), encodeEvent({ t: "leave", sid: p.sid }));
    this.host.countChanged(this.count);
    this.broadcastCount();
    this.host.visitorLeft(p.visitorId, p.closeCode);
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
      const map = mapOfPeer(p);
      if (!seatSlotIn(map, p.seatId) || this.seats.has(seatKey(map, p.seatId))) p.seatId = null;
      else this.seats.set(seatKey(map, p.seatId), p.sid);
    }
    if (!p.seatId) {
      p.mood = undefined;
      p.rod = undefined;
    }
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
    // 11/18 보안: 다시 붙으면(?x=&y= 위치 옮기기 포함) 순간이동으로 친다 — 고블린 2초 제한
    p.lastTeleportAt = now;
    p.lastEmoteAt = -Infinity;
    p.lastGraveEventAt = -Infinity;
    p.lookBucket = undefined;
    p.lookPending = undefined;
    this.lookWaiting.delete(p.sid);
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
  /**
   * 11/15 채널 전체 인원이 바뀌었다 → 모두에게 (맵 상관없이). 같은 맵 사람만 보이게 된 뒤에도 HUD는 채널 전체 인원을 보여 준다.
   * 옛 클라이언트는 모르는 t라 버린다. 방(집·사냥터)은 보내지 않는다. except = 방금 들어온 사람 (welcome에 이미 n이 있다)
   */
  private broadcastCount(except?: number): void {
    if (this.cfg.room) return;
    this.broadcast(encodeEvent({ t: "count", n: this.count }), except);
  }

  private broadcast(data: string | ArrayBuffer, except?: number): void {
    for (const p of this.peers.values()) if (p.conn && p.sid !== except) this.host.send(p.conn, data);
  }

  /** 11/15 그 맵에 있는 접속자에게만 (except 제외). 옛 클라이언트는 언제나 마을에 있다 */
  private broadcastMap(map: MapId, data: string | ArrayBuffer, except?: number): void {
    for (const p of this.peers.values()) if (p.conn && p.sid !== except && mapOfPeer(p) === map) this.host.send(p.conn, data);
  }

  private state(p: Peer<C>): PeerState {
    return { sid: p.sid, x: p.x, y: p.y, state: p.state, dir: p.dir };
  }

  private info(p: Peer<C>): PeerInfo {
    return {
      ...this.state(p),
      name: p.name,
      color: p.color,
      look: lookWithPetFallback(p.look),
      body: p.body,
      ...(hasDye(p.dye) ? { dye: p.dye } : {}),
      ...(p.mood ? { mood: p.mood } : {}),
      ...(p.staff ? { staff: true as const } : {}),
      ...(p.dex ? { dex: p.dex } : {}),
      ...(p.champ ? { champ: p.champ } : {}),
      ...(p.mgr ? { mgr: true as const } : {}),
      ...(p.nb ? { nb: p.nb } : {}),
      ...(p.ride ? { ride: true as const } : {}),
      ...(p.rod ? { rod: true as const } : {}),
      ...(p.away ? { away: true as const } : {}),
      ...(p.bbq ? { bbq: p.bbq } : {}),
      ...(p.spd ? { spd: p.spd } : {}),
      ...(p.drunk ? { drunk: p.drunk } : {}),
      ...(p.snow && p.map === "camp" ? { snow: p.snow } : {}),
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
    // 배 위 낚싯대는 조각배 자리에 앉아 있을 때만 이어 간다
    const rod = r.rod === true && seatId && boatSeatById(seatId) ? { rod: true as const } : {};
    return { sid, visitorId, name, color, x, y, state, dir, seatId, look, body: r.body ?? "hood", ...(hasDye(r.dye) ? { dye: r.dye } : {}), ...mood, ...ride, ...rod, ...(r.away === true ? { away: true as const } : {}), ...(r.away === true && isAwayPlace(r.place) ? { place: r.place } : {}), ...(r.away === true && r.place === "house" && typeof r.house === "string" ? { house: r.house } : {}), ...(r.staff === true ? { staff: true as const } : {}), ...(isDexBadge(r.dex) ? { dex: r.dex } : {}), ...(isChampValue(r.champ) ? { champ: r.champ } : {}), ...(r.mgr === true ? { mgr: true as const } : {}), ...(isSproutUntil(r.nb) ? { nb: r.nb } : {}), joinedAt: r.joinedAt ?? 0, ...(isAwayMap(r.map) ? { map: r.map } : {}), ...(r.camp === true ? { camp: true as const } : {}), ...(r.sea === true ? { sea: true as const } : {}), ...(isBbqEffect(r.bbq) ? { bbq: { i: r.bbq.i, u: r.bbq.u } } : {}), ...(isBbqEffect(r.spd) ? { spd: { i: r.spd.i, u: r.spd.u } } : {}), ...(isDrunkState(r.drunk) ? { drunk: { lv: r.drunk.lv, at: r.drunk.at } } : {}), ...snowOfRecord(r), ...(r.rf === true ? { rf: true as const } : {}) };
  }
}

/**
 * 11/22 다시 붙을 때 새싹 끝 시각이 눈에 띄게 바뀌었는지 (켜짐·꺼짐, 또는 1분 넘게 차이) → 다른 사람에게 join을 다시 보낸다.
 * 끝 시각은 입장할 때마다 "지금 + 남은 분"으로 새로 정해 몇 초씩 흔들리므로, 그 정도로는 다시 알리지 않는다
 */
function sproutMoved(prev: number | undefined, next: number | undefined): boolean {
  if (!prev || !next) return !!prev !== !!next;
  return Math.abs(prev - next) > 60_000;
}

/** 11/18 저장 형태의 들고 있는 눈덩이 (캠핑장에 있을 때만, 모양이 맞을 때만) */
function snowOfRecord(r: PeerRecord): { snow?: SnowHold } {
  const h = r.map === "camp" ? parseSnowHold(r.snow) : null;
  return h ? { snow: h } : {};
}

/** 들고 있는 상태가 같은지 */
function sameHold(a: SnowHold | undefined, b: SnowHold | null): boolean {
  if (!a || !b) return !a && !b;
  return a.s === b.s && !!a.r === !!b.r;
}

/** 11/20 채팅 줄에 싣는 닉네임 꾸미기 id (이름 글자·이름표, 없으면 undefined) */
function chatNameStyle(look: readonly string[]): string[] | undefined {
  const { color, plate } = nameStyleOfLook(look);
  const ids = [color, plate].filter((x): x is string => x !== null);
  return ids.length ? ids : undefined;
}
