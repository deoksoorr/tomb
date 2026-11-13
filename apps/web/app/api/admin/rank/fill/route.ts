import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { fillHuntLevel } from "@/lib/huntLevelRank";
import { fillLookRank } from "@/lib/lookRank";
import { AdminRankFillSchema, readBody } from "@/lib/validate";

export type AdminRankFillResponse = { next: string; filled: number };

/**
 * 랭킹 기존 기록 다시 채우기 `{ board: "huntLevel" | "look", cursor?, count? }` (관리자).
 *  - huntLevel: 사냥 캐릭터 저장소(rpg:*:char)를 count개씩 훑어 레벨·경험치를 사냥 레벨 랭킹에 적는다
 *  - look: 착용 목록(acct:*:look)이 있는 계정을 훑어 지금 착용으로 꾸미기 점수를 적는다
 * 운영자는 빼고, 정지 계정은 읽을 때 뺀다. 응답의 next를 다시 넘기며 "0"이 나올 때까지 부른다.
 * 평소에는 랭킹을 처음 읽을 때 서버가 한 번 저절로 채우니(lib/rankFill), 빠진 사람이 보일 때만 쓰면 된다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { board, cursor, count } = await readBody(req, AdminRankFillSchema);
  const r = board === "look" ? await fillLookRank(cursor, count) : await fillHuntLevel(cursor, count);
  return json<AdminRankFillResponse>(r);
});
