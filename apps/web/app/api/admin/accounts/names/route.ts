import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { AdminNameReindexSchema, readBody } from "@/lib/validate";

export type AdminNameReindexResponse = { next: string; indexed: number; dup: number };

/**
 * 닉네임 색인 일괄 채우기 `{ cursor?, count? }` (관리자). 계정을 count개씩 훑어 이름 색인(이름 → 계정)에 없는 옛 계정 이름을 채운다.
 * 이미 다른 계정이 차지한 이름은 그대로 두고 nameDup 표시만 한다 (기존 중복은 지우거나 바꾸지 않는다). 응답의 next를 다시 넘기며
 * "0"이 나올 때까지 부른다. 안 해도 각 계정이 다음 입장·계정 확인 때 저절로 채워진다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { cursor, count } = await readBody(req, AdminNameReindexSchema);
  return json<AdminNameReindexResponse>(await getAccounts().reindexNames(cursor, count, Date.now()));
});
