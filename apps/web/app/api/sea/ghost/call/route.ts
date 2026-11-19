import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { callGhost, ghostCallOf, type GhostCallState, type GhostStatus } from "@/lib/sea/ghostService";
import { requireVisitor } from "@/lib/session";
import { isGraveChannel } from "@/lib/store/channels";
import { readBody } from "@/lib/validate";

const channel = z.number().int().refine(isGraveChannel, "채널 번호가 올바르지 않아요.");
const CallSchema = z.object({ call: z.enum(["on", "off"]).nullable(), ch: channel });

/**
 * 11/19 그 채널에 운영자가 유령선을 불렀는지 `?ch=N` (바닷가에 있는 모두가 들어올 때와 1~2분마다 본다).
 * 방문자와 무관해서 CDN에 10초 캐시한다 (Redis GET 1번). `&t=` = 캐시를 건너뛴다
 */
export const GET = handler(async (req) => {
  await rateLimit("publicGet", req);
  const ch = Number(req.nextUrl.searchParams.get("ch") ?? NaN);
  if (!isGraveChannel(ch)) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  return json<GhostCallState>(
    { ch, call: await ghostCallOf(ch) },
    { headers: { "Vercel-CDN-Cache-Control": "max-age=10, stale-while-revalidate=30", "Cache-Control": "no-store" } },
  );
});

/**
 * 운영자 `{ call: "on" | "off" | null, ch }`: 그 채널에 유령선 부르기 · 보내기 · 시간표대로.
 * 운영자 계정만 (서버가 계정으로 확인 — 아니면 403). 11/19 그 채널 모두에게 보이고 장터도 열려요. 3시간 뒤 저절로 시간표대로
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { call, ch } = await readBody(req, CallSchema);
  await rateLimit("shop", req, visitorId);
  return json<GhostStatus>(await callGhost(visitorId, call, ch, serverNow(visitorId)));
});
