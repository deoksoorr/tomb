import { skillById, type BranchId, type SkillId } from "@/lib/rpg/catalog";

// 스킬 창의 "선택" 규칙을 한곳에 모은 순수 로직. 선택 상태는 트리에서 고른 스킬 하나뿐이다.
// (단축 칸이 따로 '선택된 칸'으로 남는 상태는 없다 — 칸을 누르면 넣거나, 비어 있는 선택일 때 그 칸의 스킬을 고를 뿐)
//
// ▸ 선택 (nextPick)
//   - 트리 스킬을 누름(클릭·탭·Enter·Space) → 그 스킬만 선택. 다른 스킬을 누르면 그쪽으로 옮김. 같은 걸 또 누르면 그대로.
//   - 빈 곳을 누름 · Esc → 선택 해제.
//   - 갈래 탭 → 다른 갈래로 가면 선택 해제(그 갈래 트리엔 선택한 스킬이 없으니까).
//   - 끌어다 놓은 뒤 따라온 click → 무시 (끌기는 선택을 바꾸지 않는다).
//   - 마우스 올림·Tab 포커스는 사건으로 받지 않는다 → 선택·설명이 바뀌지 않는다.
//
// ▸ 단축 칸을 누름 (slotPress) / 숫자 키 1~6 (keyPress)
//   - 선택 없음: 칸에 스킬이 있으면 그 스킬을 선택(트리·설명이 그 스킬로), 빈 칸이면 안내. 숫자 키는 안내만.
//   - 선택했지만 넣을 수 없음(패시브·안 배움): 이유 안내.
//   - 선택한 스킬이 이미 그 칸에 있음: 안내(그대로).
//   - 그 밖: 그 칸에 넣기(다른 칸에 있었으면 옮김, 칸에 있던 스킬과 자리 바꿈). 선택은 그대로 둔다.
//
// ▸ 단축 칸 테두리 (slotLook) — 딱 두 경우뿐
//   ① mine: 선택한 스킬이 들어 있는 칸 (트리 선택과 같은 금색 얇은 테)
//   ② 놓을 자리 미리보기: 선택한 스킬을 넣을 수 있을 때 마우스를 올린 칸(canPreview + CSS :hover),
//      또는 끌고 있는 스킬이 지금 위에 있는 칸(previewNow).
//   그 밖에는 어떤 칸도 강조하지 않는다.

export type PickState = { branch: BranchId; picked: SkillId | null };

export type PickEvent =
  /** 트리 스킬 노드를 눌렀다. afterDrag면 끌어다 놓은 뒤 따라온 click이라 무시한다 */
  | { type: "press"; id: SkillId; afterDrag?: boolean }
  /** 갈래 탭을 눌렀다 */
  | { type: "branch"; branch: BranchId }
  /** 빈 곳을 눌렀거나 Esc */
  | { type: "clear" };

/** 처음엔 아무것도 고르지 않는다 (고르지 않은 스킬의 칸이 켜지지 않게) */
export const initialPick = (branch: BranchId): PickState => ({ branch, picked: null });

export function nextPick(s: PickState, e: PickEvent): PickState {
  switch (e.type) {
    case "press": {
      if (e.afterDrag) return s;
      const sk = skillById(e.id);
      if (!sk || (sk.id === s.picked && sk.branch === s.branch)) return s;
      // 다른 갈래 스킬(단축 칸에서 고름)이면 그 갈래로 같이 옮긴다
      return { branch: sk.branch, picked: sk.id };
    }
    case "branch": {
      if (e.branch === s.branch) return s;
      return { branch: e.branch, picked: s.picked && skillById(s.picked)?.branch === e.branch ? s.picked : null };
    }
    case "clear":
      return s.picked === null ? s : { ...s, picked: null };
  }
}

type Slots = readonly (SkillId | null)[];

export type SlotAction =
  /** 고른 스킬을 to번 칸에 넣는다 (다른 칸에 있었으면 옮기고, 칸에 있던 스킬과 자리를 바꾼다) */
  | { do: "place"; id: SkillId; to: number }
  /** 칸의 스킬을 고른다 (선택이 없을 때만) */
  | { do: "select"; id: SkillId }
  /** 안내만: empty 빈 칸(고른 스킬 없음) · pickFirst 숫자 키(고른 스킬 없음) · blocked 넣을 수 없는 스킬 · already 이미 그 칸 */
  | { do: "hint"; why: "empty" | "pickFirst" | "blocked" | "already" }
  /** 아무것도 안 함 (끌어다 놓은 뒤 따라온 click) */
  | { do: "none" };

/**
 * 단축 칸을 눌렀을 때 할 일.
 * @param placeable 고른 스킬을 단축 칸에 넣을 수 있는가 (배운 액티브)
 */
export function slotPress(picked: SkillId | null, placeable: boolean, hotbar: Slots, i: number, afterDrag = false): SlotAction {
  if (afterDrag) return { do: "none" };
  if (picked === null) {
    const there = hotbar[i];
    return there ? { do: "select", id: there } : { do: "hint", why: "empty" };
  }
  return putPicked(picked, placeable, hotbar, i);
}

/** 숫자 키 n(1~6)을 눌렀을 때 할 일. 선택이 없으면 칸의 스킬을 고르지 않고 안내만 한다 */
export function keyPress(picked: SkillId | null, placeable: boolean, hotbar: Slots, n: number): SlotAction {
  if (picked === null) return { do: "hint", why: "pickFirst" };
  return putPicked(picked, placeable, hotbar, n - 1);
}

function putPicked(picked: SkillId, placeable: boolean, hotbar: Slots, i: number): SlotAction {
  if (!placeable) return { do: "hint", why: "blocked" };
  if (hotbar[i] === picked) return { do: "hint", why: "already" };
  return { do: "place", id: picked, to: i };
}

export type SlotLook = {
  /** ① 고른 스킬이 들어 있는 칸 */
  mine: boolean;
  /** ② 마우스를 올리면 '여기 놓기' 미리보기를 보여도 되는 칸 (실제 표시는 CSS :hover) */
  canPreview: boolean;
  /** ② 끌고 있는 스킬이 지금 이 칸 위에 있다 → 미리보기 */
  previewNow: boolean;
};

/** 단축 칸 i의 테두리. drag는 끌고 있을 때만 (from: 끌기 시작한 칸, 트리 노드면 null), over는 포인터 아래 칸 */
export function slotLook(
  i: number,
  hotbar: Slots,
  picked: SkillId | null,
  placeable: boolean,
  drag: { from: number | null } | null,
  over: number | null,
): SlotLook {
  const mine = picked !== null && hotbar[i] === picked;
  return {
    mine,
    canPreview: !drag && picked !== null && placeable && !mine,
    previewNow: !!drag && over === i && drag.from !== i,
  };
}
