import { z } from "zod";
import { MAINT_MSG_MAX, type MaintState } from "@tomb/protocol";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { readMaint, rememberMaint, setMaint } from "@/lib/maintenance";
import { staffAccountId } from "@/lib/staff";
import { readBody } from "@/lib/validate";

export type AdminMaintResponse = { state: MaintState; kicked?: number };

/** 관리자: 지금 점검 상태 (기억을 건너뛰고 실시간 서버에 다시 묻는다) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  rememberMaint(null);
  return json<AdminMaintResponse>({ state: await readMaint() }, { headers: { "Cache-Control": "no-store" } });
});

const SetSchema = z.object({
  on: z.boolean(),
  msg: z.string().trim().max(MAINT_MSG_MAX, `문구는 ${MAINT_MSG_MAX}자까지예요.`).default(""),
  /** 예상 끝 시각 (epoch ms, 없으면 null) */
  until: z.number().int().positive().nullable().default(null),
});

/**
 * 관리자: 점검 시작 `{ on: true, msg, until }` / 점검 끝 `{ on: false }`.
 * 시작이면 실시간 서버가 운영자 빼고 모든 접속을 끊고 새 입장을 막는다. 사이트는 미들웨어가 15초 안에 막는다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, SetSchema);
  const now = Date.now();
  if (input.on && input.until !== null && input.until <= now) throw new HttpError(400, "INVALID_INPUT", "예상 끝 시각이 이미 지났어요.");
  const staff = await staffAccountId(now);
  try {
    return json<AdminMaintResponse>(await setMaint(input, staff ? [staff] : [], fetch, now));
  } catch (e) {
    throw new HttpError(502, "REALTIME_UNAVAILABLE", e instanceof Error ? e.message : "실시간 서버에 닿지 못했어요.");
  }
});
