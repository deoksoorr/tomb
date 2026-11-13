"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BRANCH_INFO, BRANCHES, HOTBAR_SIZE, SKILLS, skillById, TIERS, type BranchId, type SkillDef, type SkillId } from "@/lib/rpg/catalog";
import type { CharacterAction } from "@/lib/rpg/client";
import { checkLearn, spentIn, spentPoints, tierGate, tierOpen } from "@/lib/rpg/skillRules";
import {
  compareStats,
  josa,
  requirements,
  SKILL_TEXT,
  skillTypes,
  TYPE_TAG_GLYPH,
  TYPE_TAG_LABEL,
  unlocks,
  type SkillTypeTag,
} from "@/lib/rpg/skillText";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import RpgIcon from "./RpgIcon";
import { initialPick, nextPick } from "./skillPick";
import s from "./rpg.module.css";
import t from "./SkillTree.module.css";

// 스킬 트리 창: 위에 남은 포인트·초기화 비용, 갈래 탭(쓴 포인트), 가운데 트리 + 오른쪽 상세(휴대폰은 아래 시트), 맨 아래 단축 슬롯 줄.
// 단축 슬롯 놓기: 배운 액티브 노드를 슬롯으로 끌어다 놓기(마우스·터치) / 노드를 고르고 슬롯 누르기·숫자 키 1~6 /
// 슬롯끼리 끌어서 바꾸기 / 슬롯에서 밖으로 끌어내면 빼기. 사냥 화면 단축 줄과 같은 데이터(character.hotbar)다.
// 규칙(단·선행·포인트·단축 칸)은 서버가 다시 검사한다 — 화면은 보여 주기만.

type Props = {
  view: RpgView;
  busy: boolean;
  onCharacter: (a: CharacterAction, ok?: string) => void;
};

type NodeState = "locked" | "open" | "learned" | "max";
type Drag = { id: SkillId; from: number | null; x: number; y: number };

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** 트리 좌표 (viewBox 300 × TIERS*ROW) */
const ROW = 96;
const cxOf = (sk: SkillDef) => sk.col * 100 + 50;
const cyOf = (sk: SkillDef) => (sk.tier - 1) * ROW + ROW / 2;
const DRAG_START_PX = 6;

