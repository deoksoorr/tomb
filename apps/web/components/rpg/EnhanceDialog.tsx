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
  type InheritFrom,
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
  sgName,
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
  hp: "체력",
  sp: "SP",
  str: "STR",
  agi: "AGI",
  vit: "VIT",
  int: "INT",
  dex: "DEX",
  luk: "LUK",
  aspd: "공속",
  crit: "치명",
  hit: "명중",
  flee: "회피",
  move: "이속",
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
  /** 11/19 강화 승계: 고른 재료 · 방금 받은 결과 줄 */
  const [src, setSrc] = useState<InheritFrom | null>(null);
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
    if (!src || busy) return;
    const plan = inheritPlan(view.character, src, target);
    if (!plan.ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await rpgApi.gear({
        type: "inherit",
        ...("sg" in src ? { fromSg: src.sg } : { fromPiece: src.piece }),
        ...("sg" in target ? { sg: target.sg } : "piece" in target ? { piece: target.piece } : { shop: target.shop }),
        cost: plan.cost,
      });
      if (!alive.current) return;
      onView(res);
      const r = res.gear?.inherit;
      if (r?.piece !== undefined && !("piece" in target)) setTarget({ piece: r.piece });
      setSrc(null);
      if (r) setInherited(`${r.srcName} +${r.src}의 강화를 옮겨서 +${r.from} → +${r.to}가 됐어요.`);
      playEnhance("slam", r?.to ?? 3);
      setTimeout(() => playEnhance("success", r?.to ?? 3), 200);
    } catch (x) {
      if (alive.current) setErr(errorMessage(x));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // 승계 재료 후보: 같은 부위에서 옮길 게 있는 강화 장비 (세트 장비·강화한 상점 장비)
  const worn = new Set(Object.values(view.character.equip).filter(Boolean));
  const sources: { from: InheritFrom; name: string; e: number; m: number; worn: boolean }[] = [
    ...(view.character.sg ?? []).flatMap((c) => {
      const x = decodeSg(c);
      return x ? [{ from: { sg: x.u } as InheritFrom, name: sgName(x), e: x.e, code: c }] : [];
    }),
    ...(view.character.si ?? []).flatMap((c) => {
      const p = shopPieceOf(c);
      const d = p ? gearById(p.id) : undefined;
      return p && d ? [{ from: { piece: p.u } as InheritFrom, name: d.name, e: p.e, code: c }] : [];
    }),
  ].flatMap((x) => {
    const plan = inheritPlan(view.character, x.from, target);
    return plan.ok ? [{ from: x.from, name: x.name, e: x.e, m: plan.m, worn: worn.has(x.code) }] : [];
  });
  const sameSrc = (a: InheritFrom | null, b: InheritFrom) => !!a && (("sg" in a && "sg" in b && a.sg === b.sg) || ("piece" in a && "piece" in b && a.piece === b.piece));
  const pick = src ? inheritPlan(view.character, src, target) : null;
  const ihShort = pick?.ok ? [view.points < pick.cost && "포인트", m.doc < pick.doc && "결재 서류"].filter(Boolean) : [];

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
            <p className={g.note}>
              같은 부위의 강화한 장비를 재료로 써서 더 높은 직급의 이 장비에 강화를 옮겨요. 기본 능력치가 재료보다 떨어지지 않는 단계로 옮겨지고, 재료 장비는 사라져요.{" "}
              <OddsLink section="enhance" label="승계표" />
            </p>
            {inherited && (
              <p className={g.result} data-ok role="status">
                {inherited}
              </p>
            )}
            {sources.length === 0 ? (
              <p className={g.note}>옮길 수 있는 재료가 없어요. 같은 부위에서 이 장비보다 낮은 직급의 강화 장비가 있어야 해요.</p>
            ) : (
              <div className={g.lockList} role="radiogroup" aria-label="재료 장비">
                {sources.map((x) => (
                  <label key={"sg" in x.from ? `s${x.from.sg}` : `p${x.from.piece}`}>
                    <input type="radio" name="inheritFrom" checked={sameSrc(src, x.from)} onChange={() => setSrc(x.from)} /> {x.name} +{x.e}
                    <span className={g.note}>
                      {" "}
                      → 승계 뒤 +{x.m}{x.worn ? " (장착 중)" : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {pick?.ok && (
              <>
                <div className={g.enhTop}>
                  <p className={g.levels}>
                    +{pick.cur} <span>→</span> +{pick.m}
                  </p>
                </div>
                {/* 11/19 기본 능력치가 떨어지지 않는 걸 눈으로 (재료 → 승계 뒤, 랜덤 옵션은 이 장비 것 그대로) */}
                <table className={g.inheritCmp}>
                  <thead>
                    <tr>
                      <th>기본 능력치</th>
                      <th>{pick.srcName} +{pick.src}</th>
                      <th>승계 뒤 +{pick.m}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pick.lines.map(([k, a, b]) => {
                      const [name, av] = statPair(k, a);
                      return (
                        <tr key={k}>
                          <th>{name}</th>
                          <td>{a > 0 ? av : "—"}</td>
                          <td data-up={b > a || undefined}>{b > 0 ? statPair(k, b)[1] : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className={g.costs}>
                  <span data-short={view.points < pick.cost || undefined}>
                    {pts(pick.cost)} <small className={g.note}>/ {pts(view.points)}</small>
                  </span>
                  <span data-short={m.doc < pick.doc || undefined}>
                    결재 서류 {pick.doc} <small className={g.note}>/ {m.doc}</small>
                  </span>
                </div>
                <p className={g.note}>
                  재료로 쓴 {pick.srcName} +{pick.src} 장비는 사라져요. 끼고 있었다면 그 칸에 이 장비를 대신 껴요.
                </p>
                {ihShort.length > 0 && <p className={g.note}>{josa(ihShort.join(", "), "이", "가")} 모자라요.</p>}
                <button type="button" className={cx(ui.button, ui.primary)} style={{ minHeight: 48 }} disabled={busy || ihShort.length > 0} onClick={doInherit}>
                  승계하기 · {pts(pick.cost)}
                </button>
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
