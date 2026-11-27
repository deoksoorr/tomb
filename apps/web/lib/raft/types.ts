import type { Me } from "../types";

// 11/27 좌대 입장권 API 응답 (화면·서버가 같이 쓴다 — 서버 코드는 ./service)

export type RaftSlot = { n: number; state: "free" | "used" | "mine"; until?: number; name?: string };
export type RaftMine = { ch: number; n: number; until: number; renews: number; renewLeft: number };
export type RaftStatusResponse = {
  /** 서버 시각 (화면 시계 맞추기) */
  now: number;
  ch: number;
  slots: RaftSlot[];
  /** 지금 살아 있는 내 입장권 (다른 채널 것이어도) */
  mine: RaftMine | null;
  /** 이 채널 좌대를 다시 살 수 있는 시각 (막혀 있을 때만) */
  rebuyAt: number | null;
  /** 오늘 남은 좌대 시간 (분) */
  dayLeftMin: number;
  /** 지금 사면 받는 길이·값 (dayLeftMin이 0이면 0) */
  buyMin: number;
  buyPrice: number;
};
export type RaftDealResponse = { me: Me; grant: string; status: RaftStatusResponse; min: number; price: number };

