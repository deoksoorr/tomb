import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getMegaphone } from "@/lib/store";
import { MEGA_KEEP, type MegaRecord } from "@/lib/store/megaphone";
import { readBody } from "@/lib/validate";

export type AdminMegaphoneRow = MegaRecord & { hidden: boolean };

/** 23번 확성기 기록 전체 (최신 먼저, 숨긴 것 포함 + 외친 계정 id) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<{ entries: AdminMegaphoneRow[] }>({ entries: await getMegaphone().recent(MEGA_KEEP) });
});

const HideSchema = z.object({ id: z.string().min(1).max(32), hidden: z.boolean() });

/** 숨기기·다시 보이기 `{ id, hidden }`. 유저 확성기 창에서는 다음 갱신(최대 몇십 초) 때 사라진다 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { id, hidden } = await readBody(req, HideSchema);
  if (!(await getMegaphone().setHidden(id, hidden))) throw new HttpError(404, "NOT_FOUND", "그 확성기 기록을 찾을 수 없어요.");
  return json({ ok: true });
});
