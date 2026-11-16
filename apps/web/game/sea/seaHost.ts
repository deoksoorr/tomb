import type { CampHost, CampFriend } from "../camp/campHost";
import type { ResumeState } from "@/lib/resume";

// 11/16 바닷가 장면(SeaScene) ↔ 월드(CampTrip — 마을 밖 맵 버스 여행을 같이 맡아요) 약속. 캠핑장 약속(campHost)과 같은 모양이에요.

export const SEA_SCENE = "sea";

export type SeaFriend = CampFriend;
/** 월드가 바닷가 장면에 빌려주는 것 (실시간 연결·글자·입력·소리는 게임에 하나) — 캠핑장과 같아요 */
export type SeaHost = CampHost;

export type SeaSceneData = {
  host: SeaHost;
  /** bus = 버스에서 내린다, resume = 새로고침 자리, friend = 친구 옆 */
  arrive: "bus" | "resume" | "friend";
  resume?: ResumeState | null;
  friend?: SeaFriend | null;
  /** 버스 창밖 연출 뒤에서 미리 만드는 중 (그리기·입력·실시간 소식을 아직 받지 않는다 → unpark) */
  parked?: boolean;
};
