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
} as const;
export type StateName = keyof typeof STATE;
export type StateId = (typeof STATE)[StateName];
export const STATE_NAMES: readonly StateName[] = ["idle", "walk", "run", "sitGround", "sitChair", "jump", "hang", "swim", "dive", "swing", "hammock", "boat", "seesaw", "trampoline", "carousel", "lie", "read", "bath"];
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
};
