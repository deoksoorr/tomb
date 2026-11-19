import type { Bonus } from "@/lib/rpg/catalog";

// 사냥터 UI 표기 도우미

const LABELS: [keyof Bonus, string, (v: number) => string][] = [
  ["atk", "ATK", (v) => String(v)],
  ["def", "DEF", (v) => String(v)],
  ["hp", "HP", (v) => String(v)],
  ["sp", "SP", (v) => String(v)],
  ["str", "STR", (v) => String(v)],
  ["agi", "AGI", (v) => String(v)],
  ["vit", "VIT", (v) => String(v)],
  ["int", "INT", (v) => String(v)],
  ["dex", "DEX", (v) => String(v)],
  ["luk", "LUK", (v) => String(v)],
  ["aspd", "공속", (v) => v.toFixed(2)],
  ["crit", "치명", (v) => `${v}%`],
  ["hit", "명중", (v) => String(v)],
  ["flee", "회피", (v) => String(v)],
  ["move", "이속", (v) => String(v)],
];

export function bonusText(b: Bonus): string {
  return LABELS.filter(([k]) => b[k])
    .map(([k, name, f]) => `${name} ${b[k]! > 0 ? "+" : ""}${f(b[k]!)}`)
    .join(" · ");
}

/** 능력치 하나의 이름과 값 글자 (승계 비교 줄) */
export function statPair(k: keyof Bonus, v: number): [string, string] {
  const l = LABELS.find(([key]) => key === k);
  return l ? [l[1], l[2](v)] : [String(k), String(v)];
}

export const pts = (n: number) => `${n.toLocaleString("ko-KR")}P`;

export function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
