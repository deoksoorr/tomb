import { ULT_SLOT } from "@/lib/rpg/hotbar";
import { SKILL_TEXT, skillStats } from "@/lib/rpg/skillText";
import { skillById, TIERS } from "@/lib/rpg/skillTree";
import type { IconArt } from "@/lib/rpg/catalog";

// 11/21 지옥 반려 화면 글자: 스킬 이름·종류 · 잃는 것 한 줄 (예고·도장·반려함이 같이 쓴다)

export type SealCard = { id: string; name: string; kind: "패시브" | "궁극기" | "액티브"; art: IconArt | null; lost: string };

const SIGNED = /^[+\-−]/;

/** lv = 내 랭크 (0이면 1로 본다), hotbar = 단축키 (액티브 칸 번호) */
export function sealCard(id: string, lv: number, hotbar: readonly (string | null)[]): SealCard {
  const def = skillById(id);
  if (!def) return { id, name: id, kind: "액티브", art: null, lost: "이 스킬을 못 써요" };
  const kind = def.kind === "passive" ? "패시브" : def.tier === TIERS ? "궁극기" : "액티브";
  let lost: string;
  if (def.kind === "passive") {
    const rows = skillStats(def, Math.max(1, lv));
    const signed = rows.filter((r) => SIGNED.test(r.value)).slice(0, 2);
    const pick = signed.length ? signed : rows.slice(0, 1);
    lost = pick.length ? `${pick.map((r) => `${r.label} ${r.value}`).join(" · ")} 효과가 사라져요` : SKILL_TEXT[def.id].summary;
  } else {
    const i = hotbar.indexOf(id);
    lost = i === ULT_SLOT ? "궁극기(F)를 못 써요" : i >= 0 ? `${i + 1}번 칸을 못 써요` : "이 스킬을 못 써요";
  }
  return { id, name: def.name, kind, art: def.art, lost };
}
