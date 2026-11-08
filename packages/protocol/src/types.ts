/** 캐릭터 상태 머신 값. 바이너리로 u8 전송. */
export const STATE = {
  idle: 0,
  walk: 1,
  run: 2,
  sitGround: 3,
  sitChair: 4,
} as const;
export type StateName = keyof typeof STATE;
export type StateId = (typeof STATE)[StateName];
export const STATE_NAMES: readonly StateName[] = ["idle", "walk", "run", "sitGround", "sitChair"];
export function isStateId(n: number): n is StateId {
  return Number.isInteger(n) && n >= 0 && n <= 4;
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
  /** 착용 중인 꾸미기 아이템 id (items.ts). 입장 때와 바뀔 때만 보낸다 */
  look: string[];
};
