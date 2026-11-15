import type { ZoneId } from "@/lib/rpg/catalog";
import type { ThemeFactory } from "./runtime";
import { makeServerRoom } from "./serverRoomStage";
// 11/15 끝없는 회의실 몬스터 행동 (지도·회의 연장은 arena/Arena가 만드는 MeetingArena)
import { meetingRuntime } from "./meetingRoomRuntime";

// 11/15 야근 빌딩 테마 실행부 표 (HuntScene이 층마다 여기서 찾아 만든다). 새 테마는 한 줄로 끼운다
export const TOWER_THEME_RUNTIMES: Partial<Record<ZoneId, ThemeFactory>> = {
  "server-room": makeServerRoom,
  mt_meeting: meetingRuntime,
};
