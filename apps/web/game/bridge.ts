import type { AvatarDye, GraveEventKind, QueueStatus } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import type { HouseEditState, HouseTool } from "@/game/housing/events";
import type { PublicHouse, VillageResponse } from "@/lib/housing/types";
import type { RpgAction, RpgHud, RpgPlay, RunResult } from "@/lib/rpg/types";
import type { ResumeState } from "@/lib/resume";

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
  /** 나를 포함한 채널 인원 */
  count: number;
  cap: number;
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
  /** 근접 툴팁 대상 묘비 (없으면 null). 모바일 상호작용 버튼 표시용 */
  "grave:near": { graveId: string } | null;
  /** 앉을 수 있는 빈 좌석 근처(없으면 null). 게임은 좌석 옆에 "X 앉기" 안내를, UI는 모바일 앉기 버튼을 강조한다 (sticky) */
  "seat:near": { seatId: string; kind: "bench" | "chair" } | null;
  /** E/Space/탭으로 묘비 상세 모달을 열어 달라는 요청 */
  "grave:open": { graveId: string };
  /**
   * 내 묘비 가기 걷기 상태 (41번). started = 길을 찾아 걷기 시작, arrived = 도착(또는 이미 가까워 바라보기만),
   * cancelled = 이동·점프·클릭 등 입력으로 그만둠, unreachable = 길이 없음(또는 도중에 막힘)
   */
  "grave:walk": { graveId: string; status: "started" | "arrived" | "cancelled" | "unreachable" };
  "net:status": NetStatus;
  "net:stats": NetStats;
  /** 같은 채널의 다른 사람이 묘비를 세움/수정/삭제 → UI가 상세를 받아 목록에 반영 */
  "net:graveEvent": { kind: GraveEventKind; graveId: string };
  toast: { message: string };
  /** 카메라 상태. detached=true면 우클릭 드래그로 시점을 옮겨서 내 캐릭터를 따라가지 않는 중 (UI가 "내 캐릭터로" 버튼 표시) */
  "camera:state": { detached: boolean; zoom: number };
  /** 화면 연출 모드 (sticky). campfire = 모닥불에 앉아 카메라가 불멍 구도로 바뀐 상태 → UI는 HUD를 은은하게 줄인다 */
  "view:mode": { mode: "normal" | "campfire" };
  /** 대기열 순번 (sticky) */
  "queue:status": QueueStatus;
  /** 상점 맵 안에서 주인장과 상호작용 → UI가 상점 창을 연다 */
  "shop:open": undefined;
  /**
   * 월드의 특별한 장소와 상호작용: 사냥터 입구 / 분양 사무소(하우징) / 성황당 → UI가 해당 창을 연다.
   * 주거 구역(메인 맵의 분양 마을): 집 문이면 houseId(그 집으로 들어가기), 빈 필지 팻말이면 lot(그 번지로 분양 문의)
   */
  "portal:open": { kind: "hunt" | "housing" | "shrine" | "telescope" | "wish"; houseId?: string; lot?: number };
  /** 22번 황금 고블린을 내가 가장 먼저 잡았다 → UI가 증서로 /api/goblin에 보상을 받는다 */
  "goblin:grant": { id: string; grant: string; points: number };
  /** 23번 확성기 한마디가 실시간 서버에서 왔다 (내 것 포함) → UI의 확성기 창에 띄운다 */
  "megaphone:heard": { id: string; name: string; text: string; scope: "channel" | "all"; ch: number; at: number };
  /** 상점 맵에 들어감/나옴 (UI가 HUD 일부를 바꿀 때) */
  "scene:changed": { scene: "world" | "shop" | "hunt" | "minigame" | "house" };
  /** 실시간 서버가 이 화면을 옛 버전이라 거절함(4010, 큰 패치) → UI가 업데이트 창을 띄운다 (sticky) */
  "app:outdated": { source: "channel" | "room" };

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

  /** F17 미니맵: 내 위치와 같은 채널 사람들 위치 [x0, y0, x1, y1, …] (월드에 있는 동안 0.25초마다) */
  "minimap:dots": { me: { x: number; y: number }; others: number[] };

  // ── 낚시·채집 (4·32번) ── (game/world/forage, components/forage)
  /** 낚시 자리에 앉음 / NPC 앞 / 채집 지점에서 E → UI가 낚시 창·판매 창·채집(게이지·곤충 미니게임)을 연다 */
  "forage:use": ForageUse;
  /** 낚시 자리에서 일어났거나 자리를 놓쳤다 → UI가 낚시 창을 닫는다 */
  "forage:left": undefined;
};


