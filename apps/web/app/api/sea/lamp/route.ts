import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { housingChannel } from "@/lib/housing/schemas";
import { myBrief } from "@/lib/housing/points";
import { rateLimit } from "@/lib/ratelimit";
import { lampState, lightLamp, type LampState } from "@/lib/sea/lamp";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const LightSchema = z.object({ ch: housingChannel, force: z.boolean().optional() });

export type LampResponse = LampState;
export type LampLightResponse = LampState & { lit: boolean; stamps?: number };

/**
 * 11/16 달물결 포구 등대 `?ch=N`: 오늘(새벽 5시 기준) 그 채널 등불을 켠 사람 (없으면 name null).
 * 방문자와 무관해서 CDN에 10초 캐시한다 (`&t=` = 누가 켰다는 소식을 받은 직후 — 서버 기억도 건너뛴다)
 */
export const GET = handler(async (req) => {
  await rateLimit("publicGet", req);
  const parsed = housingChannel.safeParse(Number(req.nextUrl.searchParams.get("ch") ?? 1));
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");
  const fresh = req.nextUrl.searchParams.has("t");
  return json<LampResponse>(await lampState(parsed.data, Date.now(), fresh), {
    headers: { "Vercel-CDN-Cache-Control": "max-age=10, stale-while-revalidate=60", "Cache-Control": "no-store" },
  });
});

/** 등불 켜기 `{ ch }`: 해가 진 뒤 그 채널에서 오늘 처음 켠 사람이면 「오늘의 등대지기」 + 도장 1개 (force는 개발 서버에서만) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ch, force } = await readBody(req, LightSchema);
  await rateLimit("shop", req, visitorId);
  const me = await myBrief(visitorId);
  const r = await lightLamp(ch, visitorId, me.name ?? "이름 없는 유령", Date.now(), !!force && !env.isProd());
  if (!r) throw new HttpError(409, "NOT_NIGHT", "등불은 해가 진 뒤에 켤 수 있어요.");
  const state = await lampState(ch);
  return json<LampLightResponse>({ ...state, name: r.name, lit: r.lit, ...(r.lit ? { stamps: r.stamps } : {}) });
});
