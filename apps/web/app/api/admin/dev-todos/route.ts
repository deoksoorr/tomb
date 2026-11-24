import { requireAdmin } from "@/lib/admin";
import { HttpError, handler, json } from "@/lib/http";
import { devTodoOverrides, todoDef, type TodoKind } from "@/lib/retain";

/**
 * 11/24 로컬 시험용: 그 계정의 오늘 미션을 고른 것으로 바꾼다 `{ accountId, kinds: ["bumper", "fire", "sky"] }` (kinds 비우면 원래대로).
 * 운영 빌드에서는 404
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const map = devTodoOverrides();
  if (!map) throw new HttpError(404, "NOT_FOUND", "없는 주소예요.");
  const body = (await req.json().catch(() => null)) as { accountId?: unknown; kinds?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const kinds = Array.isArray(body?.kinds) ? body.kinds.filter((k): k is TodoKind => typeof k === "string" && !!todoDef(k)) : [];
  if (!accountId) throw new HttpError(400, "INVALID_INPUT", "accountId가 필요해요.");
  if (kinds.length) map.set(accountId, kinds);
  else map.delete(accountId);
  return json({ accountId, kinds: map.get(accountId) ?? null });
});
