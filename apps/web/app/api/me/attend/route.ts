import { runAfter } from "@/lib/analyticsService";
import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import { recordLook } from "@/lib/lookRank";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe, lookGrant, lookOf } from "@/lib/store/accounts";
import { signupSrcOf } from "@/lib/signupSource";
import { getSignupSrc } from "@/lib/store/signupSrc";
import type { AttendResponse } from "@/lib/types";
import { AttendSchema, readBody } from "@/lib/validate";

/**
 * 입장 기록 `{ name?, color?, body? }` (입장할 때 부른다).
 * 이름·색·몸 모양은 계정에 아직 없을 때만 저장한다 → 개인 코드로 시작·이어서 들어온 기기에서도 계정의 닉네임·아바타가 그대로 유지된다.
 * 10번 개편: 출석 포인트는 여기서 주지 않는다 (earned는 항상 0). 그날 정해진 시간(lib/attendStay.ts) 머문 뒤 출석 달력(/api/me/calendar/claim)에서 받는다
 * → 옛 화면이 입장 때 이 경로를 불러도 포인트가 두 번 나가지 않는다.
 * 착용 증서(look)도 같이 준다 → 입장 때 GET /api/me/look을 따로 부르지 않는다 (계정 전체 읽기 1번 절약).
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { src, ...profile } = await readBody(req, AttendSchema);
  const accounts = getAccounts();
  const now = Date.now();
  // 휴면 판정·마지막 입장 시각. 휴면 재설정 중이면 이름은 여기서 정하지 않는다 (POST /api/names)
  const { renameRequired } = await accounts.visit(visitorId, now, true);
  const created = await accounts.enter(visitorId, renameRequired ? { ...profile, name: undefined } : profile, now);
  // 11/26 가입 유입: 이번에 계정이 처음 만들어졌을 때만 저장한다 (쿠키만 받고 들어오지 않은 방문은 남기지 않는다. 응답 뒤에, 명령 1개)
  if (created) {
    const saved = signupSrcOf(src, req.headers.get("user-agent"), now);
    runAfter(() => getSignupSrc().save(visitorId, saved, kstDay(now)));
  }
  const me = await loadMe(accounts, visitorId, now);
  // 착용 증서도 같이 (GET /api/me/look이 계정 전체를 한 번 더 읽지 않게 — 같은 값을 이미 읽은 me로 만든다).
  // 꾸미기 랭킹 점수도 지금 착용으로 맞춘다 (자리를 비운 사이 끝난 기간제 반영)
  const look = lookOf(me);
  const appearance = { dye: me.dye, body: me.body };
  const champ = me.champ ?? 0;
  const mgr = me.manager ? (1 as const) : (0 as const);
  await recordLook(visitorId, { equipped: me.equipped, ...appearance }, { now });
  return json<AttendResponse>({
    me,
    earned: 0,
    look: { look, ...appearance, champ, mgr, lookGrant: await lookGrant(env.joinSecret(), visitorId, look, now, { ...appearance, champ, manager: !!mgr }) },
  });
});
