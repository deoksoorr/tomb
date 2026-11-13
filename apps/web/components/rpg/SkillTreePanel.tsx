"use client";

import { useState, type CSSProperties } from "react";
import { BRANCH_INFO, BRANCHES, HOTBAR_SIZE, SKILLS, skillById, TIERS, type BranchId, type SkillDef, type SkillId } from "@/lib/rpg/catalog";
import type { CharacterAction } from "@/lib/rpg/client";
import { checkLearn, spentIn, spentPoints, tierGate, tierOpen } from "@/lib/rpg/skillRules";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";
import t from "./SkillTree.module.css";

// 스킬 트리 창: 갈래 탭(모닥불지기·서리 묘지기·넋 인도자) → 단(1~5)별 줄, 선행 연결선, 잠김/찍을 수 있음/찍음 색.
// 마우스를 올리거나 누르면 오른쪽(휴대폰은 아래)에 설명·다음 랭크 수치. 위에는 남은 포인트·초기화·단축키 6칸.
// 규칙(단·선행·포인트)은 서버와 같은 lib/rpg/skillRules — 화면은 보여 주기만 하고 판정은 서버가 다시 한다.

type Props = {
  view: RpgView;
  busy: boolean;
  onCharacter: (a: CharacterAction, ok?: string) => void;
};

type NodeState = "locked" | "open" | "learned" | "max";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const sec = (ms: number) => `${Math.round(ms / 100) / 10}초`;
/** 트리 좌표 (viewBox 300 × TIERS*ROW) */
const ROW = 76;
const cxOf = (sk: SkillDef) => sk.col * 100 + 50;
const cyOf = (sk: SkillDef) => (sk.tier - 1) * ROW + ROW / 2;

