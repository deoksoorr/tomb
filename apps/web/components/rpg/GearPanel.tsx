"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { GEAR, GEAR_SLOTS, gearById, KIND_LABELS, POTIONS, SLOT_LABELS, slotKind, type GearDef, type GearSlot } from "@/lib/rpg/catalog";
import { GEAR_INV_MAX, sellValue } from "@/lib/rpg/character";
import { rpgApi, type CharacterAction, type GearAction } from "@/lib/rpg/client";
import { DISASSEMBLE } from "@/lib/rpg/enhance";
import { derive, type Derived } from "@/lib/rpg/formulas";
import {
  activeSets,
  baseGearId,
  decodeSg,
  enhOfId,
  isSgCode,
  MAT_IDS,
  MAT_INFO,
  MAT_KEY,
  optText,
  SG_INV_MAX,
  SG_LEGENDS,
  SG_PIECE_KIND,
  SG_SET_INFO,
  SG_SETS,
  SHOP_ENH_MAX,
  sgPieceOf,
  sgSetOf,
  sgUid,
  pieceUid,
  unenhanced,
  shopPieceOf,
  type SgSet,
} from "@/lib/rpg/setGear";
import type { RpgView } from "@/lib/rpg/types";
import { weaponStyleOf, weaponStyleText } from "@/lib/rpg/weapons";
import { errorMessage } from "@/lib/api";
import { josa } from "@/lib/rpg/skillText";
import { cx } from "../ui/cx";
import { DollSlot, PaperDoll } from "../ui/PaperDoll";
import ui from "../ui/ui.module.css";
import { bonusText, pts } from "./format";
import {
  bagEntries,
  deltaText,
  equipTarget,
  gearDiff,
  gearGrade,
  sellWarning,
  sgGrade,
  slotAccepts,
  slotGrade,
  type BagEntry,
  type BagTab,
  type StatDiff,
  statParts,
} from "./gear";
import EnhanceDialog, { type EnhanceTab } from "./EnhanceDialog";
import HuntCapMeter from "./HuntCap";
import HuntDoll from "./HuntDoll";
import RpgIcon from "./RpgIcon";
import { ExchangeDialog } from "./SetGearBag";
import s from "./rpg.module.css";
import g from "./gearPanel.module.css";

// 11/15 사냥 장비창 (정리판): 왼쪽 = 지금 낀 사냥 장비를 입은 인형·세트 효과·전투 능력, 오른쪽 = 가방 (부위·재료·물약 칸).
// 가방은 세트 장비(세트별, "야근 2/4") → 상점·주운 장비 순, 높은 직급·강화·레벨 먼저, 못 끼는 것은 흐리게 맨 아래.
// 누르면 그 자리에서 펼쳐져 지금 낀 것과 비교(오르면 초록, 내리면 빨강)·옵션·세트 효과·할 수 있는 일(장착·강화·옵션 굴리기·분해·팔기).

type Props = {
  view: RpgView;
  busy: boolean;
  onCharacter: (a: CharacterAction, ok?: string) => void;
  onSell: (id: string, count?: number) => void;
  /** 세트 장비·강화 요청이 돌려준 화면 정보 (없으면 강화·세트 장비 버튼이 안 보인다) */
  onView?: (v: RpgView) => void;
  figure: { color: string; body: string; look: readonly string[] };
};

const GEAR_AREAS = `". head ." "weapon fig armor" "acc1 fig acc2"`;
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
const TABS: [BagTab, string][] = [
  ["all", "전체"],
  ["weapon", "무기"],
  ["armor", "갑옷"],
  ["head", "머리"],
  ["acc", "장신구"],
  ["mats", "재료"],
  ["potions", "물약"],
];

const enhTier = (e: number) => (e >= 15 ? 3 : e >= 13 ? 2 : e >= 10 ? 1 : 0);
const plusName = (name: string, e: number) => (e > 0 ? `${name} +${e}` : name);
type Dlg = { kind: "enhance"; sg?: number; shop?: string; piece?: number; tab: EnhanceTab } | { kind: "exchange" } | null;