/** UI → Game */
export type UiEvents = {
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
  /** 내가 방금 묘비를 세움: 카메라 이동 + 흙 덮이는 연출 + graveEvent(buried) 전송 */
  "grave:buried": { graveId: string };
  /** 내가 묘비를 수정/이장함: graveEvent 전송 */
  "grave:changed": { graveId: string; kind: "updated" | "removed" };
  /** 헌화 저장 성공: 내 캐릭터가 꽃을 놓는 연출 + emote(flower) 전송 */
  "grave:flowered": { graveId: string };
  /** 게임 안 채널 이동 메뉴. 연결을 닫고 새 채널에 입장, 캐릭터 위치는 유지 */
  "channel:switch": { channel: number };
  /** 모바일 가상 조이스틱. -1..1, 손을 떼면 {0,0} */
  "input:joystick": { x: number; y: number };
  "input:runToggle": { on: boolean };
  "input:sit": undefined;
  /** 점프 (모바일 버튼). 데스크톱은 Space */
  "input:jump": undefined;
  /** 감정표현 (모바일 버튼). 데스크톱은 1=wave, 2=cheer */
  "input:act": { kind: "wave" | "cheer" };
  /** 정해진 문장 말풍선 (PHRASES id). 지금 있는 공간(채널·방)에 보낸다 */
  "input:say": { id: string };
  /** 첫 방문 안내: 월드의 한 지점을 화살표로 가리킨다 (null이면 지움). target이 있으면 게임이 그 대상의 좌표를 찾는다 */
  "guide:point": { target: "nearestGrave" | "shop" | "hunt" | "housing" | "bench" | "campfire" | "fishing" | null; label?: string };
  "input:interact": undefined;
  /** 모달·폼이 열려 있는 동안 게임 키보드 입력을 막는다 */
  "ui:blockKeys": { blocked: boolean };
  /** 시점을 내 캐릭터로 되돌리고 다시 따라가기 */
  "camera:recenter": undefined;
  /** 줌 버튼(모바일 등). delta>0 확대, <0 축소. 휠과 같은 단계로 움직인다 */
  "camera:zoom": { delta: number };
  /** "여기서 다시 접속" (replaced/offline 상태에서) */
  "net:reconnect": undefined;
  /** 꾸미기 착용 변경: 내 아바타에 바로 반영하고 grant를 실시간 서버로 보낸다 (sticky) */
  /** 내 착용 상태 (+ 46·25번: 염색·몸 모양 — 있으면 내 아바타에도 바로 입힌다) */
  "look:set": { look: string[]; lookGrant: string; dye?: AvatarDye; body?: string };
  /** 폭죽 발사: 내 위치에서 바로 터뜨리고 grant를 실시간 서버로 보낸다 */
  "firework:fire": { item: string; grant: string };
  /** 23번 확성기: Vercel이 서명한 증서를 지금 채널의 실시간 서버로 보낸다 (서버가 채널·모든 채널에 방송) */
  "megaphone:send": { grant: string };
  /** 내 계정이 세운 묘비 id들 (sticky). 게임은 이 묘비들에 "내 묘비" 표시를 띄운다 */
  "graves:mine": { ids: string[] };
  /** BGM 볼륨·음소거를 효과음에도 적용 (sticky) */
  "audio:settings": { volume: number; muted: boolean };
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
  /** 함께 사냥: 정해진 문장 말풍선 (PHRASES id) — 내 머리 위에 띄우고 같은 방에 보낸다 */
  "rpg:say": { id: string };

  // ── 낚시·채집 (4·32번) ──
  /** 지금 나에게 피어 있는 채집 지점 id (sticky). 게임이 그 지점만 그리고 상호작용을 붙인다 */
  "forage:nodes": { ids: string[] };
  /** 내 낚싯대 연출 단계. tension 0..1 (감는 중 줄 팽팽함) */
  "forage:rod": { phase: ForageRodPhase; tension?: number };
  /** 채집 게이지: start(ms 동안 머리 위 막대) / end(ok면 그 지점을 지운다) */
  "forage:gauge": { phase: "start"; ms: number; kind: string; node: string } | { phase: "end"; ok: boolean; node: string };
  /** 잡은 것·캔 것을 머리 위로 띄운다 */
  "forage:pop": { itemId: string };
  /** 낚시 그만하기 (일어난다) */
  "forage:leave": undefined;
  /** 판매 동전 소리 */
  "forage:coin": undefined;
  /** 도감 열기 (UI 안에서 쓴다: HUD 버튼·메뉴·남의 도감) */
  "forage:dex": { accountId?: string; name?: string | null };
};

export type ForageUse = { kind: "fish"; spot: string; water: "lake" | "river" } | { kind: "npc"; npc: "fishmonger" | "collector" } | { kind: "node"; node: string };
export type ForageRodPhase = "idle" | "cast" | "wait" | "nibble" | "bite" | "reel" | "catch" | "escape" | "snap";

type AllEvents = GameEvents & UiEvents;
type Handler<K extends keyof AllEvents> = (payload: AllEvents[K]) => void;

const STICKY = new Set<keyof AllEvents>([
  "net:status",
  "graves:set",
  "ui:blockKeys",
  "ready",
  "camera:state",
  "grave:near",
  "look:set",
  "graves:mine",
  "seat:near",
  "view:mode",
  "audio:settings",
  "queue:status",
  "scene:changed",
  "app:outdated",
  "village:data",
  "forage:nodes",
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
  }
}

export const bridge = new Bridge();
