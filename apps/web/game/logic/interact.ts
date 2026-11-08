import type { Seat } from "@tomb/protocol";
import type { Interactable } from "../world/layout";

// E/탭 상호작용 대상 고르기 (순수 함수라 테스트한다).
//  - 물속이면 E = 잠수/떠오르기
//  - 아니면 묘비·빈 좌석·오브젝트(나무·그네·종·우물·특별한 장소) 중 가장 가까운 것
//  - 아무것도 없고 물가면 물 튀기기

export type Interaction =
  | { kind: "grave"; graveId: string }
  | { kind: "seat"; seat: Seat }
  | { kind: "object"; obj: Interactable }
  | { kind: "dive" }
  | { kind: "surface" }
  | { kind: "splash" }
  | { kind: "none" };

export type InteractInput = {
  px: number;
  py: number;
  grave: { id: string; dist: number } | null;
  seat: Seat | null;
  objects: readonly Interactable[];
  /** 물속 상태 (수영/잠수), 물 밖이면 null */
  water: "swim" | "dive" | null;
  nearWater: boolean;
};

/** 반경 안에서 가장 가까운 오브젝트 (없으면 null) */
export function nearestObject(objects: readonly Interactable[], px: number, py: number): { obj: Interactable; dist: number } | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    const dx = o.x - px;
    const dy = o.y - py;
    if (Math.abs(dx) > o.r || Math.abs(dy) > o.r) continue;
    const d = Math.hypot(dx, dy);
    if (d <= o.r && d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best ? { obj: best, dist: bestD } : null;
}

export function pickInteraction(i: InteractInput): Interaction {
  if (i.water === "swim") return { kind: "dive" };
  if (i.water === "dive") return { kind: "surface" };
  const obj = nearestObject(i.objects, i.px, i.py);
  const gd = i.grave ? i.grave.dist : Infinity;
  const sd = i.seat ? Math.hypot(i.seat.x - i.px, i.seat.y - i.py) : Infinity;
  const od = obj ? obj.dist : Infinity;
  if (i.grave && gd <= sd && gd <= od) return { kind: "grave", graveId: i.grave.id };
  if (i.seat && sd <= od) return { kind: "seat", seat: i.seat };
  if (obj) return { kind: "object", obj: obj.obj };
  if (i.nearWater) return { kind: "splash" };
  return { kind: "none" };
}
