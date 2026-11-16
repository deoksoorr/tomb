import { request } from "@/lib/api";
import type { AdminInquiriesResponse } from "@/app/api/admin/inquiries/route";
import type { InquiryPatch, InquiryRow, InquiryStatus } from "@/lib/store/inquiries";

// 관리자 화면 → 문의함 (인증은 관리자 쿠키)

export const inquiryAdminApi = {
  list: (status: InquiryStatus | "all", limit: number) =>
    request<AdminInquiriesResponse>(`/api/admin/inquiries?${new URLSearchParams({ ...(status !== "all" && { status }), limit: String(limit) })}`, {
      cache: "no-store",
    }),
  update: (id: string, patch: InquiryPatch) =>
    request<{ inquiry: InquiryRow }>(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
};
