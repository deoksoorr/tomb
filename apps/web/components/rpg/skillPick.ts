import { SKILLS, skillById, type BranchId, type SkillId } from "@/lib/rpg/catalog";

// 스킬 창에서 "어느 갈래를 보고, 어느 스킬 설명을 띄울지" 정하는 순수 로직.
// 설명은 눌러서(클릭·탭·Enter·Space) 고른 스킬만 따라간다.
// 마우스를 올리거나 Tab으로 포커스만 옮겨서는 바뀌지 않는다 — 그래서 그런 사건은 아예 받지 않는다.

export type PickState = { branch: BranchId; picked: SkillId };

export type PickEvent =
  /** 스킬 노드·단축 칸을 눌렀다. afterDrag면 끌어다 놓은 뒤 따라온 click이라 무시한다 */
  | { type: "press"; id: SkillId; afterDrag?: boolean }
  /** 갈래 탭을 눌렀다 */
  | { type: "branch"; branch: BranchId };

/** 갈래의 첫 스킬 */
export const firstSkillOf = (b: BranchId): SkillId => SKILLS.find((x) => x.branch === b)!.id;

export const initialPick = (branch: BranchId): PickState => ({ branch, picked: firstSkillOf(branch) });

export function nextPick(s: PickState, e: PickEvent): PickState {
  switch (e.type) {
    case "press": {
      if (e.afterDrag) return s;
      const sk = skillById(e.id);
      if (!sk || (sk.id === s.picked && sk.branch === s.branch)) return s;
      // 다른 갈래 스킬(단축 칸에서 누름)이면 그 갈래로 같이 옮긴다
      return { branch: sk.branch, picked: sk.id };
    }
    case "branch": {
      if (e.branch === s.branch) return s;
      // 고른 스킬이 그 갈래 것이 아니면 그 갈래 첫 스킬을 고른다
      return { branch: e.branch, picked: skillById(s.picked)?.branch === e.branch ? s.picked : firstSkillOf(e.branch) };
    }
  }
}
