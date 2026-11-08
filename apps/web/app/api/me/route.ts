import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";

/** 내 계정 (포인트·출석·가방·착용·내 묘비). 방문자 쿠키 = 계정 */
export const GET = handler(async (req) => json<Me>(await loadMe(getAccounts(), await requireVisitor(req))));
