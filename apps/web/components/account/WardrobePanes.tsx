"use client";

import { useState } from "react";
import { DIR, isChampItem, type CosmeticSlot } from "@tomb/protocol";
import { fittingLook } from "../shop/fitting";
import { OutfitCanvas, useOutfitView, ViewControls } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import { DollSlot, PaperDoll } from "../ui/PaperDoll";
import StyledName from "../ui/StyledName";
import ui from "../ui/ui.module.css";
import { takeOff, wearCosmetic, wearStashed } from "./actions";
import { remainingLabel } from "./items";
import {
  displaced,
  entryStatus,
  matchesSlot,
  SLOT_NAMES,
  SLOT_ORDER,
  SLOT_SILHOUETTE,
  slotCounts,
  timeLeftRatio,
  wearAction,
  wornBySlot,
  type SlotFilter,
  type WardrobeEntry,
} from "./wardrobe";
import styles from "./WardrobePanes.module.css";

// 가방 캐릭터 꾸미기 두 화면:
//  - [지금 모습] LookPane: 아바타 크게 + 부위 칸 9개(입은 것·남은 기간) + 내 이름표 + 방향·자세 + 착용 수·꾸미기 점수.
//    부위 칸을 누르면 [꾸미기]의 그 부위 목록으로 넘어간다
//  - [꾸미기] PickPane: 부위 칩(가진 개수) → 카드 목록(입기·벗기·남은 기간/영구). 카드를 고르면 옆(폰은 위)의
//    작은 입어 보기(지금 모습 + 고른 것, 이름 꾸미기면 이름표까지)에 보이고 거기서도 입는다
// 주간 1위 전용 모자는 [레이스 보상] 칸에서 다룬다 (지금 모습에는 입은 그대로 보이고, 목록·칩 개수에서는 뺀다)

/** 몸 위치에 맞춘 칸 배치 (낮은 칸 compact): 아바타는 가운데 세 줄, 왼쪽 머리·등·오라, 오른쪽 목·손·펫, 맨 아래 이름 글자·발·이름표 */
const DOLL_AREAS = `"head fig neck" "back fig hand" "aura fig pet" "nameColor feet namePlate"`;

type Act = (task: () => Promise<void>, done: string) => Promise<void>;
type Avatar = { color: string; body: string };

/** 지금 입은 것 (부위 순) */
function wornLook(entries: readonly WardrobeEntry[]): string[] {
  const worn = wornBySlot(entries);
  return SLOT_ORDER.flatMap((s) => (worn[s] ? [worn[s]!.item.id] : []));
}

/** 입기·벗기 (기존 규칙 그대로: 새것은 쓰는 순간 24시간 시작, 벗어 둔 것은 남은 시간 그대로, 같은 부위는 바꿔 끼운다) */
function runWear(entries: readonly WardrobeEntry[], e: WardrobeEntry, act: Act): Promise<void> {
  const a = wearAction(e);
  const name = e.item.name;
  if (a.kind === "unequip") return act(() => takeOff(e.slot), `${name}을(를) 벗어 두었어요. 남은 시간은 계속 흘러요.`);
  const old = displaced(entries, e);
  const swap = old ? ` ${old.name}은(는) 벗어 두었어요.` : "";
  if (a.kind === "spend") return act(() => wearCosmetic(e.item.id), `${name}을(를) 입었어요. 지금부터 24시간 유지돼요.${swap}`);
  return act(() => wearStashed(e.item.id), `${name}을(를) 다시 입었어요.${swap}`);
}

// ── [지금 모습] ──

export function LookPane({
  entries,
  now,
  avatar,
  score,
  name,
  onPickSlot,
}: {
  entries: WardrobeEntry[];
  now: number;
  avatar: Avatar;
  /** 내 꾸미기 점수 (lib/lookScore) */
  score: number;
  /** 내 이름 (이름표 미리보기) */
  name: string;
  /** 부위 칸을 눌렀다 → [꾸미기]의 그 부위 목록으로 */
  onPickSlot: (slot: CosmeticSlot) => void;
}) {
  const view = useOutfitView(false);
  const worn = wornBySlot(entries);
  const look = wornLook(entries);
  const wornCount = Object.keys(worn).length;
  return (
    <div className={styles.look}>
      <PaperDoll
        className={styles.doll}
        areas={DOLL_AREAS}
        label="착용 부위"
        compact
        figure={<OutfitCanvas color={avatar.color} body={avatar.body} look={look} label="지금 내 모습" dir={view.dir} walking={view.walking} onRotate={view.rotate} />}
        caption={
          <span className={styles.namePv}>
            <StyledName name={name || "내 이름"} look={look} />
          </span>
        }
      >
        {SLOT_ORDER.map((slot) => {
          const e = worn[slot];
          const label = SLOT_NAMES[slot];
          return (
            <DollSlot
              key={slot}
              area={slot}
              label={label}
              name={e?.item.name ?? null}
              icon={e ? <ItemIcon itemId={e.item.id} size={32} /> : null}
              silhouette={<ItemIcon itemId={SLOT_SILHOUETTE[slot]} size={32} />}
              meter={e?.until ? { ratio: timeLeftRatio(e.until, now), text: remainingLabel(e.until, now) } : null}
              tip={e ? { title: e.item.name, body: e.item.desc } : { title: `${label} · 비어 있어요`, body: "눌러서 이 부위에 입을 것을 골라요." }}
              ariaLabel={`${label} 칸, ${e ? `${e.item.name} 착용 중, ${remainingLabel(e.until!, now)}` : "비어 있음"}. 누르면 [꾸미기]에서 ${label} 목록`}
              onClick={() => onPickSlot(slot)}
            />
          );
        })}
      </PaperDoll>
      <ViewControls dir={view.dir} walking={view.walking} onDir={view.setDir} onWalking={view.setWalking} className={styles.viewControls} />
      <p className={styles.summary}>
        착용 <b>{wornCount}</b>/{SLOT_ORDER.length} · 내 꾸미기 점수 <b>{score}점</b> · 랭킹 [꾸미기]에 올라가요
      </p>
      <p className={styles.hint}>칸을 누르면 [꾸미기]에서 그 부위 목록이 열려요. 벗어 둔 꾸미기도 남은 시간은 계속 흘러요.</p>
    </div>
  );
}

