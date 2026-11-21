import { chairRank, type ChairRankResponse } from "@/lib/chairman/service";
import { isChairMode } from "@/lib/chairman/rules";
import { handler, HttpError, json } from "@/lib/http";
import { getVisitorId } from "@/lib/session";

/** 11/20 회장님 독대 이번 주 랭킹 `?mode=normal|hell` → 상위 50명 + 내 줄 (한 판 최고 피해, 운영자·정지 제외, 30초 캐시) */
export const GET = handler(async (req) => {
  const mode = req.nextUrl.searchParams.get("mode");
  if (!isChairMode(mode)) throw new HttpError(400, "INVALID_INPUT", "모드를 골라 주세요.");
  return json<ChairRankResponse>(await chairRank(mode, await getVisitorId(req)));
});
