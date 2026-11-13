"use client";

import { useState, type CSSProperties } from "react";
import { DIR } from "@tomb/protocol";
import {
  DIFFICULTIES,
  DIFFS,
  GAMES,
  GEAR,
  GEAR_SLOTS,
  gearById,
  KIND_LABELS,
  MONSTERS,
  POTIONS,
  SLOT_LABELS,
  slotKind,
  STAT_KEYS,
  STAT_LABELS,
  ZONES,
  zoneFor,
  type Difficulty,
  type GameKind,
  type GearDef,
  type GearKind,
  type GearSlot,
  type Stats,
  type ZoneDef,
  type ZoneId,
} from "@/lib/rpg/catalog";
import { GEAR_INV_MAX, sellValue } from "@/lib/rpg/character";
import type { CharacterAction } from "@/lib/rpg/client";
import { derive, STAT_MAX, type Derived } from "@/lib/rpg/formulas";
import type { RpgView } from "@/lib/rpg/types";
import { weaponStyleOf, weaponStyleText } from "@/lib/rpg/weapons";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import { DollSlot, PaperDoll } from "../ui/PaperDoll";
import ui from "../ui/ui.module.css";
import { bonusText, pts } from "./format";
import { bagGear, deltaText, equipTarget, gearDiff, gearGrade, sellable, sellWarning, slotAccepts } from "./gear";
import RpgIcon from "./RpgIcon";
import ZonePicker, { ZoneInfo, zoneOpen, zoneUnlockAll } from "./ZonePicker";
import s from "./rpg.module.css";

// 사냥터 로비의 탭들: 출발 · 캐릭터 · 장비 · 스킬 · 상점

type Common = {
  view: RpgView;
  busy: boolean;
  onCharacter: (a: CharacterAction, ok?: string) => void;
};

// ── 출발 ──

/**
 * 사냥터 로비에서 빠진 게임 (마을로 옮겨 갔다). 저장된 선택이 이 중 하나면 사냥으로 돌린다 (HuntLobby readPick).
 * stars → 별 보기 언덕 망원경(22번, components/rpg/Telescope.tsx)
 * bugs → 마을 수풀의 곤충 채집(32번, components/forage — 같은 미니게임을 나비·반딧불이 그림으로)
 */
export const LOBBY_HIDDEN: ReadonlySet<GameKind> = new Set<GameKind>(["stars", "bugs"]);

