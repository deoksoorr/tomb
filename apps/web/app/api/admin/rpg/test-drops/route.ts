import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { testServerEnv } from "@/lib/rpg/superHunter";
import { batchLabel, getTestDropStore, TEST_DROP_PRESET } from "@/lib/rpg/testDrops";
import { staffAccountId } from "@/lib/staff";
import { readBody } from "@/lib/validate";

/** staffId: 운영자 계정 (없으면 예약할 수 없다) · left: 남은 예약 (맨 앞이 다음 판, "고급+희귀" 꼴) */
export type AdminTestDropsResponse = { staffId: string | null; left: string[] };

const notHere = () => new HttpError(404, "NOT_FOUND", "없는 경로예요.");

async function state(): Promise<AdminTestDropsResponse> {
  const staffId = await staffAccountId();
  return { staffId, left: staffId ? (await getTestDropStore().list(staffId)).map(batchLabel) : [] };
}

/** 테스트 서버 전용 (운영 404): 운영자 계정의 남은 시험 드롭 예약 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  if (!testServerEnv()) throw notHere();
  return json<AdminTestDropsResponse>(await state());
});

/**
 * 테스트 서버 전용 (운영 404): `{ action: "preset" }` = 예약을 [고급+희귀] → [꾸미기 선물+전설] 두 판으로 바꾼다 · `{ action: "clear" }` = 비우기.
 * 운영자 계정이 사냥 판을 시작할 때마다 맨 앞 한 판씩 꺼낸다 (lib/rpg/testDrops)
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  if (!testServerEnv()) throw notHere();
  const { action } = await readBody(req, z.object({ action: z.enum(["preset", "clear"]) }));
  const staffId = await staffAccountId();
  if (!staffId) throw new HttpError(409, "NO_STAFF", "운영자 계정을 먼저 지정해 주세요 (운영자 칸).");
  await getTestDropStore().set(staffId, action === "preset" ? TEST_DROP_PRESET : []);
  return json<AdminTestDropsResponse>(await state());
});
