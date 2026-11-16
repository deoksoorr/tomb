import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { REF_MODES, type RefMode } from "@/lib/referralRules";
import { adminReferrals, decideReferral, decideReferrals, HELD_LIST, type AdminReferralResponse } from "@/lib/referralService";
import { getReferrals } from "@/lib/store/referrals";
import { readBody } from "@/lib/validate";

/** 관리자 추천 탭: 합계·확인 기다림·많이 데려온 추천인·최근 추천 100건 (조건을 넘은 이웃은 여기서도 달성 처리한다) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminReferralResponse>(await adminReferrals());
});

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "계정 id가 올바르지 않아요.");
const ActionSchema = z.union([
  z.object({ mode: z.enum(REF_MODES as [RefMode, ...RefMode[]]) }),
  z.object({ refereeId: id, approve: z.boolean() }),
  z.object({ refereeIds: z.array(id).min(1).max(HELD_LIST), approve: z.boolean() }),
]);

/**
 * `{ mode }` 보상 방식: review(모두 확인) · auto(점수로 자동) · off(기록만). 바꾼 뒤 조건을 넘기는 추천부터 적용된다
 * `{ refereeId, approve }` 확인 기다리는 추천 하나 승인(양쪽에 선물·칭호 수, 추천인은 그달 상한 안에서)·거절
 * `{ refereeIds, approve }` 고른 것 한꺼번에 (확인 기다림이 아닌 것은 건너뛴다). 둘 다 무엇을 보냈는지 decision으로
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const body = await readBody(req, ActionSchema);
  if ("mode" in body) {
    await getReferrals().setMode(body.mode);
    return json<AdminReferralResponse>(await adminReferrals());
  }
  const decision = "refereeId" in body ? await decideReferral(body.refereeId, body.approve) : await decideReferrals(body.refereeIds, body.approve);
  return json<AdminReferralResponse>({ ...(await adminReferrals()), decision });
});
