import type { NextRequest } from "next/server";
import { assertImageUsable } from "@/lib/blob";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId, isOwner, requireVisitor } from "@/lib/session";
import {
  deleteGrave,
  findVisible,
  getStore,
  releaseImage,
  toPublicGrave,
  type GraveStore,
} from "@/lib/store";
import type { Grave, GraveDetailResponse, UpdateGraveResponse } from "@/lib/types";
import { GraveInputSchema, isGraveId, readBody } from "@/lib/validate";

type Params = { id: string };

/**
 * 상세 + 내 반응 상태. 방문자별 응답(myRevive)이라 공유 캐시에 올리지 않는다.
 * 쿠키 없이도 부를 수 있으므로 IP 기준으로 분당 120회까지만 받는다.
 */
export const GET = handler<Params>(async (req, { id }) => {
  await rateLimit("detail", req);
  const store = getStore();
  const [grave, visitorId] = await Promise.all([findVisible(store, id), getVisitorId(req)]);
  const viewer = visitorId ? await store.viewer(id, visitorId) : { myRevive: false, myFlowerToday: false };
  return json<GraveDetailResponse>(
    { grave: toPublicGrave(grave), ...viewer },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

/** 숨겨진 묘비라도 주인은 고치거나 이장할 수 있다 */
async function requireOwned(req: NextRequest, store: GraveStore, id: string) {
  const visitorId = await requireVisitor(req);
  const grave = isGraveId(id) ? await store.get(id) : null;
  if (!grave) throw notFound();
  if (!isOwner(req.headers.get("x-owner-token"), grave.ownerTokenHash))
    throw new HttpError(403, "NOT_OWNER", "이 묘비는 세운 브라우저에서만 고치거나 이장할 수 있어요.");
  return { grave, visitorId };
}

/** 전체 덮어쓰기 (입력 형태는 POST와 같다). 숨김 상태는 저장소가 따로 지킨다 */
export const PATCH = handler<Params>(async (req, { id }) => {
  const store = getStore();
  const { grave: current, visitorId } = await requireOwned(req, store, id);
  const input = await readBody(req, GraveInputSchema);
  assertImageUsable(input.imageUrl, visitorId, current.imageUrl);

  const next: Grave = { ...input, id, createdAt: current.createdAt, ownerTokenHash: current.ownerTokenHash };
  await store.put(next);
  if (current.imageUrl !== next.imageUrl) await releaseImage(store, current.imageUrl);
  return json<UpdateGraveResponse>({
    grave: toPublicGrave({ ...next, flowers: current.flowers, revives: current.revives }),
  });
});

/** 이장(삭제). Blob 이미지도 같이 정리한다 */
export const DELETE = handler<Params>(async (req, { id }) => {
  const store = getStore();
  await requireOwned(req, store, id);
  await deleteGrave(store, id);
  return json({ ok: true });
});