// ── [꾸미기] ──

const entryKey = (e: WardrobeEntry) => `${e.item.id}-${e.state}`;

export function PickPane({
  entries,
  now,
  pending,
  act,
  avatar,
  name,
  filter,
  onFilter,
}: {
  entries: WardrobeEntry[];
  now: number;
  pending: boolean;
  act: Act;
  avatar: Avatar;
  name: string;
  filter: SlotFilter;
  onFilter: (f: SlotFilter) => void;
}) {
  /** 입어 보기에 올린 카드 */
  const [picked, setPicked] = useState<string | null>(null);
  const listed = entries.filter((e) => !isChampItem(e.item.id));
  const counts = slotCounts(listed);
  const shown = listed.filter((e) => matchesSlot(e.slot, filter));
  const sel = shown.find((e) => entryKey(e) === picked) ?? null;
  const fit = fittingLook(wornLook(entries), sel && sel.state !== "worn" ? sel.item.id : null);
  const worn = wornBySlot(entries);
  const selOld = sel ? displaced(entries, sel) : null;

  return (
    <div className={styles.pick}>
      <div className={styles.chips} role="group" aria-label="착용 부위로 거르기">
        {(["all", ...SLOT_ORDER] as SlotFilter[]).map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} data-empty={counts[f] === 0 || undefined} onClick={() => onFilter(f)}>
            {f === "all" ? "전체" : SLOT_NAMES[f]} <span className={styles.chipCount}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className={styles.pickBody}>
        <section className={styles.fitting} aria-label="입어 보기" aria-live="polite">
          <span className={styles.namePv}>
            <StyledName name={name || "내 이름"} look={fit.look} />
          </span>
          <OutfitCanvas className={styles.fitStage} color={avatar.color} body={avatar.body} look={fit.look} label={sel ? `${sel.item.name}을(를) 입어 본 내 모습` : "지금 내 모습"} dir={DIR.down} walking={false} />
          <div className={styles.fitInfo}>
            <p className={styles.fitName}>{sel ? sel.item.name : "지금 내 모습"}</p>
            <p className={styles.fitNote}>
              {sel ? entryStatus(sel, now) : "카드를 누르면 여기서 입어 볼 수 있어요."}
              {selOld && ` · 입으면 ${selOld.name}은(는) 벗어 둬요`}
            </p>
            {sel && (
              <button
                type="button"
                className={cx(ui.button, wearAction(sel).kind !== "unequip" && ui.primary, styles.fitBtn)}
                disabled={pending}
                onClick={() => void runWear(entries, sel, act).then(() => setPicked(null))}
              >
                {wearAction(sel).label}
              </button>
            )}
          </div>
        </section>

        <div className={styles.listCol}>
          {shown.length === 0 ? (
            <p className={styles.empty}>
              {filter === "all" ? "가진 꾸미기가 없어요." : `${SLOT_NAMES[filter]}에 입을 꾸미기가 없어요.`} 상점 캐릭터 꾸미기에서 살 수 있어요.
            </p>
          ) : (
            SLOT_ORDER.filter((slot) => shown.some((e) => e.slot === slot)).map((slot) => (
              <div key={slot} className={styles.group}>
                <h3 className={styles.heading}>
                  {SLOT_NAMES[slot]}
                  {!worn[slot] && <span className={styles.meta}> · 비어 있어요</span>}
                </h3>
                <ul className={styles.cards}>
                  {shown
                    .filter((e) => e.slot === slot)
                    .map((e) => {
                      const a = wearAction(e);
                      const k = entryKey(e);
                      return (
                        <li key={k} className={styles.card} data-state={e.state} data-picked={picked === k || undefined}>
                          <button type="button" className={styles.cardPick} aria-pressed={picked === k} title={e.item.desc} onClick={() => setPicked(picked === k ? null : k)}>
                            <ItemIcon itemId={e.item.id} size={32} />
                            <span className={styles.cardMain}>
                              <span className={styles.cardName}>{e.item.name}</span>
                              <LookScoreBadge itemId={e.item.id} short />
                              <span className={styles.status} data-state={e.state}>
                                {entryStatus(e, now)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className={cx(ui.button, a.kind !== "unequip" && ui.primary, styles.wearBtn)}
                            disabled={pending}
                            aria-label={`${e.item.name} ${a.label}`}
                            onClick={() => void runWear(entries, e, act)}
                          >
                            {a.label}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
