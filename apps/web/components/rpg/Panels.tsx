"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  DIFFICULTIES,
  DIFFS,
  GAMES,
  GEAR,
  gearById,
  KIND_LABELS,
  MONSTERS,
  POTIONS,
  SLOT_LABELS,
  STARS_POINTS,
  STAT_KEYS,
  STAT_LABELS,
  ZONES,
  zoneFor,
  type Difficulty,
  type GameKind,
  type GearKind,
  type Stats,
  type ZoneDef,
  type ZoneId,
} from "@/lib/rpg/catalog";
import { spentStats } from "@/lib/rpg/character";
import type { CharacterAction } from "@/lib/rpg/client";
import { starLabel, transcendStatPoints } from "@/lib/rpg/endgame";
import { countsForRace, derive, HUNT_POINT_T_STOP, huntPointBlock, levelPenalty, STAT_MAX, type Derived } from "@/lib/rpg/formulas";
import { RESPEC_MAX_COST } from "@/lib/rpg/skillRules";
import type { RpgView } from "@/lib/rpg/types";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { weaponStyleText } from "@/lib/rpg/weapons";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { bonusText, pts } from "./format";
import { deltaText, equipTarget, gearDiff, gearGrade } from "./gear";
import { HUNT_KEYS, HUNT_TOUCH } from "./huntKeys";
import HuntCapMeter from "./HuntCap";
import RpgIcon from "./RpgIcon";
import ZonePicker, { ZoneInfo, zoneOpen, zoneUnlockAll } from "./ZonePicker";
import s from "./rpg.module.css";
import ShakeToggle from "./ShakeToggle";
import { useHoldRepeat } from "./useHoldRepeat";

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
  // 터치 기기는 키 대신 화면 조작 안내
  const coarse = useMediaQuery("(pointer: coarse)");
  const how = (g: GameKind) => (coarse ? GAMES[g].howTouch : GAMES[g].how);
  const zone = zoneFor(diff, zoneId);
  const D = DIFFS[diff];
  const low = c.level < D.recLevel;
  // 11/15: 사냥은 그 사냥터가 열리는 레벨, 미니게임은 난이도 권장 레벨보다 10 넘게 높으면 EXP가 깎이고(10%·20 넘으면 2%), 사냥은 주간 레이스(사냥 처치·주간 최단)에도 안 들어간다 (lib/rpg/service)
  const expCut = levelPenalty(c.level, diff, game === "hunt" ? zone : null);
  const noRace = game === "hunt" && !countsForRace(c.level, diff, zone);
  // 11/19 ★58(초월 8)부터는 일반 사냥터 전부 포인트 없음
  const starBlock = game === "hunt" && huntPointBlock(c.level, c.tLevel, diff, zone) === "star";
  const zoneLocked = game === "hunt" && !zoneOpen(zone, c.level, zoneUnlockAll());
  const monsters = [...new Set([...zone.pool])].map((id) => MONSTERS[id].name);
  const canStart = !busy && view.today.runsPerHour > 0 && !zoneLocked;
  // 오늘 사냥 포인트 한도는 늘 막대로 보여 준다 (한도에 닿으면 안내까지)
  const todayLine = (
    <>
      <HuntCapMeter today={view.today} where="start" />
      {/* 11/15 한 시간 판 수 한도(매크로 막기): 남은 판 / 할 수 있는 판 */}
      <RunsHourLine today={view.today} />
    </>
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
        <HuntCapMeter today={view.today} where="start" />
        {/* 11/15 레벨 50 이후의 중심은 마을의 야근 빌딩 (사냥터 창에서는 안내 한 줄만) */}
        {view.endgame && (
          <p className={s.towerHint}>
            <b>레벨 50부터</b> 마을의 야근 빌딩에 들어갈 수 있어요. 마을 북쪽 분양 사무소 옆 높은 건물이에요. 지옥 사냥터에서도 초월 EXP를 받아요.
          </p>
        )}
        <section className={s.section} aria-label="사냥터 고르기">
          <ZonePicker
            level={c.level}
            tLevel={c.tLevel}
            zone={zone.id}
            onZone={onZone}
            detail={
              <>
                <ZoneInfo z={zone} />
                {zoneLocked && (
                  <p className={s.warn}>
                    이 사냥터는 Lv.{zone.unlockLevel}부터 갈 수 있어요.
                  </p>
                )}
                {!zoneLocked && low && <p className={s.warn}>권장 레벨보다 낮아요. 쓰러지면 보상이 절반이에요.</p>}
                {!zoneLocked && starBlock && (
                  <p className={s.warn}>
                    <b>사냥터에서는 포인트를 받을 수 없어요.</b> {starLabel(HUNT_POINT_T_STOP)}부터는 일반 사냥터에서 포인트를 받지 않아요. 잡은 몬스터는 사냥 랭킹과 주간 레이스에도 들어가지 않아요. 초월 경험치와 드롭은 그대로이고, 포인트와 레이스는 야근 빌딩에서 이어 가요.
                  </p>
                )}
                {!zoneLocked && noRace && !starBlock && (
                  <p className={s.warn}>
                    <b>포인트를 받을 수 없는 사냥터예요.</b> 내 레벨이 이 사냥터(Lv.{zone.unlockLevel})보다 10 넘게 높아요. EXP는 {Math.round(expCut * 100)}%만 받고, 잡은 몬스터는 사냥 랭킹과 주간 레이스에 들어가지 않아요. 포인트는 Lv.{c.level - 10} 이상 사냥터에서 받아요.
                  </p>
                )}
                <div className={s.zoneGo}>
                  <RunsHourLine today={view.today} />
                  {/* 화면 흔들림 효과 켜기·끄기: 출발 전에 고른다 (이 기기에 기억) */}
                  <HuntKeysStrip />
                  <ShakeToggle />
                  {startButton}
                </div>
              </>
            }
          />
        </section>
        {onGuide && (
          <p className={s.meta}>
            조작법이나 몬스터 패턴, 보상이 궁금하면{" "}
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
                최대 {game === "hunt" ? DIFFS[d].huntPoints : game === "stars" ? STARS_POINTS[d] : DIFFS[d].miniPoints}P
              </span>
            </button>
          ))}
        </div>
        {game === "hunt" ? (
          <p className={s.meta}>
            <b>{zone.name}</b> {zone.desc} 권장 Lv.{D.recLevel}+, 웨이브 {zone.waves}개, {zone.timeLimitSec}초
            <br />
            {monsters.join(", ")} 등이 나와요. 마지막엔 우두머리 {MONSTERS[zone.boss].name}도 나와요.
          </p>
        ) : (
          <p className={s.meta}>{how(game)}</p>
        )}
        {low && <p className={s.warn}>권장 레벨보다 낮아요. 쓰러지면 보상이 절반이에요.</p>}
      </section>

      <p className={s.meta}>{game === "hunt" ? how("hunt") : "끝나면 점수만큼 포인트와 EXP를 받아요."}</p>

      <div className={cx(s.startRow, s.startDock)}>
        {todayLine}
        {startButton}
      </div>
    </div>
  );
}

