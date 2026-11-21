import { ACT_KINDS, MAX_MESSAGE_BYTES, isEmoId, isPhraseId, isSeatMood, type ActKind, type EmoId, type PhraseId, type SeatMood } from "./constants";
import { normalizeChat, type ChatLogLine } from "./chat";
import { NAME_MAX, normalizeName } from "./names";
import { MAX_GRANT_LEN } from "./grants";
import type { MegaphoneScope } from "./items";
import { GOBLIN_ID_RE, type GoblinInfo } from "./npc";
import type { AvatarDye } from "./dye";
import { AWAY_HOUSE_RE, isAwayPlace, type AwayPlace } from "./friends";
import type { PeerInfo, Sid } from "./types";
import { isMapId, type AwayMapId, type ChatPlace, type MapId } from "./camp";
import type { BbqItemId } from "./bbq";
import { SNOWBALL_HIT_H_MAX } from "./snowfight";
import type { StaffTpDenyWhy } from "./staffTp";
import { SNOWMAN_ID_RE, isSnowBall, type SnowAct, type SnowBall, type SnowHold, type SnowmanDenyWhy, type SnowmanInfo, type SnowStackInfo } from "./snowman";

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
  | { t: "use"; u: string; a: number }
  /** 5번 이모티콘 (EMOS id). 서버가 연결당 간격(도배 제한)을 지켜 같은 채널·방에 중계한다 */
  | { t: "emo"; id: EmoId }
  /** 24번 벤치 상태: 앉아 있을 때만 받는다. 빈 문자열 = 풀기 */
  | { t: "mood"; m: SeatMood | "" }
  /** 동물원 타는 펫에 올라타기(on)·내리기. 서버는 착용 중인 펫이 타는 펫이고 앉아 있지 않을 때만 켠다 (월드 채널만) */
  | { t: "ride"; on: boolean }
  /** 4번 배 위 낚시: 낚싯대를 드리웠다(on)·거뒀다. 서버는 조각배 자리에 앉아 있을 때만 켠다 (월드 채널만). 옛 서버는 모르는 t라 버린다 */
  | { t: "rod"; on: boolean }
  /**
   * 실내(상점·집·분양 마을·사냥터·미니게임 같은 하위 장면)에 들어가 있다(on)·나왔다. 월드 채널만.
   * 메인 맵에서는 문 앞에 멈춰 있으니 다른 사람 화면에서는 숨긴다. 옛 서버는 모르는 t라 버린다(그러면 예전처럼 문 앞에 보인다)
   */
  | { t: "away"; on: boolean; /** 친구: 어느 실내인지 (옛 클라이언트는 없다) */ p?: AwayPlace; /** 집 안이면 그 집 id (친구가 따라 들어간다) */ h?: string }
  /** 말풍선 자유 채팅 (CHAT_MAX자). 서버가 토큰 버킷으로 도배를 막고 가려서(maskChat) 같은 채널·방에만 중계한다. 저장하지 않는다 */
  | { t: "chat"; text: string }
  /**
   * 11/16 귓속말: 같은 채널(마을·캠핑장) 접속자 한 사람에게만. to = 받는 사람 이름(클라이언트가 고른 것), text = 할 말 (CHAT_MAX자).
   * 서버는 "to text"를 접속자 이름으로 다시 맞춰(matchWhisperTarget, 가장 긴 이름) 받는 사람과 보낸 사람에게만 whisper로 보낸다.
   * 채팅과 같은 도배 제한·가리기, 기록에는 남기지 않는다. 월드 채널만 (방은 버린다). 옛 서버는 모르는 t라 버린다
   */
  | { t: "whisper"; to: string; text: string }
  /** 11/17 운영자만: 다람쥐 쿨다운 초기화 (운영자가 아니면 서버가 무시) */
  | { t: "squirrelsReset" }
  /**
   * 11/16 최근 귓속말 상대가 지금 이 채널(마을·캠핑장)에 있는지 묻기 (WHO_ON_MAX명까지, 내가 아는 이름만 → 접속자 목록을 통째로 주지 않는다).
   * 서버가 WHO_ON_INTERVAL_MS 간격으로 whoOn으로 답한다. 월드 채널만. 옛 서버는 모르는 t라 버린다 (그러면 아무도 흐리게 하지 않는다)
   */
  | { t: "whoOn"; names: string[] }
  /**
   * 11/15 맵 옮기기 (버스): 같은 채널 연결 그대로 마을 ↔ 캠핑장. x,y = 새 맵에서 설 자리.
   * 서버는 입장 토큰에 캠핑장 허락(camp)이 있을 때만 캠핑장으로 보내고, 결과를 mapped로 알린다. 옛 서버는 모르는 t라 버린다
   */
  | { t: "map"; m: MapId; x: number; y: number }
  /**
   * 11/20 운영자 순간이동: 같은 채널 sid 옆 (x,y)로, m = 그 사람이 있는 맵 (다르면 맵도 옮긴다 → mapped로 답한다).
   * 서버는 운영자(staff) 연결만 받는다. 상대가 실내면 tpNo. 옛 서버는 모르는 t라 버린다 (staffTp.ts)
   */
  | { t: "tp"; sid: Sid; m: MapId; x: number; y: number }
  /** 11/15 캠핑장 바베큐 한 접시 증서 (웹이 포인트를 쓰고 서명). 서버가 검증해 같은 맵에 bbq로 알린다. 옛 서버는 버린다 */
  | { t: "bbq"; grant: string }
  // ── 11/18 캠핑장 눈사람 만드는 과정 (v73 — 11/17 snowman { x, y } 한 번 보내던 것을 바꿨다). 옛 서버는 모르는 t라 버린다 ──
  /** 들고 있는 눈덩이가 바뀌었다 (집기·크기 바뀜·굴리기 시작/멈춤·버리기). h = null이면 빈손. 바뀔 때만 보낸다 */
  | { t: "snowHold"; h: SnowHold | null }
  /** 들고 있던 덩이(s)를 (x,y)에 새로 내려놓는다. 서버가 자리·간격을 보고 같은 캠핑장에 snowStack */
  | { t: "snowPut"; x: number; y: number; s: SnowBall }
  /** 들고 있던 덩이(s)를 내 덩이 id 위에 올린다. 세 단째면 서버가 바로 눈사람을 세운다 (snowman) */
  | { t: "snowAdd"; id: string; s: SnowBall }
  /** 내 덩이 id의 맨 위를 다시 든다 */
  | { t: "snowTake"; id: string }
  // ── 11/18 마을·캠핑장 눈싸움 (v74, snowfight.ts). 옛 서버는 모르는 t라 버린다 ──
  /** 눈을 뭉쳐 던진다: (x,y) = 출발점(내 발), (tx,ty) = 떨어질 곳. 서버가 번호를 붙여 같은 맵 다른 사람에게 snowball */
  | { t: "snowball"; x: number; y: number; tx: number; ty: number }
  /** 내 화면에서 by가 던진 n번 눈에 맞았다 (판정은 맞은 사람 화면). h = 맞은 높이(발에서, 머리·몸). 서버가 확인해 같은 맵 모두에게 snowHit */
  | { t: "snowHit"; by: Sid; n: number; h?: number }
  /**
   * 11/13 함께 사냥: 내 공격·스킬 동작 (사냥터 방 전용, 보여 주기만 — 판정·몬스터는 각자). 서버는 HUNT_ACT_INTERVAL_MS 간격으로
   * 같은 사냥터 방의 다른 사람에게만 중계하고 저장하지 않는다. 옛 서버는 모르는 t라 버린다
   */
  | ({ t: "hunt" } & HuntAct);

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
  /** 11/15 서버가 아는 내 맵 (캠핑장 "camp"·11/16 바닷가 "sea". 없으면 마을 — 옛 서버도 마을) */
  m?: MapId;
  /** 11/15 채널 전체 인원 (마을·캠핑장 합계, 유예 중 포함). 없으면 옛 서버 → 같은 맵 사람 수로 */
  n?: number;
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
  | { t: "look"; sid: Sid; look: string[]; dye?: AvatarDye; body?: string; /** 주간 1위 비트 (0 = 아님, 새 웹이 낸 증서일 때만). 옛 클라이언트는 무시한다 */ champ?: number; /** 11/16 매니저 표시 (1 = 매니저, 0 = 해제, 새 웹이 낸 증서일 때만). 옛 클라이언트는 무시한다 */ mgr?: 0 | 1 }
  /** w = 11/20 광역 불꽃쇼가 앞 쇼 뒤로 밀렸으면 그만큼(ms) 기다렸다 시작 (옛 클라이언트는 무시하고 바로 터뜨린다) */
  | { t: "firework"; sid: Sid; item: string; x: number; y: number; w?: number }
  /** 11/20 광역 불꽃쇼 거절: 이 맵에 이미 쇼가 돌고 하나 더 기다리는 중 (보낸 사람에게만). left = 남은 ms */
  | { t: "fireworkBusy"; left: number }
  /** sync 응답: 나를 제외한 현재 접속자 전체와 좌석. 클라이언트는 이걸로 원격 아바타를 맞춘다 */
  | { t: "peers"; peers: PeerInfo[]; seats: Record<string, Sid> }
  | { t: "act"; sid: Sid; kind: ActKind; x: number; y: number }
  | { t: "say"; sid: Sid; id: PhraseId }
  // ── 22번 황금 고블린 (옛 클라이언트는 모르는 t라 그냥 버린다) ──
  /** 나타났다 */
  | { t: "goblin"; g: GoblinInfo }
  /** 아무도 못 잡고 사라졌다 */
  | { t: "goblinGone"; id: string }
  /** sid가 잡았다. name = 잡은 사람 이름 (서버가 아는 입장 토큰 이름 — 클라이언트가 보낸 값이 아니다). 11/19부터 마을뿐 아니라 채널 모두(캠핑장·바닷가)에게 */
  | { t: "goblinCaught"; id: string; sid: Sid; name: string; points: number }
  /** 잡은 사람에게만: 보상 증서 (웹 /api/goblin이 검증해 포인트를 준다) */
  | { t: "goblinGrant"; id: string; grant: string; points: number }
  // ── 23번 확성기 (옛 클라이언트는 모르는 t라 그냥 버린다) ──
  /** 확성기 한마디. id = 확성기 기록 id(중복 표시 방지), ch = 외친 채널, scope = all이면 모든 채널에 퍼졌다 */
  | MegaphoneMsg
  /** 3번: 같은 방 사람이 집 안 가구를 썼다 (옛 클라이언트는 모르는 t라 버린다) */
  | { t: "use"; sid: Sid; u: string; a: number }
  /** 5번: 이모티콘 (보낸 사람 빼고. 옛 클라이언트는 모르는 t라 버린다) */
  | { t: "emo"; sid: Sid; id: EmoId }
  /** 24번: 벤치 상태가 바뀌었다 (빈 문자열 = 풀림 — 일어나면 서버가 알린다) */
  | { t: "mood"; sid: Sid; m: SeatMood | "" }
  /** 타는 펫에 올라탔다·내렸다 (보낸 사람 포함 모두. 늦게 온 사람은 PeerInfo.ride로 받는다. 옛 클라이언트는 모르는 t라 버린다) */
  | { t: "ride"; sid: Sid; on: boolean }
  /** 배 위 낚싯대를 드리웠다·거뒀다 (보낸 사람 포함 모두. 늦게 온 사람은 PeerInfo.rod로 받는다. 옛 클라이언트는 모르는 t라 버린다) */
  | { t: "rod"; sid: Sid; on: boolean }
  /** 실내에 들어갔다·나왔다 (보낸 사람 빼고. 늦게 온 사람은 PeerInfo.away로 받는다. 옛 클라이언트는 모르는 t라 버린다 → 문 앞에 보인다) */
  | { t: "away"; sid: Sid; on: boolean }
  /** 받는 사람에게만: 서버에서 내 계정(포인트·선물함)이 바뀌었다 → /api/me를 다시 받는다 (관리자 지급 등. 옛 클라이언트는 버린다) */
  | { t: "me" }
  /** 말풍선 자유 채팅 (보낸 사람 빼고, 서버가 가린 글. 옛 클라이언트는 모르는 t라 버린다). id = 줄 id(chatLog와 중복 제거), at = 서버 시각 */
  /** 11/16 채팅은 채널 전체(마을·캠핑장·바닷가)로 간다: name·staff·mgr = 다른 맵이라 화면에 없는 사람도 채팅창에 이름을 쓰게, m = 쓴 사람의 맵(캠핑장 "camp"·바닷가 "sea", 마을이면 없음) */
  | { t: "chat"; sid: Sid; text: string; id?: string; at?: number; name?: string; staff?: true; mgr?: true; /** 11/17 사냥 중이면 "hunt" */ m?: ChatPlace; /** 11/20 닉네임 꾸미기 id */ ns?: string[] }
  /**
   * 11/16 귓속말 (받는 사람과 보낸 사람에게만, 서버가 가린 글. 기록에 남기지 않는다). from·fromName = 보낸 사람, to·toName = 받는 사람,
   * staff·mgr = 보낸 사람 딱지, toStaff·toMgr = 받는 사람 딱지. 옛 클라이언트는 모르는 t라 버린다
   */
  | WhisperMsg
  /** 보낸 사람에게만: 11/16 귓속말을 못 보냈다. absent = 그 이름이 이 채널에 없다(to = 보낸 이름 그대로), self = 나에게 보냈다 */
  | { t: "whisperFail"; to: string; why: "absent" | "self" }
  /** 받는 사람에게만: 11/16 whoOn 답. on = 지금 이 채널에 있는 이름, off = 없는 이름 (물어본 이름 그대로) */
  | { t: "whoOn"; on: string[]; off: string[] }
  /** 받는 사람에게만: 방에 들어올 때(입장·재접속·실내에서 복귀) 이 방의 최근 1분 채팅. now = 서버 시각 (옛 클라이언트는 모르는 t라 버린다) */
  | { t: "chatLog"; now: number; lines: ChatLogLine[] }
  /** 받는 사람에게만: 친구가 들어왔다(on)·나갔다 (key = 친구 창의 그 친구 키, 옛 클라이언트는 모르는 t라 버린다) */
  | { t: "friend"; key: string; name: string; on: boolean }
  /** 11/13 같은 사냥터 사람의 공격·스킬 동작 (보낸 사람 빼고. 옛 클라이언트는 모르는 t라 버린다) */
  | ({ t: "hunt"; sid: Sid } & HuntAct)
  /**
   * 받는 사람에게만: 11/15 맵을 옮겼다 (map 요청의 답). m = 서버가 정한 지금 맵 (허락이 없으면 그대로),
   * peers·seats = 그 맵에 있는 사람(나 빼고)과 그 사람들이 앉은 자리. 옛 클라이언트는 map을 보내지 않아 받을 일이 없다
   */
  | { t: "mapped"; m: MapId; peers: PeerInfo[]; seats: Record<string, Sid> }
  /** 11/15 채널 전체 인원이 바뀌었다 (들어옴·나감, 맵 상관없이 모두에게). 옛 클라이언트는 모르는 t라 버린다 */
  | { t: "count"; n: number }
  /**
   * 11/16 이스터에그: 누가 채팅에 「다람쥐를 뿌려라」를 쳤다 → 채널 전체(맵 상관없이, 보낸 사람 포함) 화면에 다람쥐가 쏟아진다.
   * 채널마다 SQUIRREL_RAIN_COOLDOWN_MS에 한 번 (서버 판정). by = 친 사람 이름, seed = 연출 난수 씨앗, at = 서버 시각. 옛 클라이언트는 모르는 t라 버린다
   */
  | { t: "squirrels"; by: string; seed: number; at: number }
  /** 11/17 쿨다운 중에 운영자가 주문을 쳤다 → 그 운영자에게만 남은 시간 (ms) */
  | { t: "squirrelsWait"; left: number }
  /** 11/15 누가 바베큐를 먹고 u(epoch ms)까지 커졌다 (같은 맵, 보낸 사람 포함). 옛 클라이언트는 모르는 t라 버린다 */
  | { t: "bbq"; sid: Sid; i: BbqItemId; u: number; /** 마실 거리: 마신 뒤 취기 단계·마신 시각 */ lv?: number; at?: number }
  /** 11/17 확성기 창 고정 공지가 바뀌었다 (운영자가 쓰거나 지움, 사람이 있는 채널 모두에게). 옛 클라이언트는 모르는 t라 버린다 */
  | MegaPinMsg
  // ── 11/17 캠핑장 눈사람 (옛 클라이언트는 모르는 t라 버린다) ──
  /** 받는 사람에게만: 캠핑장에 들어왔다(welcome·mapped 다음) → 지금 서 있는 눈사람 전부, 11/18 쌓는 중인 덩이 전부(stacks) */
  | { t: "snowmen"; list: SnowmanInfo[]; stacks?: SnowStackInfo[] }
  /** 누가 눈사람을 세웠다 (같은 캠핑장, 세운 사람 포함). sid = 세운 사람, st = 눈사람으로 바뀐 덩이 id (그 덩이를 지우고 세운 사람은 빈손) */
  | { t: "snowman"; s: SnowmanInfo; sid: Sid; st?: string }
  /** 개수가 넘쳐 서버가 먼저 녹였다 (같은 캠핑장). 제때 녹는 것은 알리지 않는다 (각자 시각으로) */
  | { t: "snowmanGone"; id: string }
  /** 보낸 사람에게만: 내려놓기·올리기·다시 들기(a)를 받지 않았다. id = 그 덩이 (add·take) */
  | { t: "snowmanDenied"; why: SnowmanDenyWhy; a?: SnowAct; id?: string }
  // ── 11/18 만드는 과정 (같은 캠핑장) ──
  /** 누가 들고 있는 눈덩이가 바뀌었다 (보낸 사람 빼고) */
  | { t: "snowHold"; sid: Sid; h: SnowHold | null }
  /**
   * 덩이가 놓였다·바뀌었다 (같은 캠핑장, 주인 포함 — 주인에게는 받아들였다는 확인). 주인(st.sid)은 이제 h를 들고 있다 (다시 들기),
   * h가 없으면 빈손 (내려놓기·올리기)
   */
  | { t: "snowStack"; st: SnowStackInfo; h?: SnowBall }
  /** 덩이가 사라졌다 (같은 캠핑장). took = 주인이 마지막 덩이를 다시 들어서 (주인은 이제 그 크기를 들고 있다). 없으면 주인 손은 그대로 */
  | { t: "snowStackGone"; id: string; sid: Sid; took?: SnowBall }
  // ── 11/18 마을·캠핑장 눈싸움 (같은 맵. 옛 클라이언트는 모르는 t라 버린다) ──
  /** sid가 n번 눈을 던졌다 (던진 사람 빼고). 받은 때부터 뭉치기 → 날기를 각자 같은 식으로 그린다 */
  | { t: "snowball"; sid: Sid; n: number; x: number; y: number; tx: number; ty: number }
  /** sid가 by의 n번 눈에 맞았다 (맞은 사람·던진 사람 포함 모두). h = 맞은 높이 (그 자리에 퍽, 없으면 얼굴) */
  | { t: "snowHit"; sid: Sid; by: Sid; n: number; h?: number }
  // ── 11/20 운영자 순간이동 (staffTp.ts. 옛 클라이언트는 모르는 t라 버린다) ──
  /** sid가 순간이동으로 (x,y)에서 사라졌다(out)·나타났다(in) → 그 자리에 반짝임 (같은 맵, 움직인 사람 빼고) */
  | { t: "tpFx"; sid: Sid; x: number; y: number; k: "out" | "in" }
  /** 운영자에게만: tp를 받지 않았다 */
  | { t: "tpNo"; why: StaffTpDenyWhy };

