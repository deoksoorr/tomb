import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import { requireAdmin, type AdminGraveSettings } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getAccounts, getStore } from "@/lib/store";
import { sweepPassing } from "@/lib/store/passing";
import { GraveSettingsSchema, readBody } from "@/lib/validate";

/** 성불 기간(일)·묘역 정원 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const { passDays } = await getStore().settings(Date.now());
  return json<AdminGraveSettings>({ passDays, capacity: GRAVEYARD_CAPACITY });
});

/** 성불 기간 바꾸기 `{ passDays }`. 바로 정리를 한 번 돌린다 (줄였으면 지난 묘비가 지금 성불한다) */
export const PATCH = handler(async (req) => {
  await requireAdmin(req);
  const { passDays } = await readBody(req, GraveSettingsSchema);
  const store = getStore();
  await store.setPassDays(passDays);
  const passed = await sweepPassing(store, getAccounts(), Date.now(), { force: true });
  return json<AdminGraveSettings & { passedNow: number }>({ passDays, capacity: GRAVEYARD_CAPACITY, passedNow: passed.length });
});
