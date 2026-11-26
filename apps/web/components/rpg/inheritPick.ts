import { gearById, KIND_LABELS, type Bonus } from "@/lib/rpg/catalog";
import { inheritPlan, type EnhTarget, type InheritFrom, type InheritLine } from "@/lib/rpg/enhance";
import { decodeSg, SG_GRADE_NAMES, sgSetOf, shopPieceOf, type SgGrade, type SgSet } from "@/lib/rpg/setGear";
import type { CharacterState } from "@/lib/rpg/types";

// 11/26 강화 승계 창 고르기 (화면 전용 — 규칙은 lib/rpg/enhance inheritPlan 그대로, 서버가 같은 함수로 다시 본다).
// 창을 연 장비가 받는 쪽이면 재료 후보를, 재료 쪽이면 받을 수 있는 장비 후보를 — 둘 다 inheritPlan이 되는 것만 보여 준다.

/** 승계 한쪽 (재료 또는 받는 장비) */
export type InheritSide = {
  /** 세트 장비 직급 (상점 장비는 null) · 세트 */
  g: SgGrade | null;
  set: SgSet | null;
  name: string;
  e: number;
  code: string;
  worn: boolean;
};
export type InheritPair = {
  from: InheritFrom;
  to: EnhTarget;
  src: InheritSide;
  dst: InheritSide;
  /** 받는 장비 원래 강화 → 승계 뒤 강화 · 재료 강화 */
  cur: number;
  m: number;
  cost: number;
  doc: number;
  /** [능력치, 재료 값, 받는 장비 지금 값, 승계 뒤 값] */
  lines: [keyof Bonus, number, number, number][];
};

type Owned = { key: string; from: InheritFrom | null; to: EnhTarget; side: InheritSide };

/** 강화할 수 있는 한 개짜리 장비 (세트 장비 · 강화한 상점 장비) */
function owned(c: CharacterState): Owned[] {
  const worn = new Set(Object.values(c.equip).filter(Boolean));
  const out: Owned[] = [];
  for (const code of c.sg ?? []) {
    const it = decodeSg(code);
    if (!it) continue;
    const def = gearById(code);
    out.push({
      key: `s${it.u}`,
      from: { sg: it.u },
      to: { sg: it.u },
      side: { g: it.g, set: sgSetOf(it), name: def?.name ?? "", e: it.e, code, worn: worn.has(code) },
    });
  }
  for (const code of c.si ?? []) {
    const p = shopPieceOf(code);
    const def = p ? gearById(p.id) : undefined;
    if (!p || !def) continue;
    out.push({ key: `p${p.u}`, from: { piece: p.u }, to: { piece: p.u }, side: { g: null, set: null, name: def.name, e: p.e, code, worn: worn.has(code) } });
  }
  return out;
}

const keyOf = (t: EnhTarget | InheritFrom) => ("sg" in t ? `s${t.sg}` : "piece" in t ? `p${t.piece}` : `b${t.shop}`);

function pairOf(c: CharacterState, a: Owned, b: Owned): InheritPair | null {
  if (!a.from) return null;
  const plan = inheritPlan(c, a.from, b.to);
  if (!plan.ok) return null;
  const now = gearById(b.side.code)?.bonus ?? {};
  return {
    from: a.from,
    to: b.to,
    src: a.side,
    dst: b.side,
    cur: plan.cur,
    m: plan.m,
    cost: plan.cost,
    doc: plan.doc,
    lines: plan.lines.map(([k, sv, av]: InheritLine) => [k, sv, Math.max(0, now[k] ?? 0), av]),
  };
}

/** 이 장비(받는 쪽)에 옮길 수 있는 재료들 (높은 강화 먼저) */
export function inheritSources(c: CharacterState, target: EnhTarget): InheritPair[] {
  const all = owned(c);
  const me = all.find((x) => x.key === keyOf(target));
  if (!me) return [];
  return all
    .filter((x) => x.key !== me.key)
    .flatMap((x) => pairOf(c, x, me) ?? [])
    .sort((a, b) => b.src.e - a.src.e || (b.src.g ?? -1) - (a.src.g ?? -1));
}

/** 이 장비(재료 쪽)의 강화를 받을 수 있는 장비들 (직급 높은 순 → 받는 단계 높은 순) */
export function inheritTargets(c: CharacterState, from: EnhTarget): InheritPair[] {
  if ("shop" in from) return [];
  const all = owned(c);
  const me = all.find((x) => x.key === keyOf(from));
  if (!me) return [];
  return all
    .filter((x) => x.key !== me.key)
    .flatMap((x) => pairOf(c, me, x) ?? [])
    .sort((a, b) => (b.dst.g ?? -1) - (a.dst.g ?? -1) || b.m - a.m || a.dst.name.localeCompare(b.dst.name, "ko"));
}

/** 같은 짝인가 */
export const samePair = (a: InheritPair | null, b: InheritPair) => !!a && keyOf(a.from) === keyOf(b.from) && keyOf(a.to) === keyOf(b.to);
export const pairKey = (p: InheritPair) => `${keyOf(p.from)}>${keyOf(p.to)}`;

/**
 * 11/26 운영자 「재료템을 구하고 눌러야 하는 거지? 그 순서를 알려 줘야」: 짝이 하나도 없을 때 무엇부터 준비하면 되는지.
 * 받기 한 줄(세트 장비만) · 넘기기 한 줄 — 규칙은 inheritPlan과 같다 (같은 부위, 더 높은 직급으로만, 상점 장비는 사원급 아래)
 */
export function inheritEmptyHint(c: CharacterState, target: EnhTarget): string[] {
  const all = owned(c);
  const me = all.find((x) => x.key === keyOf(target));
  if (!me) return ["강화하지 않은 상점 장비는 옮길 강화가 없어요. 강화해 두면 같은 부위 세트 장비로 넘길 수 있어요."];
  const kind = gearById(me.side.code)?.kind;
  const part = kind ? `${KIND_LABELS[kind]} ` : "";
  const gr = me.side.g ?? -1;
  const same = all.filter((x) => x.key !== me.key && gearById(x.side.code)?.kind === kind);
  const out: string[] = [];
  if (me.side.g !== null) {
    const lower = same.filter((x) => (x.side.g ?? -1) < gr && x.side.e > 0);
    const want = gr === 0 ? `상점 ${part}장비` : `${SG_GRADE_NAMES[gr - 1]} 이하 ${part}장비`;
    out.push(lower.length ? `받기: ${want}가 있지만 이 장비가 이미 그보다 세서 받을 단계가 없어요.` : `받기: ${want}를 강화해 두면 재료로 쓸 수 있어요.`);
  }
  if (me.side.e <= 0) out.push("넘기기: 이 장비를 먼저 강화해야 재료로 쓸 수 있어요.");
  else if (gr >= 3) out.push("넘기기: 임원급은 가장 높은 직급이라 넘길 곳이 없어요.");
  else {
    const higher = same.filter((x) => x.side.g !== null && x.side.g > gr);
    const want = `${SG_GRADE_NAMES[(gr + 1) as SgGrade]} 이상 ${part}세트 장비`;
    out.push(higher.length ? `넘기기: ${want}가 이미 그만큼 강화돼 있어서 넘길 게 없어요.` : `넘기기: ${want}를 먼저 구해야 해요.`);
  }
  return out;
}
