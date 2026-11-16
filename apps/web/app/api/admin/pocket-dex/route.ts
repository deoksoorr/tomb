import { requireAdmin } from "@/lib/admin";
import { backfillPocketDex } from "@/lib/forage/quests/urgentService";
import { handler, json } from "@/lib/http";

export type AdminPocketDexResponse = { checked: number; added: { acct: string; fish: string }[] };

/**
 * 11/16 지난 「수집가의 뒷주머니」 물고기 도감 채우기 (관리자). 주머니에서 나온 물고기가 가방에만 들어가고 도감에 안 뜨던 것을
 * 최근 7일 의뢰만큼 다시 계산해 도감에 없을 때만 적는다. 여러 번 불러도 두 번 적지 않는다. 배포하고 한 번 부른다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminPocketDexResponse>(await backfillPocketDex(Date.now()));
});
