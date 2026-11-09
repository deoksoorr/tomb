import { requireAdmin, type AdminErrorsResponse } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getErrors } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { ERROR_KEEP_DAYS, type ErrorGroup } from "@/lib/store/errors";

/** 최근 days일(기본 7, 최대 14) 오류 묶음: 같은 해시는 날짜를 합쳐 횟수를 더하고, 최근에 난 것부터 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const days = Math.min(ERROR_KEEP_DAYS, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7) || 7));
  const now = Date.now();
  const lists = await Promise.all(Array.from({ length: days }, (_, i) => getErrors().day(kstDay(now - i * 86_400_000))));
  const merged = new Map<string, ErrorGroup & { days: number }>();
  for (const g of lists.flat()) {
    const cur = merged.get(g.hash);
    merged.set(g.hash, cur ? { ...cur, count: cur.count + g.count, lastAt: Math.max(cur.lastAt, g.lastAt), days: cur.days + 1 } : { ...g, days: 1 });
  }
  return json<AdminErrorsResponse>({ errors: [...merged.values()].sort((a, b) => b.lastAt - a.lastAt) });
});
