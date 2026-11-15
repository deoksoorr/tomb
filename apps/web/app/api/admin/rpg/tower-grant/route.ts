import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { grantTowerRun } from "@/lib/rpg/service";
import { readBody } from "@/lib/validate";

// 11/15 관리자: 서버가 잘못 거절한 야근 빌딩 판을 대신 정산한다 (판 끝과 같은 정산 — 우두머리 상자는 새 시드로 다시 굴린다).
// 운영 로그(판 시작·거절 시각)로 판 시간을 셈해 floorMs를 넣는다

const Body = z.object({
  accountId: z.string().min(1).max(64),
  start: z.number().int().min(1).max(1000),
  floors: z.number().int().min(1).max(200),
  floorMs: z.number().int().min(1).max(4 * 3_600_000),
  kills: z.number().int().min(0).max(100_000).optional(),
});

export const POST = handler(async (req) => {
  await requireAdmin(req);
  const b = await readBody(req, Body);
  const r = await grantTowerRun(b.accountId, b);
  return json({ ok: true, reward: r.reward });
});
