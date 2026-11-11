import type { NextRequest } from "next/server";
import { assertImageUsable } from "@/lib/blob";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId, isOwner, requireVisitor } from "@/lib/session";
import {
  findVisible,
  getAccounts,
  getStore,
  moveToShrine,
  releaseImage,
  saveGrave,
  toPublicGrave,
  type GraveStore,
} from "@/lib/store";
import type { Grave, GraveDetailResponse, UpdateGraveResponse } from "@/lib/types";
import { GraveInputSchema, isGraveId, readBody } from "@/lib/validate";

type Params = { id: string };

/**
 * 상세 + 내 반응 상태(오늘 헌화했는지). 방문자별 응답이라 공유 캐시에 올리지 않는다.
 * 쿠키 없이도 부를 수 있으므로 IP 기준으로 분당 120회까지만 받는다.
 */
export const GET = handler<Params>(async (req, { id }) => {
  await rateLimit("detail", req);
  const store = getStore();
  const now = Date.now();
  const [grave, visitorId, settings] = await Promise.all([findVisible(store, id), getVisitorId(req), store.settings(now)]);
  const viewer = visitorId ? await store.viewer(id, visitorId) : { myFlowerToday: false };
  const isMine = !!visitorId && grave.ownerAccountId === visitorId;
  return json<GraveDetailResponse>(
    { grave: toPublicGrave(grave, now, settings), ...viewer, isMine },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

/**
 * 주인 확인: 세운 계정으로 들어와 있거나(어느 기기든), 세운 브라우저의 x-owner-token이 맞으면 주인.
 * 숨겨진 묘비라도 주인은 고치거나 이장할 수 있다.
 */
async function requireOwned(req: NextRequest, store: GraveStore, id: string) {
  const visitorId = await requireVisitor(req);
  const grave = isGraveId(id) ? await store.get(id) : null;
  if (!grave) throw notFound();
  const byAccount = !!grave.ownerAccountId && grave.ownerAccountId === visitorId;
  if (!byAccount && !isOwner(req.headers.get("x-owner-token"), grave.ownerTokenHash))
    throw new HttpError(403, "NOT_OWNER", "이 묘비는 세운 계정이나 브라우저에서만 고치거나 이장할 수 있어요.");
  return { grave, visitorId };
}

/**
 * 전체 덮어쓰기 (입력 형태는 POST와 같다, comment를 빼면 지운다). 숨김·꾸미기는 저장소가 따로 지킨다.
 * style을 빼면 지금 디자인을 유지하고, 다른 유료 디자인으로 바꿀 때만 요청한 계정의 디자인권을 쓴다.
 */
export const PATCH = handler<Params>(async (req, { id }) => {
  const store = getStore();
  const { grave: current, visitorId } = await requireOwned(req, store, id);
  const input = await readBody(req, GraveInputSchema);
  assertImageUsable(input.imageUrl, visitorId, current.imageUrl);

  const next: Grave = {
    ...input,
    id,
    createdAt: current.createdAt,
    ownerTokenHash: current.ownerTokenHash,
    ownerAccountId: current.ownerAccountId,
    style: input.style ?? current.style,
    channel: current.channel,
  };
  await saveGrave(store, getAccounts(), visitorId, next, !!input.style && input.style !== current.style);
  if (current.imageUrl !== next.imageUrl) await releaseImage(store, current.imageUrl);
  return json<UpdateGraveResponse>({
    grave: toPublicGrave({ ...next, flowers: current.flowers, revives: current.revives }),
  });
});

/**
 * 이장. 바로 지우지 않고 성황당에 30일 모신다 (`POST /api/shrine/{id}/restore`로 되돌릴 수 있다).
 * 30일이 지나면 이미지까지 정리된다. 관리자 삭제는 따로 완전 삭제
 */
export const DELETE = handler<Params>(async (req, { id }) => {
  const store = getStore();
  const { grave, visitorId } = await requireOwned(req, store, id);
  if (!(await moveToShrine(store, getAccounts(), grave, visitorId))) throw notFound();
  return json({ ok: true });
});
