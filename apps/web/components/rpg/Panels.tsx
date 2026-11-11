"use client";

import { useState, type CSSProperties } from "react";
import { DIR } from "@tomb/protocol";
import {
  DIFFICULTIES,
  DIFFS,
  GAMES,
  GAME_KINDS,
  GEAR,
  GEAR_SLOTS,
  gearById,
  HOTBAR_SIZE,
  KIND_LABELS,
  MONSTERS,
  POTIONS,
  SKILLS,
  SLOT_LABELS,
  slotKind,
  STAT_KEYS,
  STAT_LABELS,
  ZONES,
  type Difficulty,
  type GameKind,
  type GearDef,
  type GearKind,
  type GearSlot,
  type SkillId,
  type Stats,
} from "@/lib/rpg/catalog";
import { GEAR_INV_MAX, sellValue } from "@/lib/rpg/character";
import type { CharacterAction } from "@/lib/rpg/client";
import { derive, STAT_MAX, type Derived } from "@/lib/rpg/formulas";
import type { RpgView } from "@/lib/rpg/types";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import { DollSlot, PaperDoll } from "../ui/PaperDoll";
import ui from "../ui/ui.module.css";
import { bonusText, pts } from "./format";
import { bagGear, deltaText, equipTarget, gearDiff, gearGrade, sellable, sellWarning, slotAccepts } from "./gear";
import RpgIcon from "./RpgIcon";
import s from "./rpg.module.css";

// 사냥터 로비의 탭들: 출발 · 캐릭터 · 장비 · 스킬 · 상점

type Common = {
  view: RpgView;
  busy: boolean;
  onCharacter: (a: CharacterAction, ok?: string) => void;
};

// ── 출발 ──

export function StartPanel({
  view,
  game,
  diff,
  onGame,
  onDiff,
  onStart,
  busy,
}: {
  view: RpgView;
  game: GameKind;
  diff: Difficulty;
  onGame: (g: GameKind) => void;
  onDiff: (d: Difficulty) => void;
  onStart: () => void;
  busy: boolean;
}) {
  const c = view.character;
  const zone = ZONES[diff];
  const D = DIFFS[diff];
  const low = c.level < D.recLevel;
  const capLeft = Math.max(0, view.today.cap - view.today.huntPoints);
  const monsters = [...new Set([...zone.pool])].map((id) => MONSTERS[id].name);
  return (
    <div className={s.lobby}>
      <section className={s.section} aria-labelledby="rpg-games">
        <h3 id="rpg-games" className={s.sectionTitle}>
          어디로 갈까요
        </h3>
        <div className={s.cards} role="radiogroup" aria-labelledby="rpg-games">
          {GAME_KINDS.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={game === g} className={s.card} onClick={() => onGame(g)}>
              <span className={s.cardName}>{GAMES[g].name}</span>
              <span>{GAMES[g].desc}</span>
              <span className={s.meta}>{GAMES[g].statNote}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={s.section} aria-labelledby="rpg-diff">
        <h3 id="rpg-diff" className={s.sectionTitle}>
          난이도
        </h3>
        <div className={s.diffs} role="radiogroup" aria-labelledby="rpg-diff">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={diff === d} className={s.card} onClick={() => onDiff(d)}>
              <span className={s.cardName}>{DIFFS[d].name}</span>
              <span className={s.meta}>
                {game === "hunt" ? ZONES[d].name : `권장 Lv.${DIFFS[d].recLevel}+`}
                <br />
                최대 {game === "hunt" ? DIFFS[d].huntPoints : DIFFS[d].miniPoints}P
              </span>
            </button>
          ))}
        </div>
        {game === "hunt" ? (
          <p className={s.meta}>
            <b>{zone.name}</b> — {zone.desc} 권장 Lv.{D.recLevel}+ · 웨이브 {zone.waves}개 · {zone.timeLimitSec}초
            <br />
            나오는 것: {monsters.join(", ")} · 우두머리: {MONSTERS[zone.boss].name}
          </p>
        ) : (
          <p className={s.meta}>{GAMES[game].how}</p>
        )}
        {low && <p className={s.warn}>권장 레벨보다 낮아요. 쓰러지면 보상이 절반이에요.</p>}
      </section>

      <div className={s.startRow}>
        <p className={s.meta}>
          {game === "hunt" ? GAMES.hunt.how : "끝나면 점수에 따라 포인트·EXP를 받아요."}
          <br />
          오늘 사냥 포인트 {view.today.huntPoints} / {view.today.cap}
          {capLeft === 0 && " · 오늘 한도를 다 채워서 EXP와 드롭만 받아요"} · 이번 시간 남은 판 {view.today.runsPerHour}
        </p>
        <button type="button" className={cx(ui.button, ui.primary, s.start)} onClick={onStart} disabled={busy || view.today.runsPerHour <= 0}>
          {busy ? "준비 중…" : `${GAMES[game].name} 출발`}
        </button>
      </div>
    </div>
  );
}

