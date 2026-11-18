import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { approveReview, listReviews, rejectReview } from "@/lib/rpg/service";
import type { ReviewItem } from "@/lib/rpg/reviewStore";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";

// 11/18 관리자 「확인 필요」 (보안 검토): 서버가 확신할 수 없는 야근 빌딩 판과, 조건을 채워 줄을 선 서버 최초 칭호.
// 인정하면 붙잡아 둔 것(상자·초월 EXP·최고 층·랭킹·칭호)이 들어가고, 거절하면 지운다

/** 항목 + 닉네임 */
export type AdminReviewRow = ReviewItem & { name: string | null };
export type AdminReviewResponse = { items: AdminReviewRow[] };

export const GET = handler(async (req) => {
  await requireAdmin(req);
  const now = Date.now();
  const day = kstDay(now);
  const accounts = getAccounts();
  const items = await listReviews();
  const names = new Map<string, string | null>();
  for (const a of new Set(items.map((i) => i.acct))) names.set(a, (await accounts.get(a, day, now).catch(() => null))?.name ?? null);
  return json<AdminReviewResponse>({ items: items.map((i) => ({ ...i, name: names.get(i.acct) ?? null })) });
});

const Body = z.object({ id: z.string().min(1).max(200), action: z.enum(["approve", "reject"]) });

export const POST = handler(async (req) => {
  await requireAdmin(req);
  const b = await readBody(req, Body);
  if (b.action === "reject") {
    await rejectReview(b.id);
    return json({ ok: true });
  }
  return json({ ok: true, result: await approveReview(b.id) });
});
