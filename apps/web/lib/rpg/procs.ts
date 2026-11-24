import { CARDS, RARITY_COLOR, type CardId } from "./cards";
import { POTIONS, type IconArt } from "./catalog";
import { SG_EGG, SG_GRADE_COLORS, SG_LEGENDS, SG_SET_INFO, type SgSet } from "./setGear";

// 11/17 「발동」 표시: 언제 터졌는지가 중요한 카드·세트 장비 효과가 터지는 순간, 그 그림이 화면 오른쪽에 미끄러져 들어와 2초 떠 있다
// (components/rpg/ProcToasts). 게임은 game/rpg/procToast의 showProc 하나로만 부른다 — 여기는 무엇을 적을지 정하는 순수 함수.
//
// 발동형 카드 (lib/rpg/cards를 훑어 고른 것): 터지는 순간이 따로 있고, 자주 터지지 않는 것만
//  - 무한 야근 (쓰러지면 한 번 일어남) · 반차 (층마다 첫 공격 막기) · 연차 몰아 쓰기 (체력 30% 아래로 떨어지는 순간, 층마다) · 법인카드 (처치 8%로 5초 혜택)
// 뺀 것: 원샷 결재(공격마다 5% — 너무 자주, 몬스터 머리 위 글자로), 퇴사 각·재택근무(늘 켜진 배율), 커피 수혈(고를 때 바로), 탕비실 간식(층을 깰 때 회복 숫자로)
// 세트 장비: 연차 전설 옵션(한 판에 한 번 체력 1로 버팀) · 야근 4세트(체력 30% 아래로 떨어지는 순간) · 결재 완료 전설 옵션(우두머리가 30% 아래로 떨어지는 순간)
// 뺀 것: 결재 4세트(치명타마다), 출장 4세트(3초마다), 칼퇴(판 시작 20초), 야근 수당(처치마다)

export const PROC_CARDS = ["overtime", "halfday", "leave", "corpcard"] as const satisfies readonly CardId[];
export type ProcCardId = (typeof PROC_CARDS)[number];
export const isProcCard = (id: string): id is ProcCardId => (PROC_CARDS as readonly string[]).includes(id);

/** 세트 장비 발동 효과: 연차(전설 3) · 야근 4세트 · 결재 완료(전설 1) */
export type SgProcKind = "vacation" | "overtimeFour" | "bossLow";
export const SG_PROCS: readonly SgProcKind[] = ["vacation", "overtimeFour", "bossLow"];

export type ProcArt = { card: CardId } | { icon: IconArt };

/** 화면에 띄울 것 한 장 (같은 key가 떠 있으면 새로 띄우지 않고 그 장을 다시 2초로) */
export type ProcInfo = {
  key: string;
  name: string;
  /** 무엇이 일어났나 (짧게) */
  line: string;
  /** 남은 횟수 (있으면) */
  left?: string;
  /** 테두리 색 (0xRRGGBB) */
  color: number;
  art: ProcArt;
  /** 부활처럼 크게 (화면 가운데) */
  big?: boolean;
  /** 11/19 「발동!」 대신 쓸 말 (숨겨진 세트 효과는 「발견!」) · 떠 있는 시간 (없으면 PROC_SHOW_MS) */
  tag?: string;
  ms?: number;
};
export type ProcView = ProcInfo & { seq: number };

export const PROC_SHOW_MS = 2000;
/** 11/19 숨겨진 세트 효과 발견은 한 번뿐이라 조금 더 오래 */
export const EGG_SHOW_MS = 3500;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 발동형 카드 한 장. o: 그때의 숫자 (팀장 승진이면 더 크다) */
export function cardProc(id: ProcCardId, o: { reviveHp?: number; leaveAspd?: number; perk?: string; perkV?: number; big?: boolean } = {}): ProcInfo {
  const def = CARDS[id];
  const base = { key: `card:${id}`, name: def.name, color: RARITY_COLOR[def.rarity], art: { card: id } as ProcArt };
  switch (id) {
    case "overtime":
      return { ...base, line: `HP ${pct(o.reviveHp ?? 0.3)}로 다시 일어나요`, left: "남은 부활 0번", ...(o.big ? { big: true } : {}) };
    case "halfday":
      return { ...base, line: "이번 공격은 안 아파요", left: "다음 층에서 다시 차요" };
    case "leave":
      return { ...base, line: `3초 무적, 공격 속도 +${pct(o.leaveAspd ?? 0.5)}`, left: "다음 층에서 다시 차요" };
    case "corpcard":
      return { ...base, line: `5초 동안 ${o.perk ?? "공격력"} +${pct(o.perkV ?? 0.4)}` };
  }
}

/** 세트 장비 발동 효과. icon = 그 효과를 가진 장비 그림 (없으면 세트 무기 그림) */
export function sgProc(kind: SgProcKind, icon: IconArt, grade = 3): ProcInfo {
  const color = parseInt((SG_GRADE_COLORS[grade] ?? SG_GRADE_COLORS[3]).slice(1), 16);
  const art = { icon };
  switch (kind) {
    case "vacation":
      return { key: "sg:vacation", name: SG_LEGENDS[3].name, line: "HP 1로 버텼어요", left: "남은 횟수 0번", color, art };
    case "overtimeFour":
      return { key: "sg:overtimeFour", name: SG_SET_INFO.overtime.name, line: "공격력 +25%, 받는 피해 −15%", color: hexOf(SG_SET_INFO.overtime.color), art };
    case "bossLow":
      return { key: "sg:bossLow", name: SG_LEGENDS[1].name, line: "우두머리에게 주는 피해 +25%", color, art };
  }
}

/** 11/19 숨겨진 5세트 효과를 처음 발견한 순간 (한 번만 — 그 뒤로는 장비 창에 이름·설명이 보인다) */
export function eggProc(set: SgSet, icon: IconArt): ProcInfo {
  return {
    key: `sg:egg:${set}`,
    name: "숨겨진 세트 효과",
    tag: "발견!",
    line: `${SG_EGG[set].name} · ${SG_EGG[set].line}`,
    left: `${SG_SET_INFO[set].name} 다섯 부위`,
    color: hexOf(SG_SET_INFO[set].color),
    art: { icon },
    ms: EGG_SHOW_MS,
  };
}

/** 부활 쿠키 (카드가 아니지만 같은 표시로 — 다시 일어나는 순간) */
export function cookieProc(big = true): ProcInfo {
  const p = POTIONS.find((x) => x.id === "p_cookie");
  return {
    key: "potion:p_cookie",
    name: p?.name ?? "부활 쿠키",
    line: "HP 50%로 다시 일어나요",
    left: "한 판에 한 번이에요",
    color: 0xffe39a,
    art: { icon: p?.art ?? { shape: "cookie", main: 0xc89a5a, accent: 0x5a3e22 } },
    ...(big ? { big: true } : {}),
  };
}

function hexOf(css: string): number {
  return parseInt(css.replace("#", ""), 16) || 0xffffff;
}
