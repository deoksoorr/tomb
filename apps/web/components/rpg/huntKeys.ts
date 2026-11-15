import { POTIONS } from "@/lib/rpg/catalog";

// 11/15 사냥 키 목록: 판 안의 H 안내(RunHud)와 사냥터 고르기 화면의 키 줄(Panels)이 같은 목록을 쓴다.

/** PC 사냥 키 [키, 하는 일] */
export const HUNT_KEYS: readonly (readonly [string, string])[] = [
  ["WASD · 방향키", "걷기"],
  ["Space · J · 마우스 왼쪽", "기본 공격 (누르고 있으면 계속)"],
  ["1 ~ 5", "스킬"],
  ["F", "궁극기 (늘 직접)"],
  ["Shift+1~5 · 칸 우클릭", "그 칸 자동 켜기·끄기"],
  ["X", "스킬 자동 한꺼번에 켜기·끄기"],
  ...POTIONS.filter((p) => p.key).map((p) => [p.key!, p.name] as const),
  ["Esc", "멈춤"],
  ["H", "키 안내 띄우기·숨기기"],
];

/** 손가락 기기 사냥 조작 [어디, 하는 일] */
export const HUNT_TOUCH: readonly (readonly [string, string])[] = [
  ["화면 왼쪽 아무 데나", "누르고 끌면 걷기"],
  ["화면 오른쪽 · [공격]", "누르면 공격, 누르고 있으면 계속"],
  ["스킬 칸", "스킬 쓰기"],
  ["[자동] → 스킬 칸", "그 칸 자동 켜기·끄기"],
  ["왼쪽 위 '스킬 자동'", "자동 한꺼번에 켜기·끄기"],
];
