import type { AvatarDye, AwayMapId, BbqItemId, ChatPlace, BbqStand, FishWater, GraveEventKind, MapId, MegaPinMsg, QueueStatus } from "@tomb/protocol";
import type { NpcId } from "@/lib/forage/catalog";
import type { PublicGrave } from "@/lib/types";
import type { HouseEditState, HouseTool } from "@/game/housing/events";
import type { PublicHouse, VillageResponse } from "@/lib/housing/types";
import type { RpgAction, RpgHud, RpgPlay, RunResult } from "@/lib/rpg/types";
import type { HotAuto } from "@/lib/rpg/hotbar";
import type { CardChoice, CardOfferView } from "@/lib/rpg/cards";
import type { ProcView } from "@/lib/rpg/procs";
import type { ResumeState } from "@/lib/resume";
import type { SoundMix } from "@/lib/soundMix";
import type { IncomingChatLine } from "@/game/logic/chatLog";
import type { RideStatus } from "@/lib/ridePolicy";
import type { Ambience, Weather } from "@/lib/ambience";
import type { MapConcept } from "@/lib/mapConcept";
import type { FirstGuideTarget } from "@/lib/retain";

// React(UI 오버레이) ↔ Phaser(게임) 사이의 유일한 통로. 양쪽은 서로를 직접 import하지 않는다.
// "sticky" 이벤트는 마지막 값을 기억해서, 늦게 구독한 쪽도 last()로 현재 값을 읽을 수 있다.

export type NetMode =
  | "connecting" // 첫 연결 시도 중
  | "online" // 채널 접속 중
  | "reconnecting" // 끊겨서 재시도 중 (지수 백오프)
  | "spectator" // 전체 상한 도달 → 관람 모드 (혼자 걷기, 30초마다 합류 재시도)
  | "replaced" // 다른 탭/기기에서 같은 방문자로 접속해서 이 연결이 종료됨 (4002). 자동 재접속하지 않음 (UI가 "여기서 다시 접속" 제공)
  | "queue" // 전체 상한 도달 → 대기열 (혼자 걷기 + 순번 표시). queue:status로 순번이 온다
  | "offline"; // 재시도 포기 / 실시간 서버 없음

export type NetStatus = {
  mode: NetMode;
  channel: number | null;
  /** 나를 포함한 채널 인원 (마을·캠핑장 합계 — 맵이 달라도 채널 전체) */
  count: number;
  cap: number;
  /** 11/15 지금 캠핑장이면 "camp", 11/16 바닷가면 "sea" (없으면 마을) */
  map?: AwayMapId;
};

/** ?debug=1 HUD용. 1초마다 갱신 */
export type NetStats = {
  rttMs: number | null;
  snapshotHz: number;
  peers: number;
  fps: number;
  /** 수신 대역폭 KB/s */
  inKBps: number;
};

export type GameStartOptions = {
  name: string;
  color: string;
  /** 아바타 몸 모양 (AVATAR_BODIES id, 계정 저장값). 없으면 입장 토큰 값 */
  body?: string;
  /** 입장 화면에서 고른 채널 */
  channel: number | "auto";
  /** 공유 링크 /?grave={id} 로 들어왔으면 그 묘비 앞에 스폰하고 grave:open을 보낸다 */
  focusGraveId?: string | null;
  debug?: boolean;
  /** 새로고침 직전 자리 (lib/resume.ts). 있으면 그 자리·자세로 시작하고 같은 좌석에 다시 앉는다 */
  resume?: ResumeState | null;
};