// ── 캐릭터 ──

const DERIVED_ROWS: [keyof Derived, string, (v: number) => string][] = [
  ["maxHp", "HP", String],
  ["maxSp", "SP", String],
  ["atk", "ATK", String],
  ["def", "DEF", String],
  ["aspd", "공격속도", (v) => `${v.toFixed(2)}회/초`],
  ["crit", "치명타", (v) => `${v}%`],
  ["hit", "명중(HIT)", String],
  ["flee", "회피(FLEE)", String],
  ["move", "이동속도", String],
  ["skillPower", "스킬 위력", (v) => `×${v.toFixed(2)}`],
];

export function CharacterPanel({ view, busy, onCharacter }: Common) {
  const c = view.character;
  const [plan, setPlan] = useState<Partial<Stats>>({});
  const used = STAT_KEYS.reduce((n, k) => n + (plan[k] ?? 0), 0);
  const left = c.statPoints - used;
  const preview = used ? derive(c.level, Object.fromEntries(STAT_KEYS.map((k) => [k, c.stats[k] + (plan[k] ?? 0)])) as Stats, c.equip) : view.derived;
  const bump = (k: keyof Stats, d: number) => setPlan((p) => ({ ...p, [k]: Math.max(0, (p[k] ?? 0) + d) }));
  return (
    <div className={s.lobby}>
      <section className={s.section} aria-labelledby="rpg-stats">
        <h3 id="rpg-stats" className={s.sectionTitle}>
          능력치 <span className={s.meta}>· 남은 포인트 {left}</span>
        </h3>
        <div className={s.statGrid}>
          {STAT_KEYS.map((k) => {
            const gear = view.derived.stats[k] - c.stats[k];
            const add = plan[k] ?? 0;
            return (
              <div key={k} className={s.statRow} title={STAT_LABELS[k].desc}>
                <b>{STAT_LABELS[k].name}</b>
                <span className={s.statVal}>
                  {c.stats[k] + add}
                  {add > 0 && <span className={s.plus}> (+{add})</span>}
                  {gear !== 0 && <span className={s.meta}> 장비 {gear > 0 ? "+" : ""}{gear}</span>}
                </span>
                <span className={s.stepper}>
                  <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => bump(k, -1)} disabled={!add} aria-label={`${STAT_LABELS[k].name} 1 내리기`}>
                    −
                  </button>
                  <button
                    type="button"
                    className={ui.button}
                    onClick={() => bump(k, 1)}
                    disabled={left <= 0 || c.stats[k] + add >= STAT_MAX}
                    aria-label={`${STAT_LABELS[k].name} 1 올리기`}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <p className={s.meta}>
          {STAT_KEYS.map((k) => `${STAT_LABELS[k].name}: ${STAT_LABELS[k].desc}`).join(" · ")}
        </p>
        <div className={s.startRow}>
          <span className={s.meta}>레벨이 오를 때마다 능력치 포인트 3개 (5의 배수 레벨엔 5개)</span>
          <button
            type="button"
            className={cx(ui.button, ui.primary)}
            disabled={!used || busy}
            onClick={() => {
              onCharacter({ type: "alloc", stats: plan }, "능력치를 올렸어요.");
              setPlan({});
            }}
          >
            {used ? `${used}포인트 적용` : "올릴 능력치를 골라 주세요"}
          </button>
        </div>
      </section>
      <section className={s.section} aria-labelledby="rpg-derived">
        <h3 id="rpg-derived" className={s.sectionTitle}>
          전투 능력 {used > 0 && <span className={s.meta}>(적용하면 이렇게 돼요)</span>}
        </h3>
        <dl className={s.derived}>
          {DERIVED_ROWS.map(([k, label, f]) => {
            const v = preview[k] as number;
            const delta = v - (view.derived[k] as number);
            const up = delta !== 0;
            return (
              <div key={k}>
                <dt>{label}</dt>
                <dd className={up ? s.up : undefined}>
                  {f(v)}
                  {/* 7번: 올리면 얼마나 느는지 바로 보이게 (예: STR +1 → ATK +3) */}
                  {up && Number.isInteger(delta) && ` (${delta > 0 ? "+" : ""}${delta})`}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}

// ── 장비 ──

/** 칸 배치: 머리는 위, 무기는 손 옆, 갑옷은 몸통 옆, 장신구는 양쪽 아래 */
const GEAR_AREAS = `". head ." "weapon fig armor" "acc1 fig acc2"`;
/** 빈 칸에 흐리게 깔리는 그림 */
const GEAR_SILHOUETTE: Record<GearSlot, string> = { weapon: "w_ruler", armor: "a_hoodie", head: "h_cap", acc1: "c_ide_ring", acc2: "c_earphones" };
const TOTAL_ROWS: [keyof Omit<Derived, "stats">, string, (v: number) => string][] = [
  ["atk", "ATK", String],
  ["def", "DEF", String],
  ["maxHp", "HP", String],
  ["maxSp", "SP", String],
  ["aspd", "공속", (v) => v.toFixed(2)],
  ["crit", "치명", (v) => `${v}%`],
  ["hit", "명중", String],
  ["flee", "회피", String],
  ["move", "이속", String],
  ["skillPower", "스킬", (v) => `×${v.toFixed(2)}`],
];
type GearFilter = "all" | GearKind;
const GEAR_FILTERS: [GearFilter, string][] = [
  ["all", "전체"],
  ["weapon", "무기"],
  ["armor", "갑옷"],
  ["head", "머리"],
  ["acc", "장신구"],
];

type Pick = { type: "item"; id: string } | { type: "slot"; slot: GearSlot } | null;

export function GearPanel({
  view,
  busy,
  onCharacter,
  onSell,
  figure,
}: Common & { onSell: (id: string) => void; figure: { color: string; body: string; look: readonly string[] } }) {
  const c = view.character;
  const [pick, setPick] = useState<Pick>(null);
  const [filter, setFilter] = useState<GearFilter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const bag = bagGear(c);
  const shownBag = bag.filter((b) => filter === "all" || b.gear.kind === filter);
  const total = bag.reduce((n, b) => n + b.count, 0);

  // 고른 장비가 들어갈 칸 (칸을 먼저 골랐고 종류가 맞으면 그 칸)
  const targetOf = (g: GearDef): GearSlot => (pick?.type === "slot" && slotAccepts(pick.slot, g.kind) ? pick.slot : equipTarget(c, g.kind));
  const pickedGear = pick?.type === "item" ? gearById(pick.id) : undefined;
  const pickedSlot: GearSlot | null = pick?.type === "slot" ? pick.slot : pickedGear ? targetOf(pickedGear) : null;
  const slotGear = pickedSlot && c.equip[pickedSlot] ? gearById(c.equip[pickedSlot]!) : undefined;
  // 비교: 고른 장비를 끼면 / 고른 칸을 비우면
  const diff = pickedGear ? gearDiff(c, pickedSlot!, pickedGear.id) : pick?.type === "slot" && slotGear ? gearDiff(c, pick.slot, null) : [];
  const deltaOf = new Map(diff.map((d) => [d.key, d.delta]));

  function equipNow(g: GearDef) {
    const slot = targetOf(g);
    onCharacter({ type: "equip", slot, itemId: g.id }, `${g.name}을(를) ${SLOT_LABELS[slot]}에 꼈어요.`);
    setPick(null);
  }

  /** 그 장비가 낀 칸에서 뺀다 (장신구 두 칸에 같은 것이면 2번 칸부터) */
  function unequipAll(g: GearDef) {
    const slot = [...GEAR_SLOTS].reverse().find((k) => c.equip[k] === g.id);
    if (slot) onCharacter({ type: "equip", slot, itemId: null }, `${g.name}을(를) 뺐어요.`);
  }

  function pickSlot(slot: GearSlot) {
    if (pick?.type === "slot" && pick.slot === slot) {
      setPick(null);
      setFilter("all");
      return;
    }
    setPick({ type: "slot", slot });
    setFilter(slotKind(slot));
  }

  function sell(g: GearDef) {
    if (confirming !== g.id && sellWarning(c, g)) {
      setConfirming(g.id);
      return;
    }
    setConfirming(null);
    if (pick?.type === "item" && pick.id === g.id && sellable(c, g.id) <= 1) setPick(null);
    onSell(g.id);
  }

  return (
    <div className={s.lobby}>
      <div className={s.gearTop}>
        <PaperDoll
          areas={GEAR_AREAS}
          label="장착 칸"
          className={s.gearDoll}
          figure={<OutfitCanvas color={figure.color} body={figure.body} look={figure.look} label="내 사냥 캐릭터" dir={DIR.down} walking={false} />}
        >
          {GEAR_SLOTS.map((slot) => {
            const id = c.equip[slot];
            const g = id ? gearById(id) : undefined;
            const grade = g ? gearGrade(g) : null;
            return (
              <DollSlot
                key={slot}
                area={slot}
                label={SLOT_LABELS[slot]}
                name={g?.name ?? null}
                icon={g ? <RpgIcon art={g.art} size={32} /> : null}
                silhouette={<RpgIcon art={gearById(GEAR_SILHOUETTE[slot])?.art ?? GEAR[0].art} size={32} />}
                sub={g ? bonusText(g.bonus) : null}
                tone={grade?.color}
                tip={g ? { title: `${g.name} (${grade!.label})`, body: `${bonusText(g.bonus)} · ${g.desc}` } : { title: `${SLOT_LABELS[slot]} · 비어 있어요`, body: "눌러서 이 칸에 낄 장비를 골라요." }}
                selected={pick?.type === "slot" && pick.slot === slot}
                highlight={pick?.type === "item" && pickedSlot === slot}
                ariaLabel={`${SLOT_LABELS[slot]} 칸, ${g ? `${g.name} 장착 중` : "비어 있음"}. 누르면 이 칸에 낄 장비 목록`}
                onClick={() => pickSlot(slot)}
              />
            );
          })}
        </PaperDoll>

        <section className={s.statPanel} aria-labelledby="rpg-total">
          <h3 id="rpg-total" className={s.sectionTitle}>
            전투 능력 {diff.length > 0 && <span className={s.meta}>· 바꾸면</span>}
          </h3>
          <dl className={s.totals}>
            {TOTAL_ROWS.map(([k, label, f]) => {
              const d = deltaOf.get(k);
              return (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd>
                    {f(view.derived[k])}
                    {d !== undefined && (
                      <span className={d > 0 ? s.deltaUp : s.deltaDown} aria-label={`${d > 0 ? "오름" : "내림"} ${Math.abs(d)}`}>
                        {deltaText(d)}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className={s.pickBox} aria-live="polite">
            {pickedGear ? (
              <>
                <p className={s.rowName} style={{ color: gearGrade(pickedGear).color }}>
                  {pickedGear.name}
                </p>
                <p className={s.meta}>
                  {slotGear && slotGear.id !== pickedGear.id ? `${SLOT_LABELS[pickedSlot!]}의 ${slotGear.name} 대신 끼면` : `${SLOT_LABELS[pickedSlot!]}에 끼면`}
                  {diff.length === 0 && " 달라지는 게 없어요"}
                </p>
              </>
            ) : pick?.type === "slot" ? (
              <>
                <p className={s.rowName}>
                  {SLOT_LABELS[pick.slot]} · {slotGear?.name ?? "비어 있어요"}
                </p>
                <p className={s.meta}>{slotGear ? "빼면 위처럼 바뀌어요." : "아래 가방에서 낄 장비를 골라요."}</p>
                {slotGear && (
                  <button
                    type="button"
                    className={cx(ui.button, s.small)}
                    disabled={busy}
                    onClick={() => {
                      onCharacter({ type: "equip", slot: pick.slot, itemId: null }, `${slotGear.name}을(를) 뺐어요.`);
                      setPick(null);
                    }}
                  >
                    {slotGear.name} 빼기
                  </button>
                )}
              </>
            ) : (
              <p className={s.meta}>칸이나 가방의 장비를 누르면 바뀌는 능력치를 미리 보여 줘요.</p>
            )}
          </div>
        </section>
      </div>

      <section className={s.section} aria-labelledby="rpg-inv">
        <div className={s.bagHead}>
          <h3 id="rpg-inv" className={s.sectionTitle}>
            가방 <span className={s.meta}>· {total}/{GEAR_INV_MAX}개 · 되팔면 산 값의 50% (주운 장비는 오늘 사냥 포인트 한도 안에서)</span>
          </h3>
          <div className={s.filter} role="group" aria-label="장비 종류로 거르기">
            {GEAR_FILTERS.map(([k, label]) => (
              <button key={k} type="button" className={cx(ui.button, s.small)} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {shownBag.length === 0 && (
          <p className={s.meta}>{bag.length === 0 ? "가진 장비가 없어요. 상점에서 사거나 사냥터에서 주워요." : "이 종류의 장비가 없어요."}</p>
        )}
        <ul className={s.bagGrid}>
          {shownBag.map(({ gear: g, count, equipped }) => {
            const grade = gearGrade(g);
            const free = count - equipped;
            const low = c.level < g.reqLevel;
            const target = targetOf(g);
            const cmp = free > 0 ? gearDiff(c, target, g.id).slice(0, 3) : [];
            const picked = pick?.type === "item" && pick.id === g.id;
            const price = sellValue(g.price);
            const warn = confirming === g.id ? sellWarning(c, g) : null;
            return (
              <li key={g.id} className={s.bagCell} data-picked={picked || undefined} data-grade={grade.id} style={{ "--grade": grade.color } as CSSProperties}>
                <button
                  type="button"
                  className={s.bagPick}
                  aria-pressed={picked}
                  aria-label={`${g.name}, ${grade.label} ${KIND_LABELS[g.kind]}, ${count}개${equipped ? `, ${equipped}개 장착 중` : ""}. 누르면 능력치 비교`}
                  onClick={() => setPick(picked ? null : { type: "item", id: g.id })}
                >
                  <span className={s.bagIcon}>
                    <RpgIcon art={g.art} size={48} />
                    {count > 1 && <span className={s.qty}>×{count}</span>}
                  </span>
                  <span className={s.bagInfo}>
                    <span className={s.bagName}>{g.name}</span>
                    <span className={s.meta}>
                      <span className={s.grade}>{grade.label}</span> · {KIND_LABELS[g.kind]} · Lv.{g.reqLevel}
                    </span>
                    <span className={s.bagBonus}>{bonusText(g.bonus)}</span>
                    {equipped > 0 && <span className={s.equippedTag}>장착 중{count > 1 ? ` ${equipped}개` : ""}</span>}
                    {cmp.length > 0 && (
                      <span className={s.cmp}>
                        {SLOT_LABELS[target]} 비교{" "}
                        {cmp.map((d) => (
                          <span key={d.key} className={d.delta > 0 ? s.deltaUp : s.deltaDown}>
                            {d.label} {deltaText(d.delta)}
                          </span>
                        ))}
                      </span>
                    )}
                    {low && <span className={s.warn}>레벨 {g.reqLevel}부터 낄 수 있어요</span>}
                  </span>
                </button>
                {warn ? (
                  <div className={s.confirm} role="alert">
                    <p>{warn}</p>
                    <div className={s.cellActions}>
                      <button type="button" className={cx(ui.button, s.sellBtn)} disabled={busy} onClick={() => sell(g)}>
                        {pts(price)}에 팔기
                      </button>
                      <button type="button" className={cx(ui.button, s.small)} onClick={() => setConfirming(null)}>
                        그만두기
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={s.cellActions}>
                    {free < 1 ? (
                      <button
                        type="button"
                        className={cx(ui.button, s.equipBtn)}
                        disabled={busy}
                        onClick={() => unequipAll(g)}
                        aria-label={`${g.name} 빼기`}
                      >
                        빼기
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={cx(ui.button, ui.primary, s.equipBtn)}
                        disabled={busy || low}
                        onClick={() => equipNow(g)}
                        aria-label={`${g.name} ${SLOT_LABELS[target]}에 장착`}
                      >
                        장착
                      </button>
                    )}
                    {free > 0 ? (
                      <button type="button" className={cx(ui.button, s.sellBtn)} disabled={busy} onClick={() => sell(g)} aria-label={`${g.name} 1개 팔기, ${price}포인트`}>
                        팔기 <b>{pts(price)}</b>
                      </button>
                    ) : (
                      <span className={s.sellNote}>장착 중 · 빼면 팔 수 있어요</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ── 스킬 ──

export function SkillPanel({ view, busy, onCharacter }: Common) {
  const c = view.character;
  const setKey = (id: SkillId, slot: number | null) => {
    const next = c.hotbar.map((h) => (h === id ? null : h));
    if (slot !== null) next[slot] = id;
    onCharacter({ type: "hotbar", slots: next }, slot === null ? "단축키에서 뺐어요." : `${slot + 1}번 단축키에 놓았어요.`);
  };
  return (
    <div className={s.lobby}>
      <section className={s.section} aria-labelledby="rpg-hotbar">
        <h3 id="rpg-hotbar" className={s.sectionTitle}>
          단축키 <span className={s.meta}>· 스킬 포인트 {c.skillPoints} · 직업 없이 모든 스킬을 배울 수 있어요</span>
        </h3>
        <div className={s.hotbar}>
          {Array.from({ length: HOTBAR_SIZE }, (_, i) => {
            const sk = SKILLS.find((x) => x.id === c.hotbar[i]);
            return (
              <div key={i} className={s.hotSlot}>
                <span>{i + 1}</span>
                {sk ? <RpgIcon art={sk.art} size={32} /> : <span className={s.slotEmpty} aria-hidden="true" />}
                <span>{sk?.name ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </section>
      <ul className={s.list} aria-label="스킬 목록">
        {SKILLS.map((sk) => {
          const lv = c.skills[sk.id] ?? 0;
          const reqs = (sk.requires ?? []).filter((r) => (c.skills[r.id] ?? 0) < r.level);
          const locked = c.level < sk.reqLevel || reqs.length > 0;
          const maxed = lv >= sk.maxLevel;
          const slot = c.hotbar.indexOf(sk.id);
          return (
            <li key={sk.id} className={s.row}>
              <RpgIcon art={sk.art} size={32} />
              <div>
                <p className={s.rowName}>
                  {sk.name} <span className={s.meta}>({sk.tag}) · {lv}/{sk.maxLevel}단계</span>
                </p>
                <p className={s.meta}>
                  {lv > 0 ? sk.describe(lv) : sk.describe(1)} · SP {sk.sp(Math.max(1, lv))} · 쿨타임 {sk.cooldownMs(Math.max(1, lv)) / 1000}초
                </p>
                {lv > 0 && !maxed && <p className={s.meta}>다음 단계: {sk.describe(lv + 1)}</p>}
                {locked && (
                  <p className={s.warn}>
                    {c.level < sk.reqLevel ? `레벨 ${sk.reqLevel}부터` : ""}
                    {reqs.map((r) => ` ${SKILLS.find((x) => x.id === r.id)!.name} ${r.level}단계 필요`).join(",")}
                  </p>
                )}
              </div>
              <div className={s.rowActions}>
                {lv > 0 && (
                  <select
                    className={s.select}
                    value={slot}
                    disabled={busy}
                    aria-label={`${sk.name} 단축키`}
                    onChange={(e) => setKey(sk.id, Number(e.target.value) < 0 ? null : Number(e.target.value))}
                  >
                    <option value={-1}>단축키 없음</option>
                    {Array.from({ length: HOTBAR_SIZE }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}번
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className={cx(ui.button, s.small)}
                  disabled={busy || locked || maxed || c.skillPoints < 1}
                  onClick={() => onCharacter({ type: "learn", skill: sk.id }, `${sk.name} ${lv + 1}단계를 배웠어요.`)}
                >
                  {maxed ? "최고 단계" : lv ? "단계 올리기" : "배우기"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 상점 ──

type ShopTab = "potion" | GearKind;
const SHOP_TABS: [ShopTab, string][] = [
  ["potion", "포션"],
  ["weapon", "무기"],
  ["armor", "갑옷"],
  ["head", "머리"],
  ["acc", "장신구"],
];

export function ShopPanel({ view, busy, onBuy }: { view: RpgView; busy: boolean; onBuy: (id: string, qty: number) => void }) {
  const [tab, setTab] = useState<ShopTab>("potion");
  const c = view.character;
  return (
    <div className={s.lobby}>
      <div className={s.startRow}>
        <p className={s.summary}>
          내 포인트 <strong className={s.points}>{pts(view.points)}</strong>
        </p>
        <div className={s.filter} role="group" aria-label="물건 종류">
          {SHOP_TABS.map(([k, label]) => (
            <button key={k} type="button" className={cx(ui.button, s.small)} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className={s.list}>
        {tab === "potion"
          ? POTIONS.map((p) => (
              <li key={p.id} className={s.row}>
                <RpgIcon art={p.art} size={32} />
                <div>
                  <p className={s.rowName}>
                    {p.name} <span className={s.meta}>· 가진 것 {c.potions[p.id] ?? 0}개{p.key ? ` · 단축키 ${p.key}` : " · 자동"}</span>
                  </p>
                  <p className={s.meta}>{p.desc}</p>
                </div>
                <div className={s.rowActions}>
                  {[1, 5].map((q) => (
                    <button key={q} type="button" className={cx(ui.button, s.small)} disabled={busy || view.points < p.price * q} onClick={() => onBuy(p.id, q)}>
                      {q}개 {pts(p.price * q)}
                    </button>
                  ))}
                </div>
              </li>
            ))
          : GEAR.filter((g) => g.kind === tab).map((g) => {
              const n = c.inv[g.id] ?? 0;
              return (
                <li key={g.id} className={s.row}>
                  <RpgIcon art={g.art} size={32} />
                  <div>
                    <p className={s.rowName}>
                      {g.name} {n > 0 && <span className={s.meta}>· 가진 것 {n}개</span>}
                    </p>
                    <p className={s.meta}>
                      Lv.{g.reqLevel} · {bonusText(g.bonus)}
                    </p>
                    <p className={s.meta}>{g.desc}</p>
                    {c.level < g.reqLevel && <p className={s.warn}>레벨 {g.reqLevel}부터 낄 수 있어요</p>}
                  </div>
                  <div className={s.rowActions}>
                    <button type="button" className={cx(ui.button, s.small)} disabled={busy || view.points < g.price} onClick={() => onBuy(g.id, 1)} aria-label={`${g.name}, ${g.price}포인트에 사기`}>
                      {pts(g.price)} 사기
                    </button>
                  </div>
                </li>
              );
            })}
      </ul>
    </div>
  );
}

