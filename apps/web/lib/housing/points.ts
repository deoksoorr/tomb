import { HttpError } from "../http";
import { earnPoints, getAccounts, refundPoints, spendPoints } from "../store";
import { loadMe } from "../store/accounts";
import type { Me } from "../types";
import { LIKE_REWARD } from "./catalog";

// 하우징의 포인트 출입구. 장부는 공용 계정 저장소 하나뿐이다 (여기서 따로 세지 않는다).
//  - 쓰기: spendPoints (모자라면 409 NOT_ENOUGH_POINTS)
//  - 되팔기·결제 뒤 실패 보상: refundPoints — 적립이 아니라 돌려받는 돈이라 하루 적립 한도·모은 포인트 랭킹과 무관하다
//  - 좋아요 보상: earnPoints(houseLike) — 하루 한도·같은 IP 한도는 공용 규칙이 건다

export async function spend(accountId: string, amount: number, reason: string): Promise<Me> {
  return spendPoints(accountId, amount, `housing:${reason}`);
}

/** 되팔기·보상으로 돌려준다 (지갑 상한에서 잘린다) */
export async function refund(accountId: string, amount: number): Promise<Me> {
  return amount > 0 ? refundPoints(accountId, amount, "housing:refund") : myPoints(accountId);
}

/** 결제 뒤 집 쪽 변경이 실패하면 돌려주고 그 오류를 던진다 */
export async function refundAndThrow(accountId: string, amount: number, err: HttpError): Promise<never> {
  await refund(accountId, amount).catch((e) => console.error("[housing] 환불 실패", accountId.slice(0, 6), amount, e));
  throw err;
}

export async function rewardLike(ownerId: string, ip: string): Promise<number> {
  return (await earnPoints(ownerId, "houseLike", LIKE_REWARD, ip)).earned;
}

export async function myPoints(accountId: string): Promise<Me> {
  return loadMe(getAccounts(), accountId);
}

/** 잔액·이름만 (계정 전체(loadMe = 명령 10개 남짓)를 읽지 않고 HMGET 1개) */
export async function myBrief(accountId: string): Promise<{ points: number; name: string | null }> {
  const [s] = await getAccounts().summaries([accountId]);
  return { points: s?.points ?? 0, name: s?.name ?? null };
}
