import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { FIRST_STEPS, RETIRED_FIRST_STEPS, TODO_COUNT } from "@/lib/retain";
import { endPlay, PLAY_KINDS, startPlay, type PlayEndResponse, type PlayStartResponse } from "@/lib/retainPlay";
import { claimFirstSteps, claimGiftPath, claimTodo, markFirstStep, markPathSeen } from "@/lib/retainServer";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import type { RetainResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";

const RetainSchema = z.discriminatedUnion("do", [
  // 새 이웃 꾸러미: 오늘 꾸러미 받기
  z.object({ do: z.literal("path") }),
  // 첫 걸음 한 칸 했음 (꾸미기·인사·채팅은 화면만 아는 행동이라 화면이 알린다 — 선물이 작고 계정마다 한 번뿐)
  z.object({ do: z.literal("step"), step: z.enum([...FIRST_STEPS.map((s) => s.id), ...RETIRED_FIRST_STEPS] as [string, ...string[]]) }),
  // 첫 걸음 네 칸을 다 했으면 선물
  z.object({ do: z.literal("first") }),
  // 11/19 꾸러미 창이 오늘 저절로 열렸다 (하루 한 번)
  z.object({ do: z.literal("seen") }),
  // 오늘 미션: 0..2 = 그 칸, 3 = 셋 다 한 보너스
  z.object({ do: z.literal("todo"), which: z.number().int().min(0).max(TODO_COUNT) }),
  // 11/19 오늘 미션 놀이 판 기록 (lib/retainPlay): 시작 표 받기 · 끝 알리기 (done = 끝까지, ms = 귀신의 집 판 시간)
  z.object({ do: z.literal("playStart"), kind: z.enum(PLAY_KINDS) }),
  z.object({ do: z.literal("playEnd"), ticket: z.string().min(1).max(600), done: z.boolean(), ms: z.number().int().min(0).max(3_600_000).optional() }),
]);

/**
 * 11/18 둘째 날 다시 오게 (lib/retain.ts): 새 이웃 꾸러미 받기 · 첫 걸음 표시·선물 · 오늘 미션 받기 · 11/19 미션 놀이 판 기록.
 * 판정·지급은 서버 (계정 저장소 Lua 하나로 원자적으로 한 번 — 두 번 눌러도 한 번만). 속도 제한은 계정 기준(인스턴스 메모리).
 * 운영자 계정은 받지 않는다 → 403
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("retain", req, visitorId);
  const body = await readBody(req, RetainSchema);
  // 11/19 운영자는 미션 표시·창 기록도 하지 않는다 (저장소 명령 없이 빈 응답 — 운영자 id는 인스턴스 기억이라 명령이 늘지 않는다)
  const staff = await isStaff(visitorId);
  if (body.do === "step") return json<RetainResponse>(staff ? { mask: -1 } : await markFirstStep(visitorId, body.step));
  if (body.do === "seen") return json<RetainResponse>(staff ? { ok: true } : await markPathSeen(visitorId));
  // 운영자는 미션이 없다 → 표도 없다 (questHook이 null)
  if (body.do === "playStart") return json<PlayStartResponse>(await startPlay(visitorId, body.kind));
  if (body.do === "playEnd") return json<PlayEndResponse>(staff ? { counted: false } : await endPlay(visitorId, body.ticket, body.done, body.ms));
  if (staff) throw new HttpError(403, "STAFF_NO_REWARD", "운영자 계정은 이 선물을 받지 않아요.");
  if (body.do === "path") return json<RetainResponse>(await claimGiftPath(visitorId));
  if (body.do === "first") return json<RetainResponse>(await claimFirstSteps(visitorId));
  return json<RetainResponse>(await claimTodo(visitorId, body.which));
});