export function StartPanel({
  view,
  game,
  diff,
  zoneId,
  onDiff,
  onZone,
  onStart,
  busy,
  onGuide,
}: {
  view: RpgView;
  game: GameKind;
  diff: Difficulty;
  /** 40번: 고른 사냥터 (사냥만) */
  zoneId?: ZoneId;
  onDiff: (d: Difficulty) => void;
  onZone?: (z: ZoneDef) => void;
  onStart: () => void;
  busy: boolean;
  /** 사냥 안내서 열기 */
  onGuide?: () => void;
}) {
  const c = view.character;
  const zone = zoneFor(diff, zoneId);
  const D = DIFFS[diff];
  const low = c.level < D.recLevel;
  const zoneLocked = game === "hunt" && !zoneOpen(zone, c.level, zoneUnlockAll());
  const capLeft = Math.max(0, view.today.cap - view.today.huntPoints);
  const monsters = [...new Set([...zone.pool])].map((id) => MONSTERS[id].name);
  const canStart = !busy && view.today.runsPerHour > 0 && !zoneLocked;
  const todayLine = (
    <p className={s.meta}>
      오늘 사냥 포인트 {view.today.huntPoints} / {view.today.cap}
      {capLeft === 0 && " · 오늘 한도를 다 채워서 EXP와 드롭만 받아요"} · 이번 시간 남은 판 {view.today.runsPerHour}
    </p>
  );
  const startButton = (
    <button type="button" className={cx(ui.button, ui.primary, s.start)} onClick={onStart} disabled={!canStart}>
      {busy ? "준비 중…" : zoneLocked ? `Lv.${zone.unlockLevel}부터` : `${game === "hunt" ? zone.name : GAMES[game].name} 출발`}
    </button>
  );

  // 사냥: 카드를 누르면 그 줄 바로 아래에 설명이 펼쳐지고, 설명 끝에 출발 버튼이 이어진다 (시선 이동 최소)
  if (game === "hunt" && onZone) {
    return (
      <div className={s.lobby}>
        <section className={s.section} aria-label="사냥터 고르기">
          <ZonePicker
            level={c.level}
            zone={zone.id}
            onZone={onZone}
            detail={
              <>
                <ZoneInfo z={zone} />
                {zoneLocked && (
                  <p className={s.warn}>
                    {zone.name}은(는) Lv.{zone.unlockLevel}부터 갈 수 있어요.
                  </p>
                )}
                {!zoneLocked && low && <p className={s.warn}>권장 레벨보다 낮아요. 쓰러지면 보상이 절반이에요.</p>}
                <div className={s.zoneGo}>
                  {todayLine}
                  {startButton}
                </div>
              </>
            }
          />
        </section>
        {onGuide && (
          <p className={s.meta}>
            조작·몬스터 패턴·보상이 궁금하면{" "}
            <button type="button" className={s.linkBtn} onClick={onGuide}>
              사냥 안내서
            </button>
            를 펼쳐 보세요.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={s.lobby}>
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

      <p className={s.meta}>{game === "hunt" ? GAMES.hunt.how : "끝나면 점수에 따라 포인트·EXP를 받아요."}</p>

      <div className={cx(s.startRow, s.startDock)}>
        {todayLine}
        {startButton}
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
                  {gear !== 0 && (
                    <span className={s.meta}>
                      {" "}
                      장비 {gear > 0 ? "+" : ""}
                      {gear}
                    </span>
                  )}
                </span>
                <span className={s.stepper}>
                  <button
                    type="button"
                    className={cx(ui.button, ui.quiet)}
                    onClick={() => bump(k, -1)}
                    disabled={!add}
                    aria-label={`${STAT_LABELS[k].name} 1 내리기`}
                  >
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
        <p className={s.meta}>{STAT_KEYS.map((k) => `${STAT_LABELS[k].name}: ${STAT_LABELS[k].desc}`).join(" · ")}</p>
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
const GEAR_SILHOUETTE: Record<GearSlot, string> = {
  weapon: "w_ruler",
  armor: "a_hoodie",
  head: "h_cap",
  acc1: "c_ide_ring",
  acc2: "c_earphones",
};
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
}: Common & {
  onSell: (id: string, count?: number) => void;
  figure: { color: string; body: string; look: readonly string[] };
}) {
  const c = view.character;
  const [pick, setPick] = useState<Pick>(null);
  const [filter, setFilter] = useState<GearFilter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  // 여러 개 되팔기: 아이템 id → 고른 개수 (0부터. 가진 것보다 많으면 가진 만큼으로 본다)
  const [qty, setQty] = useState<Record<string, number>>({});
  const qtyOf = (id: string, max: number) => Math.min(qty[id] ?? 0, max);
  const setQtyOf = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));
  const bag = bagGear(c);
  const potions = POTIONS.flatMap((p) => ((c.potions[p.id] ?? 0) > 0 ? [{ potion: p, count: c.potions[p.id] }] : []));
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

  function sell(g: GearDef, n = 1) {
    if (n < 1) return;
    if (confirming !== g.id && sellWarning(c, g, n)) {
      setConfirming(g.id);
      return;
    }
    setConfirming(null);
    if (pick?.type === "item" && pick.id === g.id && sellable(c, g.id) <= n) setPick(null);
    setQtyOf(g.id, 0);
    onSell(g.id, n);
  }

  function sellPotion(id: string, n: number) {
    if (n < 1) return;
    setQtyOf(id, 0);
    onSell(id, n);
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
                tip={
                  g
                    ? {
                        title: `${g.name} (${grade!.label})`,
                        body: `${bonusText(g.bonus)} · ${g.desc}${g.kind === "weapon" ? ` · ${weaponStyleText(g)}` : ""}`,
                      }
                    : {
                        title: `${SLOT_LABELS[slot]} · 비어 있어요`,
                        body: "눌러서 이 칸에 낄 장비를 골라요.",
                      }
                }
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
                  {slotGear && slotGear.id !== pickedGear.id
                    ? `${SLOT_LABELS[pickedSlot!]}의 ${slotGear.name} 대신 끼면`
                    : `${SLOT_LABELS[pickedSlot!]}에 끼면`}
                  {diff.length === 0 && " 달라지는 게 없어요"}
                </p>
                {pickedGear.kind === "weapon" && <p className={s.meta}>공격 방식: {weaponStyleText(pickedGear)}</p>}
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
            가방{" "}
            <span className={s.meta}>
              · {total}/{GEAR_INV_MAX}개 · 되팔면 산 값의 50% (주운 장비는 오늘 사냥 포인트 한도 안에서)
            </span>
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
            // 남는 것이 2개 이상이면 개수를 골라 한 번에 판다
            const n = free > 1 ? qtyOf(g.id, free) : 1;
            const warn = confirming === g.id ? sellWarning(c, g, n) : null;
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
                    {g.kind === "weapon" && (
                      <span className={s.styleTag} title={weaponStyleText(g) ?? undefined}>
                        {weaponStyleOf(g).name}
                      </span>
                    )}
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
                      <button type="button" className={cx(ui.button, s.sellBtn)} disabled={busy || n < 1} onClick={() => sell(g, n)}>
                        {n > 1 ? `${n}개 ` : ""}
                        {pts(price * n)}에 팔기
                      </button>
                      <button type="button" className={cx(ui.button, s.small)} onClick={() => setConfirming(null)}>
                        그만두기
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={s.cellActions}>
                    {free < 1 ? (
                      <button type="button" className={cx(ui.button, s.equipBtn)} disabled={busy} onClick={() => unequipAll(g)} aria-label={`${g.name} 빼기`}>
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
                    {free > 1 ? (
                      <SellQty name={g.name} max={free} unit={price} value={n} busy={busy} onChange={(v) => setQtyOf(g.id, v)} onSell={() => sell(g, n)} />
                    ) : free > 0 ? (
                      <button
                        type="button"
                        className={cx(ui.button, s.sellBtn)}
                        disabled={busy}
                        onClick={() => sell(g)}
                        aria-label={`${g.name} 1개 팔기, ${price}포인트`}
                      >
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

      {potions.length > 0 && (
        <section className={s.section} aria-labelledby="rpg-potions">
          <h3 id="rpg-potions" className={s.sectionTitle}>
            물약 <span className={s.meta}>· 되팔면 값의 50% (오늘 사냥 포인트 한도 안에서, 한도에 막힌 것은 가방에 남아요)</span>
          </h3>
          <ul className={s.bagGrid}>
            {potions.map(({ potion: p, count }) => {
              const price = sellValue(p.price);
              const n = count > 1 ? qtyOf(p.id, count) : 1;
              return (
                <li key={p.id} className={s.bagCell}>
                  <div className={s.bagPick}>
                    <span className={s.bagIcon}>
                      <RpgIcon art={p.art} size={48} />
                      {count > 1 && <span className={s.qty}>×{count}</span>}
                    </span>
                    <span className={s.bagInfo}>
                      <span className={s.bagName}>{p.name}</span>
                      <span className={s.meta}>{p.desc}</span>
                      <span className={s.meta}>{p.key ? `단축키 ${p.key}` : "자동으로 먹어요"}</span>
                    </span>
                  </div>
                  <div className={s.cellActions}>
                    {count > 1 ? (
                      <SellQty name={p.name} max={count} unit={price} value={n} busy={busy} onChange={(v) => setQtyOf(p.id, v)} onSell={() => sellPotion(p.id, n)} />
                    ) : (
                      <button
                        type="button"
                        className={cx(ui.button, s.sellBtn)}
                        disabled={busy}
                        onClick={() => sellPotion(p.id, 1)}
                        aria-label={`${p.name} 1개 팔기, ${price}포인트`}
                      >
                        팔기 <b>{pts(price)}</b>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 여러 개 되팔기: 0개부터 −/+·모두로 개수를 고르고, 팔기 버튼에 합계를 보여 준다 */
function SellQty({
  name,
  max,
  unit,
  value,
  busy,
  onChange,
  onSell,
}: {
  name: string;
  max: number;
  unit: number;
  value: number;
  busy: boolean;
  onChange: (n: number) => void;
  onSell: () => void;
}) {
  return (
    <div className={s.sellQty}>
      <span className={s.stepper} role="group" aria-label={`${name} 팔 개수 (최대 ${max}개)`}>
        <button type="button" className={cx(ui.button, ui.quiet)} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="1개 줄이기">
          −
        </button>
        <output className={s.sellCount} aria-live="polite">
          {value}
        </output>
        <button type="button" className={ui.button} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="1개 늘리기">
          +
        </button>
        <button type="button" className={cx(ui.button, s.sellAll)} disabled={value >= max} onClick={() => onChange(max)} aria-label={`모두(${max}개) 고르기`}>
          모두
        </button>
      </span>
      <button
        type="button"
        className={cx(ui.button, s.sellBtn)}
        disabled={busy || value < 1}
        onClick={onSell}
        aria-label={`${name} ${value}개 팔기, 합계 ${unit * value}포인트`}
      >
        {value}개 팔기 <b>합계 {pts(unit * value)}</b>
      </button>
    </div>
  );
}

// ── 스킬: 갈래 3개 × 단 5개 트리 창 (SkillTreePanel.tsx) ──
export { SkillPanel } from "./SkillTreePanel";

// ── 상점 ──
// 사내 매점(편의점) 느낌: 차양 간판 + 지갑, 구역(무기·방어구·장신구·물약) 통로 표지, 선반 위 상품 카드
// (썸네일 · 가격표 · 지금 장비와 능력치 비교). 장비 종류가 늘면(catalog GEAR의 새 kind) 구역이 저절로 생긴다

type Aisle = { id: string; label: string; sign: string; kinds: GearKind[] } | { id: "potion"; label: string; sign: string; kinds: [] };
const KNOWN_AISLES: Aisle[] = [
  { id: "weapon", label: "무기", sign: "A1", kinds: ["weapon"] },
  { id: "armor", label: "방어구", sign: "A2", kinds: ["armor", "head"] },
  { id: "acc", label: "장신구", sign: "A3", kinds: ["acc"] },
];
function shopAisles(): Aisle[] {
  const known = new Set<string>(KNOWN_AISLES.flatMap((x) => x.kinds));
  const extra = [...new Set(GEAR.map((g) => g.kind))].filter((k) => !known.has(k));
  return [
    ...KNOWN_AISLES,
    ...extra.map((k, i) => ({
      id: k,
      label: KIND_LABELS[k] ?? k,
      sign: `B${i + 1}`,
      kinds: [k],
    })),
    { id: "potion", label: "물약", sign: "냉장", kinds: [] },
  ];
}

export function ShopPanel({ view, busy, onBuy }: { view: RpgView; busy: boolean; onBuy: (id: string, qty: number) => void }) {
  const aisles = shopAisles();
  const [tab, setTab] = useState<string>(aisles[0].id);
  const aisle = aisles.find((x) => x.id === tab) ?? aisles[0];
  const c = view.character;
  return (
    <div className={cx(s.lobby, s.shop)}>
      <header className={s.shopSign}>
        <span className={s.shopAwning} aria-hidden="true" />
        <div className={s.shopSignRow}>
          <p className={s.shopName}>
            사내 매점 <span className={s.meta}>· 24시 · 법카 불가</span>
          </p>
          <p className={s.shopWallet}>
            내 포인트 <strong className={s.points}>{pts(view.points)}</strong>
          </p>
        </div>
      </header>
      <div className={s.aisles} role="tablist" aria-label="매점 구역">
        {aisles.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={s.aisle} onClick={() => setTab(x.id)}>
            <span className={s.aisleSign}>{x.sign}</span>
            {x.label}
          </button>
        ))}
      </div>
      <div className={s.shelf} role="tabpanel" aria-label={aisle.label}>
        {aisle.id === "potion" ? (
          <div className={s.shelfRow}>
            {POTIONS.map((p) => (
              <article key={p.id} className={s.product}>
                <span className={s.thumb}>
                  <RpgIcon art={p.art} size={48} />
                  {p.key && <span className={s.thumbKey}>{p.key}</span>}
                </span>
                <p className={s.productName}>{p.name}</p>
                <p className={s.meta}>{p.desc}</p>
                <p className={s.meta}>
                  가진 것 {c.potions[p.id] ?? 0}개{p.key ? ` · 단축키 ${p.key}` : " · 자동으로 먹어요"}
                </p>
                <span className={s.priceTag}>{pts(p.price)}</span>
                <div className={s.productBuy}>
                  {[1, 5].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={cx(ui.button, s.small)}
                      disabled={busy || view.points < p.price * q}
                      onClick={() => onBuy(p.id, q)}
                      aria-label={`${p.name} ${q}개, ${p.price * q}포인트에 사기`}
                    >
                      {q}개
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          aisle.kinds.map((kind) => {
            const items = GEAR.filter((g) => g.kind === kind);
            if (items.length === 0) return null;
            const slot = equipTarget(c, kind);
            const worn = gearById(c.equip[slot] ?? "");
            return (
              <section key={kind} className={s.shelfSection} aria-label={KIND_LABELS[kind]}>
                {aisle.kinds.length > 1 && <h4 className={s.skGroup}>{KIND_LABELS[kind]}</h4>}
                <p className={s.meta}>
                  비교 기준: 지금 {SLOT_LABELS[slot]} 칸 — {worn ? worn.name : "비어 있음"}
                </p>
                <div className={s.shelfRow}>
                  {items.map((g) => {
                    const n = c.inv[g.id] ?? 0;
                    const grade = gearGrade(g);
                    const low = c.level < g.reqLevel;
                    const diff = worn?.id === g.id ? [] : gearDiff(c, slot, g.id);
                    const style = weaponStyleText(g);
                    return (
                      <article key={g.id} className={s.product} style={{ "--grade": grade.color } as CSSProperties} data-low={low || undefined}>
                        <span className={s.thumb}>
                          <RpgIcon art={g.art} size={48} />
                          <span className={s.grade} style={{ color: grade.color }}>
                            {grade.label}
                          </span>
                        </span>
                        <p className={s.productName} title={g.desc}>
                          {g.name}
                        </p>
                        <p className={s.meta}>
                          Lv.{g.reqLevel} · {bonusText(g.bonus)}
                        </p>
                        {style && <p className={s.meta}>{style.split(" — ")[0]}</p>}
                        <div className={s.cmpRow} aria-label="지금 장비와 비교">
                          {worn?.id === g.id ? (
                            <span className={s.meta}>지금 끼고 있어요</span>
                          ) : diff.length === 0 ? (
                            <span className={s.meta}>능력치 변화 없음</span>
                          ) : (
                            diff.map((x) => (
                              <span key={x.key} className={x.delta > 0 ? s.deltaUp : s.deltaDown}>
                                {x.label} {deltaText(x.delta)}
                              </span>
                            ))
                          )}
                        </div>
                        {n > 0 && <p className={s.meta}>가진 것 {n}개</p>}
                        {low && <p className={s.warn}>Lv.{g.reqLevel}부터 낄 수 있어요</p>}
                        <span className={s.priceTag}>{pts(g.price)}</span>
                        <div className={s.productBuy}>
                          <button
                            type="button"
                            className={cx(ui.button, s.small)}
                            disabled={busy || view.points < g.price}
                            onClick={() => onBuy(g.id, 1)}
                            aria-label={`${g.name}, ${g.price}포인트에 사기`}
                          >
                            사기
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