/** 23번 확성기 방송 (보낸 사람에게도 간다) */
/** staff = 운영자 계정이 외친 것 (Vercel이 증서에 넣은 것만 → 이름 금색) */
/** system = 마을 공지 줄 (/internal/say — 금색, "운영자" 딱지·신고 없음. 옛 클라이언트는 staff만 보고 금색으로 그린다) */
/** replaces = 이 줄로 바꿔 끼울 앞 공지 id (긴급 의뢰가 끝나면 시작 공지를 끝 공지로) */
/** mgr = 11/16 매니저 계정이 외친 것 (Vercel이 증서에 넣은 것만 → "매니저" 딱지. 옛 클라이언트는 무시한다) */
export type MegaphoneMsg = { t: "megaphone"; id: string; name: string; text: string; scope: MegaphoneScope; ch: number; at: number; staff?: true; system?: true; replaces?: string; mgr?: true };

// ── 11/17 확성기 창 고정 공지 (운영자) ──
// 채널마다 하나 + 모든 채널 하나. 저장은 웹(Redis)이 하고, 들어올 때는 확성기 기록과 같이 받는다(/api/megaphone).
// 쓰거나 지우면 웹이 /internal/pin으로 실시간 서버에 알리고, 실시간 서버가 그 채널(또는 사람이 있는 채널 모두)에 megaPin을 한 번 보낸다.

