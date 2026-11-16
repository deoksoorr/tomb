// 키 안내 문구를 기기에 맞춘다. 데스크톱은 키 이름("E", "Space"), 터치는 화면 버튼 이름("[상호작용]", "[점프]").
// 터치 판정은 GameShell이 MobileControls(화면 버튼)를 띄우는 기준과 같은 "(pointer: coarse)"다.
// 그래서 터치 화면이 달린 노트북처럼 마우스·키보드가 주 입력인 기기에는 키 안내가 그대로 나온다.

/** 안내에 쓰는 키. 터치에서는 같은 일을 하는 화면 버튼으로 바뀐다 */
export type HintKey = "E" | "Space" | "X";

/** 터치 기기에서 키 대신 누르는 화면 버튼 (MobileControls 글자와 같다) */
const TOUCH_BUTTON: Record<HintKey, string> = {
  E: "[상호작용]",
  Space: "[점프]",
  X: "[앉기]",
};

let coarse: MediaQueryList | null = null;

/**
 * 화면 버튼(MobileControls)을 쓰는 터치 기기인지. 서버 렌더·테스트(window 없음)에서는 false.
 * 매 프레임 불러도 되게 MediaQueryList 하나를 만들어 두고 그 값을 읽는다 (값은 기기 설정이 바뀌면 따라 바뀐다)
 */
export function isTouchUi(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  coarse ??= window.matchMedia("(pointer: coarse)");
  return coarse.matches;
}

/** 문장 속 키 이름: 데스크톱 "E", 터치 "[상호작용]" */
export function keyName(key: HintKey, touch = isTouchUi()): string {
  return touch ? TOUCH_BUTTON[key] : key;
}

/**
 * 문장 속 "키 + 조사". 데스크톱 "E를" / "E로" (E·Space·X는 읽으면 모음으로 끝난다),
 * 터치 "[상호작용] 버튼을" / "[상호작용] 버튼으로" — 처음 보는 사람도 화면 버튼인 줄 알게 "버튼"을 붙인다
 */
export function keyJosa(key: HintKey, josa: "를" | "로", touch = isTouchUi()): string {
  if (touch) return `${TOUCH_BUTTON[key]} 버튼${josa === "를" ? "을" : "으로"}`;
  return key + josa;
}

/**
 * 떠 있는 상호작용 안내의 앞머리: 데스크톱 "E "(→ "E 잠수"), 터치는 빈 문자열(→ "잠수").
 * 터치는 [상호작용] 버튼이 늘 같은 자리에 있어서 동작 이름만 보여도 충분하다.
 */
export function interactPrefix(touch = isTouchUi()): string {
  return touch ? "" : "E ";
}

/** 떠 있는 UI 라벨 "E · 둘러보기" (터치는 "둘러보기") */
export function interactLabel(action: string, touch = isTouchUi()): string {
  return touch ? action : `E · ${action}`;
}
