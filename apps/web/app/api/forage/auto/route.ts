import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { AutoFishSchema } from "@/lib/forage/schemas";
import { startAutoFish, stopAutoFish, syncAutoFish } from "@/lib/forage/service";
import type { AutoFishResponse } from "@/lib/forage/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 자동 낚시 `{ action: "start", spot, ch? } | { action: "sync" } | { action: "stop" }`.
 * 서버 시각으로 접속해 있던 시간만 세어 정산한다 (lib/forage/auto.ts). 정산은 세션 비교 후 교체로 한 번만 지급된다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, AutoFishSchema);
  const now = serverNow(visitorId); // 운영은 Date.now() (개발 QA만 시계를 앞당길 수 있다)
  const r =
    body.action === "start"
      ? await startAutoFish(visitorId, body.spot, body.ch ?? null, now)
      : body.action === "sync"
        ? await syncAutoFish(visitorId, now)
        : await stopAutoFish(visitorId, now);
  return json<AutoFishResponse>(r);
});
