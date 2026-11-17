import type { NextRequest } from "next/server";
import { z } from "zod";
import { runAfter } from "@/lib/analyticsService";
import { pinNotify } from "@/lib/ban";
import { handler, HttpError, json } from "@/lib/http";
import { checkPinText } from "@/lib/megaphone";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { getAccounts, getMegaphone, NO_NAME } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { isGraveChannel } from "@/lib/store/channels";
import { pinList } from "@/lib/store/megaphone";
import type { MegaPinResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";

// 11/17 확성기 창 맨 위 고정 공지 (운영자 계정만 — /api/staff/earn과 같은 운영자 세션 판별).
// 채널마다 하나 + 모든 채널 하나. 쓰거나 지우면 응답 뒤에 실시간 서버로 알려 접속한 화면에 바로 반영한다 (/internal/pin).
// 읽기는 따로 없다 — 확성기 기록(GET /api/megaphone)에 같이 실려 온다 (들어올 때 한 번 + 10분마다)

const Scope = z.enum(["channel", "all"]);
const PostSchema = z.object({
  text: z.string().max(1000),
  scope: Scope,
  channel: z.number().int().refine(isGraveChannel, "채널 번호가 올바르지 않아요."),
});

/** 운영자 계정인지 (아니면 403) */
async function requirePinStaff(req: NextRequest): Promise<string> {
  const visitorId = await requireVisitor(req);
  if (!(await isStaff(visitorId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 공지를 바꿀 수 있어요.");
  return visitorId;
}

/** 고정 공지 쓰기 `{ text, scope, channel }`: 한 줄 1~200자. scope channel이면 그 채널, all이면 모든 채널 칸을 덮어쓴다 */
export const POST = handler(async (req) => {
  const visitorId = await requirePinStaff(req);
  const { text: raw, scope, channel } = await readBody(req, PostSchema);
  const checked = checkPinText(raw);
  if (!checked.ok) throw new HttpError(400, "INVALID_INPUT", checked.reason);
  await rateLimit("megaPin", req, visitorId);
  const now = Date.now();
  const name = (await getAccounts().get(visitorId, kstDay(now), now)).name ?? NO_NAME;
  const ch = scope === "all" ? 0 : channel;
  const store = getMegaphone();
  await store.setPin(scope, channel, { scope, ch, text: checked.text, name, at: now, accountId: visitorId });
  runAfter(() => pinNotify(scope, channel, { text: checked.text, name, at: now }));
  return json<MegaPinResponse>({ pins: pinList(await store.pins(channel)) });
});

/** 고정 공지 지우기 `?scope=channel|all&channel=N` (이미 없어도 그대로 성공) */
export const DELETE = handler(async (req) => {
  const visitorId = await requirePinStaff(req);
  const sp = req.nextUrl.searchParams;
  const scope = Scope.safeParse(sp.get("scope"));
  const channel = Number(sp.get("channel"));
  if (!scope.success || !isGraveChannel(channel)) throw new HttpError(400, "INVALID_INPUT", "지울 공지를 다시 골라 주세요.");
  await rateLimit("megaPin", req, visitorId);
  const store = getMegaphone();
  await store.setPin(scope.data, channel, null);
  runAfter(() => pinNotify(scope.data, channel, null));
  return json<MegaPinResponse>({ pins: pinList(await store.pins(channel)) });
});
