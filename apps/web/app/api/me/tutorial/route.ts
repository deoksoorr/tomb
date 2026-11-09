import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";

/** 첫 방문 안내를 끝냈다고 계정에 표시 (기기를 바꿔도 다시 안 뜬다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const accounts = getAccounts();
  await accounts.setTutorialDone(visitorId);
  return json<{ me: Me }>({ me: await loadMe(accounts, visitorId) });
});
