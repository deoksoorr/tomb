import type { AvatarDye } from "./dye";

/** 캐릭터 상태 머신 값. 바이너리로 u8 전송. */
export const STATE = {
  idle: 0,
  walk: 1,
  run: 2,
  sitGround: 3,
  sitChair: 4,
  /** 점프 중(약 0.45초). 이 동안은 묘비·의자 같은 낮은 장애물을 넘어갈 수 있다 */
  jump: 5,
  /** 나무에 매달리기 */
  hang: 6,
  /** 물에서 수영 */
  swim: 7,
  /** 물속 잠수 (아바타가 반쯤 가려지고 물방울) */
  dive: 8,
  /** 그네 타기 */
  swing: 9,
  /** 해먹에 누워 흔들흔들 (1인 자리) */
  hammock: 10,
  // ── 50번 조각배·광장 놀거리 (1인 자리, 서버 좌석) ──
  /** 조각배에 앉아 있음 (앞자리 = 노 젓기, 2인승 뒷자리 = 같이 타기). 물 위에서 움직이는 자리 */
  boat: 11,
  /** 시소에 앉아 오르락내리락 (2인, 양 끝이 각각 1인 자리) */
  seesaw: 12,
  /** 트램펄린에서 통통 높이 뛰기 (1인 자리) */
  trampoline: 13,
  /** 회전목마 목마에 타고 빙글빙글 (자리마다 1인) */
  carousel: 14,
  // ── 3번 집 안 가구 (1인 자리, 방 서버 좌석) ──
  /** 침대에 누워 이불을 덮음 */
  lie: 15,
  /** 책장 앞에서 책을 펼쳐 읽음 */
  read: 16,
  /** 욕조에 들어가 있음 (어깨까지 거품) */
  bath: 17,
  // ── 놀이기구 2 (관람차·열기구, 1인 자리·서버 좌석) ──
  /** 관람차 칸에 앉아 한 바퀴 (칸마다 2자리). 서버 위치는 타는 곳 앵커 그대로, 칸 위치는 서버 시계로 모두 같게 */
  ferris: 18,
  /** 열기구 바구니에 서서 맵 위를 날기 (기구마다 4자리). 서버 위치는 출발장 앵커 그대로, 비행 경로는 운항 시간표로 모두 같게 */
  balloon: 19,
} as const;
export type StateName = keyof typeof STATE;
export type StateId = (typeof STATE)[StateName];
export const STATE_NAMES: readonly StateName[] = ["idle", "walk", "run", "sitGround", "sitChair", "jump", "hang", "swim", "dive", "swing", "hammock", "boat", "seesaw", "trampoline", "carousel", "lie", "read", "bath", "ferris", "balloon"];
export function isStateId(n: number): n is StateId {
  return Number.isInteger(n) && n >= 0 && n < STATE_NAMES.length;
}

/** 4방향 스프라이트 방향. 바이너리로 u8 전송. */
export const DIR = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
} as const;
export type DirName = keyof typeof DIR;
export type DirId = (typeof DIR)[DirName];
export function isDirId(n: number): n is DirId {
  return Number.isInteger(n) && n >= 0 && n <= 3;
}

/** 채널 안에서 쓰는 짧은 정수 id (u16) */
export type Sid = number;

export type PeerState = {
  sid: Sid;
  x: number;
  y: number;
  state: StateId;
  dir: DirId;
};

export type PeerInfo = PeerState & {
  name: string;
  color: string;
  /** 아바타 몸 모양 (AVATAR_BODIES id) */
  body: string;
  /** 착용 중인 꾸미기 아이템 id (items.ts). 입장 때와 바뀔 때만 보낸다 */
  look: string[];
  /** 46번 염색한 부위 색 (없으면 color 하나로 칠한다). 옛 클라이언트는 모르는 필드라 무시한다 */
  dye?: AvatarDye;
  /** 24번 벤치 상태 (SEAT_MOODS id, 앉아 있는 동안만). 옛 클라이언트는 모르는 필드라 무시한다 */
  mood?: string;
  /** 31번 운영자 계정 (입장 토큰에 서버가 넣은 것만) → 저승사자 차림·"운영자" 배지. 옛 클라이언트는 무시한다 */
  staff?: true;
  /** 도감 100% 달성 종류 (DEX_BADGE_BITS 비트 묶음, 입장 토큰에 서버가 넣은 것만) → 이름표 옆 작은 배지. 옛 클라이언트는 무시한다 */
  dex?: number;
  /** 동물원 타는 펫에 올라타 있다 (look의 펫이 타는 펫일 때만 서버가 켠다). 옛 클라이언트는 무시한다 */
  ride?: true;
  /** 4번 배 위 낚시: 조각배에서 낚싯대를 드리우고 있다 (배 자리에 앉아 있을 때만 서버가 켠다). 옛 클라이언트는 무시한다 */
  rod?: true;
  /** 실내(상점·집·사냥터 등 하위 장면)에 들어가 있다 → 메인 맵에서 숨긴다. 옛 클라이언트는 무시한다(문 앞에 보인다) */
  away?: true;
};
