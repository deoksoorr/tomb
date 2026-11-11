import { DIR, itemById, sanitizeLook, type DirId, type ItemDef } from "@tomb/protocol";

// 상점 "입어 보기" 순수 함수: 지금 입은 모습에 고른 꾸미기를 더한 미리보기 착용 목록.
// 서버도 부위(slot)마다 하나만 기억한다 (accounts.equip: 메모리는 Map<slot>, Redis는 HSET look slot) →
// 같은 부위를 이미 입고 있으면 새 것이 그 자리를 대신한다. 미리보기도 똑같이 바꿔 끼운다.

export type Fitting = {
  /** 미리보기에 입힐 꾸미기 (부위마다 하나) */
  look: string[];
  /** 같은 부위라 벗겨지는 지금 착용품 (없으면 null) */
  replaced: ItemDef | null;
  /** 이미 입고 있는 꾸미기를 골랐다 */
  wearing: boolean;
};

/**
 * current: 지금 착용 중인 꾸미기 id (만료 제외). itemId: 상점에서 고른 아이템.
 * 꾸미기가 아니면 지금 모습 그대로 돌려준다.
 */
export function fittingLook(current: readonly string[], itemId: string | null): Fitting {
  const look = sanitizeLook([...current]);
  const item = itemId ? itemById(itemId) : undefined;
  if (!item || item.kind !== "cosmetic" || !item.slot) return { look, replaced: null, wearing: false };
  if (look.includes(item.id)) return { look, replaced: null, wearing: true };
  const replacedId = look.find((id) => itemById(id)?.slot === item.slot);
  return {
    look: [...look.filter((id) => id !== replacedId), item.id],
    replaced: replacedId ? (itemById(replacedId) ?? null) : null,
    wearing: false,
  };
}

/** 미리보기 방향 (옆모습은 오른쪽을 본다) */
export const FITTING_VIEWS: readonly { dir: DirId; label: string }[] = [
  { dir: DIR.down, label: "앞" },
  { dir: DIR.right, label: "옆" },
  { dir: DIR.up, label: "뒤" },
];

/** 화살표 키로 돌리기: 앞 → 옆 → 뒤 → 앞 (step = ±1) */
export function rotateView(dir: DirId, step: number): DirId {
  const i = Math.max(
    0,
    FITTING_VIEWS.findIndex((v) => v.dir === dir),
  );
  const n = FITTING_VIEWS.length;
  return FITTING_VIEWS[(((i + step) % n) + n) % n].dir;
}