/** 유형 태그 도트 아이콘 (7×7) */
function Glyph({ tag }: { tag: SkillTypeTag }) {
  const rows = TYPE_TAG_GLYPH[tag];
  return (
    <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      {rows.flatMap((r, y) => [...r].map((ch, x) => (ch === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

const names = (ids: SkillId[], max = 3) => {
  const n = ids.map((id) => skillById(id)?.name ?? id);
  return n.length > max ? `${n.slice(0, max).join("·")} 등 ${n.length}개` : n.join("·");
};

export function SkillPanel({ view, busy, onCharacter }: Props) {
  const c = view.character;
  const budget = spentPoints(c.skills) + c.skillPoints;
  const firstBranch = (BRANCHES.find((b) => spentIn(c.skills, b) > 0) ?? "ember") as BranchId;
  // 보는 갈래 + 눌러서 고른 스킬. 설명은 고른 스킬만 따라간다 (마우스 올림·포커스로는 안 바뀜)
  const [sel, setSel] = useState(() => initialPick(firstBranch));
  const { branch, picked } = sel;
  const [confirmReset, setConfirmReset] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // 서버 응답 전에 바로 보여 줄 단축 줄 (그 사이 view가 바뀌면 버린다)
  const [pending, setPending] = useState<{ base: (SkillId | null)[]; slots: (SkillId | null)[] } | null>(null);
  const hotbar = pending && busy && pending.base === c.hotbar ? pending.slots : c.hotbar;
  const suppressClick = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const rank = (id: SkillId) => c.skills[id] ?? 0;
  const stateOf = (sk: SkillDef): NodeState => {
    const r = rank(sk.id);
    if (r >= sk.maxLevel) return "max";
    if (r > 0) return "learned";
    return checkLearn(c.skills, sk.id, Infinity) ? "locked" : "open";
  };
  const canLearn = (sk: SkillDef) => !checkLearn(c.skills, sk.id, budget);
  /** 단축 칸에 놓을 수 없는 이유 (null이면 놓을 수 있음) */
  const slotBlock = (sk: SkillDef): string | null =>
    sk.kind === "passive"
      ? `${josa(sk.name, "은", "는")} 패시브라 단축 칸에 넣지 않아요 — 배우면 늘 켜져 있어요.`
      : rank(sk.id) === 0
        ? `${josa(sk.name, "을", "를")} 먼저 배워야 단축 칸에 놓을 수 있어요.`
        : null;

  const nodes = SKILLS.filter((x) => x.branch === branch);
  const info = BRANCH_INFO[branch];
  const d = skillById(picked) ?? nodes[0];
  const dRank = rank(d.id);
  const dSlot = hotbar.indexOf(d.id);
  const why = checkLearn(c.skills, d.id, budget);
  const pickedDef = skillById(picked)!;
  const placing = slotBlock(pickedDef) ? null : pickedDef;
  const text = SKILL_TEXT[d.id];

  function place(id: SkillId, to: number | null) {
    const def = skillById(id)!;
    const block = slotBlock(def);
    if (block && to !== null) {
      setHint(block);
      return;
    }
    const next = [...hotbar];
    const from = next.indexOf(id);
    if (to === null) {
      if (from < 0) return;
      next[from] = null;
    } else {
      if (from === to) return;
      const prev = next[to];
      next[to] = id;
      if (from >= 0) next[from] = prev ?? null;
    }
    setPending({ base: c.hotbar, slots: next });
    setHint(null);
    const swapped = to !== null && from >= 0 && hotbar[to];
    onCharacter(
      { type: "hotbar", slots: next },
      to === null
        ? `${josa(def.name, "을", "를")} 단축 칸에서 뺐어요.`
        : swapped
          ? `${to + 1}번 ↔ ${from + 1}번 칸을 바꿨어요.`
          : `${josa(def.name, "을", "를")} ${to + 1}번 칸에 놓았어요.`,
    );
  }
  // 최신 값을 전역 포인터·키 처리기에서 읽는다
  const live = useRef({ busy, place });
  useEffect(() => {
    live.current = { busy, place };
  });

  // 숫자 키 1~6: 고른 스킬을 그 칸에 놓는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > HOTBAR_SIZE) return;
      e.preventDefault();
      if (live.current.busy) return;
      live.current.place(picked, n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  // ── 끌어다 놓기 (마우스·터치 공통: 포인터 이벤트) ──
  function startPointer(e: ReactPointerEvent, id: SkillId, from: number | null) {
    if (e.button !== 0 || live.current.busy) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const def = skillById(id)!;
    const block = from === null ? slotBlock(def) : null;
    let started = false;
    const slotAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-slot]");
      return el ? Number(el.dataset.slot) : null;
    };
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_START_PX) return;
        started = true;
        suppressClick.current = true;
        if (block) {
          setHint(block);
          end();
          return;
        }
      }
      ev.preventDefault();
      // 창(dialog)이 transform을 가져 fixed가 화면 기준이 아닐 수 있어서, 이 창 안 좌표로 그린다
      const box = wrapRef.current?.getBoundingClientRect();
      setDrag({ id, from, x: ev.clientX - (box?.left ?? 0), y: ev.clientY - (box?.top ?? 0) });
      setOver(slotAt(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      end();
      if (!started || block) return;
      const to = slotAt(ev.clientX, ev.clientY);
      if (to !== null) live.current.place(id, to);
      else if (from !== null) live.current.place(id, null);
    };
    const cancel = () => end();
    function end() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setDrag(null);
      setOver(null);
      // 끌고 난 뒤 따라오는 click은 무시한다
      setTimeout(() => (suppressClick.current = false), 0);
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  const pick = (b: BranchId) => setSel((p) => nextPick(p, { type: "branch", branch: b }));
  // 클릭·탭·Enter·Space(버튼 기본 동작) 모두 여기로 온다. 끌어다 놓은 뒤 따라온 click은 선택을 바꾸지 않는다
  const select = (id: SkillId) => {
    const afterDrag = suppressClick.current;
    setSel((p) => nextPick(p, { type: "press", id, afterDrag }));
    if (afterDrag) return;
    setSheet(true);
    setHint(null);
  };

  const dockHint = drag
    ? drag.from !== null
      ? "다른 칸에 놓으면 자리를 바꾸고, 줄 밖에 놓으면 단축 칸에서 빠져요."
      : `${josa(skillById(drag.id)!.name, "을", "를")} 놓을 칸 위에서 손을 떼세요.`
    : (hint ??
      (placing
        ? `${placing.name}: 칸을 누르거나 숫자 키 1~${HOTBAR_SIZE}를 누르면 바로 놓여요. 노드를 칸으로 끌어와도 돼요.`
        : slotBlock(pickedDef) && pickedDef.kind === "passive"
          ? "패시브는 배우면 늘 켜져 있어서 단축 칸이 필요 없어요."
          : "배운 액티브 스킬을 칸으로 끌어다 놓거나, 스킬을 고른 뒤 칸·숫자 키를 누르세요."));

  const resetLabel = view.respecCost > 0 ? `${view.respecCost}P` : c.respecs > 0 ? "무료" : "무료 (첫 1회)";

  return (
    <div
      ref={wrapRef}
      className={cx(s.lobby, t.wrap)}
      data-dragging={drag ? "" : undefined}
      style={{ "--br": hex(info.color), "--br-light": hex(info.light), "--br-dark": hex(info.dark) } as CSSProperties}
    >
      {c.treeNotice && (
        <div className={t.notice} role="status">
          <p>
            <b>스킬 트리가 새로 바뀌었어요.</b> 예전에 배운 스킬은 없어지고 스킬 포인트 <b>{c.skillPoints}</b>를 모두 돌려드렸어요. 세 갈래 중에서 마음에 드는 길로 다시 찍어 보세요. (첫 초기화 1회 무료는 그대로 남아 있어요)
          </p>
          <button type="button" className={cx(ui.button, ui.quiet)} disabled={busy} onClick={() => onCharacter({ type: "ackTree" })}>
            알겠어요
          </button>
        </div>
      )}

      <header className={t.top}>
        <div className={t.pointBig} aria-label={`남은 스킬 포인트 ${c.skillPoints}`}>
          <span className={t.pointLabel}>남은 스킬 포인트</span>
          <b data-zero={c.skillPoints === 0 || undefined}>{c.skillPoints}</b>
          <span className={t.pointSub}>
            쓴 포인트 {spentPoints(c.skills)} / 받은 포인트 {budget}
          </span>
        </div>
        {view.superHunter && (
          <span className={t.super} title="운영이 아닌 서버의 운영자 계정: 포인트 넉넉히 · 레벨 최대 취급 · 사냥터 모두 열림 · 초기화 무료">
            테스트 서버 슈퍼 계정
          </span>
        )}
        <div className={t.resetBox}>
          {!confirmReset ? (
            <>
              <span className={t.resetCost}>
                초기화 비용 <b>{resetLabel}</b>
                <small>{view.respecCost > 0 ? `지갑 ${view.points.toLocaleString("ko-KR")}P에서 빠져요` : "찍은 포인트를 모두 돌려받아요"}</small>
              </span>
              <button type="button" className={ui.button} disabled={busy || spentPoints(c.skills) === 0} onClick={() => setConfirmReset(true)}>
                초기화
              </button>
            </>
          ) : (
            <span className={t.confirm} role="alert">
              {view.respecCost > 0 ? `${view.respecCost}P를 내고` : "무료로"} 포인트 {spentPoints(c.skills)}를 모두 되돌릴까요? 단축 칸도 비워져요.
              <span className={t.confirmBtns}>
                <button
                  type="button"
                  className={cx(ui.button, ui.primary)}
                  disabled={busy || view.points < view.respecCost}
                  onClick={() => {
                    setConfirmReset(false);
                    onCharacter({ type: "respec", cost: view.respecCost }, `스킬을 초기화했어요. 포인트 ${spentPoints(c.skills)}를 돌려받았어요.`);
                  }}
                >
                  {view.points < view.respecCost ? "포인트가 모자라요" : "초기화"}
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirmReset(false)}>
                  취소
                </button>
              </span>
            </span>
          )}
        </div>
      </header>

      <div className={t.tabs} role="tablist" aria-label="스킬 갈래">
        {BRANCHES.map((b) => {
          const bi = BRANCH_INFO[b];
          const spent = spentIn(c.skills, b);
          return (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={b === branch}
              className={t.tab}
              style={{ "--tab": hex(bi.color), "--tab-light": hex(bi.light) } as CSSProperties}
              onClick={() => pick(b)}
            >
              <span className={t.tabName}>{bi.name}</span>
              <span className={t.tabRole}>{bi.role}</span>
              <span className={t.tabSpent}>
                <b>{spent}</b>P 씀
              </span>
              <span className={t.tabPips} aria-label={`열린 단 ${Array.from({ length: TIERS }, (_, i) => i + 1).filter((tier) => tierOpen(c.skills, b, tier)).length}/${TIERS}`}>
                {Array.from({ length: TIERS }, (_, i) => (
                  <i key={i} data-on={tierOpen(c.skills, b, i + 1) || undefined} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className={t.body}>
        <section className={t.treeCol} aria-label={`${info.name} 스킬 트리`}>
          <div className={t.tree} style={{ aspectRatio: `300 / ${TIERS * ROW}` }}>
            {Array.from({ length: TIERS }, (_, i) => {
              const tier = i + 1;
              const open = tierOpen(c.skills, branch, tier);
              return (
                <div key={tier} className={t.band} data-open={open || undefined} style={{ top: `${(i / TIERS) * 100}%`, height: `${100 / TIERS}%` }}>
                  <span>
                    {tier}단
                    {tier > 1 && (open ? " · 열림" : ` · 잠김 ${spentIn(c.skills, branch, tier)}/${tierGate(tier)}`)}
                  </span>
                </div>
              );
            })}
            <svg className={t.lines} viewBox={`0 0 300 ${TIERS * ROW}`} preserveAspectRatio="none" aria-hidden="true">
              {nodes.flatMap((sk) =>
                (sk.requires ?? []).map((r) => {
                  const from = skillById(r.id)!;
                  const met = rank(r.id) >= r.level;
                  return (
                    <g key={`${r.id}-${sk.id}`} data-met={met || undefined} data-on={(met && rank(sk.id) > 0) || undefined}>
                      <line x1={cxOf(from)} y1={cyOf(from)} x2={cxOf(sk)} y2={cyOf(sk)} vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                }),
              )}
            </svg>
            {nodes.flatMap((sk) =>
              (sk.requires ?? []).filter((r) => r.level > 1).map((r) => {
                const from = skillById(r.id)!;
                const met = rank(r.id) >= r.level;
                return (
                  <span
                    key={`need-${r.id}-${sk.id}`}
                    className={t.need}
                    data-met={met || undefined}
                    style={{ left: `${(cxOf(from) + cxOf(sk)) / 6}%`, top: `${((cyOf(from) + cyOf(sk)) / 2 / (TIERS * ROW)) * 100}%` }}
                    title={`${from.name} ${r.level}랭크 필요`}
                  >
                    {r.level}
                  </span>
                );
              }),
            )}
            {nodes.map((sk) => {
              const st = stateOf(sk);
              const r = rank(sk.id);
              const slot = hotbar.indexOf(sk.id);
              const draggable = !slotBlock(sk);
              return (
                <button
                  key={sk.id}
                  type="button"
                  className={t.node}
                  data-state={st}
                  data-passive={sk.kind === "passive" || undefined}
                  data-ult={(sk.kind === "active" && sk.tier === TIERS) || undefined}
                  data-can={(canLearn(sk) && st !== "max") || undefined}
                  data-drag={draggable || undefined}
                  data-lifted={drag?.id === sk.id || undefined}
                  aria-pressed={picked === sk.id}
                  aria-label={`${sk.name} ${r}/${sk.maxLevel}랭크${sk.kind === "passive" ? " 패시브" : ""}${st === "locked" ? " (잠김)" : ""}${slot >= 0 ? ` 단축 ${slot + 1}번` : ""}`}
                  style={{ left: `${cxOf(sk) / 3}%`, top: `${(cyOf(sk) / (TIERS * ROW)) * 100}%` }}
                  onClick={() => select(sk.id)}
                  onPointerDown={(e) => startPointer(e, sk.id, null)}
                >
                  <span className={t.icon}>
                    <RpgIcon art={sk.art} size={48} />
                    <span className={t.rank} data-full={st === "max" || undefined}>
                      {r}/{sk.maxLevel}
                    </span>
                    {slot >= 0 && (
                      <span className={t.key} aria-hidden="true">
                        {slot + 1}
                      </span>
                    )}
                  </span>
                  <span className={t.nodeName}>{sk.name}</span>
                </button>
              );
            })}
          </div>
          <p className={t.legend}>
            <i data-k="locked" /> 잠김 <i data-k="open" /> 찍을 수 있음 <i data-k="learned" /> 찍음 <i data-k="max" /> 최대 · 둥근 칸은 패시브 · 선 위 숫자는 필요한 선행 랭크(없으면 1랭크)
          </p>
          <p className={t.branchDesc}>{info.desc}</p>
        </section>

        <aside className={t.detail} data-sheet={sheet || undefined} aria-live="polite" aria-label={`${d.name} 설명`}>
          <button type="button" className={t.sheetClose} onClick={() => setSheet(false)} aria-label="설명 닫기">
            닫기 ✕
          </button>
          <div className={t.dHead}>
            <span className={t.dIcon} data-state={stateOf(d)} data-passive={d.kind === "passive" || undefined}>
              <RpgIcon art={d.art} size={48} />
            </span>
            <div className={t.dTitle}>
              <p className={t.dName}>{d.name}</p>
              <p className={t.dWhere}>
                {BRANCH_INFO[d.branch].name} · {d.tier}단
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
          <ul className={t.tags} aria-label="스킬 유형">
            {skillTypes(d).map((tag) => (
              <li key={tag} data-tag={tag}>
                <Glyph tag={tag} />
                {TYPE_TAG_LABEL[tag]}
              </li>
            ))}
          </ul>
          {why && dRank < d.maxLevel && why.code === "NO_SKILL_POINTS" && <p className={t.warn}>{why.message} 레벨이 오르면 1포인트씩 받아요.</p>}
          <div className={t.actions}>
            <button
              type="button"
              className={cx(ui.button, !why && ui.primary, t.learnBtn)}
              disabled={busy || !!why}
              onClick={() => onCharacter({ type: "learn", skill: d.id }, `${d.name} ${dRank + 1}랭크를 찍었어요.`)}
            >
              {dRank >= d.maxLevel ? "최대 랭크예요" : why && why.code !== "NO_SKILL_POINTS" ? `잠김 · ${requirements(d, c.skills).find((r) => !r.ok)?.text ?? why.message}` : dRank ? `${dRank + 1}랭크로 올리기 · 1포인트` : "배우기 · 1포인트"}
            </button>
            {d.kind === "active" && dRank > 0 && (
              <div className={t.quickSlots} role="group" aria-label={`${d.name} 단축 칸 고르기`}>
                <span>단축 칸</span>
                {Array.from({ length: HOTBAR_SIZE }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={t.quickSlot}
                    aria-pressed={dSlot === i}
                    disabled={busy}
                    onClick={() => (dSlot === i ? place(d.id, null) : place(d.id, i))}
                    title={dSlot === i ? `${i + 1}번에서 빼기` : `${i + 1}번 칸에 놓기${hotbar[i] ? ` (${skillById(hotbar[i]!)!.name}과 자리 바꿈)` : ""}`}
                  >
                    {i + 1}
                  </button>
                ))}
                {dSlot >= 0 && (
                  <button type="button" className={cx(ui.button, t.unslot)} disabled={busy} onClick={() => place(d.id, null)}>
                    빼기
                  </button>
                )}
              </div>
            )}
            {d.kind === "passive" && <p className={t.note}>패시브는 배우면 사냥 내내 늘 켜져 있어요. 단축 칸이 필요 없어요.</p>}
          </div>
          <p className={t.summary}>{text.summary}</p>

          <table className={t.stats}>
            <thead>
              <tr>
                <th scope="col">효과</th>
                {dRank === 0 ? (
                  <>
                    <th scope="col">1랭크</th>
                    {d.maxLevel > 1 && <th scope="col">최대 {d.maxLevel}랭크</th>}
                  </>
                ) : (
                  <>
                    <th scope="col">지금 {dRank}랭크</th>
                    {dRank < d.maxLevel && <th scope="col">다음 {dRank + 1}랭크</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {compareStats(d, Math.max(1, dRank), dRank === 0 ? (d.maxLevel > 1 ? d.maxLevel : null) : dRank < d.maxLevel ? dRank + 1 : null).map((row) => (
                <tr key={row.label} data-changed={row.changed || undefined}>
                  <th scope="row">{row.label}</th>
                  <td>{row.a}</td>
                  {row.b !== null && <td>{row.b}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={t.tableNote}>피해 %는 내 공격력 기준 (INT가 높으면 스킬이 더 세요) · 거리는 화면 점 단위</p>

          {text.synergy.length > 0 && (
            <div className={t.block}>
              <p className={t.blockTitle}>함께 쓰면</p>
              <ul className={t.synergy}>
                {text.synergy.map((sy) => (
                  <li key={sy.text}>
                    <span className={t.syIcons} aria-hidden="true">
                      {sy.with.slice(0, 3).map((id) => (
                        <span key={id} data-have={rank(id) > 0 || undefined}>
                          <RpgIcon art={skillById(id)!.art} size={16} />
                        </span>
                      ))}
                    </span>
                    <span>
                      <b>{josa(names(sy.with), "과", "와")} 함께 쓰면</b> {sy.text}.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(d.tier > 1 || (d.requires ?? []).length > 0 || unlocks(d.id).length > 0) && (
            <div className={t.block}>
              <p className={t.blockTitle}>배우는 조건</p>
              <ul className={t.reqs}>
                {requirements(d, c.skills).map((r) => (
                  <li key={r.text} data-ok={r.ok || undefined}>
                    {r.text} <span>({Math.min(r.have, r.need)}/{r.need})</span>
                  </li>
                ))}
                {d.tier === 1 && (d.requires ?? []).length === 0 && <li data-ok>1단 · 바로 배울 수 있어요</li>}
              </ul>
              {unlocks(d.id).length > 0 && (
                <p className={t.unlocks}>
                  다음에 열리는 스킬: {unlocks(d.id).map((u) => `${u.def.name}(${u.level}랭크)`).join(", ")}
                </p>
              )}
            </div>
          )}

          <p className={t.flavor}>“{text.flavor}”</p>

        </aside>
      </div>

      <section className={t.dock} aria-labelledby="rpg-hotbar" data-over={over !== null || undefined}>
        <div className={t.dockHead}>
          <h3 id="rpg-hotbar" className={t.dockTitle}>
            단축 스킬
          </h3>
          <span className={t.dockSub}>사냥 화면 아래 1~{HOTBAR_SIZE}번 칸과 같아요</span>
        </div>
        <p className={t.dockHint} data-warn={(!drag && !!hint) || undefined} role="status">
          {dockHint}
        </p>
        <div className={t.slots}>
          {Array.from({ length: HOTBAR_SIZE }, (_, i) => {
            const sk = skillById(hotbar[i] ?? "");
            const target = !!placing && hotbar[i] !== placing.id;
            return (
              <button
                key={i}
                type="button"
                data-slot={i}
                className={t.slot}
                data-filled={sk ? "" : undefined}
                data-target={(target && !drag) || undefined}
                data-over={over === i || undefined}
                data-lifted={(drag && drag.from === i) || undefined}
                disabled={busy}
                aria-label={
                  target
                    ? `${i + 1}번 칸에 ${placing!.name} 놓기${sk ? ` (${sk.name}과 자리 바꿈)` : ""}`
                    : sk
                      ? `${i + 1}번 칸 ${sk.name}. 누르면 설명, 끌어서 옮기기`
                      : `${i + 1}번 칸 비어 있음`
                }
                onPointerDown={(e) => sk && startPointer(e, sk.id, i)}
                onClick={() => {
                  if (suppressClick.current) return;
                  if (target) place(placing!.id, i);
                  else if (sk) select(sk.id);
                  else setHint("스킬 트리에서 배운 액티브 스킬을 골라 이 칸을 누르거나, 노드를 끌어다 놓으세요.");
                }}
              >
                <span className={t.slotNum}>{i + 1}</span>
                {sk ? <RpgIcon art={sk.art} size={32} /> : <span className={t.slotEmpty} aria-hidden="true" />}
                <span className={t.slotName}>{sk?.name ?? "비어 있음"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {drag && (
        <div className={t.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <RpgIcon art={skillById(drag.id)!.art} size={48} />
          {over !== null ? <span>{over + 1}번 칸</span> : drag.from !== null ? <span>빼기</span> : null}
        </div>
      )}
    </div>
  );
}
