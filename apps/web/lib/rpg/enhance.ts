import { gearById, type GearSlot } from "./catalog";
import { isShopGear, RpgError } from "./character";
import {
  activeSets,
  decodeSg,
  encodeSg,
  isMatId,
  isSgCode,
  itemOfSpec,
  MAT_KEY,
  MAT_MAX,
  SG_ENH_MAX,
  SG_INV_MAX,
  SG_PIECE_KIND,
  SG_PIECES,
  SG_REQ_LEVEL,
  SG_SETS,
  sgName,
  sgPieceOf,
  sgUid,
  SHOP_ENH_MAX,
  syncEquip,
  type Mats,
  type SgGrade,
  type SgItem,
  type SgOpt,
} from "./setGear";
import { rollOptions, rollSgFixed } from "./setGearRoll";
import type { CharacterState, Drop } from "./types";

// 11/15 강화·옵션 굴리기·바꾸기·분해·세트 장비 끼기 (순수 함수 — 서비스가 저장소 원자 갱신 안에서 부른다).
// 포인트는 서버가 같은 저장 명령(lib/rpg/store updatePaid) 안에서 지갑에서만 뺀다 (모은 포인트·랭킹은 그대로).
// 규칙을 어기면 RpgError (한국어 메시지).

/** 목표 강화 → 성공 확률·포인트·결재 서류·인감 도장 (index 0은 비움). 11/15 포인트는 기획 표의 약 40% (집 꾸미기 등에도 포인트를 써야 해서) — 확률·재료는 그대로 */
export const ENHANCE_TABLE: readonly {
  rate: number;
  cost: number;
  doc: number;
  seal: number;
}[] = [
  { rate: 1, cost: 0, doc: 0, seal: 0 },
  { rate: 1, cost: 40, doc: 0, seal: 0 },
  { rate: 0.95, cost: 60, doc: 0, seal: 0 },
  { rate: 0.9, cost: 80, doc: 0, seal: 0 },
  { rate: 0.85, cost: 120, doc: 0, seal: 0 },
  { rate: 0.8, cost: 160, doc: 0, seal: 0 },
  { rate: 0.75, cost: 200, doc: 5, seal: 0 },
  { rate: 0.7, cost: 260, doc: 6, seal: 0 },
  { rate: 0.65, cost: 320, doc: 7, seal: 0 },
  { rate: 0.6, cost: 400, doc: 8, seal: 0 },
  { rate: 0.55, cost: 480, doc: 10, seal: 0 },
  { rate: 0.5, cost: 560, doc: 12, seal: 1 },
  { rate: 0.45, cost: 640, doc: 14, seal: 1 },
  { rate: 0.4, cost: 720, doc: 16, seal: 2 },
  { rate: 0.33, cost: 800, doc: 18, seal: 2 },
  { rate: 0.28, cost: 880, doc: 20, seal: 3 },
];
/** 실패할 때마다 다음 성공 확률 +5%p (성공하면 처음부터) */
export const ENH_FAIL_BONUS = 0.05;
/** 이 강화부터 실패하면 한 단계 내려간다 (+11에서 +12를 노리다 실패하면 +10) — 모의 실험 표(+15 평균 93번)와 같은 규칙 */
export const ENH_DROP_FROM = 11;

export const enhanceRate = (target: number, fails: number) => Math.min(1, (ENHANCE_TABLE[target]?.rate ?? 0) + ENH_FAIL_BONUS * Math.max(0, fails));
/** 지금 강화 e에서 실패하면 내려가나 */
export const dropsOnFail = (e: number) => e >= ENH_DROP_FROM;

export type EnhTarget = { sg: number } | { shop: string };

export type EnhanceResult = {
  ok: boolean;
  name: string;
  from: number;
  to: number;
  /** 이번 시도의 성공 확률 */
  rate: number;
  dropped: boolean;
  /** 보호 문서를 써서 내려가지 않았다 (쓰기만 하고 성공했으면 false) */
  saved: boolean;
  /** 처음으로 +15에 닿았다 (칭호) */
  reached15: boolean;
  /** 이 장비가 처음 +15가 됐다 (확성기 알림 — 장비마다 한 번) */
  announce: boolean;
};

const mats = (s: CharacterState): Mats => ({
  doc: 0,
  seal: 0,
  prot: 0,
  ...s.mats,
});
const clone = (s: CharacterState): CharacterState => structuredClone(s);

