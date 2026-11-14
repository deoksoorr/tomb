import type { NextRequest } from "next/server";
import { findBan } from "./ban";
import { HttpError, clientIp } from "./http";
import { getAccounts } from "./store";
import { codeHash, kstDay, loadMe, newCode } from "./store/accounts";
import { getGoogleAudit } from "./store/adminAudit";
import { getGoogleLinks, type GoogleLinkResult } from "./store/googleLinks";
import type { Me } from "./types";

// 구글 연결·로그인의 계정 쪽 처리 (경로: app/api/auth/google/*, app/api/me/google).
// 연결·끊기는 구글 연결 기록(google:audit, 관리자 감사 기록과 같은 형식)에 남긴다 — 구글 고유 번호·해시는 적지 않는다.

export const GOOGLE_TAKEN_MESSAGE = "이 구글 계정은 이미 다른 계정에 연결돼 있어요. 그 계정에서 먼저 연결을 끊어 주세요.";
export const GOOGLE_OTHER_MESSAGE = "이 계정에는 이미 다른 구글 계정이 연결돼 있어요. 먼저 연결을 끊어 주세요.";

async function audit(action: "googleLink" | "googleUnlink", accountId: string, now: number): Promise<void> {
  const name = await getAccounts()
    .get(accountId, kstDay(now), now)
    .then((a) => a.name)
    .catch(() => null);
  await getGoogleAudit()
    .push({ at: now, by: "본인", action, accountId, name })
    .catch((e: unknown) => console.error("[google] 연결 기록 실패", e));
}

/** 계정에 구글 연결 (하나 ↔ 하나). ok일 때만 기록을 남긴다 */
export async function linkGoogle(accountId: string, subHash: string, now = Date.now()): Promise<GoogleLinkResult> {
  const r = await getGoogleLinks().link(accountId, subHash, now);
  if (r === "ok") await audit("googleLink", accountId, now);
  return r;
}

/** 연결 끊기. 끊었으면 true */
export async function unlinkGoogle(accountId: string, now = Date.now()): Promise<boolean> {
  const done = await getGoogleLinks().unlink(accountId);
  if (done) await audit("googleUnlink", accountId, now);
  return done;
}

export type GoogleLoginResult = { kind: "login"; accountId: string } | { kind: "new" } | { kind: "banned" };

/**
 * 구글로 들어오기: 연결된 계정을 찾는다. 코드로 들어오기와 같은 후처리 — 이용 제한 확인(캐시 없이), 입장 기록(휴면이면 닉네임 재설정 표시)
 * 연결된 계정이 없으면 new (첫 화면에서 새로 만들기 확인)
 */
export async function googleLogin(req: NextRequest, subHash: string, now = Date.now()): Promise<GoogleLoginResult> {
  const accountId = await getGoogleLinks().accountOf(subHash);
  if (!accountId) return { kind: "new" };
  if (await findBan(accountId, clientIp(req), { fresh: true, now })) return { kind: "banned" };
  await getAccounts().visit(accountId, now, false);
  return { kind: "login", accountId };
}

/**
 * 구글로 새로 만든 계정에 연결을 붙인다 (이름·모습을 정하고 들어가기 직전).
 * 그 계정에 개인 코드가 없으면 바로 만들어 이 응답에서 한 번만 준다 — 구글 말고도 들어올 길을 남겨 두게
 */
export async function claimGoogle(accountId: string, subHash: string, now = Date.now()): Promise<{ me: Me; code: string | null }> {
  const r = await linkGoogle(accountId, subHash, now);
  if (r === "taken") throw new HttpError(409, "GOOGLE_TAKEN", GOOGLE_TAKEN_MESSAGE);
  if (r === "other") throw new HttpError(409, "GOOGLE_OTHER", GOOGLE_OTHER_MESSAGE);
  const accounts = getAccounts();
  let me = await loadMe(accounts, accountId, now);
  let code: string | null = null;
  if (!me.hasCode) {
    code = newCode();
    await accounts.setCode(accountId, codeHash(code));
    me = await loadMe(accounts, accountId, now);
  }
  return { me, code };
}
