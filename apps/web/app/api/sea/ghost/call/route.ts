import { z } from "zod";
import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { callGhost, type GhostStatus } from "@/lib/sea/ghostService";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const CallSchema = z.object({ call: z.enum(["on", "off"]).nullable() });

/**
 * 11/17 운영자 시험 `{ call: "on" | "off" | null }`: 유령선을 아무 때나 부르기 · 보내기 · 시간표대로.
 * 운영자 계정만 (서버가 계정으로 확인 — 아니면 403). 그 운영자 화면과 구매에만 먹고, 3시간 뒤 저절로 시간표대로 돌아가요
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { call } = await readBody(req, CallSchema);
  await rateLimit("shop", req, visitorId);
  return json<GhostStatus>(await callGhost(visitorId, call, serverNow(visitorId)));
});
