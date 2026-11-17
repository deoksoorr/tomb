import type { MapConcept } from "@/lib/mapConcept";

// 11/17 사냥터·야근 빌딩 맵 컨셉 (lib/mapConcept): 지금 굽고 있는 그림의 판.
// 바닥·벽·소품 그림 함수(arena/art.ts, tower/themes/*Map.ts)는 인자를 늘리지 않고 여기서 읽어 겨울 손질을 조금씩 넣는다
// (floorCanvas·propCanvas가 그리는 동안만 바뀐다 — 그리기는 동기라 다른 그림과 섞이지 않는다).

let cur: MapConcept = "default";
let ground: ((c: CanvasRenderingContext2D) => void) | null = null;

/**
 * c 판으로 그린다 (끝나면 원래 판으로). snow = 바깥 바닥을 눈밭으로 덮는 손질 — 바닥 그림이 기믹 무늬(웅덩이·매트)를 그리기 직전에
 * paintGroundSnow로 부르고, 부르지 않았으면 그리는 쪽(floorCanvas)이 바닥을 다 그린 뒤 부른다
 */
export function withConcept<T>(c: MapConcept, draw: () => T, snow: ((c: CanvasRenderingContext2D) => void) | null = null): T {
  const prev = cur;
  const prevGround = ground;
  cur = c;
  ground = snow;
  try {
    return draw();
  } finally {
    cur = prev;
    ground = prevGround;
  }
}

/** 바닥 눈 손질을 지금 한다 (한 번만 — 두 번째부터는 false) */
export function paintGroundSnow(c: CanvasRenderingContext2D): boolean {
  const g = ground;
  if (!g) return false;
  ground = null;
  g(c);
  return true;
}

/** 눈 덮인 그림 (겨울·크리스마스) */
export const paintSnowy = (): boolean => cur !== "default";
/** 크리스마스 장식까지 */
export const paintXmas = (): boolean => cur === "christmas";
