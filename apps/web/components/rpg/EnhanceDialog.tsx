"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gearById, type GearDef } from "@/lib/rpg/catalog";
import { rpgApi } from "@/lib/rpg/client";
import { chairEnhanceDiscount, chairEnhanceNote } from "@/lib/chairPerks";
import {
  ampNeed,
  enhanceChance,
  enhanceNeed,
  enhanceRate,
  ENH_AMP_MUL,
  inheritPlan,
  pityLeft,
  pityOf,
  REROLL_DOCS,
  REROLL_LOCK_SEALS,
  REROLL_MAX,
  rerollCost,
  type EnhanceResult,
  type EnhTarget,
} from "@/lib/rpg/enhance";
import {
  decodeSg,
  encodeSg,
  encodeShopPiece,
  enhSplit,
  MAT_INFO,
  optText,
  SG_LEGENDS,
  sgDef,
  sgUid,
  SHOP_ENH_MAX,
  shopPieceOf,
  type SgItem,
  type SgOpt,
} from "@/lib/rpg/setGear";
import type { RpgView } from "@/lib/rpg/types";
import { errorMessage } from "@/lib/api";
import { josa } from "@/lib/rpg/skillText";
import Dialog from "../ui/Dialog";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { pts, statPair } from "./format";
import { gearGrade, sgGrade } from "./gear";
import { playEnhance } from "./enhanceSound";
import RpgIcon from "./RpgIcon";
import { inheritEmptyHint, inheritSources, inheritTargets, pairKey, samePair, type InheritPair, type InheritSide } from "./inheritPick";
import { GradeTag, SetTag } from "./SgTags";
import { OddsLink } from "../odds/OddsLayer";
import e from "./enhance.module.css";
import g from "./gearPanel.module.css";

// 11/15 강화 창: 책상 위 장비에 큰 결재 도장이 기다렸다가 쾅 — 「승인」(성공)·「반려」(실패). 높은 강화일수록 오래 숨죽인다.
// 11/20 실패해도 단계는 그대로(하락 없음) · 강화 증폭권 체크(성공 확률 2배) · 천장(같은 단계 연속 실패 끝에 반드시 성공) 진행도.
// 기다리는 중에 한 번 더 누르면 바로 결과로. 옵션 굴리기(세트 장비만)도 같은 창의 다른 칸.

export type EnhanceTab = "enhance" | "reroll" | "inherit";

type Phase = "idle" | "charge" | "show";
type Shown = { r: EnhanceResult; kind: "ok" | "fail" };

/** 목표 강화별 기다림 (ms): +10까지 0.6초 · +11~12 1초 · +13~15 1.6초 */
export const chargeMs = (target: number) => (target >= 13 ? 1600 : target >= 11 ? 1000 : 600);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function targetInfo(
  view: RpgView,
  t: EnhTarget,
): {
  def: GearDef;
  /** 지금 장착 칸 id 꼴 코드 (능력치 계산용) · 한 단계 위 코드 */
  code: string;
  next: string | null;
  e: number;
  f: number;
  it: SgItem | null;
  color: string;
} | null {
  const c = view.character;
  if ("sg" in t) {
    const code = (c.sg ?? []).find((x) => sgUid(x) === t.sg);
    const it = code ? decodeSg(code) : null;
    return it
      ? { def: sgDef(it, code), code: code!, next: it.e < 15 ? encodeSg({ ...it, e: it.e + 1 }) : null, e: it.e, f: it.f, it, color: sgGrade(it).color }
      : null;
  }
  if ("piece" in t) {
    const code = (c.si ?? []).find((x) => shopPieceOf(x)?.u === t.piece);
    const p = code ? shopPieceOf(code) : null;
    const def = code ? gearById(code) : undefined;
    return p && def
      ? { def, code: code!, next: p.e < SHOP_ENH_MAX ? encodeShopPiece({ ...p, e: p.e + 1 }) : null, e: p.e, f: p.f, it: null, color: gearGrade(def).color }
      : null;
  }
  const def = gearById(t.shop);
  return def ? { def, code: t.shop, next: encodeShopPiece({ id: t.shop, e: 1, u: 1, f: 0 }), e: 0, f: 0, it: null, color: gearGrade(def).color } : null;
}

