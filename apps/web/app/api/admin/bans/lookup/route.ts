import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { lookupBanTarget, type BanLookup } from "@/lib/banAdmin";
import { handler, json } from "@/lib/http";
import { readBody } from "@/lib/validate";

/**
 * 47번 차단 전 미리 보기 `{ accountId? , ip? }`: 계정의 최근 접속 IP(해시)마다 "이 IP로 최근 접속한 계정 N명",
 * 직접 입력한 IP도 해시로 바꿔 같은 정보를 준다(IP는 주소창·로그에 남지 않게 본문으로 받는다). 운영자 IP면 operator
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const q = await readBody(req, z.object({ accountId: z.string().max(64).optional(), ip: z.string().trim().max(64).optional() }));
  return json<BanLookup>(await lookupBanTarget(q));
});
