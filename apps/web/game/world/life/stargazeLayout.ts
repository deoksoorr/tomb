import { TELESCOPE, TELESCOPE_SPOT } from "@tomb/protocol";
import type { Interactable, Rect } from "../layout";

// 22번 별 보기 언덕의 망원경 배치 (순수 데이터). layout.ts가 충돌·상호작용 목록에 한 줄씩 더한다.
// 그림·E 처리는 VillageLife(같은 폴더). 돗자리는 layout.ts의 "mat" 소품이 그대로 1인 자리가 된다(propInteractable).

/** 망원경 삼각대 받침 충돌 */
export function stargazeColliders(): Rect[] {
  return [{ x: TELESCOPE.x - 5, y: TELESCOPE.y - 5, w: 10, h: 5 }];
}

/** 망원경 앞자리 (E → 별자리 잇기) */
export function stargazeInteractables(): Interactable[] {
  return [
    {
      id: "telescope",
      kind: "telescope",
      x: TELESCOPE_SPOT.x,
      y: TELESCOPE_SPOT.y,
      r: 14,
      ax: TELESCOPE_SPOT.x,
      ay: TELESCOPE_SPOT.y,
      label: "망원경 보기 · 별자리 잇기",
    },
  ];
}