/** 능력치 한 줄씩: 강화 전 값 (+강화 몫) */
function statRows(code: string): { k: string; label: string; base: number; plus: number }[] {
  // 깎는 능력치(공속 −0.08 등)는 강화로 안 바뀌어서 뺀다
  return enhSplit(code, gearById)
    .filter(([, base]) => base > 0)
    .map(([k, base, plus]) => ({ k, label: STAT_NAMES[k] ?? k, base, plus }));
}
const STAT_NAMES: Record<string, string> = {
  atk: "공격력",
  def: "방어",
  hp: "HP",
  sp: "SP",
  str: "STR",
  agi: "AGI",
  vit: "VIT",
  int: "INT",
  dex: "DEX",
  luk: "LUK",
  aspd: "공격 속도",
  crit: "치명타",
  hit: "명중",
  flee: "회피",
  move: "이동 속도",
};
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const r = 60 + (i % 3) * 22;
  return {
    dx: `${Math.round(Math.cos(a) * r)}px`,
    dy: `${Math.round(Math.sin(a) * r * 0.7 - 30)}px`,
    rot: `${(i * 67) % 360}deg`,
    c: ["#ffd76a", "#fff2a8", "#4fd27a", "#f0a224"][i % 4],
  };
});

export default function EnhanceDialog({
  view,
  target: target0,
  tab: tab0 = "enhance",
  onClose,
  onView,
}: {
  view: RpgView;
  target: EnhTarget;
  tab?: EnhanceTab;
  onClose: () => void;
  onView: (v: RpgView) => void;
}) {
  // 11/15 묶음 상점 장비는 처음 강화하면 한 개가 떼어진다 → 그 뒤로는 그 한 개(번호)를 이어서 강화
  const [target, setTarget] = useState<EnhTarget>(target0);
  const [tab, setTab] = useState<EnhanceTab>("sg" in target0 || tab0 !== "reroll" ? tab0 : "enhance");
  /** 11/19 강화 승계: 고른 짝(재료 → 받는 장비) · 방금 받은 결과 줄. 11/26 이 장비로 받기 / 이 장비 강화 넘기기 · 확인 한 번 더 */
  const [pick, setPick] = useState<InheritPair | null>(null);
  const [ihRole, setIhRole] = useState<"in" | "out" | null>(null);
  const [ihConfirm, setIhConfirm] = useState(false);
  const [inherited, setInherited] = useState<string | null>(null);
  /** 결과 직전 능력치 (숫자가 오르내리는 연출용) */
  const [before, setBefore] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [fx, setFx] = useState(0);
  const [amp, setAmp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lock, setLock] = useState<SgOpt | "L" | null>(null);
  const [rolled, setRolled] = useState<{
    before: string;
    after: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const skip = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const info = targetInfo(view, target);
  if (!info) return null;
  const { def, e: lv, f, it, color, code, next } = info;
  const m = { doc: 0, seal: 0, prot: 0, ...view.character.mats };
  // 11/24 회장님 독대 노멀 1위·2관왕: 강화 포인트 30% 할인 (서버가 같은 값으로 — view.chair, lib/chairPerks)
  const need = enhanceNeed(target, lv, chairEnhanceDiscount(view.chair));
  const perkNote = chairEnhanceNote(view.chair);
  // 11/20 증폭권 장수·천장은 서버와 같은 표에서 (서버가 다시 계산하고, 요청에는 쓸지 말지만 보낸다)
  const ampN = need ? ampNeed(need.target) : 0;
  const left = need ? pityLeft(need.target, f) : 0;
  const sure = !!need && left === 0;
  const canAmp = ampN > 0 && !sure && m.prot >= ampN;
  const useAmp = amp && canAmp;
  const rate = need ? enhanceChance(need.target, f, useAmp).rate : 0;
  const baseRate = need ? enhanceRate(need.target) : 0;
  const pity = need ? pityOf(need.target) : 0;
  const short = need ? [view.points < need.cost && "포인트", m.doc < need.doc && "결재 서류", m.seal < need.seal && "인감 도장"].filter(Boolean) : [];

  async function enhance() {
    if (phase === "charge") {
      skip.current = true;
      return;
    }
    if (!need || short.length || busy) return;
    const ms = chargeMs(need.target);
    skip.current = false;
    setErr(null);
    setShown(null);
    setBusy(true);
    setPhase("charge");
    playEnhance("charge", need.target, ms);
    setBefore(code);
    const req = rpgApi.gear({
      type: "enhance",
      ...("sg" in target ? { sg: target.sg } : "piece" in target ? { piece: target.piece } : { shop: target.shop }),
      amp: useAmp,
      cost: need.cost,
    });
    try {
      for (let w = 0; w < ms && !skip.current; w += 40) await sleep(40);
      const res = await req;
      if (!alive.current) return;
      const r = res.gear?.enhance;
      onView(res);
      if (!r) throw new Error("강화 결과를 받지 못했어요.");
      if (r.piece !== undefined && !("piece" in target)) setTarget({ piece: r.piece });
      const kind: Shown["kind"] = r.ok ? "ok" : "fail";
      setShown({ r, kind });
      setFx((x) => x + 1);
      setPhase("show");
      playEnhance("slam", r.to);
      setTimeout(() => playEnhance(kind === "ok" ? "success" : "fail", r.ok ? r.to : r.from + 1), 230);
    } catch (x) {
      if (!alive.current) return;
      setErr(errorMessage(x));
      setPhase("idle");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function doReroll() {
    if (!it || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const before = (view.character.sg ?? []).find((x) => sgUid(x) === it.u) ?? "";
      const res = await rpgApi.gear({
        type: "reroll",
        uid: it.u,
        lock,
        cost: rerollCost(it.rr),
      });
      if (!alive.current) return;
      onView(res);
      setRolled({ before, after: res.gear?.code ?? "" });
      playEnhance("slam", 3);
      setTimeout(() => playEnhance("success", 3), 200);
    } catch (x) {
      if (alive.current) setErr(errorMessage(x));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function doInherit() {
    const p = ihPick;
    if (!p || busy) return;
    const plan = inheritPlan(view.character, p.from, p.to);
    if (!plan.ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await rpgApi.gear({
        type: "inherit",
        ...("sg" in p.from ? { fromSg: p.from.sg } : { fromPiece: p.from.piece }),
        ...("sg" in p.to ? { sg: p.to.sg } : "piece" in p.to ? { piece: p.to.piece } : { shop: p.to.shop }),
        cost: plan.cost,
      });
      if (!alive.current) return;
      onView(res);
      const r = res.gear?.inherit;
      // 창을 연 장비가 재료였으면 (사라졌으니) 받은 장비 창으로
      if (r?.piece !== undefined && !("piece" in p.to)) setTarget({ piece: r.piece });
      else if (!samePairSide(p.to, target)) setTarget(p.to);
      setPick(null);
      setIhConfirm(false);
      if (r) setInherited(`${r.srcName} +${r.src}의 강화를 옮겨서 ${r.name} 장비가 +${r.from} → +${r.to}까지 올라갔어요.`);
      playEnhance("slam", r?.to ?? 3);
      setTimeout(() => playEnhance("success", r?.to ?? 3), 200);
    } catch (x) {
      if (alive.current) setErr(errorMessage(x));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // 11/26 승계 후보: 이 장비로 받을 재료들 · 이 장비 강화를 받을 장비들 (둘 다 inheritPlan이 되는 것만 — 서버가 같은 함수로 다시 본다)
  const ihSources = tab === "inherit" ? inheritSources(view.character, target) : [];
  const ihTargets = tab === "inherit" ? inheritTargets(view.character, target) : [];
  const role = ihRole ?? (ihSources.length || !ihTargets.length ? "in" : "out");
  const ihList = role === "in" ? ihSources : ihTargets;
  const ihPick = pick ? (ihList.find((x) => samePair(pick, x)) ?? null) : null;
  const pickRole = (r: "in" | "out") => {
    setIhRole(r);
    setPick(null);
    setIhConfirm(false);
  };
  const ihShort = ihPick ? [view.points < ihPick.cost && "포인트", m.doc < ihPick.doc && "결재 서류"].filter(Boolean) : [];

  const resultLine = (s: Shown) => {
    const r = s.r;
    const used = r.amp ? ` 증폭권 ${r.amp}장을 썼어요.` : "";
    if (s.kind === "ok") return `${r.sure ? "반드시 성공!" : "성공!"} +${r.from} → +${r.to}${used}`;
    // 11/20 실패해도 단계는 그대로 (옛 서버 응답에는 pityLeft가 없다)
    const rest = r.pityLeft === undefined ? "" : r.pityLeft === 0 ? " 다음 강화는 반드시 성공해요." : ` 반드시 성공까지 ${r.pityLeft}번 남았어요.`;
    return `실패했어요. +${r.to} 그대로예요.${used}${rest}`;
  };

  const rrCost = it ? rerollCost(it.rr) : 0;
  const rrSeals = lock ? REROLL_LOCK_SEALS : 0;
  const rrShort = it ? [view.points < rrCost && "포인트", m.doc < REROLL_DOCS && "결재 서류", m.seal < rrSeals && "인감 도장"].filter(Boolean) : [];
  const newOpts = rolled ? decodeSg(rolled.after) : null;
  const oldOpts = rolled ? decodeSg(rolled.before) : null;

  return (
    <Dialog title={`${def.name}${lv ? ` +${lv}` : ""}`} onClose={onClose} fitHeight closable={phase !== "charge"}>
      <div className={g.enhance}>
        <div className={g.picker} role="group" aria-label="강화와 옵션">
          <button type="button" aria-pressed={tab === "enhance"} className={ui.button} onClick={() => setTab("enhance")}>
            강화
          </button>
          {it && (
            <button type="button" aria-pressed={tab === "reroll"} className={ui.button} disabled={phase === "charge"} onClick={() => setTab("reroll")}>
              옵션 굴리기
            </button>
          )}
          <button type="button" aria-pressed={tab === "inherit"} className={ui.button} disabled={phase === "charge"} onClick={() => setTab("inherit")}>
            강화 승계
          </button>
        </div>

        {tab === "enhance" ? (
          <>
            <div
              key={fx}
              className={e.stage}
              data-phase={phase}
              data-hi={need && need.target >= 11 ? "" : undefined}
              data-result={phase === "show" && shown ? shown.kind : undefined}
              data-amp={(phase === "charge" && useAmp) || undefined}
              style={
                {
                  "--grade": color,
                  "--charge": `${need ? chargeMs(need.target) : 600}ms`,
                } as CSSProperties
              }
              onClick={() => phase === "charge" && (skip.current = true)}
            >
              <span className={e.dim} />
              <span className={e.paper} />
              <span className={e.item}>
                <RpgIcon art={def.art} size={64} />
              </span>
              <span className={e.puff} />
              <span className={e.crack} />
              <span className={e.shield} />
              {CONFETTI.map((p, i) => (
                <span
                  key={i}
                  className={e.confetti}
                  style={
                    {
                      background: p.c,
                      "--dx": p.dx,
                      "--dy": p.dy,
                      "--rot": p.rot,
                    } as CSSProperties
                  }
                />
              ))}
              {shown && (
                <>
                  <span className={e.mark} data-kind={shown.kind === "ok" ? "ok" : "no"}>
                    {shown.kind === "ok" ? "승인" : "반려"}
                  </span>
                  <span className={e.big} data-bad={shown.kind !== "ok" || undefined}>
                    {shown.kind === "ok" ? `+${shown.r.to} 성공!` : "실패"}
                  </span>
                </>
              )}
              <span className={e.stamp} />
              {phase === "charge" && <span className={e.skip}>누르면 바로 결과</span>}
            </div>
            {phase === "show" && shown?.kind === "ok" && shown.r.to >= 15 && <span key={`f${fx}`} className={e.flash} aria-hidden="true" />}

            {shown && phase === "show" && (
              <p
                className={g.result}
                data-ok={shown.kind === "ok" || undefined}
                data-bad={shown.kind === "fail" || undefined}
                role="status"
              >
                {resultLine(shown)}
              </p>
            )}
            {shown && phase === "show" && before && shown.r.from !== shown.r.to && (
              <ul key={`t${fx}`} className={g.statRows} aria-label="바뀐 능력치">
                {statRows(code).map((r1, i) => {
                  const r0 = statRows(before)[i];
                  const d = Math.round((r1.plus - (r0?.plus ?? 0)) * 100) / 100;
                  return (
                    <li key={r1.k}>
                      <span>{r1.label}</span>
                      <b>
                        {num(r1.base)} <span className={cx(g.enhPart, d !== 0 && g.tick)}>(+{num(r1.plus)})</span>
                        <small className={d > 0 ? g.up : d < 0 ? g.down : g.note}> {d > 0 ? `▲ ${num(d)}` : d < 0 ? `▼ ${num(-d)}` : "그대로"}</small>
                      </b>
                    </li>
                  );
                })}
              </ul>
            )}

            {need ? (
              <>
                <div className={g.enhTop}>
                  <p className={g.levels}>
                    +{lv} <span>→</span> +{need.target}
                  </p>
                  <p className={g.rate}>
                    성공 확률 {rate !== baseRate && <s className={g.note}>{Math.round(baseRate * 100)}%</s>} {Math.round(rate * 100)}%{" "}
                    <OddsLink section="enhance" label="확률표" />
                  </p>
                </div>
                {/* 11/20 천장 진행도: 같은 단계에서 연속 실패가 차면 다음은 반드시 성공 */}
                {pity > 0 && (
                  <div className={e.pity} data-sure={sure || undefined}>
                    <span className={e.pityBar} aria-hidden="true">
                      <i style={{ width: `${Math.round((Math.min(f, pity) / pity) * 100)}%` }} />
                    </span>
                    <span>{sure ? "이번 강화는 반드시 성공해요." : f > 0 ? `반드시 성공까지 ${left}번 남았어요.` : `${pity}번 연속 실패하면 다음은 반드시 성공해요.`}</span>
                  </div>
                )}
                <div className={g.costs}>
                  <span data-short={view.points < need.cost || undefined}>
                    {pts(need.cost)} <small className={g.note}>/ {pts(view.points)}</small>
                  </span>
                  {need.doc > 0 && (
                    <span data-short={m.doc < need.doc || undefined}>
                      결재 서류 {need.doc} <small className={g.note}>/ {m.doc}</small>
                    </span>
                  )}
                  {need.seal > 0 && (
                    <span data-short={m.seal < need.seal || undefined}>
                      인감 도장 {need.seal} <small className={g.note}>/ {m.seal}</small>
                    </span>
                  )}
                </div>
                {perkNote && <p className={g.note}>{perkNote}</p>}
                {next && (
                  <ul className={g.statRows} aria-label="다음 강화 능력치">
                    {statRows(code).map((r0, i) => {
                      const r1 = statRows(next)[i];
                      return (
                        <li key={r0.k}>
                          <span>{r0.label}</span>
                          <b>
                            {num(r0.base)} <span className={g.enhPart}>(+{num(r0.plus)})</span> → {num(r1?.base ?? r0.base)}{" "}
                            <span className={cx(g.enhPart, g.enhNext)}>(+{num(r1?.plus ?? r0.plus)})</span>
                          </b>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {/* 11/20 강화 증폭권: 목표 단계마다 정해진 장수, 성공 확률 2배 (최대 100%). 모자라거나 반드시 성공이면 못 고른다 */}
                {ampN > 0 && (
                  <label className={cx(g.toggle, e.amp)} data-on={useAmp || undefined}>
                    <input type="checkbox" checked={useAmp} disabled={!canAmp || phase === "charge"} onChange={(x) => setAmp(x.target.checked)} />
                    <RpgIcon art={MAT_INFO.m_prot.art} size={16} />
                    <span>
                      증폭권 {ampN}장 쓰기 <span className={g.note}>({m.prot}장 있어요)</span>
                      <br />
                      <small className={g.note}>
                        {sure
                          ? "반드시 성공이라 안 써도 돼요."
                          : m.prot < ampN
                            ? `${ampN - m.prot}장 모자라요.`
                            : `성공 확률이 ${ENH_AMP_MUL}배, ${Math.round(enhanceRate(need.target, true) * 100)}%가 돼요.`}
                      </small>
                    </span>
                  </label>
                )}
                <p className={g.note}>실패해도 단계는 그대로예요.</p>
                {short.length > 0 && <p className={g.note}>{josa(short.join(", "), "이", "가")} 모자라요.</p>}
                <button
                  type="button"
                  className={cx(ui.button, ui.primary)}
                  style={{ minHeight: 48 }}
                  disabled={(busy && phase !== "charge") || short.length > 0}
                  onClick={enhance}
                >
                  {phase === "charge" ? "두근두근… (누르면 바로)" : phase === "show" ? `한 번 더 · ${pts(need.cost)}` : `강화하기 · ${pts(need.cost)}`}
                </button>
              </>
            ) : (
              <p className={g.note}>{"sg" in target ? "+15까지 다 올렸어요." : `상점 장비는 +${SHOP_ENH_MAX}까지만 올릴 수 있어요.`}</p>
            )}
          </>
        ) : tab === "inherit" ? (
          <>
            {/* 11/26 운영자 「재료템을 구하고 눌러야 하는 거지? 그 순서를 알려 줘야」: 순서 세 줄 */}
            <ol className={e.ihGuide} aria-label="승계 순서">
              <li>
                <b>①</b> 강화한 장비(재료)와, 같은 부위에서 그보다 직급이 높은 세트 장비를 함께 갖고 있어야 해요.
              </li>
              <li>
                <b>②</b> 아래 목록에서 짝을 고르면 몇 강이 되는지 보여요.
              </li>
              <li>
                <b>③</b> 포인트와 결재 서류를 내고 [승계하기]를 눌러요. 재료 장비는 사라져요.
              </li>
            </ol>
            <p className={g.note}>
              받는 장비는 기본 능력치가 재료보다 낮아지지 않는 단계까지 올라가요. <OddsLink section="enhance" label="승계표" />
            </p>
            {inherited && (
              <p className={g.result} data-ok role="status">
                {inherited}
              </p>
            )}
            {ihSources.length > 0 && ihTargets.length > 0 && (
              <div className={g.picker} role="group" aria-label="승계 방향">
                <button type="button" aria-pressed={role === "in"} className={ui.button} onClick={() => pickRole("in")}>
                  이 장비로 받기
                </button>
                <button type="button" aria-pressed={role === "out"} className={ui.button} onClick={() => pickRole("out")}>
                  이 장비 강화 넘기기
                </button>
              </div>
            )}
            {ihList.length === 0 ? (
              <div className={e.ihEmpty} role="status">
                <b>아직 승계할 짝이 없어요</b>
                {inheritEmptyHint(view.character, target).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : (
              <>
                <p className={e.ihHint}>{role === "in" ? "재료로 쓸 장비를 골라요" : "강화를 받을 장비를 골라요"}</p>
                <ul className={e.ihList} role="radiogroup" aria-label={role === "in" ? "재료 장비" : "받을 장비"}>
                  {ihList.map((p) => {
                    const side = role === "in" ? p.src : p.dst;
                    const sel = !!ihPick && samePair(ihPick, p);
                    return (
                      <li key={pairKey(p)}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          className={e.ihOpt}
                          data-sg={side.g ?? undefined}
                          style={{ "--grade": sideColor(side) } as CSSProperties}
                          onClick={() => {
                            setPick(p);
                            setIhConfirm(false);
                          }}
                        >
                          <SideIcon side={side} />
                          <span className={e.ihInfo}>
                            <span className={e.ihName}>
                              {side.name} <b>+{side.e}</b>
                            </span>
                            <span className={g.tagLine}>
                              <SideTags side={side} />
                            </span>
                          </span>
                          <span className={e.ihGet}>
                            {role === "in" ? "받으면" : "넘기면"}
                            <b>
                              +{p.cur} → +{p.m}
                            </b>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {ihPick && (
              <>
                {/* 11/26 재료 → 받는 장비를 직급 딱지·색과 함께 나란히, 강화 단계 전→후 */}
                <div className={e.ihPair}>
                  <SideCard side={ihPick.src} label="재료" step={<s>+{ihPick.src.e}</s>} note="사라져요" gone />
                  <span className={e.ihArrow} aria-hidden="true">
                    ▶
                  </span>
                  <SideCard
                    side={ihPick.dst}
                    label="받는 장비"
                    step={
                      <>
                        +{ihPick.cur} <span>→</span> <b>+{ihPick.m}</b>
                      </>
                    }
                  />
                </div>
                <p className={e.ihSteps}>
                  강화 <b>+{ihPick.src.e}</b> <span>→</span> <b className={e.ihTo}>+{ihPick.m}</b>
                  <small>
                    {" "}
                    ({sideGrade(ihPick.src)} → {sideGrade(ihPick.dst)})
                  </small>
                </p>
                {/* 기본 능력치 전→후 (랜덤 옵션은 받는 장비 것 그대로) */}
                <table className={g.inheritCmp}>
                  <thead>
                    <tr>
                      <th>기본 능력치</th>
                      <th>재료 +{ihPick.src.e}</th>
                      <th>지금 +{ihPick.cur}</th>
                      <th>승계 뒤 +{ihPick.m}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ihPick.lines.map(([k, a, now, b]) => {
                      const [name, av] = statPair(k, a);
                      return (
                        <tr key={k}>
                          <th>{name}</th>
                          <td>{a > 0 ? av : "—"}</td>
                          <td>{now > 0 ? statPair(k, now)[1] : "—"}</td>
                          <td data-up={b > now || undefined}>
                            {b > 0 ? statPair(k, b)[1] : "—"}
                            {b > now && <small> ▲{num(Math.round((b - now) * 100) / 100)}</small>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className={g.costs}>
                  <span data-short={view.points < ihPick.cost || undefined}>
                    {pts(ihPick.cost)} <small className={g.note}>/ {pts(view.points)}</small>
                  </span>
                  <span data-short={m.doc < ihPick.doc || undefined}>
                    결재 서류 {ihPick.doc} <small className={g.note}>/ {m.doc}</small>
                  </span>
                </div>
                <p className={e.ihWarn}>
                  재료 장비는 사라져요.
                  {ihPick.src.worn ? " 재료를 끼고 있던 칸에는 받은 장비를 대신 껴요." : ""}
                </p>
                {ihShort.length > 0 && <p className={g.note}>{josa(ihShort.join(", "), "이", "가")} 모자라요.</p>}
                {ihConfirm ? (
                  <div className={g.confirm} role="alert">
                    <p>
                      정말 옮길까요? 재료로 쓴 <b>{ihPick.src.name} +{ihPick.src.e}</b> 장비는 돌아오지 않아요. {ihPick.dst.name} 장비는 +{ihPick.m}까지 올라가요.
                    </p>
                    <div className={g.actions}>
                      <button type="button" className={cx(ui.button, ui.primary)} style={{ minHeight: 44 }} disabled={busy || ihShort.length > 0} onClick={doInherit}>
                        승계하기 · {pts(ihPick.cost)}
                      </button>
                      <button type="button" className={ui.button} onClick={() => setIhConfirm(false)}>
                        그만두기
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cx(ui.button, ui.primary)}
                    style={{ minHeight: 48 }}
                    disabled={busy || ihShort.length > 0}
                    onClick={() => setIhConfirm(true)}
                  >
                    승계하기 · {pts(ihPick.cost)}
                  </button>
                )}
              </>
            )}
          </>
        ) : it ? (
          <>
            <p className={g.note}>
              옵션을 새로 굴려요. 하나를 고정하면 그 옵션만 남고 나머지가 바뀌어요. 굴릴 때마다 값이 두 배로 올라요. 가장 비싸도 {pts(REROLL_MAX)}예요.
            </p>
            <div className={g.lockList} role="radiogroup" aria-label="고정할 옵션">
              <label>
                <input type="radio" name="lock" checked={lock === null} onChange={() => setLock(null)} /> 고정 안 함
              </label>
              {(newOpts ?? it).o.map(([k, v]) => (
                <label key={k} data-new={(newOpts && !oldOpts?.o.some(([a, b]) => a === k && b === v)) || undefined}>
                  <input type="radio" name="lock" checked={lock === k} onChange={() => setLock(k)} /> {optText(k, v)} 고정
                </label>
              ))}
              {(newOpts ?? it).L > 0 && (
                <label className={g.legend} data-new={(newOpts && newOpts.L !== oldOpts?.L) || undefined}>
                  <input type="radio" name="lock" checked={lock === "L"} onChange={() => setLock("L")} /> {SG_LEGENDS[(newOpts ?? it).L].name} 고정
                </label>
              )}
            </div>
            <div className={g.costs}>
              <span data-short={view.points < rrCost || undefined}>
                {pts(rrCost)} <small className={g.note}>/ {pts(view.points)}</small>
              </span>
              <span data-short={m.doc < REROLL_DOCS || undefined}>
                결재 서류 {REROLL_DOCS} <small className={g.note}>/ {m.doc}</small>
              </span>
              {rrSeals > 0 && (
                <span data-short={m.seal < rrSeals || undefined}>
                  인감 도장 {rrSeals} <small className={g.note}>/ {m.seal}</small>
                </span>
              )}
            </div>
            {rolled && newOpts && (
              <p className={g.result} data-ok role="status">
                {newOpts.o.map(([k, v]) => optText(k as SgOpt, v)).join(", ")}
                {newOpts.L ? `, ${SG_LEGENDS[newOpts.L].name}` : ""} 옵션이 붙었어요.
              </p>
            )}
            {rrShort.length > 0 && <p className={g.note}>{josa(rrShort.join(", "), "이", "가")} 모자라요.</p>}
            <button type="button" className={cx(ui.button, ui.primary)} style={{ minHeight: 48 }} disabled={busy || rrShort.length > 0} onClick={doReroll}>
              다시 굴리기 · {pts(rrCost)}
            </button>
            <p className={g.note}>지금까지 {it.rr}번 굴렸어요. 같은 옵션은 두 번 붙지 않아요.</p>
          </>
        ) : null}
        {err && (
          <p className={g.note} role="alert" style={{ color: "var(--danger)" }}>
            {err}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const samePairSide = (a: EnhTarget, b: EnhTarget) =>
  ("sg" in a && "sg" in b && a.sg === b.sg) || ("piece" in a && "piece" in b && a.piece === b.piece) || ("shop" in a && "shop" in b && a.shop === b.shop);

/** 승계 한쪽의 색 · 직급 이름 (상점 장비는 등급) */
function sideColor(side: InheritSide): string {
  if (side.g !== null) return sgGrade({ g: side.g }).color;
  const def = gearById(side.code);
  return def ? gearGrade(def).color : "var(--text)";
}
const sideGrade = (side: InheritSide) => (side.g !== null ? sgGrade({ g: side.g }).label : "상점 장비");

/** 11/26 승계 장비 아이콘 (가방 칸과 같은 직급 테·딱지) */
function SideIcon({ side }: { side: InheritSide }) {
  const def = gearById(side.code);
  return (
    <span className={g.icon} data-sg={side.g ?? undefined} style={{ "--grade": sideColor(side) } as CSSProperties}>
      {def && <RpgIcon art={def.art} size={32} />}
      {side.g !== null && (
        <span className={g.badge}>
          <GradeTag g={side.g} short />
        </span>
      )}
    </span>
  );
}

function SideTags({ side }: { side: InheritSide }) {
  return (
    <>
      {side.set && <SetTag set={side.set} />}
      {side.g !== null ? <GradeTag g={side.g} /> : <span className={g.sub}>상점 장비</span>}
      {side.worn && <span className={g.tag}>장착 중</span>}
    </>
  );
}

/** 재료 · 받는 장비 카드 (나란히) */
function SideCard({ side, label, step, note, gone }: { side: InheritSide; label: string; step: React.ReactNode; note?: string; gone?: boolean }) {
  return (
    <div className={e.ihCard} data-gone={gone || undefined} data-sg={side.g ?? undefined} style={{ "--grade": sideColor(side) } as CSSProperties}>
      <span className={e.ihLabel}>{label}</span>
      <SideIcon side={side} />
      <span className={e.ihName}>{side.name}</span>
      <span className={g.tagLine}>
        <SideTags side={side} />
      </span>
      <span className={e.ihStep}>{step}</span>
      {note && <span className={e.ihGone}>{note}</span>}
    </div>
  );
}
