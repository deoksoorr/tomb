"use client";

import { useState } from "react";
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
  STAT_KEYS,
  STAT_LABELS,
  ZONES,
  type Difficulty,
  type GameKind,
  type GearKind,
  type GearSlot,
  type SkillId,
  type Stats,
} from "@/lib/rpg/catalog";
import { equippedCount, sellValue } from "@/lib/rpg/character";
import type { CharacterAction } from "@/lib/rpg/client";
import { derive, STAT_MAX, type Derived } from "@/lib/rpg/formulas";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { bonusText, pts } from "./format";
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
            const up = v !== (view.derived[k] as number);
            return (
              <div key={k}>
                <dt>{label}</dt>
                <dd className={up ? s.up : undefined}>{f(v)}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}

// ── 장비 ──

export function GearPanel({ view, busy, onCharacter, onSell }: Common & { onSell: (id: string) => void }) {
  const c = view.character;
  const owned = Object.entries(c.inv).filter(([, n]) => n > 0);
  const equipTo = (kind: GearKind): GearSlot => {
    if (kind !== "acc") return kind;
    return !c.equip.acc1 ? "acc1" : !c.equip.acc2 ? "acc2" : "acc1";
  };
  return (
    <div className={s.lobby}>
      <section className={s.section} aria-labelledby="rpg-equip">
        <h3 id="rpg-equip" className={s.sectionTitle}>
          장착 중
        </h3>
        <div className={s.slots}>
          {GEAR_SLOTS.map((slot) => {
            const g = c.equip[slot] ? gearById(c.equip[slot]!) : undefined;
            return (
              <div key={slot} className={s.slot}>
                {g ? <RpgIcon art={g.art} size={32} /> : <span className={s.slotEmpty} aria-hidden="true" />}
                <div>
                  <p className={s.meta}>{SLOT_LABELS[slot]}</p>
                  <p className={s.rowName}>{g?.name ?? "비어 있음"}</p>
                  {g && (
                    <button type="button" className={cx(ui.button, ui.quiet)} style={{ minHeight: 28, padding: "2px 6px" }} disabled={busy} onClick={() => onCharacter({ type: "equip", slot, itemId: null }, `${g.name}을(를) 뺐어요.`)}>
                      빼기
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className={s.meta}>
          ATK {view.derived.atk} · DEF {view.derived.def} · HP {view.derived.maxHp} · SP {view.derived.maxSp} · 공속 {view.derived.aspd.toFixed(2)} · 치명 {view.derived.crit}%
        </p>
      </section>
      <section className={s.section} aria-labelledby="rpg-inv">
        <h3 id="rpg-inv" className={s.sectionTitle}>
          가방 <span className={s.meta}>· 되팔면 산 값의 50% (드롭한 장비는 사냥 포인트 한도 안에서)</span>
        </h3>
        {owned.length === 0 && <p className={s.meta}>가진 장비가 없어요. 상점에서 사거나 사냥터에서 주워요.</p>}
        <ul className={s.list}>
          {owned.map(([id, n]) => {
            const g = gearById(id);
            if (!g) return null;
            const eq = equippedCount(c, id);
            const free = n - eq;
            const slot = equipTo(g.kind);
            return (
              <li key={id} className={s.row}>
                <RpgIcon art={g.art} size={32} />
                <div>
                  <p className={s.rowName}>
                    {g.name} {n > 1 && <span className={s.meta}>×{n}</span>} {eq > 0 && <span className={s.plus}>장착 중</span>}
                  </p>
                  <p className={s.meta}>
                    {KIND_LABELS[g.kind]} · Lv.{g.reqLevel} · {bonusText(g.bonus)}
                  </p>
                  {c.level < g.reqLevel && <p className={s.warn}>레벨 {g.reqLevel}부터 낄 수 있어요</p>}
                </div>
                <div className={s.rowActions}>
                  <button
                    type="button"
                    className={cx(ui.button, s.small)}
                    disabled={busy || free < 1 || c.level < g.reqLevel}
                    onClick={() => onCharacter({ type: "equip", slot, itemId: id }, `${g.name}을(를) ${SLOT_LABELS[slot]}에 꼈어요.`)}
                  >
                    장착
                  </button>
                  <button type="button" className={cx(ui.button, ui.quiet, s.small)} disabled={busy || free < 1} onClick={() => onSell(id)} aria-label={`${g.name} 팔기, ${sellValue(g.price)}포인트`}>
                    팔기 {sellValue(g.price)}P
                  </button>
                </div>
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

