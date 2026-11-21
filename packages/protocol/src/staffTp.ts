import type { AwayMapId, MapId } from "./camp";
import type { AwayPlace } from "./friends";

// 11/20 운영자 순간이동 (운영자 계정만). 친구가 아니어도, 쿨다운 없이, 같은 채널 다른 맵까지 (다른 채널은 화면이 채널을 먼저 옮긴다).
//  - 화면: 친구 창의 「접속 중인 사람」(운영자에게만) → [순간이동]
//  - 실시간 서버: tp 메시지는 입장 토큰에 staff가 있는 연결만 받는다. 상대가 실내(집·사냥터 …)면 거절 (tpNo)
//  - 떠난 자리·도착한 자리에 반짝임(tpFx)을 그 맵 사람들에게

/** 운영자 화면 「접속 중인 사람」 한 줄 (웹 /api/staff/people). 실내면 inside(어디인지 place) */
export type StaffPerson = {
  ch: number;
  sid: number;
  name: string;
  x: number;
  y: number;
  /** 캠핑장·바닷가 (없으면 마을) */
  map?: AwayMapId;
  /** 실내(집 안·사냥터 …)에 들어가 있다 → 순간이동할 수 없다 */
  inside?: true;
  place?: AwayPlace;
};

/** 실시간 서버 → 웹 (/internal/people 응답 한 줄). visitorId는 웹이 나를 빼는 데만 쓰고 브라우저에는 넘기지 않는다 */
export type InternalPerson = StaffPerson & { visitorId: string };

/** 서버: 운영자가 고른 자리와 상대의 서버 위치가 이보다 멀면 받지 않는다 (상대가 그사이 걸어간 여유 포함) */
export const STAFF_TP_NEAR_PX = 240;
/** 서버: 연결당 최소 간격 (운영자라 쿨다운은 없고 같은 요청이 겹치는 것만 막는다) */
export const STAFF_TP_GAP_MS = 300;

/** 실내에 있어 갈 수 없을 때 안내 */
export const STAFF_TP_INSIDE_MSG = "지금 들어갈 수 없는 곳에 있어요.";
/** 접속을 끊었거나 사라졌을 때 */
export const STAFF_TP_GONE_MSG = "그 사람을 찾지 못했어요. 목록을 새로 볼게요.";
/** 도착 안내 */
export const STAFF_TP_ARRIVED = "순간이동했어요!";

/** 받는 사람(운영자)에게만: tp를 받지 않았다. inside = 상대가 실내, gone = 없다, far = 고른 자리가 너무 멀다·맵에 못 간다 */
export type StaffTpDenyWhy = "inside" | "gone" | "far";

/** tpNo 이유 → 안내 문구 */
export function staffTpDenyText(why: StaffTpDenyWhy): string {
  if (why === "inside") return STAFF_TP_INSIDE_MSG;
  if (why === "gone") return STAFF_TP_GONE_MSG;
  return "그 자리로 갈 수 없어요. 잠시 뒤 다시 해 주세요.";
}

/** 목록 한 줄 장소 (채널·맵·실내) */
export function staffPersonMap(p: Pick<StaffPerson, "map">): MapId {
  return p.map ?? "village";
}