function findSg(s: CharacterState, uid: number): { i: number; it: SgItem } {
  const list = s.sg ?? [];
  const i = list.findIndex((c) => sgUid(c) === uid);
  const it = i >= 0 ? decodeSg(list[i]) : null;
  if (!it) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  return { i, it };
}

const equippedUids = (s: CharacterState) => new Set(Object.values(s.equip).flatMap((id) => (isSgCode(id) ? [sgUid(id)] : [])));

/** 장착 칸·4세트 기록을 원본에 맞춘다 */
function settle(next: CharacterState): CharacterState {
  next.equip = syncEquip(next.equip, next.sg ?? [], next.enh ?? {});
  let bits = next.sgDone ?? 0;
  for (const set of activeSets(next.equip).four) bits |= 1 << SG_SETS.indexOf(set);
  next.sgDone = bits;
  return next;
}

/** 다음 강화 비용 (상점 장비는 +5까지, 세트 장비는 +15까지 — 끝이면 null) */
export function enhanceNeed(t: EnhTarget, e: number): { target: number; cost: number; doc: number; seal: number } | null {
  const max = "sg" in t ? SG_ENH_MAX : SHOP_ENH_MAX;
  if (e >= max) return null;
  const row = ENHANCE_TABLE[e + 1];
  return { target: e + 1, cost: row.cost, doc: row.doc, seal: row.seal };
}

/** 강화 대상의 지금 강화·연속 실패·이름 */
export function enhanceState(s: CharacterState, t: EnhTarget): { e: number; f: number; name: string } {
  if ("sg" in t) {
    const { it } = findSg(s, t.sg);
    return { e: it.e, f: it.f, name: sgName(it) };
  }
  if (!isShopGear(t.shop) || !(s.inv[t.shop] ?? 0)) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  return {
    e: s.enh?.[t.shop] ?? 0,
    f: s.enhF?.[t.shop] ?? 0,
    name: gearById(t.shop)!.name,
  };
}

/**
 * 강화 한 번: 성공 확률(표 + 연속 실패 × 5%p)로 굴린다. +11부터 실패하면 한 단계 내려가고, protect면 보호 문서 한 장으로 막는다.
 * 깨지는 일은 없다. 포인트(cost)는 돌려주는 값으로 서비스가 같은 저장 명령에서 뺀다
 */
export function enhance(s: CharacterState, t: EnhTarget, protect: boolean, rnd: () => number): { state: CharacterState; cost: number; result: EnhanceResult } {
  const cur = enhanceState(s, t);
  const need = enhanceNeed(t, cur.e);
  if (!need) throw new RpgError(409, "ENH_MAX", "sg" in t ? "이미 +15예요. 더는 못 올려요." : "상점 장비는 +5까지만 올릴 수 있어요.");
  const m = mats(s);
  if (m.doc < need.doc) throw new RpgError(409, "NO_MATS", `결재 서류가 ${need.doc - m.doc}장 모자라요.`);
  if (m.seal < need.seal) throw new RpgError(409, "NO_MATS", `인감 도장이 ${need.seal - m.seal}개 모자라요.`);
  const risky = dropsOnFail(cur.e);
  const useProt = protect && risky;
  if (useProt && m.prot < 1) throw new RpgError(409, "NO_MATS", "보호 문서가 없어요.");
  const rate = enhanceRate(need.target, cur.f);
  const ok = rnd() < rate;
  const e = ok ? need.target : risky && !useProt ? cur.e - 1 : cur.e;
  const f = ok ? 0 : Math.min(50, cur.f + 1);
  const next = clone(s);
  next.mats = {
    doc: m.doc - need.doc,
    seal: m.seal - need.seal,
    prot: m.prot - (useProt ? 1 : 0),
  };
  if ("sg" in t) {
    const { i, it } = findSg(s, t.sg);
    next.sg![i] = encodeSg({ ...it, e, f });
  } else {
    next.enh = { ...next.enh };
    next.enhF = { ...next.enhF };
    if (e > 0) next.enh[t.shop] = e;
    else delete next.enh[t.shop];
    if (f > 0) next.enhF[t.shop] = f;
    else delete next.enhF[t.shop];
  }
  const reached15 = e >= SG_ENH_MAX && (s.enhMax ?? 0) < SG_ENH_MAX;
  next.enhMax = Math.max(s.enhMax ?? 0, e);
  const announce = "sg" in t && e >= SG_ENH_MAX && !(s.sg15 ?? []).includes(t.sg);
  if (announce) next.sg15 = [...(s.sg15 ?? []), (t as { sg: number }).sg].slice(-SG_INV_MAX);
  return {
    state: settle(next),
    cost: need.cost,
    result: {
      ok,
      name: cur.name,
      from: cur.e,
      to: e,
      rate,
      dropped: !ok && e < cur.e,
      saved: !ok && useProt,
      reached15,
      announce,
    },
  };
}