/** 고정 공지 최대 글자 수 (코드포인트) */
export const MEGA_PIN_MAX = 200;
/** 고정 공지 한 줄. scope channel = 그 채널(ch)만, all = 모든 채널(ch 0). name = 쓴 운영자 닉네임, at = 쓴 시각(ms) */
export type MegaPin = { scope: MegaphoneScope; ch: number; text: string; name: string; at: number };
/** 고정 공지가 바뀌었다. pin = 새 공지, null = 지움 (scope·ch로 어느 칸인지 안다) */
export type MegaPinMsg = { t: "megaPin"; scope: MegaphoneScope; ch: number; pin: MegaPin | null };

/** 받은 megaPin 검증 (클라이언트 수신용). 모양이 틀리면 null, 모르는 필드는 버린다 */
export function parseMegaPinMsg(m: Record<string, unknown>): MegaPinMsg | null {
  if (m.t !== "megaPin" || (m.scope !== "channel" && m.scope !== "all")) return null;
  const scope = m.scope;
  const ch = scope === "all" ? 0 : m.ch;
  if (!Number.isInteger(ch) || (ch as number) < 0 || (scope === "channel" && (ch as number) < 1)) return null;
  if (m.pin === null) return { t: "megaPin", scope, ch: ch as number, pin: null };
  const p = m.pin as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object" || typeof p.text !== "string" || !p.text || [...p.text].length > MEGA_PIN_MAX) return null;
  const name = typeof p.name === "string" ? p.name.slice(0, NAME_MAX * 2) : "";
  const at = isNum(p.at) && p.at > 0 ? p.at : Date.now();
  return { t: "megaPin", scope, ch: ch as number, pin: { scope, ch: ch as number, text: p.text, name, at } };
}

