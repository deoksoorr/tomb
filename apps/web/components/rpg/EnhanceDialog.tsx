"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gearById, type GearDef } from "@/lib/rpg/catalog";
import { rpgApi } from "@/lib/rpg/client";
import {
  dropsOnFail,
  enhanceNeed,
  enhanceRate,
  ENH_FAIL_BONUS,
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
import { pts } from "./format";
import { gearGrade, sgGrade } from "./gear";
import { playEnhance } from "./enhanceSound";
import RpgIcon from "./RpgIcon";
import { OddsLink } from "../odds/OddsLayer";
import e from "./enhance.module.css";
import g from "./gearPanel.module.css";

// 11/15 강화 창: 책상 위 장비에 큰 결재 도장이 기다렸다가 쾅 — 「승인」(성공)·「반려」(실패). 높은 강화일수록 오래 숨죽인다.
// 기다리는 중에 한 번 더 누르면 바로 결과로. 옵션 굴리기(세트 장비만)도 같은 창의 다른 칸.

export type EnhanceTab = "enhance" | "reroll";

type Phase = "idle" | "charge" | "show";
type Shown = { r: EnhanceResult; kind: "ok" | "fail" | "drop" | "saved" };

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
  const [tab, setTab] = useState<EnhanceTab>("sg" in target0 ? tab0 : "enhance");
  /** 결과 직전 능력치 (숫자가 오르내리는 연출용) */
  const [before, setBefore] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [fx, setFx] = useState(0);
  const [protect, setProtect] = useState(false);
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
  const need = enhanceNeed(target, lv);
  const rate = need ? enhanceRate(need.target, f) : 0;
  const risky = dropsOnFail(lv);
  const useProt = risky && protect && m.prot > 0;
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
      protect: useProt,
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
      const kind: Shown["kind"] = r.ok ? "ok" : r.saved ? "saved" : r.dropped ? "drop" : "fail";
      setShown({ r, kind });
      setFx((x) => x + 1);
      setPhase("show");
      playEnhance("slam", r.to);
      setTimeout(() => playEnhance(kind === "ok" ? "success" : kind === "saved" ? "shield" : kind === "drop" ? "drop" : "fail", r.ok ? r.to : r.from + 1), 230);
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

  const resultLine = (s: Shown) => {
    const r = s.r;
    if (s.kind === "ok") return `성공! +${r.from} → +${r.to}`;
    if (s.kind === "saved") return `보호 문서가 막아 줬어요. +${r.to} 그대로예요.`;
    if (s.kind === "drop") return `실패해서 한 단계 내려갔어요. 다음엔 성공 확률이 ${Math.round(ENH_FAIL_BONUS * 100)}%p 올라요.`;
    return `실패했어요. 다음엔 성공 확률이 ${Math.round(ENH_FAIL_BONUS * 100)}%p 올라요.`;
  };

  const rrCost = it ? rerollCost(it.rr) : 0;
  const rrSeals = lock ? REROLL_LOCK_SEALS : 0;
  const rrShort = it ? [view.points < rrCost && "포인트", m.doc < REROLL_DOCS && "결재 서류", m.seal < rrSeals && "인감 도장"].filter(Boolean) : [];
  const newOpts = rolled ? decodeSg(rolled.after) : null;
  const oldOpts = rolled ? decodeSg(rolled.before) : null;

  return (
    <Dialog title={`${def.name}${lv ? ` +${lv}` : ""}`} onClose={onClose} fitHeight closable={phase !== "charge"}>
      <div className={g.enhance}>
        {it && (
          <div className={g.picker} role="group" aria-label="강화와 옵션">
            <button type="button" aria-pressed={tab === "enhance"} className={ui.button} onClick={() => setTab("enhance")}>
              강화
            </button>
            <button type="button" aria-pressed={tab === "reroll"} className={ui.button} disabled={phase === "charge"} onClick={() => setTab("reroll")}>
              옵션 굴리기
            </button>
          </div>
        )}

        {tab === "enhance" ? (
          <>
            <div
              key={fx}
              className={e.stage}
              data-phase={phase}
              data-hi={need && need.target >= 11 ? "" : undefined}
              data-result={phase === "show" && shown ? shown.kind : undefined}
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
                    {shown.kind === "ok" ? `+${shown.r.to} 성공!` : shown.kind === "saved" ? "막았어요" : shown.kind === "drop" ? `+${shown.r.to}` : "실패"}
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
                data-bad={shown.kind === "drop" || shown.kind === "fail" || undefined}
                role="status"
              >
                {shown.kind === "drop" ? (
                  <span className={e.tick}>
                    <s>+{shown.r.from}</s> → +{shown.r.to}
                  </span>
                ) : null}{" "}
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
                    성공 확률 {Math.round(rate * 100)}%
                    {f > 0 && (
                      <span className={g.note}>
                        {" "}
                        (연속 {f}번 실패해서 +{Math.round(f * ENH_FAIL_BONUS * 100)}%p)
                      </span>
                    )}{" "}
                    <OddsLink section="enhance" label="확률표" />
                  </p>
                </div>
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
                {risky && <p className={g.note}>실패하면 한 단계 내려가요.</p>}
                {risky && (
                  <label className={g.toggle}>
                    <input
                      type="checkbox"
                      checked={protect && m.prot > 0}
                      disabled={m.prot < 1 || phase === "charge"}
                      onChange={(x) => setProtect(x.target.checked)}
                    />
                    보호 문서 쓰기 <span className={g.note}>({m.prot}장 있어요)</span>
                  </label>
                )}
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
              <p className={g.note}>{"sg" in target ? "+15까지 다 올렸어요." : "상점 장비는 +5까지만 올릴 수 있어요."}</p>
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
