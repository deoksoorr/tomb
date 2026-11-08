import { nanoid } from "nanoid";
import { assertImageUsable } from "@/lib/blob";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { newOwnerToken, requireVisitor } from "@/lib/session";
import { getAccounts, getStore, listPublic, toPublicGrave } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { CreateGraveResponse, Grave, GraveListResponse } from "@/lib/types";
import { createGraveSchema, parseWith, readJson } from "@/lib/validate";

/**
 * 전체 목록 + 카운트. 방문자와 무관한 응답이라 CDN에 캐시한다 (쿠키를 읽지 않는다).
 * 30초 동안은 신선하고, 그 뒤로 하루까지는 CDN이 마지막 목록을 바로 주면서 뒤에서 새로 받아 둔다.
 * → 한동안 아무도 없다가 들어와도 함수 콜드 스타트·Redis 왕복을 기다리지 않는다
 *   (카운트가 잠깐 옛날 값일 수 있지만 클라이언트가 30초마다 다시 받아 맞춘다).
 */
export const GET = handler(async () =>
  json<GraveListResponse>(await listPublic(getStore()), {
    headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=86400" },
  }),
);

/**
 * 묘비 세우기. 간단 입력(QuickGraveInput: `lived`가 있음)과 전체 입력(GraveInput)을 모두 받는다.
 * 세운 계정이 주인이 된다(어느 기기에서든 그 계정으로 수정·삭제). ownerToken 원문은 이 응답에서 한 번만 준다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const raw = await readJson(req);
  const input = parseWith(createGraveSchema(raw), raw);
  assertImageUsable(input.imageUrl, visitorId);
  await rateLimit("grave", req, visitorId);

  const owner = newOwnerToken();
  const grave: Grave = {
    ...input,
    id: nanoid(10),
    createdAt: Date.now(),
    ownerTokenHash: owner.hash,
    ownerAccountId: visitorId,
  };
  const accounts = getAccounts();
  await getStore().put(grave);
  const [earned] = await Promise.all([
    accounts.earn(visitorId, "bury", kstDay(grave.createdAt)),
    accounts.addGrave(visitorId, grave.id),
  ]);
  return json<CreateGraveResponse>(
    { grave: toPublicGrave({ ...grave, flowers: 0, revives: 0 }), ownerToken: owner.token, earned },
    { status: 201 },
  );
});
