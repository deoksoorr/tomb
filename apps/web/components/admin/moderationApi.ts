import type { AdminBanCreateResponse, AdminBansResponse } from "@/app/api/admin/bans/route";
import type { AdminReportActionResponse, AdminReportsResponse } from "@/app/api/admin/reports/route";
import { request } from "@/lib/api";
import type { AdminBan, BanLookup } from "@/lib/banAdmin";
import type { ReportAction } from "@/lib/reportsAdmin";
import type { BanKind } from "@/lib/store/bans";

// 47번 관리자 화면 → 정지·차단·강퇴·신고 API (adminApi.ts와 같은 방식, 쿠키 인증)

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export type BanCreateBody = {
  kind: BanKind;
  accountId?: string;
  ip?: string;
  ipHash?: string;
  /** null = 영구 */
  days: number | null;
  reason: string;
  memo: string;
  /** 신고 탭에서 넘어왔으면 그 신고를 처리됨으로 */
  reportKey?: string;
};

/**
 * 11/26 같은 목록을 동시에 부르면(메뉴 배지와 대시보드가 화면을 열자마자 함께 부른다) 요청 하나를 함께 쓴다.
 * 끝나면 바로 잊는다 — 그 뒤 부름(새로고침·처리 뒤)은 늘 새로 받는다. 신고 목록은 서버에서 가장 무거운 관리자 읽기라 두 번 돌지 않게
 */
const inflight = new Map<string, Promise<unknown>>();
function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key) as Promise<T> | undefined;
  if (cur) return cur;
  const p = load().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const moderationApi = {
  bans: () => shared("bans", () => request<AdminBansResponse>("/api/admin/bans", { cache: "no-store" })),
  createBan: (body: BanCreateBody) => request<AdminBanCreateResponse>("/api/admin/bans", send("POST", body)),
  editBan: (id: string, body: { action: "edit"; days?: number | null; reason?: string; memo?: string; note?: string } | { action: "lift"; note?: string }) =>
    request<{ ban: AdminBan }>(`/api/admin/bans/${encodeURIComponent(id)}`, send("PATCH", body)),
  /** 차단 전 미리 보기: 계정의 최근 IP별 계정 수, 또는 직접 입력한 IP (본문으로만 보낸다) */
  lookup: (q: { accountId?: string; ip?: string }) => request<BanLookup>("/api/admin/bans/lookup", send("POST", q)),
  kick: (accountId: string) => request<{ expelled: number | null }>("/api/admin/kick", send("POST", { accountId })),
  reports: (status: "open" | "done") => shared(`reports:${status}`, () => request<AdminReportsResponse>(`/api/admin/reports?status=${status}`, { cache: "no-store" })),
  reportAction: (key: string, action: ReportAction, note?: string) =>
    request<AdminReportActionResponse>("/api/admin/reports", send("POST", { key, action, ...(note ? { note } : {}) })),
};

/** 내보낸 결과 안내 문구 */
export function expelledText(n: number | null | undefined): string {
  if (n === null) return "실시간 서버에 닿지 못해 지금 접속은 끊지 못했어요 (다음 입장부터 막혀요).";
  if (!n) return "지금 접속 중은 아니었어요.";
  return `접속 중이던 연결 ${n}개를 바로 내보냈어요.`;
}