// ── 캐릭터 ──

/** 11/19 꾹 누르면 계속 올라가는 +/− (능력치) */
function HoldButton({ className, step, enabled, label, children }: { className: string; step: () => void; enabled: boolean; label: string; children: ReactNode }) {
  const hold = useHoldRepeat(step, enabled);
  return (
    <button type="button" className={className} disabled={!enabled} aria-label={label} title={label} {...hold}>
      {children}
    </button>
  );
}

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
  // 11/19 꾹 누르면 되풀이돼서(useHoldRepeat) 남은 포인트·상한은 바뀐 계획(p)에서 다시 센다
  const bump = (k: keyof Stats, d: number) =>
    setPlan((p) => {
      const cur = p[k] ?? 0;
      if (d > 0) {
        const usedNow = STAT_KEYS.reduce((n, x) => n + (p[x] ?? 0), 0);
        if (c.statPoints - usedNow <= 0 || c.stats[k] + cur >= STAT_MAX) return p;
      } else if (cur <= 0) return p;
      return { ...p, [k]: cur + d };
    });
  // 능력치 초기화: 스킬 초기화와 같은 규칙 (레벨에 따라 지갑 포인트). 서버가 비용을 다시 확인한다
  const [confirmReset, setConfirmReset] = useState(false);
  const spent = spentStats(c);
  const resetCost = view.statResetCost;
  const short = view.points < resetCost;
  return (
    <div className={s.lobby}>
      <section className={s.section} aria-labelledby="rpg-stats">
        <h3 id="rpg-stats" className={s.sectionTitle}>
          {/* 11/15 레벨 50: 초월 레벨 ★ */}
          Lv.{c.level}
          {c.tLevel > 0 && view.endgame ? ` ${starLabel(c.tLevel)}` : ""} 능력치 <span className={s.meta}>· 남은 포인트 {left}</span>
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
                  <HoldButton className={cx(ui.button, ui.quiet)} step={() => bump(k, -1)} enabled={add > 0} label={`${STAT_LABELS[k].name} 1 내리기 (꾹 누르면 계속)`}>
                    −
                  </HoldButton>
                  <HoldButton
                    className={ui.button}
                    step={() => bump(k, 1)}
                    enabled={left > 0 && c.stats[k] + add < STAT_MAX}
                    label={`${STAT_LABELS[k].name} 1 올리기 (꾹 누르면 계속)`}
                  >
                    +
                  </HoldButton>
                </span>
              </div>
            );
          })}
        </div>
        <p className={s.meta}>{STAT_KEYS.map((k) => `${STAT_LABELS[k].name} ${STAT_LABELS[k].desc}.`).join(" ")}</p>
        <div className={s.startRow}>
          <span className={s.meta}>
            레벨이 오를 때마다 능력치 포인트를 3개 받아요. 5의 배수 레벨엔 5개예요.
            {view.endgame ? ` 초월 레벨마다 1개씩 받아요. 초월로 지금까지 ${transcendStatPoints(c.tLevel)}개 받았어요.` : ""}
          </span>
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
        <div className={s.startRow}>
          <span className={s.meta}>
            {view.superHunter ? "테스트 서버 슈퍼 계정이라 능력치 포인트를 최대 레벨만큼 다 받아요. " : ""}
            {`능력치를 되돌리면 지갑(${view.points.toLocaleString("ko-KR")}P)에서 ${resetCost}P가 빠져요. 레벨이 오를수록 비싸지고, 가장 비싸면 ${RESPEC_MAX_COST}P예요.`}
          </span>
          <button type="button" className={ui.button} disabled={busy || spent === 0 || confirmReset} onClick={() => setConfirmReset(true)}>
            능력치 초기화 ({resetCost}P)
          </button>
        </div>
        {confirmReset && (
          <div className={s.confirm} role="alert">
            <p>
              올린 능력치를 모두 되돌리고 포인트 {spent}개를 돌려받아요. 장비로 붙은 능력치와 레벨, 스킬은 그대로예요.{" "}
              지갑에서 {resetCost}P가 빠져요.
            </p>
            <div className={s.cellActions}>
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                disabled={busy || short}
                onClick={() => {
                  setConfirmReset(false);
                  setPlan({});
                  onCharacter({ type: "resetStats", cost: resetCost }, `능력치를 모두 되돌렸어요. 포인트 ${spent}개를 돌려받았어요.`);
                }}
              >
                {short ? "포인트가 모자라요" : `${resetCost}P 내고 초기화`}
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirmReset(false)}>
                그만두기
              </button>
            </div>
          </div>
        )}
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

