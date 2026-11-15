"use client";

import { useState, type CSSProperties } from "react";
import { dropInfo } from "@/lib/rpg/catalog";
import { rpgApi } from "@/lib/rpg/client";
import { exchangeNeed } from "@/lib/rpg/enhance";
import {
  decodeSg,
  isSgCode,
  itemOfSpec,
  optText,
  SG_GRADE_COLORS,
  SG_GRADE_NAMES,
  SG_LEGENDS,
  SG_PIECE_LABEL,
  SG_PIECES,
  SG_SET_INFO,
  SG_SETS,
  sgName,
  sgUid,
  type SgGrade,
} from "@/lib/rpg/setGear";
import type { Drop, RpgView } from "@/lib/rpg/types";
import { errorMessage } from "@/lib/api";
import { josa } from "@/lib/rpg/skillText";
import Dialog from "../ui/Dialog";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";
import g from "./gearPanel.module.css";

// 11/15 세트 장비 화면 조각: 판 결과의 세트 장비·재료 한 줄, 바꾸기 창

/** 판 결과 "주운 것" 한 칸 (세트 장비는 직급 색 테·옵션, 재료는 개수) */
export function SetDropChip({ d }: { d: Drop }) {
  const info = dropInfo(d);
  if (!info) return null;
  if (d.kind === "mat")
    return (
      <span className={s.drop}>
        <RpgIcon art={info.art} size={32} />
        <span>
          {info.name} ×{d.qty}
        </span>
        <span className={s.meta}>강화 재료</span>
      </span>
    );
  const it = isSgCode(d.id) ? (decodeSg(d.id) ?? itemOfSpec(d.id, 0)) : null;
  const color = it ? SG_GRADE_COLORS[it.g] : undefined;
  return (
    <span className={s.drop} style={color ? { borderColor: color } : undefined}>
      <RpgIcon art={info.art} size={32} />
      <span>{info.name}</span>
      {it && (
        <span className={s.meta} style={{ color }}>
          {SG_GRADE_NAMES[it.g]} · {SG_SET_INFO[SG_SETS[it.s]].name}
          {it.o.length > 0 && ` · ${it.o.map(([k, v]) => optText(k, v)).join(" · ")}`}
          {it.L ? ` · ${SG_LEGENDS[it.L].name}` : ""}
        </span>
      )}
    </span>
  );
}

/** 바꾸기: 같은 직급 3개(무기는 5개) → 고른 세트·부위 하나 (옵션은 새로 굴린다). 장착 중인 것은 고를 수 없다 */
export function ExchangeDialog({ view, onClose, onView }: { view: RpgView; onClose: () => void; onView: (v: RpgView) => void }) {
  const c = view.character;
  const worn = new Set(Object.values(c.equip).flatMap((id) => (isSgCode(id) ? [sgUid(id)] : [])));
  const items = (c.sg ?? []).flatMap((code) => {
    const it = decodeSg(code);
    return it && !worn.has(it.u) ? [it] : [];
  });
  const grades = ([0, 1, 2, 3] as SgGrade[]).filter((gr) => items.some((it) => it.g === gr));
  const [grade, setGrade] = useState<SgGrade>(grades[grades.length - 1] ?? 0);
  const [picked, setPicked] = useState<number[]>([]);
  const [set, setSet] = useState(0);
  const [piece, setPiece] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const need = exchangeNeed(piece);
  const pool = items.filter((it) => it.g === grade).sort((a, b) => a.e - b.e || a.u - b.u);
  const toggle = (u: number) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : p.length >= need ? p : [...p, u]));

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await rpgApi.gear({
        type: "exchange",
        uids: picked,
        set,
        piece,
      });
      onView(res);
      const it = res.gear?.code ? decodeSg(res.gear.code) : null;
      setMsg(it ? `${SG_GRADE_NAMES[it.g]} ${josa(sgName(it), "을", "를")} 받았어요.` : "바꿨어요.");
      setPicked([]);
    } catch (x) {
      setMsg(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="세트 장비 바꾸기" onClose={onClose} fitHeight>
      <div className={g.enhance}>
        <p className={g.note}>같은 직급 장비 3개를 내면 원하는 세트의 원하는 부위 하나로 바꿔 줘요. 무기는 5개가 들어요. 옵션은 새로 붙어요.</p>
        {grades.length === 0 ? (
          <p className={g.note}>바꿀 수 있는 세트 장비가 없어요. 장착 중인 것은 빼야 고를 수 있어요.</p>
        ) : (
          <>
            <div className={g.picker} role="group" aria-label="직급">
              {grades.map((gr) => (
                <button
                  key={gr}
                  type="button"
                  className={ui.button}
                  aria-pressed={grade === gr}
                  style={{ color: SG_GRADE_COLORS[gr] }}
                  onClick={() => {
                    setGrade(gr);
                    setPicked([]);
                  }}
                >
                  {SG_GRADE_NAMES[gr]}
                </button>
              ))}
            </div>
            <div className={g.picker} role="group" aria-label="받을 세트">
              {SG_SETS.map((st, i) => (
                <button key={st} type="button" className={ui.button} aria-pressed={set === i} onClick={() => setSet(i)}>
                  {SG_SET_INFO[st].short}
                </button>
              ))}
            </div>
            <div className={g.picker} role="group" aria-label="받을 부위">
              {SG_PIECES.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className={ui.button}
                  aria-pressed={piece === i}
                  onClick={() => {
                    setPiece(i);
                    setPicked((x) => x.slice(0, exchangeNeed(i)));
                  }}
                >
                  {SG_SET_INFO[SG_SETS[set]].pieces[p]}
                </button>
              ))}
            </div>
            <p className={g.note}>
              낼 장비를 {need}개 골라요 · {picked.length}/{need}
            </p>
            <ul className={g.list}>
              {pool.map((it) => {
                const on = picked.includes(it.u);
                return (
                  <li key={it.u} className={g.row} data-open={on || undefined} style={{ "--grade": SG_GRADE_COLORS[it.g] } as CSSProperties}>
                    <button type="button" className={g.pick} aria-pressed={on} onClick={() => toggle(it.u)}>
                      <span className={g.icon}>
                        <RpgIcon
                          art={{
                            shape: `sg:${it.s}${it.p}${it.g}`,
                            main: 0,
                            accent: 0,
                          }}
                          size={32}
                        />
                        {it.e > 0 && <span className={g.enh}>+{it.e}</span>}
                      </span>
                      <span className={g.info}>
                        <span className={g.name}>{sgName(it)}</span>
                        <span className={g.sub}>
                          {SG_SET_INFO[SG_SETS[it.s]].short} · {SG_PIECE_LABEL[SG_PIECES[it.p]]}
                          {it.e > 0 && ` · 강화 +${it.e}는 사라져요`}
                        </span>
                      </span>
                      {on && <span className={g.tag}>고름</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className={cx(ui.button, ui.primary)} style={{ minHeight: 48 }} disabled={busy || picked.length !== need} onClick={go}>
              {SG_SET_INFO[SG_SETS[set]].pieces[SG_PIECES[piece]]} 받기
            </button>
          </>
        )}
        {msg && (
          <p className={g.result} role="status">
            {msg}
          </p>
        )}
      </div>
    </Dialog>
  );
}
