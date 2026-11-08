import type { GraveEventKind, QueueStatus } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";

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
  /** 입장 화면에서 고른 채널 */
  channel: number | "auto";
  /** 공유 링크 /?grave={id} 로 들어왔으면 그 묘비 앞에 스폰하고 grave:open을 보낸다 */
  focusGraveId?: string | null;
  debug?: boolean;
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
  "net:status": NetStatus;
  "net:stats": NetStats;
  /** 같은 채널의 다른 사람이 묘비를 세움/수정/삭제 → UI가 상세를 받아 목록에 반영 */
  "net:graveEvent": { kind: GraveEventKind; graveId: string };
  toast: { message: string };
  /** 카메라 상태. detached=true면 우클릭 드래그로 시점을 옮겨서 내 캐릭터를 따라가지 않는 중 (UI가 "내 캐릭터로" 버튼 표시) */
  "camera:state": { detached: boolean; zoom: number };
  /** 대기열 순번 (sticky) */
  "queue:status": QueueStatus;
  /** 상점 맵 안에서 주인장과 상호작용 → UI가 상점 창을 연다 */
  "shop:open": undefined;
  /** 상점 맵에 들어감/나옴 (UI가 HUD 일부를 바꿀 때) */
  "scene:changed": { scene: "world" | "shop" };
};


/** UI → Game */
export type UiEvents = {
  /** 묘비 목록 (등록 순 = 격자 순서). 받을 때마다 월드를 다시 맞춘다 */
  "graves:set": { graves: PublicGrave[]; reviveTop: string[] };
  /** 랭킹 클릭 등: 내 캐릭터를 그 묘비 앞으로 순간이동 (teleport=false면 카메라만) */
  "grave:focus": { graveId: string; teleport: boolean };
  /** 내가 방금 묘비를 세움: 카메라 이동 + 흙 덮이는 연출 + graveEvent(buried) 전송 */
  "grave:buried": { graveId: string };
  /** 내가 묘비를 수정/이장함: graveEvent 전송 */
  "grave:changed": { graveId: string; kind: "updated" | "removed" };
  /** 헌화 저장 성공: 내 캐릭터가 꽃을 놓는 연출 + emote(flower) 전송 */
  "grave:flowered": { graveId: string };
  /** 살려주세요 저장 성공: revived=true면 연출 + emote(revive) 전송 */
  "grave:revived": { graveId: string; revived: boolean };
  /** 게임 안 채널 이동 메뉴. 연결을 닫고 새 채널에 입장, 캐릭터 위치는 유지 */
  "channel:switch": { channel: number };
  /** 모바일 가상 조이스틱. -1..1, 손을 떼면 {0,0} */
  "input:joystick": { x: number; y: number };
  "input:runToggle": { on: boolean };
  "input:sit": undefined;
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
  "look:set": { look: string[]; lookGrant: string };
  /** 폭죽 발사: 내 위치에서 바로 터뜨리고 grant를 실시간 서버로 보낸다 */
  "firework:fire": { item: string; grant: string };
  /** 내 계정이 세운 묘비 id들 (sticky). 게임은 이 묘비들에 "내 묘비" 표시를 띄운다 */
  "graves:mine": { ids: string[] };
  /** BGM 볼륨·음소거를 효과음에도 적용 (sticky) */
  "audio:settings": { volume: number; muted: boolean };
  /** 상점 UI가 닫힘 → 게임 키 입력 복귀 등 */
  "shop:closed": undefined;
};

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
  "audio:settings",
  "queue:status",
  "scene:changed",
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
