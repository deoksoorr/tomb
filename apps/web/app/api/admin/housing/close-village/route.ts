import { requireAdmin } from "@/lib/admin";
import { closeVillage, type CloseVillageReport } from "@/lib/housing/closeVillage";
import { getHouseStore } from "@/lib/housing/service";
import { handler, json } from "@/lib/http";

/** 11/19 2단지 닫기 미리 보기: 채널마다 어느 집이 몇 번지로 옮겨지는지 (아무것도 바꾸지 않는다) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<CloseVillageReport>(await closeVillage(getHouseStore(), false));
});

/** 11/19 2단지 닫기 실행: 2단지 집을 메인 맵 빈 번지로 옮기고, 자리가 없으면 필지 대기로 (다시 눌러도 결과가 같다) */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  return json<CloseVillageReport>(await closeVillage(getHouseStore(), true));
});
