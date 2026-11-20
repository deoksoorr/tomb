import type { Interactable, Rect } from "./layout";

// 11/19 「분양사 보리」(멍냥 분양사) 배치 (순수 — layout.ts가 충돌·상호작용·미니맵에 더하고, 그림·이름표·밤 빛·몸 충돌은 MungnyangView가 놓는다).
//  동물원 정문 (176,784) 왼쪽 풀밭, 소나무 (103,753) 앞. 분양사 발 (96,764), 왼쪽에 간식 상자, 오른쪽에 치즈냥 방석, 발치에 펫 셋 (그림 game/sprites/mungnyangSeller.ts).
//  판매 창은 components/mungnyang (portal:open mungnyang), 서버는 /api/mungnyang

export const MUNGNYANG_SELLER = { x: 96, y: 764 } as const;

/**
 * 간식 상자·방석 원점 (바닥 가운데).
 * 그림 쪽 MUNGNYANG_STAND_AT·MUNGNYANG_CUSHION_AT·크기와 같은 값 (그림 모듈을 끌어오지 않게 적어 두고 mungnyang.test가 맞춰 본다) */
export const MUNGNYANG_STAND = { x: MUNGNYANG_SELLER.x - 38, y: MUNGNYANG_SELLER.y + 1 } as const;
export const MUNGNYANG_CUSHION = { x: MUNGNYANG_SELLER.x + 26, y: MUNGNYANG_SELLER.y + 2 } as const;
const STAND_W = 18;
const CUSHION_W = 22;

/** E 안내 */
export const MUNGNYANG_LABEL = "분양사 보리와 이야기하기";

/**
 * 충돌: 분양사 몸통, 간식 상자 받침, 방석 (발치 펫은 그림만 — 걸어서 지나갈 수 있다).
 * 모두 풀밭 안이라 서쪽 다리에서 동물원 정문으로 내려가는 흙길은 막지 않는다 (mungnyang.test)
 */
export function mungnyangColliders(): Rect[] {
  const s = MUNGNYANG_SELLER;
  const st = MUNGNYANG_STAND;
  const cu = MUNGNYANG_CUSHION;
  return [
    { x: s.x - 7, y: s.y - 6, w: 14, h: 6 },
    { x: st.x - Math.floor(STAND_W / 2) + 1, y: st.y - 7, w: STAND_W - 2, h: 6 },
    { x: cu.x - Math.floor(CUSHION_W / 2) + 2, y: cu.y - 6, w: CUSHION_W - 4, h: 5 },
  ];
}

/** E·[상호작용]: 분양사 앞 (코기가 오가는 줄 바로 아래 풀밭) */
export function mungnyangInteractables(): Interactable[] {
  const x = MUNGNYANG_SELLER.x;
  const y = MUNGNYANG_SELLER.y + 12;
  return [{ id: "portal:mungnyang", kind: "portal", portal: "mungnyang", x, y, r: 20, ax: x, ay: y, label: MUNGNYANG_LABEL }];
}

/**
 * 돌아다니는 주민(멍냥이 등)이 쉬거나 들르는 점으로 고르지 않고 지나가지도 않을 자리: 간식 상자 ~ 방석, 분양사 머리 ~ 코기 길 (그림 위에 겹쳐 서 있지 않게).
 * 플레이어 걷기는 막지 않는다 (몸 충돌은 mungnyangColliders)
 */
export function nearMungnyang(x: number, y: number): boolean {
  return x > MUNGNYANG_STAND.x - 16 && x < MUNGNYANG_CUSHION.x + 18 && y > MUNGNYANG_SELLER.y - 40 && y < MUNGNYANG_SELLER.y + 16;
}