/** Game → UI */
export type GameEvents = {
  /** Phaser 부팅이 끝나고 월드가 보이기 시작함 */
  ready: undefined;
  /** 휴식 중: 뒤로 가서(다른 탭·다른 창) 게임 루프를 재웠다 → UI가 "휴식 중" 막을 띄운다 (game/backgroundLoop, sticky) */
  "game:rest": { on: boolean };
  /** 근접 툴팁 대상 묘비 (없으면 null). 모바일 상호작용 버튼 표시용 */
  "grave:near": { graveId: string } | null;
  /** 11/19 문 앞이면 폰 [상호작용] 단추 이름 (logic/doorHint, sticky) */
  "door:near": "들어가기" | "나가기" | "사직서 내러 가기" | null;
  /** 앉을 수 있는 빈 좌석 근처(없으면 null). 게임은 좌석 옆에 "X 앉기" 안내를, UI는 모바일 앉기 버튼을 강조한다 (sticky) */
  "seat:near": { seatId: string; kind: "bench" | "chair" } | null;
  /** 24번 벤치 상태 (sticky): seated = 의자·벤치에 앉아 있어 고를 수 있음, mood = 지금 고른 상태 (SEAT_MOODS id, 없으면 "") */
  "mood:state": { seated: boolean; mood: string };
  /** E/Space/탭으로 묘비 상세 모달을 열어 달라는 요청 */
  "grave:open": { graveId: string };
  /**
   * 내 묘비 가기 걷기 상태 (41번). started = 길을 찾아 걷기 시작, arrived = 도착(또는 이미 가까워 바라보기만),
   * cancelled = 이동·점프·클릭 등 입력으로 그만둠, unreachable = 길이 없음(또는 도중에 막힘)
   */
  "grave:walk": { graveId: string; status: "started" | "arrived" | "cancelled" | "unreachable" };
  /**
   * 11/16 [사냥] 버튼 → 사냥터 입구까지 걷기 상태 (sticky, lib/huntWalk). started = 걷기 시작, arrived = 도착 (곧 portal:open),
   * cancelled = 방향키·조이스틱·다시 누르기 등으로 그만둠, unreachable = 길이 없음(또는 도중에 막힘)
   */
  "portal:walk": { kind: "hunt" | "shop" | "housing"; status: "started" | "arrived" | "cancelled" | "unreachable" };
  /** 11/19 첫 걸음 길 안내 결과 (route:guide): arrived = 목적지에 닿아 지웠다, missing = 그런 곳이 지금 없다(채집 지점·이웃 집), unreachable = 걸어서 갈 길이 없다 */
  "route:state": { target: FirstGuideTarget; status: "arrived" | "missing" | "unreachable" };
  "net:status": NetStatus;
  "net:stats": NetStats;
  /** 일부러 옮기는 채널 이동이 로비 확인을 통과해 지금 채널을 떠난다 → 장면이 지금 자리를 기억하고 새 채널 처음 자리로 */
  "channel:leave": { channel: number };
  /**
   * 꽉 찬 채널이라 옮기지 않았다 (안내 토스트는 실시간 클라이언트가 띄운다).
   * back = 이미 떠났다가(들어가는 순간 꽉 참) 온 채널로 돌아가는 중 → 장면이 떠나기 전 자리로 되돌린다
   */
  "channel:refused": { channel: number; message: string; back: boolean };
  /** 같은 채널의 다른 사람이 묘비를 세움/수정/삭제 → UI가 상세를 받아 목록에 반영 */
  "net:graveEvent": { kind: GraveEventKind; graveId: string };
  toast: { message: string };
  /** 카메라 상태. detached=true면 우클릭 드래그로 시점을 옮겨서 내 캐릭터를 따라가지 않는 중 (UI가 "내 캐릭터로" 버튼 표시) */
  "camera:state": { detached: boolean; zoom: number };
  /** 화면 연출 모드 (sticky). campfire = 모닥불에 앉아 카메라가 불멍 구도로 바뀐 상태 → UI는 HUD를 은은하게 줄인다 */
  "view:mode": { mode: "normal" | "campfire" | "sky" | "sea" };
  /**
   * 11/16 r19 바라보는 장면(바닷가 바다 보기·등대·동전 망원경, 캠핑장 전망대 망원경)이 켜져 있거나 켜지고 꺼지는 중 (sticky).
   * 이 동안 게임 단축키는 채팅·V·Esc·움직이는 키만 가요 (lib/viewKeyGuard), 터치 버튼도 채팅·바다 보기만 남겨요
   */
  "view:busy": { on: boolean };
  /** 11/16 r19 바라보는 장면에서 Esc: 장면이 나가요 */
  "view:exit": undefined;
  /**
   * 11/16 바닷가 바다 보기 (sticky, null = 숨김): 바다를 볼 수 있는 자리(백사장 벤치·선베드·돗자리·선착장 끝·방파제 끝)에 앉아 있으면
   * UI가 「바다 보기」(on이면 「돌아가기」) 버튼과 V 단축키를 띄워요
   */
  "sea:hud": { on: boolean } | null;
  /** 11/17 r2 지금 갈매기 과자를 던질 수 있는지 (sticky — 던질 수 있으면 던질 과자, 아니면 null). 과자 칸의 [과자 던지기] 버튼이 봐요 */
  "sea:snack:can": { kind: "plain" | "spicy" } | null;
  /** 11/17 r2 선착장 길목 과자 자판기 앞 E → UI가 과자 자판기 창을 열어요 */
  "sea:snack:vend": undefined;
  /**
   * 놀이기구 2 하늘 시점 안내 (sticky, null = 숨김). sky = 관람차·열기구 하늘 시점이라 UI가 HUD를 줄이고 이 안내를 띄운다.
   * place = 지나가는 곳 이름(열기구), hint = 조작 안내, left = 내릴 때까지 남은 초,
   * view = 탑승 중 보기 (scene = 옆에서 본 2D 장면, map = 칸·기구를 따라가며 마을 맵 위를 떠다니는 보기)
   */
  "sky:hud": { kind: "ferris" | "balloon"; title: string; place: string | null; hint: string; left: number; sky: boolean; view: "scene" | "map" } | null;
  /** 대기열 순번 (sticky) */
  "queue:status": QueueStatus;
  /** 상점 맵 안에서 주인장과 상호작용 → UI가 상점 창을 연다 */
  "shop:open": undefined;
  /**
   * 월드의 특별한 장소와 상호작용: 사냥터 입구 / 분양 사무소(하우징) / 옛 묘역 입구 팻말(shrine, 11/19 성황당 대신) → UI가 해당 창을 연다.
   * 주거 구역(메인 맵의 분양 마을): 집 문이면 houseId(그 집으로 들어가기), 빈 필지 팻말이면 lot(그 번지로 분양 문의)
   */
  // 11/19 seasonCos = 광장 「계절 보따리상」(기간 한정 코디), seasonFurn = 「가구 보따리상」(기간 한정 가구 — 노점 그림이 나오면 월드에 세운다)
  // 11/19 mungnyang = 동물원 정문 왼쪽 「분양사 보리」(강아지·고양이 분양 — components/mungnyang)
  // 11/20 office = 야근 빌딩 오른쪽 「총무팀 문대리」(사무실 가구 — components/office)
  "portal:open": { kind: "hunt" | "housing" | "shrine" | "telescope" | "wish" | "haunt" | "tower" | "lottery" | "seasonCos" | "seasonFurn" | "mungnyang" | "office"; houseId?: string; lot?: number; zone?: "sea" };
  /** 11/16 포구 오두막이 바뀌었다 (분양·겉모습·넓히기·이름) → 바닷가 장면이 오두막을 다시 받아 그린다 (myHouseId = 내 오두막 — 문패 「(내 집)」) */
  "sea:cottages": { myHouseId: string | null };
  /** 11/16 바닷가에서 그 오두막 터 앞으로 (내 집 가기) */
  "sea:lot": { lot: number };
  /** 22번 황금 고블린을 내가 가장 먼저 잡았다 → UI가 증서로 /api/goblin에 보상을 받는다 */
  "goblin:grant": { id: string; grant: string; points: number };
  /** 11/19 황금 고블린이 나타났다(마을) → 화면 위 금빛 띠. zone = 지금 도는 구역, resumed = 들어와 보니 이미 있었다 */
  "goblin:spawn": { id: string; zone: string; until: number; resumed: boolean };
  /** 11/19 누가 황금 고블린을 잡았다 (채널 모두 — 캠핑장·바닷가 포함) → 화면 위 띠·채팅 소식 줄, 나면 큰 숫자. name = 서버가 아는 이름 */
  "goblin:caught": { id: string; name: string; points: number; mine: boolean };
  /** 23번 확성기 한마디가 실시간 서버에서 왔다 (내 것 포함) → UI의 확성기 창에 띄운다 */
  "megaphone:heard": {
    id: string;
    name: string;
    text: string;
    scope: "channel" | "all";
    ch: number;
    at: number;
    /** 운영자 계정이 외친 것 → 이름 금색 */
    staff?: true;
    /** 11/16 매니저 계정이 외친 것 → "매니저" 딱지 */
    mgr?: true;
    /** 11/15 마을 공지 줄 (실시간 서버 /internal/say) — 금색, "운영자" 딱지·신고 없음 */
    system?: true;
    /** 이 줄로 바꿔 끼울 앞 공지 id (긴급 의뢰 끝 → 시작 공지를 뺀다) */
    replaces?: string;
  };
  /** 11/17 확성기 창 고정 공지가 바뀌었다 (운영자가 쓰거나 지움, 실시간 서버 /internal/pin) → 확성기 창 맨 위 칸을 바꾼다 */
  "megaphone:pin": MegaPinMsg;
  /** 상점 맵에 들어감/나옴 (UI가 HUD 일부를 바꿀 때) */
  "scene:changed": {
    scene: "world" | "shop" | "hunt" | "minigame" | "house";
    /** 친구 위치용: "house" 장면 중 분양 마을인지 집 안인지 */ place?: "village" | "house";
    /** 집 안이면 그 집 id */ houseId?: string;
    /** 11/15 마을 자리에 그대로 서서 하는 미니게임 (망원경 별자리 잇기): 다른 사람 화면에서 숨기지 않는다 (away를 보내지 않는다) */
    stay?: boolean;
  };
  /** 실시간 서버가 이 화면을 옛 버전이라 거절함(4010, 큰 패치) → UI가 업데이트 창을 띄운다 (sticky) */
  "app:outdated": { source: "channel" | "room" };
  /** 47번: 실시간 서버가 이용 제한으로 내보냄(4012) → UI가 새로고침해 제한 화면을 띄운다 */
  "app:banned": undefined;
  /** 47번: 다른 사람 캐릭터(또는 이름표)를 눌렀다 → UI가 작은 메뉴(신고하기)를 띄운다. ch = 월드 채널, room = 방 id */
  "peer:menu": { sid: number; name: string; ch?: number; room?: string; /** 그 사람 머리 위에 지금 떠 있는 자유 채팅 (신고에 붙인다) */ chat?: string };
  /** 채팅 기록창 한 줄: 같은 채널·방에서 받은 자유 채팅(가린 글) 또는 내가 보낸 글. 화면 메모리에만 1분. key = 서버 줄 id(중복 제거) */
  "chat:line": { name: string; text: string; mine: boolean; key?: string; /** 운영자(실시간 서버가 알린 staff) → 이름 금색 */ staff?: true; /** 11/16 매니저(실시간 서버가 알린 mgr) → "매니저" 딱지 */ mgr?: true; /** 닉네임 꾸미기 id (lib/nameStyle nameStyleIds) */ ns?: string[]; /** 11/16 쓴 사람이 캠핑장·바닷가에 있었다, 11/17 사냥 중이었다("hunt") */ m?: ChatPlace; /** 11/16 귓속말 줄 (chatLog.ts ChatLine.w) */ w?: "out" | "in" | "fail" | "note" };
  /** 11/16 최근 귓속말 상대가 지금 이 채널에 있는지 (input:whoOn의 답, 서버가 준 그대로). on = 있음, off = 없음 (sticky) */
  "whisper:online": { on: string[]; off: string[] };
  /** 방에 들어올 때 서버가 보낸 이 방의 최근 1분 채팅 (이 기기 시계로 옮긴 줄). ch = 월드 채널이면 그 번호 (방이면 없음) */
  /** ch = 이 기록의 공간 (월드 채널 번호, 11/15 캠핑장은 "3c"처럼 c를 붙인다 — 맵마다 채팅이 따로) */
  "chat:log": { lines: IncomingChatLine[]; ch?: number | string };

  // ── 하우징 ── (game/housing, components/housing)
  /** 집 안 편집 상태 (편집 모드에서 바뀔 때마다). UI가 가방 남은 개수·점수·저장 버튼에 쓴다 */
  "house:state": HouseEditState;
  /** 집 안 방명록 팻말과 상호작용 → UI가 방명록을 연다 */
  "house:guestbook": undefined;
  /** 집에서 나옴 (문으로 걸어 나감 또는 house:exit). to = 돌아간 곳 (마을에서 들어왔으면 마을) */
  "house:left": { to: "world" | "village" };
  /** 마을에서 집 문과 상호작용 → UI가 집 정보를 받아 house:enter */
  "village:door": { houseId: string };
  /** 마을의 빈 필지 팻말과 상호작용 → UI가 그 번지로 분양 창을 연다 */
  "village:lot": { lot: number };
  /** 마을에서 나와 월드로 돌아옴 */
  "village:left": undefined;
  /** 마을·집에 함께 있는 사람 (방 인원, 나 포함). ownerHere = 집주인이 이 집에 있음 (마을에서는 false) */
  "house:presence": { where: "village" | "house"; count: number; online: boolean; ownerHere: boolean };
  /** 편집 중 안내 (빈자리 없음 등) */
  "house:notice": { message: string };

  // ── 사냥터(RPG) ── (game/rpg, components/rpg)
  /** 사냥터·미니게임 진행 상태 (초당 약 8번). components/rpg의 HUD가 그린다 */
  "rpg:hud": RpgHud;
  /** 판이 끝남 (시간 끝·전멸·클리어·포기). UI가 결과를 서버로 보내고 결과 창을 연다. 월드는 이미 다시 보인다 */
  "rpg:ended": { result: RunResult; aborted: boolean };
  /** 11/15 사냥 중 자동 스킬 설정이 바뀜 (Shift+숫자·칸 우클릭·X) → UI가 캐릭터에 저장한다 */
  "rpg:auto": HotAuto;
  /** 11/15 야근 빌딩 능력 카드 고르기 (sticky, null = 닫힘). 게임은 멈춘 채 rpg:cardPick을 기다린다 */
  "rpg:cards": CardOfferView | null;
  /** 11/17 발동형 카드·세트 장비 효과가 터짐 (game/rpg/procToast showProc) → 화면 오른쪽(폰은 위 가운데)에 그 그림을 2초 */
  "rpg:proc": ProcView;
  /** 11/19 숨겨진 5세트 효과가 처음 켜짐 (set = SG_SETS 순번) → 화면이 서버에 발견을 저장한다 (지금 낀 장비로 서버가 확인) */
  "rpg:egg": { set: number };
  /** 귀신의집 미로 진행 (초당 4번): 걸린 시간·놀란 횟수 (game/haunt → components/haunt) */
  "haunt:hud": { ms: number; scares: number };
  /** 귀신의집이 끝남 (출구로 빠져나옴 = escaped, 아니면 중간에 나감). 월드는 이미 다시 보인다 */
  "haunt:ended": { escaped: boolean; ms: number; scares: number };

  /** F17 미니맵: 내 위치와 같은 채널 사람들 위치 [x0, y0, x1, y1, …] (월드에 있는 동안 0.25초마다) */
  /** 친구 안내 (친구 옆으로 왔어요·실내라 못 가요 …) → UI가 화면 가운데 큼직한 띠로 띄운다 */
  "friend:notice": { message: string };
  /** 친구가 들어왔다(on)·나갔다 — 실시간 서버가 밀어 준 것 (key = 친구 창의 그 친구 키) */
  "friend:presence": { key: string; name: string; on: boolean };
  /** 11/16 이스터에그 「다람쥐를 뿌려라」: 채널 누군가 주문을 쳤다 (실시간 서버 판정) → 지금 보이는 장면에 다람쥐가 쏟아진다 (game/fx/SquirrelRain) */
  "fx:squirrels": { by: string; seed: number; at: number };
  /** 11/17 운영자 버튼 → 다람쥐 쿨다운 초기화 */
  "fx:squirrelsReset": undefined;
  /**
   * 11/17 장면(Atmosphere)이 하늘·날씨 목표를 다시 잡을 때마다 (1분마다, 날씨가 바뀌는 30분 경계엔 그 순간) 그 값을 알린다.
   * 화면 위 시간대·날씨 글(useAmbience)이 장면 날씨와 같은 순간에 바뀌게 이 값을 그대로 쓴다
   */
  "ambience:now": Ambience;
  "minimap:dots": { me: { x: number; y: number }; others: number[]; residents?: number[]; /** 친구 (others에서 뺀 같은 채널 친구 위치, 하트로 그린다) */ friends?: number[]; /** 11/15 캠핑장이면 "camp", 11/16 바닷가면 "sea" (그 맵 바탕) */ map?: AwayMapId };
  /** 11/15 지금 맵 (캠핑장 장면이 뜨면 camp, 11/16 바닷가 장면이면 sea, 닫히면 village). HUD·미니맵·채팅·음악이 본다 (sticky) */
  "map:changed": { map: MapId };
  /** 11/15 마을 ↔ 캠핑장·바닷가 버스를 타고 가는 중 (sticky) */
  "bus:state": { riding: boolean };
  /** 11/15 캠핑장 NPC 대화 창 (null이면 닫기, sticky) */
  "camp:talk": { npc: string; name: string; lines: string[] } | null;
  /** 11/18 캠핑장 눈덩이를 들고 있음 (sticky) → 터치 [점프] 버튼이 [굴리기]가 된다 (누르고 있는 동안 굴리기, 떼면 안기) */
  "camp:snowball": { held: boolean };
  /** 11/18 마을·캠핑장 눈싸움: 지금 눈을 던질 수 있는 곳·자세인지 (sticky, 겨울판 바깥에서 서 있거나 걸을 때) → 터치 [눈 던지기] 단추를 보인다 */
  "snow:can": { on: boolean };
  /** 11/18 눈 던지기 쿨타임: 다시 던질 수 있는 시각 (Date.now 기준 ms, sticky) → 터치 [눈 던지기] 단추가 남은 시간을 시계처럼 */
  "snow:cool": { until: number };
  /** 11/15 캠핑장 바베큐 그릴 앞에서 E → 메뉴 창 */
  "camp:bbq:open": { stand: BbqStand };
  /** 채널 이동 창: 지금 같은 채널에 보이는 사람들 닉네임 (peers:ask에 답한다, 나는 빼고). map = 지금 맵 (11/17 그 맵에 보이는 사람만이라서) */
  /** 11/20 staff = names 중 운영자 수 (로비 채널 인원엔 운영자가 없다) */
  "peers:list": { names: string[]; map: MapId; staff?: number };

  // ── 낚시·채집 (4·32번) ── (game/world/forage, components/forage)
  /** 낚시 자리에 앉음 / NPC 앞 / 채집 지점에서 E → UI가 낚시 창·판매 창·채집(게이지·곤충 미니게임)을 연다 */
  "forage:use": ForageUse;
  /** 낚시 자리에서 일어났거나 자리를 놓쳤다 → UI가 낚시 창을 닫는다 */
  "forage:left": undefined;

  // ── 동물원 (game/world/zoo, components/zoo) ──
  /** 사육사 앞에서 E → UI가 펫 분양 창을 연다 */
  "zoo:open": undefined;
  /** 타는 펫 (sticky): pet = 데리고 다니는 타는 펫 id(없으면 null), riding = 올라타 있음, can = 지금 올라탈 수 있음 (UI 타기 버튼) */
  "ride:state": { pet: string | null; riding: boolean; can: boolean };
  /** 11/15 오리배에 타 있음 (sticky) → 터치 [점프] 버튼이 [꽥!]이 된다 (오리배 위 Space = 꽥) */
  "boat:duck": { riding: boolean };
  /** 11/16 범퍼카에 타 있음 (sticky) → 터치 [점프] 버튼이 [빵빵!]이 된다 (범퍼카 위 Space = 빵빵) */
  "bumper:riding": { riding: boolean };
  /** 11/20 이번에 타고 나서 실제로 몰고 다닌 시간 (가만히 있던 시간은 빼고, 1초마다) → 오늘 미션 「범퍼카 한 판 타기」 */
  "bumper:drive": { ms: number };
  /**
   * 11/16 내 캐릭터가 지금 탄 것·앉은 자리 (sticky, 마을·캠핑장·바닷가 장면이 바뀔 때만 알린다 — lib/rideGate publishRide).
   * 사냥터·미니게임·집으로 가는 입구가 이걸 보고 탈것이면 막고, 앉아 있으면 player:stand로 일으켜 세운다 (lib/ridePolicy)
   */
  "player:ride": RideStatus;
  /** 내 캐릭터의 화면 위치 (CSS px, 뷰포트 기준). ui:radial이 열려 있는 동안 움직일 때만 */
  "me:screen": { x: number; y: number };
};