// ── 옵션 다시 굴리기 ──

export const REROLL_BASE = 150;
export const REROLL_MAX = 2400;
export const REROLL_DOCS = 5;
export const REROLL_LOCK_SEALS = 2;
/** n번째 굴리기 비용 (0부터): 150 → 300 → 600 → 1,200 → 2,400 (상한, 다시 내려가지 않는다) */
export const rerollCost = (rr: number) => Math.min(REROLL_MAX, REROLL_BASE * 2 ** Math.min(10, rr));

/** lock: 그대로 둘 옵션 하나 (옵션 id, 전설 옵션은 "L"). 고정하면 인감 도장 2개 더 */
export function reroll(
  s: CharacterState,
  uid: number,
  lock: SgOpt | "L" | null,
  rnd: () => number,
): { state: CharacterState; cost: number; result: { code: string } } {
  const { i, it } = findSg(s, uid);
  const m = mats(s);
  const seals = lock ? REROLL_LOCK_SEALS : 0;
  if (m.doc < REROLL_DOCS) throw new RpgError(409, "NO_MATS", `결재 서류가 ${REROLL_DOCS - m.doc}장 모자라요.`);
  if (m.seal < seals) throw new RpgError(409, "NO_MATS", `인감 도장이 ${seals - m.seal}개 모자라요.`);
  if (lock === "L" && !it.L) throw new RpgError(400, "INVALID_INPUT", "고정할 전설 옵션이 없어요.");
  const keep = lock && lock !== "L" ? it.o.filter(([k]) => k === lock) : [];
  if (lock && lock !== "L" && !keep.length) throw new RpgError(400, "INVALID_INPUT", "그 옵션은 이 장비에 없어요.");
  const rolled = rollOptions(rnd, sgPieceOf(it), it.g, keep, lock === "L" ? it.L : 0);
  const next = clone(s);
  const code = encodeSg({
    ...it,
    o: rolled.o,
    L: rolled.L,
    rr: Math.min(999, it.rr + 1),
  });
  next.sg![i] = code;
  next.mats = { ...m, doc: m.doc - REROLL_DOCS, seal: m.seal - seals };
  return { state: settle(next), cost: rerollCost(it.rr), result: { code } };
}

// ── 바꾸기·분해 ──

/** 같은 직급 몇 개를 내면 원하는 세트·부위 하나로 바꿔 주나 (무기는 5개) */
export const exchangeNeed = (piece: number) => (SG_PIECES[piece] === "weapon" ? 5 : 3);
/** 분해하면 받는 재료 (직급별) */
export const DISASSEMBLE: readonly { doc: number; seal: number }[] = [
  { doc: 10, seal: 0 },
  { doc: 20, seal: 0 },
  { doc: 30, seal: 1 },
  { doc: 40, seal: 3 },
];

function takeItems(s: CharacterState, uids: readonly number[]): { rest: string[]; items: SgItem[] } {
  if (new Set(uids).size !== uids.length) throw new RpgError(400, "INVALID_INPUT", "같은 장비를 두 번 골랐어요.");
  const worn = equippedUids(s);
  const items: SgItem[] = [];
  for (const u of uids) {
    if (worn.has(u)) throw new RpgError(409, "EQUIPPED", "장착 중인 장비는 먼저 빼 주세요.");
    items.push(findSg(s, u).it);
  }
  const take = new Set(uids);
  return { rest: (s.sg ?? []).filter((c) => !take.has(sgUid(c) ?? -1)), items };
}

export function exchange(
  s: CharacterState,
  uids: readonly number[],
  set: number,
  piece: number,
  rnd: () => number,
): { state: CharacterState; result: { code: string } } {
  if (!SG_SETS[set] || !SG_PIECES[piece]) throw new RpgError(400, "INVALID_INPUT", "받을 세트와 부위를 골라 주세요.");
  const need = exchangeNeed(piece);
  if (uids.length !== need) throw new RpgError(400, "INVALID_INPUT", `${SG_PIECES[piece] === "weapon" ? "무기는" : "이 부위는"} 같은 직급 ${need}개로 바꿔요.`);
  const { rest, items } = takeItems(s, uids);
  const g = items[0].g as SgGrade;
  if (items.some((it) => it.g !== g)) throw new RpgError(400, "INVALID_INPUT", "같은 직급끼리만 바꿀 수 있어요.");
  const next = clone(s);
  const u = next.sgN ?? 1;
  const code = encodeSg({
    ...rollSgFixed(rnd, set, piece, g),
    u,
    e: 0,
    rr: 0,
    f: 0,
  });
  next.sg = [...rest, code];
  next.sgN = u + 1;
  return { state: settle(next), result: { code } };
}

