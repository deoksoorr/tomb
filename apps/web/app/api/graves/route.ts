import { nanoid } from "nanoid";
import { recordEvent } from "@/lib/analyticsService";
import { assertImageUsable } from "@/lib/blob";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { newOwnerToken, requireVisitor } from "@/lib/session";
import { getAccounts, getStore, listPublic, saveGrave, toPublicGrave } from "@/lib/store";
import { activeGraveOf, sweepPassing } from "@/lib/store/passing";
import { oneGraveMessage } from "@/lib/passText";
import { kstDay } from "@/lib/store/accounts";
import { GRAVE_CHANNELS, isGraveChannel } from "@/lib/store/channels";
import type { CreateGraveResponse, Grave, GraveListResponse } from "@/lib/types";
import { createGraveSchema, parseWith, readJson } from "@/lib/validate";

/**
 * `?channel=N`(없으면 1) 그 채널 묘지의 목록 + 카운트 + 그 채널 랭킹. 채널마다 묘지가 따로다.
 * 방문자와 무관한 응답이라 CDN에 캐시한다 (쿠키를 읽지 않는다, 캐시 키는 URL이라 채널별로 따로 쌓인다).
 * 30초 동안은 신선하고, 그 뒤로 하루까지는 CDN이 마지막 목록을 바로 주면서 뒤에서 새로 받아 둔다.
 * → 한동안 아무도 없다가 들어와도 함수 콜드 스타트·Redis 왕복을 기다리지 않는다
 *   (카운트가 잠깐 옛날 값일 수 있지만 클라이언트가 30초마다 다시 받아 맞춘다).
 */
export const GET = handler(async (req) => {
  const raw = req.nextUrl.searchParams.get("channel");
  const channel = raw === null ? 1 : Number(raw);
  if (!isGraveChannel(channel)) throw new HttpError(400, "INVALID_INPUT", `채널은 1~${GRAVE_CHANNELS} 중 하나예요.`);
  const store = getStore();
  // 성불 정리(기간·묘역 정원·1인 1묘비)는 잠금으로 1분에 한 번만. 실패해도 목록은 준다
  await sweepPassing(store, getAccounts()).catch((e: unknown) => console.error("[graves] 성불 정리 실패", e));
  return json<GraveListResponse>(await listPublic(store, channel), {
    // 엣지만 30초 캐시(뒤에서 갱신). 브라우저는 캐시하지 않는다 — 브라우저도 stale-while-revalidate를 따라 옛 목록을 먼저 보여 줬다
    headers: { "Vercel-CDN-Cache-Control": "max-age=30, stale-while-revalidate=86400", "Cache-Control": "no-store" },
  });
});

/**
 * 묘비 세우기 (1인 1묘비: 이 계정의 묘비가 묘역에 있으면 409 ONE_GRAVE + 남은 기간 안내). 간단 입력(QuickGraveInput: `lived`가 있음)과 전체 입력(GraveInput)을 모두 받는다.
 * 세운 계정이 주인이 된다(어느 기기에서든 그 계정으로 수정·삭제). ownerToken 원문은 이 응답에서 한 번만 준다.
 * style이 유료 디자인이면 가방의 디자인권 1개를 저장과 함께 쓴다 (없으면 409 NO_ITEM). 없으면 "auto".
 * channel(1..10, 전체 입력에서는 없으면 1)의 묘지에 세운다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const raw = await readJson(req);
  const input = parseWith(createGraveSchema(raw), raw);
  assertImageUsable(input.imageUrl, visitorId);
  const store = getStore();
  const accounts = getAccounts();
  const now = Date.now();
  // 1인 1묘비는 하루 한도를 쓰기 전에 본다 (막힌 시도가 한도를 깎지 않게)
  const active = await activeGraveOf(store, accounts, visitorId, now);
  if (active) throw new HttpError(409, "ONE_GRAVE", oneGraveMessage(active.passAt, now));
  await rateLimit("grave", req, visitorId);

  const owner = newOwnerToken();
  const grave: Grave = {
    ...input,
    id: nanoid(10),
    createdAt: now,
    ownerTokenHash: owner.hash,
    ownerAccountId: visitorId,
    style: input.style ?? "auto",
    channel: input.channel ?? 1,
  };
  await saveGrave(store, accounts, visitorId, grave, true);
  await recordEvent("grave", now); // 47번 방문 분석: 묘비 작성 수
  const [earned] = await Promise.all([
    accounts.earn(visitorId, "bury", kstDay(grave.createdAt)),
    accounts.addGrave(visitorId, grave.id),
  ]);
  // 동시에 두 번 세웠으면 가장 최근 것만 남긴다 (1인 1묘비, 나머지는 성불)
  const kept = await activeGraveOf(store, accounts, visitorId, now);
  return json<CreateGraveResponse>(
    { grave: toPublicGrave({ ...grave, flowers: 0, revives: 0 }, now, kept?.settings), ownerToken: owner.token, earned },
    { status: 201 },
  );
});
