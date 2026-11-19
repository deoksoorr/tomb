"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { CharacterAction } from "@/lib/rpg/client";
import { starLabel } from "@/lib/rpg/endgame";
import {
  checkTLearn,
  T_FX,
  T_NODES,
  T_SIDE_NAME,
  T_SIDE_ROLE,
  tPointsEarned,
  tRowOpen,
  tRowStar,
  TROW_TLEVEL,
  tSpent,
  type TAlloc,
  type TNodeDef,
  type TNodeId,
  type TSide,
} from "@/lib/rpg/transcendTree";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import RpgIcon from "./RpgIcon";
import t from "./SkillTree.module.css";

// 11/19 초월 수련 (스킬 창의 다섯째 탭): 갈래 스킬 트리(SkillTreePanel)와 같은 모양 —
// 가운데 트리(왼쪽 손끝 단련(물공) · 가운데 공통 · 오른쪽 주문 다듬기(마공), 줄은 ★55·60·70·80·90에 열림) + 오른쪽 설명(폰은 아래 시트).
// 초월 레벨마다 1포인트, 랭크마다 1포인트, 되돌리기는 무료. 규칙은 lib/rpg/transcendTree — 화면은 보여 주기만 (서버가 다시 검사).

type Props = { view: RpgView; busy: boolean; onCharacter: (a: CharacterAction, ok?: string) => void };
/** 되돌리기 확인을 어디서 열었나 (위 머리줄 / 설명 칸) */
export type TResetAsk = null | "top" | "detail";

const SIDES: TSide[] = ["phys", "common", "magic"];
const ROWS = TROW_TLEVEL.length;
/** 트리 좌표 (viewBox 300 × ROWS*ROW) — 갈래 트리와 같은 칸 크기 */
const ROW = 96;
const COL: Record<TSide, number> = { phys: 0, common: 1, magic: 2 };
const cxOf = (n: TNodeDef) => COL[n.side] * 100 + 50;
const cyOf = (n: TNodeDef) => (n.row - 1) * ROW + ROW / 2;
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** 쪽마다 색 (아이콘 색과 같은 톤): 물공 구릿빛 · 공통 금빛 · 마공 보랏빛 */
const TONE: Record<TSide, { color: number; light: number; dark: number }> = {
  phys: { color: 0xc89a62, light: 0xf2e2c0, dark: 0x5a4636 },
  common: { color: 0xe0c36a, light: 0xfff3c8, dark: 0x6a5418 },
  magic: { color: 0xb98aff, light: 0xf2ecff, dark: 0x4a2a8a },
};
const toneVars = (side: TSide) => ({ "--br": hex(TONE[side].color), "--br-light": hex(TONE[side].light), "--br-dark": hex(TONE[side].dark) }) as CSSProperties;

/** 초월 수련 탭의 금빛 톤 (스킬 창 바탕색) */
export const TRANSCEND_TONE = TONE.common;

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** 랭크별 수치 이름·모양 (T_FX가 돌려주는 값마다) */
const FX_TEXT: Record<string, { label: string; fmt: (v: number) => string }> = {
  physPct: { label: "기본 공격·일꾼 피해", fmt: (v) => `+${pct(v)}` },
  aspd: { label: "공격 속도", fmt: (v) => `+${pct(v)}` },
  crit: { label: "치명타 확률", fmt: (v) => `+${v}%` },
  dbl: { label: "두 번 맞을 확률", fmt: (v) => pct(v) },
  hpPct: { label: "최대 HP", fmt: (v) => `+${pct(v)}` },
  bossPct: { label: "우두머리 피해", fmt: (v) => `+${pct(v)}` },
  magicPct: { label: "마공 스킬 피해", fmt: (v) => `+${pct(v)}` },
  cdCut: { label: "마공 쿨타임", fmt: (v) => `−${pct(v)}` },
  spRegen: { label: "SP 차는 속도", fmt: (v) => `+${pct(v)}` },
  echo: { label: "한 번 더 나갈 확률", fmt: (v) => pct(v) },
  echoMult: { label: "한 번 더의 세기", fmt: (v) => pct(v) },
};
const fxAt = (id: TNodeId, lv: number) => Object.entries(T_FX[id](lv)) as [string, number][];

const SIDE_DESC = "손끝 단련은 기본 공격·일꾼 스킬(물공)에만, 주문 다듬기는 모닥불·서리·넋 스킬(마공)에만 붙어요. 공통은 모두에게. 랭크마다 1포인트, 되돌리기는 무료예요.";

type NodeState = "locked" | "open" | "learned" | "max";

