import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { MAP_CONCEPT_NOTICE_PREFIX, MAP_CONCEPTS, mapConceptNotice, type MapConceptResponse } from "@/lib/mapConcept";
import { getMapConceptStore, setMapConcept } from "@/lib/store/mapConcept";
import { readBody } from "@/lib/validate";
import { pushVillageNotice } from "@/lib/weeklyChamp";

/** 관리자: 지금 마을 맵 컨셉 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<MapConceptResponse>({ concept: await getMapConceptStore().get() });
});

const SetSchema = z.object({ concept: z.enum(MAP_CONCEPTS as [string, ...string[]]) });

/**
 * 관리자: 마을 맵 컨셉을 바꾼다 `{ concept }`. 바뀌었으면 마을 전체 공지 한 줄 (id가 MAP_CONCEPT_NOTICE_PREFIX —
 * 게임 화면이 들으면 바로 다시 읽어 그림을 바꾼다). 같은 값이면 공지 없이 그대로
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { concept } = await readBody(req, SetSchema);
  const now = Date.now();
  const cur = await getMapConceptStore().get();
  if (cur === concept) return json<MapConceptResponse>({ concept: cur });
  const next = await setMapConcept(concept as MapConceptResponse["concept"], now);
  await pushVillageNotice(mapConceptNotice(next), now, { id: `${MAP_CONCEPT_NOTICE_PREFIX}${now}` }).catch((e) => console.warn("[mapConcept] 공지 실패", e));
  return json<MapConceptResponse>({ concept: next });
});