export function disassemble(s: CharacterState, uids: readonly number[]): { state: CharacterState; result: { doc: number; seal: number } } {
  if (!uids.length) throw new RpgError(400, "INVALID_INPUT", "분해할 장비를 골라 주세요.");
  const { rest, items } = takeItems(s, uids);
  const got = items.reduce(
    (a, it) => ({
      doc: a.doc + DISASSEMBLE[it.g].doc,
      seal: a.seal + DISASSEMBLE[it.g].seal,
    }),
    { doc: 0, seal: 0 },
  );
  const next = clone(s);
  const m = mats(s);
  next.sg = rest;
  next.mats = {
    ...m,
    doc: Math.min(MAT_MAX, m.doc + got.doc),
    seal: Math.min(MAT_MAX, m.seal + got.seal),
  };
  return { state: settle(next), result: got };
}

// ── 끼기 ──

/** 세트 장비 끼기 (uid null이면 그 칸 비우기). 다른 칸에 낀 같은 장비는 옮긴다. level = 요구 레벨 검사 레벨 */
export function equipSg(s: CharacterState, slot: GearSlot, uid: number | null, level = s.level): CharacterState {
  const next = clone(s);
  if (uid === null) {
    next.equip[slot] = null;
    return settle(next);
  }
  const { i, it } = findSg(s, uid);
  const kind = SG_PIECE_KIND[sgPieceOf(it)];
  if (kind !== (slot === "acc1" || slot === "acc2" ? "acc" : slot)) throw new RpgError(400, "WRONG_SLOT", "그 칸에는 낄 수 없는 장비예요.");
  if (level < SG_REQ_LEVEL) throw new RpgError(409, "LEVEL_LOW", `레벨 ${SG_REQ_LEVEL}부터 낄 수 있어요.`);
  for (const k of Object.keys(next.equip) as GearSlot[]) if (k !== slot && isSgCode(next.equip[k]) && sgUid(next.equip[k]!) === uid) next.equip[k] = null;
  next.equip[slot] = (s.sg ?? [])[i];
  return settle(next);
}

// ── 상자 드롭 넣기 ──

/**
 * 판 끝: 세트 장비(새 번호)·재료를 캐릭터에 넣는다. 세트 장비 가방이 가득 차면 그 자리에서 분해해 재료로 준다 (버리지 않는다).
 * 돌려주는 drops = 실제로 받은 것 (분해한 것은 재료 줄로 바뀐다)
 */
export function grantSgDrops(s: CharacterState, drops: readonly Drop[]): { state: CharacterState; drops: Drop[] } {
  if (!drops.some((d) => d.kind === "set" || d.kind === "mat")) return { state: s, drops: [...drops] };
  const next = clone(s);
  const m = mats(next);
  next.sg = [...(next.sg ?? [])];
  let u = next.sgN ?? 1;
  const out: Drop[] = [];
  const addMat = (k: keyof Mats, n: number) => (m[k] = Math.min(MAT_MAX, m[k] + n));
  for (const d of drops) {
    if (d.kind === "mat") {
      if (isMatId(d.id) && d.qty > 0) {
        addMat(MAT_KEY[d.id], d.qty);
        out.push(d);
      }
      continue;
    }
    if (d.kind !== "set") {
      out.push(d);
      continue;
    }
    const it = itemOfSpec(d.id, u);
    if (!it) continue;
    if (next.sg.length >= SG_INV_MAX) {
      const got = DISASSEMBLE[it.g];
      addMat("doc", got.doc);
      out.push({ kind: "mat", id: "m_doc", qty: got.doc });
      if (got.seal) {
        addMat("seal", got.seal);
        out.push({ kind: "mat", id: "m_seal", qty: got.seal });
      }
      continue;
    }
    next.sg.push(encodeSg(it));
    u++;
    out.push(d);
  }
  next.sgN = u;
  next.mats = m;
  return { state: next, drops: out };
}
