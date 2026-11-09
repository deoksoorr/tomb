import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe, NAME_CHANGE_COOLDOWN_MS } from "@/lib/store/accounts";
import { NAME_CHANGE_PRICE, type NameChangeResponse } from "@/lib/types";
import { NameChangeSchema, readBody } from "@/lib/validate";

/**
 * 닉네임 변경 `{ name }`: 첫 변경은 무료, 그다음부터 NAME_CHANGE_PRICE 포인트, NAME_CHANGE_COOLDOWN_DAYS일에 한 번.
 * 이미 세운 묘비의 상주 이름은 그때 기록 그대로 두고, 계정 이름(랭킹·소식 표시명)만 바뀐다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name } = await readBody(req, NameChangeSchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const now = Date.now();
  const r = await accounts.changeName(visitorId, name, now, NAME_CHANGE_PRICE, NAME_CHANGE_COOLDOWN_MS);
  if (!r.ok && r.reason === "cooldown") {
    const retry = String(Math.ceil((r.nextAllowedAt - now) / 1000));
    throw new HttpError(429, "NAME_COOLDOWN", "닉네임은 7일에 한 번만 바꿀 수 있어요.", { "Retry-After": retry, "X-Next-Allowed-At": String(r.nextAllowedAt) });
  }
  if (!r.ok) throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  return json<NameChangeResponse>({ me: await loadMe(accounts, visitorId, now), cost: r.cost, nextAllowedAt: now + NAME_CHANGE_COOLDOWN_MS });
});
