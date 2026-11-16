import { TELESCOPES } from "@tomb/protocol";
import type { Interactable, Rect } from "../layout";

// 22번 별 보기 언덕의 망원경 배치 (순수 데이터 — 11/16부터 언덕 밖 마을 곳곳 망원경도 같은 목록 TELESCOPES). layout.ts가 충돌·상호작용 목록에 한 줄씩 더한다.
// 그림·E 처리는 VillageLife(같은 폴더). 돗자리는 layout.ts의 "mat" 소품이 그대로 1인 자리가 된다(propInteractable).

/** 망원경 삼각대 받침 충돌 */
export function stargazeColliders(): Rect[] {
  return TELESCOPES.map((t) => ({ x: t.x - 5, y: t.y - 5, w: 10, h: 5 }));
}

/** 망원경 앞자리 (E → 별자리 잇기). 망원경마다 1인 자리 (11/15 둘째 망원경 TELESCOPE_2, 11/16 마을 곳곳 VILLAGE_SCOPES → telescope3~) */
export function stargazeInteractables(): Interactable[] {
  return TELESCOPES.map((t, i) => ({
    id: i ? `telescope${i + 1}` : "telescope",
    kind: "telescope",
    x: t.x,
    y: t.y + 10,
    r: 14,
    ax: t.x,
    ay: t.y + 10,
    label: "망원경으로 별자리 잇기",
  }));
}
