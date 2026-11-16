import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { BOOSTABLE_SOURCES, POINT_EVENT_MAX_MS, POINT_EVENT_MULT, POINT_EVENT_MULTS, pointEventChanged, pointEventOn, type PointEvent, type PointEventResponse } from "@/lib/pointEvent";
import { announceChange, announceEndOnce, announceStart } from "@/lib/pointEventNotice";
import { getPointEventStore, setPointEvent } from "@/lib/store/pointEvent";
import { readBody } from "@/lib/validate";

/** 관리자: 지금 포인트 배수 이벤트 설정 (끝난 이벤트도 그대로) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<PointEventResponse>({ event: await getPointEventStore().get() });
});

const SetSchema = z.object({
  on: z.boolean(),
  /** 저절로 꺼지는 시각 (ms). null이면 끌 때까지 */
  endAt: z.number().int().nullable().optional(),
  /** 늘릴 항목 (없으면 전부) */
  sources: z.array(z.enum(BOOSTABLE_SOURCES as [string, ...string[]])).min(1).optional(),
  /** 배수 (없으면 2배) */
  mult: z.number().refine((n) => (POINT_EVENT_MULTS as readonly number[]).includes(n)).optional(),
});

/**
 * 관리자: 켜기 `{ on: true, endAt, sources, mult }` · 끄기 `{ on: false }`.
 * 켜져 있는데 다시 켜면 끝나는 시각·항목·배수만 바꾼다 (켠 시각은 그대로). 항목에서 뺀 것은 그날 늘어난 한도도 바로 원래대로. 끄면 끝나는 시각을 지금으로 — 오늘 늘어난 한도는 새벽 5시까지 남는다.
 * 이 인스턴스의 캐시는 바로 바뀌고, 다른 서버 인스턴스의 적립 경로는 5초 캐시라 늦어도 그만큼 안에 따라온다.
 * 켜기·바꾸기·끄기는 마을 전체 공지로 알린다 (lib/pointEventNotice — 게임 화면은 이 공지를 듣고 안내 띠를 바로 다시 읽는다)
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, SetSchema);
  const now = Date.now();
  const cur = await getPointEventStore().get();
  const live = pointEventOn(cur, now);
  if (!input.on) {
    if (!live || !cur) return json<PointEventResponse>({ event: cur });
    const ended = (await setPointEvent({ ...cur, endAt: now }, now))!;
    await announceEndOnce(ended, now).catch(noticeFailed);
    return json<PointEventResponse>({ event: ended });
  }
  const endAt = input.endAt ?? null;
  if (endAt !== null && (endAt <= now + 60_000 || endAt > now + POINT_EVENT_MAX_MS))
    throw new HttpError(400, "INVALID_INPUT", "끝나는 시각은 지금부터 1분 뒤에서 14일 안으로 정해 주세요.");
  const sources = (input.sources ?? BOOSTABLE_SOURCES) as PointEvent["sources"];
  const mult = input.mult ?? POINT_EVENT_MULT;
  const next = (await setPointEvent({ startAt: live && cur ? cur.startAt : now, endAt, sources, mult }, now))!;
  if (!live || !cur) await announceStart(next, now).catch(noticeFailed);
  else if (pointEventChanged(cur, next)) await announceChange(next, now).catch(noticeFailed);
  return json<PointEventResponse>({ event: next });
});

/** 공지가 실패해도 설정은 그대로 둔다 */
const noticeFailed = (e: unknown) => console.warn("[pointEvent] 공지 실패", e);
