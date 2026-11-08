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
} as const;
export type StateName = keyof typeof STATE;
export type StateId = (typeof STATE)[StateName];
export const STATE_NAMES: readonly StateName[] = ["idle", "walk", "run", "sitGround", "sitChair", "jump", "hang", "swim", "dive", "swing"];
export function isStateId(n: number): n is StateId {
  return Number.isInteger(n) && n >= 0 && n <= 9;
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
};