/** UI → Game */
export type UiEvents = {
  /** 관람차·열기구 탑승 중 [시점 변경하기] (버튼·V): 2D 장면 ↔ 맵 위 보기 */
  "sky:view": undefined;
  /** 11/16 바다 보기 켜기·끄기 (버튼·V) */
  "sea:view": undefined;
  /** 11/17 유령선 갑판에서 유령 상인 앞 E → UI가 유령선 특가 장터 창을 열어요 */
  "sea:ghost:open": undefined;
  /** 11/17 운영자 시험 부르기 상태 (sticky — 운영자 HUD가 서버에서 받아 알려요. 일반 계정은 늘 null) */
  "sea:ghost:call": { call: "on" | "off" | null };
  /** 11/17 포구 갈매기 과자 (sticky): 가진 과자 · 손에 든 과자 (매점 창·게임이 서로 알려요) */
  "sea:gull:snacks": { plain: number; spicy: number; hand: "plain" | "spicy" };
  /** 11/17 r2 과자 칸의 [과자 던지기] 버튼 → 가장 가까운 갈매기 쪽으로 던져요 (E와 같은 일 — 다른 E 대상이 가까워도) */
  "sea:snack:throw": undefined;
  /** 동물원 타는 펫 올라타기·내리기 (모바일·HUD 버튼, 데스크톱은 R) */
  "input:ride": undefined;
  /** 11/16 다른 장면으로 가기 직전: 의자·벤치·그네·해먹 같은 자리에 있으면 일어난다 (탈것은 lib/rideGate가 먼저 막는다) */
  "player:stand": undefined;
  /**
   * 지금 채널의 묘비 목록 (등록 순 = 격자 순서). 받을 때마다 월드를 다시 맞춘다.
   * 채널마다 묘지가 따로라, 게임은 channel이 자기 채널과 다른 목록은 무시하고 채널을 옮기면 묘비를 바로 비운다.
   */
  "graves:set": {
    channel: number;
    graves: PublicGrave[];
    reviveTop: string[];
    /** 방금 성불한 묘비 id (이번 목록에서 빠진 것). 게임이 사라지기 전 자리에 작은 빛을 띄운다 */
    passed?: string[];
  };
  /**
   * 내 묘비 가기 등: walk=true면 내 캐릭터가 길을 찾아 그 묘비 앞까지 걸어간다 (순간이동 없음, 진행은 grave:walk).
   * walk=false면 카메라만 그 묘비로 (랭킹 등)
   */
  "grave:focus": { graveId: string; walk: boolean };
  /**
   * 11/16 [사냥] 버튼: 내 캐릭터가 길을 찾아 그 입구까지 걸어가 도착하면 portal:open (순간이동 없음, 진행은 portal:walk). null = 그만 걷기.
   * 11/19 "shop" = 외치기 창 [상점에서 사기]: 유령 잡화점 문 앞까지 걸어가 들어간 뒤 shop:open
   * 11/20 "housing" = 집 없는 손님 거절 창 [분양 사무소로 가기]: 분양 사무소 문 앞까지 걸어가 portal:open housing
   */
  "portal:walkTo": { kind: "hunt" | "shop" | "housing" | null };
  /** 11/19 첫 걸음 미션 길 안내: 내 캐릭터에서 그 목적지까지 걷는 길에 촛불빛 화살표를 잇는다 (game/world/RouteGuide). null = 지우기 */
  "route:guide": { target: FirstGuideTarget | null };
  /** 내가 방금 묘비를 세움: 카메라 이동 + 흙 덮이는 연출 + graveEvent(buried) 전송 */
  "grave:buried": { graveId: string };
  /** 내가 묘비를 수정/이장함: graveEvent 전송 */
  "grave:changed": { graveId: string; kind: "updated" | "removed" };
  /** 헌화 저장 성공: 내 캐릭터가 꽃을 놓는 연출 + emote(flower) 전송 */
  "grave:flowered": { graveId: string };
  /** 게임 안 채널 이동 메뉴. 연결을 닫고 새 채널에 입장, 캐릭터 위치는 유지 */
  /** fullMsg = 그 채널이 꽉 차 못 갈 때 안내 (없으면 CHANNEL_FULL_MSG). 꽉 찬 채널로는 옮기지 않는다 (channel:refused) */
  "channel:switch": { channel: number; fullMsg?: string };
  /** 모바일 가상 조이스틱. -1..1, 손을 떼면 {0,0} */
  "input:joystick": { x: number; y: number };
  "input:runToggle": { on: boolean };
  "input:sit": undefined;
  /** 점프 (모바일 버튼). 데스크톱은 Space */
  "input:jump": undefined;
  /** 11/18 캠핑장 눈덩이 [굴리기] 버튼을 누르고 있음(on)·뗌. 데스크톱은 Space를 누르고 있는 동안 */
  "input:roll": { on: boolean };
  /** 11/18 눈싸움 [눈 던지기] (터치 단추). 데스크톱은 F (바닷가에서는 갈매기 과자) */
  "input:snowball": undefined;
  /** 감정표현 (모바일 버튼). 데스크톱은 1=wave, 2=cheer */
  "input:act": { kind: "wave" | "cheer" };
  /** 정해진 문장 말풍선 (PHRASES id). 지금 있는 공간(채널·방)에 보낸다 */
  "input:say": { id: string };
  /** 5번 이모티콘 (EMOS id). 내 머리 위에 바로 띄우고 같은 채널에 보낸다 */
  "input:emo": { id: string };
  /** 말풍선 자유 채팅 (입력칸이 정리·도배 제한을 마친 글). 지금 있는 공간(채널·방)에 보낸다 */
  "input:chat": { text: string };
  /** 11/16 귓속말 (입력칸이 "/w 닉네임 할 말"을 나눈 것). 월드 채널 연결로 보낸다 — 마을·캠핑장·실내 어디서든 */
  "input:whisper": { to: string; text: string };
  /** 11/16 채팅 입력칸을 이 글로 채우고 연다 (캐릭터 메뉴 [귓속말] → "/w 닉네임 ") */
  "chat:prefill": { text: string };
  /** 11/16 이 이름들이 지금 이 채널에 있는지 서버에 묻는다 (최근 귓속말 상대 칩을 흐리게 할지) → whisper:online */
  "input:whoOn": { names: string[] };
  /** 24번 벤치 상태 고르기 (SEAT_MOODS id, "" = 풀기). 앉아 있을 때만 */
  "input:mood": { mood: string };
  /** 첫 방문 안내: 월드의 한 지점을 화살표로 가리킨다 (null이면 지움). target이 있으면 게임이 그 대상의 좌표를 찾는다 */
  "guide:point": { target: "nearestGrave" | "shop" | "hunt" | "housing" | "bench" | "campfire" | "fishing" | "zoo" | "bumper" | null; label?: string };
  "input:interact": undefined;
  /** 모달·폼이 열려 있는 동안 게임 키보드 입력을 막는다 */
  "ui:blockKeys": { blocked: boolean };
  /** 31번: 내 계정이 운영자 계정인지 (sticky). 내 캐릭터를 저승사자 차림·"운영자" 배지로 그린다 */
  "me:staff": { on: boolean };
  /** 내 도감 100% 배지 (종류별 비트, sticky). 내 캐릭터 이름표 옆에 그린다 (다른 사람에겐 입장 토큰으로 간다) */
  "me:dex": { bits: number };
  /** 실시간 서버: 서버에서 내 계정(포인트·선물함)이 바뀌었다(관리자 지급 등) → UI가 내 정보·선물함을 다시 받는다 */
  "me:stale": undefined;
  /** 시점을 내 캐릭터로 되돌리고 다시 따라가기 */
  "camera:recenter": undefined;
  /** 줌 버튼(모바일 등). delta>0 확대, <0 축소. 휠과 같은 단계로 움직인다 */
  "camera:zoom": { delta: number };
  /** 11/19 촬영 모드 켜짐·꺼짐 (sticky). 카메라(CameraRig)·game/photo가 듣는다. 서버에는 아무것도 안 보낸다 */
  "photo:mode": { on: boolean };
  /** 11/19 촬영 모드 필터 (내 화면에서만): 이름표·내 캐릭터 보이기, 시간대(KST 시각)·날씨 미리보기 (null = 지금 그대로) */
  "photo:set": { names: boolean; me: boolean; hour: number | null; weather: Weather | null };
  /** 11/19 [찍기]: 게임이 캔버스만 PNG로 굽는다 (최대 2배, nearest) → photo:shot */
  "photo:shoot": undefined;
  /** 11/19 찍은 사진 (blob = null이면 실패) */
  "photo:shot": { blob: Blob | null; width: number; height: number };
  /** "여기서 다시 접속" (replaced/offline 상태에서) */
  "net:reconnect": undefined;
  /** 11/20 닉네임을 바꿨다: 내 머리 위 이름을 바로 바꾸고, 새 이름으로 다시 접속해 다른 사람에게도 보이게 */
  "me:renamed": { name: string };
  /** 꾸미기 착용 변경: 내 아바타에 바로 반영하고 grant를 실시간 서버로 보낸다 (sticky) */
  /** 내 착용 상태 (+ 46·25번: 염색·몸 모양 — 있으면 내 아바타에도 바로 입힌다) */
  /** champ = 주간 랭킹 1위 값 (0 = 아님, 옛 응답엔 없음) — 내 아바타 배지·오라 */
  /** mgr = 11/16 매니저 (1 = 매니저 → 내 머리 위 매니저 칭호, 0 = 아님, 옛 응답엔 없음) */
  "look:set": { look: string[]; lookGrant: string; dye?: AvatarDye; body?: string; champ?: number; mgr?: 0 | 1 };
  /** 폭죽 발사: 내 위치에서 바로 터뜨리고 grant를 실시간 서버로 보낸다 */
  "firework:fire": { item: string; grant: string };
  /** 11/20 광역 불꽃쇼가 이 채널(맵) 하늘에서 언제 끝나는지 (Date.now ms, sticky). 폭죽 창이 보고 다음 쇼를 막는다 */
  "firework:show": { until: number };
  /** 11/20 실시간 서버가 광역 불꽃쇼를 거절했다 (이미 하나 돌고 하나 기다리는 중). left = 남은 ms */
  "firework:busy": { left: number };
  /** 23번 확성기: Vercel이 서명한 증서를 지금 채널의 실시간 서버로 보낸다 (서버가 채널·모든 채널에 방송) */
  "megaphone:send": { grant: string };
  /** 내 계정이 세운 묘비 id들 (sticky). 게임은 이 묘비들에 "내 묘비" 표시를 띄운다 */
  "graves:mine": { ids: string[] };
  /** BGM 볼륨·음소거를 효과음에도 적용 (sticky) */
  "audio:settings": { volume: number; muted: boolean };
  /** 13번 소리 따로 조절 (sticky): 환경음(비·모닥불·물)·효과음(놀거리·낚시·폭죽 …) 볼륨과 끄기. BGM은 audio:settings */
  "audio:mix": SoundMix;
  /** 상점 UI가 닫힘 → 게임 키 입력 복귀 등 */
  "shop:closed": undefined;
  /** 50번 소원 분수: 동전 던지기가 서버에서 처리됐다 → 게임이 동전이 날아가 퐁당하는 연출 + 같은 채널에 물 튀기기 */
  "wish:thrown": { amount: number };

  // ── 하우징 ── (game/housing, components/housing)
  /** 집에 들어간다 (분양 사무소 → 내 집/다른 사람 집). 월드는 숨기고 연결은 유지한다 */
  "house:enter": { house: PublicHouse; mine: boolean; edit?: boolean };
  /** 집에서 나간다 (UI의 나가기 버튼) */
  "house:exit": undefined;
  /** 저장 등으로 집 정보가 바뀜 → 다시 그린다 */
  "house:data": { house: PublicHouse };
  /** 편집 모드 켜기/끄기. revert=true면 저장하지 않은 변경을 버린다 */
  "house:edit": { on: boolean; revert?: boolean };
  /** 편집 도구 */
  "house:tool": HouseTool;
  /** 분양 마을로 들어간다 (월드 또는 집에서). spawnLot이면 그 번지 문 앞에서 */
  "village:enter": { village: VillageResponse; myHouseId: string | null; spawnLot?: number | null };
  /** 마을 정보가 바뀜 (분양·외관 저장 뒤) → 다시 그린다. 메인 맵 주거 구역도 이걸로 집을 다시 세운다 (sticky) */
  "village:data": { village: VillageResponse; myHouseId: string | null };
  /** 메인 맵 주거 구역의 그 번지로 안내 (카메라가 비추고 문 위에 화살표). 분양 사무소 "내 집 보기" 등 */
  "world:lot": { lot: number; label?: string };
  /** 마을에서 나간다 (UI 버튼) */
  "village:exit": undefined;

  // ── 사냥터(RPG) ── (game/rpg, components/rpg)
  /** 판 시작 (서버가 준 시드·시간 + 내 캐릭터). 월드는 숨기고(연결 유지, 내 아바타는 입구에 멈춤) 미니게임 씬을 띄운다 */
  "rpg:play": RpgPlay;
  /** 공격·스킬·포션·칸 누르기 (모바일 버튼). 데스크톱 키보드는 게임이 직접 받는다 */
  "rpg:action": RpgAction;
  /** 모바일 가상 조이스틱 -1..1 */
  "rpg:joystick": { x: number; y: number };
  /** 화면 탭 (브라우저 좌표). 오버레이가 캔버스 위를 덮고 있어서 대신 전달한다 */
  "rpg:tap": { x: number; y: number };
  /** 멈춤 메뉴를 여닫을 때 */
  "rpg:pause": { paused: boolean };
  /** 포기하고 나가기 → 지금까지의 결과로 rpg:ended(aborted=true) */
  "rpg:quit": undefined;
  /** 11/15 능력 카드: 고름·다시 뽑기·상사의 제안 받기/거절 */
  "rpg:cardPick": CardChoice;
  /** 함께 사냥: 정해진 문장 말풍선 (PHRASES id) — 내 머리 위에 띄우고 같은 방에 보낸다 */
  "rpg:say": { id: string };

  // ── 귀신의집 ── (game/haunt, components/haunt)
  /** 미로 시작 (들어갈 때마다 새 시드). 월드는 어두워진 뒤 숨는다 (연결 유지, 내 아바타는 문 앞에 멈춤) */
  "haunt:play": { seed: number };
  /** 중간에 나가기 → haunt:ended(escaped=false) */
  "haunt:quit": undefined;
  /** 모바일 가상 조이스틱 -1..1 */
  "haunt:joystick": { x: number; y: number };

  // ── 낚시·채집 (4·32번) ──
  /** 지금 나에게 피어 있는 채집 지점 id (sticky). 게임이 그 지점만 그리고 상호작용을 붙인다 */
  "forage:nodes": { ids: string[] };
  /** 내 낚싯대 연출 단계. tension 0..1 (감는 중 줄 팽팽함) */
  "forage:rod": { phase: ForageRodPhase; tension?: number };
  /** 채집 게이지: start(ms 동안 머리 위 막대) / end(ok면 그 지점을 지운다) */
  "forage:gauge": { phase: "start"; ms: number; kind: string; node: string } | { phase: "end"; ok: boolean; node: string };
  /** 잡은 것·캔 것을 머리 위로 띄운다. sparkle = 반짝 효과 (물에 빠진 꾸미기 — itemId가 꾸미기 id) */
  "forage:pop": { itemId: string; sparkle?: boolean };
  /** 낚시 그만하기 (일어난다) */
  "forage:leave": undefined;
  /** 판매 동전 소리 */
  "forage:coin": undefined;
  /** 11/15 긴급 의뢰 마을 축제 (sticky): until = 축제가 끝나는 시각 ms (0 = 축제 없음) → 게임이 폭죽을 저절로 쏘고 모닥불을 금빛으로 */
  "urgent:fest": { until: number };
  /** 11/17 마을 맵 컨셉 (sticky, lib/mapConcept): 관리자가 고른 판 → 마을 그림을 겨울·크리스마스로 (주소 ?concept= 시험 값이 있으면 그쪽이 먼저) */
  "map:concept": { concept: MapConcept };
  /** 11/15 긴급 의뢰가 진행 중에 100%를 넘긴 순간 (한 번): 마을 하늘에 축하 폭죽 한 발 */
  "urgent:goal": undefined;
  /** 11/15 긴급 의뢰 현판 (sticky, null = 없음): 버스 정류장 마당 긴급 의뢰 현판에 서버 전체 막대를 그린다. frac = 낸 수 ÷ (목표 × 1.5), stage = 닿은 단계 */
  "urgent:board": { live: boolean; frac: number; stage: number; fest: boolean } | null;
  /** 도감 열기 (UI 안에서 쓴다: HUD 버튼·메뉴·남의 도감) */
  "forage:dex": { accountId?: string; peer?: { sid: number; ch?: number; room?: string }; name?: string | null };
  /** 채널 이동 창: 지금 채널에 있는 사람들 닉네임을 달라 (월드가 peers:list로 답한다) */
  "peers:ask": undefined;
  /** 즐겨찾기 표현 원형 목록(U 키)이 열렸다/닫혔다. 열려 있는 동안 게임이 내 캐릭터 화면 위치를 me:screen으로 알린다 */
  "ui:radial": { open: boolean };
  /** 친구: 지금 채널에 있는 친구들 (그 채널의 sid·이름) → 게임이 이름표 옆 하트·미니맵 하트로 그린다 (sticky) */
  "friends:here": { ch: number; list: { sid: number; name: string }[] };
  /** 친구한테 가기 (같은 채널 마을): 친구 옆 걸을 수 있는 칸으로 순간이동. x,y = 서버가 알려 준 위치 (화면에 친구가 없을 때 쓴다) */
  "friend:goto": { sid: number; name: string; x: number; y: number; /** 11/15 친구가 캠핑장에 있으면 "camp", 11/16 바닷가면 "sea" (맵이 다르면 버스를 거쳐 간다) */ map?: AwayMapId; /** 11/20 운영자 순간이동: 버스 연출 없이, 서버에 tp로 (반짝임) */ tp?: true };
  /** 11/20 누가 순간이동으로 (x,y)에서 사라졌다(out)·나타났다(in) → 그 맵 장면이 반짝임을 그린다. map = 받은 때의 내 맵 */
  "tp:fx": { x: number; y: number; k: "out" | "in"; map: MapId };
  /** 11/15 캠핑장 대화 창: 다음 말 (E·Space·버튼) / 닫았다 */
  "camp:talkNext": undefined;
  /** 11/15 바베큐를 샀다 (증서) → 게임이 먹는 연출·커지기, 실시간 서버로 증서 */
  "camp:bbq:eat": { item: BbqItemId; until: number; grant: string; /** 마실 거리: 마신 뒤 취기 단계·마신 시각 */ lv?: number; at?: number; /** 산 곳 (자판기면 캔이 떨어지는 연출부터) */ stand?: BbqStand };
  "camp:talkClose": undefined;
  /** 친구가 있는 집으로 따라 들어간다: 그 집 장면이 열리면 친구(이름)를 찾아 옆으로 옮긴다 (at = 누른 시각, 오래되면 무시. sticky) */
  "house:follow": { houseId: string; name: string; at: number } | null;

  // ── 11/20 회장님 독대 (game/chairman) ──
  /** 출근하기: 판 시작 요청 → 회장실 싸움 (입장 연출은 UI가 먼저 보여 주고 부른다). 오버레이·결과 창은 game/chairman이 띄운다 */
  "chairman:enter": { mode: "normal" | "hell"; practice?: boolean };
  /** 회장실에서 마을로 (결과 창 [마을로] · 판이 없을 때) */
  "chairman:exit": undefined;
  /** 11/22 브리핑(시작 전) 멈춤 창 [나가기] → 유료 판이면 판 돌려받기 시도(최대 1.5초) 뒤 마을로 */
  "chairman:leave": undefined;
  /** 11/22 시작 전 나가기 서버 응답 (refunded면 UI가 마을 토스트 · 입장 창 상태 새로 받기) */
  "chairman:aborted": { refunded: boolean; remaining: { normal: number; hell: number }; refundLeft: 0 | 1 };
  /** 결과 창 [한 판 더] */
  "chairman:retry": undefined;
  /** 업무 브리핑 [바로 시작] */
  "chairman:go": undefined;
  /** 11/21 개발 서버 운영자 무적(시험) 켜고 끄기 (오버레이 단추·G) — 운영 빌드에서는 싸움이 듣지 않는다 */
  "chairman:god": undefined;
  /** 게임 → 오버레이: 피해 계기판·단계 (초당 약 8번). god: 개발 서버 운영자만 실린다 (무적 켜짐 여부) · godUsed: 이번 판에 무적을 켠 채 싸운 적이 있다 */
  "chairman:hud": { total: number; dps: number; best: number; phase: number; mode: "normal" | "hell"; practice: boolean; under: boolean; god?: boolean; godUsed?: boolean;
    /** 11/21 버틴 시간 (판 시간 ms — 계기판 시간 칸) */
    ms?: number;
    /** 11/21 회장님 몸+말풍선 화면 상자 [l,t,r,b] (CSS px) — 위 HUD 판이 이 밑이면 반투명 */
    box?: [number, number, number, number];
    /** 11/22 내 캐릭터 화면 상자 [l,t,r,b] (CSS px) — PC 가운데 반려 카드가 이 위면 반투명 */
    me?: [number, number, number, number];
    /** 11/21 지옥 반려 예고·반려함: 반려된 것(순서대로) · 다음 것 · 남은 ms · 풀 크기 */
    seal?: { ids: string[]; next: string | null; left: number; total: number };
  };
  /** 게임 → 오버레이: 한 번씩 띄우는 것 (브리핑·처음 보는 기술·배너) */
  "chairman:ui":
    /** pats: 11/21 판 전체 기술 주머니에서 먼저 나올 기술 (브리핑 목록) */
    | { kind: "brief"; phase: number; pats?: string[] }
    | { kind: "caption"; name: string; how: string }
    /** big: 11/22 즉사 큰 글자 (프로젝트 드랍 — 위쪽에 짧게) */
    | { kind: "banner"; text: string; hot?: boolean; big?: boolean }
    /** 11/20 단계 전환 화면 (PHASE n · 이름 · 부제 — 크런치는 붉게) */
    | { kind: "phase"; n: number; name: string; sub: string; crunch: boolean; reduced: boolean }
    /** 11/21 지옥 반려 순간 (가운데 위 도장 — 회장님 한마디 · 스킬) */
    | { kind: "seal"; id: string; line: string; reduced: boolean; side?: "l" | "r" }
    | { kind: "status"; state: "starting" | "fight" | "dead" | "error"; message?: string };
  /** 판 끝 결과 (서버 응답까지 담아서 — 오버레이 결과 창 · UI가 듣는다) */
  "chairman:result": {
    mode: "normal" | "hell";
    practice: boolean;
    damage: number;
    durationMs: number;
    points: number | null;
    pointsReason?: string;
    newBest: boolean;
    best: number;
    weekRank: number | null;
    remaining: { normal: number; hell: number } | null;
    error?: string;
    /** 11/22 무적(시험)을 켠 판 (개발 서버 — 서버는 연습처럼 기록·포인트 없이 끝낸다). practice는 연습 버튼으로 시작한 판만 */
    god?: boolean;
  };
  // ── 11/20 회장님 독대 입장 (components/chairman) ──
  /** 게임 → UI: 등대 문 앞 E → 입장 창 */
  "chairman:door": undefined;
  /** 게임 → UI: 등대 전광판이 화면에 보인다 → 이번 주 노멀·헬 현재 1위를 달라 (UI가 1분 캐시) */
  "lighthouse:want": undefined;
  /** UI → 게임: 전광판 글 (3×5 LED — 영문·숫자만) + 판 위 이름표 줄 (11/22 노멀·헬 차례로 번갈아, 둘 다 비면 []) */
  "lighthouse:board": { led: string; tags: { mode: "normal" | "hell"; text: string }[] };
};

