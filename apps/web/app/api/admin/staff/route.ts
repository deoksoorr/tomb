import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { BALANCE_CAP } from "@/lib/economy";
import { handler, HttpError, json } from "@/lib/http";
import { getStaff, getStaffStore, setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";

/** 관리자 화면의 운영자 계정 표시 */
export type AdminStaffResponse = { staff: { accountId: string; name: string | null; setAt: number } | null };

async function view(): Promise<AdminStaffResponse> {
  const rec = await getStaff();
  if (!rec) return { staff: null };
  const now = Date.now();
  const a = await getAccounts().get(rec.accountId, kstDay(now), now);
  return { staff: { accountId: rec.accountId, name: a.name, setAt: rec.setAt } };
}

/** 31번 지금 운영자 계정 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminStaffResponse>(await view());
});

const SetSchema = z.object({ accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "계정 id가 올바르지 않아요.").nullable() });

/**
 * 31번 운영자 계정 지정 `{ accountId }` / 해제 `{ accountId: null }`. 운영자는 한 명이라 새로 지정하면 이전 계정은 풀린다.
 * 관리자 키 + 관리자 IP(proxy.ts)에서만 부를 수 있다. 지정하자마자 잔액을 지갑 상한까지 채운다 (없는 계정이면 404).
 * 저승사자 차림은 그 계정이 다음에 입장(또는 채널 이동·새로고침)할 때부터 다른 사람에게 보인다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { accountId } = await readBody(req, SetSchema);
  if (accountId && !(await getStaffStore().fill(getAccounts(), accountId, BALANCE_CAP)))
    throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요. 한 번이라도 입장한 계정만 지정할 수 있어요.");
  const now = Date.now();
  const name = accountId ? (await getAccounts().get(accountId, kstDay(now), now)).name : null;
  await setStaff(accountId, now, name);
  return json<AdminStaffResponse>(await view());
});
