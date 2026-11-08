import { handler, json } from "@/lib/http";
import { rpgView } from "@/lib/rpg/service";
import type { RpgView } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";

/** 내 사냥터 캐릭터 (능력치·장비·스킬·포션) + 지갑 포인트 + 오늘 사냥 포인트/한도 */
export const GET = handler(async (req) => json<RpgView>(await rpgView(await requireVisitor(req))));