export type ForageUse =
  | { kind: "fish"; spot: string; water: FishWater }
  | { kind: "npc"; npc: NpcId }
  | { kind: "node"; node: string }
  /** 11/15 버스 정류장 마당 의뢰 게시판 → 수집 의뢰판 */
  | { kind: "board" };
export type ForageRodPhase = "idle" | "cast" | "wait" | "nibble" | "bite" | "reel" | "catch" | "escape" | "snap";

type AllEvents = GameEvents & UiEvents;
type Handler<K extends keyof AllEvents> = (payload: AllEvents[K]) => void;

const STICKY = new Set<keyof AllEvents>([
  "firework:show",
  "net:status",
  "graves:set",
  "ui:blockKeys",
  "ready",
  "game:rest",
  "camera:state",
  "grave:near",
  "door:near",
  "look:set",
  "graves:mine",
  "seat:near",
  "view:mode",
  "view:busy",
  "photo:mode",
  "sea:hud",
  "sea:snack:can",
  "sea:ghost:call",
  "sea:gull:snacks",
  "audio:settings",
  "queue:status",
  "scene:changed",
  "app:outdated",
  "village:data",
  "forage:nodes",
  "me:staff",
  "me:dex",
  "whisper:online",
  "mood:state",
  "audio:mix",
  "ride:state",
  "boat:duck",
  "bumper:riding",
  "player:ride",
  "ui:radial",
  "sky:hud",
  "friends:here",
  "house:follow",
  "rpg:cards",
  "urgent:fest",
  "map:concept",
  "urgent:board",
  "map:changed",
  "bus:state",
  "camp:talk",
  "camp:snowball",
  "snow:can",
  "snow:cool",
  "portal:walk",
  "route:guide",
  "lighthouse:board",
]);