export function GearPanel({ view, busy, onCharacter, onSell, onView, figure }: Props) {
  const c = view.character;
  const level = c.level;
  const [tab, setTab] = useState<BagTab>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [slotSel, setSlotSel] = useState<GearSlot | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [gBusy, setGBusy] = useState(false);
  const working = busy || gBusy;
  const mats = { doc: 0, seal: 0, prot: 0, ...c.mats };
  const { sets, shop } = bagEntries(c, level, tab === "mats" || tab === "potions" ? "all" : tab);
  const all: BagEntry[] = [...sets.flatMap((x) => x.items), ...shop];
  const openEntry = all.find((x) => x.key === open) ?? null;
  const counts = activeSets(c.equip).counts;
  const sgTotal = c.sg?.length ?? 0;
  const shopTotal = Object.values(c.inv).reduce((a, b) => a + b, 0) + (c.si?.length ?? 0);
  // 11/15 전투 능력 중 강화로 붙은 몫 (강화를 뺀 장착 칸과 비교)
  const plain = derive(c.level, c.stats, unenhanced(c.equip));
  const enhPart = (k: keyof Derived) => Math.round(((view.derived[k] as number) - (plain[k] as number)) * 100) / 100;

  /** 이 장비가 들어갈 칸: 칸을 먼저 골랐고 맞으면 그 칸, 아니면 빈 칸 먼저 */
  const targetOf = (gear: GearDef): GearSlot => (slotSel && slotAccepts(slotSel, gear.kind) ? slotSel : equipTarget(c, gear.kind));
  const idOf = (x: BagEntry) => (x.type === "sg" ? x.code : (x.piece?.code ?? x.gear.id));
  const wornSlot = (x: BagEntry): GearSlot | null =>
    x.type === "sg"
      ? x.slot
      : x.piece
        ? x.piece.slot
        : (GEAR_SLOTS.find((k) => c.equip[k] && !shopPieceOf(c.equip[k]) && baseGearId(c.equip[k]!) === x.gear.id) ?? null);
  const diffOf = (x: BagEntry): StatDiff[] => (wornSlot(x) && (x.type === "sg" || x.count - x.equipped < 1) ? [] : gearDiff(c, targetOf(x.gear), idOf(x)));
  const openDiff = openEntry ? diffOf(openEntry) : [];
  const deltaOf = new Map(openDiff.map((d) => [d.key, d.delta]));

  async function gear(a: GearAction, ok: string) {
    if (!onView) return;
    setGBusy(true);
    setMsg(null);
    try {
      onView(await rpgApi.gear(a));
      setMsg(ok);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setGBusy(false);
    }
  }

  function pickSlot(slot: GearSlot) {
    if (slotSel === slot) {
      setSlotSel(null);
      setTab("all");
      return;
    }
    setSlotSel(slot);
    setTab(slotKind(slot));
    const id = c.equip[slot];
    if (id) setOpen(isSgCode(id) ? `sg${sgUid(id)}` : shopPieceOf(id) ? `si${pieceUid(id)}` : baseGearId(id));
  }

  function equipEntry(x: BagEntry) {
    const slot = targetOf(x.gear);
    if (x.type === "sg" || x.piece)
      void gear({ type: "equip", slot, uid: x.type === "sg" ? x.it.u : x.piece!.u }, `${josa(x.gear.name, "을", "를")} ${SLOT_LABELS[slot]}에 꼈어요.`);
    else onCharacter({ type: "equip", slot, itemId: x.gear.id }, `${josa(x.gear.name, "을", "를")} ${SLOT_LABELS[slot]}에 꼈어요.`);
  }

  function unequip(slot: GearSlot) {
    const id = c.equip[slot];
    const name = id ? gearById(id)?.name : null;
    onCharacter({ type: "equip", slot, itemId: null }, name ? `${josa(name, "을", "를")} 뺐어요.` : undefined);
  }

  function sell(x: Extract<BagEntry, { type: "shop" }>, n: number) {
    if (n < 1) return;
    if (confirm !== `sell:${x.key}` && sellWarning(c, x.gear, n)) {
      setConfirm(`sell:${x.key}`);
      return;
    }
    setConfirm(null);
    setQty((q) => ({ ...q, [x.key]: 0 }));
    if (x.count - x.equipped <= n) setOpen(null);
    // 11/15 강화한 한 개는 번호로 판다
    if (x.piece && onView) {
      const base = shopPieceOf(x.piece.code)!.id;
      setGBusy(true);
      rpgApi
        .sellPiece(base, x.piece.u)
        .then((v) => {
          onView(v);
          setMsg(v.sold ? `${josa(plusName(x.gear.name, x.enh), "을", "를")} ${pts(v.sold.value)}에 팔았어요.` : null);
        })
        .catch((e) => setMsg(errorMessage(e)))
        .finally(() => setGBusy(false));
      return;
    }
    onSell(x.gear.id, n);
  }

  // ── 왼쪽: 인형 ──
  const doll = (
    <PaperDoll
      areas={GEAR_AREAS}
      label="사냥 장비 칸"
      figure={<HuntDoll equip={c.equip} color={figure.color} body={figure.body} look={figure.look} label="지금 낀 사냥 장비를 입은 내 캐릭터" />}
    >
      {GEAR_SLOTS.map((slot) => {
        const id = c.equip[slot];
        const def = id ? gearById(id) : undefined;
        const grade = slotGrade(id);
        const e = enhOfId(id);
        return (
          <DollSlot
            key={slot}
            area={slot}
            label={SLOT_LABELS[slot]}
            name={def ? plusName(def.name, e) : null}
            icon={def ? <SlotIcon art={def.art} e={e} color={grade?.color} /> : null}
            silhouette={<RpgIcon art={gearById(GEAR_SILHOUETTE[slot])?.art ?? GEAR[0].art} size={32} />}
            sub={grade?.label ?? null}
            tone={grade?.color}
            tip={
              def
                ? {
                    title: plusName(def.name, e),
                    body: `${grade?.label ?? ""} · ${bonusText(def.bonus)}`,
                  }
                : {
                    title: `${SLOT_LABELS[slot]} 칸이 비어 있어요`,
                    body: "누르면 이 칸에 낄 장비만 보여요.",
                  }
            }
            selected={slotSel === slot}
            highlight={!!openEntry && !wornSlot(openEntry) && targetOf(openEntry.gear) === slot}
            ariaLabel={`${SLOT_LABELS[slot]} 칸, ${def ? `${plusName(def.name, e)} 끼는 중` : "비어 있음"}. 누르면 이 칸 장비만 보기`}
            onClick={() => pickSlot(slot)}
          />
        );
      })}
    </PaperDoll>
  );

  return (
    <div className={s.lobby}>
      <HuntCapMeter today={view.today} where="bag" />
      <div className={g.wrap}>
        <div className={g.left}>
          {doll}
          <div className={g.sets} aria-label="세트 효과">
            {SG_SETS.map((set) => (
              <span
                key={set}
                className={g.setChip}
                data-on={counts[set] >= 2 || undefined}
                style={{ "--set": SG_SET_INFO[set].color } as CSSProperties}
                title={`2개 끼면 ${SG_SET_INFO[set].two}, 4개 끼면 ${SG_SET_INFO[set].four}`}
              >
                <b>{SG_SET_INFO[set].short}</b> {counts[set]}/4
              </span>
            ))}
          </div>
          <section className={cx(s.statPanel, g.statBox)} aria-labelledby="rpg-total">
            <h3 id="rpg-total" className={s.sectionTitle}>
              전투 능력 {openDiff.length > 0 && <span className={s.meta}>· 바꾸면</span>}
            </h3>
            <dl className={s.totals}>
              {TOTAL_ROWS.map(([k, label, f]) => {
                const d = deltaOf.get(k);
                return (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>
                      {f(view.derived[k])}
                      {enhPart(k) > 0 && (
                        <span className={g.enhPart} title="강화로 더해진 몫">
                          {" "}
                          (+{f(enhPart(k)).replace("×", "")})
                        </span>
                      )}
                      {d !== undefined && <span className={d > 0 ? s.deltaUp : s.deltaDown}>{deltaText(d)}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        </div>

        <div className={g.right}>
          <div className={g.tabs} role="tablist" aria-label="가방 칸">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={cx(ui.button, s.small)}
                onClick={() => {
                  setTab(k);
                  setSlotSel(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={g.mats} aria-label="강화 재료">
            {MAT_IDS.map((id) => (
              <span key={id} className={g.mat} title={MAT_INFO[id].desc}>
                <RpgIcon art={MAT_INFO[id].art} size={16} />
                {MAT_INFO[id].name} <b>{mats[MAT_KEY[id]].toLocaleString("ko-KR")}</b>
              </span>
            ))}
          </div>
          {msg && (
            <p className={g.note} role="status">
              {msg}
            </p>
          )}

          {tab === "mats" ? (
            <ul className={g.list}>
              {MAT_IDS.map((id) => (
                <li key={id} className={g.row}>
                  <div className={g.pick}>
                    <span className={g.icon}>
                      <RpgIcon art={MAT_INFO[id].art} size={32} />
                    </span>
                    <span className={g.info}>
                      <span className={g.name}>{MAT_INFO[id].name}</span>
                      <span className={g.sub}>{MAT_INFO[id].desc}</span>
                    </span>
                    <span className={g.tag}>{mats[MAT_KEY[id]].toLocaleString("ko-KR")}</span>
                  </div>
                </li>
              ))}
              <li className={g.note}>재료는 다른 사람에게 줄 수 없어요. 쓰지 않는 세트 장비를 분해해도 나와요.</li>
            </ul>
          ) : tab === "potions" ? (
            <PotionList view={view} busy={working} qty={qty} setQty={setQty} onSell={onSell} />
          ) : (
            <>
              <div className={g.groupHead}>
                <span>
                  세트 장비{" "}
                  <small>
                    {sgTotal}/{SG_INV_MAX}
                  </small>
                </span>
                {onView && sgTotal >= 3 && (
                  <button type="button" className={cx(ui.button, s.small)} onClick={() => setDlg({ kind: "exchange" })}>
                    바꾸기
                  </button>
                )}
              </div>
              {sets.length === 0 && (
                <p className={g.note}>{sgTotal ? "이 부위 세트 장비가 없어요." : "야근 빌딩 우두머리 상자에서 나와요. 레벨 50부터 낄 수 있어요."}</p>
              )}
              {sets.map(({ set, items }) => (
                <div key={set} className={g.list}>
                  <div className={g.groupHead}>
                    <span style={{ color: SG_SET_INFO[set].color }}>
                      {SG_SET_INFO[set].name}{" "}
                      <small>
                        {counts[set]}/4 · {SG_SET_INFO[set].styles}
                      </small>
                    </span>
                  </div>
                  <ul className={g.list}>
                    {items.map((x) => (
                      <Row key={x.key} x={x} open={open === x.key} onToggle={() => setOpen(open === x.key ? null : x.key)}>
                        <SgDetail
                          x={x}
                          set={set}
                          count={counts[set]}
                          diff={diffOf(x)}
                          target={targetOf(x.gear)}
                          cur={c.equip[targetOf(x.gear)]}
                          busy={working}
                          canGear={!!onView}
                          confirming={confirm === `dis:${x.key}`}
                          onEquip={() => equipEntry(x)}
                          onUnequip={() => x.slot && unequip(x.slot)}
                          onEnhance={(t) => setDlg({ kind: "enhance", sg: x.it.u, tab: t })}
                          onDisassemble={() => {
                            if (confirm !== `dis:${x.key}`) return setConfirm(`dis:${x.key}`);
                            setConfirm(null);
                            setOpen(null);
                            const got = DISASSEMBLE[x.it.g];
                            void gear(
                              { type: "disassemble", uids: [x.it.u] },
                              `분해해서 결재 서류 ${got.doc}장${got.seal ? `, 인감 도장 ${got.seal}개` : ""}를 받았어요.`,
                            );
                          }}
                          onCancel={() => setConfirm(null)}
                        />
                      </Row>
                    ))}
                  </ul>
                </div>
              ))}

              <div className={g.groupHead}>
                <span>
                  상점·주운 장비{" "}
                  <small>
                    {shopTotal}/{GEAR_INV_MAX}
                  </small>
                </span>
              </div>
              {shop.length === 0 && <p className={g.note}>{shopTotal ? "이 부위 장비가 없어요." : "상점에서 사거나 사냥터에서 주워요."}</p>}
              <ul className={g.list}>
                {shop.map((x) => {
                  const free = x.count - x.equipped;
                  const n = free > 1 ? Math.min(qty[x.key] ?? 0, free) : 1;
                  return (
                    <Row key={x.key} x={x} open={open === x.key} onToggle={() => setOpen(open === x.key ? null : x.key)}>
                      <div className={g.detail}>
                        <Compare diff={diffOf(x)} target={targetOf(x.gear)} cur={c.equip[targetOf(x.gear)]} worn={free < 1} />
                        <p className={g.note}>
                          {x.gear.desc}
                          {x.gear.kind === "weapon" ? ` · ${weaponStyleText(x.gear)}` : ""}
                        </p>
                        {confirm === `sell:${x.key}` ? (
                          <div className={g.confirm} role="alert">
                            <p>{sellWarning(c, x.gear, n)}</p>
                            <div className={g.actions}>
                              <button type="button" className={cx(ui.button, s.sellBtn)} disabled={working} onClick={() => sell(x, n)}>
                                {n > 1 ? `${n}개 ` : ""}
                                {pts(sellValue(x.gear.price) * n)}에 팔기
                              </button>
                              <button type="button" className={ui.button} onClick={() => setConfirm(null)}>
                                그만두기
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={g.actions}>
                            {free < 1 ? (
                              <button type="button" className={ui.button} disabled={working} onClick={() => unequip(wornSlot(x)!)}>
                                빼기
                              </button>
                            ) : (
                              <button type="button" className={cx(ui.button, ui.primary)} disabled={working || x.low} onClick={() => equipEntry(x)}>
                                장착
                              </button>
                            )}
                            {onView && (
                              <button
                                type="button"
                                className={ui.button}
                                disabled={working || x.enh >= SHOP_ENH_MAX}
                                onClick={() =>
                                  setDlg(x.piece ? { kind: "enhance", piece: x.piece.u, tab: "enhance" } : { kind: "enhance", shop: x.gear.id, tab: "enhance" })
                                }
                              >
                                {x.enh >= SHOP_ENH_MAX ? "강화 끝 +5" : "강화"}
                              </button>
                            )}
                            {free > 1 ? (
                              <SellQty
                                name={x.gear.name}
                                max={free}
                                unit={sellValue(x.gear.price)}
                                value={n}
                                busy={working}
                                onChange={(v) =>
                                  setQty((q) => ({
                                    ...q,
                                    [x.key]: Math.max(0, v),
                                  }))
                                }
                                onSell={() => sell(x, n)}
                              />
                            ) : free > 0 ? (
                              <button type="button" className={cx(ui.button, s.sellBtn)} disabled={working} onClick={() => sell(x, 1)}>
                                팔기 <b>{pts(sellValue(x.gear.price))}</b>
                              </button>
                            ) : null}
                          </div>
                        )}
                        {!x.piece && x.count > 1 && <p className={g.note}>강화하면 한 개만 떼어 따로 올려요.</p>}
                      </div>
                    </Row>
                  );
                })}
              </ul>
              <p className={g.note}>되팔면 산 값의 50%를 받아요. 주운 장비는 오늘 사냥 포인트 한도까지만 받아요.</p>
            </>
          )}
        </div>
      </div>
      {dlg?.kind === "enhance" && onView && (
        <EnhanceDialog
          view={view}
          target={dlg.sg !== undefined ? { sg: dlg.sg } : dlg.piece !== undefined ? { piece: dlg.piece } : { shop: dlg.shop! }}
          tab={dlg.tab}
          onClose={() => setDlg(null)}
          onView={onView}
        />
      )}
      {dlg?.kind === "exchange" && onView && <ExchangeDialog view={view} onClose={() => setDlg(null)} onView={onView} />}
    </div>
  );
}

/** 능력치 한 줄: 강화로 붙은 몫 (+N)만 강화 색(--enh) */
function EnhStats({ id }: { id: string }) {
  return (
    <>
      {statParts(id).map((p, i) => (
        <span key={p.k}>
          {i > 0 && " · "}
          {p.label} {p.base}
          {p.plus && <span className={g.enhPart}> (+{p.plus})</span>}
        </span>
      ))}
    </>
  );
}

/** 칸·목록 아이콘 (직급·등급 테 + 강화 수치) */
function SlotIcon({ art, e, color }: { art: GearDef["art"]; e: number; color?: string }) {
  return (
    <span
      className={g.icon}
      style={
        {
          "--grade": color ?? "var(--text)",
          width: 36,
          height: 36,
        } as CSSProperties
      }
    >
      <RpgIcon art={art} size={32} />
      {e > 0 && (
        <span className={g.enh} data-tier={enhTier(e)}>
          +{e}
        </span>
      )}
    </span>
  );
}

/** 가방 한 줄 (누르면 펼친다) */
function Row({ x, open, onToggle, children }: { x: BagEntry; open: boolean; onToggle: () => void; children: ReactNode }) {
  const isSg = x.type === "sg";
  const grade = isSg ? sgGrade(x.it) : gearGrade(x.gear);
  const e = isSg ? x.it.e : x.enh;
  const worn = isSg ? !!x.slot : x.equipped > 0;
  const sub = isSg
    ? `${grade.label} · ${KIND_LABELS[SG_PIECE_KIND[sgPieceOf(x.it)]]}`
    : `${grade.label} · ${KIND_LABELS[x.gear.kind]} · Lv.${x.gear.reqLevel}${x.gear.kind === "weapon" ? ` · ${weaponStyleOf(x.gear).name}` : ""}`;
  return (
    <li className={g.row} data-open={open || undefined} data-low={x.low || undefined} style={{ "--grade": grade.color } as CSSProperties}>
      <button
        type="button"
        className={g.pick}
        aria-expanded={open}
        onClick={onToggle}
        aria-label={`${plusName(x.gear.name, e)}, ${sub}${worn ? ", 끼는 중" : ""}${x.low ? ", 아직 못 껴요" : ""}`}
      >
        <span className={g.icon}>
          <RpgIcon art={x.gear.art} size={32} />
          {e > 0 && (
            <span className={g.enh} data-tier={enhTier(e)}>
              +{e}
            </span>
          )}
          {!isSg && x.count > 1 && <span className={g.count}>×{x.count}</span>}
        </span>
        <span className={g.info}>
          <span className={g.name}>{plusName(x.gear.name, e)}</span>
          <span className={g.sub}>{sub}</span>
          <span className={g.opts}>
            {isSg ? (
              x.it.o.map(([k, v]) => optText(k, v)).join(" · ") + (x.it.L ? ` · ${SG_LEGENDS[x.it.L].name}` : "")
            ) : (
              <EnhStats id={x.piece?.code ?? x.gear.id} />
            )}
          </span>
        </span>
        {worn ? (
          <span className={g.tag}>{isSg && x.slot ? SLOT_LABELS[x.slot] : "끼는 중"}</span>
        ) : x.low ? (
          <span className={g.sub}>Lv.{x.gear.reqLevel}부터</span>
        ) : null}
      </button>
      {open && children}
    </li>
  );
}

/** 지금 그 칸에 낀 것과 비교 (오르면 초록, 내리면 빨강) */
function Compare({ diff, target, cur, worn }: { diff: StatDiff[]; target: GearSlot; cur: string | null; worn: boolean }) {
  if (worn) return <p className={g.note}>지금 끼고 있어요.</p>;
  const curDef = cur ? gearById(cur) : undefined;
  return (
    <>
      <p className={g.note}>{curDef ? `${SLOT_LABELS[target]}의 ${plusName(curDef.name, enhOfId(cur))} 대신 끼면` : `빈 ${SLOT_LABELS[target]} 칸에 끼면`}</p>
      {diff.length === 0 ? (
        <p className={g.note}>달라지는 능력치가 없어요.</p>
      ) : (
        <dl className={g.diff}>
          {diff.map((d) => (
            <div key={d.key}>
              <dt>{d.label}</dt>
              <dd className={d.delta > 0 ? g.up : g.down}>{deltaText(d.delta)}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function SgDetail({
  x,
  set,
  count,
  diff,
  target,
  cur,
  busy,
  canGear,
  confirming,
  onEquip,
  onUnequip,
  onEnhance,
  onDisassemble,
  onCancel,
}: {
  x: Extract<BagEntry, { type: "sg" }>;
  set: SgSet;
  count: number;
  diff: StatDiff[];
  target: GearSlot;
  cur: string | null;
  busy: boolean;
  canGear: boolean;
  confirming: boolean;
  onEquip: () => void;
  onUnequip: () => void;
  onEnhance: (tab: EnhanceTab) => void;
  onDisassemble: () => void;
  onCancel: () => void;
}) {
  const info = SG_SET_INFO[set];
  const got = DISASSEMBLE[x.it.g];
  // 이 장비를 끼면 세트 몇 부위가 되나 (같은 세트의 같은 부위를 이미 끼고 있으면 그대로)
  const curIt = cur && isSgCode(cur) ? decodeSg(cur) : null;
  const after = x.slot ? count : count + (curIt && sgSetOf(curIt) === set ? 0 : 1);
  return (
    <div className={g.detail}>
      <Compare diff={diff} target={target} cur={cur} worn={!!x.slot} />
      <ul className={g.optList}>
        <li>
          기본 <EnhStats id={x.code} />
        </li>
        {x.it.o.map(([k, v]) => (
          <li key={k}>{optText(k, v)}</li>
        ))}
        {x.it.L > 0 && (
          <li className={g.legend}>
            {SG_LEGENDS[x.it.L].name} · {SG_LEGENDS[x.it.L].desc}
          </li>
        )}
      </ul>
      <div className={g.setFx}>
        <span>
          {info.name} {x.slot ? `${count}/4` : `${count}/4, 끼면 ${Math.min(5, after)}/4`}
        </span>
        <span data-on={count >= 2 || undefined}>2개 끼면 {info.two}</span>
        <span data-on={count >= 4 || undefined}>4개 끼면 {info.four}</span>
      </div>
      <p className={g.note}>
        {x.gear.desc}
        {x.gear.kind === "weapon" ? ` · ${weaponStyleText(x.gear)}` : ""}
      </p>
      {confirming ? (
        <div className={g.confirm} role="alert">
          <p>
            분해하면 결재 서류 {got.doc}장{got.seal ? `과 인감 도장 ${got.seal}개` : ""}를 받아요.
            {x.it.e > 0 ? ` 강화 +${x.it.e}도 사라져요.` : ""}
          </p>
          <div className={g.actions}>
            <button type="button" className={cx(ui.button, s.sellBtn)} disabled={busy} onClick={onDisassemble}>
              분해하기
            </button>
            <button type="button" className={ui.button} onClick={onCancel}>
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <div className={g.actions}>
          {x.slot ? (
            <button type="button" className={ui.button} disabled={busy} onClick={onUnequip}>
              빼기
            </button>
          ) : (
            <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || x.low || !canGear} onClick={onEquip}>
              장착
            </button>
          )}
          {canGear && (
            <>
              <button type="button" className={ui.button} disabled={busy || x.it.e >= 15} onClick={() => onEnhance("enhance")}>
                {x.it.e >= 15 ? "강화 끝 +15" : "강화"}
              </button>
              <button type="button" className={ui.button} disabled={busy} onClick={() => onEnhance("reroll")}>
                옵션 굴리기
              </button>
              <button type="button" className={ui.button} disabled={busy || !!x.slot} onClick={onDisassemble}>
                분해
              </button>
            </>
          )}
        </div>
      )}
      {x.low && <p className={s.warn}>레벨 50부터 낄 수 있어요.</p>}
    </div>
  );
}

function PotionList({
  view,
  busy,
  qty,
  setQty,
  onSell,
}: {
  view: RpgView;
  busy: boolean;
  qty: Record<string, number>;
  setQty: (f: (q: Record<string, number>) => Record<string, number>) => void;
  onSell: (id: string, count?: number) => void;
}) {
  const c = view.character;
  const potions = POTIONS.flatMap((p) => ((c.potions[p.id] ?? 0) > 0 ? [{ p, count: c.potions[p.id] }] : []));
  if (!potions.length) return <p className={g.note}>물약이 없어요. 상점에서 사거나 사냥터에서 주워요.</p>;
  return (
    <ul className={g.list}>
      {potions.map(({ p, count }) => {
        const price = sellValue(p.price);
        const n = count > 1 ? Math.min(qty[p.id] ?? 0, count) : 1;
        const sell = (k: number) => {
          if (k < 1) return;
          setQty((q) => ({ ...q, [p.id]: 0 }));
          onSell(p.id, k);
        };
        return (
          <li key={p.id} className={g.row}>
            <div className={g.pick}>
              <span className={g.icon}>
                <RpgIcon art={p.art} size={32} />
                {count > 1 && <span className={g.count}>×{count}</span>}
              </span>
              <span className={g.info}>
                <span className={g.name}>{p.name}</span>
                <span className={g.sub}>{p.desc}</span>
                <span className={g.sub}>{p.key ? `단축키 ${p.key}` : "자동으로 먹어요"}</span>
              </span>
            </div>
            <div className={g.detail}>
              <div className={g.actions}>
                {count > 1 ? (
                  <SellQty
                    name={p.name}
                    max={count}
                    unit={price}
                    value={n}
                    busy={busy}
                    onChange={(v) => setQty((q) => ({ ...q, [p.id]: Math.max(0, v) }))}
                    onSell={() => sell(n)}
                  />
                ) : (
                  <button type="button" className={cx(ui.button, s.sellBtn)} disabled={busy} onClick={() => sell(1)}>
                    팔기 <b>{pts(price)}</b>
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
      <li className={g.note}>되팔면 값의 50%를 받아요. 오늘 사냥 포인트 한도가 차면 못 팔고 가방에 남아요.</li>
    </ul>
  );
}

/** 여러 개 되팔기: 0개부터 −/+·모두로 개수를 고르고, 팔기 버튼에 합계를 보여 준다 */
export function SellQty({
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
