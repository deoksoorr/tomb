import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { kstDay } from "@/lib/store/accounts";
import { getSignupSrc } from "@/lib/store/signupSrc";

export type AdminSignupSourcesResponse = { days: number; rows: { label: string; n: number }[]; total: number };

/** 11/26 유입별 가입 수 `?days=1~120` (그날 한국 시각부터 거꾸로). 날짜 칸을 파이프라인 한 번에. 11/26 배포 뒤 가입부터 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 120) throw new HttpError(400, "INVALID_INPUT", "기간은 1~120일이에요.");
  const now = Date.now();
  const keys = Array.from({ length: days }, (_, i) => kstDay(now - i * 86_400_000));
  const counts = await getSignupSrc().dayCounts(keys);
  const rows = Object.entries(counts)
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));
  return json<AdminSignupSourcesResponse>({ days, rows, total: rows.reduce((s, r) => s + r.n, 0) }, { headers: { "Cache-Control": "no-store" } });
});
