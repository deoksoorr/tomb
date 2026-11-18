import type { LobbyInfo } from "@tomb/protocol";
import type {
  AdminBulkResponse,
  AdminErrorsResponse,
  AdminGrave,
  AdminGraveSettings,
  AdminPassedResponse,
} from "@/lib/admin";
import type { AdminMembersResponse, CodeReissueLogResponse, CodeReissueResponse, MemberSort } from "@/lib/adminMembers";
import { request } from "@/lib/api";
import type { RunReward } from "@/lib/rpg/types";
import type { ReclaimReport } from "@/lib/housing/reclaim";
import type { AdminHouse } from "@/lib/housing/types";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import type { AdminReviewResponse } from "@/app/api/admin/rpg/review/route";
import type { EconomyResponse, Notice, NoticeInput, NoticeListResponse } from "@/lib/types";
import type { AdminAction } from "@/lib/validate";

// 관리자 화면 → /api/admin/*. 인증은 로그인 때 받은 httpOnly 쿠키가 자동으로 실린다.

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const post = (body: unknown) => send("POST", body);
/** 하우징 집·방명록 관리 작업 */
export type ModAction = "hide" | "unhide" | "delete";
const noticePath = (id: string) => `/api/admin/notices/${encodeURIComponent(id)}`;

export const adminApi = {
  login: (key: string) => request<{ ok: true }>("/api/admin/session", post({ key })),
  logout: () => request<{ ok: true }>("/api/admin/session", { method: "DELETE" }),
  graves: () => request<{ graves: AdminGrave[] }>("/api/admin/graves", { cache: "no-store" }),
  channels: () => request<LobbyInfo>("/api/admin/channels", { cache: "no-store" }),
  notices: () => request<NoticeListResponse>("/api/admin/notices", { cache: "no-store" }),
  createNotice: (input: NoticeInput) => request<{ notice: Notice }>("/api/admin/notices", post(input)),
  updateNotice: (id: string, patch: Partial<NoticeInput>) => request<{ notice: Notice }>(noticePath(id), send("PATCH", patch)),
  deleteNotice: (id: string) => request<{ ok: true }>(noticePath(id), { method: "DELETE" }),
  houses: () => request<{ houses: AdminHouse[] }>("/api/admin/housing", { cache: "no-store" }),
  houseAction: (id: string, action: ModAction) => request<{ ok: true }>(`/api/admin/housing/${encodeURIComponent(id)}`, post({ action })),
  /** 11/15 같은 채널 안에서 번지 옮기기 (빈 번지만) */
  moveHouse: (id: string, lot: number) => request<{ ok: true }>(`/api/admin/housing/${encodeURIComponent(id)}`, post({ action: "move", lot })),
  /** 오래 비운 집 지금 정리하기 (잠금과 상관없이 바로) */
  reclaimHouses: () => request<ReclaimReport>("/api/admin/housing/reclaim", post({})),
  guestAction: (id: string, entryId: string, action: ModAction) =>
    request<{ ok: true }>(`/api/admin/housing/${encodeURIComponent(id)}/guestbook/${encodeURIComponent(entryId)}`, post({ action })),
  errors: (days: number) => request<AdminErrorsResponse>(`/api/admin/errors?days=${days}`, { cache: "no-store" }),
  economy: (days: number) => request<EconomyResponse>(`/api/admin/economy?days=${days}`, { cache: "no-store" }),
  /** 닉네임으로 계정 찾기 (포인트를 모은 적 있는 계정) */
  /** 11/15 야근 빌딩 대신 정산 (서버가 잘못 거절한 판) */
  towerGrant: (b: { accountId: string; start: number; floors: number; floorMs: number }) =>
    request<{ ok: true; reward: RunReward }>("/api/admin/rpg/tower-grant", post(b)),
  /** 11/18 기록 확인 (의심 판·서버 최초 칭호 대기) */
  reviews: () => request<AdminReviewResponse>("/api/admin/rpg/review", { cache: "no-store" }),
  review: (id: string, action: "approve" | "reject") =>
    request<{ ok: true; result?: { kind: "tower"; reward: RunReward } | { kind: "first"; granted: boolean } | { kind: "top"; took: boolean } }>(
      "/api/admin/rpg/review",
      post({ id, action }),
    ),
  searchAccounts: (name: string) =>
    request<{ accounts: AdminAccountRow[] }>(`/api/admin/accounts/search?${new URLSearchParams({ name })}`, { cache: "no-store" }),
  /** 회원 전체 목록 (최근 접속 순 또는 총 접속 시간 순 50명씩, next를 cursor로) */
  members: (q: string, cursor: string | null, fresh = false, sort: MemberSort = "recent") =>
    request<AdminMembersResponse>(
      `/api/admin/accounts/list?${new URLSearchParams({ ...(q ? { q } : {}), ...(cursor ? { cursor } : {}), ...(sort === "stay" ? { sort } : {}), ...(fresh ? { fresh: "1" } : {}) })}`,
      { cache: "no-store" },
    ),
  /** 접속 코드 재발급 (이전 코드는 무효, 새 코드는 이 응답에서 한 번만. 운영자 계정은 막힌다) */
  reissueCode: (accountId: string) => request<CodeReissueResponse>("/api/admin/accounts/code", post({ accountId })),
  /** 최근 코드 재발급 기록 (누가·언제·누구) */
  codeLog: () => request<CodeReissueLogResponse>("/api/admin/accounts/code", { cache: "no-store" }),
  /** 성불한 묘비 (숨김 포함) */
  passed: (q: string, offset = 0) =>
    request<AdminPassedResponse>(`/api/admin/graves/passed?${new URLSearchParams({ q, offset: String(offset) })}`, { cache: "no-store" }),
  deletePassed: (id: string) => request<{ ok: true }>(`/api/admin/graves/passed/${encodeURIComponent(id)}`, { method: "DELETE" }),
  graveSettings: () => request<AdminGraveSettings>("/api/admin/graves/settings", { cache: "no-store" }),
  setGraveSettings: (passDays: number) =>
    request<AdminGraveSettings & { passedNow: number }>("/api/admin/graves/settings", send("PATCH", { passDays })),
  /** 하나든 여러 개든 일괄 처리 경로로 보낸다 */
  apply: (ids: string[], action: AdminAction) => request<AdminBulkResponse>("/api/admin/graves/bulk", post({ ids, action })),
};
