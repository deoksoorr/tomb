import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { RESIDENTS_MAX, type ResidentSettings } from "@/lib/residents";
import { getResidentSettings } from "@/lib/store/residents";
import { readBody } from "@/lib/validate";

/** 관리자: 지금 마을 주민 설정 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<ResidentSettings>(await getResidentSettings().get());
});

const SetSchema = z.object({
  enabled: z.boolean(),
  count: z.number().int().min(0).max(RESIDENTS_MAX),
});

/** 관리자: 마을 주민 켜기/끄기·주민 수 `{ enabled, count }`. 게임은 다음 확인(1~2분 안)에 주민이 나타나거나 사라진다 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, SetSchema);
  return json<ResidentSettings>(await getResidentSettings().set(input));
});
