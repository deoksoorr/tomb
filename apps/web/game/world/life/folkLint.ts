import { lineText, type FolkDef } from "./folkSim";

// 11/16 바닷가·캠핑장 주민 대사 검사 (테스트용, 순수). 말머리 꼬리표("이름: …")·콜론·너무 긴 줄·딱딱한 말투를 잡는다.

/** 말풍선 한 줄 최대 글자 수 */
export const FOLK_LINE_MAX = 30;
/** 사람 말 같지 않은 표현 (안내문·기계 말투) */
const STIFF = [/입니다\b/, /하십시오/, /바랍니다/, /에 대해/, /도움이 되/, /물론이/, /기능/, /^안녕하세요/];

/** 문제 목록 (없으면 빈 배열). times = 시각을 넣는 줄을 만들어 볼 때 */
export function lintFolkLines(defs: readonly FolkDef[], times: readonly number[]): string[] {
  const bad: string[] = [];
  for (const d of defs)
    for (const l of d.lines)
      for (const now of typeof l.t === "function" ? times : [0]) {
        const t = lineText(l, now);
        const tag = `${d.id} 「${t}」`;
        if (!t.trim()) bad.push(`${tag} 빈 줄`);
        if (/[:：]/.test(t)) bad.push(`${tag} 콜론`);
        if (/^\s*[^\s]{1,10}\s*[-—]\s/.test(t)) bad.push(`${tag} 말머리`);
        if ([...t].length > FOLK_LINE_MAX) bad.push(`${tag} 너무 김`);
        if (STIFF.some((r) => r.test(t))) bad.push(`${tag} 딱딱한 말투`);
        if (/["“”]/.test(t)) bad.push(`${tag} 따옴표`);
      }
  return bad;
}
