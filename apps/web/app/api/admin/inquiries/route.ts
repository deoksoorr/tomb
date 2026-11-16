import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getInquiries, INQUIRY_KEEP, type InquiryRow, type InquiryStatus } from "@/lib/store/inquiries";

export type AdminInquiriesResponse = { inquiries: InquiryRow[]; newCount: number };

/** 문의함 목록 (최신 순). `?status=new|done` (없으면 전체), `?limit=` 기본 100·최대 INQUIRY_KEEP. newCount = 아직 처리 안 한 수 (메뉴 배지) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const raw = sp.get("status");
  const status: InquiryStatus | undefined = raw === "new" || raw === "done" ? raw : undefined;
  const limit = Math.min(INQUIRY_KEEP, Math.max(1, Number(sp.get("limit") ?? 100) || 100));
  const store = getInquiries();
  const [inquiries, newCount] = await Promise.all([store.list({ status, limit }), store.newCount()]);
  return json<AdminInquiriesResponse>({ inquiries, newCount });
});
