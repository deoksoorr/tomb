import { MANAGER_TITLE_ID, titleOfLook } from "@tomb/protocol";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { runAfter } from "@/lib/analyticsService";
import { notifyMe } from "@/lib/ban";
import { handler, HttpError, json } from "@/lib/http";
import { appointManager, dismissManager, listManagers, MANAGER_MAX } from "@/lib/managers";
import { getAccounts } from "@/lib/store";
import { lookOf } from "@/lib/store/accounts";
import { forgetTitles } from "@/lib/titlesServer";
import { readBody } from "@/lib/validate";

/** 관리자 화면의 매니저 한 줄 (name = 지금 닉네임, 읽지 못하면 임명할 때의 닉네임) */
export type AdminManagerRow = { accountId: string; name: string | null; setAt: number };
export type AdminManagersResponse = { managers: AdminManagerRow[]; max: number };

async function view(): Promise<AdminManagersResponse> {
  const list = await listManagers();
  const now = Date.now();
  const accounts = getAccounts();
  const names = await Promise.all(list.map((m) => accounts.appearance(m.accountId, now).then((a) => a.name, () => null)));
  return { managers: list.map((m, i) => ({ accountId: m.accountId, name: names[i] ?? m.name, setAt: m.setAt })), max: MANAGER_MAX };
}

/** 11/16 지금 매니저 목록 (임명한 순서) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminManagersResponse>(await view());
});

const SetSchema = z.object({
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "계정 id가 올바르지 않아요."),
  on: z.boolean(),
});

/**
 * 11/16 매니저 임명 `{ accountId, on: true }` / 해제 `{ accountId, on: false }`. 관리자 키 + 관리자 IP(proxy.ts)에서만.
 * 혜택은 매니저 전용 칭호 하나뿐. 접속 중이면 그 화면에 "내 정보 새로 받기"를 보내 그 자리에서 칭호를 달 수 있게 되거나 빠진다
 * (새 착용 증서 → 같은 방 사람들 화면도). 해제하면 끼고 있던 매니저 칭호도 바로 뺀다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { accountId, on } = await readBody(req, SetSchema);
  const now = Date.now();
  const accounts = getAccounts();
  const a = await accounts.appearance(accountId, now);
  if (on) {
    if (!a.name) throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요. 한 번이라도 입장한 계정만 임명할 수 있어요.");
    const list = await listManagers();
    if (!list.some((m) => m.accountId === accountId) && list.length >= MANAGER_MAX)
      throw new HttpError(409, "LIMIT", `매니저는 ${MANAGER_MAX}명까지 임명할 수 있어요.`);
    await appointManager(accountId, a.name, now);
  } else {
    await dismissManager(accountId);
    if (titleOfLook(lookOf(a)) === MANAGER_TITLE_ID) await accounts.setTitle(accountId, null);
  }
  forgetTitles(accountId);
  runAfter(() => notifyMe([accountId]));
  return json<AdminManagersResponse>(await view());
});
