import { handler, json } from "@/lib/http";
import { forageState } from "@/lib/forage/service";
import type { ForageState } from "@/lib/forage/types";
import { requireVisitor } from "@/lib/session";

/** 내 낚시·채집: 가방(물고기·채집물)·도감·보상·오늘 기록·지금 피어 있는 채집 지점 */
export const GET = handler(async (req) => json<ForageState>(await forageState(await requireVisitor(req))));