function budgetOf(view: RpgView) {
  const tl = view.character.tLevel;
  return view.superHunter ? Math.max(tPointsEarned(tl), 50) : tPointsEarned(tl);
}
/** 남은 초월 수련 포인트 (스킬 창 탭의 "P 남음"도 같은 값) */
export const tPointsLeft = (view: RpgView) => Math.max(0, budgetOf(view) - tSpent(view.character.tSkills ?? {}));

/** 되돌리기 확인 (위 머리줄·설명 칸 공용) */
function ResetConfirm({ spent, busy, onCharacter, onDone }: { spent: number; busy: boolean; onCharacter: Props["onCharacter"]; onDone: () => void }) {
  return (
    <span className={t.confirm} role="alert">
      수련 포인트 {spent}개를 모두 돌려받을까요? 비용은 없어요.
      <span className={t.confirmBtns}>
        <button
          type="button"
          className={cx(ui.button, ui.primary)}
          disabled={busy}
          onClick={() => {
            onDone();
            onCharacter({ type: "treset" }, "초월 수련을 되돌렸어요.");
          }}
        >
          되돌리기
        </button>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={onDone}>
          취소
        </button>
      </span>
    </span>
  );
}

/** 스킬 창 맨 위 줄 (초월 수련 탭일 때): 남은 수련 포인트 · 되돌리기(무료) — 갈래 탭의 남은 스킬 포인트 · 초기화 자리 */
export function TranscendTop({ view, busy, onCharacter, ask, setAsk }: Props & { ask: TResetAsk; setAsk: (a: TResetAsk) => void }) {
  const c = view.character;
  const alloc = c.tSkills ?? {};
  const budget = budgetOf(view);
  const spent = tSpent(alloc);
  const left = Math.max(0, budget - spent);
  return (
    <header className={t.top}>
      <div className={t.pointBig} aria-label={`남은 초월 수련 포인트 ${left}`}>
        <span className={t.pointLabel}>남은 수련 포인트</span>
        <b data-zero={left === 0 || undefined}>{left}</b>
        <span className={t.pointSub}>
          {c.tLevel > 0 ? `${starLabel(c.tLevel)} · ` : ""}쓴 포인트 {spent} / 받은 포인트 {budget}
        </span>
      </div>
      <div className={t.resetBox}>
        {ask !== "top" ? (
          <>
            <span className={t.resetCost}>
              되돌리기 비용 <b>무료</b>
              <small>수련 포인트를 모두 돌려받아요</small>
            </span>
            <button type="button" className={ui.button} disabled={busy || spent === 0} onClick={() => setAsk("top")}>
              되돌리기
            </button>
          </>
        ) : (
          <ResetConfirm spent={spent} busy={busy} onCharacter={onCharacter} onDone={() => setAsk(null)} />
        )}
      </div>
    </header>
  );
}

