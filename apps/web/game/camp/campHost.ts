import type { AwayMapId } from "@tomb/protocol";
import type { ResumeState } from "@/lib/resume";
import type { InputHub } from "../input/InputHub";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Sfx } from "../world/Sfx";

// 11/15 캠핑장 장면(CampScene) ↔ 월드(CampTrip) 약속.

export const CAMP_SCENE = "camp";

/**
 * 친구 옆으로 가기 (버스를 거쳐 다른 맵의 친구한테).
 * 11/19 next = 마을 정류장에 내린 뒤 이어서 탈 버스의 맵 (캠핑장 ↔ 바닷가 친구 — 버스는 마을에만 서요). x·y는 그 맵 좌표
 */
export type CampFriend = { sid: number; name: string; x: number; y: number; next?: AwayMapId; /** 11/20 운영자 순간이동: 창밖 연출 없이 곧바로, 서버에는 tp로 */ tp?: true };

/** 월드가 캠핑장 장면에 빌려주는 것 (실시간 연결·글자·입력·소리는 게임에 하나) */
export type CampHost = {
  net: RealtimeClient;
  atlas: GlyphAtlas;
  hub: InputHub;
  sfx: Sfx;
  reduced: boolean;
  name: string;
  color: string;
  body: string;
  look: readonly string[];
  /** 캠핑장 → 마을 (캠핑장 장면이 버스를 태운 뒤). friend면 마을에 내려 그 친구 옆으로 */
  goVillage(friend?: CampFriend | null): void;
  /** 캠핑장을 열 수 없다 (서버가 마을로 받았다) → 연출 없이 마을로 */
  bail(): void;
  isFriend(sid: number, name: string): boolean;
};

export type CampSceneData = {
  host: CampHost;
  /** bus = 버스에서 내린다, resume = 새로고침 자리, friend = 친구 옆 */
  arrive: "bus" | "resume" | "friend";
  resume?: ResumeState | null;
  friend?: CampFriend | null;
  /** 버스 창밖 연출 뒤에서 미리 만드는 중 (그리기·입력·실시간 소식을 아직 받지 않는다 → unpark) */
  parked?: boolean;
};