/** 11/16 whoOn 한 번에 물어볼 수 있는 이름 수 (최근 귓속말 상대 수와 같다) */
export const WHO_ON_MAX = 8;
/** 11/16 whoOn 연결당 최소 간격 */
export const WHO_ON_INTERVAL_MS = 2_000;

/** 11/16 귓속말 한 줄 (S2C) */
export type WhisperMsg = {
  t: "whisper";
  id: string;
  at: number;
  from: Sid;
  fromName: string;
  to: Sid;
  toName: string;
  text: string;
  staff?: true;
  mgr?: true;
  toStaff?: true;
  toMgr?: true;
};

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

// ── 11/13 함께 사냥: 공격·스킬 동작 ──
/** atk = 기본 공격 한 번, skill = 스킬 시전 */
export type HuntActKind = "atk" | "skill";
/** a = 바라보는 각도(도, 0..359 정수), w = 무기 방식 id(기본 공격), s = 스킬 id(이름은 받는 쪽 카탈로그에서), f = 연타 마무리 */
export type HuntAct = { k: HuntActKind; a: number; w?: string; s?: string; f?: true };
/** 무기 방식·스킬 id 모양 (모르는 id는 받는 쪽이 그림만 기본으로 그린다) */
export const HUNT_ACT_ID_RE = /^[a-z0-9_]{1,24}$/;
/** 연결당 최소 간격: 서버는 이보다 잦은 hunt를 버린다 (클라이언트는 기본 공격을 더 드물게 보낸다) */
export const HUNT_ACT_INTERVAL_MS = 150;

