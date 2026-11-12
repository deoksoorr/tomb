import { z } from "zod";
import { adminActor } from "@/lib/ban";
import { requireAdmin } from "@/lib/admin";
import { BanCreateSchema, createBan, listBans, type AdminBan } from "@/lib/banAdmin";
import { handler, json } from "@/lib/http";
import { markReportBanned } from "@/lib/reportsAdmin";
import { readBody } from "@/lib/validate";

export type AdminBansResponse = { bans: AdminBan[] };
export type AdminBanCreateResponse = { ban: AdminBan; expelled: number | null };

/** 47번 정지·차단 목록 (진행 중 먼저, 해제·만료된 기록도 남긴다) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminBansResponse>({ bans: await listBans() });
});

/**
 * 정지·차단 걸기 `{ kind, accountId?, ip? | ipHash?, days(null = 영구), reason, memo, reportKey? }`.
 * 접속 중이면 바로 내보낸다(expelled = 내보낸 연결 수, 실시간 서버에 닿지 못하면 null). reportKey가 있으면 그 신고를 처리됨으로
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, BanCreateSchema.extend({ reportKey: z.string().max(200).optional() }));
  const actor = await adminActor(req);
  const r = await createBan(input, actor);
  if (input.reportKey) await markReportBanned(input.reportKey, actor, r.ban.id);
  return json<AdminBanCreateResponse>(r);
});
