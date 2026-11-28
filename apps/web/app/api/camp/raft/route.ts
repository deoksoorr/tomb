import { z } from "zod";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { logMoves } from "@/lib/opsLog";
import { buyRaft, raftDevLeft, raftOpen, raftRegrant, raftStatus, renewRaft, type RaftDealResponse, type RaftStatusResponse } from "@/lib/raft/service";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

// 11/27 좌대 입장권 (캠핑장 윤슬 낚시터 좌대 매표소). 규칙은 protocol raft.ts, 저장·판정은 lib/raft
const ch = z.number("채널을 골라 주세요.").int().min(1).max(100);
const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("buy"), ch, n: z.number().int().min(1, "좌대를 골라 주세요.").max(6, "좌대를 골라 주세요.") }),
  z.object({ op: z.literal("renew") }),
  z.object({ op: z.literal("grant"), ch }),
  /** 개발 전용: 내 입장권을 지금 + left(ms)에 끝나게 */
  z.object({ op: z.literal("dev"), left: z.number().int().min(0).max(7_200_000) }),
]);

/** `?ch=` 그 채널 좌대 여섯 상태 + 내 입장권 + 오늘 남은 좌대 시간 (매표소 창을 열 때·연장 칸이 뜰 때만) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!raftOpen()) throw notFound();
  const c = ch.safeParse(Number(req.nextUrl.searchParams.get("ch")));
  if (!c.success) throw new HttpError(400, "INVALID_INPUT", "채널을 골라 주세요.");
  await rateLimit("forage", req, visitorId);
  return json<RaftStatusResponse>(await raftStatus(visitorId, c.data, Date.now()));
});

/** 11/28 관리자 접속 기록 「좌대 입장권 구매·연장 (1채널 4번 좌대 · 120분 · 3,000P · 14:30까지)」 (산 뒤에만) */
function logRaft(acct: string, m: "raftBuy" | "raftRenew", r: RaftDealResponse, now: number): void {
  const own = r.status.mine;
  logMoves([{ a: acct, k: "mv", at: now, m, ...(own ? { ch: own.ch, n: own.n, until: own.until } : {}), min: r.min, pts: r.price, src: "s" }]);
}

/** 사기 `{op:"buy", ch, n}` · 연장 `{op:"renew"}` · 증서 다시 `{op:"grant", ch}` */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!raftOpen()) throw notFound();
  const b = await readBody(req, Body);
  const now = Date.now();
  if (b.op === "grant") {
    await rateLimit("forage", req, visitorId);
    return json({ grant: await raftRegrant(visitorId, b.ch, now) });
  }
  await rateLimit("shop", req, visitorId);
  if (b.op === "buy" || b.op === "renew") {
    const r = b.op === "buy" ? await buyRaft(visitorId, b.ch, b.n, now) : await renewRaft(visitorId, now);
    logRaft(visitorId, b.op === "buy" ? "raftBuy" : "raftRenew", r, now);
    return json(r);
  }
  const r = await raftDevLeft(visitorId, b.left, now);
  if (!r) throw new HttpError(409, "RAFT_NONE", "입장권이 없어요.");
  return json(r);
});