/** hunt 이벤트 본문 검증 (서버 parseC2S·클라이언트 수신 공용). 모양이 틀리면 null, 모르는 필드는 버린다 */
export function parseHuntAct(m: Record<string, unknown>): HuntAct | null {
  if ((m.k !== "atk" && m.k !== "skill") || !isNum(m.a)) return null;
  const a = ((Math.round(m.a) % 360) + 360) % 360;
  const w = typeof m.w === "string" && HUNT_ACT_ID_RE.test(m.w) ? m.w : undefined;
  const s = m.k === "skill" && typeof m.s === "string" && HUNT_ACT_ID_RE.test(m.s) ? m.s : undefined;
  if (m.k === "skill" && !s) return null;
  return { k: m.k, a, ...(w ? { w } : {}), ...(s ? { s } : {}), ...(m.f === true ? { f: true as const } : {}) };
}

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
    // 착용 증서는 염색·몸 모양·주간 1위 값까지 실어 폭죽 증서보다 길 수 있다 (몸 꾸미기 7개·염색 전부여도 400자 안팎,
    // 닉네임 꾸미기 2개까지 더하면 430자 안팎 — 메시지 전체 512바이트 안. nameStyle.test.ts가 가장 긴 경우를 잰다)
    case "look":
      return typeof m.grant === "string" && m.grant.length <= 600 ? { t: m.t, grant: m.grant } : null;
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
    case "emo":
      return isEmoId(m.id) ? { t: "emo", id: m.id } : null;
    case "mood":
      return m.m === "" || isSeatMood(m.m) ? { t: "mood", m: m.m } : null;
    case "ride":
      return typeof m.on === "boolean" ? { t: "ride", on: m.on } : null;
    case "rod":
      return typeof m.on === "boolean" ? { t: "rod", on: m.on } : null;
    case "away":
      // p(어느 실내)는 모르는 값이면 p만 빼고 받는다 (장소가 늘어난 새 클라이언트도 실내 표시는 된다)
      if (typeof m.on !== "boolean") return null;
      return {
        t: "away",
        on: m.on,
        ...(m.on && isAwayPlace(m.p) ? { p: m.p } : {}),
        ...(m.on && m.p === "house" && typeof m.h === "string" && AWAY_HOUSE_RE.test(m.h) ? { h: m.h } : {}),
      };
    case "chat": {
      const text = normalizeChat(m.text);
      return text ? { t: "chat", text } : null;
    }
    case "squirrelsReset":
      return { t: "squirrelsReset" };
    case "whisper": {
      // 받는 사람 이름은 공백이 든 이름까지 (닉네임 12자 + 공백 여유). 실제 이름 맞추기는 서버가 접속자 목록으로 한다
      const to = typeof m.to === "string" && m.to.length <= NAME_MAX * 3 ? normalizeName(m.to) : "";
      const text = normalizeChat(m.text);
      return to && text ? { t: "whisper", to, text } : null;
    }
    case "whoOn": {
      if (!Array.isArray(m.names) || m.names.length === 0 || m.names.length > WHO_ON_MAX) return null;
      const names = m.names.map((n) => (typeof n === "string" && n.length <= NAME_MAX * 3 ? normalizeName(n) : ""));
      return names.every(Boolean) ? { t: "whoOn", names } : null;
    }
    case "hunt": {
      const h = parseHuntAct(m);
      return h ? { t: "hunt", ...h } : null;
    }
    case "bbq":
      return typeof m.grant === "string" && m.grant.length <= MAX_GRANT_LEN ? { t: "bbq", grant: m.grant } : null;
    case "snowHold": {
      if (m.h === null) return { t: "snowHold", h: null };
      const h = m.h as Record<string, unknown> | undefined;
      if (!h || typeof h !== "object" || !isSnowBall(h.s)) return null;
      return { t: "snowHold", h: h.r === true ? { s: h.s, r: true } : { s: h.s } };
    }
    case "snowPut":
      return isNum(m.x) && isNum(m.y) && isSnowBall(m.s) ? { t: "snowPut", x: Math.round(m.x), y: Math.round(m.y), s: m.s } : null;
    case "snowAdd":
      return typeof m.id === "string" && SNOWMAN_ID_RE.test(m.id) && isSnowBall(m.s) ? { t: "snowAdd", id: m.id, s: m.s } : null;
    case "snowTake":
      return typeof m.id === "string" && SNOWMAN_ID_RE.test(m.id) ? { t: "snowTake", id: m.id } : null;
    case "snowball":
      return isNum(m.x) && isNum(m.y) && isNum(m.tx) && isNum(m.ty) ? { t: "snowball", x: Math.round(m.x), y: Math.round(m.y), tx: Math.round(m.tx), ty: Math.round(m.ty) } : null;
    case "snowHit":
      if (!(Number.isInteger(m.by) && (m.by as number) >= 0 && Number.isInteger(m.n) && (m.n as number) > 0 && (m.n as number) < 2 ** 31)) return null;
      return { t: "snowHit", by: m.by as Sid, n: m.n as number, ...(isNum(m.h) ? { h: Math.max(0, Math.min(SNOWBALL_HIT_H_MAX, Math.round(m.h))) } : {}) };
    case "map":
      return isMapId(m.m) && isNum(m.x) && isNum(m.y) ? { t: "map", m: m.m, x: Math.round(m.x), y: Math.round(m.y) } : null;
    case "tp":
      return Number.isInteger(m.sid) && (m.sid as number) >= 0 && isMapId(m.m) && isNum(m.x) && isNum(m.y)
        ? { t: "tp", sid: m.sid as Sid, m: m.m, x: Math.round(m.x), y: Math.round(m.y) }
        : null;
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

