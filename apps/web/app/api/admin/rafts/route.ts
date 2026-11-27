import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getRaftStore } from "@/lib/raft/store";

/** 11/27 관리자: 채널마다 지금 좌대 입장권 주인 (1~10채널 — 채널 번호 상한, 좌대 표 HGETALL 10번). 「지금 접속자」 창을 열 때만 */
export type AdminRaftRow = { ch: number; n: number; acct: string; name: string; start: number; until: number; renews: number };
export type AdminRaftsResponse = { at: number; rows: AdminRaftRow[] };

export const GET = handler(async (req) => {
  await requireAdmin(req);
  const now = Date.now();
  const store = getRaftStore();
  const boards = await Promise.all(Array.from({ length: 10 }, (_, i) => store.board(i + 1).then((b) => b.map((h) => ({ ch: i + 1, ...h })))));
  const rows = boards
    .flat()
    .filter((h) => h.until > now)
    .map(({ ch, n, acct, name, start, until, renews }) => ({ ch, n, acct, name, start, until, renews }))
    .sort((a, b) => a.ch - b.ch || a.n - b.n);
  return json<AdminRaftsResponse>({ at: now, rows }, { headers: { "Cache-Control": "no-store" } });
});
