import { nanoid } from "nanoid";
import { assertImageUsable } from "@/lib/blob";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { newOwnerToken, requireVisitor } from "@/lib/session";
import { getStore, listPublic, toPublicGrave } from "@/lib/store";
import type { CreateGraveResponse, Grave, GraveListResponse } from "@/lib/types";
import { GraveInputSchema, readBody } from "@/lib/validate";

/** 전체 목록 + 카운트. 방문자와 무관한 응답이라 CDN에 30초 캐시한다 (쿠키를 읽지 않는다) */
export const GET = handler(async () =>
  json<GraveListResponse>(await listPublic(getStore()), {
    headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=300" },
  }),
);

/** 묘비 세우기. ownerToken 원문은 이 응답에서 한 번만 준다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const input = await readBody(req, GraveInputSchema);
  assertImageUsable(input.imageUrl, visitorId);
  await rateLimit("grave", req, visitorId);

  const owner = newOwnerToken();
  const grave: Grave = { ...input, id: nanoid(10), createdAt: Date.now(), ownerTokenHash: owner.hash };
  await getStore().put(grave);
  return json<CreateGraveResponse>(
    { grave: toPublicGrave({ ...grave, flowers: 0, revives: 0 }), ownerToken: owner.token },
    { status: 201 },
  );
});