// ── 장비 ── 11/15 세트 장비·강화와 함께 정리판으로 옮겼다 (components/rpg/GearPanel.tsx)
export { GearPanel } from "./GearPanel";

// ── 스킬: 갈래 4개 × 단 5개 트리 창 + 초월 수련 (SkillTreePanel.tsx · TranscendPanel.tsx) ──
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
  // 단축키는 키보드 기기에서만 보인다
  const coarse = useMediaQuery("(pointer: coarse)");
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
                  가진 것 {c.potions[p.id] ?? 0}개{p.key ? (coarse ? "" : ` · 단축키 ${p.key}`) : " · 자동으로 먹어요"}
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
                  {worn ? `지금 낀 ${SLOT_LABELS[slot]} 장비(${worn.name})와 비교해요` : `지금 ${SLOT_LABELS[slot]} 칸은 비어 있어요`}
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

/** 11/15 출발 전 조작 키 한눈에 (PC는 키, 손가락 기기는 터치 조작). 판 안에서는 H로 다시 본다 */
function HuntKeysStrip() {
  const coarse = useMediaQuery("(pointer: coarse)");
  const rows = coarse ? HUNT_TOUCH : HUNT_KEYS;
  return (
    <details className={s.keysStrip} open={!coarse}>
      <summary>조작 키</summary>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** 11/15 한 시간 사냥 판 수 (매크로 막기): 「한 시간 사냥 한도 24 / 30판 남음」 */
function RunsHourLine({ today }: { today: RpgView["today"] }) {
  const max = today.runsHourMax ?? 30;
  const left = Math.max(0, today.runsPerHour);
  return (
    <p className={s.meta}>
      한 시간 사냥 한도 <strong>{left}</strong> / {max}판 남음
      {left === 0 && <> 다음 정각에 다시 채워져요.</>}
    </p>
  );
}
