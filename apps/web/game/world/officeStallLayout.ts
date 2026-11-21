import type { Interactable, Rect } from "./layout";

// 11/20 「총무팀 문대리」(사무실 가구 카트) 배치 (순수 — layout.ts가 충돌·상호작용·미니맵에 더하고, 그림·이름표·밤 빛·몸 충돌은 OfficeStallView가 놓는다).
//  야근 빌딩 회전문 오른쪽 풀밭 (북쪽 큰길 바로 위). 11/20 빌딩이 서쪽(x 968)으로 옮겨 카트도 따라왔다 — 빌딩과 「판교의 등대」 사이.
//  카트 (1026,172), 문대리는 카트 뒤 12px (1025,160)에 서서 상판 너머로 윗몸을 내민다 (그림 game/sprites/officeSeller.ts — OFFICE_CLERK_OFFSET).
//  판매 창은 components/office (portal:open office), 서버는 /api/office (lib/office).
//  큰길(y 176부터)·빌딩 몸 충돌(x ~993)·등대 돌 받침(x ~1063)과 겹치지 않는다.
//  까마귀 연못 서쪽 낚시 자리 (1102,108)로 가는 길은 건드리지 않는다 (officeStall.test)

export const OFFICE_STALL = { x: 1026, y: 172 } as const;
/** 문대리 발 (카트 뒤) — 그림 쪽 OFFICE_CLERK_OFFSET과 같은 값 (그림 모듈을 끌어오지 않게 적어 두고 officeStall.test가 맞춰 본다) */
export const OFFICE_CLERK = { x: OFFICE_STALL.x - 1, y: OFFICE_STALL.y - 12 } as const;

/** E 안내 */
export const OFFICE_LABEL = "총무팀 문대리에게 사무실 가구 사기";

/**
 * 충돌: 카트 몸통(바퀴 줄까지 — 뒤로 숨어들지 않게 깊이만큼)과 카트 뒤 문대리 몸통.
 * 카트 그림(44px)보다 양옆을 1px씩 줄였다 (오른쪽 A4 상자·난로는 그림만)
 */
export function officeColliders(): Rect[] {
  const s = OFFICE_STALL;
  const c = OFFICE_CLERK;
  return [
    { x: s.x - 21, y: s.y - 12, w: 42, h: 10 },
    { x: c.x - 6, y: c.y - 6, w: 12, h: 6 },
  ];
}

/** E·[상호작용]: 카트 앞 (큰길 가장자리) */
export function officeInteractables(): Interactable[] {
  const x = OFFICE_STALL.x;
  const y = OFFICE_STALL.y + 10;
  return [{ id: "portal:office", kind: "portal", portal: "office", x, y, r: 22, ax: x, ay: y, label: OFFICE_LABEL }];
}

/**
 * 돌아다니는 주민이 쉬거나 들르는 점으로 고르지 않고 지나가지도 않을 자리: 카트·문대리·블라인드 차양 그림 둘레.
 * 플레이어 걷기는 막지 않는다 (몸 충돌은 officeColliders)
 */
export function nearOffice(x: number, y: number): boolean {
  return x > OFFICE_STALL.x - 30 && x < OFFICE_STALL.x + 30 && y > OFFICE_STALL.y - 52 && y < OFFICE_STALL.y + 10;
}
