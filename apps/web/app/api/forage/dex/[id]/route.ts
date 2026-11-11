import { handler, HttpError, json } from "@/lib/http";
import { publicDex } from "@/lib/forage/service";
import type { PublicDex } from "@/lib/forage/types";
import { rateLimit } from "@/lib/ratelimit";

/** 다른 사람 도감 구경 (이름·칸별 기록·칭호만. 가방·포인트는 보이지 않는다) */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("rank", req);
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new HttpError(400, "INVALID_INPUT", "모르는 사람이에요.");
  return json<PublicDex>(await publicDex(id));
});
