import { BOAT_FISHING_SPOTS, campFishingSpotById, fishingSpotById, seaFishingSpotById, type MapId, type PeerWhere } from "@tomb/protocol";
import type { MoveVia } from "../moveLog";
import type { AutoSession } from "./auto";

// 11/27 자동 낚시는 켠 자리(맵·채널)에 묶인다 (운영자: 「자리를 떠나는 순간 멈춰야 한다」).
// 서버가 위치를 아는 길마다 끈다: 집 들어가기 확인·방 입장(사냥터·분양 마을)·다른 채널 입장 토큰은 그 순간(now)에,
// 맵 옮기기(버스·순간이동)처럼 웹을 거치지 않는 것은 다음 신호(머무르기 기록·정산)에서 실시간 서버 위치를 보고 마지막 신호 시각까지만 쳐서 끈다.
// 연결이 잠깐 끊긴 것(실시간 서버에 없음)은 그대로 두고 신호도 늘리지 않는다 — 같은 자리로 돌아오면 이어지고, 다른 곳이면 끊긴 때까지만.

/** 그 낚시 자리가 있는 맵 (모르는 자리면 null — 맵은 보지 않는다) */
export function autoSpotMap(spot: string): MapId | null {
  if (Object.prototype.hasOwnProperty.call(BOAT_FISHING_SPOTS, spot)) return spot === "boat:reservoir" ? "camp" : "village";
  if (campFishingSpotById(spot)) return "camp";
  if (seaFishingSpotById(spot)) return "sea";
  if (fishingSpotById(spot)) return "village";
  return null;
}

/**
 * 실시간 서버가 아는 지금 자리로 보면 자동 낚시 자리를 떠났는지. 떠났으면 그 까닭 (기록용), 그대로거나 모르면 null.
 * reached = 실시간 서버에 닿았는지, w = 그 사람 자리 (없으면 지금 연결이 없다 — 끊긴 것으로 보고 판단하지 않는다)
 */
export function autoLeftSpot(s: Pick<AutoSession, "spot" | "ch">, reached: boolean, w: PeerWhere | undefined): MoveVia | null {
  if (!reached || !w) return null;
  if (s.ch !== null && w.ch !== s.ch) return "fishChannel";
  if (w.away) return "fishAway";
  const map = autoSpotMap(s.spot);
  if (map !== null && (w.map ?? "village") !== map) return "fishMap";
  return null;
}
