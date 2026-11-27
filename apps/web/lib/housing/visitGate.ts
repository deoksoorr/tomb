import type { MapId, PeerWhere } from "@tomb/protocol";

// 11/27 남의 집 놀러 가기 규칙 (운영자: 「로그인 안 한 친구의 집은 못 가게 막아야 함」).
//  - 내 집·운영자는 언제나
//  - 주인이 지금 접속 중(어느 채널·맵·실내든, 잠깐 끊겨 유예 중이어도)이면 들어간다
//  - 주인이 없어도 지금 그 집이 있는 채널·맵에 서 있으면(문 앞에서 E) 들어간다 — 걸어서 들어가는 건 그대로
//  - 실시간 서버에 닿지 못하면 판단을 화면에 맡긴다(unknown): 화면은 지금 채널·맵의 집만 들어간다
// 남의 집에서 나오면 들어가기 전 맵·자리 그대로라(game/housing/housePlace) 남의 집으로 맵을 건너뛰지 못한다.

export type VisitVerdict = { ok: true; unknown?: true } | { ok: false; why: "offline" };

export type VisitInput = {
  mine: boolean;
  staff: boolean;
  /** 실시간 서버에 닿았는지 (위치 조회 결과가 있는지) */
  reached: boolean;
  owner: PeerWhere | undefined;
  me: PeerWhere | undefined;
  house: { ch: number; map: MapId };
};

export const mapOfWhere = (w: PeerWhere): MapId => w.map ?? "village";

export function visitVerdict(o: VisitInput): VisitVerdict {
  if (o.mine || o.staff) return { ok: true };
  if (!o.reached) return { ok: true, unknown: true };
  if (o.owner) return { ok: true };
  if (o.me && o.me.ch === o.house.ch && mapOfWhere(o.me) === o.house.map) return { ok: true };
  return { ok: false, why: "offline" };
}

export const ownerOfflineMessage = (ownerName: string): string => `${ownerName}님이 접속해 있을 때만 놀러 갈 수 있어요.`;

const CAMP_KIND: Record<string, string> = { caravan: "카라반", pension: "펜션", rural: "촌캉스" };

/** 기록용 대상 이름: 「GBT의 카라반 · 1채널 캠핑장 7번」 */
export function houseTargetText(h: { ownerName: string; ch: number; lot: number; zone?: "sea" | "camp"; camp?: { kind?: string } }): string {
  const kind = h.zone === "camp" ? (CAMP_KIND[h.camp?.kind ?? ""] ?? "캠핑장 집") : h.zone === "sea" ? "오두막" : "집";
  const where = h.zone === "camp" ? `캠핑장 ${h.lot}번` : h.zone === "sea" ? `포구 ${h.lot}번` : `${h.lot}번지`;
  return `${h.ownerName}의 ${kind} · ${h.ch}채널 ${where}`.slice(0, 60);
}
