import type { LobbyInfo } from "@tomb/protocol";
import type { DashOnline } from "./adminDashboard";

// 11/26 관리자 대시보드 「지금 접속」 카드 (화면에서 쓰는 순수 함수 — 서버 모듈을 끌어오지 않게 adminDashboard와 따로 둔다).
// 큰 수·맵별·채널별을 모두 같은 명단 한 번(대시보드 응답의 online)에서 센다. 예전엔 큰 수·채널은 로비에서, 맵별은 명단에서 따로 읽어
// 누가 들고 나는 사이 1명씩 어긋났다. 로비에선 정원·열린 채널만 쓴다.

export type OnlineChip = { id: number; n: number; cap: number | null };
export type OnlineView = {
  /** null = 아직 모름 (대시보드를 받는 중) */
  total: number | null;
  /** 전체 정원 (로비) */
  cap: number | null;
  channels: OnlineChip[];
};

/** 명단(online)이 있으면 그 하나로만 센다. 명단을 못 읽었을 때만 로비 수를 대신 쓴다 */
export function onlineView(online: DashOnline | null | undefined, lobby: LobbyInfo | null): OnlineView {
  const cap = lobby?.totalCap ?? null;
  if (online === undefined) return { total: null, cap, channels: [] };
  if (online === null) {
    if (!lobby) return { total: null, cap, channels: [] };
    const channels = lobby.channels.filter((c) => c.open || c.count > 0).map((c) => ({ id: c.id, n: c.count, cap: c.cap }));
    return { total: lobby.total, cap, channels };
  }
  const n = new Map(online.byCh.map((r) => [r.ch, r.n]));
  const capOf = new Map((lobby?.channels ?? []).map((c) => [c.id, c.cap]));
  const ids = new Set([...(lobby?.channels ?? []).filter((c) => c.open).map((c) => c.id), ...n.keys()]);
  const channels = [...ids].sort((a, b) => a - b).map((id) => ({ id, n: n.get(id) ?? 0, cap: capOf.get(id) ?? null }));
  return { total: online.total, cap, channels };
}
