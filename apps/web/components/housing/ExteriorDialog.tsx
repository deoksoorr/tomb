"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useState, useSyncExternalStore } from "react";
import { facadePreview } from "@/game/housing/art";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { EXT_SLOTS, FURNITURE, furnitureById, isExtBase, LIKE_WEIGHT, lotLabel, tierById, type ExtSlot } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import { designScore, exteriorScore } from "@/lib/housing/layout";
import type { HouseExterior, MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, TitleBadge } from "./parts";

const noop = () => () => undefined;

/**
 * 외관 꾸미기: 지붕·벽·문·울타리·우편함·정원·간판. 마을에서 모두에게 보이고 꾸밈 점수에 더해진다.
 * F18: 안 산 아이템도 눌러(또는 마우스를 올려) 먼저 입혀 본다 → 마음에 들면 "사고 적용"으로 한 번에 사서 저장. 낮/밤으로 바꿔 볼 수 있다.
 */
export default function ExteriorDialog({
  my,
  channel,
  onMy,
  onSaved,
  onClose,
}: {
  my: MyHouseResponse;
  /** 지금 채널 (서버는 내 집이 이 채널에 있을 때만 저장한다) */
  channel: number;
  onMy: (r: MyHouseResponse) => void;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const house = my.house!;
  const [draft, setDraft] = useState<HouseExterior>(house.exterior);
  const [hover, setHover] = useState<{ slot: ExtSlot; id: string } | null>(null);
  const [night, setNight] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const client = useSyncExternalStore(noop, () => true, () => false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(house.exterior);
  const view: HouseExterior = hover ? { ...draft, [hover.slot]: hover.id } : draft;
  const score = designScore(house.layout, view) + house.likes * LIKE_WEIGHT;
  const preview = client ? facadePreview(view, house.tier, 2, night) : null;
  const owns = (id: string) => isExtBase(id) || (my.inventory[id] ?? 0) > 0;
  // 미리보기로 입혀 본, 아직 안 산 아이템
  const toBuy = EXT_SLOTS.map((s) => draft[s.slot]).filter((id) => !owns(id));
  const cost = toBuy.reduce((sum, id) => sum + (furnitureById(id)?.price ?? 0), 0);
  const short = cost > my.points;

  async function apply() {
    setPending("save");
    setMsg(null);
    try {
      for (const id of toBuy) onMy(await housingApi.buyItem(id));
      if (toBuy.length) void meStore.refresh();
      onMy(await housingApi.saveExterior(channel, draft));
      setMsg(toBuy.length ? `${toBuy.length}개를 사서 입혔어요. 마을에서 모두에게 보여요.` : "외관을 저장했어요. 마을에서 모두에게 보여요.");
      onSaved?.();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const set = (slot: ExtSlot, id: string) => {
    setDraft((d) => ({ ...d, [slot]: id }));
    setMsg(owns(id) ? null : `${furnitureById(id)?.name ?? "아이템"}을(를) 입혀 봤어요. "사고 적용"을 누르면 사서 저장해요.`);
  };
  const peek = (slot: ExtSlot, id: string) => ({
    onMouseEnter: () => setHover({ slot, id }),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover({ slot, id }),
    onBlur: () => setHover(null),
  });

  return (
    <Dialog title="외관 꾸미기" onClose={onClose}>
      <div className={styles.stack}>
        <div className={styles.extTop}>
          <div className={styles.extPreview} data-night={night}>
            {preview && (
              <img
                src={preview.url}
                width={preview.w}
                height={preview.h}
                alt={`${house.name} 외관 미리보기 (${tierById(house.tier)?.name ?? ""}${night ? ", 밤" : ""})`}
                style={{ imageRendering: "pixelated", maxWidth: "100%", height: "auto" }}
              />
            )}
            <div className={styles.chips} role="group" aria-label="미리보기 시간">
              <button type="button" className={styles.chip} aria-pressed={!night} onClick={() => setNight(false)}>
                낮
              </button>
              <button type="button" className={styles.chip} aria-pressed={night} onClick={() => setNight(true)}>
                밤
              </button>
            </div>
          </div>
          <div className={styles.stack} style={{ gap: 6 }}>
            <p className={styles.houseName}>
              {lotLabel(house.ch, house.lot)} · {house.name}
            </p>
            <p className={styles.score}>
              꾸밈 점수 <strong>{fmt(score)}</strong> <span className={styles.small}>(외관 +{exteriorScore(view)})</span>
            </p>
            <TitleBadge score={score} />
            <p className={styles.points}>
              내 포인트 <strong>{fmt(my.points)}P</strong>
            </p>
            {toBuy.length > 0 && (
              <p className={cx(styles.small, short && styles.error)}>
                미리보기 중 · 아직 안 산 아이템 {toBuy.length}개 ({toBuy.map((id) => furnitureById(id)?.name).join(", ")}) · 합계 {fmt(cost)}P
                {short ? ` · ${fmt(cost - my.points)}P 모자라요` : ""}
              </p>
            )}
            <div className={styles.row}>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={!dirty || pending !== null || short} onClick={apply}>
                {pending === "save" ? "적용 중…" : toBuy.length ? `${fmt(cost)}P로 사고 적용` : "저장"}
              </button>
              <button
                type="button"
                className={ui.button}
                disabled={!dirty || pending !== null}
                onClick={() => {
                  setDraft(house.exterior);
                  setMsg(null);
                }}
              >
                되돌리기
              </button>
            </div>
          </div>
        </div>
        <p className={styles.small}>아이템을 누르거나 마우스를 올리면 위 그림에 바로 입혀 볼 수 있어요. 안 산 아이템은 적용할 때 한꺼번에 사요.</p>
        {EXT_SLOTS.map(({ slot, label, base, baseName }) => {
          const items = FURNITURE.filter((f) => f.ext === slot);
          return (
            <fieldset key={slot} className={styles.extSlot}>
              <legend className={ui.label}>{label}</legend>
              <div className={styles.row}>
                <button type="button" className={styles.extOption} aria-pressed={draft[slot] === base} onClick={() => set(slot, base)} {...peek(slot, base)}>
                  {baseName}
                  <span className={styles.small}>기본</span>
                </button>
                {items.map((f) => {
                  const owned = owns(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={cx(styles.extOption, !owned && styles.extBuy)}
                      aria-pressed={draft[slot] === f.id}
                      onClick={() => set(slot, f.id)}
                      title={f.desc}
                      aria-label={owned ? `${f.name}, 꾸밈 +${f.score}` : `${f.name} 입혀 보기, ${f.price}포인트, 꾸밈 +${f.score}`}
                      {...peek(slot, f.id)}
                    >
                      {f.name}
                      <span className={styles.small}>{owned ? `가짐 · 꾸밈 +${f.score}` : `${fmt(f.price)}P · 꾸밈 +${f.score}`}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}
