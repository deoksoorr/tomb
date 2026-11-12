import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { kickAccount } from "@/lib/banAdmin";
import { handler, json } from "@/lib/http";
import { readBody } from "@/lib/validate";

/** 47번 지금 내보내기(강퇴, 정지 아님) `{ accountId }`. expelled = 내보낸 연결 수 (0 = 접속 중 아님, null = 실시간 서버에 닿지 못함) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { accountId } = await readBody(req, z.object({ accountId: z.string().min(1).max(64) }));
  return json<{ expelled: number | null }>({ expelled: await kickAccount(accountId) });
});