class Bridge {
  private handlers = new Map<keyof AllEvents, Set<Handler<never>>>();
  private lastValues = new Map<keyof AllEvents, unknown>();

  on<K extends keyof AllEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => this.off(event, fn);
  }

  off<K extends keyof AllEvents>(event: K, fn: Handler<K>): void {
    this.handlers.get(event)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof AllEvents>(event: K, ...args: AllEvents[K] extends undefined ? [] : [AllEvents[K]]): void {
    const payload = args[0] as AllEvents[K];
    if (STICKY.has(event)) this.lastValues.set(event, payload);
    this.handlers.get(event)?.forEach((fn) => (fn as Handler<K>)(payload));
  }

  /** sticky 이벤트의 마지막 값 */
  last<K extends keyof AllEvents>(event: K): AllEvents[K] | undefined {
    return this.lastValues.get(event) as AllEvents[K] | undefined;
  }

  /** 게임 종료 시 정리 (sticky 값 중 게임 상태만 지운다) */
  resetGameState(): void {
    this.lastValues.delete("net:status");
    this.lastValues.delete("ready");
    this.lastValues.delete("camera:state");
    this.lastValues.delete("player:ride");
    this.lastValues.delete("snow:can");
    this.lastValues.delete("photo:mode");
  }
}

export const bridge = new Bridge();
