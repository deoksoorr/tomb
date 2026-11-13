import { z } from "zod";
import { answerRequest, cancelRequest } from "@/lib/friends";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const AnswerSchema = z.object({ accept: z.boolean() });

/** 받은 신청에 답하기 `{ accept }` (false면 거절) */
export const POST = handler<{ key: string }>(async (req, { key }) => {
  const visitorId = await requireVisitor(req);
  const { accept } = await readBody(req, AnswerSchema);
  await rateLimit("friend", req, visitorId);
  return json(await answerRequest(visitorId, key, accept));
});

/** 보낸 신청 취소 */
export const DELETE = handler<{ key: string }>(async (req, { key }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("friend", req, visitorId);
  return json(await cancelRequest(visitorId, key));
});
