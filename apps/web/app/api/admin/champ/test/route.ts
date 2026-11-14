import { CHAMP_BOARDS } from "@tomb/protocol";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { testServerEnv } from "@/lib/rpg/superHunter";
import { staffAccountId } from "@/lib/staff";
import { getChamp, type ChampTest } from "@/lib/store/champ";
import { readBody } from "@/lib/validate";
import { grantChampTest } from "@/lib/weeklyChamp";

export type AdminChampTestResponse = { staffId: string | null; test: ChampTest | null };

const notHere = () => new HttpError(404, "NOT_FOUND", "없는 경로예요.");

/** 테스트 서버 전용 (운영 404): 운영자 계정의 시험 1위 상태 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  if (!testServerEnv()) throw notHere();
  const staffId = await staffAccountId();
  return json<AdminChampTestResponse>({ staffId, test: staffId ? await getChamp().test(staffId, Date.now()) : null });
});

/**
 * 테스트 서버 전용 (운영 404): 운영자 계정에 시험 1위 주기 `{ boards }` (여러 개면 다관왕, 빈 목록 = 시험 해제).
 * 실제 지급과 같은 경로(전용 모자 하루 대여 · 1,000P씩 · 배지·전용 오라 자격)로 주되, 자격은 몇 시간 뒤 저절로 끝나고
 * 주간 1위 기록·랭킹·명예의 전당은 건드리지 않는다. 운영자가 게임 화면을 열어 두었으면 그 자리에서 알림 창·오라가 붙는다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  if (!testServerEnv()) throw notHere();
  const { boards } = await readBody(req, z.object({ boards: z.array(z.enum(CHAMP_BOARDS)).max(3) }));
  const staffId = await staffAccountId();
  if (!staffId) throw new HttpError(409, "NO_STAFF", "운영자 계정을 먼저 지정해 주세요 (운영자 칸).");
  await grantChampTest(staffId, [...new Set(boards)]);
  return json<AdminChampTestResponse>({ staffId, test: await getChamp().test(staffId, Date.now()) });
});
