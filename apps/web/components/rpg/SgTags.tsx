import type { CSSProperties } from "react";
import { SG_GRADE_COLORS, SG_GRADE_NAMES, SG_SET_INFO, type SgGrade, type SgSet } from "@/lib/rpg/setGear";
import t from "./sgTags.module.css";

// 11/26 세트 장비 이름표·직급 꼬리표 (사냥터 장비창·강화 승계 창). [내 정보] 낀 장비(components/account/MyHunt.module.css)와 같은 그림:
// 세트 = 세트 색 글자 + 옅은 바탕, 직급 = 직급 색 테 (임원급은 금색으로 꽉 채우고 빛, 과장급은 은은한 빛, 아래 직급은 차분하게)

export function SetTag({ set }: { set: SgSet }) {
  const info = SG_SET_INFO[set];
  return (
    <span className={t.setTag} style={{ "--set": info.color } as CSSProperties}>
      {info.name}
    </span>
  );
}

export function GradeTag({ g, short }: { g: SgGrade; short?: boolean }) {
  return (
    <span className={t.grade} data-g={g} style={{ "--tone": SG_GRADE_COLORS[g] } as CSSProperties}>
      {short ? SG_GRADE_NAMES[g].replace("급", "") : SG_GRADE_NAMES[g]}
    </span>
  );
}