export default function TranscendPanel({ view, busy, onCharacter, ask, setAsk }: Props & { ask: TResetAsk; setAsk: (a: TResetAsk) => void }) {
  const c = view.character;
  const tl = c.tLevel;
  const alloc: TAlloc = c.tSkills ?? {};
  const budget = budgetOf(view);
  const spent = tSpent(alloc);
  const left = Math.max(0, budget - spent);
  const [pickId, setPickId] = useState<TNodeId | null>(null);
  const [sheet, setSheet] = useState(false);
  const d = pickId ? (T_NODES.find((n) => n.id === pickId) ?? null) : null;
  const lv = (id: TNodeId) => alloc[id] ?? 0;
  const stateOf = (n: TNodeDef): NodeState => (lv(n.id) >= n.maxLevel ? "max" : lv(n.id) > 0 ? "learned" : tRowOpen(tl, n.row) ? "open" : "locked");

  const clear = () => {
    setPickId(null);
    setSheet(false);
  };
  // Esc: 고른 수련이 있으면 선택만 푼다 (창은 안 닫힘)
  useEffect(() => {
    if (!pickId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickId]);

  if (tl <= 0)
    return (
      <section className={t.trans} aria-label="초월 수련">
        <p className={t.transEmpty}>레벨 50에서 초월하면 열려요. 초월 레벨이 하나 오를 때마다 수련 포인트를 1개 받아요.</p>
      </section>
    );

  // 쪽마다 위에서 아래로 이어진 선 (선행 규칙은 없고 줄만 열리면 된다 — 같은 쪽 길을 보여 주는 선)
  const links = SIDES.flatMap((side) => {
    const col = T_NODES.filter((n) => n.side === side).sort((a, b) => a.row - b.row);
    return col.slice(1).map((n, i) => ({ from: col[i], to: n }));
  });

  const rowsText = `줄은 ★${TROW_TLEVEL.map((x) => 50 + x).join("·")}에 하나씩 열려요.`;
  const dRank = d ? lv(d.id) : 0;
  const why = d ? checkTLearn(alloc, d.id, tl, budget) : null;
  const cols = d ? (dRank === 0 ? [1, d.maxLevel > 1 ? d.maxLevel : null] : [dRank, dRank < d.maxLevel ? dRank + 1 : null]) : [];
  const rowsA = d ? fxAt(d.id, cols[0]!) : [];
  const rowsB = d && cols[1] ? fxAt(d.id, cols[1]) : null;

  return (
    <div
      className={t.body}
      // 빈 곳(버튼·설명 밖)을 누르면 선택 해제
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a, input, aside")) return;
        clear();
      }}
    >
      <section className={t.treeCol} aria-label="초월 수련 트리">
        <div className={t.tCols} aria-hidden="true">
          {SIDES.map((side) => (
            <span key={side} className={t.transHead} data-side={side}>
              <b>{T_SIDE_NAME[side]}</b>
              <small>{T_SIDE_ROLE[side]}</small>
            </span>
          ))}
        </div>
        <div className={t.tree} data-trans style={{ "--tree-ratio": `300 / ${ROWS * ROW}` } as CSSProperties}>
          {Array.from({ length: ROWS }, (_, i) => {
            const row = i + 1;
            const open = tRowOpen(tl, row);
            return (
              <div key={row} className={t.band} data-open={open || undefined} style={{ top: `${(i / ROWS) * 100}%`, height: `${100 / ROWS}%` }}>
                <span>★{tRowStar(row)}</span>
              </div>
            );
          })}
          <svg className={t.lines} viewBox={`0 0 300 ${ROWS * ROW}`} preserveAspectRatio="none" aria-hidden="true">
            {links.map(({ from, to }) => (
              <g key={`${from.id}-${to.id}`} data-met={tRowOpen(tl, to.row) || undefined} data-on={(lv(from.id) > 0 && lv(to.id) > 0) || undefined}>
                <line x1={cxOf(from)} y1={cyOf(from)} x2={cxOf(to)} y2={cyOf(to)} vectorEffect="non-scaling-stroke" />
              </g>
            ))}
          </svg>
          {T_NODES.map((n) => {
            const st = stateOf(n);
            const r = lv(n.id);
            return (
              <button
                key={n.id}
                type="button"
                className={t.node}
                data-state={st}
                data-can={!checkTLearn(alloc, n.id, tl, budget) || undefined}
                aria-pressed={pickId === n.id}
                aria-label={`${n.name} ${r}/${n.maxLevel}랭크${st === "locked" ? ` (★${tRowStar(n.row)}부터)` : ""}`}
                style={{ ...toneVars(n.side), left: `${cxOf(n) / 3}%`, top: `${(cyOf(n) / (ROWS * ROW)) * 100}%` }}
                onClick={() => {
                  setPickId(n.id);
                  setSheet(true);
                }}
              >
                <span className={t.icon}>
                  <RpgIcon art={n.art} size={48} />
                  <span className={t.rank} data-full={st === "max" || undefined}>
                    {r}/{n.maxLevel}
                  </span>
                </span>
                <span className={t.nodeName}>{n.name}</span>
              </button>
            );
          })}
        </div>
        <p className={t.legend}>
          <i data-k="locked" /> 잠김 <i data-k="open" /> 올릴 수 있음 <i data-k="learned" /> 올림 <i data-k="max" /> 최대.
          <span className={t.legendMore}>{rowsText}</span>
        </p>
        <p className={t.branchDesc}>{SIDE_DESC}</p>
      </section>

      {!d ? (
        <aside className={t.detail} data-empty aria-label="초월 수련 설명" style={toneVars("common")}>
          <p className={t.emptyTitle}>초월 수련 · 물공 · 마공</p>
          <p className={cx(t.emptyText, t.emptyDesc)}>{SIDE_DESC}</p>
          <p className={t.emptyText}>트리에서 수련을 누르면 효과와 올리기 버튼이 여기 나와요.</p>
          <p className={t.emptyText}>
            지금 {starLabel(tl)} · 남은 수련 포인트 <b className={t.tLeft}>{left}</b>. 초월 레벨이 하나 오를 때마다 1포인트를 받아요.
          </p>
          <ul className={t.reqs}>
            {Array.from({ length: ROWS }, (_, i) => (
              <li key={i} data-ok={tRowOpen(tl, i + 1) || undefined}>
                ★{tRowStar(i + 1)} 줄 {T_NODES.filter((n) => n.row === i + 1)
                  .map((n) => n.name)
                  .join("·")}
              </li>
            ))}
          </ul>
        </aside>
      ) : (
        <aside className={t.detail} data-sheet={sheet || undefined} aria-live="polite" aria-label={`${d.name} 설명`} style={toneVars(d.side)}>
          <button type="button" className={t.sheetClose} onClick={() => setSheet(false)} aria-label="설명 닫기">
            닫기 ✕
          </button>
          <div className={t.dHead}>
            <span className={t.dIcon} data-state={stateOf(d)}>
              <RpgIcon art={d.art} size={48} />
            </span>
            <div className={t.dTitle}>
              <p className={t.dName}>{d.name}</p>
              <p className={t.dWhere}>
                {T_SIDE_NAME[d.side]} · ★{tRowStar(d.row)} 줄
              </p>
              <p className={t.dRank}>
                <span className={t.pips} aria-hidden="true">
                  {Array.from({ length: d.maxLevel }, (_, i) => (
                    <i key={i} data-on={i < dRank || undefined} />
                  ))}
                </span>
                랭크 {dRank}/{d.maxLevel}
              </p>
            </div>
          </div>
          <ul className={t.tags} aria-label="수련 종류">
            <li data-tag="passive">{d.side === "phys" ? "물공" : d.side === "magic" ? "마공" : "공통"}</li>
            <li>{T_SIDE_ROLE[d.side]}</li>
            <li>늘 켜짐</li>
          </ul>
          {why && dRank < d.maxLevel && why.code === "NO_SKILL_POINTS" && <p className={t.warn}>{why.message}</p>}
          <div className={t.actions}>
            <button
              type="button"
              className={cx(ui.button, !why && ui.primary, t.learnBtn)}
              disabled={busy || !!why}
              onClick={() => onCharacter({ type: "tlearn", node: d.id }, `${d.name} ${dRank + 1}랭크를 올렸어요.`)}
            >
              {dRank >= d.maxLevel
                ? "최대 랭크예요"
                : why?.code === "TIER_LOCKED"
                  ? `잠김 · ★${tRowStar(d.row)}부터 열려요`
                  : why?.code === "NO_SKILL_POINTS"
                    ? "수련 포인트가 모자라요"
                    : dRank
                      ? `${dRank + 1}랭크로 올리기 · 1포인트`
                      : "배우기 · 1포인트"}
            </button>
            {ask === "detail" ? (
              <ResetConfirm spent={spent} busy={busy} onCharacter={onCharacter} onDone={() => setAsk(null)} />
            ) : (
              <button type="button" className={cx(ui.button, ui.quiet, t.learnBtn)} disabled={busy || spent === 0} onClick={() => setAsk("detail")}>
                전부 되돌리기 (무료)
              </button>
            )}
          </div>
          <p className={t.summary}>{d.describe(Math.max(1, dRank))}</p>

          <table className={t.stats}>
            <thead>
              <tr>
                <th scope="col">효과</th>
                <th scope="col">{dRank === 0 ? "1랭크" : `지금 ${dRank}랭크`}</th>
                {cols[1] !== null && <th scope="col">{dRank === 0 ? `최대 ${cols[1]}랭크` : `다음 ${cols[1]}랭크`}</th>}
              </tr>
            </thead>
            <tbody>
              {rowsA.map(([k, a], i) => {
                const b = rowsB ? rowsB[i][1] : null;
                const fx = FX_TEXT[k] ?? { label: k, fmt: String };
                return (
                  <tr key={k} data-changed={(b !== null && b !== a) || undefined}>
                    <th scope="row">{fx.label}</th>
                    <td>{fx.fmt(a)}</td>
                    {b !== null && <td>{fx.fmt(b)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {d.maxLevel > 1 && (
            <div className={t.block}>
              <p className={t.blockTitle}>랭크별 수치</p>
              <ol className={t.tRanks}>
                {Array.from({ length: d.maxLevel }, (_, i) => {
                  const [k, v] = fxAt(d.id, i + 1)[0];
                  return (
                    <li key={i} data-on={i < dRank || undefined} data-next={i === dRank || undefined}>
                      <span>{i + 1}</span>
                      {(FX_TEXT[k] ?? { fmt: String }).fmt(v)}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className={t.block}>
            <p className={t.blockTitle}>올리는 조건</p>
            <ul className={t.reqs}>
              <li data-ok={tRowOpen(tl, d.row) || undefined}>
                ★{tRowStar(d.row)} 줄 열림 <span>(지금 {starLabel(tl)})</span>
              </li>
              <li data-ok={(left > 0 || dRank >= d.maxLevel) || undefined}>
                수련 포인트 1개 <span>(남은 {left}개)</span>
              </li>
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