export function SkillPanel({ view, busy, onCharacter }: Props) {
  const c = view.character;
  const budget = spentPoints(c.skills) + c.skillPoints;
  const firstBranch = (BRANCHES.find((b) => spentIn(c.skills, b) > 0) ?? "ember") as BranchId;
  const [branch, setBranch] = useState<BranchId>(firstBranch);
  const [picked, setPicked] = useState<SkillId>(() => SKILLS.find((x) => x.branch === firstBranch)!.id);
  const [hover, setHover] = useState<SkillId | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const rank = (id: SkillId) => c.skills[id] ?? 0;
  const stateOf = (sk: SkillDef): NodeState => {
    const r = rank(sk.id);
    if (r >= sk.maxLevel) return "max";
    if (r > 0) return "learned";
    return checkLearn(c.skills, sk.id, Infinity) ? "locked" : "open";
  };
  const canLearn = (sk: SkillDef) => !checkLearn(c.skills, sk.id, budget);

  const nodes = SKILLS.filter((x) => x.branch === branch);
  const info = BRANCH_INFO[branch];
  const shownId = hover && skillById(hover)?.branch === branch ? hover : picked;
  const d = skillById(shownId) ?? nodes[0];
  const dRank = rank(d.id);
  const dSlot = c.hotbar.indexOf(d.id);
  const why = checkLearn(c.skills, d.id, budget);
  const pickedDef = skillById(picked);
  const placing = pickedDef && pickedDef.kind === "active" && rank(picked) > 0 ? pickedDef : null;

  const setKey = (id: SkillId, slot: number | null) => {
    const next = c.hotbar.map((h) => (h === id ? null : h));
    if (slot !== null) next[slot] = id;
    onCharacter({ type: "hotbar", slots: next }, slot === null ? "단축키에서 뺐어요." : `${slot + 1}번 단축키에 놓았어요.`);
  };
  const pick = (b: BranchId) => {
    setBranch(b);
    setHover(null);
    setPicked((p) => (skillById(p)?.branch === b ? p : SKILLS.find((x) => x.branch === b)!.id));
  };

  return (
    <div className={cx(s.lobby, s.skillTab, t.wrap)} style={{ "--br": hex(info.color), "--br-light": hex(info.light), "--br-dark": hex(info.dark) } as CSSProperties}>
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

      <section className={s.skHotbar} aria-labelledby="rpg-hotbar">
        <div className={t.head}>
          <h3 id="rpg-hotbar" className={s.sectionTitle}>
            스킬 트리
          </h3>
          <span className={t.pointBox} aria-label={`남은 스킬 포인트 ${c.skillPoints}`}>
            남은 포인트 <b>{c.skillPoints}</b>
          </span>
          {view.superHunter && (
            <span className={t.super} title="운영이 아닌 서버의 운영자 계정: 포인트 넉넉히 · 레벨 최대 취급 · 사냥터 모두 열림 · 초기화 무료">
              테스트 서버 슈퍼 계정
            </span>
          )}
          <span className={t.headSpacer} />
          {!confirmReset ? (
            <button type="button" className={cx(ui.button, ui.quiet)} disabled={busy || spentPoints(c.skills) === 0} onClick={() => setConfirmReset(true)}>
              초기화 {view.respecCost > 0 ? `(${view.respecCost}P)` : "(무료)"}
            </button>
          ) : (
            <span className={t.confirm}>
              {view.respecCost > 0 ? `${view.respecCost}P를 내고` : "무료로"} 모두 되돌릴까요?
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                disabled={busy}
                onClick={() => {
                  setConfirmReset(false);
                  onCharacter({ type: "respec", cost: view.respecCost }, `스킬을 초기화했어요. 포인트 ${spentPoints(c.skills)}를 돌려받았어요.`);
                }}
              >
                초기화
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirmReset(false)}>
                취소
              </button>
            </span>
          )}
        </div>
        <p className={s.meta}>
          단축키 · {placing ? `${placing.name}을(를) 놓을 칸을 누르세요` : "배운 액티브 스킬을 고르고 칸을 누르면 놓여요 (패시브는 늘 켜져 있어요)"} · 첫 초기화는 무료, 그 뒤로는 조금씩 포인트가 들어요
        </p>
        <div className={s.hotbar}>
          {Array.from({ length: HOTBAR_SIZE }, (_, i) => {
            const sk = skillById(c.hotbar[i] ?? "");
            const canPut = !!placing && c.hotbar[i] !== placing.id;
            return (
              <button
                key={i}
                type="button"
                className={s.hotSlot}
                data-target={canPut || undefined}
                disabled={busy || (!canPut && !sk)}
                aria-label={canPut ? `${i + 1}번 칸에 ${placing!.name} 놓기` : sk ? `${i + 1}번 칸 ${sk.name} 보기` : `${i + 1}번 칸 비어 있음`}
                onClick={() => {
                  if (canPut) setKey(placing!.id, i);
                  else if (sk) {
                    pick(sk.branch);
                    setPicked(sk.id);
                  }
                }}
              >
                <span className={s.skKeyNum}>{i + 1}</span>
                {sk ? <RpgIcon art={sk.art} size={32} /> : <span className={s.slotEmpty} aria-hidden="true" />}
                <span>{sk?.name ?? "비어 있음"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className={t.tabs} role="tablist" aria-label="스킬 갈래">
        {BRANCHES.map((b) => {
          const bi = BRANCH_INFO[b];
          return (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={b === branch}
              className={t.tab}
              style={{ "--tab": hex(bi.color) } as CSSProperties}
              onClick={() => pick(b)}
            >
              <span className={t.tabName}>{bi.name}</span>
              <span className={t.tabRole}>
                {bi.role} · {spentIn(c.skills, b)}포인트
              </span>
            </button>
          );
        })}
      </div>

      <div className={t.body}>
        <section className={t.treeCol} aria-label={`${info.name} 스킬 트리`}>
          <p className={t.branchDesc}>{info.desc}</p>
          <div className={t.tree} style={{ aspectRatio: `300 / ${TIERS * ROW}` }}>
            {Array.from({ length: TIERS }, (_, i) => {
              const tier = i + 1;
              const open = tierOpen(c.skills, branch, tier);
              return (
                <div key={tier} className={t.band} data-open={open || undefined} style={{ top: `${(i / TIERS) * 100}%`, height: `${100 / TIERS}%` }}>
                  <span>
                    {tier}단{tier > 1 && ` · ${open ? "열림" : `${spentIn(c.skills, branch, tier)}/${tierGate(tier)}`}`}
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
                    <g key={`${r.id}-${sk.id}`} data-met={met || undefined} data-on={rank(sk.id) > 0 || undefined}>
                      <line x1={cxOf(from)} y1={cyOf(from)} x2={cxOf(sk)} y2={cyOf(sk)} vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                }),
              )}
            </svg>
            {nodes.map((sk) => {
              const st = stateOf(sk);
              const r = rank(sk.id);
              const slot = c.hotbar.indexOf(sk.id);
              return (
                <button
                  key={sk.id}
                  type="button"
                  className={t.node}
                  data-state={st}
                  data-passive={sk.kind === "passive" || undefined}
                  data-can={(canLearn(sk) && st !== "max") || undefined}
                  aria-pressed={picked === sk.id}
                  aria-label={`${sk.name} ${r}/${sk.maxLevel}랭크${sk.kind === "passive" ? " 패시브" : ""}${st === "locked" ? " (잠김)" : ""}`}
                  style={{ left: `${cxOf(sk) / 3}%`, top: `${(cyOf(sk) / (TIERS * ROW)) * 100}%` }}
                  onClick={() => setPicked(sk.id)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(sk.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(sk.id)}
                  onBlur={() => setHover(null)}
                >
                  <span className={t.icon}>
                    <RpgIcon art={sk.art} size={32} />
                  </span>
                  <span className={t.rank}>
                    {r}/{sk.maxLevel}
                  </span>
                  {slot >= 0 && <span className={t.key}>{slot + 1}</span>}
                  <span className={t.nodeName}>{sk.name}</span>
                </button>
              );
            })}
          </div>
          <p className={cx(s.meta, t.legend)}>
            <i data-k="locked" /> 잠김 <i data-k="open" /> 찍을 수 있음 <i data-k="learned" /> 찍음 <i data-k="max" /> 최대 · 둥근 칸은 패시브
          </p>
        </section>

        <aside className={cx(s.skDetail, t.detail)} aria-live="polite">
          <div className={s.skDetailHead}>
            <RpgIcon art={d.art} size={48} />
            <div>
              <p className={s.cardName}>{d.name}</p>
              <p className={s.meta}>
                {BRANCH_INFO[d.branch].name} {d.tier}단 · {d.kind === "active" ? "액티브" : "패시브"} · {d.tag}
              </p>
              <p className={t.rankLine}>
                랭크 {dRank}/{d.maxLevel}
              </p>
            </div>
          </div>
          <p>{d.describe(Math.max(1, dRank))}</p>
          {dRank > 0 && dRank < d.maxLevel && (
            <p className={t.next}>
              <b>다음 랭크</b> {d.describe(dRank + 1)}
            </p>
          )}
          {dRank === 0 && d.maxLevel > 1 && (
            <p className={s.meta}>
              최대 랭크 {d.maxLevel}: {d.describe(d.maxLevel)}
            </p>
          )}
          {d.kind === "active" && (
            <dl className={s.skFacts}>
              <div>
                <dt>SP</dt>
                <dd>{d.sp(Math.max(1, dRank))}</dd>
              </div>
              <div>
                <dt>쿨타임</dt>
                <dd>{sec(d.cooldownMs(Math.max(1, dRank)))}</dd>
              </div>
              <div>
                <dt>단축키</dt>
                <dd>{dSlot >= 0 ? `${dSlot + 1}번` : "—"}</dd>
              </div>
            </dl>
          )}
          <ul className={t.reqs}>
            {d.tier > 1 && (
              <li data-ok={tierOpen(c.skills, d.branch, d.tier) || undefined}>
                {d.tier}단: 이 갈래 아래 단에 {tierGate(d.tier)}포인트 ({spentIn(c.skills, d.branch, d.tier)}/{tierGate(d.tier)})
              </li>
            )}
            {(d.requires ?? []).map((r) => (
              <li key={r.id} data-ok={rank(r.id) >= r.level || undefined}>
                선행: {skillById(r.id)!.name} {r.level}랭크 ({Math.min(rank(r.id), r.level)}/{r.level})
              </li>
            ))}
          </ul>
          {why && dRank < d.maxLevel && why.code !== "TIER_LOCKED" && why.code !== "SKILL_REQUIRED" && <p className={s.warn}>{why.message}</p>}
          <div className={s.skActions}>
            <button
              type="button"
              className={cx(ui.button, !why && ui.primary)}
              disabled={busy || !!why}
              onClick={() => onCharacter({ type: "learn", skill: d.id }, `${d.name} ${dRank + 1}랭크를 찍었어요.`)}
            >
              {dRank >= d.maxLevel ? "최대 랭크" : dRank ? "랭크 올리기 (1포인트)" : "배우기 (1포인트)"}
            </button>
            {d.kind === "active" && dRank > 0 && dSlot < 0 && <p className={s.meta}>위 단축키 칸을 누르면 이 스킬을 놓아요.</p>}
            {dSlot >= 0 && (
              <button type="button" className={cx(ui.button, ui.quiet)} disabled={busy} onClick={() => setKey(d.id, null)}>
                단축키에서 빼기
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
